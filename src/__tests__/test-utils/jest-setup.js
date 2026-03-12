'use strict';

// Jest 30 sandboxes process.env, but child_process.execSync uses
// the real (unsandboxed) process.env by default. This ensures
// execSync uses the test's process.env so that env modifications
// in tests (e.g. PATH changes) are visible to child processes.
const childProcess = require('node:child_process');
const origExecSync = childProcess.execSync;
childProcess.execSync = function (cmd, opts) {
  if (!opts || !opts.env) {
    return origExecSync.call(this, cmd, {...(opts || {}), env: process.env});
  }
  return origExecSync.call(this, cmd, opts);
};
