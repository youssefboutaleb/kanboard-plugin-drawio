'use strict';

const test = require('node:test');
const assert = require('node:assert');
const md = require('../Asset/js/drawio-markdown.js');

const SVG_A = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;A&lt;/mxfile&gt;"><rect/></svg>';
const SVG_B = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;B&lt;/mxfile&gt;"><circle/></svg>';

const A = Buffer.from(SVG_A).toString('base64');
const B = Buffer.from(SVG_B).toString('base64');

function fence(payload) {
    return '```diagram\n' + payload + '\n```';
}

test('markdown without a diagram yields no diagram block', () => {
    const source = [
        '# Architecture',
        '',
        'Some **normal** Markdown with a task link #42 and a mention @alice.',
        '',
        '```js',
        'console.log("hello");',
        '```',
        '',
        'The end.'
    ].join('\n');

    assert.deepStrictEqual(md.findDiagrams(source), []);
    assert.strictEqual(md.findFences(source).length, 1);
    assert.strictEqual(md.findFences(source)[0].language, 'js');
});

test('a single diagram is found with its payload', () => {
    const source = 'Before\n\n' + fence(A) + '\n\nAfter\n';
    const diagrams = md.findDiagrams(source);

    assert.strictEqual(diagrams.length, 1);
    assert.strictEqual(diagrams[0].index, 0);
    assert.strictEqual(diagrams[0].payload, A);
    assert.strictEqual(source.slice(diagrams[0].contentStart, diagrams[0].contentEnd), A + '\n');
});

test('several diagrams keep their source order', () => {
    const source = fence(A) + '\n\ntext\n\n' + fence(B) + '\n';
    const diagrams = md.findDiagrams(source);

    assert.strictEqual(diagrams.length, 2);
    assert.deepStrictEqual(diagrams.map(d => d.index), [0, 1]);
    assert.deepStrictEqual(diagrams.map(d => d.payload), [A, B]);
});

test('a diagram fence nested in a wider fence is not a diagram', () => {
    // Parsedown closes a fence only on the character it was opened with, so
    // this whole block is one ~~~ code block and the ``` lines are content.
    const source = '~~~\n' + fence(A) + '\n~~~\n';

    assert.deepStrictEqual(md.findDiagrams(source), []);
    assert.strictEqual(md.findFences(source).length, 1);
});

test('a tilde diagram fence is recognised', () => {
    const source = '~~~diagram\n' + A + '\n~~~\n';
    const diagrams = md.findDiagrams(source);

    assert.strictEqual(diagrams.length, 1);
    assert.strictEqual(diagrams[0].payload, A);
});

test('an info string with extra words still selects the language', () => {
    const diagrams = md.findDiagrams('```diagram  \n' + A + '\n```\n');

    assert.strictEqual(diagrams.length, 1);
});

test('four spaces of indentation is an indented code block, not a fence', () => {
    assert.deepStrictEqual(md.findDiagrams('    ```diagram\n    ' + A + '\n    ```\n'), []);
});

test('up to three spaces of indentation still opens a fence', () => {
    assert.strictEqual(md.findDiagrams('  ```diagram\n' + A + '\n  ```\n').length, 1);
});

test('an unterminated fence still occupies an ordinal', () => {
    const source = fence(A) + '\n\n```diagram\n' + B;
    const diagrams = md.findDiagrams(source);

    assert.strictEqual(diagrams.length, 2);
    assert.strictEqual(diagrams[1].payload, B);
});

test('CRLF line endings are handled', () => {
    const source = 'Before\r\n\r\n```diagram\r\n' + A + '\r\n```\r\n\r\nAfter\r\n';
    const diagrams = md.findDiagrams(source);

    assert.strictEqual(diagrams.length, 1);
    assert.strictEqual(diagrams[0].payload, A);
});

test('replacing a payload leaves every other byte untouched', () => {
    const before = '# Title\n\nIntro text with #42 and @alice.\n\n';
    const after = '\n\nTrailing text.\n';
    const source = before + fence(A) + after;

    const fenceA = md.locateDiagram(source, 0, A);
    const result = md.replacePayload(source, fenceA, B);

    assert.strictEqual(result, before + fence(B) + after);
    assert.ok(result.startsWith(before));
    assert.ok(result.endsWith(after));
});

test('editing one of two identical diagrams leaves the other alone', () => {
    const source = 'one\n\n' + fence(A) + '\n\ntwo\n\n' + fence(A) + '\n\nthree\n';

    const second = md.locateDiagram(source, 1, A);
    const result = md.replacePayload(source, second, B);

    assert.strictEqual(result, 'one\n\n' + fence(A) + '\n\ntwo\n\n' + fence(B) + '\n\nthree\n');
    assert.strictEqual(md.findDiagrams(result)[0].payload, A);
    assert.strictEqual(md.findDiagrams(result)[1].payload, B);
});

test('an ordinal that no longer matches falls back to the unique payload', () => {
    // A diagram was inserted above ours while draw.io was open, so ordinal 0
    // now points at the new block.
    const source = fence(B) + '\n\n' + fence(A) + '\n';
    const located = md.locateDiagram(source, 0, A);

    assert.notStrictEqual(located, null);
    assert.strictEqual(located.index, 1);
});

test('an ambiguous relocation is refused rather than guessed', () => {
    // Ordinal 2 does not exist and the payload appears twice: there is no
    // deterministic answer, so nothing may be written.
    const source = fence(A) + '\n\n' + fence(A) + '\n';

    assert.strictEqual(md.locateDiagram(source, 2, A), null);
});

test('a diagram deleted from the source is refused', () => {
    assert.strictEqual(md.locateDiagram('just text\n', 0, A), null);
});

test('insertion at the cursor keeps the fence on its own lines', () => {
    const source = 'Intro.\nOutro.';
    const at = source.indexOf('\nOutro.');
    const result = md.insertFence(source, at, at, A);

    assert.strictEqual(result.text, 'Intro.\n' + fence(A) + '\n\nOutro.');
    assert.strictEqual(md.findDiagrams(result.text).length, 1);
    assert.strictEqual(result.text.slice(result.start, result.end), result.insertedText);
});

test('insertion into an empty field produces a valid document', () => {
    const result = md.insertFence('', 0, 0, A);

    assert.strictEqual(result.text, fence(A) + '\n');
    assert.strictEqual(md.findDiagrams(result.text)[0].payload, A);
});

test('insertion replaces the selection', () => {
    const source = 'keep [drop] keep';
    const start = source.indexOf('[');
    const end = source.indexOf(']') + 1;
    const result = md.insertFence(source, start, end, A);

    assert.ok(result.text.startsWith('keep \n```diagram'));
    assert.ok(result.text.endsWith('```\n\n keep'));
});

test('a round trip through insert and replace is stable', () => {
    const inserted = md.insertFence('doc\n', 4, 4, A).text;
    const located = md.locateDiagram(inserted, 0, A);
    const updated = md.replacePayload(inserted, located, B);

    assert.strictEqual(md.findDiagrams(updated).length, 1);
    assert.strictEqual(md.findDiagrams(updated)[0].payload, B);
    assert.ok(updated.startsWith('doc\n'));
});
