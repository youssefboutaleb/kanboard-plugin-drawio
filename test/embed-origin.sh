#!/usr/bin/env bash
#
# Runs test/embed-origin.test.php once per case, because DRAWIO_EMBED_URL is a
# constant and cannot be redefined within a process.
set -uo pipefail

cd "$(dirname "$0")/.."

PHP_CMD=${PHP_CMD:-php}
if ! command -v "${PHP_CMD}" >/dev/null 2>&1; then
    if command -v docker >/dev/null 2>&1; then
        PHP_CMD="docker run --rm -v $(pwd):/app -w /app php:8.1-cli php"
    else
        echo "ℹ️  Neither PHP nor Docker found; skipping the embed-origin checks."
        exit 0
    fi
fi

# url | expected origin
CASES=(
    "|https://embed.diagrams.net"
    "https://embed.diagrams.net/|https://embed.diagrams.net"
    "https://drawio.internal.example:8443/webapp/|https://drawio.internal.example:8443"
    "http://drawio.lan/|http://drawio.lan"
    "https://drawio.example.com|https://drawio.example.com"
    "/drawio/|"
    "drawio/|"
    "|https://embed.diagrams.net"
)

FAILED=0
for case in "${CASES[@]}"; do
    url=${case%%|*}
    expected=${case#*|}

    if ${PHP_CMD} test/embed-origin.test.php "${url}" "${expected}"; then
        printf '  ✔ %-45s → %s\n' "${url:-(default)}" "${expected:-(same origin, no CSP entry)}"
    else
        FAILED=1
    fi
done

exit "${FAILED}"
