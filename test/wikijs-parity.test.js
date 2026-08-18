'use strict';

const test = require('node:test');
const assert = require('node:assert');
const md = require('../Asset/js/drawio-markdown.js');

/**
 * Wiki.js parity.
 *
 * Compatibility is only worth claiming if it is checked against what Wiki.js
 * actually does, so the three routines below are transcriptions of its source
 * (requarks/wiki, branch main) rather than descriptions of it:
 *
 *   - `wikijsRender`   — server/modules/rendering/markdown-core/renderer.js,
 *                        the `highlight()` branch for `lang === 'diagram'`.
 *   - `wikijsExtract`  — client/components/editor/editor-modal-drawio.vue,
 *                        the `export` case: `msg.data.slice(indexOf('base64,') + 7)`.
 *   - `wikijsMarkers`  — client/components/editor/editor-markdown.vue,
 *                        `processMarkers()`: what Wiki.js will offer to edit.
 *
 * `wikijsMarkers` is the strict one. Wiki.js recognises an editable diagram only
 * when the fence is exactly three lines — it reads the payload with
 * `getLine(end - 1)` and bails on `line - foundStart !== 2` — so anything this
 * plugin writes has to hold that shape or the diagram becomes read-only over
 * there.
 */

/** markdown-core/renderer.js — decodes the fence body and inlines the SVG. */
function wikijsRender(payload) {
    return '<pre class="diagram">' + Buffer.from(payload, 'base64').toString() + '</pre>';
}

/** editor-modal-drawio.vue — what Wiki.js keeps from a draw.io xmlsvg export. */
function wikijsExtract(dataUri) {
    const svgDataStart = dataUri.indexOf('base64,') + 7;
    return dataUri.slice(svgDataStart);
}

/** editor-markdown.vue — the blocks Wiki.js will attach an "Edit Diagram" marker to. */
function wikijsMarkers(source) {
    const lines = source.split('\n');
    const markers = [];
    let found = null;
    let foundStart = 0;

    lines.forEach((text, line) => {
        if (text.startsWith('```diagram')) {
            found = 'diagram';
            foundStart = line;
        } else if (text === '```' && found) {
            if (line - foundStart === 2) {
                markers.push({
                    from: foundStart,
                    to: line,
                    // getLine(end - 1): the payload is a single line, always.
                    payload: lines[line - 1]
                });
            }
            found = null;
        }
    });

    return markers;
}

const SVG = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" version="1.1" ' +
    'content="&lt;mxfile host=&quot;embed.diagrams.net&quot;&gt;&lt;diagram id=&quot;x&quot;&gt;' +
    '&lt;mxGraphModel&gt;&lt;root&gt;&lt;/root&gt;&lt;/mxGraphModel&gt;&lt;/diagram&gt;&lt;/mxfile&gt;">' +
    '<rect width="120" height="60" fill="#dae8fc"/></svg>';

const SVG_EDITED = SVG.replace('#dae8fc', '#f8cecc');

const A = Buffer.from(SVG).toString('base64');
const B = Buffer.from(SVG_EDITED).toString('base64');

/** A fence as Wiki.js writes it: '```diagram\n' + text + '\n```\n'. */
const wikijsFence = (payload) => '```diagram\n' + payload + '\n```\n';

/* ------------------------------------------------------------------ the payload */

test('the plugin keeps the same half of a draw.io export that Wiki.js keeps', () => {
    const dataUri = 'data:image/svg+xml;base64,' + A;

    // drawio-editor.js does `data.slice(data.indexOf('base64,') + 7)`; so does Wiki.js.
    const marker = dataUri.indexOf('base64,');
    const ours = dataUri.slice(marker + 7);

    assert.strictEqual(ours, wikijsExtract(dataUri));
    assert.strictEqual(ours, A);
});

test('a Wiki.js payload decodes identically on both sides', () => {
    assert.strictEqual(md.decodePayload(A), Buffer.from(A, 'base64').toString());
    assert.strictEqual(md.decodePayload(A), SVG);
    assert.ok(wikijsRender(A).includes(SVG), 'Wiki.js inlines the very SVG we hand to draw.io');
});

test('the editable XML survives the payload, which is what makes it re-editable', () => {
    const decoded = md.decodePayload(A);

    assert.ok(decoded.includes('mxfile'));
    assert.ok(decoded.includes('mxGraphModel'));
});

/* -------------------------------------------------------------- what we write */

test('a fence written by the plugin is one Wiki.js will offer to edit', () => {
    const document = md.buildFence(A);
    const markers = wikijsMarkers(document);

    assert.strictEqual(markers.length, 1, 'Wiki.js requires exactly three lines');
    assert.strictEqual(markers[0].payload, A);
    assert.strictEqual(document.split('\n').length, 3);
});

