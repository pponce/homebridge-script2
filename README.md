homebridge-script2
==================

Execute custom scripts via homekit/Home app.

Core of the code written by [@xxcombat](https://github.com/xxcombat/). Great plugin that has served me well.
Original plugin [homebridge-script](https://github.com/xxcombat/homebridge-script).

## Homebridge UI Configuration

This plugin now includes a **Homebridge Config UI X** schema (`config.schema.json`) so you can add and manage `Script2Platform` devices directly from the UI instead of editing raw JSON manually.

- In Homebridge UI, go to **Plugins → homebridge-script2 → Settings**.
- Use the **Devices** list to add each Script2 switch/accessory and fill in commands/paths.
- Save and restart Homebridge when prompted.

## Platform mode

This plugin now supports **both**:
- Legacy accessory mode (backward compatible)
- New dynamic platform mode (`Script2Platform`)

### Backward compatibility
- Existing accessory-based setups remain supported and unchanged.
- If you choose to move to platform mode, you should remove the existing setup completely and start fresh with a new `platforms` configuration.

### Strong recommendation: use a Child Bridge
Because this plugin depends on external scripts and shell execution, it is highly recommended to run it in a dedicated **Child Bridge** for reliability and isolation.

### Platform configuration parameters
Each entry in `devices` supports the same options as accessory mode:

Name            | Value         | Required                                    | Notes
--------------- | ------------- | ------------------------------------------- | -------------
`name`          | _(custom)_    | yes                                         | Name of accessory that will appear in Home app and is required
`on`            | _(custom)_    | yes                                         | Script/command to execute the on action
`off`           | _(custom)_    | yes                                         | Script/command to execute the off action
`fileState`     | _(custom)_    | fileState or state is required (see note)   | File used as current state flag
`state`         | _(custom)_    | fileState or state is required (see note)   | Script to determine current state
`on_value`      | _(custom)_    | no* (default set to `"true"`)             | Value matched against `state` command output
`polling`       | `true/false`  | no (default `false`)                       | Enables periodic polling for `state` command mode only
`polling_interval` | integer ms | no (default `5000`)                        | Poll interval in milliseconds when `polling` is enabled
`polling_on_start` | `true/false` | no (default `true`)                     | Immediately run a state poll when Homebridge starts
`state_cache_ttl_ms` | integer ms | no (default `1000`)                     | Cache TTL for `state` reads to avoid duplicate script executions on burst GET requests
`reset_state_cache_on_set` | `true/false` | no (default `false`)               | When enabled, successful manual ON/OFF actions reset the state cache timer and seed it with the set state
`unique_serial` | _(custom)_    | no (default set to `"Script2 Serial number"`) | Unique serial per device is recommended

### Platform configuration example

```
"platforms": [
  {
    "platform": "Script2Platform",
    "name": "Script2",
    "devices": [
      {
        "name": "RPC3 Socket 1",
        "on": "/var/homebridge/rpc3control/on.sh 1",
        "off": "/var/homebridge/rpc3control/off.sh 1",
        "state": "/var/homebridge/rpc3control/state.sh 1",
        "fileState": "/var/homebridge/rpc3control/script1.flag",
        "on_value": "true",
        "polling": false,
        "polling_interval": 5000,
        "polling_on_start": true,
        "state_cache_ttl_ms": 1000,
        "reset_state_cache_on_set": false,
        "unique_serial": "platform-1234567"
      }
    ]
  }
]
```


### State script behavior
- The `state` script output is normalized to lowercase and compared against `on_value` (default `true`).
- If both `fileState` and `state` are configured, `fileState` takes precedence: the state script is not used for status changes and the configured file flag is used instead.
- If using fileState your on and off scripts should create the fileState file and delete the fileState file for homekit to see the changes.
- If a script returns a non-zero exit code but still prints a valid value to stdout (for example `true` or `false`), the plugin will use stdout to determine state.
- When `polling` is enabled, the `state` script is executed on the configured interval and updates HomeKit if the value changes.
- Polling options are ignored when `fileState` is configured, since `fileState` already uses filesystem change notifications to dynamically update homekit status.
- When `state_cache_ttl_ms` is greater than `0`, `state` reads are cached briefly to prevent duplicate script executions from burst `get` requests.
- By default, manual HomeKit ON/OFF actions do **not** reset or extend `state_cache_ttl_ms`. Set `reset_state_cache_on_set` to `true` if you want successful manual set actions to reset the TTL timer and seed the cache with the newly set state.
- If multiple `get` requests arrive while a state command is already running, they are coalesced and share the same in-flight command result.
- Each `getState` request writes a single result log entry in the format `GetState <name>: ON/OFF (path: <homekit-get|polling>, source: <state-script|ttl-cache|in-flight-coalesced|file-state>)`. Where Path is telling you if this was the result of a polling request or a homekit initiated get request (out of the plugin's control). And source is where the value was sourced from, state-script execution result, ttl cache, in-flight coalesced, or from file-state.  
- The TTL cache is per-accessory instance (per configured outlet/switch), not global across all accessories.
- At startup with `polling_on_start: true`, the first read for each accessory is a cache miss by design, so one state-script execution per accessory is expected before subsequent reads are served from TTL.

## Installation
(Requires Node.js >=20.19.0)

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-script2`
3. Update your configuration file. See examples below that show the plugin working by using filestate for current state check as well as an example using state.sh script for current state check.
4. Make sure scripts have been made executable (chmod +x scriptname.sh) and also accessible by the homebridge user. 


## Legacy accessory mode (still supported)

Legacy `accessories` mode remains supported for backward compatibility.
For new installs, platform mode is recommended.
If you migrate from legacy accessory mode to platform mode, remove the old accessory setup and start fresh with a new `platforms` configuration.

### Legacy accessory configuration parameters

Name            | Value         | Required                                    | Notes
--------------- | ------------- | ------------------------------------------- | -------------
`accessory`     | "Script2"     | yes                                         | Must be set to "Script2" and is required
`name`          | _(custom)_    | yes                                         | Name of accessory that will appear in homekit app and is required
`on`            | _(custom)_    | yes                                         | Location of script to execute the on action and is required
`off`           | _(custom)_    | yes                                         | Location of script to execute the off action and is required
`fileState`     | _(custom)_    | fileState or state is required (see note)   | Location of file that flags on or off current state. If this is configured the plugin will use the existence of this file to determine the current on or off state. If file exists, accessory is determined to be on. If file does not exist, accessory is determined to be off. This is not required. But if set, it will override using the state script. fileState or state must be configured. Use full path when setting this it's value. Do not use "~/".
`state`         | _(custom)_    | fileState or state is required (see note)   | Location of script to execute the current state check. It must output to stdout the current state. It is not required if fileState is being used instead. fileState or state must be configured.
`on_value`      | _(custom)_    | no* (see note, default set to "true")       | Used in conjunction with the state script. If using the state script this is the value that will be used to match against the state script output. If this value matches the output, then the accessory will be determined to be on. Required if using state script.
`unique_serial` | _(custom)_    | no (default set to "Script2 Serial number") | If you have more than one "accessory" configured, please set unique values for each accessory. Unique values per accessory required for the Eve app.

### Legacy configuration example 1 (`accessories`), using `fileState` for current state check:

```
"accessories":
[
    {
        "accessory": "Script2",
        "name": "RPC3 Socket 1",
        "on": "/var/homebridge/rpc3control/on.sh 1",
        "off": "/var/homebridge/rpc3control/off.sh 1",
        "state": "/var/homebridge/rpc3control/state.sh 1",
        "fileState": "/var/homebridge/rpc3control/script1.flag",
        "on_value": "true",
        "unique_serial": "1234567"
    }
]
```

#### Notes
##### Using the above configuration as an example:
- The on.sh script executes when you turn on the accessory via a homekit app. (In this case we are the using existence of a file to determine on or off current state, so you must insure the on.sh script creates the configured fileState file.
- The off.sh script executes when you turn off the accessory via a homekit app. ( In this case we are using existence of a file to determine on or off current state, insure the off.sh script deletes the configured fileState file.)
- The state.sh script in this case would not execute as fileState parameter overrides its use.
- The configured fileState file is used as a flag. When the homekit app checks for current state it checks for the existence of this file. If it exists, current state is on. If it does not exist, current state is off.
- HomeKit status updates are dynamic when using `fileState`: state changes are reflected as soon as the configured file is created or deleted.
- The on_value in this case is not being used as it is only used when the state script is used to check for current state.

### Legacy configuration example 2 (`accessories`), executing `state.sh` for current state check:

```
"accessories":
[
    {
        "accessory": "Script2",
        "name": "Alarm of bike",
        "on": "~/on.sh",
        "off": "~/off.sh",
        "state": "~/state.sh",
        "on_value": "true",
        "unique_serial": "1234567"
    }
]
```

#### Notes
##### Using the above configuration as an example:
- The on.sh script executes when you turn on the accessory via a homekit app. (In this case we are executing a state script to determine on or off current state.)
- The off.sh script executes when you turn off the accessory via a homekit app. ( In this case we are executing a state script to determine on or off current state.)
- The state.sh script in this case would be executed to check current state.  Insure that this script outputs to stdout the matching on value as configured by the on_value config parameter. If the on_value matches the on value output of this script then the accessory will be determined to be on.
- The configured fileState file is not used in this example. Because it was not configured, the state script is being used.
- The on_value in this case is used to match against the state script output. If the value matches the output of the state script, the accessory is determined to be on.

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
