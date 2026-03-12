'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

/**
 * Creates a real tar.gz archive in memory from a map of file paths to contents.
 * Keys are relative paths (e.g. 'cri-dockerd/cri-dockerd'), values are file contents.
 * Returns a Buffer containing the gzipped tarball.
 */
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

module.exports = {createTarball};
