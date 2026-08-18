# CLAUDE.md — Claude Agentic Setup & Development Guide

This document defines the agentic workflow, quality gates and verification standards for
Claude Code and other AI coding assistants working on **Drawio**, the draw.io Markdown
extension for Kanboard.

> ⚠️ **MANDATORY RULE**: This file MUST be updated at the end of **EVERY** completed
> task/step to reflect milestone status, what changed, and the test command and count.

Read [`AGENTS.md`](AGENTS.md) first — it holds the non-negotiable rules.
Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for what was verified in Kanboard core and why
the design looks the way it does.

---

## 🚦 Milestone Task Progress Status

### Milestone 1: Architecture Review & Repository Bootstrap (100% COMPLETE — unreleased, v0.1.0)

- [x] **Task 1: Verify the Kanboard Markdown pipeline against the real source**
  - `TextHelper::markdown()` (`app/Helper/TextHelper.php:47`) is the single entry point and
    hardcodes `new Markdown($this->container, $isPublicLink)`.
  - `Parsedown::blockFencedCode()` (vendored 1.7.4) already emits
    `<pre><code class="language-diagram">` for a ` ```diagram ` fence — **no plugin needed
    for the block to exist**. This is the finding the whole architecture rests on.
  - Confirmed live: a task created through JSON-RPC on a `kanboard/kanboard` container
    rendered two identical diagrams in source order, payloads byte-identical to storage,
    with task links, mentions and headings still working.
- [x] **Task 2: Verify the plugin extension points**
  - `Core\Plugin\Loader::initializePlugin()` gates on `getCompatibleVersion()`.
  - `Core\Template::getTemplateFile()` resolves `'Drawio:layout/config'` to
    `plugins/Drawio/Template/layout/config.php` via `ucfirst($plugin)`.
  - `AssetHelper::js()` emits `defer`, so `template:layout:js` scripts run in attach order
    after `app.min.js` and before `DOMContentLoaded`.
  - `Tool::buildDICHelpers()` registers helpers under the **class name**, so
    `getHelpers()` cannot override `text` — a helper override would need a manual
    `$this->helper->register('text', …)`. Recorded as a reason to avoid that path.
- [x] **Task 3: Verify the draw.io embed protocol and the Wiki.js payload**
  - Embed mode: `init` → `{action:'load', xml}` → `save` → `{action:'export', format:'xmlsvg'}`
    → `{event:'export', data:'data:image/svg+xml;base64,…'}`.
  - Wiki.js stores exactly the base64 half of that data URI
    (`client/components/editor/editor-modal-drawio.vue`) and re-opens a diagram by
    base64-decoding it and handing the SVG straight back
    (`client/components/editor/editor-markdown.vue`).
- [x] **Task 4: Choose the architecture** — client-side DOM enhancement (A). Rejected the
  `TextHelper` override (B/C): it buys only server-side output, which matters solely for
  emails where SVG and `data:` URIs are blocked anyway, and costs a permanent dependency
  on two internals plus a conflict with any other helper-overriding plugin.
- [x] **Task 5: Implement the plugin** — `Plugin.php`, `Template/layout/config.php`,
  three scripts, one stylesheet. No controller, no route, no table, no permission model.
- [x] **Task 6: Implement deterministic block identification** — ordinal, confirmed
  against the loaded payload, with an unambiguous-payload fallback and a refusal
  otherwise. Nothing is added to the Markdown.
- [x] **Task 7: Test suite (51 tests)**
  - **Root cause found by the parity fixtures**: blockquoted fences are diagram blocks to
    Parsedown (`TextHelper::reply()` prefixes every line with `> `) but were invisible to
    the JavaScript tokenizer, which silently shifted every ordinal after them. Fixed by
    stripping quote markers when scanning for an opening fence, counting the block, and
    flagging it non-writable.
- [x] **Task 8: Verify CSP end-to-end** — a live container returns
  `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data:; frame-src 'self' https://embed.diagrams.net;`.
  `img-src` already allowed `data:`, so exactly one directive is added.
- [x] **Task 9: Repository quality** — `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`,
  `LICENSE` (MIT), CI running the suite and `php -l`.

### Milestone 2: Agentic Workflow & Submission Readiness (100% COMPLETE — unreleased)

- [x] **Task 10: `AGENTS.md`** — integrity rules, adapted to this plugin's real risks
  (untrusted SVG payloads, `postMessage` origin pinning, Markdown-as-only-storage,
  never identifying a block by payload alone).
- [x] **Task 11: `CLAUDE.md`** — this file: roadmap, command cheat-sheet, running log.
- [x] **Task 12: `.agents/skills/kanboard-plugin-dev/SKILL.md`** — extension points and a
  verification checklist covering both the PHP and the JavaScript halves.
- [x] **Task 13: `docs/kanboard-directory-submission.md`** — the fifteen-field
  `plugins.json` payload, alphabetical insertion point verified against the live file, and
  the release-asset shape the installer requires.
- [x] **Task 14: `scripts/package-plugin.sh` and `scripts/agent-verify.sh`** — allow-list
  packaging gated on a green suite, with an archive-root assertion.
