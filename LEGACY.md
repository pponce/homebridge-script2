# Legacy configuration support

homebridge-script2 still supports legacy formats for backward compatibility.

## 1) Legacy dynamic platform format (`platforms[].devices[]`)

### Fields for each `devices[]` item

Name | Value | Required | Notes
--- | --- | --- | ---
`name` | _(custom)_ | yes | Accessory name
`on` | _(custom)_ | yes | ON command
`off` | _(custom)_ | yes | OFF command
`fileState` | _(custom)_ | fileState or state | File-based state source
`state` | _(custom)_ | fileState or state | Script-based state source
`on_value` | _(custom)_ | no (default `"true"`) | Match token for ON state
`polling` | `true/false` | no | Poll `state` command periodically
`polling_interval` | integer ms | no | Poll interval
`polling_on_start` | `true/false` | no | Immediate startup poll
`state_cache_ttl_ms` | integer ms | no | Burst-read cache TTL
`reset_state_cache_on_set` | `true/false` | no | Reset cache after manual set
`fail_on_state_exit_code` | `true/false` | no | Treat non-zero state exit as read failure
`unique_serial` | _(custom)_ | no | Recommended unique serial

### Legacy platform example

```json
"platforms": [
  {
    "platform": "Script2Platform",
    "name": "Script2",
    "devices": [
      {
        "name": "Outlet 1",
        "on": "/opt/scripts/on.sh 1",
        "off": "/opt/scripts/off.sh 1",
        "state": "/opt/scripts/state.sh 1",
        "on_value": "true"
      }
    ]
  }
]
```

## 2) Legacy accessory mode format (`accessories[]`)

### Fields for each accessory item

Name | Value | Required | Notes
--- | --- | --- | ---
`accessory` | `"Script2"` | yes | Must be `Script2`
`name` | _(custom)_ | yes | Accessory name
`on` | _(custom)_ | yes | ON command
`off` | _(custom)_ | yes | OFF command
`fileState` | _(custom)_ | fileState or state | File-based state source
`state` | _(custom)_ | fileState or state | Script-based state source
`on_value` | _(custom)_ | no (default `"true"`) | Match token for ON state
`unique_serial` | _(custom)_ | no | Recommended unique serial

### Legacy accessory example

```json
"accessories": [
  {
    "accessory": "Script2",
    "name": "Outlet 1",
    "on": "/opt/scripts/on.sh 1",
    "off": "/opt/scripts/off.sh 1",
    "state": "/opt/scripts/state.sh 1",
    "on_value": "true"
  }
]
```

## Recommendation

Use the newer platform format with:
- `on_off_switches`
- `stateless_switches`

It provides a better UI and clearer configuration intent.

## Migration guidance

### From legacy platform `devices` to grouped sections

This migration is usually smoother if names stay the same.

- Homebridge accessory UUIDs in this plugin are name-based in platform mode (`homebridge-script2:<name>`).
- If you move a legacy `devices` item into `on_off_switches` or `stateless_switches` and keep the **exact same `name`**, Homebridge usually preserves accessory identity.
- If you rename, HomeKit treats it as a new accessory identity.

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
3. Add a new `platforms` entry with `on_off_switches` / `stateless_switches`.
4. Restart Homebridge and re-check Home app placement/scenes/automations.
