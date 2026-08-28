# Release notes

## Long-running commands, stable HomeKit state, and reliable configuration

This release improves Script2 behavior for accessories whose ON/OFF commands take longer than a typical HomeKit interaction. It also fixes custom Config UI persistence, prevents overlapping commands, and makes command timing explicit.

### Highlights

- Long-running ON/OFF commands can now be acknowledged to HomeKit before the external process finishes, preventing the Home app from reverting a tile solely because it stopped waiting for the set callback.
- Early acknowledgement is opt-in. Existing installations retain their previous synchronous callback behavior by default.
- Duplicate set requests are coalesced and opposite-state commands are serialized per accessory, so Script2 does not start overlapping ON/OFF processes.
- HomeKit GET requests and polling results are coordinated with active set commands so an old durable state cannot overwrite the requested presentation state while a command is running.
- State results are generation-checked so a state read started before a newer set cannot update the cache or characteristic after that set.
- The custom Homebridge Config UI now synchronizes valid edits through Homebridge before Save, preserves unrelated configuration blocks, and stores numeric fields as JSON numbers.
- `command_timeout` is now documented throughout the current and legacy configuration guidance, including stateful and stateless examples.

## New setting: `homekit_set_ack_timeout_ms`

`homekit_set_ack_timeout_ms` controls how long Script2 waits before acknowledging an unresolved stateful ON/OFF request to HomeKit while the external command continues running.

This setting is separate from `command_timeout`:

- `command_timeout` is the maximum time the external ON, OFF, state, or stateless trigger process may run.
- `homekit_set_ack_timeout_ms` is the delay before Script2 can tell HomeKit that a stateful ON/OFF request was accepted even though the external process is still in progress.

For example:

```json
{
  "name": "Downtown Pause Schedules",
  "on": "/var/lib/homebridge/roborockPauseSchedules/downtown-pause-on.sh",
  "off": "/var/lib/homebridge/roborockPauseSchedules/downtown-pause-off.sh",
  "state": "/var/lib/homebridge/roborockPauseSchedules/downtown-pause-state.sh",
  "on_value": "true",
  "command_timeout": 120000,
  "homekit_set_ack_timeout_ms": 5000
}
```

With this configuration:

1. The external command may run for up to 120 seconds.
2. If it is still running after five seconds, Script2 acknowledges the HomeKit request.
3. The external command remains in flight and continues to completion; acknowledgement does not start another command or advance a queued opposite-state command.
4. Script2 defers GET and polling presentation updates during the command.
5. If the command later fails, Script2 bypasses its TTL cache, reads the authoritative state, and corrects HomeKit.

This behavior is useful when a script performs multiple external writes, validations, retries, or read-back checks and can legitimately take longer than the controller waits for a synchronous HomeKit response.

### Backward-compatible default

The default is:

```json
"homekit_set_ack_timeout_ms": 0
```

A value of `0` disables early acknowledgement. Script2 waits for the external command to finish and then invokes the HomeKit set callback with the actual success or failure, matching the behavior existing users had before this feature.

Because the default is `0`, upgrading does not opt existing accessories into optimistic acknowledgement and does not change the success meaning of their set callbacks. Users only receive the new behavior when they explicitly configure a positive delay.

### State source requirement

A positive `homekit_set_ack_timeout_ms` requires either `state` or `fileState`. Script2 needs an authoritative state source so it can correct HomeKit if an early-acknowledged command later fails. If neither state source is configured, Script2 logs a warning and disables early acknowledgement for that accessory.

### Choosing a value

- Keep `0` for short commands or when the HomeKit callback must represent confirmed external command completion.
- Use a positive value such as `5000` for long-running commands that otherwise exceed the controller's interaction window.
- Set `command_timeout` above the external command's realistic worst-case runtime. It will normally be longer than the acknowledgement delay.

## Command execution and state fixes

### Single-flight ON/OFF execution

Script2 now maintains a per-accessory set lifecycle:

- A duplicate request for the active desired state shares the pending command result instead of spawning another process.
- Adjacent duplicate queued requests are coalesced.
- Opposite-state requests remain queued until the active external command actually finishes.
- Each HomeKit callback is settled at most once, including callbacks acknowledged before command completion.
- Duplicate process-completion notifications are ignored.

### GET, polling, and stale-read protection

- HomeKit GET requests received during a set are deferred.
- Polling updates are suppressed during a set and reconciled afterward.
- Reads started before a set are prevented from publishing stale results or seeding the state cache.
- Deferred GETs remain pending across queued opposite-state commands and observe the final serialized result.
- Failed sets perform authoritative, cache-bypassing reconciliation when required.

### `fail_on_state_exit_code`

`fail_on_state_exit_code` remains independent of the two timeout settings. It controls state reads only:

- When `false` (default), Script2 can use valid stdout from a state command that exits non-zero and logs the exit as a warning.
- When `true`, a non-zero state-command exit is treated as a read failure even if stdout contains a state value.

It can be useful alongside early acknowledgement when state reconciliation should reject any non-zero state-script exit, but it does not enable or configure early HomeKit acknowledgement.

## Config UI fixes

- Adding, editing, and removing switches now updates Homebridge's in-memory plugin configuration before the outer Save action.
- The UI preserves unrelated plugin blocks and unrendered properties instead of replacing the full plugin configuration with one block.
- `command_timeout`, `homekit_set_ack_timeout_ms`, and other numeric fields are stored as numbers and validated against their configured minimums.
- Save remains disabled while configuration is invalid or synchronization is pending.
- Synchronization errors are displayed instead of silently discarding edits.

## Upgrade guidance

No configuration change is required for existing users.

For a long-running stateful switch:

1. Configure `command_timeout` above the command's worst-case runtime.
2. Confirm that `state` or `fileState` accurately reports the durable external state.
3. Opt in to early acknowledgement with a positive `homekit_set_ack_timeout_ms`, such as `5000`.
4. Leave the setting at `0` if confirmed synchronous success/failure callbacks are more important than avoiding a controller-side wait timeout.

## Functional validation

A long-running stateful switch was tested with `command_timeout: 120000` and `homekit_set_ack_timeout_ms: 5000`. The external operation completed successfully and no HomeKit switch bounce was observed.
