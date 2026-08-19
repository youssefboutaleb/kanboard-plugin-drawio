'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const SCRIPTS = ['drawio-markdown.js', 'drawio-editor.js', 'drawio-ui.js']
    .map(name => fs.readFileSync(path.join(__dirname, '..', 'Asset', 'js', name), 'utf8'));

const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`;
const b64 = (text) => Buffer.from(text).toString('base64');

const A = b64(svg('A'));
const B = b64(svg('B'));
const C = b64(svg('C'));

const META = [
    '<meta name="drawio-embed-url" content="https://embed.diagrams.net/">',
    '<meta name="drawio-max-payload" content="55000">',
    '<meta name="drawio-label-edit" content="Edit diagram">',
    '<meta name="drawio-label-insert" content="Insert diagram">'
].join('');

/** A rendered ```diagram block, as Kanboard's Parsedown emits it. */
const block = (payload) => `<pre><code class="language-diagram">${payload}</code></pre>`;

/** The markup Kanboard's text-editor component builds around a Markdown field. */
const editor = (value) => `
    <div class="text-editor">
        <div class="text-editor-view-mode">
            <div class="text-editor-toolbar"><a href="#">write</a></div>
            <div class="text-editor-preview-area markdown"></div>
        </div>
        <div class="text-editor-write-mode">
            <div class="text-editor-toolbar"><a href="#">preview</a></div>
            <textarea name="description">${value}</textarea>
        </div>
    </div>`;

