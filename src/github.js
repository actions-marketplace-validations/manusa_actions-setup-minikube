'use strict';

const axios = require('axios');

const apiBaseUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
const serverBaseUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';

const gitHubRequest = async ({url, githubToken, options = {}}) => {
  const headers = {};
  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }
  return axios({method: 'GET', ...options, url, headers});
};

module.exports = {gitHubRequest, apiBaseUrl, serverBaseUrl};
