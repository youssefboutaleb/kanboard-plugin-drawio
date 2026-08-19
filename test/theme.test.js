'use strict';

/**
 * Theme legibility.
 *
 * Kanboard picks a theme by loading one of assets/css/{light,dark,auto}.min.css, so nothing
 * in the DOM says which one is active and the plugin cannot branch on it. A diagram whose
 * own background is transparent — the author's choice, not something the plugin controls —
 * would otherwise be dark strokes on the dark theme's #222.
 *
 * The stylesheet is loaded from disk and parsed by jsdom rather than grepped. Ordinary
 * declarations are read back through selector matching and the cascade; pseudo-element
 * declarations are read from the parsed rule, because jsdom does not implement
 * getComputedStyle for pseudo-elements. jsdom also does not resolve var(), which is why
 * these tests assert that a colour *is* a theme token with a fallback — what it resolves
 * to on a real dark page is what the manual pass (M-11) is for.
 *
 * See docs/specs/004-dark-theme-legibility.md.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'Asset', 'css', 'drawio.css'), 'utf8');

/** The values the light theme defines, which the fallbacks must reproduce. */
const LIGHT = {
    colorLight: '#777',
    colorError: '#b94a48'
};

/**
 * The one Kanboard rule that competes with the plugin's, transcribed from
 * assets/css/light.min.css in 1.2.53. Its specificity (0,1,1) beats a single class, so it
 * decides a diagram's width — and it must not be allowed to decide its surface.
 */
const KANBOARD_MARKDOWN_IMG = '.markdown img{display:block;max-width:80%;margin-top:10px}';

/** The markup drawio-ui.js builds around a rendered diagram. */
const PAGE = `
    <article class="markdown">
        <figure class="drawio-diagram">
            <img class="drawio-diagram-image" alt="draw.io diagram" src="data:image/svg+xml;base64,QQ==">
        </figure>
        <pre class="drawio-diagram-source"><code class="language-diagram">QQ==</code></pre>
        <pre data-drawio-error="broken"><code class="language-diagram">!!</code></pre>
    </article>
    <div class="drawio-editor-overlay"><iframe class="drawio-editor-frame"></iframe></div>`;

function load(hostCss) {
    const sheets = hostCss ? `<style>${hostCss}</style><style>${CSS}</style>` : `<style>${CSS}</style>`;
    const dom = new JSDOM(
        `<!doctype html><html><head>${sheets}</head><body>${PAGE}</body></html>`
    );
    const {window} = dom;

    return {
        /** Computed through selector matching and the cascade. */
        computed: (selector) => window.getComputedStyle(window.document.querySelector(selector)),
        /**
         * Read from the parsed stylesheet instead.
         *
         * jsdom answers `getComputedStyle(el, '::before')` with "Not implemented", so a
         * pseudo-element's declarations can only be checked where the CSS parser put them.
         * That still proves the declaration parses and is attached to this exact selector —
         * it does not prove the selector matches anything, which is what M-11 is for.
         */
        rule: (selectorText) => {
            const rules = [...window.document.styleSheets[0].cssRules];
            const found = rules.find(rule => rule.selectorText === selectorText);

            assert.ok(found, 'no rule for ' + selectorText + ' — was the stylesheet renamed?');
            return found.style;
        }
    };
}

test('a rendered diagram sits on an opaque surface', () => {
    const image = load().computed('.drawio-diagram-image');

    assert.strictEqual(image.backgroundColor, 'rgb(255, 255, 255)',
        'a transparent diagram must not be painted straight onto the dark theme');
    assert.notStrictEqual(image.backgroundColor, 'transparent');
});

test('the surface cannot push the image out of its container', () => {
    const image = load().computed('.drawio-diagram-image');

    assert.strictEqual(image.boxSizing, 'border-box',
        'Kanboard has no global border-box reset, so padding would widen a max-width image');
    assert.notStrictEqual(image.paddingTop, '', 'the surface needs padding to be visible at all');
    assert.notStrictEqual(image.paddingTop, '0px');
});

test('the border colour is a Kanboard theme token with a fallback', () => {
    // Read from the rule: jsdom does not expand border-color into the per-side longhands
    // when the value is a var(), so the computed side colour would read as black.
    const image = load().rule('.drawio-diagram-image');

    assert.match(image.getPropertyValue('border-color'), /^var\(--color-lighter,\s*#dedede\)$/);
});

test("Kanboard's own .markdown img rule cannot take the surface away", () => {
    // It outranks a single class, so it wins on width — that is Kanboard's call and was
    // true before this task. It sets no background, so the surface must survive.
    const image = load(KANBOARD_MARKDOWN_IMG).computed('.drawio-diagram-image');

    assert.strictEqual(image.backgroundColor, 'rgb(255, 255, 255)', 'the diagram stays legible');
    assert.strictEqual(image.boxSizing, 'border-box');
    assert.strictEqual(image.borderTopWidth, '1px', 'the hairline edge survives too');
    assert.strictEqual(image.maxWidth, '80%', "width is Kanboard's to decide, and it does");
});

test('the placeholder colour is a Kanboard theme token with a light-theme fallback', () => {
    const placeholder = load().rule('pre:has(> code.language-diagram)::before');

    assert.match(placeholder.color, /^var\(--color-light,\s*#777\)$/,
        'the placeholder should follow the theme, not stay light-grey on a dark page');
});

test('the decode-error colour is a Kanboard theme token with a light-theme fallback', () => {
    const error = load().rule('pre[data-drawio-error]::before');

    assert.match(error.color, /^var\(--color-error,\s*#b94a48\)$/);
});

test('the editor backdrop follows the page background', () => {
    const overlay = load().computed('.drawio-editor-overlay');

    assert.match(overlay.backgroundColor, /^var\(--body-background-color,\s*#ffffff\)$/,
        'a white backdrop flashes on a dark install before draw.io paints');
});

test('every fallback is the value the light theme already used', () => {
    // Verified against assets/css/light.min.css in Kanboard 1.2.53: --color-light is #777
    // and --color-error is #b94a48. Keeping the fallbacks identical is what makes this
    // change invisible on the light theme.
    const sheet = load();

    assert.ok(sheet.rule('pre:has(> code.language-diagram)::before').color.includes(LIGHT.colorLight));
    assert.ok(sheet.rule('pre[data-drawio-error]::before').color.includes(LIGHT.colorError));
});

test('the stylesheet defines no custom properties of its own', () => {
    // The plugin reads Kanboard's tokens; defining any would mean shipping a theme.
    assert.strictEqual(/^\s*--[a-z-]+\s*:/m.test(CSS), false);
});

test('every theme token used carries a fallback', () => {
    const uses = CSS.match(/var\([^)]*\)/g) || [];

    assert.ok(uses.length >= 3, 'expected the theme tokens to be in use');

    for (const use of uses) {
        assert.match(use, /^var\(--[a-z-]+,\s*\S+\)$/,
            use + ' has no fallback; a Kanboard that drops the token would render it unset');
    }
});
