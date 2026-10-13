#!/usr/bin/env bash
# Source this helper, then call script2_setup_release_tools with the checkout root.
script2_setup_release_tools() {
  local script2_root="$1" script2_arch script2_digest script2_tool_root script2_gh_binary
  case "$(uname -sm)" in
    'Linux x86_64')
      script2_arch='amd64'
      script2_digest='bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386'
      ;;
    'Linux aarch64'|'Linux arm64')
      script2_arch='arm64'
      script2_digest='7862c86c72f43df3a2d93ddde6f473285b4e2af61b494849846827e513ef6484'
      ;;
    *) echo 'STOP: run this release helper on the Linux machine containing the checkout.'; return 1 ;;
  esac
  script2_tool_root="$script2_root/release-work/tools/github-cli-2.102.0"
  script2_gh_binary="$script2_tool_root/gh_2.102.0_linux_$script2_arch/bin/gh"
  mkdir -p "$script2_tool_root" "$script2_root/release-work/tmp" "$script2_root/release-work/npm-cache"
  export TMPDIR="$script2_root/release-work/tmp"
  export npm_config_cache="$script2_root/release-work/npm-cache"
  if [ ! -x "$script2_gh_binary" ]; then
    echo "Downloading GitHub CLI 2.102.0 into $script2_tool_root"
    curl --fail --location --silent --show-error \
      --output "$script2_tool_root/github-cli.tar.gz.download" \
      "https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_$script2_arch.tar.gz"
    node -e 'const fs=require("node:fs"),crypto=require("node:crypto"); const actual=crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"); if(actual!==process.argv[2])throw Error("GitHub CLI download checksum mismatch.");' \
      "$script2_tool_root/github-cli.tar.gz.download" "$script2_digest"
    mv "$script2_tool_root/github-cli.tar.gz.download" "$script2_tool_root/github-cli.tar.gz"
    tar -xzf "$script2_tool_root/github-cli.tar.gz" -C "$script2_tool_root"
  fi
  export PATH="${script2_gh_binary%/gh}:$PATH"
  gh --version
}
