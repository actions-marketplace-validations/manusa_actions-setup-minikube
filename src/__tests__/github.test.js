'use strict';

const {createHttpTestServer} = require('./test-utils/http-test-server');
const {gitHubRequest} = require('../github');

describe('github module', () => {
  describe('gitHubRequest', () => {
    let testServer;
    let baseUrl;

    beforeAll(async () => {
      testServer = createHttpTestServer();
      const port = await testServer.start();
      baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      await testServer.stop();
    });

    beforeEach(() => {
      testServer.clearRoutes();
      testServer.clearRequests();
      testServer.get('/repos/o/r/releases/tags/v1', {tag_name: 'v1'});
    });

    describe('with github token', () => {
      let result;

      beforeEach(async () => {
        result = await gitHubRequest({
          url: `${baseUrl}/repos/o/r/releases/tags/v1`,
          githubToken: 'secret-token'
        });
      });

      test('sends Authorization header', () => {
        const request = testServer.getLastRequest();
        expect(request.headers.authorization).toBe('token secret-token');
      });

      test('returns response data', () => {
        expect(result.data).toEqual({tag_name: 'v1'});
      });
    });

    describe('without github token', () => {
      let result;

      beforeEach(async () => {
        result = await gitHubRequest({
          url: `${baseUrl}/repos/o/r/releases/tags/v1`
        });
      });

      test('does not send Authorization header', () => {
        const request = testServer.getLastRequest();
        expect(request.headers.authorization).toBeUndefined();
      });

      test('returns response data', () => {
        expect(result.data).toEqual({tag_name: 'v1'});
      });
    });

    describe('with additional options', () => {
      test('uses GET method by default', async () => {
        await gitHubRequest({url: `${baseUrl}/repos/o/r/releases/tags/v1`});
        const request = testServer.getLastRequest();
        expect(request.method).toBe('GET');
      });

      test('respects validateStatus option', async () => {
        const result = await gitHubRequest({
          url: `${baseUrl}/not-found`,
          options: {validateStatus: status => status === 404}
        });
        expect(result.status).toBe(404);
      });
    });
  });

  describe('apiBaseUrl', () => {
    beforeEach(() => {
      jest.resetModules();
      delete process.env.GITHUB_API_URL;
    });

    test('defaults to https://api.github.com', () => {
      const {apiBaseUrl} = require('../github');
      expect(apiBaseUrl).toBe('https://api.github.com');
    });

    test('uses GITHUB_API_URL environment variable', () => {
      process.env.GITHUB_API_URL = 'http://custom-api.example.com';
      const {apiBaseUrl} = require('../github');
      expect(apiBaseUrl).toBe('http://custom-api.example.com');
    });
  });

  describe('serverBaseUrl', () => {
    beforeEach(() => {
      jest.resetModules();
      delete process.env.GITHUB_SERVER_URL;
    });

    test('defaults to https://github.com', () => {
      const {serverBaseUrl} = require('../github');
      expect(serverBaseUrl).toBe('https://github.com');
    });

    test('uses GITHUB_SERVER_URL environment variable', () => {
      process.env.GITHUB_SERVER_URL = 'http://custom-server.example.com';
      const {serverBaseUrl} = require('../github');
      expect(serverBaseUrl).toBe('http://custom-server.example.com');
    });
  });
});
