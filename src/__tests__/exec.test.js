'use strict';

describe('exec', () => {
  let exec;

  beforeEach(() => {
    jest.resetModules();
    exec = require('../exec');
  });

  describe('execSync', () => {
    test('returns command output as buffer', () => {
      const result = exec.execSync('echo hello');
      expect(result.toString().trim()).toBe('hello');
    });

    test('throws on non-zero exit code', () => {
      expect(() => exec.execSync('false')).toThrow();
    });
  });

  describe('logExecSync', () => {
    test('runs the command successfully', () => {
      expect(() => exec.logExecSync('echo hello')).not.toThrow();
    });

    test('does not capture output', () => {
      const result = exec.logExecSync('echo hello');
      expect(result).toBeNull();
    });

    test('throws on non-zero exit code', () => {
      expect(() => exec.logExecSync('false')).toThrow();
    });
  });
});
