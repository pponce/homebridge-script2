'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function checkReleaseArchive(release, archive, commit, expected) {
  assert.equal(release.draft, false, 'Release must be published.');
  assert.equal(release.prerelease, false, 'Release must be stable.');
  assert.equal(release.tag_name, `v${expected.version}`, 'Release version mismatch.');
  assert.equal(release.target_commitish, commit, 'Release commit mismatch.');
  const asset = release.assets.find(item => item.name === path.basename(archive));
  assert.ok(asset, 'Release archive is missing.');
  assert.match(asset.digest || '', /^sha256:[a-f0-9]{64}$/, 'Release SHA-256 digest is missing.');
  const digest = 'sha256:' + createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  assert.equal(digest, asset.digest, 'Release archive checksum mismatch.');
  const packed = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
  for (const field of ['name', 'version', 'engines', 'funding', 'publishConfig']) {
    assert.deepEqual(packed[field], expected[field], `Archive ${field} mismatch.`);
  }
}

if (require.main === module) {
  const [releaseFile, archive, commit] = process.argv.slice(2);
  checkReleaseArchive(JSON.parse(fs.readFileSync(releaseFile, 'utf8')), archive, commit, require('../package.json'));
  console.log('Official release archive checksum, source commit, and package metadata verified.');
}
module.exports = checkReleaseArchive;
