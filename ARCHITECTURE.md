# Architecture

What was verified in the Kanboard source, what was decided, and why.

References are to `kanboard/kanboard` at 1.2.53 and to the Parsedown 1.7.4 copy
vendored at `libs/erusev/parsedown/Parsedown.php`.

## Verified Kanboard findings

**Markdown rendering.** `Kanboard\Helper\TextHelper::markdown()` is the single
entry point (`app/Helper/TextHelper.php:47`). It constructs
`Kanboard\Core\Markdown` — a `Parsedown` subclass — with safe mode, escaped
markup and hard line breaks, and returns `$parser->text($text)`. `Core\Markdown`
adds only `#123` task links, `@user` mentions and a header rule; fenced code is
untouched.

**Fenced blocks.** `Parsedown::blockFencedCode()` turns an info string into
`class="language-<first token>"`, so a ` ```diagram ` fence becomes
`<pre><code class="language-diagram">payload</code></pre>`. The payload is
HTML-escaped, which is a no-op for base64. Confirmed on a live instance: a task
description holding two identical diagrams renders two such blocks in source
order with the payloads byte-identical to what was stored, alongside working
task links and mentions.

**Extending the parser from a plugin.** `TextHelper::markdown()` hardcodes
`new Markdown(...)`, so a `Core\Markdown` subclass can only be reached by
replacing the whole text helper. That is possible — `Core\Helper::register()`
overwrites an entry, and `Pimple` has not frozen it at plugin-load time
(`PluginProvider` runs last in `app/common.php`) — but it means copying the body
of `markdown()`, competing with any other plugin that overrides the same helper,
and re-verifying after every Kanboard release. It also affects *every* Markdown
surface at once, including notification emails. Rejected; see the architecture
comparison below.

**Plugin system.** `Core\Plugin\Loader::initializePlugin()` checks
`getCompatibleVersion()` against `APP_VERSION` before calling `initialize()`, and
logs incompatible plugins instead of failing. `Base::setContentSecurityPolicy()`
*replaces* `$container['cspRules']` wholesale, so rules must be read back and
merged. Template hooks resolve `'Drawio:layout/config'` to
`plugins/Drawio/Template/layout/config.php` (`Core\Template::getTemplateFile()`).
`AssetHelper::js()` emits `defer`, so scripts attached to `template:layout:js`
run in attach order after `app.min.js` and before `DOMContentLoaded`.

**CSP.** Stock rules are `default-src 'self'`, `style-src 'self' 'unsafe-inline'`,
`img-src * data:` (`ServiceProvider/ClassProvider.php:187`). There is no
`frame-src`, so frames fall back to `default-src` and the draw.io iframe would be
blocked; `img-src` already permits the `data:` URI a rendered diagram needs.
Verified on a running container: the plugin produces
`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data:; frame-src 'self' https://embed.diagrams.net;`.

**Editing surfaces.** `FormHelper::textEditor()` renders every Markdown field —
task descriptions, comments, project/swimlane/column/category descriptions — as
`<div class="js-text-editor">`, which `assets/js/components/text-editor.js` turns
into a write mode (toolbar + textarea) and a preview mode that posts to
`TaskAjaxController::preview` and injects the rendered HTML. One implementation
covers all of them.

**Permissions.** Task and comment editing are authorised by the controllers
themselves (`ProjectRoleHelper::canUpdateTask()`, the `editable` flag passed to
`comment/show.php`). Kanboard renders the edit affordance only when the user has
it: `#task-view .sidebar a.js-modal-large` exists only if
`hasProjectAccess('TaskModificationController', 'edit', …)`, and
`.comment-actions a.js-modal-medium` only if the comment is editable by this
user. The plugin borrows those links rather than inventing a permission model.

## Verified draw.io findings

Embed mode is driven by `postMessage` over the JSON protocol
(`embed=1&proto=json`). The editor emits `{event:'init'}` and expects a `load`
action carrying `xml`; on save it emits `{event:'save'}`; an
`{action:'export', format:'xmlsvg'}` request is answered with
`{event:'export', data:'data:image/svg+xml;base64,…', xml:…}`. `embed.diagrams.net`
serves the editor without `X-Frame-Options`, so it can be framed. draw.io accepts
an SVG that carries embedded XML as the `xml` of a `load` action, which is what
makes the stored payload directly re-editable.

## Wiki.js compatibility findings

Read from `requarks/wiki`:

- `server/modules/rendering/markdown-core/renderer.js` renders a `diagram` fence
  as `<pre class="diagram">` + `Buffer.from(str,'base64').toString()` — the fence
  holds base64 of an SVG, and Wiki.js injects that SVG **inline**.
- `server/modules/rendering/html-diagram/renderer.js` then strips the SVG's
  `content` attribute for display.
- `client/components/editor/editor-modal-drawio.vue` exports with
  `format:'xmlsvg'` and stores `msg.data.slice(indexOf('base64,')+7)` — the
  base64 half of the returned data URI, nothing more.
- `client/components/editor/editor-markdown.vue` reopens a diagram by
  base64-decoding the payload line and passing the SVG straight back to draw.io,
  and inserts new ones as ` ```diagram\n<payload>\n``` `.

