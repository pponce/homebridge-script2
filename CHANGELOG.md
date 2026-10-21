# Changelog

## 1.0.7 — 2026-10-21

**Users on version 1.0.x can update normally. No configuration migration is required. This also applies to 1.0.0-beta.1.**

**Script2 debug logging now defaults to off.** Enable the new **Enable debug logging** checkbox as well as Homebridge/child bridge debug mode (`-D`) to see Script2 troubleshooting details.

### ⚠️ Upgrading from a version before 1.0.0

**Only these older versions require migration. Back up your Homebridge config.json before updating, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md).** Legacy Script2 accessory mode and old platform configuration formats are no longer supported.

### Debug control and accurate diagnostics

- Add a platform-wide **Enable debug logging** checkbox below **Platform name**, off by default. Save and restart the instance or child bridge to apply it.
- Allow `-D` to stay enabled while Script2 debug output is suppressed. Normal informational messages, warnings, and errors remain visible.
- Replace the unconditional `state command returned output` message with the actual exit code and whether trimmed state output is present or empty.
- Identify timeouts and termination explicitly. Explain discarded partial output without incorrectly claiming that strict nonzero-exit handling is enabled.
- Point stderr warnings to both required debug settings. Continue omitting raw command text and stdout.
- Cover debug gating, settings persistence, empty output, failure diagnostics, and real command timeouts in regression checks.

Command behavior, accessory identities, and the configurable nonzero state-exit policy are unchanged.

[Full 1.0.7 release notes](releases/v1.0.7.md)

## 1.0.6 — 2026-10-18

**Users on version 1.0.x can update normally. No configuration changes or migration are required. This also applies to 1.0.0-beta.1.**

### ⚠️ Upgrading from a version before 1.0.0

**Only these older versions require migration. Back up your Homebridge config.json before updating, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md).** Legacy Script2 accessory mode and old platform configuration formats are no longer supported.

### Platform registration

- Use Homebridge's supported two-argument platform registration API, following the optional suggestion in [the verification review](https://github.com/homebridge/plugins/issues/1218#issuecomment-6250513303).
- Preserve the Script2 platform name, plugin identifier, accessory UUIDs, and command behavior.
- Exercise the real Homebridge registration API in startup checks, including restoration of a cached accessory and creation of a new accessory.

[Full 1.0.6 release notes](releases/v1.0.6.md)

## 1.0.5 — 2026-10-18

**Users on version 1.0.x can update normally. No configuration changes or migration are required. This also applies to 1.0.0-beta.1.**

### ⚠️ Upgrading from a version before 1.0.0

**Only these older versions require migration. Back up your Homebridge config.json before updating, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md).** Legacy Script2 accessory mode and old platform configuration formats are no longer supported.

### Donations and verification

- Add optional PayPal donations through the Homebridge UI's **Donate** button.
- Add PayPal to the GitHub repository's **Sponsor** button.
- Include the **Verified by Homebridge** README badge following verification of Script2.

This release changes donation metadata and documentation. Plugin behavior and configuration are unchanged.

[Full 1.0.5 release notes](releases/v1.0.5.md)

## 1.0.4 — 2026-10-13

**Users on version 1.0.x can update normally. No configuration changes or migration are required. This also applies to 1.0.0-beta.1.**

### ⚠️ Upgrading from a version before 1.0.0

**Only these older versions require migration. Back up your Homebridge config.json before updating, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md).** Legacy Script2 accessory mode and old platform configuration formats are no longer supported.

### Successful commands with stderr

