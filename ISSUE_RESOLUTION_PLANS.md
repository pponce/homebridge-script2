# Issue resolution plans

This document records proposed work only. It is intended to preserve the investigation context and acceptance criteria before implementation begins.

## 1. Transient HomeKit state bounce during long-running ON/OFF commands

### Problem statement

An `on_off_switches` accessory can run ON and OFF commands that legitimately take longer than Script2's default 10-second `command_timeout`. The Home tile may consequently show `ON -> OFF -> ON` or `OFF -> ON -> OFF`, even though the backend eventually reaches the requested durable state.

There are two credible and independent causes:

1. The set command exceeds the default timeout, so Script2 reports an error to HomeKit before the external operation finishes.
2. A GET or polling state read reports the old durable state while a successful set is still running, and that stale result is applied to HomeKit.

### Phase 1: confirm the production trigger

1. Temporarily configure the affected accessory with `"command_timeout": 120000`.
2. Add timestamped debug diagnostics for the requested value, command start, configured timeout, command completion, elapsed time, error/timeout/signal details, stdout/stderr, cache changes, HomeKit callback, GETs, polls, and characteristic updates.
3. Reproduce ON and OFF operations and determine whether the reversal previously occurred at approximately 10 seconds.
4. Treat the timeout as confirmed only if the larger value removes the observed reversal or the logs directly show timeout failure.
5. Avoid logging secrets without redaction: command strings and process output may contain credentials.

### Phase 2: align configuration and documentation

`command_timeout` already exists in the current platform schema, legacy schema, custom UI, sanitizer flow, and runtime. The remaining work is to audit those paths and align their contract rather than add the field from scratch.

1. Add `command_timeout` to the README tables for stateful and stateless switches, `LEGACY.md`, and representative examples.
2. Document that the timeout applies to ON, OFF, state, and stateless trigger commands and defaults to 10000 ms.
3. Define one validation contract across runtime and schemas. Prefer a finite positive integer; either retain the schema's 100 ms minimum everywhere or remove that arbitrary difference.
4. Fall back to 10000 ms with a warning for invalid runtime values.
5. State explicitly whether there is no configured maximum.
6. Add schema, sanitizer, and runtime validation tests, including fractional, non-finite, zero, negative, below-minimum, and valid values.

### Phase 3: serialize set operations

Add per-accessory set lifecycle state containing at least the requested state, start time, and generation.

Recommended initial policy:

1. Run at most one ON/OFF command per accessory at a time.
2. Serialize subsequent requests instead of overlapping or silently cancelling a command that has started.
3. Coalesce queued requests for the same state where callback behavior remains unambiguous.
4. Preserve ordering for opposite-state requests.
5. Resolve every HomeKit callback exactly once and document the policy.

Serialization is preferred initially over last-write-wins supersession because the external commands can perform multi-step durable operations that are unsafe to interrupt conceptually.

### Phase 4: make reads generation-safe

1. Capture the current set generation whenever a state read begins.
2. Do not allow a polling or GET result from an older generation to update `currentState`, the state cache, or the HomeKit characteristic.
3. While a set is active, suppress polling characteristic updates and record that one post-set reconciliation is required.
4. Coalesce HomeKit GET requests received during a set rather than repeatedly running the state command.
5. After the set settles, perform one authoritative read and resolve queued GET callbacks exactly once.
6. Ensure the authoritative read bypasses or invalidates any pre-set TTL cache entry.
7. Apply equivalent reconciliation semantics to state-command and `fileState` accessories.

Generation checks are required in addition to a simple `inFlightSet` check because a read started before the set can finish after the set has completed.

### Phase 5: define completion and cache behavior

After successful command completion:

1. Confirm the result belongs to the latest accepted set generation.
2. Update `currentState` and the HomeKit characteristic to the requested state.
3. When `reset_state_cache_on_set` is enabled for a state-command accessory, seed the cache with the requested state.
4. Clear the active set and run the queued authoritative reconciliation.
5. Release/coalesce waiting GET callbacks from that reconciliation.

