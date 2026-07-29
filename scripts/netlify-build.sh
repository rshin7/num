#!/usr/bin/env bash

set -euo pipefail

dotnet_dir="$PWD/.dotnet"

has_dotnet_10() {
  command -v dotnet >/dev/null 2>&1 && dotnet --list-sdks | awk '$1 ~ /^10\./ { found = 1 } END { exit !found }'
}

if ! has_dotnet_10; then
  curl --fail --silent --show-error --location https://dot.net/v1/dotnet-install.sh --output /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 10.0 --install-dir "$dotnet_dir" --no-path
  export PATH="$dotnet_dir:$PATH"
fi

npm run build
