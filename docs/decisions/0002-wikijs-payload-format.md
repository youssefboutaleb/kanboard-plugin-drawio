# 2. Store the Wiki.js payload format, render it through an `<img>`

Date: 2026-08-18
Status: accepted

## Context

Three formats could live inside the fence: raw `<mxfile>` XML, base64url-encoded XML, or
the base64 SVG that Wiki.js writes — draw.io's `xmlsvg` export, whose `content` attribute
carries the editable XML.

The user already has Markdown content in the Wiki.js representation. Reading
`requarks/wiki` confirmed the format precisely: `editor-modal-drawio.vue` exports with
`format: 'xmlsvg'` and stores `msg.data.slice(indexOf('base64,') + 7)` — the base64 half of
the returned data URI, nothing more — and `editor-markdown.vue` reopens a diagram by
base64-decoding that line and handing the SVG straight back to draw.io.

Wiki.js then renders it by decoding the base64 and injecting the SVG **inline**, stripping
the `content` attribute afterwards.

## Decision

Adopt the Wiki.js payload byte-for-byte. Reject its rendering: display the payload as
`<img src="data:image/svg+xml;base64,…">` and never as inline SVG markup.

## Consequences

**Gained**

- Existing Wiki.js diagrams paste into Kanboard and work; edited diagrams paste back.
- One payload serves as both the picture and the editable source, so no second copy can go
  stale.
- An SVG loaded through `<img>` runs in the browser's restricted "SVG as an image" mode:
  scripts do not run, event handlers do not fire, external subresources are not fetched.
  A hostile diagram is inert without a sanitiser, and diagrams cannot phone home. Wiki.js
  needs a downstream HTML sanitiser for exactly this reason; we need none.
- The base64 alphabet contains no backtick, tilde or newline, so a payload cannot terminate
  its own fence or inject Markdown around it.

**Given up**

- Size. An SVG export is far larger than raw `<mxfile>` XML, and base64 adds a third on top.
  On MySQL, where descriptions and comments are `TEXT` (65535 bytes) and overflow truncates
  the whole field, this is a real constraint — hence `DRAWIO_MAX_PAYLOAD_SIZE`, which
  refuses before writing, and the `MEDIUMTEXT` note in the README.
- Diagram text is not searchable through Kanboard's search, since the XML is inside base64.
  Raw XML would have been, at the cost of interoperability and rendering.

**Not chosen, and why**

- Raw `<mxfile>` XML: unrenderable without a round trip to draw.io, and incompatible with
  the content the user already has.
- Base64url XML: same incompatibility, no rendering benefit, and no smaller than it needs
  to be to matter.
