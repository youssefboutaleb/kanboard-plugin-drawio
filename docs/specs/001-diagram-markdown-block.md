# Spec 001 — Draw.io diagrams in Kanboard Markdown

> Status: implemented (v0.1.0, Milestone 1)
> Milestone: 1
> Author: initial bootstrap

Written retrospectively from the implementation so the spec-driven loop starts from a
worked example. Later features follow `000-template.md`.

## Problem

A Kanboard task description or comment can hold code, tables and links, but not a diagram.
Users keep architecture diagrams somewhere else — a wiki, a file attachment, an image
export — and the copy in Kanboard goes stale because nobody can edit it where it is read.

The user already has Markdown content using Wiki.js's ` ```diagram ` representation and
wants it to work in Kanboard, without gaining a wiki in the process.

## Verified facts

| Fact | Source | Consequence |
|---|---|---|
| `TextHelper::markdown()` is the single render entry point and hardcodes `new Markdown(...)` | `app/Helper/TextHelper.php:47` | A parser subclass is reachable only by replacing the whole helper |
| `blockFencedCode()` emits `class="language-<first token>"` | `libs/erusev/parsedown/Parsedown.php` | ` ```diagram ` **already** renders as `<pre><code class="language-diagram">` with no plugin |
| Payload survives rendering byte-identical | live container, task created via JSON-RPC | The rendered DOM can be trusted as the payload source |
| Default CSP has no `frame-src`; `img-src` is `* data:` | `app/ServiceProvider/ClassProvider.php:187` | One directive must be added; the `data:` image needs nothing |
| `setContentSecurityPolicy()` replaces the whole array | `app/Core/Plugin/Base.php:29` | Rules must be read back and merged |
| Kanboard renders edit actions only for permitted users | `app/Template/task/sidebar.php:27`, `app/Template/comment/show.php:52` | Borrowing those links inherits the permission model |
| Wiki.js stores base64 of the `xmlsvg` export and reloads it by decoding | `requarks/wiki` `editor-modal-drawio.vue`, `editor-markdown.vue` | The format is reusable verbatim |
| draw.io embed mode: `init` → `load` → `save` → `export` (`xmlsvg`) | drawio.com embed-mode docs, confirmed by Wiki.js's working client | The protocol to implement |
| MySQL stores descriptions/comments as `TEXT` (65535 bytes) | `app/Schema/Mysql.php:196`, `:1660` | Oversized payloads truncate the **whole field**; a budget is mandatory |

## Design

- `Plugin.php` — attaches `template:layout:{head,css,js}`, merges one CSP directive, exposes
  `DRAWIO_EMBED_URL` and `DRAWIO_MAX_PAYLOAD_SIZE`. No route, no controller, no schema.
- `Template/layout/config.php` — configuration and translated strings as `<meta>` tags,
  because CSP refuses inline `<script>`.
- `Asset/js/drawio-markdown.js` — pure logic: fence tokenizer mirroring Parsedown, block
  location, payload validation and encoding. DOM-free, testable under Node.
- `Asset/js/drawio-editor.js` — the draw.io iframe and the JSON protocol, with origin and
  source-window pinning.
- `Asset/js/drawio-ui.js` — renders blocks as `<img>`, appends the toolbar button, resolves
  the editable surface, writes back into the textarea.

New couplings to Kanboard markup: the seven anchors listed in `ARCHITECTURE.md`.

## Rejected alternatives

- **Server-side rendering via a `TextHelper` override (architectures B and C).** Buys only
  server-side output, which matters solely for notification emails — where SVG and `data:`
  URIs are blocked by most clients anyway. Costs a permanent dependency on `TextHelper` and
  `Core\Markdown`, a copied `markdown()` body, and a conflict with any other plugin that
  overrides the same helper. Can be added later without changing the stored format.
- **Raw `<mxfile>` XML in the fence.** Smaller, but not renderable without a round trip to
  draw.io, and incompatible with the user's existing Wiki.js content.
- **Base64url XML.** Same incompatibility, no rendering benefit.
- **Inline SVG rendering, as Wiki.js does.** Makes scripts and event handlers live and
  requires a sanitiser; `<img>` gets the same picture with none of that.
- **An `id=` in the fence info string to identify blocks.** Pollutes the Markdown, breaks
  Wiki.js compatibility, and is unnecessary given ordinal + payload confirmation.

## Storage impact

None. The Markdown field is the only storage. The plugin never writes to Kanboard; it
writes into a textarea and Kanboard's own form saves it.

## Security review

- **DOM**: the payload reaches the page only as `<img src="data:image/svg+xml;base64,…">`.
  SVG in an `<img>` runs in the browser's restricted "SVG as an image" mode — no scripts,
  no event handlers, no external subresource fetches. Nothing is sanitised because nothing
  needs to be.
- **Origin boundary**: one, the draw.io frame. Messages are accepted only when origin and
  source window both match; outgoing messages target the explicit origin, never `'*'`.
- **CSP**: widened by exactly `frame-src 'self' <embed origin>`. `img-src * data:` was
  already there in stock Kanboard.
- **Input into Markdown**: only canonical base64 of an SVG document is written. The base64
  alphabet has no backtick, tilde or newline, so a payload cannot break out of its fence.
- **Authorisation and CSRF**: unchanged — no endpoint exists, and the save is Kanboard's
  own form.

## Tests

| Test | File | What it proves |
|---|---|---|
| Tokenizer parity over 21 fixtures | `test/parity.test.js` | The JS tokenizer sees what Parsedown sees, so ordinals are sound |
| Duplicate-diagram edit | `test/markdown.test.js`, `test/dom.test.js` | Editing one of two identical diagrams leaves the other byte-identical |
| Ambiguous relocation | `test/markdown.test.js` | The write is refused rather than guessed |
| Quoted fence | `test/parity.test.js`, `test/dom.test.js` | Counted for ordinals, refused for writing |
| Payload validation | `test/payload.test.js` | Non-base64, non-SVG and fence-breaking input rejected |
| Hostile SVG | `test/payload.test.js`, `test/dom.test.js` | Never becomes markup; no `<svg>` or `<script>` node is created |
| Permission-derived buttons | `test/dom.test.js` | No Kanboard edit action → no Edit button |
| Insert / preview edit / modal edit | `test/dom.test.js` | The three user flows, end to end against Kanboard's markup |
| Storage budget | `test/dom.test.js` | An oversized payload is refused before the textarea is touched |

## Failure modes

| Break | What the user sees |
|---|---|
| JavaScript disabled or broken | A "◇ draw.io diagram" placeholder; the Markdown is intact |
| Parsedown stops emitting `language-diagram` | A plain code block; the Markdown is intact |
| draw.io unreachable or CSP misconfigured | The editor frame stays blank; nothing is written |
| Block cannot be located | An explicit refusal message; the textarea is untouched |
| Payload over budget | An explicit refusal message; the textarea is untouched |
| Plugin disabled or removed | The ` ```diagram ` blocks are exactly as they were |
