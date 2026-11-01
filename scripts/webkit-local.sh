#!/usr/bin/env bash
# Lets Playwright's WebKit run on a host that lacks a few of its libraries and has no sudo (T45):
# downloads them from the distribution's archive into ~/.cache/pencils-webkit-deps and links them
# into the WebKit bundle, whose launcher only searches its own folders. Run it again after
# Playwright updates WebKit. `npx playwright test --project=ios` then runs the phone and iPad tests.
set -euo pipefail
deps="$HOME/.cache/pencils-webkit-deps"
mkdir -p "$deps/debs" "$deps/root"
(cd "$deps/debs" && apt-get download libmanette-0.2-0 libwoff1 libhidapi-hidraw0)
for deb in "$deps"/debs/*.deb; do dpkg -x "$deb" "$deps/root"; done
shopt -s nullglob
bundles=("$HOME"/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib)
[ ${#bundles[@]} -gt 0 ] || { echo "No Playwright WebKit found: run npx playwright install webkit first." >&2; exit 1; }
for lib in "${bundles[@]}"; do
  for so in "$deps"/root/usr/lib/x86_64-linux-gnu/*.so*; do
    target="$lib/$(basename "$so")"
    [ -e "$target" ] || [ -L "$target" ] || ln -s "$so" "$target"
  done
done
echo "WebKit libraries linked into: $(ls -d "$HOME"/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib)"
