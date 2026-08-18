'use strict';

/**
 * Release metadata agreement.
 *
 * `Plugin::getPluginVersion()` is the single source of truth (AGENTS.md §3.4), and three
 * other files repeat what it says: CHANGELOG.md, package.json, and the plugins.json entry
 * in the submission dossier. A stale copy is not cosmetic — Kanboard's installer compares
 * the directory's `version` against the installed one to decide whether to offer an
 * update, so a wrong number in the dossier means users are never prompted.
 *
 * This is the release re-diff that used to be done by reading, done by the suite instead.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PLUGIN_PHP = read('Plugin.php');
const DOSSIER = read('docs/kanboard-directory-submission.md');
const CHANGELOG = read('CHANGELOG.md');
const PACKAGE = JSON.parse(read('package.json'));

/** The `return '…';` of a Plugin.php getter. */
function getter(name) {
    const match = new RegExp('function ' + name + '\\(\\)\\s*\\{\\s*return\\s*\'([^\']*)\'', 'm').exec(PLUGIN_PHP);
    assert.ok(match, 'Plugin.php has no simple ' + name + '() to read');
    return match[1];
}

/** The single ```json block of the dossier: the suggested plugins.json entry. */
const ENTRY = (() => {
    const match = /```json\n([\s\S]*?)```/.exec(DOSSIER);
    assert.ok(match, 'the dossier no longer carries a ```json entry');
    // The block is indented as it would appear inside plugins.json, and holds a trailing
    // comma for the same reason, so it is not a standalone document until wrapped.
    return JSON.parse('{' + match[1].trim().replace(/,$/, '') + '}').Drawio;
})();

const VERSION = getter('getPluginVersion');

/* ------------------------------------------------------------------ the entry */

test('the dossier entry has exactly the fifteen fields of the live schema, in order', () => {
    const fields = Object.keys(ENTRY);

    assert.deepStrictEqual(fields, [
        'author', 'compatible_version', 'description', 'download', 'has_hooks',
        'has_overrides', 'has_schema', 'homepage', 'is_type', 'last_updated',
        'license', 'readme', 'remote_install', 'title', 'version'
    ], 'fields must match kanboard/website plugins.json, alphabetically');
});

test('the entry agrees with Plugin.php', () => {
    assert.strictEqual(ENTRY.version, VERSION);
    assert.strictEqual(ENTRY.author, getter('getPluginAuthor'));
    assert.strictEqual(ENTRY.homepage, getter('getPluginHomepage'));
    assert.strictEqual(ENTRY.compatible_version, getter('getCompatibleVersion'));
});

test('the entry claims only what the plugin actually is', () => {
    assert.strictEqual(ENTRY.is_type, 'plugin');
    assert.strictEqual(ENTRY.has_schema, false, 'the Markdown field is the only storage');
    assert.strictEqual(ENTRY.has_hooks, true);
    assert.strictEqual(ENTRY.remote_install, true, 'the download is a purpose-built asset');
    assert.ok(!fs.existsSync(path.join(root, 'Schema')), 'a Schema/ directory would make has_schema a lie');
});

test('last_updated is an ISO date', () => {
    assert.match(ENTRY.last_updated, /^\d{4}-\d{2}-\d{2}$/);
});

/* ----------------------------------------------------------------- the version */

test('every file that repeats the version agrees with Plugin.php', () => {
    assert.strictEqual(PACKAGE.version, VERSION, 'package.json');
    assert.ok(CHANGELOG.includes('## ' + VERSION + ' — '),
        'CHANGELOG.md has no "## ' + VERSION + '" section');
});

test('the download URL points at the asset this version packages', () => {
    assert.strictEqual(
        ENTRY.download,
        ENTRY.homepage + '/releases/download/v' + VERSION + '/Drawio-' + VERSION + '.zip',
        'the download must be the release asset built by scripts/package-plugin.sh'
    );
    assert.ok(DOSSIER.includes(ENTRY.download), 'the dossier quotes a different URL in §8');
});

test('the readme URL points at this repository on its default branch', () => {
    assert.strictEqual(ENTRY.readme, ENTRY.homepage + '/blob/main/README.md');
});
