#!/bin/bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
uf_dir=/var/lib/homebridge/unifiFloodLight
uf_tmp=$(mktemp -d "$script_dir/.install-XXXXXX")
trap 'rm -rf "$uf_tmp"' EXIT

command -v sudo >/dev/null
test -x /usr/bin/python3
id homebridge >/dev/null
uf_group=$(id -gn homebridge)
uf_stamp=$(date -u +%Y%m%dT%H%M%S%N)
sudo -v
sudo test ! -L "$uf_dir"

# Stage only the scripts, never a repository configuration file.
cp -- "$script_dir/floodlight.py" "$uf_tmp/floodlight.py"
cp -- "$script_dir/floodlight.sh" "$uf_tmp/floodlight.sh"
/usr/bin/python3 -m py_compile "$uf_tmp/floodlight.py"

sudo install -d -o homebridge -g "$uf_group" -m 750 "$uf_dir"
if sudo test -f "$uf_dir/floodlight.py"; then
  sudo cp -a "$uf_dir/floodlight.py" "$uf_dir/floodlight.py.backup-$uf_stamp"
fi

if sudo test -f "$uf_dir/floodlight.py"; then
  sudo -u homebridge /usr/bin/python3 "$uf_dir/floodlight.py" off
  sudo -u homebridge /usr/bin/python3 - "$uf_dir/worker.lock" <<'UNIFI_WAIT'
import fcntl, os, sys, time
os.umask(0o077)
with open(sys.argv[1], "a") as handle:
    deadline = time.monotonic() + 15
    while True:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= deadline:
                sys.exit("Previous worker did not stop; no helper files were replaced.")
            time.sleep(0.1)
UNIFI_WAIT
fi

sudo install -o homebridge -g "$uf_group" -m 750 "$uf_tmp/floodlight.py" "$uf_dir/floodlight.py"
sudo install -o homebridge -g "$uf_group" -m 750 "$uf_tmp/floodlight.sh" "$uf_dir/floodlight.sh"
sudo -u homebridge "$uf_dir/floodlight.sh" configure </dev/tty
sudo chmod 600 "$uf_dir/config.json"
sudo chown homebridge:"$uf_group" "$uf_dir/config.json"

printf '\nInstalled. The worker starts with ON and exits after OFF.\n'
printf 'ON:    %s/floodlight.sh on\n' "$uf_dir"
printf 'OFF:   %s/floodlight.sh off\n' "$uf_dir"
printf 'State: %s/floodlight.sh state\n' "$uf_dir"
printf 'ON match: true; polling: every 5 seconds; command timeout: 30 seconds.\n'
printf 'Logs: %s/floodlight.log and floodlight.log.1; 1 MiB each.\n' "$uf_dir"
