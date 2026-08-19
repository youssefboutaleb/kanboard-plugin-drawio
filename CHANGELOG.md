# Changelog

## Unreleased

* Diagrams inside a blockquote can now be edited. The payload is rewritten with
  the quote prefix the fence already had — `> `, `> > `, `>` and indented
  variants are all reproduced verbatim — and editing a quotation asks for
  confirmation first. A fence whose payload line is not itself quoted, or one
  broken by a blank line, is still refused: rewriting either would change the
  document's structure rather than just its payload.
* Diagrams stay legible on Kanboard's dark theme. A diagram whose own background
  is transparent used to be dark strokes on `#222`; every diagram now renders on
  a constant light surface, in every theme, so it looks the same wherever it is
  read. The plugin's own placeholder and error colours follow Kanboard's theme
  variables instead of being fixed to the light theme's values, and the editor
  backdrop matches the page rather than flashing white.

## 0.1.1 — 2026-08-18

Documentation only. No change to the plugin's code, its stored format, or its
behaviour; upgrading from 0.1.0 changes nothing a user can observe.

* Corrected a false limitation in the README. Public (token) **task** views do
  render diagrams: Kanboard withholds its own scripts on `not_editable` pages but
  attaches plugin assets outside that guard, so the plugin loads, renders every
  diagram as an image, and offers no edit action — which is the wanted behaviour
  for a reader who has no edit rights. The public **board** still shows none, for
  a different reason: its cards carry no Markdown at all.
* Documented what public and read-only views do, in `README.md` and
  `ARCHITECTURE.md`, and pinned it with tests against a real captured page.

## 0.1.0 — 2026-08-18

First working version.

* Render ` ```diagram ` blocks as images on every Kanboard Markdown surface.
* Edit an existing diagram from the rendered view or the editor preview, where
  Kanboard offers an edit action for the surrounding text.
* Insert a new diagram from the Markdown toolbar.
* Wiki.js-compatible payload: base64 of draw.io's `xmlsvg` export.
* `frame-src` added to Kanboard's Content-Security-Policy for the draw.io editor,
  merged into the existing rules rather than replacing them.
* `DRAWIO_EMBED_URL` points the editor at a self-hosted draw.io. A relative URL is
  treated as same-origin and adds no third-party origin to the policy.
* `DRAWIO_MAX_PAYLOAD_SIZE` refuses a diagram too large for the Markdown field
  before anything is written — MySQL stores descriptions and comments in a `TEXT`
  column, where an overflow truncates the whole field.
