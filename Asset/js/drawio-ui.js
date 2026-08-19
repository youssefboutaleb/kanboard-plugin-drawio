/**
 * Draw.io for Kanboard — user interface.
 *
 * Rendering happens in the browser: Kanboard's Markdown parser already turns a
 * ```diagram fence into `<pre><code class="language-diagram">`, so the plugin
 * never touches the Markdown pipeline. It replaces that element with an image
 * and, where the surrounding Markdown is editable, an "Edit diagram" action.
 *
 * Nothing here persists anything. Edits are written into the Kanboard textarea
 * that owns the Markdown, and saved by Kanboard's own form.
 */
(function () {
    'use strict';

    var MARKDOWN_CONTAINER = '.markdown, .text-editor-preview-area';
    var scheduled = false;
    var pendingModalEdit = null;
    var viewer = null;

    /* ---------------------------------------------------------------- config */

    function meta(name, fallback) {
        var element = document.querySelector('meta[name="drawio-' + name + '"]');
        var value = element ? element.getAttribute('content') : '';
        return value || fallback;
    }

    function label(name, fallback) {
        return meta('label-' + name, fallback);
    }

    function maxPayloadSize() {
        return parseInt(meta('max-payload', '0'), 10) || 0;
    }

    /* --------------------------------------------------------------- rendering */

    function render(root) {
        var blocks = root.querySelectorAll('pre > code.language-diagram:not([data-drawio])');

        for (var i = 0; i < blocks.length; i++) {
            renderBlock(blocks[i]);
        }
    }

    function renderBlock(code) {
        var payload = code.textContent.replace(/\s+/g, '');
        var pre = code.parentNode;

        code.setAttribute('data-drawio', 'rendered');

        if (!KBDrawioMarkdown.isValidPayload(payload)) {
            pre.classList.add('drawio-diagram-invalid');
            pre.setAttribute('data-drawio-error', label('invalidPayload', 'This diagram could not be decoded.'));
            return;
        }

        var image = document.createElement('img');
        image.className = 'drawio-diagram-image';
        image.setAttribute('alt', label('alt', 'draw.io diagram'));
        image.setAttribute('loading', 'lazy');
        image.setAttribute('src', KBDrawioMarkdown.toDataUri(payload));

        var figure = document.createElement('figure');
        figure.className = 'drawio-diagram';
        figure.appendChild(image);

        figure.appendChild(buildActions(pre, resolveSurface(pre)));

        pre.classList.add('drawio-diagram-source');
        pre.parentNode.insertBefore(figure, pre);
    }

    /**
     * The actions under a diagram.
     *
     * Looking and writing are separate permissions: every diagram can be opened full size,
     * because that is reading, while Edit appears only where Kanboard itself offers a way
     * to change the surrounding Markdown. The presence of this block therefore says nothing
     * about whether a diagram is editable — `a.drawio-diagram-edit` does.
     */
    function buildActions(pre, surface) {
        var actions = document.createElement('div');
        actions.className = 'drawio-diagram-actions';

        /* Read the payload at click time, not now: an edit rewrites the block in place
         * (refreshRendered), and a captured payload would reopen the diagram as it was
         * before that edit. */
        actions.appendChild(action('drawio-diagram-view', 'search-plus', label('view', 'View full size'), function () {
            openViewer(payloadOf(pre));
        }));

        if (surface !== null) {
            actions.appendChild(action('drawio-diagram-edit', 'pencil-square-o', label('edit', 'Edit diagram'), function () {
                startEdit(pre, surface);
            }));
        }

        return actions;
    }

    function action(className, iconName, text, onClick) {
        var link = document.createElement('a');
        link.setAttribute('href', '#');
        link.className = className;
        link.appendChild(icon(iconName));
        link.appendChild(document.createTextNode(' ' + text));
        link.addEventListener('click', function (event) {
            event.preventDefault();
            onClick();
        }, false);

        return link;
    }

    function icon(name) {
        var element = document.createElement('i');
        element.className = 'fa fa-' + name + ' fa-fw';
        element.setAttribute('aria-hidden', 'true');
        return element;
    }

    /* ------------------------------------------------------------ block identity */

    /**
     * The ordinal of a diagram inside the Markdown document it was rendered
     * from. Kanboard renders block elements in source order, so the nth
     * rendered diagram of a container is the nth ```diagram fence of its
     * source. The ordinal is only ever a proposal — `locateDiagram()` confirms
     * it against the payload before anything is written.
     */
    function diagramIndex(pre) {
        var container = pre.closest(MARKDOWN_CONTAINER) || document.body;
        var blocks = container.querySelectorAll('code.language-diagram');
        var code = pre.querySelector('code.language-diagram');

        return Array.prototype.indexOf.call(blocks, code);
    }

    function payloadOf(pre) {
        return pre.textContent.replace(/\s+/g, '');
    }

    /**
     * Where the Markdown behind a rendered diagram can be edited.
     *
     * Either it is already on screen in a Kanboard text editor (the preview
     * pane), or the plugin borrows the edit action Kanboard itself renders for
     * that surface — which is also how the plugin inherits Kanboard's
     * permissions: no edit link, no edit button.
     */
    function resolveSurface(pre) {
        var editor = pre.closest('.text-editor');

        if (editor !== null) {
            var textarea = editor.querySelector('textarea');
            return textarea === null ? null : {kind: 'textarea', textarea: textarea};
        }

        if (typeof KB === 'undefined' || typeof KB.modal === 'undefined') {
            return null;
        }

        var comment = pre.closest('.comment');

        if (comment !== null) {
            return modalSurface(comment.querySelector('.comment-actions a.js-modal-medium'), 'medium');
        }

        var taskView = document.getElementById('task-view');

        if (taskView !== null && taskView.contains(pre)) {
            return modalSurface(taskView.querySelector('.sidebar a.js-modal-large'), 'large');
        }

        return null;
    }

    function modalSurface(link, size) {
        if (link === null || !link.getAttribute('href')) {
            return null;
        }

        return {kind: 'modal', url: link.getAttribute('href'), size: size};
    }

    /* ---------------------------------------------------------------- editing */

    function startEdit(pre, surface) {
        var index = diagramIndex(pre);
        var payload = payloadOf(pre);

        if (surface.kind === 'textarea') {
            editInTextarea(surface.textarea, index, payload, pre);
            return;
        }

        /* The Markdown lives in a form we have not opened yet. Open Kanboard's
         * own edit modal and pick the diagram up again once its textarea is
         * on screen. */
        pendingModalEdit = {index: index, payload: payload, pre: pre};
        KB.modal.open(surface.url, surface.size, false);
    }

    function onModalRendered() {
        if (pendingModalEdit === null) {
            return;
        }

        var request = pendingModalEdit;
        var textarea = document.querySelector('#modal-content .text-editor textarea');

        pendingModalEdit = null;

        if (textarea !== null) {
            editInTextarea(textarea, request.index, request.payload, request.pre);
        }
    }

    function editInTextarea(textarea, index, payload, pre) {
        var fence = KBDrawioMarkdown.locateDiagram(textarea.value, index, payload);

        if (!isWritable(fence) || !confirmQuotedEdit(fence)) {
            return;
        }

        KBDrawioEditor.open({
            svg: KBDrawioMarkdown.decodePayload(fence.payload),
            title: label('edit', 'Edit diagram'),
            onSave: function (newPayload) {
                saveIntoTextarea(textarea, index, fence.payload, newPayload, pre);
            }
        });
    }

    function saveIntoTextarea(textarea, index, oldPayload, newPayload, pre) {
        if (!withinBudget(newPayload)) {
            return;
        }

        /* Locate again: the user may have typed in the textarea while draw.io
         * was open, so the offsets captured earlier can be stale. */
        var fence = KBDrawioMarkdown.locateDiagram(textarea.value, index, oldPayload);

        if (!isWritable(fence)) {
            return;
        }

        replaceRange(
            textarea,
            fence.contentStart,
            fence.contentEnd,
            KBDrawioMarkdown.fenceReplacement(fence, newPayload)
        );
        refreshRendered(pre, newPayload);
    }

    /** Keep the on-screen diagram in step with the textarea until the next render. */
    function refreshRendered(pre, payload) {
        if (!pre || !pre.parentNode) {
            return;
        }

        var code = pre.querySelector('code.language-diagram');
        var figure = pre.previousElementSibling;

        if (code !== null) {
            code.textContent = payload;
        }

        if (figure !== null && figure.classList.contains('drawio-diagram')) {
            figure.querySelector('img').setAttribute('src', KBDrawioMarkdown.toDataUri(payload));
        }
    }

    /* ----------------------------------------------------------------- viewing */

    /**
     * Show a diagram as large as the screen allows.
     *
     * The inline render is capped by whatever column it sits in — and by Kanboard's own
     * `.markdown img { max-width: 80% }` — which frequently leaves a diagram too small to
     * read. This is the only affordance a reader without edit rights has, so it does
     * nothing but display: the same `data:` URI, in a fresh `<img>`, with no frame, no
     * request and no way to change anything.
     */
    function openViewer(payload) {
        /* The editor owns the screen while it is open, and pins Escape in the capture
         * phase. One overlay at a time keeps the two from fighting over the key. */
        if (viewer !== null || (typeof KBDrawioEditor !== 'undefined' && KBDrawioEditor.isOpen())) {
            return;
        }

        if (!KBDrawioMarkdown.isValidPayload(payload)) {
            return;
        }

        var image = document.createElement('img');
        image.className = 'drawio-viewer-image';
        image.setAttribute('alt', label('alt', 'draw.io diagram'));
        image.setAttribute('src', KBDrawioMarkdown.toDataUri(payload));
        image.addEventListener('click', toggleActualSize, false);

        var surface = document.createElement('div');
        surface.className = 'drawio-viewer-surface';
        surface.appendChild(image);

        var close = document.createElement('button');
        close.setAttribute('type', 'button');
        close.className = 'drawio-viewer-close';
        close.setAttribute('aria-label', label('close', 'Close'));
        close.appendChild(icon('times'));
        close.addEventListener('click', closeViewer, false);

        var overlay = document.createElement('div');
        overlay.className = 'drawio-viewer-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', label('view', 'View full size'));
        overlay.appendChild(close);
        overlay.appendChild(surface);

        /* Only the backdrop dismisses. Clicking the picture is how you zoom it, and a
         * misplaced click should not throw away what you were looking at. */
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay || event.target === surface) {
                closeViewer();
            }
        }, false);

        viewer = {overlay: overlay, image: image, close: close, restoreFocus: document.activeElement};

        window.addEventListener('keydown', onViewerKeyDown, true);
        document.body.appendChild(overlay);
        document.body.classList.add('drawio-viewer-open');
        close.focus();
    }

    function closeViewer() {
        if (viewer === null) {
            return;
        }

        var current = viewer;
        viewer = null;

        window.removeEventListener('keydown', onViewerKeyDown, true);
        current.overlay.remove();
        document.body.classList.remove('drawio-viewer-open');

        if (current.restoreFocus && typeof current.restoreFocus.focus === 'function') {
            current.restoreFocus.focus();
        }
    }

    /**
     * Fit to the viewport, or the diagram's own size inside a scrolling surface.
     *
     * Fitting is the default because scaling vector art up is lossless and a small diagram
     * should fill the screen. It is the wrong answer for a very wide one, where fitting
     * shrinks the text again — hence the toggle.
     */
    function toggleActualSize() {
        if (viewer !== null) {
            viewer.image.classList.toggle('drawio-viewer-image-actual');
        }
    }

    function onViewerKeyDown(event) {
        if (viewer === null) {
            return;
        }

        if (event.key === 'Escape') {
            /* Stop Kanboard from also closing the modal underneath us. */
            event.stopPropagation();
            event.preventDefault();
            closeViewer();
            return;
        }

        /* The dialog holds exactly one focusable control, so keeping focus inside it is
         * keeping it on that control. */
        if (event.key === 'Tab') {
            event.preventDefault();
            viewer.close.focus();
        }
    }

    /* --------------------------------------------------------------- inserting */

    function insertDiagram(textarea) {
        var selectionStart = textarea.selectionStart;
        var selectionEnd = textarea.selectionEnd;

        KBDrawioEditor.open({
            svg: '',
            title: label('insert', 'Insert diagram'),
            onSave: function (payload) {
                if (!withinBudget(payload)) {
                    return;
                }

                var result = KBDrawioMarkdown.insertFence(textarea.value, selectionStart, selectionEnd, payload);
                replaceRange(textarea, selectionStart, selectionEnd, result.insertedText);
            }
        });
    }

    function enhanceToolbars(root) {
        var toolbars = root.querySelectorAll('.text-editor-write-mode > .text-editor-toolbar:not([data-drawio])');

        for (var i = 0; i < toolbars.length; i++) {
            enhanceToolbar(toolbars[i]);
        }
    }

    function enhanceToolbar(toolbar) {
        toolbar.setAttribute('data-drawio', 'enhanced');

        var textarea = toolbar.parentNode.querySelector('textarea');

        if (textarea === null) {
            return;
        }

        var link = document.createElement('a');
        link.setAttribute('href', '#');
        link.setAttribute('title', label('insert', 'Insert diagram'));
        link.setAttribute('aria-label', label('insert', 'Insert diagram'));
        link.className = 'drawio-insert-button';
        link.appendChild(icon('sitemap'));
        link.addEventListener('click', function (event) {
            event.preventDefault();
            insertDiagram(textarea);
        }, false);

        toolbar.appendChild(link);
    }

    /* ----------------------------------------------------------------- helpers */

    /**
     * Whether a located fence may be written back.
     *
     * A diagram inside a blockquote — what a reply to a comment produces, since
     * TextHelper::reply() prefixes every line with "> " — is editable as long as
     * its payload region is entirely inside the quote, because then the region
     * can be replaced by one quoted line and nothing else moves. When it is not,
     * rewriting would delete a blank line or absorb an unquoted one, so the
     * plugin refuses instead of normalising the user's document.
     */
    function isWritable(fence) {
        if (fence === null) {
            window.alert(label('notFound', 'This diagram is no longer where it was in the Markdown source. Refresh the page and try again.'));
            return false;
        }

        if (!KBDrawioMarkdown.isWritableFence(fence)) {
            window.alert(label('quoted', 'This diagram is inside a quoted block that is not consistently quoted, so editing it here could damage the quotation.'));
            return false;
        }

        return true;
    }

    /**
     * Editing a quoted diagram rewrites a quotation — words attributed to
     * someone else. It is the only successful edit in the plugin that changes
     * text the user did not write, so it is worth one confirmation.
     */
    function confirmQuotedEdit(fence) {
        return !fence.quoted || window.confirm(
            label('quotedConfirm', 'This diagram is inside a quoted block. Editing it changes the quotation. Continue?')
        );
    }

    function withinBudget(payload) {
        var max = maxPayloadSize();

        if (max > 0 && KBDrawioMarkdown.payloadSize(payload) > max) {
            window.alert(label('tooLarge', 'This diagram is too large to be stored in this Markdown field.'));
            return false;
        }

        return true;
    }

    /**
     * Write into the textarea through `insertText` so the change joins the
     * browser's native undo stack, exactly as Kanboard's own toolbar does.
     */
    function replaceRange(textarea, start, end, text) {
        var applied = false;

        textarea.focus();
        textarea.setSelectionRange(start, end);

        if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            applied = document.execCommand('insertText', false, text);
        }

        if (!applied) {
            textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
            textarea.setSelectionRange(start + text.length, start + text.length);
            textarea.dispatchEvent(new Event('input', {bubbles: true}));
        }

        /* Kanboard watches "change" to know a modal form is dirty. */
        textarea.dispatchEvent(new Event('change', {bubbles: true}));
    }

    /* -------------------------------------------------------------- lifecycle */

    function refresh() {
        scheduled = false;
        render(document);
        enhanceToolbars(document);
    }

    function schedule() {
        if (!scheduled) {
            scheduled = true;
            window.requestAnimationFrame(refresh);
        }
    }

    function observe() {
        var observer = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                if (records[i].addedNodes.length > 0) {
                    schedule();
                    return;
                }
            }
        });

        observer.observe(document.body, {childList: true, subtree: true});
    }

    function start() {
        refresh();
        observe();

        if (typeof KB !== 'undefined') {
            KB.on('modal.afterRender', function () {
                refresh();
                onModalRendered();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, false);
    } else {
        start();
    }
}());