After failure or timeout:

1. Do not seed the desired state.
2. Clear the active set without losing the original failure.
3. Reconcile from the authoritative state source and update HomeKit to the actual state.
4. Report the original set failure exactly once, even if reconciliation also fails.

Separately decide and test whether successful commands that write warnings to stderr should remain fatal. The current behavior treats any stderr as a set failure, which is stricter than ordinary process exit semantics and should not change accidentally.

### Phase 6: deterministic timeout cleanup

Extract command execution into a focused runner rather than placing process-management logic directly in `setState()`.

1. Record timeout, elapsed time, exit code, and signal explicitly.
2. On supported Unix systems, launch and terminate a managed process group rather than only the immediate shell.
3. Attempt graceful termination, escalate to force-kill after a bounded delay, and wait for termination before settling.
4. Define platform-specific behavior for Windows.
5. Handle plugin shutdown while commands and callbacks are pending.
6. Document that deliberately detached descendants may escape a process group; scope guarantees to the managed process tree/group.

### Regression tests

- Long-running command completes within its configured timeout while an intermediate poll reports the old state.
- Default timeout remains 10000 ms and a timeout neither seeds the desired cache state nor invokes the callback twice.
- A configured 120000 ms timeout reaches every applicable command path.
- Polling cannot apply the old state during an active set and causes one post-set reconciliation.
- Multiple GETs during a set are coalesced and resolve once.
- Reads started before a set cannot overwrite the completed state or cache.
- Failed sets reconcile to the actual state without seeding the requested value.
- A timed-out managed child process tree is terminated without a delayed state change.
- Concurrent same-state and opposite-state sets obey the documented serialization policy.
- Successful stderr behavior matches the explicitly selected policy.
- Existing TTL, GET coalescing, reset-on-set, startup polling, non-zero state exit, and `fileState` behavior remains covered.
- Tests use fake timers or short fixtures rather than real 15- or 120-second waits.

### Acceptance criteria

- A successful long-running set within its configured timeout does not visibly revert to the old state.
- Old polling and GET results cannot overwrite a newer set generation.
- Opposite commands never overlap for one accessory.
- A timeout reliably terminates the managed process tree/group on supported platforms.
- Failed commands reconcile to actual state without seeding desired state.
- `command_timeout` is consistently validated and documented for all command types.
- Logs distinguish timeout, HomeKit GET, polling, TTL cache, GET coalescing, set suppression, and post-set reconciliation.

## 2. Homebridge custom UI changes are not persisted

### Observed behavior

- Adding an ON/OFF switch in the custom UI and saving restarts the child bridge, but no accessory is created.
- Editing `command_timeout` and saving restarts the child bridge, but the value is not written to Homebridge configuration.
- A manually added `"command_timeout": 120000` can disappear from `config.json` when the child bridge is restarted through the UI.

### Primary root-cause finding

The custom UI mutates only its local `state` object as fields are edited. It defines a `save()` function that builds the new plugin configuration, calls `homebridge.updatePluginConfig()`, and then calls `homebridge.savePluginConfig()`. However, nothing invokes that function:

- the HTML contains no custom Save button;
- `save()` is not registered as an event handler;
- the script ends by calling only `load()`.

The Homebridge UI's outer Save action can therefore restart the child bridge while saving the last configuration known to Homebridge. The locally edited arrays were never synchronized through `updatePluginConfig()`, explaining both reported symptoms.

The newly reported removal of a manually added value strengthens this explanation **when the restart is initiated by the UI's Save/restart flow**. A custom UI session may still hold the older configuration snapshot loaded before the manual edit. Saving that stale in-memory configuration can overwrite the manual disk edit and then restart the child bridge, making the restart appear to have removed the property. The restart itself is unlikely to be the writer: Script2's runtime reads `command_timeout` from the supplied device config and contains no code that writes Homebridge's `config.json`. The only configuration-writing calls in this repository are in the custom UI's currently uninvoked `save()` function.

