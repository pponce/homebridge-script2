# Script2 1.0 beta development and release

This beta implements the platform-only certification plan. The stable latest channel must remain unchanged until the live beta trial is complete.

## Validate

Run `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run test:installed`, and `npm run check:package`. Browser checks use `npm run test:ui` with Playwright available through `SCRIPT2_BROWSER_MODULES` or normal local node_modules. CI installs its own pinned Playwright and Chromium.

Production versions are pinned in package-lock.json. The lock pins the published tarball URLs; npm ci has successfully installed these versions in GitHub Actions. Integrity metadata can be refreshed with npm on a connected host. The authoring environment blocked npm downloads and Chromium installation, so installed-package/browser results must come from CI or the maintainer's connected host. Do not interpret syntax/unit/package-content checks as a complete Homebridge installation test.

## Publish the beta from SSH

The local checkout is `~/devProjects/homebridge-script2`. Expected branch: `certification-v1-beta`. GitHub account: `pponce`; npm account: `klidec`.

Copy the complete contents of [scripts/update-and-publish-beta.txt](scripts/update-and-publish-beta.txt) into the SSH shell. It is one outer brace block with a child Bash process, `set -e`, no explicit exit command, and beginning/end output markers. Failures stop the child process while leaving the SSH session open. Review the reported status before continuing.

The helper refuses dirty/unexpected checkouts and existing release versions/tags, publishes the tested archive to npm beta, and creates a GitHub prerelease from the exact source commit using `releases/v1.0.0-beta.1.md`, attaching the tested package and both final PNG icons as release assets. Login URL/code steps can be completed in a browser on your Mac. The helper reconnects interactive commands to the SSH terminal, even though the outer wrapper reads its commands from a heredoc. npm publish uses `--auth-type=web --browser=false`: open its displayed authentication URL in your local browser and leave SSH running while npm waits. An existing npm login does not eliminate publish-time authentication; npm may alternatively request an OTP. Do not use an expired URL from a failed attempt. No running Homebridge installation is changed by publication.

If npm succeeds but GitHub fails, use the printed GitHub-only recovery command after checking for a partial release; never republish the same npm version. For subsequent betas, update package.json, package-lock.json, CHANGELOG.md, and the matching release note file together. Stable release work will change the version/channel/notes only after the beta trial.

## Preview the exact release warning

Open [releases/v1.0.0-beta.1.md](releases/v1.0.0-beta.1.md) in GitHub's rendered preview. The publishing helper passes that file directly to `gh release create --notes-file`; it does not generate a different body. The warning is also present at the top of README and under the beta CHANGELOG heading. Homebridge's own update dialog still needs a live rendering check after beta publication.

## Beta acceptance

- Back up and migrate old configuration; retain platform accessory names and bridge metadata.
- Install beta explicitly, then restart the relevant instance or child bridge.
- Verify ON/OFF, script/file state, caching/polling, and both stateless trigger directions.
- For early acknowledgement, verify a long-running success and late failure without duplicate commands.
- Confirm shutdown/restart and room/scene/automation assignments.
- Inspect the bold warning in the published GitHub prerelease and Homebridge update/changelog view.