- Treat ON/OFF and stateless trigger commands that exit `0` as successful when they write stderr, including switches using a state file (issue #125).
- Log a warning when stderr is present and show bounded, escaped stderr text in Homebridge debug logs. Ordinary logs continue to omit script output.
- Preserve action failures for nonzero exits and execution errors, and keep the configurable nonzero state-script policy from issue #29.

Debug stderr may include sensitive script output. Remove secrets before sharing logs.

### Update

Select **1.0.4** / **latest** in Homebridge UI and restart the instance or child bridge running Script2.

[Full 1.0.4 release notes](releases/v1.0.4.md)

## 1.0.3 — 2026-09-11

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**For users upgrading from versions before 1.0.0: legacy Script2 accessory mode and old platform configuration formats are no longer supported. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

**Already using a stable 1.0.x release or 1.0.0-beta.1? No configuration changes or additional migration are required.**

## Night-theme visibility

- Fix custom settings text, fields, help, tables, buttons, and borders in Homebridge night mode.
- Follow Homebridge's selected theme even when the operating system uses a different appearance.
- Add browser checks for theme switching, contrast, and mobile layout.

Configuration and device-control behavior are unchanged.

## Update

Select **1.0.3** / **latest** in Homebridge UI and restart the instance or child bridge running Script2.

[Full 1.0.3 release notes](releases/v1.0.3.md)

## 1.0.2 — 2026-09-11

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**For users upgrading from versions before 1.0.0: legacy Script2 accessory mode and old platform configuration formats are no longer supported. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

**No configuration changes are required when upgrading from 1.0.0, 1.0.1, or 1.0.0-beta.1.**

- Update the development-only fast-uri lockfile entry from 3.0.1 to 3.1.7 through Dependabot PR [#123](https://github.com/pponce/homebridge-script2/pull/123), incorporating upstream security fixes.
- Keep the 1.0.1 schema fix and README improvements. Runtime behavior and dependencies are unchanged.

[Full 1.0.2 release notes](releases/v1.0.2.md)

## 1.0.1 — 2026-09-11

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**For users upgrading from versions before 1.0.0: legacy Script2 accessory mode and old platform configuration formats are no longer supported. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

**No configuration changes are required when upgrading from 1.0.0 or 1.0.0-beta.1.**

- Fix invalid boolean `required` keywords in config.schema.json; require `platform` using the main object's required array.
- Preserve the optional platform display name and all existing switch requirements.
- Add JSON Schema validation and regression tests for existing configurations and the reported schema error. The validator is a development dependency only.
- Keep the large pre-1.0 migration warning in release notes and changelog.
- Reorganize the README into one quick start, linked sections, a minimal example, a settings reference with timing units, and advanced behavior notes. Preserve the FAQ, top icon, and original-plugin reference at the bottom.

[Full 1.0.1 release notes](releases/v1.0.1.md)

## 1.0.0 — 2026-09-11

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**Version 1.0.0 removes legacy Script2 accessory mode and old platform configuration formats. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

- Promote the 1.0.0-beta.1 implementation to the stable `latest` channel. Existing beta users do not need another configuration migration.
- Use the modern platform-only settings editor with complete advanced controls and validation.
- Include the beta's command, callback, watcher, shutdown, and stateless reliability fixes.
- Preserve command serialization, shared reads, caching, and optional early HomeKit acknowledgement with late-failure reconciliation.
- Display the large migration warning in both release notes and the changelog in Homebridge.
- Include certification icons and the migration guide. Homebridge verification remains pending.

[Full 1.0.0 release notes](releases/v1.0.0.md)

## 1.0.0-beta.1

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**This beta removes legacy Script2 accessory mode and old platform configuration formats. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/certification-v1-beta/MIGRATION.md). Legacy configurations will no longer run.**

- Platform-only configuration using on_off_switches and stateless_switches; old registration and configuration aliases removed.
- Modern custom settings UI with complete advanced options, validation, and serialized saving.
- Fix file-state command feedback, command/callback/watcher error handling, shutdown, stateless duplicate execution, and zero reset delay.
- Keep long-running command acknowledgement, reconciliation, and caching behavior; timeout/terminated state reads now always fail.
- Omit raw command/output diagnostics; add certification icon, migration guide, verification comparison, package checks, and beta publishing helper.
- Require Node 22.13+ within Node 22 or Node 24; Homebridge 1.8+ within v1 or v2.
- Beta channel only; stable latest is unchanged.

[Full beta release notes](releases/v1.0.0-beta.1.md)

## 0.4.6

- Added optional early HomeKit acknowledgement for long-running commands, serialized and coalesced SET requests, deferred state reads, and custom UI saving fixes.
- See [published release notes](https://github.com/pponce/homebridge-script2/releases/tag/v0.4.6) for the original release history.

