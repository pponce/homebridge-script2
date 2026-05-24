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