- [x] **Task 15: `docs/specs/`** — spec template plus the retro-spec for the shipped
  Markdown block feature, so the spec-driven loop starts from a worked example.

### Milestone 3: Live Verification & First Release (IN PROGRESS — v0.1.0)

- [x] **Task 16a: Write the manual browser test checklist** — `docs/MANUAL_TESTING.md`:
      environment setup, a nine-case matrix, a DevTools protocol-inspection guide, a
      results log and teardown. Every setup command in it was executed against
      `kanboard/kanboard:v1.2.53` while writing, and the observed output is quoted rather
      than described.
  - The task list named eight cases while asking for nine; **M-06 (multiple diagrams,
    editing one leaves the other byte-identical)** was added, because deterministic block
    identification is the riskiest logic in the plugin and the only listed gap a browser
    adds anything to.
  - Verified while writing: the Docker tag is `v1.2.53` — `1.2.53` without the `v` returns
    404; the image ships `/var/www/app/config.php` and has **no** `data/config.php`, and
    appending `define('DRAWIO_MAX_PAYLOAD_SIZE', 2000);` there does change the
    `drawio-max-payload` meta tag (confirmed 2000 → reverted → 55000); the entrypoint
    chowns the whole app tree, so the plugin mount needs `:ro`.
  - Verified the permission claim directly rather than asserting it: as `project-viewer`
    the sidebar renders **0** `js-modal-large` links and `.comment-actions` contains **0**
    `js-modal-medium` anchors; as `admin` there is exactly one of each, the comment's
    pointing at `/task/1/comment/1/edit`. The Remove entry is `js-modal-confirm`, so the
    plugin's selector is unambiguous.
- [ ] **Task 16b: Execute the checklist in a real browser.** Needs a human with Chromium
      **and** Gecko — the two engines take different paths through
      `document.execCommand('insertText')` and its `value` fallback. Record every verdict
      and root cause in the results log and here. **This remains the one unverified part
      of the plugin.**
- [ ] **Task 17: Verify a real Wiki.js page round-trips** — paste an existing Wiki.js
      `diagram` block into a task, confirm it renders, edit it, confirm Wiki.js still
      opens the result.
- [ ] **Task 18: Self-hosted draw.io verification** — `DRAWIO_EMBED_URL` against a local
      `jgraph/drawio` container, confirming the CSP entry and the origin check follow it.
- [ ] **Task 19: Package and publish `v0.1.0`**, then open the `plugins.json` PR from the
      dossier.

### Backlog (unscheduled)

- [ ] Editing a diagram inside a blockquote (currently refused by design).
- [ ] Rendering diagrams on public/token board views, which load none of Kanboard's JS.
- [ ] An optional server-side renderer for notification emails — additive, would not
      change the stored format.

---

## 🛠️ Essential Commands & Agentic Scripts

```bash
# Automated agent verification pipeline (JS syntax, PHP lint, 51 tests, packaging shape)
bash scripts/agent-verify.sh

# Test suite only (node:test, jsdom is the only dev dependency)
npm install
npm test

# One test file
node --test test/dom.test.js

# Regenerate the Parsedown parity fixtures after a Kanboard upgrade
php test/parsedown-parity.php /path/to/kanboard
# ...or without a host PHP:
docker run --rm -v "$PWD":/plugin -v /path/to/kanboard:/kb:ro php:8.2-cli \
    php /plugin/test/parsedown-parity.php /kb

# Package the release archive (dist/Drawio-X.Y.Z.zip, root entry Drawio/)
bash scripts/package-plugin.sh

# Live Kanboard instance with the plugin mounted (admin/admin)
docker run -d --name kb-drawio -p 8085:80 \
    -v "$PWD":/var/www/app/plugins/Drawio:ro kanboard/kanboard:latest
# Confirm the CSP directive the plugin adds:
curl -sI http://localhost:8085/ | grep -i content-security
```

---

## 🤖 Agentic Development Lifecycle

Every task follows a 6-phase loop:

1. **Intent & Spec Check** — read `docs/specs/` and `ARCHITECTURE.md` for the task
   boundary. If the feature has no spec, write it first.
2. **Plan & User Approval** — a small, reviewable plan before any feature code.
3. **Strict Code Implementation**
   - PHP: PSR-12, `declare(strict_types=1);`, output through `$this->text->e()`, no inline
     `<script>`/`<style>` (CSP refuses them).
   - JS: no framework, no build step, DOM built with `createElement`, payloads only ever
     reach the page as a `data:` URI in an `<img>`.
   - No Kanboard core modifications. No new storage.
4. **Automated Testing** — pure logic in `test/markdown.test.js` / `test/payload.test.js`,
   browser behaviour in `test/dom.test.js` against jsdom copies of Kanboard's markup, and
   parser assumptions in `test/parity.test.js` against fixtures generated from the real
   Parsedown.
5. **Agentic Verification Pipeline** — `bash scripts/agent-verify.sh`.
6. **Mandatory Documentation Update** — `CLAUDE.md` every step; `ARCHITECTURE.md` whenever
   a Kanboard coupling is added or removed.

