# Script2 development and release

1.0.4 accepts exit-zero ON/OFF and stateless trigger commands that write stderr, warns in normal logs, and exposes bounded stderr text in Homebridge debug logs. The configurable nonzero state-script behavior is preserved. No configuration migration is needed from stable 1.0.x releases.

1.0.2 includes Dependabot PR #123: the development-only fast-uri lockfile entry moves to 3.1.7. The 1.0.1 schema fix remains in place; runtime behavior and dependencies are unchanged.

1.0.1 fixes configuration-schema metadata while preserving existing configurations. Runtime code and dependencies are unchanged from 1.0.0. Ajv is a pinned development dependency used to validate the schema against JSON Schema rules; it is not installed as a runtime dependency of the plugin. Publication does not imply Homebridge verification.

## Validate

Run `npm ci --include=dev --ignore-scripts`, `npm run check`, `npm test`, `npm run test:installed`, and `npm run check:package`. Browser checks use `npm run test:ui` with Playwright available through `SCRIPT2_BROWSER_MODULES` or normal local node_modules. CI installs its own pinned Playwright and Chromium, tests Node 22/24 with Homebridge 1/2, and installs the exact packed archive.

Run `python3 scripts/check-publisher.py beta` and `python3 scripts/check-publisher.py stable` to verify that both publishers reconnect terminal input/output under the SSH heredoc wrapper. These checks use a simulated npm command and never authenticate or publish.

Production versions are pinned in package-lock.json. npm ci validates the locked versions in GitHub Actions. The lock's integrity metadata can be refreshed with npm on a connected host. Live Homebridge behavior still depends on the maintainer's configured scripts and service environment.

## Publish 1.0.4 from SSH

The local checkout is `~/devProjects/homebridge-script2`. The stable publisher requires `master` to match `origin/master`. GitHub account: `pponce`; npm account: `klidec`.

Use the complete bootstrap block supplied in the maintainer conversation to fetch the prepared tools and [update wrapper](scripts/update-and-publish-stable.txt) over SSH into `release-work/bootstrap/`. It uses one outer brace block, a child Bash process, `set -e`, and beginning/end output markers. A failure stops the child process while leaving SSH open. Review the reported status before continuing.

The complete release block supplied in the maintainer conversation fetches the prepared source over SSH, loads the release tools and update wrapper from that commit, waits for PR #126 checks, and merges the prepared head before publishing.

The helper refuses dirty/unexpected checkouts and existing versions/tags. It validates matching package/lockfile versions, a versioned changelog entry and release notes, packs a source snapshot, installs and tests the exact archive, then publishes `homebridge-script2@1.0.4` to npm `latest`. It creates a normal GitHub release marked latest from the exact source commit, using [releases/v1.0.4.md](releases/v1.0.4.md), with the archive and both final PNG icons attached. The publisher checks the official release body against the notes file and verifies npm's latest tag.

Git fetch/pull/tag operations use the repository's SSH remote. Creating the official GitHub release still requires GitHub API authentication: the publisher tests actual API access and starts the browser/device-code login when necessary, instead of relying only on `gh auth status`. Environment token overrides are cleared in the child shell; `GH_BROWSER=echo` displays the browser URL for manual opening.

All release work is contained in `~/devProjects/homebridge-script2/release-work/`, which is ignored by Git. The tools helper downloads the official GitHub CLI 2.102.0 Linux archive into `release-work/tools/`, verifies its published SHA-256 digest, and selects that binary for this release process. Build snapshots, package archives, and test installs are under `release-work/1.0.4/`; npm's cache and subprocess temporary files are under `release-work/npm-cache/` and `release-work/tmp/`. Authentication uses the standard GitHub/npm credential settings.

Interactive commands reconnect to the controlling SSH terminal even though the outer wrapper reads commands from a heredoc. npm uses `--browser=false` for login and publish: open the displayed authentication URL in your local browser and leave SSH running while npm waits. An existing npm login does not eliminate publish-time authentication. A failed attempt's URL should not be reused.

If npm succeeds but GitHub fails, inspect for a partial release and use the printed GitHub-only recovery command if the release is absent. Never publish the same npm version again. The helper does not install the plugin into the running Homebridge instance.

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

