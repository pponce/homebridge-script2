# Script2 development and release

1.0.0 promotes the platform-only implementation from 1.0.0-beta.1 to stable. Runtime code and dependencies are unchanged from the beta; stable metadata, migration documentation, warning presentation, and publishing tooling are updated. Publication does not imply Homebridge verification.

## Validate

Run `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run test:installed`, and `npm run check:package`. Browser checks use `npm run test:ui` with Playwright available through `SCRIPT2_BROWSER_MODULES` or normal local node_modules. CI installs its own pinned Playwright and Chromium, tests Node 22/24 with Homebridge 1/2, and installs the exact packed archive.

Run `python3 scripts/check-publisher.py beta` and `python3 scripts/check-publisher.py stable` to verify that both publishers reconnect terminal input/output under the SSH heredoc wrapper. These checks use a simulated npm command and never authenticate or publish.

Production versions are pinned in package-lock.json. npm ci has successfully installed these versions in GitHub Actions. The lock's integrity metadata can be refreshed with npm on a connected host. Live Homebridge behavior still depends on the maintainer's configured scripts and service environment.

## Publish 1.0.0 from SSH

The local checkout is `~/devProjects/homebridge-script2`. The stable publisher requires `master` to match `origin/master`. GitHub account: `pponce`; npm account: `klidec`.

Copy the complete contents of [scripts/update-and-publish-stable.txt](scripts/update-and-publish-stable.txt) into the SSH shell. It uses one outer brace block, a child Bash process, `set -e`, and beginning/end output markers. A failure stops the child process while leaving SSH open. Review the reported status before continuing.

The helper refuses dirty/unexpected checkouts and existing versions/tags. It validates and packs a source snapshot, installs and tests the exact archive, then publishes `homebridge-script2@1.0.0` to npm `latest`. It creates a normal GitHub release marked latest from the exact source commit, using [releases/v1.0.0.md](releases/v1.0.0.md), with the archive and both final PNG icons attached.

Interactive commands reconnect to the controlling SSH terminal even though the outer wrapper reads commands from a heredoc. npm uses `--browser=false`: open the displayed authentication URL in your local browser and leave SSH running while npm waits. An existing npm login does not eliminate publish-time authentication. A failed attempt's URL should not be reused.

If npm succeeds but GitHub fails, inspect for a partial release and use the printed GitHub-only recovery command if the release is absent. Never publish the same npm version again. The helper does not install the plugin into the running Homebridge instance.

## Release warnings

The release notes and changelog use a large Markdown heading with a warning symbol and bold backup instruction. Homebridge's Release Notes tab obtains the published GitHub release body; its separate Changelog tab may obtain the tagged or installed CHANGELOG.md. Updating a branch file alone does not rewrite either an existing GitHub release body or an already-published npm archive.

The 1.0.0 archive includes the enlarged changelog warning. Keep it prominent in future 1.0 release notes while users are migrating from pre-1.0 configurations.

## Future beta releases

The older [beta publisher](scripts/publish-beta.sh) and [SSH wrapper](scripts/update-and-publish-beta.txt) remain available for the certification-v1-beta branch. They reject stable metadata. Before using them again, set a new beta version in package.json/package-lock.json, set publishConfig.tag to beta, and add the matching release notes/changelog. Do not reuse 1.0.0-beta.1.

## Installation checks

- Back up and migrate old configuration; retain platform accessory names and bridge metadata.
- Install the intended version, then restart the relevant instance or child bridge.
- Verify ON/OFF, script/file state, caching/polling, and both stateless trigger directions.
- For early acknowledgement, verify a long-running success and late failure without duplicate commands.
- Confirm shutdown/restart and room/scene/automation assignments.
- Inspect the warning in Homebridge's Release Notes and Changelog tabs.
