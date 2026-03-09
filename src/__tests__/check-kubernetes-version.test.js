'use strict';

describe('checkKubernetesVersion', () => {
  let exec;
  let github;
  let checkKubernetesVersion;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    jest.mock('../exec');
    jest.mock('../github');
    exec = require('../exec');
    github = require('../github');
    checkKubernetesVersion =
      require('../check-kubernetes-version').checkKubernetesVersion;
    exec.execSync.mockReturnValue(
      Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
    );
  });

  describe('when version is in minikube supported list', () => {
    test('returns SUPPORTED', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(result).toBe('supported');
    });

    test('does not call GitHub API', async () => {
      await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(github.gitHubRequest).not.toHaveBeenCalled();
    });
  });

  describe('when version is not in supported list but exists on GitHub', () => {
    beforeEach(() => {
      github.gitHubRequest.mockResolvedValue({status: 200});
    });

    test('returns UNSUPPORTED', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.99.0'
      });
      expect(result).toBe('unsupported');
    });

    test('forwards github token to API call', async () => {
      await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.99.0',
        githubToken: 'test-token'
      });
      expect(github.gitHubRequest).toHaveBeenCalledWith(
        expect.objectContaining({githubToken: 'test-token'})
      );
    });
  });

  describe('when version is not in supported list and not on GitHub', () => {
    beforeEach(() => {
      github.gitHubRequest.mockResolvedValue({status: 404});
    });

    test('throws with the requested version', async () => {
      await expect(
        checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0'
        })
      ).rejects.toThrow(/v1\.99\.0/);
    });

    test('includes supported versions in error', async () => {
      await expect(
        checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0'
        })
      ).rejects.toThrow(/v1\.35\.2/);
    });
  });

  describe('partial version matching', () => {
    beforeEach(() => {
      github.gitHubRequest.mockResolvedValue({status: 200});
    });

    test('v1.3 does not match v1.35.2', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.3'
      });
      expect(result).toBe('unsupported');
    });
  });
});
