#!/usr/bin/env bash
#
# Agentic verification pipeline. Run this before declaring any task complete.
#
# The plugin has no PHP dependencies and no build step, so the pipeline is short:
# lint both languages, run the suite, and check the couplings that no test can see
# because they live in Plugin.php's string literals.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "======================================================"
echo " 🤖 Running Agentic Automated Verification Pipeline"
echo "======================================================"

FAILED=0

echo "--> [1/6] Checking JavaScript syntax..."
if command -v node >/dev/null 2>&1; then
    for file in Asset/js/*.js; do
        node --check "${file}"
    done
    echo "✔ JavaScript syntax OK"
else
    echo "✖ Node is required to work on this plugin" >&2
    exit 1
fi

echo "--> [2/6] Checking PHP syntax..."
if command -v php >/dev/null 2>&1; then
    find . -name '*.php' -not -path './node_modules/*' -exec php -l {} \; \
        | grep -v "No syntax errors detected" || true
    echo "✔ PHP syntax OK (host)"
elif command -v docker >/dev/null 2>&1; then
    docker run --rm -v "$(pwd)":/app -w /app php:8.1-cli \
        sh -c "find . -name '*.php' -not -path './node_modules/*' -exec php -l {} \;" \
        | grep -v "No syntax errors detected" || true
    echo "✔ PHP syntax OK (docker)"
else
    echo "⚠️  Neither PHP nor Docker found; skipping the PHP lint."
fi

echo "--> [3/6] Checking embed-origin parsing..."
# The origin ends up in the CSP and is what every incoming postMessage is
# checked against, so it gets its own guard rather than riding on the PHP lint.
if ! bash test/embed-origin.sh; then
    echo "✖ Embed-origin parsing is wrong" >&2
    FAILED=1
fi

echo "--> [4/6] Running the test suite..."
if [ ! -d node_modules ]; then
    echo "    installing dev dependencies..."
    npm install --no-audit --no-fund --silent
fi
npm test --silent
echo "✔ Test suite passed"

echo "--> [5/6] Checking asset registration..."
# Every script and stylesheet on disk must be attached in Plugin.php, and every
# path attached in Plugin.php must exist. A mismatch is invisible at runtime:
# Kanboard's asset helper would fatal on filemtime(), or the file would simply
# never load.
for file in Asset/js/*.js Asset/css/*.css; do
    if ! grep -q "plugins/Drawio/${file}" Plugin.php; then
        echo "✖ ${file} exists but is not attached in Plugin.php" >&2
        FAILED=1
    fi
done

grep -o "plugins/Drawio/[A-Za-z0-9/._-]*" Plugin.php | sed 's|plugins/Drawio/||' | while read -r path; do
    if [ ! -f "${path}" ]; then
        echo "✖ Plugin.php attaches ${path}, which does not exist" >&2
        exit 1
    fi
done

if [ ! -f "Template/layout/config.php" ]; then
    echo "✖ Template/layout/config.php is missing; the front end has no configuration" >&2
    FAILED=1
fi
[ "${FAILED}" -eq 0 ] && echo "✔ Assets and templates registered consistently"

echo "--> [6/6] Checking the integrity rules that cannot be unit-tested..."
# No inline <script> or <style>: Kanboard's CSP is default-src 'self' with no
# script-src exception, so an inline block is silently refused by the browser.
# `code_lines` drops comment lines and prose in backticks so that documenting a
# rule does not trip the check enforcing it.
code_lines() {
    grep -rnE "$2" "$1" 2>/dev/null | grep -vE ":[[:space:]]*(\*|//|#)" | grep -v '`' || true
}

if [ -n "$(code_lines Template/ '<script|<style')" ]; then
    code_lines Template/ '<script|<style' >&2
    echo "✖ Inline <script>/<style> in a template; CSP refuses it (use <meta> or data-*)" >&2
    FAILED=1
fi

# The Markdown is the only storage: no schema, no migration, no route.
if [ -d "Schema" ]; then
    echo "✖ A Schema/ directory exists; this plugin must not own storage" >&2
    FAILED=1
fi

if grep -q "addRoute" Plugin.php; then
    echo "✖ Plugin.php declares a route; adding an endpoint needs an ADR first" >&2
    FAILED=1
fi

# Payloads reach the page only through an <img> data: URI.
if [ -n "$(code_lines Asset/js/ 'innerHTML|outerHTML|insertAdjacentHTML')" ]; then
    code_lines Asset/js/ 'innerHTML|outerHTML|insertAdjacentHTML' >&2
    echo "✖ HTML string injection in Asset/js/; build DOM with createElement instead" >&2
    FAILED=1
fi

if [ "${FAILED}" -ne 0 ]; then
    echo "======================================================"
    echo " ✖ Verification FAILED"
    echo "======================================================"
    exit 1
fi

echo "✔ Integrity rules OK"
echo "======================================================"
echo " 🎉 Agentic Verification Pipeline Complete!"
echo "======================================================"
