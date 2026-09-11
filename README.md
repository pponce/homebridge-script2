<p align="center">
  <img src="https://raw.githubusercontent.com/pponce/homebridge-script2/master/assets/homebridge-script2-icon-512.png" width="128" height="128" alt="Script2 terminal and home icon">
</p>

# homebridge-script2

Run your own scripts from Apple Home and Siri using Homebridge.

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**Version 1.0.0 removes legacy Script2 accessory mode and old platform configuration formats. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

**Stable release: 1.0.1.** Install the `latest` channel. Homebridge verification is pending; this release does not claim certification.

**Updating from 1.0.0?** Version 1.0.1 fixes configuration-schema metadata and requires no configuration changes.

[Quick start](#quick-start) · [Migration](#migration) · [Minimal configuration](#minimal-configuration) · [Settings reference](#settings-reference) · [Full example](#full-configuration-example) · [Advanced behavior](#advanced-behavior) · [FAQ](#troubleshooting-faq) · [Changelog](CHANGELOG.md)

## What Script2 does

- Run separate ON and OFF commands, and report device state from a command or a file.
- Run one-shot actions with a stateless switch that resets its display automatically.
- Adjust polling, caching, and timeouts to suit your scripts, including long-running actions.
- Handle repeated HomeKit requests and command failures without unnecessarily launching the same action again.

See [advanced behavior](#advanced-behavior) for execution details and [the feature comparison](VERIFICATION.md) for the Homebridge review rationale.


## Quick start

1. Save a Homebridge backup and your full config.json.
2. Follow [Migration](#migration) if you use an older configuration.
3. In Homebridge UI, install Script2 and select **1.0.1** / **latest** using the plugin version selector.
4. For a new setup, open Settings and add an **On/Off switch** or a **Stateless switch**. Enter your commands; On/Off switches also need a state command or state file. For an existing valid setup, keep your current entries.
5. Review Advanced settings if needed, use Homebridge Save, then restart the instance or child bridge running Script2. Opening or saving settings never runs commands.

Requires Node **22.13+ within Node 22, or Node 24**, and Homebridge **1.8+ within v1, or v2**. Commands run as the Homebridge service user and must not require a terminal or prompts.

Make scripts executable and use absolute paths accessible to the Homebridge service user. If a command works in your terminal but fails in Homebridge, start with the [FAQ](#troubleshooting-faq).

## Migration

**Save your old configuration before installing.** Only `Script2Platform` with `on_off_switches` and `stateless_switches` is supported. [The migration guide](MIGRATION.md) includes before/after JSON for old standalone accessories and platform lists, every removed alias, HomeKit identity guidance, and rollback.

Existing canonical entries do not need a list-format change. Keep names and serial values unchanged, remove any legacy `device_type`, and correct values rejected by validation. The editor never silently converts old configuration.

## Minimal configuration

The settings UI builds this configuration for you. If you edit JSON manually, add the following **single platform object inside your existing `platforms` array**. Preserve other platforms and Homebridge settings. If Script2 is already configured, edit that entry instead of adding another.

```json
{
  "platform": "Script2Platform",
  "on_off_switches": [
    {
      "name": "Desk Lamp",
      "on": "/var/lib/homebridge/scripts/lamp-on.sh",
      "off": "/var/lib/homebridge/scripts/lamp-off.sh",
      "state": "/var/lib/homebridge/scripts/lamp-state.sh"
    }
  ]
}
```

Create or supply those scripts and replace the example paths with their actual absolute paths. The state script should print `true` when the lamp is on and `false` when it is off. The platform display name is optional; the switch name is required.

For periodic updates when the device changes outside Apple Home, enable **Polling** in Settings. For a one-shot action, use a stateless switch with a `trigger` command instead. See the [settings reference](#settings-reference) and [full example](#full-configuration-example).


## Settings reference

| Name | Value | Required | Notes |
| --- | --- | --- | --- |
| `platform` | `"Script2Platform"` | yes | Platform identifier; keep this exact value |
| `name` | string | no | Optional platform display name; individual switches still require names |
| `on_off_switches` | array | no | Main section for standard ON/OFF switches |
| `stateless_switches` | array | no | Main section for one-shot trigger switches |

### Timing units

**The settings UI shows seconds. Values in config.json are milliseconds.** Multiply seconds by 1,000 when editing JSON manually. The defaults below apply when a setting is omitted.

| JSON setting | UI value in seconds | JSON value in milliseconds |
| --- | --- | --- |
| `command_timeout` | 10 | 10000 |
| `homekit_set_ack_timeout_ms` | 0 | 0 |
| `polling_interval` | 5 | 5000 |
| `state_cache_ttl_ms` | 1 | 1000 |
| `auto_reset_ms` | 0.5 | 500 |

An acknowledgement delay of `0` waits for the action command to finish. A cache lifetime of `0` disables stored-state caching. A reset delay of `0` resets the stateless switch immediately after its command settles.

### On/Off switches

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

### Stateless switches

Name | Value | Required | Notes
--- | --- | --- | ---
`name` | _(custom)_ | yes | Accessory name shown in Home app
`trigger` | _(custom)_ | yes | Script/command to execute trigger action
`auto_reset_ms` | integer ms | no (default `500`) | Delay before Home tile auto-resets
`command_timeout` | integer ms | no (default `10000`) | Maximum runtime for the trigger command
`stateless_trigger_on` | `on/off` | no (default `on`) | `on` triggers on ON; `off` triggers on OFF (tile defaults to ON)
`unique_serial` | _(custom)_ | no | Unique serial per accessory is recommended

## Full configuration example

This example combines command-based state, file-based state, a long-running action, and both stateless trigger directions. It is **one platform entry** for your existing `platforms` array. Replace the paths and names with your own; merge into an existing Script2 platform rather than adding a second one. All timings here are in milliseconds.

```json
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
```

In this example, Outlet 1 allows its action command to run for 120 seconds and acknowledges HomeKit after 5 seconds if it is still running. The file-state switch reads the flag instead of running a state command. The reboot switches reset their display after their command settles.

## Advanced behavior

### State sources and polling

Choose a state command or a `fileState` path for each On/Off switch. With a state command, Script2 trims and lowercases the command output and the configured `on_value` before comparing them. The default match is the string `"true"`.

With `fileState`, file existence means ON and absence means OFF. Your ON/OFF scripts should create and delete the flag as appropriate. Script2 watches file creation/deletion and updates HomeKit without running the ON/OFF commands again. The parent directory must already exist; the flag itself may be absent at startup.

If both sources are supplied, `fileState` takes precedence. Polling options apply only to command-based state. With polling enabled, `polling_interval` controls the interval; `polling_on_start` controls the initial state read. The initial command-state read is a cache miss.

### State caching and shared reads

`state_cache_ttl_ms` sets how long a switch can reuse a stored command-state result. The cache is per switch. A value of `0` disables stored-result caching, but simultaneous reads still share a state command that is already running.

By default, a successful manual action does not restart the cache lifetime. Enable `reset_state_cache_on_set` to seed the cache with the new state and restart that timer after a successful action.

### Long-running commands and action order

`command_timeout` limits how long an external command may run. `homekit_set_ack_timeout_ms` controls whether an On/Off request can be acknowledged to HomeKit before that command finishes. Its default is `0`, which waits for completion.

For an action that may take up to two minutes, set Command Timeout to **120 seconds** and HomeKit Set Acknowledgement to **5 seconds** in the UI. The equivalent fields to merge into that On/Off switch's JSON entry are:

```json
{
  "command_timeout": 120000,
  "homekit_set_ack_timeout_ms": 5000
}
```

Early acknowledgement means HomeKit has received a response; it does not prove the external action completed. The command continues under its execution timeout. If it later fails, Script2 bypasses the state cache and uses the configured state source to correct HomeKit. An authoritative `state` or `fileState` source is required.

For each switch, duplicate action requests share one execution and opposite actions wait in order. Acknowledgement does not advance that queue. Reads and polling during an action are deferred, and older read results cannot overwrite a newer action's state.

### Stateless reset behavior

`stateless_trigger_on` chooses whether ON or OFF activates the trigger. When it is `off`, the tile normally rests at ON. Concurrent activations share one execution; a later intentional activation can run again.

The `auto_reset_ms` delay starts when the command settles, including after a failure. Resetting the tile changes its display only and does not execute another command.

### Errors and logging

Successful ON/OFF and trigger completions are logged at **info** level. Routine successful reads, polling, and cache/shared-read messages are **debug** only. Acknowledgement and command completion are separate events.

A state-read result uses this format:

```text
GetState <name>: ON/OFF (path: <request origin>, source: <state source>)
```

The request origin is `homekit-get` or `polling`; the state source is `state-script`, `ttl-cache`, `in-flight-coalesced`, or `file-state`. Errors identify the accessory and action. Raw commands, stdout, and stderr are omitted from plugin diagnostics because scripts may contain credentials.

Timeouts, terminated state commands, and output overflow are failures even if partial output was printed. For an ordinary nonzero state-command exit, `fail_on_state_exit_code` determines whether otherwise usable stdout can still determine state. ON/OFF and trigger commands retain their stderr-as-failure policy.

### Storage and shutdown

Plugin state caching is in memory; Homebridge manages accessory persistence. Script2 reads and watches configured state files without creating them. Any plugin-owned files must be inside Homebridge's actual storage directory. Adjust example script and log paths to your installation.

Shutdown rejects pending work, stops tracked processes, watchers, and timers, and ignores late completions. Scripts can spawn detached descendants; stopping the immediate process cannot guarantee those descendants stop.

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
