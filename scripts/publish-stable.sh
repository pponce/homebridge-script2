#!/usr/bin/env bash
# Run as a child shell: bash scripts/publish-stable.sh (do not source).
set -e
set -o pipefail
script2_repo='pponce/homebridge-script2'
script2_branch='master'
script2_registry='https://registry.npmjs.org/'
export GH_HOST=github.com
unset GH_TOKEN GITHUB_TOKEN GH_PROMPT_DISABLED
export GH_BROWSER=echo
# The SSH wrapper reads its program from a heredoc. Reconnect interactive
# commands to the terminal so npm can wait for browser authentication.
if ! ( : </dev/tty ) 2>/dev/null; then
  echo 'STOP: run this publisher from an interactive SSH terminal (ssh -t when needed).'
  false
fi
script2_interactive() { "$@" </dev/tty >/dev/tty; }
for script2_tool in git node npm tar curl; do command -v "$script2_tool" >/dev/null; done
script2_project_root="$(git rev-parse --show-toplevel)"
cd "$script2_project_root"
if [ "$(git branch --show-current)" != "$script2_branch" ]; then echo 'STOP: switch to master first.'; false; fi
if [ -n "$(git status --porcelain)" ]; then echo 'STOP: commit or move local changes before publishing.'; false; fi
case "$(git remote get-url origin)" in
  git@github.com:pponce/homebridge-script2.git|https://github.com/pponce/homebridge-script2.git|https://github.com/pponce/homebridge-script2|ssh://git@github.com/pponce/homebridge-script2.git) ;;
  *) echo 'STOP: unexpected origin repository.'; false ;;
esac
git remote set-url origin git@github.com:pponce/homebridge-script2.git
. "$script2_project_root/scripts/release-tools.sh"
script2_setup_release_tools "$script2_project_root"
git fetch origin "$script2_branch"
script2_source="$(git rev-parse HEAD)"
if [ "$script2_source" != "$(git rev-parse "origin/$script2_branch")" ]; then echo 'STOP: local branch must match its remote commit.'; false; fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!((a===22&&b>=13)||a===24||a===26))throw Error("Use Node 22.13+ within Node 22, Node 24, or Node 26.");'
script2_gh_user="$(gh api user --jq .login 2>/dev/null || true)"
if [ "$script2_gh_user" != 'pponce' ]; then
  echo 'GitHub API login is needed to verify and download the official release.'
  echo 'Open the displayed URL in your browser, enter the displayed code, and authenticate as pponce.'
  script2_interactive gh auth login --hostname github.com --git-protocol ssh --web --skip-ssh-key
fi
script2_gh_user="$(gh api user --jq .login)"
if [ "$script2_gh_user" != 'pponce' ]; then echo 'STOP: GitHub account must be pponce.'; false; fi
script2_npm_user="$(npm whoami --registry="$script2_registry" 2>/dev/null || true)"
if [ "$script2_npm_user" != 'klidec' ]; then
  echo 'Log in as klidec. Open the displayed URL on your Mac if requested.'
  script2_interactive npm login --auth-type=web --browser=false --registry="$script2_registry"
