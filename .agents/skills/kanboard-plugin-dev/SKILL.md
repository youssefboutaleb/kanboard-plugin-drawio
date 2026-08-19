---
name: kanboard-plugin-dev
description: Extension points and verification procedures for building the Drawio Kanboard plugin without core modifications
---

# Kanboard Plugin Development Skill — Drawio

Step-by-step guidance for developing, testing and verifying this plugin. Everything here
was read out of `kanboard/kanboard` (1.2.53); nothing is assumed.

## 1. Extension Points

**Plugin entry class** — `Plugin.php`, extending `Kanboard\Core\Plugin\Base`. The
directory name, the namespace segment and `getPluginName()` must all be `Drawio`:
`Core\Plugin\Loader::scan()` derives `\Kanboard\Plugin\<dir>\Plugin` from the folder.

**Template hooks** — the plugin's only server-side surface.

```php
// Renders plugins/Drawio/Template/layout/config.php inside <head>.
// Core\Template::getTemplateFile() applies ucfirst() to the plugin segment.
$this->template->hook->attach('template:layout:head', 'Drawio:layout/config');

// Asset hooks take a path relative to the Kanboard root, not a template name.
// AssetHelper::js() emits `defer`, so these run in attach order, after app.min.js,
// before DOMContentLoaded. Order is load-bearing.
$this->template->hook->attach('template:layout:css', 'plugins/Drawio/Asset/css/drawio.css');
$this->template->hook->attach('template:layout:js', 'plugins/Drawio/Asset/js/drawio-markdown.js');
```

**Content-Security-Policy** — `setContentSecurityPolicy()` *replaces* the whole array, so
always read the current rules back and merge:

```php
$rules = $this->container['cspRules'];
$rules['frame-src'] = trim((isset($rules['frame-src']) ? $rules['frame-src'] : "'self'").' '.$origin);
$this->setContentSecurityPolicy($rules);
```

**Routes and controllers** — available (`$this->route->addRoute(...)`,
`$this->projectAccessMap->add(...)`) but **deliberately unused**. This plugin has no
endpoint; adding one means adding an authorisation surface, and needs an ADR first.

**Compatibility** — `getCompatibleVersion()` is checked by
`Loader::initializePlugin()` before `initialize()` runs. Raise it only when a genuinely
newer core API is adopted, and say in the docblock which API sets the floor.

## 2. Front-end Extension Points

Kanboard's front end offers no hook for the Markdown editor toolbar, so the plugin
attaches to markup. Every selector below is a dependency recorded in `ARCHITECTURE.md`:

| Anchor | Purpose |
|---|---|
| `pre > code.language-diagram` | The rendered fence, emitted by Parsedown with no plugin involvement |
| `.markdown`, `.text-editor-preview-area` | The container an ordinal is counted within |
| `.text-editor-write-mode > .text-editor-toolbar` | Where the Insert button is appended |
| `.text-editor textarea` | The Markdown source being edited |
| `#task-view .sidebar a.js-modal-large` | Kanboard's own "Edit the task" action — present only with permission |
| `.comment-actions a.js-modal-medium` | Kanboard's own comment edit action — present only with permission |
| `KB.modal.open()`, `KB.on('modal.afterRender')` | Opening that form and resuming afterwards |

Content arrives through several paths that do **not** call `KB.render()` (the preview
pane uses `KB.dom(el).html(data)`, tooltips inject from a `<script type="text/template">`).
Use the single `MutationObserver` pass; do not add per-event hooks.

## 3. Verification Checklist

Run through this before declaring any task complete.

**PHP**

1. [ ] `declare(strict_types=1);` in every owned PHP file except templates.
2. [ ] PSR-4 namespace is `Kanboard\Plugin\Drawio\` and the directory is `Drawio`.
3. [ ] Every value rendered from a template passes through `$this->text->e()`.
4. [ ] No inline `<script>` or `<style>` — CSP refuses them; use `<meta>` or `data-*`.
5. [ ] CSP rules are merged, never replaced.
6. [ ] No new route, controller, table, migration or permission check.
7. [ ] `php -l` clean on every file.

**JavaScript**

8. [ ] `drawio-markdown.js` stays DOM-free and loadable under Node.
9. [ ] No framework, no bundler, no runtime dependency; ES5-style `var`/`function`.
10. [ ] DOM built with `createElement`; no `innerHTML` on anything derived from a payload.
11. [ ] Payloads reach the page only as `<img src="data:image/svg+xml;base64,…">`.
12. [ ] `postMessage` accepted only when origin **and** source window both match; posted
       to an explicit origin, never `'*'`.
13. [ ] Every enhancement is idempotent under repeated `MutationObserver` passes and
        guarded by a `data-drawio` marker.
14. [ ] Any new borrowed selector is added to the coupling table in `ARCHITECTURE.md`.

**Behaviour**

15. [ ] A block is located by ordinal **and** payload confirmation, or the write is refused.
16. [ ] Nothing is added to the Markdown syntax — no ids, no markers, no comments.
17. [ ] Payload validated (canonical base64 of an SVG) before it is written.
18. [ ] Payload size checked against `DRAWIO_MAX_PAYLOAD_SIZE` before it is written.
19. [ ] Every failure mode degrades to a missing affordance, never to corrupted Markdown.

**Tests**

20. [ ] Pure logic covered in `test/markdown.test.js` / `test/payload.test.js`.
21. [ ] Browser behaviour covered in `test/dom.test.js` against jsdom copies of Kanboard's
        real markup.
22. [ ] Any new parser assumption added to `test/fixtures/markdown-cases.json` and the
        expectations regenerated with `test/parsedown-parity.php` against a real checkout.
23. [ ] Anything a reader without edit rights can see checked in `test/public-view.test.js`,
        which runs the plugin over a real captured public page with `KB` undefined
        (regenerate it with `bash test/capture-public-view.sh` after a Kanboard upgrade).
24. [ ] Any new colour or surface in `Asset/css/drawio.css` expressed as a Kanboard theme
        token with a fallback, and asserted in `test/theme.test.js` — jsdom parses the real
        stylesheet, but cannot resolve `var()` or compute `::before`, so pseudo-element
        declarations are read from the parsed rule and colours are written as longhands.
25. [ ] A version bump reflected in `Plugin.php`, `CHANGELOG.md`, `package.json` **and**
        the dossier — `test/release-metadata.test.js` fails the build if one drifts.
26. [ ] `bash scripts/agent-verify.sh` green.

## 4. Verifying an Assumption About Core

Do not reason about Kanboard's behaviour — read it, then prove it:

```bash
git clone --depth 1 https://github.com/kanboard/kanboard.git /tmp/kanboard
grep -rn "template:layout:head" /tmp/kanboard/app/Template/layout.php

# Prove it on a running instance rather than trusting the read.
docker run -d --name kb-drawio -p 8085:80 \
    -v "$PWD":/var/www/app/plugins/Drawio:ro kanboard/kanboard:latest
curl -sI http://localhost:8085/ | grep -i content-security
curl -s -u admin:admin -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"createProject","id":1,"params":{"name":"Diagrams"}}' \
    http://localhost:8085/jsonrpc.php
```
