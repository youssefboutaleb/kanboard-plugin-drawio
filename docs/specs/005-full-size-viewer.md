# Spec 005 — Full-size viewer

> Status: implemented (Milestone 4, Task 23)
> Milestone: 4
> Author: Milestone 4 planning

## Problem

A diagram is rendered inline at whatever width its column allows — and Kanboard's own
`.markdown img { max-width: 80% }` caps it further, so a diagram in a comment is often too
small to read. The only way to see it properly today is **Edit diagram**, which opens
draw.io. That is the wrong tool for reading, and it is unavailable to exactly the people
most likely to be reading rather than writing: users without edit rights, and anonymous
readers on a public task link, who Task 20 established are a real audience with **no
affordance at all**.

## Verified facts

| Fact | Source | Consequence |
|---|---|---|
| `.markdown img { max-width: 80% }` outranks the plugin's class | `assets/css/light.min.css` (Task 24) | Inline size is Kanboard's to decide; a bigger view has to happen outside `.markdown` |
| Kanboard's highest `z-index` is 9999 (alerts); modals are 100 and dropdowns 1000 | `assets/css/light.min.css` | A viewer at 9998 sits above the page and Kanboard's modals, below its alerts and below the draw.io editor's 10000 |
| Font Awesome 4.7.0 ships `fa-search-plus`, `fa-compress`, `fa-times`, `fa-expand` | `assets/css/vendor.min.css` | The icons this needs exist; no new asset |
| `resolveSurface()` returns null when there is no text editor and no borrowable edit link | `Asset/js/drawio-ui.js` | "Can edit" and "can look" are already separable; only the actions block was gated on the former |
| The editor overlay pins Escape with a capture-phase listener while a session is open | `Asset/js/drawio-editor.js` | A second overlay must not fight it — the two are made mutually exclusive |
| `img-src * data:` already covers the rendered payload | `ServiceProvider/ClassProvider.php:187` | No CSP change: the viewer shows the same `data:` URI the page already loaded |

## Design

A **View full size** action on every rendered diagram, next to Edit where Edit exists and
alone where it does not, opening a plugin-owned overlay.

`Asset/js/drawio-ui.js`

- `buildActions()` always renders the view action and appends the edit action only when
  `resolveSurface()` found somewhere to write. The actions block is therefore no longer
  evidence that a diagram is editable — the tests that used it that way are updated to
  assert the absence of the *edit link*, which is what the permission model actually
  guarantees.
- `openViewer(payload)` builds an overlay containing the same `data:` URI in a fresh
  `<img>`, a close button, and nothing else. It refuses to open while the draw.io editor
  is open, so only one overlay can exist at a time and the Escape handlers cannot fight.
- Closing: the close button, Escape, or a click on the backdrop. Escape is taken in the
  capture phase and stopped, so Kanboard does not also close the modal underneath.
- Focus: the close button receives focus on open, focus returns to the trigger on close,
  and Tab is held inside the dialog (which has exactly one focusable control).
- Clicking the image toggles between **fit** (the default: as large as the viewport allows,
  which for vector SVG is lossless) and **actual size** inside a scrolling surface, for the
  wide diagrams that fitting makes small again.

`Asset/css/drawio.css` — the overlay, its surface, the two sizing modes, and the close
button. The image keeps the same opaque surface Task 24 gave the inline one, for the same
reason.

`Template/layout/config.php` — two strings, `view` and `close`.

No new module (the plugin's three keep one responsibility each, and this is DOM), no route,
no storage, no CSP change, no `KB` dependency.

## Rejected alternatives

- **Opening the `data:` URI in a new tab.** Browsers block top-level navigation to `data:`
  URIs, and it would leave Kanboard.
- **draw.io's `lightbox=1` viewer in an iframe.** A third-party round trip, a frame, and a
  network dependency to display an image the page has already downloaded — and it would be
  unavailable exactly where the CSP or an offline install makes `embed.diagrams.net`
  unreachable.
- **Reusing the editor overlay in a read-only mode.** It exists to host a cross-origin
  frame and speak a protocol; a viewer needs neither. Sharing them would couple the one
  piece of the plugin that talks to a third party to the one piece anonymous readers use.
- **A pan-and-zoom control (wheel zoom, drag to pan).** Real value for very large diagrams,
  but it is a component, not an affordance: pointer capture, touch, momentum, zoom limits.
  The fit/actual toggle covers the same need at a fraction of the surface area. Revisit if
  the toggle proves insufficient.
- **Showing the viewer only where Edit is absent.** Tempting, but a reader with edit rights
  has the same eyes. The affordance is about reading, not permission.

## Storage impact

None. The viewer never writes; it renders a payload the page already holds.

## Security review

- **Does anything reach the DOM that is not an `<img>` `data:` URI?** No. The viewer builds
  an `<img>` with `createElement` and sets `src` to the same validated payload the inline
  render uses. No `innerHTML`, no inline SVG.
- **Does anything new cross an origin boundary?** No. No frame, no network request: the
  `data:` URI is already in the document.
- **Does this widen the CSP?** No.
- **Can any input reach the Markdown without validation?** There is no write path here.

The payload shown is untrusted content, and it stays inside an `<img>`, which the browser
renders in the restricted "SVG as an image" mode — no scripts, no event handlers, no
external fetches. This is the same boundary the inline render relies on; the viewer does
not weaken it, and notably it is now the *only* interactive affordance an anonymous reader
has, which is why it does nothing but display.

## Tests

| Test | File | What it proves |
|---|---|---|
| every diagram offers a full-size view | `test/dom.test.js` | The affordance exists wherever a diagram renders |
| the viewer shows the diagram and injects no markup | `test/dom.test.js` | Same `data:` URI, no inline SVG, no script |
| Escape closes the viewer and does not reach Kanboard | `test/dom.test.js` | The modal underneath survives |
| the backdrop closes the viewer, the image does not | `test/dom.test.js` | Clicking the picture is not an accidental dismiss |
| clicking the image toggles actual size | `test/dom.test.js` | The wide-diagram escape hatch works |
| the viewer refuses to open while draw.io is open | `test/dom.test.js` | One overlay at a time; no Escape contention |
| focus moves into the dialog and returns to the trigger | `test/dom.test.js` | Keyboard users are not stranded |
| a repeated render does not duplicate the action | `test/dom.test.js` | Idempotent under the MutationObserver |
| a public reader can view full size but still cannot edit | `test/public-view.test.js` | The point of the task, and the permission model intact |

Two existing tests asserted "no `.drawio-diagram-actions`" as a proxy for "cannot edit".
That proxy is deliberately retired here: they now assert no `a.drawio-diagram-edit`, which
is the property the permission model actually provides.

## Failure modes

| If | The user sees |
|---|---|
| The payload is invalid | No figure is built at all, so no view action either — unchanged from today. |
| JavaScript is disabled | No action, and the CSS placeholder, exactly as before. |
| A very wide diagram is fitted to the viewport | Small text — one click on the image switches to actual size and scrolls. |
| The draw.io editor is already open | The viewer does not open. The editor is on top and owns the screen. |
