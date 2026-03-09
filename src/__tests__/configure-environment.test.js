'use strict';

describe('configureEnvironment', () => {
  let configureEnvironment;
  let logExecSync;
  let download;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    jest.mock('../exec');
    jest.mock('../download');
    configureEnvironment = require('../configure-environment');
    logExecSync = require('../exec').logExecSync;
    download = require('../download');
    logExecSync.mockImplementation(() => {});
    download.installCniPlugins.mockResolvedValue();
    download.installCriCtl.mockResolvedValue();
    download.installCriDockerd.mockResolvedValue();
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
