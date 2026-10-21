# Script2 development and release

1.0.8 separates native checkbox styling from Bootstrap text fields. The theme fixture now includes the host `appearance: none` reset, and browser checks verify visible checked/unchecked image differences as well as label/keyboard interaction and saved values.

1.0.7 adds a platform-level `debug` opt-in, off by default, in both the custom UI and JSON schema. The platform logger gates every device logger while leaving Homebridge's own debug filter in control. State diagnostics distinguish exit codes, empty output, timeouts, and termination. Command outcomes and accessory identities are unchanged.

1.0.6 uses the two-argument platform registration API. The installed-package smoke check uses the real Homebridge API to verify dynamic registration, cached accessory reuse, new accessory identity, and shutdown.

1.0.5 adds PayPal funding metadata for GitHub and Homebridge UI following Homebridge verification. Runtime code and configuration are unchanged.

1.0.4 accepts exit-zero ON/OFF and stateless trigger commands that write stderr, warns in normal logs, and exposes bounded stderr text in Homebridge debug logs. The configurable nonzero state-script behavior is preserved. No configuration migration is needed from stable 1.0.x releases.

1.0.2 includes Dependabot PR #123: the development-only fast-uri lockfile entry moves to 3.1.7. The 1.0.1 schema fix remains in place; runtime behavior and dependencies are unchanged.

1.0.1 fixes configuration-schema metadata while preserving existing configurations. Runtime code and dependencies are unchanged from 1.0.0. Ajv is a pinned development dependency used to validate the schema against JSON Schema rules; it is not installed as a runtime dependency of the plugin. Publication does not imply Homebridge verification.

## Validate

Run `npm ci --include=dev --ignore-scripts`, `npm run check`, `npm test`, `npm run test:installed`, and `npm run check:package`. Browser checks use `npm run test:ui` with Playwright available through `SCRIPT2_BROWSER_MODULES` or normal local node_modules. CI installs its own pinned Playwright and Chromium, tests Node 22/24 with Homebridge 1/2, and installs the exact packed archive.

Run `python3 scripts/check-publisher.py beta` and `python3 scripts/check-publisher.py stable` to verify that both publishers reconnect terminal input/output under the SSH heredoc wrapper. These checks use a simulated npm command and never authenticate or publish.

Production versions are pinned in package-lock.json. npm ci validates the locked versions in GitHub Actions. The lock's integrity metadata can be refreshed with npm on a connected host. Live Homebridge behavior still depends on the maintainer's configured scripts and service environment.

## Publish 1.0.8 from SSH

The local checkout is `~/devProjects/homebridge-script2`. GitHub account: `pponce`; npm account: `klidec`.

After updating the checkout to `origin/master`, run `bash scripts/update-and-publish-stable.txt` from an interactive SSH terminal. The wrapper refuses dirty checkouts, updates `master` with a fast-forward, and invokes the stable publisher. It does not merge a pull request. A failure stops the child shell while leaving SSH open.

The publisher requires local `master` to match `origin/master` and refuses existing versions, tags, or releases. It validates matching package/lockfile versions, the changelog and release notes, runs the source, unit, installed-package and package-content checks, and tests the exact packed archive before publishing `homebridge-script2@1.0.8` to npm `latest`. It then creates the GitHub release from that exact source commit using [releases/v1.0.8.md](releases/v1.0.8.md), attaching the archive and both PNG icons.

Git operations use the repository's SSH remote. GitHub API authentication uses the GitHub CLI, and `GH_BROWSER=echo` displays its authentication URL. npm uses `--browser=false`: open the displayed authentication URL in your local browser and leave SSH running while npm waits. Interactive commands reconnect to the controlling terminal even when the wrapper reads commands from a heredoc.

Release work stays inside the ignored `release-work/` directory. [release-tools.sh](scripts/release-tools.sh) supplies a checksum-verified GitHub CLI, npm cache and temporary directories. Authentication uses the standard GitHub/npm credential settings.

If npm succeeds but GitHub fails, inspect for a partial release and use the printed GitHub-only recovery command if the release is absent. Never publish the same npm version again. The helper verifies the release body and npm's `latest` tag. It does not install the plugin into Homebridge.

## Donation links

`.github/FUNDING.yml` supplies the repository's Sponsor button. The `funding` metadata in `package.json` supplies the Donate button for the verified plugin in Homebridge UI and is also mirrored in the lockfile's root package. Changes to that metadata reach users through a new npm release.

PayPal currently uses `https://paypal.me/pponcedeleon`. Once GitHub Sponsors approval is complete and the profile is live, add `github: pponce` to `.github/FUNDING.yml` and a second funding entry with type `github` and URL `https://github.com/sponsors/pponce` to the package metadata.

## Release warnings

The current release notes and changelog first state that 1.0.x users can update without configuration changes or migration. A separate warning explicitly applies only to upgrades from versions before 1.0.0; retain the backup instruction and migration link in that section. The same normal-upgrade guidance applies to 1.0.0-beta.1. Homebridge's Release Notes tab obtains the published GitHub release body; its separate Changelog tab may obtain the tagged or installed CHANGELOG.md. Updating a branch file alone does not rewrite either an existing GitHub release body or an already-published npm archive.

Historical 1.0.1–1.0.3 notes used an enlarged general warning. From 1.0.4 onward, make the affected upgrade path explicit instead of presenting that warning to every user.

## Future beta releases

The older [beta publisher](scripts/publish-beta.sh) and [SSH wrapper](scripts/update-and-publish-beta.txt) remain available for the certification-v1-beta branch. They reject stable metadata. Before using them again, set a new beta version in package.json/package-lock.json, set publishConfig.tag to beta, and add the matching release notes/changelog. Do not reuse 1.0.0-beta.1.

## Installation checks

- Back up and migrate old configuration; retain platform accessory names and bridge metadata.
- Install the intended version, then restart the relevant instance or child bridge.
- Verify ON/OFF, script/file state, caching/polling, and both stateless trigger directions.
- For early acknowledgement, verify a long-running success and late failure without duplicate commands.
- Confirm shutdown/restart and room/scene/automation assignments.
- Inspect the warning in Homebridge's Release Notes and Changelog tabs.

