'use strict';

/**
 * Minimal .env file editor: update specific KEY=value lines while preserving
 * all other content (comments, ordering, unknown keys). Writes atomically.
 */

const fs = require('fs');
const crypto = require('crypto');

function readEnv(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

function writeEnv(file, content) {
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, content, 'utf8');
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  }
}

/**
 * Set one or more environment variables in the .env file.
 * @param {string} file path to .env
 * @param {Object<string, string>} updates key -> raw value
 */
function setEnvValues(file, updates) {
  let lines = readEnv(file).split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'i');
    const idx = lines.findIndex((line) => pattern.test(line));
    if (idx !== -1) {
      lines[idx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  writeEnv(file, lines.join('\n') + '\n');
}

module.exports = { setEnvValues, readEnv, writeEnv };