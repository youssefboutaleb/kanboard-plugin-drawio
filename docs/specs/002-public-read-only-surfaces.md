# Spec 002 — Public and read-only surfaces

> Status: implemented (Milestone 4, Task 20)
> Milestone: 4
> Author: Milestone 4 planning

## Problem

`README.md` told users that diagrams are not rendered on public (token) board views,
because those pages "load none of Kanboard's JavaScript". The first half is true and the
conclusion is false: Kanboard withholds *its own* scripts on those pages, not the plugin's.
A reader following a public task link sees the diagram; the documentation said they would
not, and no test held the behaviour in place, so a Kanboard change could have removed it
silently and nobody would have noticed a feature we did not know we had.

## Verified facts

| Fact | Source | Consequence |
|---|---|---|
| `not_editable` guards only `vendor.min.js` and `app.min.js`; `template:layout:css`, `template:layout:js` and `template:layout:head` are rendered outside that guard | `app/Template/layout.php` (1.2.53) | The plugin's three scripts, its stylesheet and its ten meta tags are served on public pages, with `KB` undefined |
| `TaskViewController::readonly()` renders `task/public` with `no_layout`, `not_editable` and `editable => false` | `app/Controller/TaskViewController.php:22` | The public task page is a normal Markdown surface with every edit affordance withheld |
| `task/description.php` renders `<article class="markdown">` for the public view too, via `$this->text->markdown($task['description'], $is_public)` | `app/Template/task/description.php` | ` ```diagram ` reaches the browser as `code.language-diagram`, exactly as on a private page |
| `comment/show.php` renders `.comment-actions` on a public page but omits the `js-modal-medium` edit entry, because `$editable` is false | `app/Template/comment/show.php:52` | The plugin's borrowed-link permission model already yields nothing to edit, independently of `KB` |
| `BoardViewController::readonly()` renders task cards; a description reaches the page only as `<span class="tooltip" data-href="/board/tooltip/…/description">` | `app/Controller/BoardViewController.php:22`, `app/Template/board/task_footer.php:123` | The public **board** carries no Markdown at all, and its tooltip is fetched by the Kanboard JS that public pages do not load |
| Live capture of a public task page holds all three plugin scripts, `drawio.css`, ten `drawio-*` meta tags, `<article class="markdown">`, two `code.language-diagram` blocks, zero `js-modal` links and no `app.min.js` | `test/fixtures/public-task.html`, captured from `kanboard/kanboard:v1.2.53` | The claim is checked against a real page rather than reasoned about |
| Running the plugin's three scripts over that page with `KB` undefined yields two `figure.drawio-diagram`, correct `data:` URIs, zero edit links, zero insert buttons and no error | `test/public-view.test.js` | Public rendering already works and now cannot regress unnoticed |

## Assumptions

None outstanding. The one assumption this task started from — that public pages load no
plugin JavaScript — was the defect being fixed.

## Design

No production code changes. The behaviour is correct as shipped; what was missing was
evidence and honest documentation.

- `test/capture-public-view.sh` — regenerates the fixture from a real instance: starts
  `kanboard/kanboard:v1.2.53` with the plugin mounted read-only, seeds a project, a task
  whose description holds a diagram and a comment holding a second one through JSON-RPC,
  enables public access and captures the page. Two substitutions keep the fixture stable:
  `filemtime()` cache-busting query strings are dropped, and `colorCss()`'s ~9KB of
  task-colour rules are replaced by a comment. Everything else is byte-verbatim.
- `test/fixtures/public-task.html` — that capture.
- `test/public-view.test.js` — six tests over the fixture, with `KB` left undefined.
- `README.md` — the false limitation replaced by what public views actually do, split into
  the task view (works) and the board (does not, for a different reason).
- `ARCHITECTURE.md` — a "Public and read-only surfaces" note plus a dependency-table row
  for the unconditional hooks in `layout.php`.

New coupling to Kanboard: the placement of `template:layout:{css,js,head}` outside
`layout.php`'s `not_editable` guard. It is recorded in `ARCHITECTURE.md` and asserted by
the first test in `test/public-view.test.js`, which fails loudly if a regenerated fixture
no longer carries the plugin's assets.

## Rejected alternatives

- **Hand-written markup for the fixture, as `test/dom.test.js` uses.** The whole point here
  is what Kanboard emits on a page nobody had inspected. Hand-written markup would have
  encoded the same assumption that produced the wrong README line.
- **Making the capture part of `scripts/agent-verify.sh`.** It needs Docker, a network pull
  and about a minute. It belongs with `test/parsedown-parity.php` as a tool run after a
  Kanboard upgrade, not in the pre-commit loop.
- **Rendering the public board's description tooltip.** It would mean reimplementing
  Kanboard's tooltip fetch on a page where Kanboard deliberately ships no JavaScript, to
  show a diagram inside a hover panel. Out of proportion; documented as a limitation.

## Storage impact

None. No production code changed, and the read path never writes.

## Security review

- **Does anything reach the DOM that is not an `<img>` `data:` URI?** No. The public page
  goes through the same `renderBlock()` as every other surface.
- **Does anything new cross an origin boundary?** No. No editor is opened on a public page:
  `resolveSurface()` returns null both because `KB` is undefined and because Kanboard
  rendered no edit link, and the test asserts both independently.
- **Does this widen the CSP?** No.
- **Can any input reach the Markdown without validation?** There is no write path here at
  all. An anonymous reader is offered no action.

One property worth naming: the payload rendered on a public page is untrusted content
authored by a logged-in user and shown to an anonymous visitor. It is still only ever an
`<img src="data:…">`, which the browser renders in the restricted "SVG as an image" mode —
no scripts, no event handlers, no external fetches.

## Tests

| Test | File | What it proves |
|---|---|---|
| the captured page carries the plugin and two diagrams, or the fixture is stale | `test/public-view.test.js` | The Kanboard-side precondition — assets served on a `not_editable` page — is checked, not assumed |
| diagrams render on a page that never loads Kanboard's JavaScript | `test/public-view.test.js` | The corrected claim, with `KB` undefined and no errors |
| a diagram in a public comment renders as well as one in the description | `test/public-view.test.js` | Both Markdown surfaces of the public page are covered |
| the fence survives rendering, so the payload is still the source of truth | `test/public-view.test.js` | Rendering is additive; the Markdown-only-storage rule holds on public pages |
| a public reader is offered nothing to edit | `test/public-view.test.js` | No edit link, no insert button, no actions block |
| still nothing to edit when a KB runtime exists but Kanboard rendered no edit action | `test/public-view.test.js` | The permission model is inherited from Kanboard's markup, not merely from `KB` being absent |

Verified to fail when it should: replacing `code.language-diagram` with another class name
in `drawio-ui.js` drops the rendered figures from two to zero.

Suite: 61 → **67 tests**, `npm test`.

## Failure modes

| If | The reader sees |
|---|---|
| Kanboard moves the asset hooks inside the `not_editable` guard | Public pages show the CSS placeholder "◇ draw.io diagram" instead of a picture. The Markdown is untouched, and the first test fails as soon as the fixture is regenerated. |
| A payload on a public page is corrupt | The `data-drawio-error` placeholder, same as anywhere else. |
| JavaScript is disabled | The payload stays hidden by CSS and the placeholder shows. Nothing leaks and nothing breaks. |
