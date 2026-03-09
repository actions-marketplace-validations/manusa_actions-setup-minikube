'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const {createHttpTestServer} = require('./test-utils/http-test-server');

// Only mock modules with hardcoded external URLs or system commands
jest.mock('../github');
jest.mock('@actions/core');
jest.mock('../exec');

const SERVICE_FILE_CONTENT =
  'ExecStart=/usr/bin/cri-dockerd --container-runtime-endpoint fd://';
const SOCKET_FILE_CONTENT = 'ListenStream=/var/run/cri-docker.sock';

const createTarball = files => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, content, {mode: 0o755});
  }
  const topLevel = [...new Set(Object.keys(files).map(f => f.split('/')[0]))];
  const tarPath = path.join(dir, 'archive.tar.gz');
  childProcess.execSync(
    `tar -czf "${tarPath}" -C "${dir}" ${topLevel.map(n => `"${n}"`).join(' ')}`
  );
  const buffer = fs.readFileSync(tarPath);
  fs.rmSync(dir, {recursive: true, force: true});
  return buffer;
};

describe('download module', () => {
  let testServer;
  let baseUrl;
  let download;
  let github;
  let tc;
  let exec;
  let tmpDir;

  beforeAll(async () => {
    testServer = createHttpTestServer();
    const port = await testServer.start();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-test-'));
    process.env.RUNNER_TEMP = tmpDir;

    github = require('../github');
    exec = require('../exec');
    download = require('../download');
    tc = require('@actions/tool-cache');

    testServer.clearRoutes();
    testServer.clearRequests();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    delete process.env.RUNNER_TEMP;
  });

  describe('downloadMinikube', () => {
    beforeEach(() => {
      testServer.get('/download/minikube-linux-amd64', () => ({
        binary: Buffer.from('fake-minikube-binary')
      }));
      github.gitHubRequest.mockResolvedValue({
        data: {
          assets: [
            {
              name: 'minikube-windows-amd64.exe',
              browser_download_url: `${baseUrl}/download/minikube-windows`
            },
            {
              name: 'minikube-linux-amd64',
              browser_download_url: `${baseUrl}/download/minikube-linux-amd64`
            },
            {
              name: 'minikube-linux-amd64.sha256',
              browser_download_url: `${baseUrl}/download/minikube-sha256`
            }
          ]
        }
      });
    });

    test('downloads file to disk', async () => {
      const filePath = await download.downloadMinikube({
        minikubeVersion: 'v1.33.7'
      });
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('selects linux amd64 binary, not windows or checksum', async () => {
      await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
      const requests = testServer.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].pathname).toBe('/download/minikube-linux-amd64');
    });

    test('queries the minikube release tag', async () => {
      await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/minikube/releases/tags/v1.33.7')
        })
      );
    });

    test('forwards github token', async () => {
      await download.downloadMinikube({
        minikubeVersion: 'v1.33.7',
        githubToken: 'secret-token'
      });
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({githubToken: 'secret-token'})
      );
    });
  });

  describe('installCniPlugins', () => {
    let cniTarball;

    beforeAll(() => {
      cniTarball = createTarball({
        bridge: 'cni-bridge',
        loopback: 'cni-loopback'
      });
    });

    beforeEach(() => {
      testServer.get('/download/cni-plugins.tgz', () => ({
        binary: cniTarball
      }));
      github.gitHubRequest.mockResolvedValue({
        data: {
          assets: [
            {
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz.sha1',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz',
              browser_download_url: `${baseUrl}/download/cni-plugins.tgz`
            },
            {
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz.sha512',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cni-plugins-windows-amd64-v1.9.0.tgz',
              browser_download_url: `${baseUrl}/invalid`
            }
          ]
        }
      });
      jest.spyOn(tc, 'extractTar');
    });

    afterEach(() => {
      tc.extractTar.mockRestore();
    });

    test('extracts plugin binaries from downloaded tarball', async () => {
      await download.installCniPlugins({});
      const extractedDir = await tc.extractTar.mock.results[0].value;
      expect(fs.readdirSync(extractedDir)).toEqual(
        expect.arrayContaining(['bridge', 'loopback'])
      );
    });

    test('installs to /opt/cni/bin', async () => {
      await download.installCniPlugins({});
      expect(exec.logExecSync).toHaveBeenCalledWith(
        expect.stringMatching(/install -Dm 0755 .+\/opt\/cni\/bin/)
      );
    });

    test('requests the pinned release tag', async () => {
      await download.installCniPlugins({});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(
            '/containernetworking/plugins/releases/tags/v1.9.0'
          )
        })
      );
    });

    test('forwards github token', async () => {
      await download.installCniPlugins({githubToken: 'secret-token'});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({githubToken: 'secret-token'})
      );
    });
  });

  describe('installCriCtl', () => {
    let crictlTarball;

    beforeAll(() => {
      crictlTarball = createTarball({crictl: 'crictl-binary'});
    });

    beforeEach(() => {
      testServer.get('/download/crictl.tar.gz', () => ({
        binary: crictlTarball
      }));
      github.gitHubRequest.mockResolvedValue({
        data: {
          assets: [
            {
              name: 'crictl-windows-amd64.exe',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'crictl-linux-amd64.tar.gz',
              browser_download_url: `${baseUrl}/download/crictl.tar.gz`
            },
            {
              name: 'crictl-linux-amd64.sha256',
              browser_download_url: `${baseUrl}/invalid`
            }
          ]
        }
      });
      // extractTar destination is /usr/local/bin (not writable without sudo)
      jest.spyOn(tc, 'extractTar').mockImplementation(async tarPath => {
        if (!fs.existsSync(tarPath)) {
          throw new Error(`Tarball not found: ${tarPath}`);
        }
        return '/usr/local/bin';
      });
    });

    afterEach(() => {
      tc.extractTar.mockRestore();
    });

    test('downloads a real tarball to disk', async () => {
      await download.installCriCtl({});
      const tarPath = tc.extractTar.mock.calls[0][0];
      expect(fs.existsSync(tarPath)).toBe(true);
    });

    test('extracts to /usr/local/bin', async () => {
      await download.installCriCtl({});
      expect(tc.extractTar).toHaveBeenCalledWith(
        expect.any(String),
        '/usr/local/bin'
      );
    });

    test('requests the pinned release tag', async () => {
      await download.installCriCtl({});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/cri-tools/releases/tags/v1.35.0')
        })
      );
    });

    test('forwards github token', async () => {
      await download.installCriCtl({githubToken: 'secret-token'});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({githubToken: 'secret-token'})
      );
    });
  });

  describe('installCriDockerd', () => {
    let binaryTarball;
    let sourceTarball;
    // In-memory file system for /etc/ paths (not writable without sudo)
    // Content must match the tarball — both are initialized from the same constants
    let serviceFiles;

    beforeAll(() => {
      binaryTarball = createTarball({
        'cri-dockerd/cri-dockerd': 'cri-dockerd-binary'
      });
      sourceTarball = createTarball({
        'cri-dockerd-v0.3.24/packaging/systemd/cri-docker.service':
          SERVICE_FILE_CONTENT,
        'cri-dockerd-v0.3.24/packaging/systemd/cri-docker.socket':
          SOCKET_FILE_CONTENT
      });
    });

    beforeEach(() => {
      testServer.get('/download/cri-dockerd.tgz', () => ({
        binary: binaryTarball
      }));
      testServer.get('/download/cri-dockerd-source.tar.gz', () => ({
        binary: sourceTarball
      }));
      github.gitHubRequest.mockResolvedValue({
        data: {
          assets: [
            {
              name: 'cri-dockerd-0.3.4-3.el7.src.rpm',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cri-dockerd-v0.2.0-darwin-arm64.tar.gz',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cri-dockerd-0.3.4.arm64.tgz',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cri-dockerd-0.3.4.amd64.tgz',
              browser_download_url: `${baseUrl}/download/cri-dockerd.tgz`
            },
            {
              name: 'cri-dockerd-v0.2.0-linux-amd64.tar.gz.md5',
              browser_download_url: `${baseUrl}/invalid`
            }
          ]
        }
      });

      // Redirect hardcoded source tarball URL to test server
      const realDownloadTool = tc.downloadTool.bind(tc);
      jest.spyOn(tc, 'downloadTool').mockImplementation(async url => {
        if (url.includes('github.com/Mirantis/cri-dockerd/archive')) {
          return realDownloadTool(
            `${baseUrl}/download/cri-dockerd-source.tar.gz`
          );
        }
        return realDownloadTool(url);
      });

      serviceFiles = {
        '/etc/systemd/system/cri-docker.service': SERVICE_FILE_CONTENT,
        '/etc/systemd/system/cri-docker.socket': SOCKET_FILE_CONTENT
      };
      const originalReadFileSync = fs.readFileSync.bind(fs);
      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
        if (serviceFiles[filePath] !== undefined) {
          return serviceFiles[filePath];
        }
        return originalReadFileSync(filePath, ...args);
      });
      jest
        .spyOn(fs, 'writeFileSync')
        .mockImplementation((filePath, content, ...args) => {
          if (serviceFiles[filePath] !== undefined) {
            serviceFiles[filePath] = content;
            return;
          }
          return jest
            .requireActual('fs')
            .writeFileSync(filePath, content, ...args);
        });
    });

    afterEach(() => {
      tc.downloadTool.mockRestore();
      fs.readFileSync.mockRestore();
      fs.writeFileSync.mockRestore();
    });

    test('selects amd64 tgz, skipping rpms, darwin, arm64', async () => {
      await download.installCriDockerd({});
      const requests = testServer.getRequests();
      expect(
        requests.some(r => r.pathname === '/download/cri-dockerd.tgz')
      ).toBe(true);
    });

    test('extracts binary from real tarball', async () => {
      await download.installCriDockerd({});
      const installCall = exec.logExecSync.mock.calls.find(([cmd]) =>
        cmd.includes('install -m 0755')
      );
      expect(installCall[0]).toMatch(
        /\/cri-dockerd\/cri-dockerd \/usr\/local\/bin\//
      );
    });

    test('creates symlink at /usr/bin/cri-dockerd', async () => {
      await download.installCriDockerd({});
      expect(exec.logExecSync).toHaveBeenCalledWith(
        'sudo ln -sf /usr/local/bin/cri-dockerd /usr/bin/cri-dockerd'
      );
    });

    test('forwards github token', async () => {
      await download.installCriDockerd({githubToken: 'secret-token'});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({githubToken: 'secret-token'})
      );
    });

    describe('systemd service setup', () => {
      test('adds --network-plugin=cni to service file', async () => {
        await download.installCriDockerd({});
        const content = serviceFiles['/etc/systemd/system/cri-docker.service'];
        expect(content).toContain('--network-plugin=cni');
      });

      test('updates binary path to /usr/local/bin in service file', async () => {
        await download.installCriDockerd({});
        const content = serviceFiles['/etc/systemd/system/cri-docker.service'];
        expect(content).toContain('/usr/local/bin/cri-dockerd');
        expect(content).not.toMatch(/\/usr\/bin\/cri-dockerd/);
      });

      test('replaces socket path with cri-dockerd.sock', async () => {
        await download.installCriDockerd({});
        const content = serviceFiles['/etc/systemd/system/cri-docker.socket'];
        expect(content).toBe('ListenStream=/var/run/cri-dockerd.sock');
      });

      test('enables and starts service', async () => {
        await download.installCriDockerd({});
        expect(exec.logExecSync).toHaveBeenCalledWith(
          'sudo systemctl daemon-reload'
        );
        expect(exec.logExecSync).toHaveBeenCalledWith(
          'sudo systemctl enable cri-docker.service'
        );
        expect(exec.logExecSync).toHaveBeenCalledWith(
          'sudo systemctl enable --now cri-docker.socket'
        );
      });
    });

    test('requests the pinned release tag', async () => {
      await download.installCriDockerd({});
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(
            '/Mirantis/cri-dockerd/releases/tags/v0.3.24'
          )
        })
      );
    });
  });
});