The format is therefore a plain base64 of the `xmlsvg` export, stable, lossless
in both directions, and reusable as-is. The one thing not worth copying is Wiki.js's
*rendering*: inline SVG makes scripts and event handlers live and depends on a
downstream sanitiser.

## Architecture comparison

| | **A** DOM enhancement | **B** Markdown subclass | **C** Hybrid |
|---|---|---|---|
| Correctness | Same parser Kanboard already runs | Same, plus a copied `markdown()` body | Same as B |
| Kanboard internals | None: only public hooks | `TextHelper` override, `Core\Markdown` subclass, Pimple freeze order | Same as B |
| Upgrade risk | A CSS class name (`language-diagram`) and two DOM anchors | Anything in `TextHelper`, `Markdown` or Parsedown | Same as B |
| Plugin conflicts | None | Last plugin to override `text` wins | Same as B |
| Wiki.js compatibility | Identical either way | Identical | Identical |
| Security | `<img>` only; payload never becomes markup | Same, if the renderer emits `<img>` | Same |
| Descriptions + comments | All surfaces at once | All surfaces at once | All surfaces at once |
| Insert / edit | Client-side either way | Needs a client half anyway | Needs a client half anyway |
| Emails | Diagram appears as a code block | Could render a placeholder | Could render a placeholder |
| Code | One PHP class, one template, three scripts | Adds a helper + parser subclass | Adds a helper + parser subclass |

B and C buy one thing A does not have — server-side output, which only matters
for notification emails, where SVG and `data:` URIs are blocked by most clients
anyway. They pay for it with a permanent dependency on two internals Kanboard has
no obligation to keep stable, and with a conflict against any other plugin that
overrides the text helper. **Architecture A is chosen.** If server-side rendering
is ever wanted, it can be added later as an optional helper override without
changing the stored format or the client.

## Chosen design

```
Markdown source (task, comment, project, …)   ← the only storage
        │
        │ Kanboard: TextHelper::markdown() → Parsedown        (untouched)
        ▼
<pre><code class="language-diagram">payload</code></pre>
        │
        │ drawio-ui.js: MutationObserver + initial pass
        ▼
<figure class="drawio-diagram">
    <img src="data:image/svg+xml;base64,payload">            ← inert render
    <a>Edit diagram</a>                                       ← only where Kanboard
</figure>                                                        offers an edit action
        │
        │ click
        ▼
drawio-markdown.js  locate the block in the textarea (ordinal + payload check)
        │
        ▼
drawio-editor.js    <iframe src="…embed=1&proto=json"> ── postMessage ──▶ draw.io
        │                                              ◀── xmlsvg export ──
        ▼
replace that block's payload in the textarea (insertText, native undo)
        │
        ▼
Kanboard's own form  →  Kanboard's own controller  →  Kanboard's own storage
```

Three scripts, loaded in this order: `drawio-markdown.js` (pure Markdown and
payload logic, no DOM), `drawio-editor.js` (the draw.io frame and protocol),
`drawio-ui.js` (rendering, toolbar, wiring).

## Block identification

A document can hold several diagrams, and two of them can be identical, so a
diagram is never located by searching for its payload alone. The rendered
diagram's **ordinal** among the `code.language-diagram` elements of its `.markdown`
container is proposed, then **confirmed against the payload** that was actually
loaded into the editor. Only if the ordinal has drifted — someone inserted a
block while draw.io was open — does the plugin fall back to a payload search, and
only when that search is unambiguous. Otherwise it refuses to write and says so.
Nothing is added to the Markdown: no ids, no markers, no comments.

This is sound only while the JavaScript tokenizer sees the same blocks Parsedown
sees, so `test/fixtures/parsedown-expected.json` records Parsedown's actual
output for the awkward cases — tilde fences, nested fences, indentation,
unterminated fences, CRLF, blockquotes, an uppercase info string — and the suite
asserts agreement. Blockquoted diagrams are counted (so ordinals stay right) but
flagged non-writable.

## Known dependencies on Kanboard

The whole surface the plugin depends on, in one place:

| Depends on | Where | If it changes |
|---|---|---|
| `class="language-diagram"` from Parsedown | `Asset/js/drawio-ui.js` | Diagrams stop rendering; Markdown is untouched |
| `.markdown` / `.text-editor-preview-area` containers | `Asset/js/drawio-ui.js` | Ordinals fall back to the whole document |
| `.text-editor-write-mode > .text-editor-toolbar` | `Asset/js/drawio-ui.js` | The Insert button disappears |
| `#task-view .sidebar a.js-modal-large` | `Asset/js/drawio-ui.js` | The description's Edit button disappears |
| `.comment-actions a.js-modal-medium` | `Asset/js/drawio-ui.js` | A comment's Edit button disappears |
| `KB.modal`, `KB.on('modal.afterRender')` | `Asset/js/drawio-ui.js` | Edit-from-view stops opening the form |
| `template:layout:{head,css,js}` hooks | `Plugin.php` | The plugin stops loading |
| `$container['cspRules']` shape | `Plugin.php` | The iframe is blocked by CSP |

Every failure mode is a missing affordance, not corrupted data: the plugin never
writes to storage, so disabling or breaking it leaves the ` ```diagram ` blocks
exactly as they were.
