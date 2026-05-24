homebridge-script2
==================

Execute custom scripts via HomeKit / Apple Home using Homebridge.

Core of the code written by [@xxcombat](https://github.com/xxcombat/). Original plugin: [homebridge-script](https://github.com/xxcombat/homebridge-script).

## Recommended configuration (current)

Use **platform mode** with:
- `on_off_switches` for normal ON/OFF devices
- `stateless_switches` for trigger-style devices

> Legacy formats are still supported:
> - platform `devices` array
> - accessory-mode `accessories` entries
>
> See **[LEGACY.md](./LEGACY.md)** for legacy field details, examples, and migration guidance.

## Homebridge UI Configuration

- In Homebridge UI, go to **Plugins → homebridge-script2 → Plugin Config**.
- Use the **On/Off Switches** and **Stateless Switches** sections.
- Save and restart Homebridge when prompted.

## Platform configuration parameters

| Name | Value | Required | Notes |
| --- | --- | --- | --- |
| `on_off_switches` | array | no | Main section for standard ON/OFF switches |
| `stateless_switches` | array | no | Main section for one-shot trigger switches |
| `devices` | array | no (legacy only) | Legacy compatibility list (see [LEGACY.md](./LEGACY.md)) |

### `on_off_switches` item parameters

Name | Value | Required | Notes
--- | --- | --- | ---
`name` | _(custom)_ | yes | Accessory name shown in Home app
`on` | _(custom)_ | yes | Script/command to execute the ON action
`off` | _(custom)_ | yes | Script/command to execute the OFF action
`fileState` | _(custom)_ | fileState or state | File flag used as current state; if set, it overrides `state`
`state` | _(custom)_ | fileState or state | Script to determine current ON/OFF state
`on_value` | _(custom)_ | no (default `"true"`) | Value matched against normalized `state` output
`polling` | `true/false` | no (default `false`) | Enables periodic polling for `state` mode
`polling_interval` | integer ms | no (default `5000`) | Poll interval when `polling` is enabled
`polling_on_start` | `true/false` | no (default `true`) | Immediately runs state poll on startup
`state_cache_ttl_ms` | integer ms | no (default `1000`) | Cache TTL for burst reads
`reset_state_cache_on_set` | `true/false` | no (default `false`) | Resets/seeds state cache after successful manual set
`fail_on_state_exit_code` | `true/false` | no (default `false`) | Treat non-zero `state` exit code as read error
`unique_serial` | _(custom)_ | no | Unique serial per accessory is recommended

### `stateless_switches` item parameters

Name | Value | Required | Notes
--- | --- | --- | ---
`name` | _(custom)_ | yes | Accessory name shown in Home app
`trigger` | _(custom)_ | yes | Script/command to execute trigger action
`auto_reset_ms` | integer ms | no | Delay before Home tile auto-resets
`stateless_trigger_on` | `on/off` | no (default `on`) | `on` triggers on ON; `off` triggers on OFF (tile defaults to ON)
`unique_serial` | _(custom)_ | no | Unique serial per accessory is recommended

## Platform configuration example (recommended)

```json
"platforms": [
  {
    "platform": "Script2Platform",
    "name": "Script2",
    "on_off_switches": [
      {
        "name": "Outlet 1",
        "on": "/opt/scripts/on.sh 1",
        "off": "/opt/scripts/off.sh 1",
        "state": "/opt/scripts/state.sh 1",
        "on_value": "true"
      },
      {
        "name": "Outlet 2",
        "on": "/opt/scripts/on.sh 2",
        "off": "/opt/scripts/off.sh 2",
        "fileState": "/opt/scripts/outlet2.flag",
        "polling": false
      }
    ],
    "stateless_switches": [
      {
        "name": "Outlet 1 Reboot",
        "trigger": "/opt/scripts/reboot.sh 1",
        "auto_reset_ms": 500,
        "stateless_trigger_on": "off"
      },
      {
        "name": "Outlet 2 Reboot",
        "trigger": "/opt/scripts/reboot.sh 2",
        "auto_reset_ms": 700,
        "stateless_trigger_on": "on"
      }
    ]
  }
]
```

## Installation

(Requires Node.js >=20.19.0)

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-script2`
3. Update your configuration file.
4. Ensure scripts are executable and accessible by the Homebridge service user.

## Troubleshooting FAQ

### Why does my script work in terminal but not in Homebridge?

Homebridge runs scripts as the **Homebridge service user**, not your normal shell user.
A script that works as `pi`, `ubuntu`, or `root` may fail as `homebridge`.

Test your script as the same user that runs Homebridge:

```bash
sudo -u homebridge /absolute/path/to/script.sh
```

If your Homebridge service runs as another user, replace `homebridge` with that user.

### How can I confirm which user Homebridge runs as?

On systemd installs:

```bash
systemctl cat homebridge | grep -i '^User='
```

If no `User=` is set, check your service/unit setup and logs to determine runtime context.

### Why does Homebridge say it ran the script, but nothing happens?

Most commonly:

1. Wrong permissions (script or directories not executable/readable by Homebridge user)
2. Wrong working directory
3. Missing PATH in service environment
4. Script exits early due to shell/line-ending issues

### Do I need absolute paths?

**Yes, strongly recommended.**
Do not rely on relative paths, `~`, or shell-specific startup files.

Use absolute paths for:
- Script files
- Referenced files/directories
- Binaries/interpreters (`/usr/bin/python3`, `/usr/bin/node`, etc.)

Example:

```json
{
  "on": "/home/homebridge/scripts/light_on.sh",
  "off": "/home/homebridge/scripts/light_off.sh"
}
```

Inside scripts:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /home/homebridge/scripts || exit 1
/usr/bin/python3 /home/homebridge/scripts/device_on.py
```

### How do I verify permissions quickly?

```bash
chmod +x /home/homebridge/scripts/light_on.sh
chown homebridge:homebridge /home/homebridge/scripts/light_on.sh
```

Also make sure the Homebridge user can traverse parent directories (`x` permission on each directory).

Check with:

```bash
namei -l /home/homebridge/scripts/light_on.sh
```

### What is the best “same as Homebridge” test command?

Use the exact command from your config as the Homebridge user:

```bash
sudo -u homebridge /home/homebridge/scripts/light_on.sh
```

If this fails, Homebridge will fail too.

### How can I collect script debug logs?

Add logging in your script so errors are visible:

```bash
#!/usr/bin/env bash
set -euo pipefail
exec >>/tmp/homebridge-script2.log 2>&1

echo "[$(date)] Starting light_on.sh as $(whoami) in $(pwd)"
/usr/bin/python3 /home/homebridge/scripts/device_on.py
echo "[$(date)] Done"
```

Then inspect:

```bash
tail -n 100 /tmp/homebridge-script2.log
```

### Could line endings break my script?

Yes. Scripts edited on Windows may have CRLF line endings and fail on Linux.

Convert to LF:

```bash
dos2unix /home/homebridge/scripts/light_on.sh
```

### My `state` works but `on`/`off` does not. Why?

This usually means:
- Status-check command/path is valid
- Action scripts (`on`/`off`) have permission/path/runtime issues

Validate each action script independently as Homebridge user:

```bash
sudo -u homebridge /home/homebridge/scripts/light_on.sh
sudo -u homebridge /home/homebridge/scripts/light_off.sh
```

### If I use `fileState`, what should I check?

- File path is absolute
- Homebridge user can create/delete/read that file
- Parent directory permissions are correct
- No conflicting process recreates/deletes file unexpectedly


## Recommended best practices

- Always test as Homebridge user before troubleshooting plugin behavior.
- Always use absolute paths in config and scripts.
- Add logging and fail-fast flags (`set -euo pipefail`) in shell scripts.
- Keep scripts minimal; move complex logic to separate files you can test independently.
- Restart Homebridge after major script/permission changes to ensure a clean environment.
