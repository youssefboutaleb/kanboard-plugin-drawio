'use strict';

const test = require('node:test');
const assert = require('node:assert');
const md = require('../Asset/js/drawio-markdown.js');

const cases = require('./fixtures/markdown-cases.json');
const expected = require('./fixtures/parsedown-expected.json');

/**
 * The plugin identifies a diagram by its ordinal among the ```diagram fences of
 * the Markdown source, so the JavaScript tokenizer has to see exactly the
 * blocks Kanboard's parser sees. `parsedown-expected.json` is what Parsedown
 * 1.7.4 — the copy vendored in kanboard/libs — actually emits for these inputs;
 * regenerate it with test/parsedown-parity.php against a Kanboard checkout.
 */
test('the tokenizer agrees with Parsedown on every fixture', () => {
    assert.strictEqual(cases.length, expected.length, 'fixtures and expectations are out of step');

    cases.forEach((markdown, i) => {
        const found = md.findDiagrams(markdown).map(diagram => diagram.payload);

        assert.deepStrictEqual(found, expected[i], `case ${i}: ${JSON.stringify(markdown)}`);
    });
});

test('a quoted diagram is found but flagged as not editable in place', () => {
    const source = '> ```diagram\n> QUFB\n> ```\n';
    const diagrams = md.findDiagrams(source);

    assert.strictEqual(diagrams.length, 1);
    assert.strictEqual(diagrams[0].payload, 'QUFB');
    assert.strictEqual(diagrams[0].quoted, true);
});

test('a quoted diagram does not shift the ordinal of the ones after it', () => {
    const source = '> ```diagram\n> QUFB\n> ```\n\n```diagram\nQkJC\n```\n';
    const located = md.locateDiagram(source, 1, 'QkJC');

    assert.notStrictEqual(located, null);
    assert.strictEqual(located.quoted, false);
    assert.strictEqual(located.payload, 'QkJC');
});

test('a ">" inside an ordinary fence is content, not a quote marker', () => {
    const source = '```js\n> not a quote\n```\n\n```diagram\nQUFB\n```\n';
    const fences = md.findFences(source);

    assert.strictEqual(fences[0].raw, '> not a quote');
    assert.strictEqual(md.findDiagrams(source).length, 1);
});
