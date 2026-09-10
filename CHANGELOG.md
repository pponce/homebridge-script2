# Changelog

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
