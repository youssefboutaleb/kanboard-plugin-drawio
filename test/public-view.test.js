'use strict';

/**
 * The public (token) task view.
 *
 * Kanboard serves the plugin's assets there but not its own: app/Template/layout.php
 * skips vendor.min.js and app.min.js when `not_editable` is set, while the
 * template:layout:{css,js,head} hooks sit outside that guard. So `KB` is undefined,
 * every Kanboard edit affordance is absent, and the plugin has to render diagrams
 * anyway — read-only, with no action it cannot back with a permission.
 *
 * The fixture is a real capture, not hand-written markup; regenerate it with
 * `bash test/capture-public-view.sh` after a Kanboard upgrade.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const SCRIPTS = ['drawio-markdown.js', 'drawio-editor.js', 'drawio-ui.js']
    .map(name => fs.readFileSync(path.join(__dirname, '..', 'Asset', 'js', name), 'utf8'));

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'public-task.html'), 'utf8');

/** The payloads Kanboard's Parsedown emitted into the captured page, in source order. */
const PAYLOADS = [...FIXTURE.matchAll(/<code class="language-diagram">([^<]*)<\/code>/g)]
    .map(match => match[1].replace(/\s+/g, ''));

/**
 * @param {object} [options]
 * @param {boolean} [options.withKanboardRuntime] define a `KB` global, to separate
 *        "no affordance because Kanboard's JS is absent" from "no affordance because
 *        Kanboard rendered no edit action".
 */
function setup(options = {}) {
    const dom = new JSDOM(FIXTURE, {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'http://kanboard.test/?controller=TaskViewController&action=readonly&task_id=1&token=PUBLIC_TOKEN'
    });

    const window = dom.window;
    const errors = [];

    window.TextDecoder = TextDecoder;
    window.TextEncoder = TextEncoder;
    window.addEventListener('error', event => errors.push(event.message));

    if (options.withKanboardRuntime) {
        window.KB = {modal: {open: () => errors.push('KB.modal.open was called')}, on: () => {}};
    }

    SCRIPTS.forEach(source => window.eval(source));

    if (window.document.readyState === 'loading') {
        window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    }

    return {window, document: window.document, errors};
}

const figures = (document) => [...document.querySelectorAll('figure.drawio-diagram')];

/* ------------------------------------------------------- the fixture itself */

test('the captured page carries the plugin and two diagrams, or the fixture is stale', () => {
    assert.strictEqual(PAYLOADS.length, 2,
        'the fixture must hold a diagram in the description and one in a comment');

    for (const asset of ['drawio-markdown.js', 'drawio-editor.js', 'drawio-ui.js', 'drawio.css']) {
        assert.ok(FIXTURE.includes('plugins/Drawio/Asset/' + (asset.endsWith('.css') ? 'css/' : 'js/') + asset),
            asset + ' is not served on the public view; layout.php may have moved the hook '
            + 'inside the `not_editable` guard, which would stop public rendering entirely');
    }

    assert.ok(FIXTURE.includes('<meta name="drawio-embed-url"'),
        'template:layout:head must render on the public view, or the front end has no configuration');
    assert.ok(!FIXTURE.includes('app.min.js'),
        'the point of this fixture is a page without Kanboard\'s own JavaScript');
});

/* ------------------------------------------------------------------ rendering */

test('diagrams render on a page that never loads Kanboard\'s JavaScript', () => {
    const {window, document, errors} = setup();

    assert.strictEqual(typeof window.KB, 'undefined');
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(
        figures(document).map(figure => figure.querySelector('img').getAttribute('src')),
        PAYLOADS.map(payload => 'data:image/svg+xml;base64,' + payload)
    );
});

test('a diagram in a public comment renders as well as one in the description', () => {
    const {document} = setup();

    assert.strictEqual(document.querySelectorAll('article.markdown figure.drawio-diagram').length, 1);
    assert.strictEqual(document.querySelectorAll('.comment-content figure.drawio-diagram').length, 1);
});

test('the fence survives rendering, so the payload is still the source of truth', () => {
    const {document} = setup();

    assert.deepStrictEqual(
        [...document.querySelectorAll('code.language-diagram')].map(code => code.textContent),
        PAYLOADS
    );
    assert.strictEqual(document.querySelectorAll('pre.drawio-diagram-source').length, 2);
});

/* --------------------------------------------------------------- affordances */

test('a public reader is offered nothing to edit', () => {
    const {document} = setup();

    // Note: the presence of an actions block is deliberately *not* asserted here. Since
    // Task 23 every diagram carries one, because looking is not editing; the property the
    // permission model guarantees is the absence of the edit link itself.
    assert.strictEqual(document.querySelectorAll('a.drawio-diagram-edit').length, 0);
    assert.strictEqual(document.querySelectorAll('a.drawio-insert-button').length, 0);
});

test('a public reader can open a diagram full size', () => {
    const {window, document} = setup();

    assert.strictEqual(document.querySelectorAll('a.drawio-diagram-view').length, 2,
        'reading is offered on every diagram, including to an anonymous visitor');

    document.querySelector('a.drawio-diagram-view').click();

    const overlay = document.querySelector('.drawio-viewer-overlay');

    assert.ok(overlay, 'the viewer needs no KB runtime');
    assert.strictEqual(typeof window.KB, 'undefined');
    assert.strictEqual(overlay.querySelector('img').getAttribute('src'),
        'data:image/svg+xml;base64,' + PAYLOADS[0]);
    assert.strictEqual(overlay.querySelector('a.drawio-diagram-edit'), null,
        'the viewer offers no way to change anything');
});

test('still nothing to edit when a KB runtime exists but Kanboard rendered no edit action', () => {
    const {document, errors} = setup({withKanboardRuntime: true});

    assert.strictEqual(document.querySelectorAll('a.js-modal-large, a.js-modal-medium').length, 0,
        'Kanboard renders no edit link for an anonymous reader');
    assert.strictEqual(figures(document).length, 2, 'the diagrams still render');
    assert.strictEqual(document.querySelectorAll('a.drawio-diagram-edit').length, 0,
        'the Edit button is borrowed from Kanboard, so no link means no button');
    assert.deepStrictEqual(errors, []);
});
