#!/usr/bin/env bash
#
# Build the distributable Kanboard plugin archive.
#
# The archive is an ALLOW-LIST, not a deny-list. An exclude-based copy ships every
# file nobody thought to exclude — CLAUDE.md, AGENTS.md, agent scratch notes and
# node_modules all reach end users that way. With an allow-list, a new file in the
# repository root cannot silently end up in a release.
#
# ARCHIVE SHAPE: Kanboard extracts straight into plugins/, and
# Core\Plugin\Installer::update() reads statIndex(0) to learn which directory to
# remove before reinstalling. Everything must therefore live under a single
# top-level directory named exactly after the plugin, and that directory must be
# the archive's first entry.
set -euo pipefail

cd "$(dirname "$0")/.."

PLUGIN_NAME="Drawio"

# Plugin.php::getPluginVersion() is the single source of truth for the release
# version. package.json is a test harness manifest and is never packaged.
VERSION=$(sed -n "/function getPluginVersion/,/}/s/.*return '\([^']*\)'.*/\1/p" Plugin.php | head -1)

if [ -z "${VERSION}" ]; then
    echo "✖ Unable to read the version from Plugin.php::getPluginVersion()" >&2
    exit 1
fi

DIST_DIR="dist"
ARCHIVE_NAME="${DIST_DIR}/${PLUGIN_NAME}-${VERSION}.zip"

# Exactly what a Kanboard installation needs at runtime, plus the legal and
# user-facing files a public release is expected to carry. Anything not named
# here does not ship.
PAYLOAD=(
    "Plugin.php"
    "Template"
    "Asset"
    "LICENSE"
    "README.md"
    "CHANGELOG.md"
)

# Files that must never reach an end user, checked for after staging so a rename
# or a new agent-scratch file fails the build instead of shipping.
FORBIDDEN=(
    "CLAUDE.md" "AGENTS.md" "ARCHITECTURE.md" "package.json" "package-lock.json"
    "node_modules" "test" "docs" "scripts" ".github" ".agents"
)

echo "======================================================"
echo " 📦 Packaging Kanboard Plugin: ${PLUGIN_NAME} (v${VERSION})"
echo "======================================================"

# A release is never built from a red suite. The Markdown a user already has is at
# stake, and the tokenizer is the part that decides which bytes get rewritten.
echo "--> Running the test suite..."
if command -v npm >/dev/null 2>&1; then
    npm test --silent
    echo "✔ Test suite passed"
else
    echo "✖ npm not found; refusing to package without a green suite" >&2
    exit 1
fi

# CHANGELOG.md must know about the version being released, or the release notes
# and the directory listing disagree the moment they are published.
if ! grep -q "${VERSION}" CHANGELOG.md; then
    echo "✖ CHANGELOG.md has no entry for ${VERSION}" >&2
    exit 1
fi

mkdir -p "${DIST_DIR}"
rm -f "${ARCHIVE_NAME}"

STAGE_DIR=$(mktemp -d)
trap 'rm -rf "${STAGE_DIR}"' EXIT
TARGET_DIR="${STAGE_DIR}/${PLUGIN_NAME}"
mkdir -p "${TARGET_DIR}"

for item in "${PAYLOAD[@]}"; do
    if [ ! -e "${item}" ]; then
        echo "✖ Required payload entry missing: ${item}" >&2
        exit 1
    fi
    cp -R "${item}" "${TARGET_DIR}/"
done

# Strip anything that rode in inside a copied directory (editor backups, caches,
# stray VCS metadata).
find "${TARGET_DIR}" \( -name '.git*' -o -name '.DS_Store' -o -name '*.log' \
    -o -name 'node_modules' \) -prune -exec rm -rf {} + 2>/dev/null || true

for forbidden in "${FORBIDDEN[@]}"; do
    if [ -e "${TARGET_DIR}/${forbidden}" ]; then
        echo "✖ Development file leaked into the package: ${forbidden}" >&2
        exit 1
    fi
done

# The three scripts are loaded in a fixed order by Plugin.php; a missing one is a
# silently broken install rather than a visible failure.
for asset in \
    "Asset/js/drawio-markdown.js" \
    "Asset/js/drawio-editor.js" \
    "Asset/js/drawio-ui.js" \
    "Asset/css/drawio.css" \
    "Template/layout/config.php"
do
    if [ ! -f "${TARGET_DIR}/${asset}" ]; then
        echo "✖ Packaged plugin is missing ${asset}" >&2
        exit 1
    fi
done

( cd "${STAGE_DIR}" && zip -rq "${PLUGIN_NAME}-${VERSION}.zip" "${PLUGIN_NAME}" )
mv "${STAGE_DIR}/${PLUGIN_NAME}-${VERSION}.zip" "${ARCHIVE_NAME}"

# Installer::update() takes statIndex(0) as the directory to replace; if the
# archive did not start with our folder it would delete the wrong thing.
# `| head -1` would SIGPIPE unzip and trip `set -o pipefail`, so read the full
# listing and take the first line with a pure-shell parameter expansion.
ARCHIVE_ENTRIES=$(unzip -Z1 "${ARCHIVE_NAME}")
FIRST_ENTRY=${ARCHIVE_ENTRIES%%$'\n'*}
if [ "${FIRST_ENTRY}" != "${PLUGIN_NAME}/" ] && [ "${FIRST_ENTRY}" != "${PLUGIN_NAME}" ]; then
    echo "✖ First archive entry is '${FIRST_ENTRY}', expected '${PLUGIN_NAME}/'" >&2
    exit 1
fi

echo "✔ Plugin package created: ${ARCHIVE_NAME} ($(du -h "${ARCHIVE_NAME}" | cut -f1))"
echo "  Root entry : ${FIRST_ENTRY}"
echo "  Files      : $(printf '%s\n' "${ARCHIVE_ENTRIES}" | wc -l)"
echo
echo "  Next: update docs/kanboard-directory-submission.md (version, download URL,"
echo "        last_updated) before opening the plugins.json pull request."
