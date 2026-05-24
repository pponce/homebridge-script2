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
> See **[LEGACY.md](./LEGACY.md)** for legacy field details and examples.

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
      }
    ],
    "stateless_switches": [
      {
        "name": "Outlet 1 Reboot",
        "trigger": "/opt/scripts/reboot.sh 1",
        "auto_reset_ms": 500,
        "stateless_trigger_on": "off"
      }
    ]
  }
]
```

## Migration guidance

### From legacy platform `devices` to new grouped sections

This migration is usually smooth if names stay the same.

- Homebridge accessory UUIDs in this plugin are name-based in platform mode (`homebridge-script2:<name>`).
- If you move a legacy `devices` item into `on_off_switches` or `stateless_switches` and keep the **exact same `name`**, Homebridge usually preserves accessory identity.
- If you rename, HomeKit treats it as a new accessory.

Recommended steps:
1. Stop Homebridge.
2. Move one legacy `devices` item at a time into `on_off_switches` or `stateless_switches`.
3. Keep the exact same `name`.
4. Remove the moved entry from `devices`.
5. Start Homebridge and verify in Home app.

### From legacy accessory mode (`accessories`) to platform mode

Treat this as a **fresh migration**.

- Accessory mode and platform mode are different registration paths.
- In practice, many users will need to re-place accessories into rooms and re-link scenes/automations after migration.

Recommended steps:
1. Backup `config.json`.
2. Remove legacy `accessories` entries for Script2.
3. Add new `platforms` entry with `on_off_switches` / `stateless_switches`.
4. Restart Homebridge and re-check Home app placement/scenes/automations.

## Installation

(Requires Node.js >=20.19.0)

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-script2`
3. Update your configuration file.
4. Ensure scripts are executable and accessible by the Homebridge service user.

## Troubleshooting FAQ

### Why does my script work in terminal but not in Homebridge?

Homebridge runs scripts as the **Homebridge service user**, not your normal shell user.

Test your script as the same user that runs Homebridge:

```bash
sudo -u homebridge /absolute/path/to/script.sh
```

### How can I confirm which user Homebridge runs as?

```bash
systemctl cat homebridge | grep -i '^User='
```

### Do I need absolute paths?

Yes, strongly recommended.

### Could line endings break my script?

Yes. Convert to LF:

```bash
dos2unix /path/to/script.sh
```
