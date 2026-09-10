# Migrate to Script2 1.0

**BACK UP BEFORE UPDATING. Save your full Homebridge config.json and download a Homebridge backup. This release removes standalone Script2 accessories and old platform formats. Legacy configurations will no longer run.**

You can move to the current lists while still using 0.4.6, test them, and then install the beta. Record rooms, scenes, and automations before making changes. Stop the relevant Homebridge instance while manually editing config.json; preserve every unrelated setting.

## Already using the current lists?

Keep `platform: "Script2Platform"`, `on_off_switches`, and `stateless_switches`. No list-format migration is required. Names must be unique across both lists; ON/OFF commands and a state source are required for stateful switches. Stateless switches need `trigger`. Remove `device_type`, because list membership determines behavior. Use real JSON booleans/numbers and a quoted string for `on_value`. State file paths must be absolute.

Keep exact accessory names, `unique_serial`, and the bridge/child-bridge configuration. Names determine platform UUIDs (`homebridge-script2:<name>`); serial numbers do not override that. Do not add an ID or change names during migration.

## Old platform lists

| Old format | New format |
| --- | --- |
| `devices` containing stateful entries | `on_off_switches` |
| `devices` containing `device_type: "stateless"` | `stateless_switches` |
| `stateful_devices` or `On/Off Switches` | `on_off_switches` |
| `stateless_devices` or `Stateless Switches` | `stateless_switches` |
| Stateless `on` fallback | Copy the command into explicit `trigger`, then remove `on` |
| Per-entry `device_type` | Remove; list membership determines behavior |

Before — this is the Script2 platform block, not your entire config.json:

```json
{
  "platform": "Script2Platform",
  "name": "Script2",
  "devices": [
    { "name": "Outlet 1", "on": "/opt/scripts/on.sh 1", "off": "/opt/scripts/off.sh 1", "state": "/opt/scripts/state.sh 1", "on_value": "true", "unique_serial": "outlet-1" },
    { "name": "Outlet 1 Reboot", "device_type": "stateless", "on": "/opt/scripts/reboot.sh 1", "auto_reset_ms": 500 }
  ]
}
```

After:

```json
{
  "platform": "Script2Platform",
  "name": "Script2",
  "on_off_switches": [
    { "name": "Outlet 1", "on": "/opt/scripts/on.sh 1", "off": "/opt/scripts/off.sh 1", "state": "/opt/scripts/state.sh 1", "on_value": "true", "unique_serial": "outlet-1" }
  ],
  "stateless_switches": [
    { "name": "Outlet 1 Reboot", "trigger": "/opt/scripts/reboot.sh 1", "auto_reset_ms": 500 }
  ]
}
```

Copy all other applicable command, state, timing, polling, cache and serial settings unchanged. If both old and current lists exist, merge their entries and remove duplicate names before removing old keys. Remove old keys even if their arrays are empty. Keep `_bridge` and unrelated platform metadata. Save, restart, and verify HomeKit identities and automations before upgrading.

The platform identity algorithm is retained and covered by automated tests, but verify your real HomeKit assignments after migration. Do not delete the accessory cache to perform a list rename.

## Standalone accessory mode

**Moving from standalone accessory mode can create new HomeKit accessories. You may need to reassign rooms and rebuild scene/automation references.**

Before — the relevant entries from a larger config.json:

```json
{
  "accessories": [
    { "accessory": "Script2", "name": "Outlet 1", "on": "/opt/scripts/on.sh 1", "off": "/opt/scripts/off.sh 1", "state": "/opt/scripts/state.sh 1" }
  ]
}
```

After — merge this with your existing arrays rather than overwriting them:

```json
{
  "accessories": [],
  "platforms": [
    {
      "platform": "Script2Platform",
      "name": "Script2",
      "on_off_switches": [
        { "name": "Outlet 1", "on": "/opt/scripts/on.sh 1", "off": "/opt/scripts/off.sh 1", "state": "/opt/scripts/state.sh 1" }
      ],
      "stateless_switches": []
    }
  ]
}
```

Remove only the old entries whose `accessory` is `Script2`. Preserve other accessories and platforms. If a Script2 platform already exists, merge into it rather than creating another block. Omit the per-accessory `accessory` key in the new lists. Convert stateless entries using the table above. Homebridge may report the old accessory type as unregistered if you install the beta before removing old entries.

## Validation and timing changes

- UI time values are seconds; raw JSON remains milliseconds. For example, 5 seconds is `5000` in JSON.
- `command_timeout` defaults to 10000 ms, acknowledgement to 0, state cache to 1000, polling interval to 5000, and stateless reset to 500.
- A polling interval must be at least 250 ms, command timeout at least 100 ms, and all durations must be integers no larger than 2147483647 ms. Reset/cache/acknowledgement may be 0.
- `auto_reset_ms: 0` now means reset with no added delay after command completion.
- State-command timeout, termination, and output overflow always fail; usable output from ordinary nonzero exits remains controlled by `fail_on_state_exit_code`.
- Name-only or wrongly typed entries are rejected before scripts start. A recognized legacy key blocks the platform with an actionable message; saved configuration is never silently rewritten.
- If both state sources were saved, `fileState` retains precedence. The new UI makes source selection explicit.

## Beta verification and rollback

Choose **1.0.0-beta.1** / **beta** in Homebridge UI and restart the relevant instance. Check manual actions, polling/state reads, file creation/removal, stateless reset, and scenes/automations. If you use early acknowledgement, test a long-running success and a late failure against your real state source.

For rollback, select **0.4.6** and restore the configuration backed up for it. Restart and verify. Restoring package/config does not necessarily repair HomeKit assignments after identity changes. Keep the full Homebridge backup available; do not delete the entire accessory cache as a migration shortcut.
