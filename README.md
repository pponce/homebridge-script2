<p align="center">
  <img src="https://raw.githubusercontent.com/pponce/homebridge-script2/master/assets/homebridge-script2-icon-512.png" width="128" height="128" alt="Script2 terminal and home icon">
</p>

# homebridge-script2

Execute custom scripts via HomeKit / Apple Home using Homebridge.

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**Version 1.0.0 removes legacy Script2 accessory mode and old platform configuration formats. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

**Stable release: 1.0.1.** Install the `latest` channel. Homebridge verification is pending; this release does not claim certification.

**Updating from 1.0.0?** Version 1.0.1 fixes configuration-schema metadata and requires no configuration changes.

## Install or update

1. Save a Homebridge backup and your full config.json.
2. Follow [Migration](#migration) if you use an older configuration.
3. In Homebridge UI, install Script2 and select **1.0.1** / **latest** using the plugin version selector.
4. Open Settings, add On/Off or Stateless switches, choose a state source, and review Advanced settings. Opening or saving settings never runs commands.
5. Use Homebridge Save, then restart the instance or child bridge running Script2.

Requires Node **22.13+ within Node 22, or Node 24**, and Homebridge **1.8+ within v1, or v2**. Commands run as the Homebridge service user and must not require a terminal or prompts.

## Migration

**Save your old configuration before installing.** Only `Script2Platform` with `on_off_switches` and `stateless_switches` is supported. [The migration guide](MIGRATION.md) includes before/after JSON for old standalone accessories and platform lists, every removed alias, HomeKit identity guidance, and rollback.

Existing canonical entries do not need a list-format change. Keep names and serial values unchanged, remove any legacy `device_type`, and correct values rejected by validation. The editor never silently converts old configuration.

## What distinguishes Script2

Script2 combines command- or file-based state with per-switch command serialization, coalesced reads, an adjustable TTL cache, and separate command-execution and HomeKit-acknowledgement deadlines. A late failure after early acknowledgement bypasses the cache and reconciles HomeKit from the state source. Stateless switches can trigger on either On or Off and reset without sending a second command. See [feature comparison and suggested verification text](https://github.com/pponce/homebridge-script2/blob/master/VERIFICATION.md). These are useful combined behaviors; no claim is made that every individual option is exclusive to Script2.

## Logging and behavior notes

Successful ON/OFF and trigger command completions are logged at info level. Routine successful reads, polling, and cache/coalescing information are debug-only. Errors identify the accessory and action; raw command strings/stdout/stderr are omitted because scripts may contain credentials. An acknowledged request is not necessarily a completed action.

Timeouts, terminated state commands and output overflow are failures even if partial output was printed. Ordinary nonzero state exits still honor `fail_on_state_exit_code`. ON/OFF and trigger commands retain their stderr-as-failure policy. Concurrent stateless activations share one execution; later intentional activations are allowed. The reset delay begins when the command settles, and resetting the tile never sends another command. Shutdown rejects pending work, stops tracked processes/watchers/timers, and ignores late completions. Arbitrary scripts can spawn detached descendants; stopping the immediate process cannot guarantee those descendants stop.

Plugin state caching is in memory and Homebridge manages accessory persistence. Script2 reads/watches user-selected state files; it does not create them. The state file may be absent at startup, but its parent directory must already exist. Any plugin-owned files must be inside Homebridge's actual storage directory. Adjust example script/log paths to your installation.

[Changelog](CHANGELOG.md) · [1.0.1 release notes](https://github.com/pponce/homebridge-script2/releases/tag/v1.0.1)

## Platform configuration parameters

| Name | Value | Required | Notes |
| --- | --- | --- | --- |
| `on_off_switches` | array | no | Main section for standard ON/OFF switches |
| `stateless_switches` | array | no | Main section for one-shot trigger switches |

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
`command_timeout` | integer ms | no (default `10000`) | Maximum runtime for ON, OFF, and state commands
`homekit_set_ack_timeout_ms` | integer ms | no (default `0`) | Opt in to acknowledging a still-running ON/OFF request after this delay; requires `state` or `fileState`
`unique_serial` | _(custom)_ | no | Unique serial per accessory is recommended

### `stateless_switches` item parameters

Name | Value | Required | Notes
--- | --- | --- | ---
`name` | _(custom)_ | yes | Accessory name shown in Home app
`trigger` | _(custom)_ | yes | Script/command to execute trigger action
`auto_reset_ms` | integer ms | no (default `500`) | Delay before Home tile auto-resets
`command_timeout` | integer ms | no (default `10000`) | Maximum runtime for the trigger command
`stateless_trigger_on` | `on/off` | no (default `on`) | `on` triggers on ON; `off` triggers on OFF (tile defaults to ON)
`unique_serial` | _(custom)_ | no | Unique serial per accessory is recommended

### Command timing and long-running ON/OFF actions

`command_timeout` and `homekit_set_ack_timeout_ms` control different deadlines:

- `command_timeout` controls how long Script2 allows the external ON, OFF, state, or stateless trigger command to run. A command that exceeds this limit is reported as timed out. Increase it above the command's worst-case runtime for long-running scripts.
- `homekit_set_ack_timeout_ms` applies only to stateful ON/OFF switches. Its backward-compatible default is `0`, which means the HomeKit set callback waits for actual command completion.
- Set `homekit_set_ack_timeout_ms` to a positive integer to opt into early HomeKit acknowledgement. For example, `5000` acknowledges the request after five seconds while the external command continues under `command_timeout`.
- Early acknowledgement does not complete or duplicate the external operation: Script2 keeps the command in flight, coalesces duplicate requests, serializes opposite requests, and defers GET/poll presentation updates until the command settles.
- Optimistic acknowledgement requires `state` or `fileState`. If the external command later fails, Script2 bypasses the TTL cache and uses that state source to reconcile HomeKit. Without a state source, early acknowledgement is disabled with a warning.
- `fail_on_state_exit_code` is independent of both timeout settings. It controls whether a non-zero **state command** exit is fatal when the state command still prints usable stdout.

Recommended settings for a stateful command that may take up to two minutes:

```json
"command_timeout": 120000,
"homekit_set_ack_timeout_ms": 5000
```

For existing synchronous behavior, omit `homekit_set_ack_timeout_ms` or set it to `0`.

### State script behavior for on_off_switches
- The `state` script output is normalized to lowercase and compared against `on_value` (default `"true"`).
- on_value should be set to a string and use quotes. Default value is `"true"`.
- If both `fileState` and `state` are configured, `fileState` takes precedence: the state script is not used for status changes and the configured file flag is used instead.
- If using fileState your on and off scripts should create the fileState file and delete the fileState file for homekit to see the changes.
- If a script returns a non-zero exit code but still prints a valid value to stdout (for example `true` or `false`), the plugin will use stdout to determine state. You can set fail_on_state_exit_code to true to treat non-zero `state` exit code as read error.
- When `polling` is enabled, the `state` script is executed on the configured interval and updates HomeKit if the value changes.
- Polling options are ignored when `fileState` is configured, since `fileState` already uses filesystem change notifications to dynamically update homekit status.
- When `state_cache_ttl_ms` is greater than `0`, `state` reads are cached briefly to prevent duplicate script executions from burst `get` requests.
- By default, manual HomeKit ON/OFF actions do **not** reset or extend `state_cache_ttl_ms`. Set `reset_state_cache_on_set` to `true` if you want successful manual set actions to reset the TTL timer and seed the cache with the newly set state.
- If multiple `get` requests arrive while a state command is already running, they are coalesced and share the same in-flight command result.
- Each `getState` request writes a single result log entry in the format `GetState <name>: ON/OFF (path: <homekit-get|polling>, source: <state-script|ttl-cache|in-flight-coalesced|file-state>)`. Where Path is telling you if this was the result of a polling request or a homekit initiated get request (out of the plugin's control). And source is where the value was sourced from, state-script execution result, ttl cache, in-flight coalesced, or from file-state.  
- The TTL cache is per-accessory instance (per configured outlet/switch), not global across all accessories.
- At startup with `polling_on_start: true`, the first read for each accessory is a cache miss by design, so one state-script execution per accessory is expected before subsequent reads are served from TTL.

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
        "on_value": "true",
        "command_timeout": 120000,
        "homekit_set_ack_timeout_ms": 5000
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
        "command_timeout": 30000,
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

(Requires Node.js 22.13+ within Node 22, or Node 24.)

1. Install homebridge using: `npm install -g homebridge`
2. Install **1.0.1** / **latest** using the Homebridge UI version selector
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
exec >>/var/lib/homebridge/script2.log 2>&1

echo "[$(date)] Starting light_on.sh as $(whoami) in $(pwd)"
/usr/bin/python3 /home/homebridge/scripts/device_on.py
echo "[$(date)] Done"
```

Then inspect:

```bash
tail -n 100 /var/lib/homebridge/script2.log
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

---

Originally based on [homebridge-script](https://github.com/xxcombat/homebridge-script).