---

## 📐 Architecture & Non-Negotiable Rules

1. **No Core Edits.** Everything stays in this plugin.
2. **No Guessing.** Flag unverified APIs as `UNKNOWN` or `ASSUMPTION` and verify against
   the source before shipping.
3. **Markdown Is the Only Storage.** No table, no cache, no side file. Disabling the
   plugin must leave the Markdown byte-identical.
4. **Payloads Are Untrusted.** `<img src="data:…">` only — never inline SVG, never
   `innerHTML`.
5. **Never Locate a Block by Payload Alone.** Ordinal + payload confirmation, or refuse.
6. **Plan First.** No feature code without an approved spec.
7. **Update `CLAUDE.md` Every Step.**

---

## 🧠 Lessons Learned & Agent Memory

1. **Parsedown already gives us the block.** ` ```diagram ` renders as
   `<pre><code class="language-diagram">payload</code></pre>` in stock Kanboard, with the
   payload HTML-escaped — a no-op for base64. The plugin needs no parser at all, which is
   the entire reason it can avoid touching `TextHelper`.
2. **`Base::setContentSecurityPolicy()` replaces the whole rules array.** Read
   `$this->container['cspRules']` back and merge, or you silently drop `img-src` and every
   directive another plugin contributed.
3. **Declaring `frame-src` ends the `default-src` fallback.** `'self'` must be restated or
   same-origin iframes elsewhere in Kanboard break.
4. **`Tool::buildDICHelpers()` keys helpers by class name**, not by the property name, so
   `Plugin::getHelpers()` can never override a core helper such as `text`. Only a manual
   `$this->helper->register('text', …)` would, and Pimple throws if the service has
   already been resolved.
5. **Inline `<script>` is dead code under Kanboard's CSP** (`default-src 'self'`, no
   `script-src` exception). Configuration and translated strings must travel as `<meta>`
   or `data-*` attributes. Kanboard also injects modal content with `innerHTML`, which
   never executes injected `<script>` tags — two independent reasons.
6. **`AssetHelper::js()` emits `defer`.** Script order follows attach order, `KB` is
   already defined, and everything runs before `DOMContentLoaded`. Ordering in
   `Plugin::initialize()` is therefore load-bearing.
7. **Kanboard's text editor is pure JavaScript with no hook.** The toolbar is built in
   `assets/js/components/text-editor.js`; the only way in is to append to
   `.text-editor-write-mode > .text-editor-toolbar` after render, guarded for idempotence.
8. **The preview pane is refreshed without `KB.render()`** (`KB.dom(previewElement).html(data)`),
   and board tooltips inject markdown from a `<script type="text/template">`. A single
   `MutationObserver` covers every one of these paths; per-event hooks do not.
9. **Kanboard renders edit affordances only for users who have them** —
   `#task-view .sidebar a.js-modal-large` and `.comment-actions a.js-modal-medium`.
   Borrowing those links inherits the permission model exactly, with no plugin-side check.
10. **MySQL stores descriptions and comments as `TEXT` (65535 bytes)** and overflowing
    truncates the *whole field*, not just the diagram. A base64 SVG approaches that fast,
    which is why `DRAWIO_MAX_PAYLOAD_SIZE` exists and refuses before writing.
11. **Blockquoted fences are real diagram blocks.** `TextHelper::reply()` prefixes every
    line with `> `, so replying to a comment containing a diagram produces one. The
    tokenizer must count it or every later ordinal shifts.
12. **An `<img>` is a security boundary, not a rendering preference.** SVG loaded through
    `<img>` runs in the restricted "SVG as an image" mode: no scripts, no event handlers,
    no external subresource fetches. Wiki.js injects the same payload inline and needs a
    sanitiser downstream; we need nothing.
14. **A plugin's outgoing `postMessage` cannot be intercepted from the console.**
    `iframe.contentWindow` for a cross-origin frame is a `WindowProxy` whose methods cannot
    be patched — a browser security property, not a gap in the plugin. Infer outgoing
    actions from their effects, or breakpoint `send()` in DevTools → Sources. A wrong
    target origin is loud: the console names the mismatch explicitly.
15. **The Kanboard Docker image regenerates `/var/www/app/config.php` from environment
    variables on start**, so a `define()` appended for testing survives `docker exec` but
    not `docker restart`. There is no `data/config.php` in the image even though
    `app/common.php` loads it first if present.
16. **Verify the parser, don't remember it.** The blockquote bug was invisible to
    reasoning and obvious the moment fixtures were generated from the real Parsedown.
    `test/parsedown-parity.php` exists so the next Kanboard upgrade re-checks it.
17. **Seed fixtures through the JSON-RPC API, not the UI.** `createProject`, `createTask`,
    `createComment`, `createUser` and `addProjectUser` (role `project-viewer`) with
    `-u admin:admin` set up the whole manual-test environment in five calls, including a
    task holding two identical diagrams — the fixture that catches wrong-block writes.
