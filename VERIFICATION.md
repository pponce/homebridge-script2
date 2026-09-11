# Homebridge verification: Script2

Prepared for 1.0.0 on September 11, 2026. Verification is performed by the Homebridge team; publication of this stable release is not certification.

## Suggested submission text

Script2 provides a focused dynamic-platform workflow for running user scripts from HomeKit. Its distinguishing feature is the combination of separate command-execution and optional HomeKit-acknowledgement deadlines with per-switch duplicate suppression, serialized opposite-state actions, deferred state reads, and authoritative state reconciliation after a late failure. A long-running command can continue after HomeKit is acknowledged without being launched again; a subsequent failure bypasses the cache and uses the configured state source to correct HomeKit.

Script2 also combines script-output matching or filesystem-notification-based state with configurable state-cache lifetime, in-flight read coalescing, optional cache reset after successful actions, and a configurable policy for ordinary nonzero state-command exits. Stateless switches can trigger on either On or Off and reset without executing a second command. These behaviors are configured through a custom Homebridge settings screen, with validation before runtime activity and no terminal-dependent setup.

This is a claim about a useful combination of behaviors and settings, not a claim that basic command execution, polling, file state, or command queues are individually exclusive to Script2. Script2 is focused on switches; other plugins support accessory types and features it does not.

## Specific settings to highlight

| Setting/behavior | Why it matters |
| --- | --- |
| `command_timeout` + `homekit_set_ack_timeout_ms` | Separate execution lifetime from the optional time at which HomeKit is acknowledged; acknowledgement does not launch a duplicate operation or imply completion |
| Late-failure reconciliation | After early acknowledgement, bypass stale cache and correct HomeKit using `state` or `fileState` |
| `state_cache_ttl_ms` + in-flight read coalescing | Avoid repeated status script executions during burst HomeKit reads; coalescing still works when TTL is zero |
| `reset_state_cache_on_set` | Choose whether successful manual actions seed/restart the state cache |
| `fail_on_state_exit_code` + `on_value` | Choose whether usable stdout from an ordinary nonzero exit determines state; timeouts/termination remain failures |
| `fileState` notifications | Update HomeKit on file creation/deletion without polling a script or re-running ON/OFF actions |
| `stateless_trigger_on` + `auto_reset_ms` | Trigger on either switch edge, then reset the display without another command |
| Serialized SETs and stale-read protection | Coalesce duplicate SETs, queue opposite SETs, and keep intermediate/older state reads from overwriting a newer action |

## Comparison with related projects

These are documentation-based comparisons of the linked projects, not exhaustive claims about every fork or every plugin.

| Project | Documented overlap | Useful distinction / caveat |
| --- | --- | --- |
| [homebridge-script](https://github.com/olehmalovichko/homebridge-script) | ON/OFF scripts, stdout matching and file-existence state | These features already exist in Script2's lineage. Emphasize the newer acknowledgement/reconciliation, caching/coalescing, stateless, platform and UI behavior instead of claiming file state is new. |
| [homebridge-cmdswitch2](https://github.com/luisiam/homebridge-cmdswitch2) | ON/OFF/state commands, polling, timeouts, synchronous command queue, optional dimming | Queueing and polling alone are not unique. The reviewed README does not document Script2's two-deadline/late-failure-reconciliation combination. Cmdswitch2 also offers dimming, which Script2 does not. |
| [homebridge-cmd4](https://github.com/ztalbot2000/homebridge-cmd4) | Script control, polling, priority queues and caching/history behavior | Cmd4 covers many more accessory types. Position Script2 as a focused switch workflow and describe its specific acknowledgement/cache/reconciliation controls; do not claim Script2 is a general superset. |
| [homebridge-multiple-switch](https://github.com/azadaydinli/homebridge-multiple-switch) | Configurable virtual switches and auto-off behavior | Its documented scope is dummy switches, master/independent/single modes and defaults. Script2 executes external commands and reads external state. Multiple Switch has its own grouping and localization features. |

The current [verified registry](https://github.com/homebridge/plugins/blob/latest/verified-plugins.json), checked September 10, 2026, contains Multiple Switch, but not the exact package names homebridge-script, homebridge-cmdswitch2 or homebridge-cmd4. Similar project names alone do not establish certification equivalence. The Homebridge team makes the final determination, and the registry/capabilities should be rechecked when submitting.

## Evidence and remaining live checks

- Dynamic platform only; runtime and UI accept the two canonical lists. Missing/invalid configuration does not start commands/watchers/polling.
- No analytics/tracking call is implemented by Script2. User-configured scripts can perform their own operations; Script2 does not add telemetry.
- Plugin cache is memory-only; accessory persistence is handled by Homebridge. User-selected fileState is read/watched, not created by Script2.
- No system-modifying postinstall and no interactive plugin setup; custom UI uses the official helper package.
- Automated tests cover configuration rejection, registration/identity, command errors, callbacks, watcher events, timeouts, shutdown, and existing long-running behavior. Browser tests cover saving and migration warnings. Installed-package tests exercise the actual watcher and UI IPC.
- CI is configured for Node 22 and 24 with Homebridge 1 and 2. Confirm the CI results for the exact commit before publishing; source review alone is not an installation result.
- The maintainer should verify these behaviors on their own installation: old platform migration, standalone migration if relevant, scene/automation checks, file state, long-running actions, late failure, and Homebridge's update/changelog display. The GitHub Markdown preview shows the intended release text; it does not prove every Homebridge UI version renders it identically.

## Submit after publishing 1.0.0

Use the [official request](https://github.com/homebridge/plugins/issues/new?template=1_verification-request.yml). Enter npm package `homebridge-script2` and repository `https://github.com/pponce/homebridge-script2`. Attach [the 100 × 100 PNG](assets/homebridge-script2-icon.png). Add your actual tested Homebridge/Node versions and migration results to the text above. Do not add a verified badge until approval.
