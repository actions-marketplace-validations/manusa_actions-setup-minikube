'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('configureEnvironment', () => {
  let configureEnvironment;
  let download;
  let stdoutOutput;
  let originalStdoutWrite;
  let stubBinDir;
  let execLogPath;
  let originalPath;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../download');

    // Stub binaries: log commands to a file instead of
    // running real sudo/docker
    stubBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-bin-'));
    execLogPath = path.join(stubBinDir, 'exec.log');
    fs.writeFileSync(
      path.join(stubBinDir, 'sudo'),
      ['#!/bin/sh', `echo "sudo $*" >> "${execLogPath}"`].join('\n'),
      {mode: 0o755}
    );
    fs.writeFileSync(
      path.join(stubBinDir, 'docker'),
      [
        '#!/bin/sh',
        `echo "docker $*" >> "${execLogPath}"`,
        'echo "24.0.0 - 24.0.0"'
      ].join('\n'),
      {mode: 0o755}
    );
    originalPath = process.env.PATH;
    process.env.PATH = `${stubBinDir}${path.delimiter}${originalPath}`;

    configureEnvironment = require('../configure-environment');
    download = require('../download');
    download.installCniPlugins.mockResolvedValue();
    download.installCriCtl.mockResolvedValue();
    download.installCriDockerd.mockResolvedValue();

    stdoutOutput = '';
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = (chunk, ...args) => {
      if (typeof chunk === 'string') {
        stdoutOutput += chunk;
      }
      return originalStdoutWrite.call(process.stdout, chunk, ...args);
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.env.PATH = originalPath;
    fs.rmSync(stubBinDir, {recursive: true, force: true});
  });

  const getExecLog = () => {
    try {
      return fs.readFileSync(execLogPath, 'utf8');
    } catch {
      return '';
    }
  };

  describe('common setup', () => {
    beforeEach(async () => {
      await configureEnvironment({driver: 'docker'});
    });

    test('installs conntrack', () => {
      expect(getExecLog()).toContain('conntrack');
    });

    test('disables fs.protected_regular', () => {
      expect(getExecLog()).toContain('fs.protected_regular=0');
    });

    test('logs environment configuration message', () => {
      expect(stdoutOutput).toContain(
        'Updating Environment configuration to support Minikube'
      );
    });
  });

  describe('with driver=docker', () => {
    beforeEach(async () => {
      await configureEnvironment({driver: 'docker'});
    });

    test('checks docker availability', () => {
      expect(getExecLog()).toContain('docker version');
    });

    test('logs docker ready message', () => {
      expect(stdoutOutput).toContain('Docker daemon is ready');
    });

    test('does not install CNI plugins', () => {
      expect(download.installCniPlugins).not.toHaveBeenCalled();
    });

    test('does not install crictl', () => {
      expect(download.installCriCtl).not.toHaveBeenCalled();
    });

    test('does not install cri-dockerd', () => {
      expect(download.installCriDockerd).not.toHaveBeenCalled();
    });
  });

  describe('with driver=none', () => {
    beforeEach(async () => {
      await configureEnvironment({driver: 'none'});
    });

    test('installs CNI plugins', () => {
      expect(download.installCniPlugins).toHaveBeenCalledTimes(1);
    });

    test('installs crictl', () => {
      expect(download.installCriCtl).toHaveBeenCalledTimes(1);
    });

    test('installs cri-dockerd', () => {
      expect(download.installCriDockerd).toHaveBeenCalledTimes(1);
    });

    test('does not check docker availability', () => {
      expect(getExecLog()).not.toContain('docker version');
    });
  });

  describe('with no driver specified', () => {
    beforeEach(async () => {
      await configureEnvironment();
    });

    test('treats undefined driver as none', () => {
      expect(download.installCniPlugins).toHaveBeenCalledTimes(1);
    });
  });
});
