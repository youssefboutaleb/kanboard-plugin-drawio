# Changelog

## 0.1.0 — unreleased

First working version.

* Render ` ```diagram ` blocks as images on every Kanboard Markdown surface.
* Edit an existing diagram from the rendered view or the editor preview, where
  Kanboard offers an edit action for the surrounding text.
* Insert a new diagram from the Markdown toolbar.
* Wiki.js-compatible payload: base64 of draw.io's `xmlsvg` export.
* `frame-src` added to Kanboard's Content-Security-Policy for the draw.io editor.
