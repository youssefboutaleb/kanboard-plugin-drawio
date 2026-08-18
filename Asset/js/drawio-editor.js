/**
 * Draw.io for Kanboard — embedded editor.
 *
 * Wraps the draw.io "embed mode" JSON protocol
 * (https://www.drawio.com/doc/faq/embed-mode): the editor announces itself with
 * `{event: 'init'}`, we answer with a `load` action, and when the user saves we
 * ask for an `xmlsvg` export and keep the base64 half of the returned data URI.
 */
var KBDrawioEditor = (function () {
    'use strict';

    var DEFAULT_EMBED_URL = 'https://embed.diagrams.net/';
    var session = null;

    function config() {
        var element = document.querySelector('meta[name="drawio-embed-url"]');
        var url = element ? element.getAttribute('content') : '';
        return url || DEFAULT_EMBED_URL;
    }

    function embedUrl() {
        var base = config();
        var separator = base.indexOf('?') === -1 ? '?' : '&';

        /* saveAndExit + noSaveBtn give a single "Save" button that closes the
         * editor, which is the only sensible model when the host owns storage. */
        return base + separator + 'embed=1&proto=json&spin=1&libraries=1&saveAndExit=1&noSaveBtn=1&noExitBtn=0';
    }

    function embedOrigin() {
        return new URL(embedUrl(), window.location.href).origin;
    }

    /**
     * Open draw.io on `options.svg` (an SVG string, or empty for a new diagram).
     *
     * `options.onSave` receives the base64 payload ready to be written into a
     * ```diagram fence. `options.onClose` always runs afterwards.
     */
    function open(options) {
        if (session !== null) {
            return;
        }

        var origin = embedOrigin();

        var iframe = document.createElement('iframe');
        iframe.className = 'drawio-editor-frame';
        iframe.setAttribute('title', options.title || 'draw.io');
        iframe.setAttribute('frameborder', '0');
        /* The frame is cross-origin, so "allow-same-origin" grants it nothing
         * of ours; it only lets draw.io keep using its own storage. */
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads');
        iframe.setAttribute('src', embedUrl());

        var overlay = document.createElement('div');
        overlay.className = 'drawio-editor-overlay';
        overlay.appendChild(iframe);

        session = {
            iframe: iframe,
            overlay: overlay,
            origin: origin,
            svg: options.svg || '',
            title: options.title || '',
            onSave: options.onSave || function () {},
            onClose: options.onClose || function () {},
            saved: false
        };

        window.addEventListener('message', onMessage, false);
        window.addEventListener('keydown', onKeyDown, true);
        document.body.appendChild(overlay);
        document.body.classList.add('drawio-editor-open');
    }

    function close() {
        if (session === null) {
            return;
        }

        var current = session;
        session = null;

        window.removeEventListener('message', onMessage, false);
        window.removeEventListener('keydown', onKeyDown, true);
        current.overlay.remove();
        document.body.classList.remove('drawio-editor-open');
        current.onClose();
    }

    function isOpen() {
        return session !== null;
    }

    /* draw.io owns the Escape key inside its own document; this only stops
     * Kanboard from closing the modal underneath us. */
    function onKeyDown(event) {
        if (session !== null && event.key === 'Escape') {
            event.stopPropagation();
        }
    }

    function send(message) {
        session.iframe.contentWindow.postMessage(JSON.stringify(message), session.origin);
    }

    /**
     * Both checks matter: the origin proves the message came from draw.io, and
     * the source window proves it came from *our* frame rather than any other
     * draw.io frame or opener on the page.
     */
    function onMessage(event) {
        if (session === null || event.origin !== session.origin || event.source !== session.iframe.contentWindow) {
            return;
        }

        if (typeof event.data !== 'string' || event.data.length === 0) {
            return;
        }

        var message;

        try {
            message = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        switch (message.event) {
            case 'init':
                send({
                    action: 'load',
                    autosave: 0,
                    modified: 'unsavedChanges',
                    xml: session.svg,
                    title: session.title
                });
                break;

            case 'save':
                send({action: 'export', format: 'xmlsvg'});
                break;

            case 'export':
                onExport(message);
                break;

            case 'exit':
                close();
                break;
        }
    }

    function onExport(message) {
        var data = typeof message.data === 'string' ? message.data : '';
        var marker = data.indexOf('base64,');
        var payload = marker === -1 ? '' : data.slice(marker + 7);

        if (!KBDrawioMarkdown.isValidPayload(payload)) {
            window.alert(label('invalidExport', 'draw.io returned a diagram that could not be read. Nothing was changed.'));
            close();
            return;
        }

        var handler = session.onSave;
        session.saved = true;
        close();
        handler(payload);
    }

    function label(name, fallback) {
        var element = document.querySelector('meta[name="drawio-label-' + name + '"]');
        var value = element ? element.getAttribute('content') : '';
        return value || fallback;
    }

    return {
        open: open,
        close: close,
        isOpen: isOpen,
        label: label,
        embedOrigin: embedOrigin
    };
}());