This distinction must be tested explicitly. If `command_timeout` also disappears after a plain child-bridge restart that was initiated outside the plugin configuration editor and did not save configuration, the working theory is incomplete. In that case, capture the file modification time and Homebridge logs to identify which Homebridge process or UI action rewrote the file before changing Script2 code.

This is the strongest code-supported cause. It should still be reproduced against the target Homebridge UI version before implementation, with browser console and Homebridge logs captured to rule out a second error.

### Resolution plan

#### Phase 1: reproduce and instrument

1. Reproduce add, edit, and remove operations in the same Homebridge/child-bridge setup.
2. Inspect browser console errors and the values returned by `getPluginConfig()` and `updatePluginConfig()`.
3. Confirm that the current dead `save()` function is never called when the outer Save button is selected.
4. Compare the in-memory plugin config immediately before saving with the resulting `config.json` block.
5. Verify behavior when there is one Script2 platform block, no existing block, and any legacy accessory blocks.
6. Separate and record these two restart paths:
   - Save in the plugin UI and accept its child-bridge restart.
   - Restart the child bridge directly without opening or saving the plugin UI.
7. Before each path, close all plugin config dialogs, add `"command_timeout": 120000` directly to `config.json`, and record a backup, checksum, and modification time.
8. After each path, diff the complete Script2 config block—not only the timeout field—and correlate the write time with Homebridge UI and child-bridge logs.
9. Repeat once with the config UI opened before the manual edit and once with it opened afterward to test the stale-snapshot overwrite hypothesis.

#### Phase 2: synchronize edits through the supported API

1. Introduce one `buildPluginConfig()` function that immutably converts UI state into the complete plugin configuration array.
2. Preserve unrelated plugin blocks returned by `getPluginConfig()`; do not replace the full array with `[next]`, because `updatePluginConfig()` expects the complete list and omitted blocks are removed.
3. Call `homebridge.updatePluginConfig(fullConfig)` whenever a valid user change occurs, using a short debounce for text input.
4. Synchronize additions, removals, text changes, and select changes through the same path.
5. Let Homebridge's outer Save button perform persistence/restart after the in-memory config has been updated. Do not call `savePluginConfig()` for every keystroke.
6. If the product instead chooses an explicit custom Apply/Save button, render and wire that button visibly and avoid competing save semantics. Continuous `updatePluginConfig()` synchronization is preferred because it matches the custom UI API guidance and outer Save workflow.
7. Treat the object returned by the most recent `getPluginConfig()`/`updatePluginConfig()` call as the synchronization baseline; never publish a snapshot known to predate an external config edit.
8. Detect an external configuration change while the editor is open if the Homebridge UI API provides a notification. If it does not, reload immediately before an explicit custom Apply operation and report a conflict instead of silently overwriting newer disk state.

#### Phase 3: validation and typing

1. Prevent invalid UI state from being synchronized, and visibly disable Homebridge's Save control when supported by the API.
2. Re-enable saving as soon as validation passes.
3. Convert numeric inputs such as `command_timeout` and `auto_reset_ms` to numbers before updating config; do not persist them as strings.
4. Render numeric fields as `type="number"` with schema-consistent bounds.
5. Preserve boolean and enum types and do not silently discard advanced properties that the compact custom UI does not render.
6. Display synchronization errors in the UI and retain unsaved local edits so the user can retry.

#### Phase 4: initialization and multi-block safety

1. Wait for the custom UI ready lifecycle before loading configuration if required by the supported API version.
2. Select the intended `Script2Platform` block without discarding other Script2 platform or legacy accessory blocks.
3. Define behavior if multiple `Script2Platform` blocks unexpectedly exist despite the singular schema setting: either edit a selected block or block with an actionable error.
4. For a new installation, construct a complete platform block with `platform`, `name`, and device arrays.
5. Clone arrays/objects loaded from Homebridge so local mutation does not alias API-owned data.