test('an inserted diagram is a Wiki.js-editable block wherever the cursor was', () => {
    const cases = [
        ['', 0],
        ['text', 4],
        ['before\nafter', 6],
        ['# Title\n\nbody\n', 15]
    ];

    for (const [source, cursor] of cases) {
        const result = md.insertFence(source, cursor, cursor, A);
        const markers = wikijsMarkers(result.text);

        assert.strictEqual(markers.length, 1, `insert into ${JSON.stringify(source)}`);
        assert.strictEqual(markers[0].payload, A);
        assert.strictEqual(markers[0].to - markers[0].from, 2);
    }
});

test('an edited fence stays exactly three lines', () => {
    const source = wikijsFence(A);
    const fence = md.locateDiagram(source, 0, A);
    const updated = md.replacePayload(source, fence, B);

    assert.strictEqual(updated, wikijsFence(B), 'byte-for-byte the shape Wiki.js writes');
    assert.strictEqual(wikijsMarkers(updated).length, 1);
    assert.strictEqual(wikijsMarkers(updated)[0].payload, B);
});

test('editing normalises a wrapped payload into the single line Wiki.js requires', () => {
    // A payload wrapped across lines renders in Wiki.js (markdown-it decodes the
    // whole block) but is not editable there, because getLine(end - 1) reads one
    // line. Editing it here repairs that rather than perpetuating it.
    const wrapped = A.replace(/(.{40})/g, '$1\n');
    const source = '```diagram\n' + wrapped + '\n```\n';

    assert.strictEqual(wikijsMarkers(source).length, 0, 'not editable in Wiki.js before');

    const fence = md.locateDiagram(source, 0, A);
    const updated = md.replacePayload(source, fence, B);

    assert.strictEqual(wikijsMarkers(updated).length, 1, 'editable in Wiki.js after');
    assert.strictEqual(updated, wikijsFence(B));
});

/* ------------------------------------------------------- what we leave alone */

test('editing one diagram leaves every other Wiki.js fence byte-identical', () => {
    const source = 'Intro.\n\n' + wikijsFence(A) + '\nMiddle.\n\n' + wikijsFence(A) + '\nOutro.\n';

    const second = md.locateDiagram(source, 1, A);
    const updated = md.replacePayload(source, second, B);

    const before = wikijsMarkers(source);
    const after = wikijsMarkers(updated);

    assert.strictEqual(after.length, 2);
    assert.strictEqual(after[0].payload, before[0].payload, 'the untouched diagram is unchanged');
    assert.strictEqual(after[1].payload, B);

    // Everything that is not a payload survives byte-for-byte.
    const strip = (text) => text.replace(/```diagram\n.*?\n```/gs, '```diagram\nX\n```');
    assert.strictEqual(strip(updated), strip(source));
});

test('a full Wiki.js page round-trips through the plugin', () => {
    const page = [
        '# Architecture',
        '',
        'Intro paragraph.',
        '',
        wikijsFence(A).trimEnd(),
        '',
        '## Details',
        '',
        '```js',
        'const x = 1;',
        '```',
        '',
        wikijsFence(A).trimEnd(),
        '',
        'Closing paragraph.',
        ''
    ].join('\n');

    // Read side: the plugin sees the same two diagrams Wiki.js does.
    assert.strictEqual(md.findDiagrams(page).length, 2);
    assert.strictEqual(wikijsMarkers(page).length, 2);

    // Write side: edit the first, hand it back.
    const first = md.locateDiagram(page, 0, A);
    const updated = md.replacePayload(page, first, B);

    assert.strictEqual(wikijsMarkers(updated).length, 2);
    assert.strictEqual(wikijsMarkers(updated)[0].payload, B);
    assert.strictEqual(wikijsMarkers(updated)[1].payload, A);
    assert.ok(updated.includes('```js\nconst x = 1;\n```'), 'other fences untouched');
    assert.ok(updated.startsWith('# Architecture\n'));
    assert.ok(updated.endsWith('Closing paragraph.\n'));
});

/* ---------------------------------------------------------------- the caveat */

test('a tilde fence renders in Wiki.js but is not editable there, before or after', () => {
    // markdown-it accepts ~~~diagram, so Wiki.js renders it; processMarkers only
    // scans for '```diagram', so it never offers to edit it. The plugin rewrites
    // the payload and nothing else, so the delimiter it found is the delimiter it
    // leaves — converting it would modify Markdown the user did not ask to change.
    const source = '~~~diagram\n' + A + '\n~~~\n';

    assert.strictEqual(md.findDiagrams(source).length, 1, 'the plugin still edits it');
    assert.strictEqual(wikijsMarkers(source).length, 0);

    const fence = md.locateDiagram(source, 0, A);
    const updated = md.replacePayload(source, fence, B);

    assert.strictEqual(updated, '~~~diagram\n' + B + '\n~~~\n');
    assert.strictEqual(wikijsMarkers(updated).length, 0, 'unchanged in that respect');
});
