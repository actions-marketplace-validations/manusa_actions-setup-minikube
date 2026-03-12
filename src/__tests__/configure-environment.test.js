'use strict';

describe('configureEnvironment', () => {
  let configureEnvironment;
  let logExecSync;
  let download;
  let stdoutOutput;
  let originalStdoutWrite;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../exec');
    jest.mock('../download');
    configureEnvironment = require('../configure-environment');
    logExecSync = require('../exec').logExecSync;
    download = require('../download');
    logExecSync.mockImplementation(() => {});
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
  });

  describe('common setup', () => {
    beforeEach(async () => {
      await configureEnvironment({driver: 'docker'});
    });

    test('installs conntrack', () => {
      expect(logExecSync).toHaveBeenCalledWith(
        expect.stringContaining('conntrack')
      );
    });

    test('disables fs.protected_regular', () => {
      expect(logExecSync).toHaveBeenCalledWith(
        expect.stringContaining('fs.protected_regular=0')
      );
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
      expect(logExecSync).toHaveBeenCalledWith(
        expect.stringContaining('docker version')
      );
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
      expect(logExecSync).not.toHaveBeenCalledWith(
        expect.stringContaining('docker version')
      );
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
