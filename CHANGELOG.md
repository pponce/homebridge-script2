# Changelog

## 1.0.1 — 2026-09-11

# ⚠️ **BREAKING CHANGE — BACK UP YOUR CONFIGURATION BEFORE UPDATING.**

**For users upgrading from versions before 1.0.0: legacy Script2 accessory mode and old platform configuration formats are no longer supported. Review and save a copy of your current Homebridge config.json before installing, then follow the [migration guide](https://github.com/pponce/homebridge-script2/blob/master/MIGRATION.md). Legacy configurations will no longer run.**

**No configuration changes are required when upgrading from 1.0.0 or 1.0.0-beta.1.**

- Fix invalid boolean `required` keywords in config.schema.json; require `platform` using the main object's required array.
- Preserve the optional platform display name and all existing switch requirements.
- Add JSON Schema validation and regression tests for existing configurations and the reported schema error. The validator is a development dependency only.
- Keep the large pre-1.0 migration warning in release notes and changelog.
- Show the asset icon above the README title and move the original-plugin reference to the bottom.

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
