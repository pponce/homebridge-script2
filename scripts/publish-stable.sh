#!/usr/bin/env bash
# Run as a child shell: bash scripts/publish-stable.sh (do not source).
set -e
set -o pipefail
script2_repo='pponce/homebridge-script2'
script2_branch='master'
script2_registry='https://registry.npmjs.org/'
export GH_HOST=github.com
# The SSH wrapper reads its program from a heredoc. Reconnect interactive
# commands to the terminal so npm can wait for browser authentication.
if ! ( : </dev/tty ) 2>/dev/null; then
  echo 'STOP: run this publisher from an interactive SSH terminal (ssh -t when needed).'
  false
fi
script2_interactive() { "$@" </dev/tty >/dev/tty; }
for script2_tool in git node npm tar gh; do command -v "$script2_tool" >/dev/null; done
cd "$(git rev-parse --show-toplevel)"
if [ "$(git branch --show-current)" != "$script2_branch" ]; then echo 'STOP: switch to master first.'; false; fi
if [ -n "$(git status --porcelain)" ]; then echo 'STOP: commit or move local changes before publishing.'; false; fi
case "$(git remote get-url origin)" in
  git@github.com:pponce/homebridge-script2.git|https://github.com/pponce/homebridge-script2.git|https://github.com/pponce/homebridge-script2|ssh://git@github.com/pponce/homebridge-script2.git) ;;
  *) echo 'STOP: unexpected origin repository.'; false ;;
esac
git fetch origin "$script2_branch"
script2_source="$(git rev-parse HEAD)"
if [ "$script2_source" != "$(git rev-parse "origin/$script2_branch")" ]; then echo 'STOP: local branch must match its remote commit.'; false; fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!((a===22&&b>=13)||a===24))throw Error("Use Node 22.13+ within Node 22, or Node 24.");'
if ! gh auth status --hostname github.com >/dev/null 2>&1; then script2_interactive gh auth login --hostname github.com --git-protocol ssh --web --skip-ssh-key; fi
script2_gh_user="$(gh api user --jq .login)"
if [ "$script2_gh_user" != 'pponce' ]; then echo 'STOP: GitHub account must be pponce.'; false; fi
script2_npm_user="$(npm whoami --registry="$script2_registry" 2>/dev/null || true)"
if [ "$script2_npm_user" != 'klidec' ]; then
  echo 'Log in as klidec. Open the displayed URL on your Mac if requested.'
  script2_interactive npm login --auth-type=web --browser=false --registry="$script2_registry"
fi
script2_npm_user="$(npm whoami --registry="$script2_registry")"
if [ "$script2_npm_user" != 'klidec' ]; then echo 'STOP: npm account must be klidec.'; false; fi
script2_work="$(mktemp -d "${TMPDIR:-/tmp}/script2-stable.XXXXXX")"
echo "Source commit: $script2_source"
echo "Accounts verified: GitHub $script2_gh_user; npm $script2_npm_user"
echo "Release work directory: $script2_work"
git archive "$script2_source" | tar -x -C "$script2_work"
git ls-remote --tags origin > "$script2_work/remote-tags.txt"
cd "$script2_work"
node -e 'const p=require("./package.json");if(p.name!=="homebridge-script2"||p.version!=="1.0.1"||p.publishConfig?.tag!=="latest")throw Error("Expected Script2 1.0.1 stable metadata.");'
script2_version="$(node -p 'require("./package.json").version')"
script2_tag="v$script2_version"
script2_notes="releases/$script2_tag.md"
test -s "$script2_notes"
node -e 'const fs=require("fs"),p=require("./package.json");if(fs.readFileSync("remote-tags.txt","utf8").split("\n").some(l=>l.split(/\s+/)[1]===`refs/tags/v${p.version}`))throw Error("Tag already exists; it will not be moved.");'
gh api "repos/$script2_repo/releases?per_page=100" --paginate --jq '.[].tag_name' > github-releases.txt
node -e 'const fs=require("fs"),p=require("./package.json");if(fs.readFileSync("github-releases.txt","utf8").split("\n").includes(`v${p.version}`))throw Error("GitHub release already exists.");'
npm view homebridge-script2 versions --json --registry="$script2_registry" > published-versions.json
node -e 'const p=require("./package.json"),v=require("./published-versions.json");if(!Array.isArray(v)||v.includes(p.version))throw Error("Version already published or unexpected registry response. Do not republish an existing version.");'
npm view homebridge-script2 dist-tags.latest --registry="$script2_registry" > stable-before.txt

echo '===== VERIFY STABLE RELEASE ====='
npm ci --include=dev --ignore-scripts --registry="$script2_registry"
npm run check
npm test
npm run test:installed
npm run check:package
npm pack --ignore-scripts --json > packed.json
script2_archive="$(node -p 'require("./packed.json")[0].filename')"
test -s "$script2_archive"
# Install the exact archive into a clean directory, then run packaged watcher/UI tests there.
mkdir smoke
npm install --prefix smoke --ignore-scripts --package-lock=false --registry="$script2_registry" "$script2_work/$script2_archive"
SCRIPT2_PACKAGE_ROOT="$script2_work/smoke/node_modules/homebridge-script2" node --test test/installed.cjs

echo '===== PUBLISH NPM STABLE ====='
echo 'If npm displays an authentication URL, open it in your local browser and complete authentication.'
echo 'Keep this SSH session running; npm will wait and resume after approval.'
script2_interactive npm publish "./$script2_archive" --ignore-scripts --access public --tag latest --auth-type=web --browser=false --registry="$script2_registry"
echo "Published homebridge-script2@$script2_version as $script2_npm_user under latest."
echo '===== CREATE GITHUB RELEASE ====='
if gh release create "$script2_tag" "$script2_archive" assets/homebridge-script2-icon.png assets/homebridge-script2-icon-512.png --repo "$script2_repo" --target "$script2_source" --title "Script2 $script2_version" --notes-file "$script2_notes" --latest=true; then
  echo "GitHub release: https://github.com/$script2_repo/releases/tag/$script2_tag"
else
  echo 'NPM SUCCEEDED; GITHUB RELEASE DID NOT FINISH. Inspect for a partial release. If absent, retry only:'
  printf 'gh release create %q %q %q %q --repo %q --target %q --title %q --notes-file %q --latest=true\n' "$script2_tag" "$script2_work/$script2_archive" "$script2_work/assets/homebridge-script2-icon.png" "$script2_work/assets/homebridge-script2-icon-512.png" "$script2_repo" "$script2_source" "Script2 $script2_version" "$script2_work/$script2_notes"
  echo 'Do not publish the same npm version again.'
  false
fi
npm view homebridge-script2 dist-tags.latest --registry="$script2_registry" > stable-after.txt
if [ "$(cat stable-after.txt)" != "$script2_version" ]; then
  echo 'STOP: npm latest does not point to 1.0.1; inspect npm dist-tags before continuing.'
  false
fi
echo "Stable release is ready: homebridge-script2@$script2_version (latest)."
echo "GitHub: https://github.com/$script2_repo/releases/tag/$script2_tag"
echo 'Homebridge review: https://github.com/homebridge/plugins/issues/new/choose'
echo 'Install/update Script2 in Homebridge UI, then restart its instance or child bridge.'