function setup(body) {
    const dom = new JSDOM(
        `<!doctype html><html><head>${META}</head><body>${body}</body></html>`,
        {runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://kanboard.test/'}
    );

    const window = dom.window;

    window.TextDecoder = TextDecoder;
    window.TextEncoder = TextEncoder;

    const modalOpens = [];
    const listeners = {};

    window.KB = {
        modal: {open: (url, size) => modalOpens.push({url, size})},
        on: (name, callback) => {
            listeners[name] = listeners[name] || [];
            listeners[name].push(callback);
        }
    };

    SCRIPTS.forEach(source => window.eval(source));

    if (window.document.readyState === 'loading') {
        window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    }

    /* Stand in for draw.io: capture what the editor was opened with and let the
     * test decide what comes back. */
    const opened = [];
    window.KBDrawioEditor = {
        open: (options) => opened.push(options),
        isOpen: () => false
    };

    const trigger = (name) => (listeners[name] || []).forEach(callback => callback());
    const frame = () => new Promise(resolve => window.requestAnimationFrame(() => setImmediate(resolve)));

    return {dom, window, document: window.document, opened, modalOpens, trigger, frame};
}

const figures = (document) => [...document.querySelectorAll('figure.drawio-diagram')];
const sources = (figure) => figure.querySelector('img').getAttribute('src');

/* ------------------------------------------------------------------ rendering */

test('a diagram block becomes an image and the payload is hidden, not removed', () => {
    const {document} = setup(`<article class="markdown">${block(A)}</article>`);
    const [figure] = figures(document);

    assert.strictEqual(sources(figure), 'data:image/svg+xml;base64,' + A);
    assert.strictEqual(document.querySelector('code.language-diagram').textContent, A,
        'the fence stays in the DOM as the source the editor reads back');
    assert.ok(document.querySelector('pre').classList.contains('drawio-diagram-source'));
});

test('several diagrams render in source order', () => {
    const {document} = setup(`<article class="markdown">${block(A)}<p>x</p>${block(B)}</article>`);

    assert.deepStrictEqual(figures(document).map(sources), [
        'data:image/svg+xml;base64,' + A,
        'data:image/svg+xml;base64,' + B
    ]);
});

test('a payload that is not a diagram is reported instead of rendered', () => {
    const {document} = setup(`<article class="markdown">${block('not base64!')}</article>`);

    assert.strictEqual(figures(document).length, 0);
    assert.ok(document.querySelector('pre').hasAttribute('data-drawio-error'));
});

test('rendering never injects the payload as markup', () => {
    const hostile = b64('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>x()</script></svg>');
    const {document} = setup(`<article class="markdown">${block(hostile)}</article>`);
    const [figure] = figures(document);

    assert.strictEqual(figure.querySelector('svg'), null);
    assert.strictEqual(figure.querySelector('script'), null);
    assert.ok(sources(figure).startsWith('data:image/svg+xml;base64,'));
});

test('content added later is rendered too', async () => {
    const context = setup('<div id="host"></div>');

    context.document.getElementById('host').innerHTML =
        `<div class="markdown">${block(A)}</div>`;

    await context.frame();

    assert.strictEqual(figures(context.document).length, 1);
});

/* --------------------------------------------------------------- permissions */

test('no Kanboard edit action means no Edit button', () => {
    const {document} = setup(`
        <section id="task-view">
            <div class="sidebar"><ul><li><a href="/task/1">Summary</a></li></ul></div>
            <div class="sidebar-content"><article class="markdown">${block(A)}</article></div>
        </section>`);

    assert.strictEqual(figures(document).length, 1);
    assert.strictEqual(document.querySelector('.drawio-diagram-edit'), null);
});

test('a task description borrows the sidebar edit action', () => {
    const context = setup(`
        <section id="task-view">
            <div class="sidebar"><ul><li><a href="/task/1/edit" class="js-modal-large">Edit the task</a></li></ul></div>
            <div class="sidebar-content"><article class="markdown">${block(A)}</article></div>
        </section>`);

    context.document.querySelector('.drawio-diagram-edit').click();

    assert.deepStrictEqual(context.modalOpens, [{url: '/task/1/edit', size: 'large'}]);
});

test('a comment borrows its own edit action', () => {
    const context = setup(`
        <section id="task-view">
            <div class="sidebar"><ul><li><a href="/task/1/edit" class="js-modal-large">Edit the task</a></li></ul></div>
            <div class="sidebar-content">
                <div class="comment" id="comment-5">
                    <div class="comment-actions"><a href="/comment/5/edit" class="js-modal-medium">Edit</a></div>
                    <div class="comment-content"><div class="markdown">${block(A)}</div></div>
                </div>
            </div>
        </section>`);

    context.document.querySelector('.comment .drawio-diagram-edit').click();

    assert.deepStrictEqual(context.modalOpens, [{url: '/comment/5/edit', size: 'medium'}]);
});

/* -------------------------------------------------------------------- insert */

test('the Markdown toolbar gains an Insert diagram button', () => {
    const {document} = setup(editor('Hello.'));
    const buttons = document.querySelectorAll('.text-editor-write-mode .drawio-insert-button');

    assert.strictEqual(buttons.length, 1, 'exactly one button, and not in the preview toolbar');
    assert.strictEqual(document.querySelectorAll('.drawio-insert-button').length, 1);
});

test('inserting writes a fence at the cursor and nowhere else', () => {
    const context = setup(editor('Intro.\nOutro.'));
    const textarea = context.document.querySelector('textarea');

    textarea.setSelectionRange(7, 7);
    context.document.querySelector('.drawio-insert-button').click();

    assert.strictEqual(context.opened.length, 1);
    assert.strictEqual(context.opened[0].svg, '', 'a new diagram starts empty');

    context.opened[0].onSave(A);

    assert.strictEqual(textarea.value, 'Intro.\n```diagram\n' + A + '\n```\n\nOutro.');
});

test('a repeated render does not add the button twice', async () => {
    const context = setup(editor('Hello.'));

    context.document.body.appendChild(context.document.createElement('span'));
    await context.frame();

    assert.strictEqual(context.document.querySelectorAll('.drawio-insert-button').length, 1);
});

/* ---------------------------------------------------------------------- edit */

test('editing from the preview pane rewrites only that block', async () => {
    const source = 'Before\n\n```diagram\n' + A + '\n```\n\nMiddle\n\n```diagram\n' + B + '\n```\n\nAfter\n';
    const context = setup(editor(source));
    const textarea = context.document.querySelector('textarea');

    context.document.querySelector('.text-editor-preview-area').innerHTML =
        `<p>Before</p>${block(A)}<p>Middle</p>${block(B)}<p>After</p>`;
    await context.frame();

    context.document.querySelectorAll('.drawio-diagram-edit')[1].click();

    assert.strictEqual(context.opened[0].svg, svg('B'), 'draw.io is fed the decoded SVG');

    context.opened[0].onSave(C);

    assert.strictEqual(textarea.value,
        'Before\n\n```diagram\n' + A + '\n```\n\nMiddle\n\n```diagram\n' + C + '\n```\n\nAfter\n');
});

test('editing one of two identical diagrams leaves the other alone', async () => {
    const source = '```diagram\n' + A + '\n```\n\n```diagram\n' + A + '\n```\n';
    const context = setup(editor(source));
    const textarea = context.document.querySelector('textarea');

    context.document.querySelector('.text-editor-preview-area').innerHTML = block(A) + block(A);
    await context.frame();

    context.document.querySelectorAll('.drawio-diagram-edit')[1].click();
    context.opened[0].onSave(B);

    assert.strictEqual(textarea.value, '```diagram\n' + A + '\n```\n\n```diagram\n' + B + '\n```\n');
});

test('the rendered image follows the edit without a round trip', async () => {
    const context = setup(editor('```diagram\n' + A + '\n```\n'));

    context.document.querySelector('.text-editor-preview-area').innerHTML = block(A);
    await context.frame();

    context.document.querySelector('.drawio-diagram-edit').click();
    context.opened[0].onSave(B);

    assert.strictEqual(sources(figures(context.document)[0]), 'data:image/svg+xml;base64,' + B);
});

test('editing from the rendered view continues inside the modal Kanboard opens', () => {
    const context = setup(`
        <section id="task-view">
            <div class="sidebar"><ul><li><a href="/task/1/edit" class="js-modal-large">Edit the task</a></li></ul></div>
            <div class="sidebar-content"><article class="markdown">${block(A)}${block(B)}</article></div>
        </section>
        <div id="modal-content"></div>`);

    context.document.querySelectorAll('.drawio-diagram-edit')[1].click();
    assert.strictEqual(context.opened.length, 0, 'the form is not on screen yet');

    // Kanboard has now loaded the edit form into the modal.
    context.document.getElementById('modal-content').innerHTML =
        editor('```diagram\n' + A + '\n```\n\n```diagram\n' + B + '\n```\n');
    context.trigger('modal.afterRender');

    assert.strictEqual(context.opened.length, 1);
    assert.strictEqual(context.opened[0].svg, svg('B'), 'the second diagram, not the first');

    context.opened[0].onSave(C);

    assert.strictEqual(context.document.querySelector('#modal-content textarea').value,
        '```diagram\n' + A + '\n```\n\n```diagram\n' + C + '\n```\n');
});

test('a diagram that has vanished from the source is refused, not guessed', async () => {
    const context = setup(editor('the diagram was deleted\n'));
    const textarea = context.document.querySelector('textarea');
    const alerts = [];

    context.window.alert = (message) => alerts.push(message);
    context.document.querySelector('.text-editor-preview-area').innerHTML = block(A);
    await context.frame();

    context.document.querySelector('.drawio-diagram-edit').click();

    assert.strictEqual(context.opened.length, 0);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(textarea.value, 'the diagram was deleted\n');
});

test('a payload over the storage budget is refused before it is written', async () => {
    const context = setup(editor('```diagram\n' + A + '\n```\n'));
    const textarea = context.document.querySelector('textarea');
    const oversized = b64(svg('x'.repeat(60000)));
    const alerts = [];

    context.window.alert = (message) => alerts.push(message);
    context.document.querySelector('.text-editor-preview-area').innerHTML = block(A);
    await context.frame();

    context.document.querySelector('.drawio-diagram-edit').click();
    context.opened[0].onSave(oversized);

    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(textarea.value, '```diagram\n' + A + '\n```\n');
});

/* --------------------------------------------------------- quoted diagrams */

/**
 * Replying to a comment quotes its diagram, because TextHelper::reply() prefixes
 * every line with "> ". Such a fence is editable when its payload region is
 * entirely inside the quote; see docs/specs/003-quoted-diagram-editing.md.
 */
async function quotedEditor(source) {
    const context = setup(editor(source));

    context.alerts = [];
    context.confirms = [];
    context.window.alert = (message) => context.alerts.push(message);
    context.window.confirm = (message) => {
        context.confirms.push(message);
        return context.confirmAnswer !== false;
    };
    context.document.querySelector('.text-editor-preview-area').innerHTML =
        `<blockquote>${block(A)}</blockquote>`;
    await context.frame();

    return context;
}

test('a quoted diagram is editable, and the payload keeps its quote prefix', async () => {
    const context = await quotedEditor('Bob wrote:\n> ```diagram\n> ' + A + '\n> ```\n');
    const textarea = context.document.querySelector('textarea');

    assert.strictEqual(figures(context.document).length, 1);

    context.document.querySelector('.drawio-diagram-edit').click();

    assert.strictEqual(context.confirms.length, 1, 'editing a quotation asks first');
    assert.strictEqual(context.opened.length, 1);

    context.opened[0].onSave(B);

    assert.strictEqual(textarea.value, 'Bob wrote:\n> ```diagram\n> ' + B + '\n> ```\n');
    assert.strictEqual(context.alerts.length, 0);
});

test('declining the confirmation writes nothing and opens no editor', async () => {
    const context = await quotedEditor('> ```diagram\n> ' + A + '\n> ```\n');
    const textarea = context.document.querySelector('textarea');

    context.confirmAnswer = false;
    context.document.querySelector('.drawio-diagram-edit').click();

    assert.strictEqual(context.confirms.length, 1);
    assert.strictEqual(context.opened.length, 0);
    assert.strictEqual(textarea.value, '> ```diagram\n> ' + A + '\n> ```\n');
});

test('a quoted fence broken by a blank line is refused, not normalised', async () => {
    const source = '> ```diagram\n> ' + A + '\n\n> ```\n';
    const context = await quotedEditor(source);
    const textarea = context.document.querySelector('textarea');

    assert.strictEqual(figures(context.document).length, 1, 'it still renders');

    context.document.querySelector('.drawio-diagram-edit').click();

    assert.strictEqual(context.opened.length, 0);
    assert.strictEqual(context.confirms.length, 0, 'refused before asking');
    assert.strictEqual(context.alerts.length, 1);
    assert.strictEqual(textarea.value, source, 'the blank line and both quotes survive');
});

test('an unquoted diagram is edited without a confirmation', async () => {
    const context = setup(editor('```diagram\n' + A + '\n```\n'));
    const textarea = context.document.querySelector('textarea');

    context.window.confirm = () => { throw new Error('should not ask'); };
    context.document.querySelector('.text-editor-preview-area').innerHTML = block(A);
    await context.frame();

    context.document.querySelector('.drawio-diagram-edit').click();
    context.opened[0].onSave(B);

    assert.strictEqual(textarea.value, '```diagram\n' + B + '\n```\n');
});
