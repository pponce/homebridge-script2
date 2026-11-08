'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const check = require('../scripts/check-release-archive.cjs');

test('npm publisher accepts the official archive and refuses changed bytes, metadata, and source', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'script2-release-'));
  try {
    const expected = require('../package.json');
    fs.mkdirSync(path.join(dir, 'package'));
    fs.writeFileSync(path.join(dir, 'package/package.json'), JSON.stringify(expected));
    const archive = path.join(dir, 'plugin.tgz');
    execFileSync('tar', ['-czf', archive, '-C', dir, 'package']);
    const release = {
      draft: false, prerelease: false, tag_name: `v${expected.version}`, target_commitish: 'checked-commit',
      assets: [{ name: 'plugin.tgz', digest: 'sha256:' + createHash('sha256').update(fs.readFileSync(archive)).digest('hex') }],
    };
    assert.doesNotThrow(() => check(release, archive, 'checked-commit', expected));
    assert.throws(() => check({ ...release, draft: true }, archive, 'checked-commit', expected), /published/);
    assert.throws(() => check({ ...release, prerelease: true }, archive, 'checked-commit', expected), /stable/);
    assert.throws(() => check(release, archive, 'different-commit', expected), /commit mismatch/);
    assert.throws(() => check(release, archive, 'checked-commit', { ...expected, engines: { node: '^24.0.0' } }), /engines mismatch/);
    assert.throws(() => check({ ...release, assets: [] }, archive, 'checked-commit', expected), /archive is missing/);
    assert.throws(() => check({ ...release, assets: [{ name: 'plugin.tgz' }] }, archive, 'checked-commit', expected), /digest is missing/);
    fs.appendFileSync(archive, 'changed');
    assert.throws(() => check(release, archive, 'checked-commit', expected), /checksum mismatch/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