#### Phase 5: automated and manual regression coverage

Add a browser-DOM test harness with a mocked `homebridge` API and verify:

- initial configuration loads and renders;
- adding a valid ON/OFF switch calls `updatePluginConfig()` with the new entry;
- editing `command_timeout` calls it with a numeric value;
- a manually configured `command_timeout` survives an ordinary child-bridge restart;
- a stale UI session cannot silently overwrite a newer manual `command_timeout` value;
- removing a switch updates the correct array;
- stateless and legacy edits are persisted;
- unrelated config blocks and unknown properties are retained;
- invalid forms do not publish malformed config;
- rapid typing is debounced but the final value is not lost if Save is clicked immediately;
- API rejection is shown and can be retried;
- no direct disk save or restart occurs on each keystroke.

Then manually verify in a real Homebridge UI that:

1. Add/save writes the switch into `config.json` and creates it after restart.
2. Edit/save writes `command_timeout` as an integer and the runtime receives it.
3. Remove/save removes the intended accessory.
4. Cancel/close without outer Save does not persist changes to disk.
5. Child-bridge restart occurs only as part of the expected Homebridge save flow.
6. A direct child-bridge restart with no config save leaves the `config.json` checksum and `command_timeout` unchanged.
7. Opening the UI before an external edit cannot later erase that edit without a visible conflict or deliberate user choice.

### Acceptance criteria

- Every valid custom UI edit is synchronized to Homebridge's in-memory plugin configuration before the outer Save action.
- Adding, editing, and removing all supported switch types survives save and reload.
- `command_timeout` is stored as a JSON number and reaches runtime configuration.
- Manually configured, schema-valid properties survive direct child-bridge restarts and cannot be silently erased by stale UI state.
- Existing unrelated blocks and unrendered properties are preserved.
- Invalid configuration cannot be silently saved.
- Save/synchronization failures are visible and do not discard the user's local edits.
- Automated tests cover configuration construction, preservation, validation, typing, and synchronization timing.

## 3. Duplicate and overlapping HomeKit set commands

### Problem statement

Repeated HomeKit set events can arrive before an ON/OFF command completes. Starting a new process for every duplicate event can run the same script concurrently, while allowing opposite ON/OFF scripts to overlap can leave the external device in an undefined state.

### Selected behavior

1. Maintain one per-accessory `inFlightSet` record with its requested state and all callbacks waiting for that result.
2. If the same state is requested while that command is active and no opposite request is already queued, attach the new callback to the active result without starting another command.
3. Serialize an opposite-state request behind the active command.
4. Coalesce adjacent queued requests for the same state.
5. Preserve ordering when requests alternate; for example, an ON request received after a queued OFF request remains behind that OFF request rather than incorrectly joining the earlier active ON operation.
6. Clear the completed in-flight record before invoking HomeKit callbacks, start at most one queued command, and ignore a duplicate executor completion.
7. Settle every coalesced callback exactly once with the shared command result.
8. Keep `bindServices()` idempotent by removing previous `set` and `get` listeners before registering one handler of each type.
9. Do not initiate any new set operation from an error callback path.

### Regression coverage

- Two simultaneous ON requests execute the ON command once and both callbacks receive the same success.
- Two simultaneous ON requests execute the ON command once and both callbacks receive the same failure.
- ON followed by OFF executes serially with no process overlap.
- A duplicate executor completion cannot invoke a HomeKit callback twice.
- Binding the same accessory services repeatedly leaves exactly one `set` handler and one `get` handler.

### Acceptance criteria

- One non-duplicate HomeKit set request invokes one ON/OFF command.
- Duplicate requests for the active desired state share its pending result when no intervening opposite request changes ordering.
- No two ON/OFF commands overlap for one accessory.
- Callback or executor error handling cannot recursively start a duplicate command.
- Each request callback is invoked exactly once.