fi
script2_npm_user="$(npm whoami --registry="$script2_registry")"
if [ "$script2_npm_user" != 'klidec' ]; then echo 'STOP: npm account must be klidec.'; false; fi
mkdir -p "$script2_project_root/release-work/1.0.11"
script2_work="$(mktemp -d "$script2_project_root/release-work/1.0.11/build-XXXXXX")"
echo "Source commit: $script2_source"
echo "Accounts verified: GitHub $script2_gh_user; npm $script2_npm_user"
echo "Release work directory: $script2_work"
git archive "$script2_source" | tar -x -C "$script2_work"
git fetch origin "refs/tags/v1.0.11:refs/tags/v1.0.11"
if [ "$(git rev-parse 'v1.0.11^{commit}')" != "$script2_source" ]; then echo 'STOP: release tag does not match the source commit.'; false; fi
cd "$script2_work"
node -e 'const p=require("./package.json");if(p.name!=="homebridge-script2"||p.version!=="1.0.11"||p.publishConfig?.tag!=="latest")throw Error("Expected Script2 1.0.11 stable metadata.");'
script2_version="$(node -p 'require("./package.json").version')"
script2_tag="v$script2_version"
script2_notes="releases/$script2_tag.md"
test -s "$script2_notes"
node -e 'const fs=require("fs"),p=require("./package.json"),lock=require("./package-lock.json");if(lock.version!==p.version||lock.packages[""].version!==p.version)throw Error("Package and lockfile versions differ.");if(!fs.readFileSync("CHANGELOG.md","utf8").includes(`## ${p.version} —`))throw Error("Versioned changelog entry is missing.");if(!fs.readFileSync(`releases/v${p.version}.md`,"utf8").startsWith(`# Script2 ${p.version}\n`))throw Error("Release notes version does not match.");'
gh api "repos/$script2_repo/releases/tags/$script2_tag" > github-release.json
node -e 'const fs=require("fs"),p=require("./package.json"),r=require("./github-release.json"),notes=fs.readFileSync(`releases/v${p.version}.md`,"utf8");if(r.draft||r.prerelease||r.tag_name!==`v${p.version}`||r.target_commitish!==process.argv[1]||r.body.trim()!==notes.trim())throw Error("GitHub release must match the checked source commit and notes.");' "$script2_source"
npm view homebridge-script2 versions --json --prefer-online --registry="$script2_registry" > published-versions.json
node -e 'const p=require("./package.json"),v=require("./published-versions.json");if(!Array.isArray(v)||v.includes(p.version))throw Error("Version already published or unexpected registry response. Do not republish an existing version.");'
npm view homebridge-script2 dist-tags.latest --registry="$script2_registry" > stable-before.txt

echo '===== VERIFY STABLE RELEASE ====='
npm ci --include=dev --ignore-scripts --registry="$script2_registry"
npm run check
npm test
npm run test:installed
npm run check:package
script2_archive="homebridge-script2-$script2_version.tgz"
gh release download "$script2_tag" --repo "$script2_repo" --pattern "$script2_archive" --dir "$script2_work"
node scripts/check-release-archive.cjs github-release.json "$script2_archive" "$script2_source"
# Install the exact archive into a clean directory, then run packaged watcher/UI tests there.
mkdir smoke
npm install --prefix smoke --ignore-scripts --package-lock=false --registry="$script2_registry" "$script2_work/$script2_archive"
SCRIPT2_PACKAGE_ROOT="$script2_work/smoke/node_modules/homebridge-script2" node --test test/installed.cjs

echo '===== PUBLISH NPM STABLE ====='
echo 'If npm displays an authentication URL, open it in your local browser and complete authentication.'
echo 'Keep this SSH session running; npm will wait and resume after approval.'
script2_interactive npm publish "./$script2_archive" --ignore-scripts --access public --tag latest --auth-type=web --browser=false --registry="$script2_registry"
echo "Published homebridge-script2@$script2_version as $script2_npm_user under latest."
echo "GitHub release: https://github.com/$script2_repo/releases/tag/$script2_tag"
script2_latest=''
for script2_attempt in {1..12}; do
  script2_latest="$(npm view homebridge-script2 dist-tags.latest --prefer-online --registry="$script2_registry" 2>/dev/null || true)"
  if [ "$script2_latest" = "$script2_version" ]; then break; fi
  if [ "$script2_attempt" -lt 12 ]; then
    echo 'Waiting for npm latest to reflect the new publication...'
    sleep 5
  fi
done
if [ "$script2_latest" != "$script2_version" ]; then
  echo "STOP: publication completed, but npm latest reports $script2_latest; expected $script2_version. Check dist-tags; do not republish."
  false
fi
echo "Stable release is ready: homebridge-script2@$script2_version (latest)."
echo "GitHub: https://github.com/$script2_repo/releases/tag/$script2_tag"
echo 'Install/update Script2 in Homebridge UI, then restart its instance or child bridge.'


