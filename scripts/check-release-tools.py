"""Verify the contained CLI bootstrap with a local archive and no network calls."""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile

source = Path('scripts/release-tools.sh').read_text()
with tempfile.TemporaryDirectory(prefix='script2-tools-check-') as directory:
    root = Path(directory)
    mock_bin = root / 'mock-bin'
    mock_bin.mkdir()
    archive = root / 'fixture.tar.gz'
    binary = b'#!/bin/sh\necho "gh version 2.102.0 (fixture)"\n'
    with tarfile.open(archive, 'w:gz') as tar:
        info = tarfile.TarInfo('gh_2.102.0_linux_amd64/bin/gh')
        info.size = len(binary)
        info.mode = 0o755
        tar.addfile(info, io.BytesIO(binary))
    fixture_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    probe_source = source.replace('bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386', fixture_digest)
    helper = root / 'helper.sh'
    helper.write_text(probe_source)
    (mock_bin / 'uname').write_text('#!/bin/sh\necho "Linux x86_64"\n')
    (mock_bin / 'curl').write_text('''#!/usr/bin/env python3
import os
from pathlib import Path
import shutil
import sys
destination = sys.argv[sys.argv.index('--output') + 1]
shutil.copyfile(os.environ['SCRIPT2_FIXTURE_ARCHIVE'], destination)
with open(os.environ['SCRIPT2_DOWNLOAD_COUNTER'], 'a') as counter:
    counter.write('download\\n')
''')
    for executable in mock_bin.iterdir():
        executable.chmod(0o755)
    env = dict(os.environ, PATH=str(mock_bin) + ':' + os.environ['PATH'],
               SCRIPT2_FIXTURE_ARCHIVE=str(archive), SCRIPT2_DOWNLOAD_COUNTER=str(root / 'downloads.txt'))
    checkout = root / 'checkout'
    checkout.mkdir()
    program = '''set -euo pipefail
. "$1"
script2_setup_release_tools "$2"
case "$(command -v gh)" in "$2"/release-work/tools/*) ;; *) exit 1 ;; esac
test "$TMPDIR" = "$2/release-work/tmp"
test "$npm_config_cache" = "$2/release-work/npm-cache"
script2_setup_release_tools "$2"
'''
    subprocess.run(['bash', '-c', program, 'probe', str(helper), str(checkout)], env=env, check=True)
    assert (root / 'downloads.txt').read_text().splitlines() == ['download']
    broken_checkout = root / 'broken-checkout'
    broken_checkout.mkdir()
    archive.write_bytes(b'invalid archive')
    failed = subprocess.run(['bash', '-c', program, 'probe', str(helper), str(broken_checkout)],
                            env=env, capture_output=True, text=True)
    assert failed.returncode != 0
    assert 'checksum mismatch' in failed.stderr
    assert not (broken_checkout / 'release-work/tools/github-cli-2.102.0/gh_2.102.0_linux_amd64/bin/gh').exists()
print('PASS: CLI files stay in release-work, verified downloads are reused, and bad downloads stop before extraction.')
