'use strict';

describe('errorHandler', () => {
  let errorHandler;
  let core;
  let consoleErrors;
  let originalConsoleError;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    errorHandler = require('../error-handler');
    core = require('@actions/core');
    consoleErrors = '';
    originalConsoleError = console.error;
    console.error = (...args) =>
      (consoleErrors +=
        args.map(a => (a instanceof Error ? a.message : a)).join(' ') + '\n');
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('with an Error object', () => {
    const error = Error('Something bad happened');

    beforeEach(() => {
      errorHandler(error);
    });

    test('logs the error to console', () => {
      expect(consoleErrors).toContain('Something bad happened');
    });

    test('reports the error message to actions core', () => {
      expect(core.error).toHaveBeenCalledWith('Something bad happened');
    });

    test('marks the action as failed', () => {
      expect(core.setFailed).toHaveBeenCalledWith('Something bad happened');
    });
  });
});
