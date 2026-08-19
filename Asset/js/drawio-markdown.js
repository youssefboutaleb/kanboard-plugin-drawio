/**
 * Draw.io for Kanboard — Markdown source manipulation.
 *
 * Pure functions, no DOM, no Kanboard dependency. Loaded as a plain script in
 * the browser (exposes the global `KBDrawioMarkdown`) and as a CommonJS module
 * by the test suite.
 *
 * The storage format is the one used by Wiki.js:
 *
 *     ```diagram
 *     <base64 of the SVG produced by draw.io's "xmlsvg" export>
 *     ```
 *
 * The SVG carries the editable mxfile XML in its `content` attribute, which is
 * what makes the payload both renderable (as an image) and re-editable.
 */
var KBDrawioMarkdown = (function () {
    'use strict';

    var FENCE_LANGUAGE = 'diagram';

    /* Mirrors Parsedown::blockFencedCode(): up to three spaces of indentation,
     * three or more backticks or tildes, and an info string free of backticks. */
    var OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`]*?)[ \t]*$/;

    /* Mirrors Parsedown::blockFencedCodeContinue(), which matches against the
     * indentation-stripped line, so any indentation closes the block. */
    var CLOSING_FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

    var BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

    /* Parsedown hands the content of a blockquote to the block parser with the
     * markers already removed, so a fence can legitimately open inside one —
     * which is exactly what happens when someone replies to a comment holding a
     * diagram, since TextHelper::reply() prefixes every line with "> ". */
    var QUOTE_MARKER = /^ {0,3}> ?/;

    /**
     * Split a Markdown document into its fenced code blocks.
     *
     * Returns every fence, not only the diagrams, because the ordinal of a
     * diagram block is only meaningful when the non-diagram fences that could
     * swallow it have been accounted for.
     */
    function findFences(source) {
        var fences = [];
        var offset = 0;
        var open = null;
        var lines = String(source).split('\n');

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var text = line.charAt(line.length - 1) === '\r' ? line.slice(0, -1) : line;
            var lineStart = offset;
            var nextOffset = offset + line.length + 1;
            var match;

            if (open === null) {
                var unquoted = stripQuoteMarkers(text);
                match = OPENING_FENCE.exec(unquoted.text);

                if (match !== null) {
                    open = {
                        char: match[1].charAt(0),
                        length: match[1].length,
                        language: firstToken(match[2]),
                        quoted: unquoted.depth > 0,
                        /* The markers exactly as they were written — "> ", ">",
                         * "> > ", "   > ". Writing a payload back into a quoted
                         * fence re-emits this verbatim, so depth in equals depth
                         * out and nothing is re-quoted or un-quoted. */
                        quotePrefix: text.slice(0, text.length - unquoted.text.length),
                        quoteDepth: unquoted.depth,
                        lazyQuote: false,
                        lines: [],
                        start: lineStart,
                        contentStart: Math.min(nextOffset, source.length)
                    };
                }
            } else {
                /* Only strip markers from a block that was opened inside a
                 * quote; elsewhere a leading ">" is code, not a marker. */
                var stripped = open.quoted ? stripQuoteMarkers(text) : null;
                var content = stripped === null ? text : stripped.text;
                match = CLOSING_FENCE.exec(content);

                if (match !== null && match[1].charAt(0) === open.char && match[1].length >= 3) {
                    open.contentEnd = lineStart;
                    open.end = Math.min(nextOffset, source.length);
                    fences.push(finalize(open));
                    open = null;
                } else {
                    /* A content line shallower than the opening line is not
                     * inside the quote: a lazy continuation, or the blank line
                     * that ends a blockquote entirely. Parsedown still reads the
                     * payload, so the block renders — but the region cannot be
                     * rewritten without touching something other than the
                     * payload, so the fence is marked unwritable rather than
                     * normalised.
                     *
                     * The exception is the empty string after a document's final
                     * newline: an artifact of splitting rather than a line anyone
                     * wrote, and it must not condemn an unterminated quoted fence. */
                    var trailingEof = i === lines.length - 1 && text === '';

                    if (stripped !== null && !trailingEof && stripped.depth < open.quoteDepth) {
                        open.lazyQuote = true;
                    }

                    open.lines.push(content);
                }
            }

            offset = nextOffset;
        }

        /* Parsedown renders an unterminated fence as a code block running to the
         * end of the document, so it still occupies an ordinal. */
        if (open !== null) {
            open.contentEnd = source.length;
            open.end = source.length;
            fences.push(finalize(open));
        }

        return fences;
    }

    function stripQuoteMarkers(text) {
        var depth = 0;
        var match = QUOTE_MARKER.exec(text);

        while (match !== null) {
            text = text.slice(match[0].length);
            depth++;
            match = QUOTE_MARKER.exec(text);
        }

        return {text: text, depth: depth};
    }

    function finalize(fence) {
        fence.raw = fence.lines.join('\n');
        fence.payload = fence.raw.replace(/\s+/g, '');
        fence.isDiagram = fence.language === FENCE_LANGUAGE;
        delete fence.lines;
        return fence;
    }

    function firstToken(info) {
        var match = /^[^ \t\n\f\r]*/.exec(info || '');
        return match[0];
    }

    /** The diagram fences only, in source order, each carrying its ordinal. */
    function findDiagrams(source) {
        var diagrams = [];
        var fences = findFences(source);

        for (var i = 0; i < fences.length; i++) {
            if (fences[i].isDiagram) {
                fences[i].index = diagrams.length;
                diagrams.push(fences[i]);
            }
        }

        return diagrams;
    }

    /**
     * Find the fence a rendered diagram came from.
     *
     * The ordinal alone is not enough: the Markdown may have been edited since
     * the block was rendered, and a document may hold several identical
     * diagrams. So the ordinal is proposed first and confirmed against the
     * payload that was actually loaded into the editor; only when that fails do
     * we fall back to a payload match, and only when it is unambiguous.
     *
     * Returns null rather than a guess — the caller must refuse to write.
     */
    function locateDiagram(source, index, expectedPayload) {
        var diagrams = findDiagrams(source);
        var candidate = diagrams[index];
        var matches = [];
        var i;

        if (!expectedPayload) {
            return candidate || null;
        }

        if (candidate && candidate.payload === expectedPayload) {
            return candidate;
        }

        for (i = 0; i < diagrams.length; i++) {
            if (diagrams[i].payload === expectedPayload) {
                matches.push(diagrams[i]);
            }
        }

        return matches.length === 1 ? matches[0] : null;
    }

    /**
     * Whether a located fence's payload region can be rewritten in place.
     *
     * An unquoted fence always can. A quoted one can when every line of its
     * content region is inside the quote, so that replacing the region with a
     * single quoted line changes the payload and nothing else. See
     * `docs/specs/003-quoted-diagram-editing.md` for the shapes this refuses and
     * why normalising them instead would damage the document.
     */
    function isWritableFence(fence) {
        if (!fence) {
            return false;
        }

        if (!fence.quoted) {
            return true;
        }

        return !fence.lazyQuote && typeof fence.quotePrefix === 'string' && fence.quotePrefix !== '';
    }

    /** The exact text that replaces a fence's content region. */
    function fenceReplacement(fence, payload) {
        var prefix = fence && fence.quoted ? fence.quotePrefix : '';
        return prefix + payload + '\n';
    }

    /** Replace one fence's payload, leaving every other byte of the document untouched. */
    function replacePayload(source, fence, payload) {
        var tail = source.slice(fence.contentEnd);
        return source.slice(0, fence.contentStart) + fenceReplacement(fence, payload) + tail;
    }

    /** The Markdown block to write into a document. */
    function buildFence(payload) {
        return '```' + FENCE_LANGUAGE + '\n' + payload + '\n```';
    }

    /**
     * Insert a diagram at a cursor position, keeping the fence on its own lines.
     *
     * Returns the new text plus the range that was written, so the caller can
     * restore a sensible selection.
     */
    function insertFence(source, selectionStart, selectionEnd, payload) {
        var before = source.slice(0, selectionStart);
        var after = source.slice(selectionEnd);
        var prefix = before === '' || /\n$/.test(before) ? '' : '\n';
        var suffix = after === '' || /^\n/.test(after) ? '\n' : '\n\n';
        var text = prefix + buildFence(payload) + suffix;

        return {
            text: before + text + after,
            insertedText: text,
            start: selectionStart,
            end: selectionStart + text.length
        };
    }

    /**
     * Accept a payload only if it is canonical base64 of something that looks
     * like an SVG document.
     *
     * This is not an XSS control — diagrams are rendered through `<img>`, which
     * neutralises scripting on its own. It exists so that a corrupt or hostile
     * payload fails visibly instead of being written back into a task, and so
     * that nothing containing a newline or a backtick can ever reach the
     * Markdown and break out of its own fence.
     */
    function isValidPayload(payload) {
        if (typeof payload !== 'string' || payload.length === 0) {
            return false;
        }

        if (payload.length % 4 !== 0 || !BASE64.test(payload)) {
            return false;
        }

        try {
            return looksLikeSvg(decodePayload(payload));
        } catch (e) {
            return false;
        }
    }

    function looksLikeSvg(text) {
        var head = text.slice(0, 1024).replace(/^﻿/, '').replace(/^\s+/, '');
        return (head.indexOf('<?xml') === 0 || head.indexOf('<svg') === 0 || head.indexOf('<!DOCTYPE svg') === 0) &&
            text.indexOf('<svg') !== -1;
    }

    /** base64 → UTF-8 string. The SVG is fed to draw.io as-is; it reads the embedded XML. */
    function decodePayload(payload) {
        var binary = atob(payload);
        var bytes = new Uint8Array(binary.length);

        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return new TextDecoder('utf-8').decode(bytes);
    }

    /** The `src` for the rendered diagram. */
    function toDataUri(payload) {
        return 'data:image/svg+xml;base64,' + payload;
    }

    /** Byte size of the Markdown a payload will occupy, for the storage budget. */
    function payloadSize(payload) {
        return typeof payload === 'string' ? payload.length : 0;
    }

    return {
        FENCE_LANGUAGE: FENCE_LANGUAGE,
        findFences: findFences,
        findDiagrams: findDiagrams,
        locateDiagram: locateDiagram,
        isWritableFence: isWritableFence,
        fenceReplacement: fenceReplacement,
        replacePayload: replacePayload,
        buildFence: buildFence,
        insertFence: insertFence,
        isValidPayload: isValidPayload,
        decodePayload: decodePayload,
        toDataUri: toDataUri,
        payloadSize: payloadSize
    };
}());

if (typeof module !== 'undefined' && module.exports) {
    module.exports = KBDrawioMarkdown;
}
