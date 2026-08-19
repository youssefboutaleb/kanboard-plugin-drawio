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
- [x] **Task 7: Test suite (51 tests at the time; 108 today — the count comes from `npm test`)**
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

### Milestone 3: Live Verification & Release Packaging (100% COMPLETE — v0.1.0 published 2026-08-18, not yet listed in the directory)

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
- [x] **Task 16b: Execute the checklist in a real browser** — reported complete by the
      maintainer. The verdict table in `docs/MANUAL_TESTING.md` §4 is still blank; fill it
      in before publishing, so the release has a record of what was exercised and where.
- [x] **Task 17: Wiki.js payload parity** — `test/wikijs-parity.test.js` (10 tests).
      Rather than restating the claim, it transcribes Wiki.js's three relevant routines
      from `requarks/wiki` — the `markdown-core` renderer's `diagram` branch, the
      `editor-modal-drawio` export slice, and `editor-markdown`'s `processMarkers()` — and
      asserts the plugin's output against them.
  - The binding constraint is `processMarkers()`: Wiki.js reads a payload with
    `getLine(end - 1)` and skips any block where `line - foundStart !== 2`. Every fence
    the plugin writes is therefore exactly three lines, and editing a fence whose payload
    was wrapped across lines **repairs** it into that shape — it renders in Wiki.js either
    way, but only the single-line form is editable there.
  - Byte-for-byte confirmed: the plugin keeps exactly the half of a draw.io export that
    Wiki.js keeps (`data.slice(indexOf('base64,') + 7)`), and editing one diagram in a
    multi-diagram page leaves every other fence and all surrounding text unchanged.
  - Known caveat, now documented: a `~~~diagram` fence renders in Wiki.js but is not
    editable there, and the plugin leaves the delimiter it found rather than converting it.
- [x] **Task 18: Self-hosted draw.io verification** — verified live across four
      configurations on `kanboard/kanboard:v1.2.53`:

      | `DRAWIO_EMBED_URL` | `frame-src` |
      |---|---|
      | *(unset)* | `'self' https://embed.diagrams.net` |
      | `https://drawio.internal.example:8443/webapp/` | `'self' https://drawio.internal.example:8443` |
      | `http://drawio.lan/` | `'self' http://drawio.lan` |
      | `/drawio/` | `'self'` |

  - **Defect found and fixed while verifying.** `getEmbedOrigin()` returned
    `DEFAULT_EMBED_URL` — a full URL, not an origin — whenever `parse_url()` found no
    scheme and host. A relative `DRAWIO_EMBED_URL` such as `/drawio/`, which is exactly
    what an admin self-hosting behind the same server would set, therefore allow-listed
    `embed.diagrams.net` in the CSP: the third party they had deliberately opted out of.
    It now returns `''` for that case and `allowEmbedFrame()` adds nothing, because
    `'self'` already covers a same-origin path.
  - `test/embed-origin.sh` + `test/embed-origin.test.php` guard the parsing across eight
    cases, wired into `scripts/agent-verify.sh` (step 3/6) and CI. A constant cannot be
    redefined within a process, so the runner invokes the script once per case, and
    `test/stubs/KanboardPluginBase.php` lets `Plugin.php` load outside a Kanboard install.
  - Not covered: driving a real self-hosted `jgraph/drawio` through the editing round
    trip. That is a browser task and belongs with the M-02 handshake case.
- [x] **Task 19: Package `v0.1.0`** — `dist/Drawio-0.1.0.zip`, 24K, root entry `Drawio/`,
      15 entries, no development files.
  - **Installed the packaged artifact** — not the working tree — into a clean
    `kanboard/kanboard:v1.2.53`. It lists under **Settings → Extensions** (route
    `/extensions`, not `/settings/plugins`) as *Drawio · Youssef BOUTALEB · 0.1.0*, in the
    compatible section rather than the incompatible one; the CSP directive is present, all
    four assets return 200, the eight config meta tags render, and the log carries no
    plugin error.
  - The `plugins.json` entry in the dossier parses as strict JSON, carries all fifteen
    fields of the live schema and no others, in alphabetical order, and its
    `compatible_version`, `version`, `author` and `homepage` agree with `Plugin.php`.
- [x] **Release publication (maintainer action).** Done by the maintainer on 2026-08-18:
      `origin` is `github.com/youssefboutaleb/kanboard-plugin-drawio` (the earlier note here
      claiming no remote was configured is corrected), tag `v0.1.0` is published, and the
      CI release job attached `Drawio-0.1.0.zip` (20597 bytes, root entry `Drawio/`, 15
      files, download URL returns 200, 0 downloads so far). **The `plugins.json` PR is still
      open work** — see Milestone 4 Task 21.

### Milestone 4: Read-path correctness, honest documentation, directory listing (AGENT WORK COMPLETE — v0.2.0 prepared, awaiting tag)

Sequencing: **20 → 22 → 24 → 23 → 27 done.** `v0.1.1` is published; `v0.2.0` is prepared and
waiting for a tag. Everything that remains is maintainer work: tag `v0.2.0`, run the manual
matrix (the `docs/MANUAL_TESTING.md` §4 verdict table is still blank, and M-10 to M-12 have
never been exercised in a browser), then open the `plugins.json` pull request — **Task 21**.

**21 is independent of that.** The dossier is ready and points at `v0.1.1`, so the directory
pull request can be opened now; waiting for `v0.2.0` instead only means re-pointing §7/§8/§10
at the new version, which `test/release-metadata.test.js` would catch if it were forgotten.
Maintainer's choice — it is not a technical dependency either way.

**Out of scope, decided 2026-08-19 by the maintainer** — do not re-propose:

- **Server-side rendering for notification emails.** A diagram stays a code block in mail.
  (For the record, had it been wanted: seven notification templates render
  `$this->text->markdown(…, true)`, `Core\Mail\Client::send()` offers no filter hook, and
  the transports carry no attachments, so the ceiling was a text placeholder bought with
  seven copied core templates.)
- **Translations.** The plugin's nine `t()` strings stay English-only; no `Locale/`
  directory, no catalogue loading.

- [x] **Task 20: Correct the public/read-only surface claim and lock it with tests**
      (`docs/specs/002-public-read-only-surfaces.md`, 6 tests, suite 61 → 67).
  - **A documented limitation was false.** `README.md` said public (token) views render no
    diagrams "because they load none of Kanboard's JavaScript". Kanboard withholds *its
    own* scripts there — `layout.php` guards only `vendor.min.js` and `app.min.js` behind
    `not_editable` — while `template:layout:{css,js,head}` are rendered outside that guard.
    The plugin has therefore always loaded and rendered on public task pages.
  - Verified four ways rather than argued: the guard in `app/Template/layout.php`; a live
    capture from `kanboard/kanboard:v1.2.53` carrying all three plugin scripts, the
    stylesheet, ten meta tags and two `code.language-diagram` blocks with no `app.min.js`;
    the same page run through jsdom with `KB` undefined, yielding two rendered figures,
    zero edit links and zero errors; and a mutation check confirming the new test drops to
    zero figures if the `language-diagram` selector ever changes.
  - The public **board** genuinely shows nothing, but for a different reason worth
    recording: its cards hold no Markdown, and a description reaches that page only as a
    tooltip fetched by the Kanboard JS public pages do not load.
  - The fixture is a real capture, regenerable with `bash test/capture-public-view.sh`
    (Docker; seeds through JSON-RPC, strips `filemtime()` cache-busting and `colorCss()`).
    It also pins the Kanboard-side precondition: the first test fails loudly if a
    regenerated page no longer carries the plugin's assets.
- [~] **Task 21: List the plugin in the directory (as `v0.2.0`)** — preparation complete, one
      maintainer decision outstanding (7 tests, suite 67 → 74).
  - **The premise changed while preparing it.** `v0.1.0` turned out to be *already
    published* — tag, release and asset all exist as of 2026-08-18 19:34, built by the CI
    release job. Both the dossier and this file said no release existed. What is actually
    missing is the `plugins.json` PR: the live directory has 158 entries, case-insensitively
    ordered, no `Drawio`, and the insertion point between `DiscordNotifier` and `duedate`
    re-verified today.
  - **The published asset is structurally correct but ships a stale README.** Root entry
    `Drawio/`, 15 files, URL 200 — and its code is byte-identical to `main`. Only
    `README.md` differs, because the asset predates Task 20 and still carries the
    public-views claim that task disproved. Recorded in the dossier §14 with two ways out;
    the recommendation is to cut `v0.1.1` while downloads are 0 and the entry is not yet
    live, and never to re-upload onto a published tag — Kanboard's installer keys updates
    off the version number, so same-version-different-contents is invisible to it.
  - `test/release-metadata.test.js` turns the "re-diff the fifteen fields" step into a test:
    the dossier's JSON entry must parse, carry exactly the fifteen live fields in
    alphabetical order, and agree with `Plugin.php`, `CHANGELOG.md` and `package.json` on
    version, author, homepage and compatible version, with the download URL derived from
    the version rather than typed. A bump that forgets a file now fails the suite.
  - **Decision taken (maintainer, 2026-08-18): cut `v0.1.1` and submit that.** Prepared
    here and ready to commit — `Plugin::getPluginVersion()` → `0.1.1`, a documentation-only
    `CHANGELOG.md` entry, `package.json`, and dossier §4/§7/§8/§10/§13 all moved together.
    `dist/Drawio-0.1.1.zip` builds clean: root entry `Drawio/`, 15 files, and its bundled
    README is byte-identical to the corrected one (0 occurrences of the disproved claim).
    `v0.1.0` stays published — nothing about it is unsafe, one paragraph of its README is
    wrong — and is explicitly *not* re-uploaded, because Kanboard's installer keys updates
    off the version number and same-version-different-contents is invisible to it.
  - **Superseded by the v0.2.0 cut (Task 27).** `v0.1.1` was published on 2026-08-18 but
    never submitted, and the dossier now points at `v0.2.0` instead — there is no reason to
    list a version two features behind. Remaining, maintainer-only: tag `v0.2.0`, confirm
    the §8 URL returns 200, work through `docs/MANUAL_TESTING.md` (the §4 verdict table is
    still blank and M-10 to M-12 have never run in a browser), then open the PR — title and
    body drafted in dossier §12–13.
- [x] **Task 22: Edit a diagram inside a blockquote**
      (`docs/specs/003-quoted-diagram-editing.md`, 14 tests, suite 74 → 88).
  - **The risk was not the one the plan named.** Lazy continuation turned out to be a
    non-event: probing all eleven quoted shapes against the vendored Parsedown 1.7.4 showed
    the tokenizer already agreed with it on every one, including lazy content and lazy
    closing fences. The dangerous case was the one nobody had listed — a **blank line inside
    a quoted fence**. Parsedown ends the blockquote there, so the trailing `> ``` ` is a
    *second* blockquote; the tokenizer spans the whole thing as one fence. Both read the
    same payload, so rendering was always right, but writing over that region would have
    deleted the blank line and merged two blockquotes into one.
  - The rule that fell out: **write only when every line of the payload region carries at
    least the opening line's quote depth.** That admits exactly what `TextHelper::reply()`
    produces and refuses both damaging shapes, without normalising anyone's document.
  - `findFences()` now records `quotePrefix` — the markers *verbatim*, so `> `, `> > `, `>`
    and `   > ` are reproduced rather than reconstructed — plus `quoteDepth` and
    `lazyQuote`. `isWritableFence()` and `fenceReplacement()` are the pure predicates the UI
    and the tests share, so the string asserted is the string written.
  - **A bug the tests caught before it shipped**: the empty string after a document's final
    newline is an artifact of `split('\n')`, not a line, and it was condemning every
    unterminated quoted fence as lazy. Only a blank line that is *not* the synthetic last
    element ends a quote.
  - Editing a quotation now asks for confirmation once — the only successful edit in the
    plugin that changes text the user did not write.
  - Ten new parity fixtures regenerated through `test/parsedown-parity.php` against the real
    Parsedown (31 cases total); the tokenizer agrees on all of them.
  - Not in scope, now documented in the README: inserting a *new* diagram with the cursor
    inside a blockquote still writes an unquoted fence, which ends the quote.
- [x] **Task 23: Full-size viewer overlay**
      (`docs/specs/005-full-size-viewer.md`, 10 tests, suite 98 → 108).
  - **Looking and writing are now separate.** `buildActions()` used to be called only when
    `resolveSurface()` found somewhere to write, so a reader with no edit rights got no
    actions block at all. It is now always built, with View always present and Edit added
    only where Kanboard offers a way to change the surrounding Markdown. Anonymous readers
    on a public task link get the affordance; the permission model is untouched.
  - **A test asserting the wrong thing had to be retired deliberately.** Two tests used
    "no `.drawio-diagram-actions`" as a proxy for "cannot edit". That proxy is now false by
    design, so they assert the absence of `a.drawio-diagram-edit` — which is what the
    borrowed-link permission model actually guarantees. Recorded in the spec rather than
    quietly changed.
  - **A bug caught while writing it**: the view action first captured the payload at render
    time, so after an edit it would have reopened the *previous* diagram. It now reads the
    payload from the DOM at click time, where `refreshRendered()` keeps it current.
    Mutation-checked — restoring the capture fails the test.
  - The viewer refuses to open while draw.io is open, which keeps the two capture-phase
    Escape handlers from fighting; Escape is stopped so the Kanboard modal underneath does
    not close with it; focus moves to the close button and returns to the trigger. Clicking
    the picture toggles fit ⇄ actual size, for a diagram too wide for fitting to help.
  - `z-index: 9998` — above Kanboard's modals (100) and dropdowns (1000), below its alerts
    (9999) and below the draw.io editor (10000), which owns the screen while open.
  - No new module (the plugin keeps three, one responsibility each), no route, no storage,
    no CSP change, no `KB` dependency. `docs/MANUAL_TESTING.md` M-12 covers what jsdom
    cannot: that the thing is actually *bigger*.
- [x] **Task 24: Dark-theme legibility**
      (`docs/specs/004-dark-theme-legibility.md`, 10 tests, suite 88 → 98).
  - **The theme cannot be detected, so the fix must not depend on detecting it.** Kanboard
    picks a theme by loading one of `assets/css/{light,dark,auto}.min.css` — no `data-theme`,
    no class — and only *auto* carries a `prefers-color-scheme` block. A media query would
    therefore leave the explicit dark theme unfixed while adding a panel for explicit-light
    users on a dark OS: wrong in the case that matters. Every diagram gets a constant opaque
    surface instead, in all three themes.
  - **Whether a payload has its own background is unknowable to the plugin.** draw.io's
    embed `export` action takes a `background` parameter and the plugin sends none, so the
    result is whatever the diagram's author configured. Asking for a white background at
    export was rejected: it would bake the reader's theme into the stored artifact, change
    it for Wiki.js, and do nothing for diagrams that already exist.
  - `--color-light` and `--color-error` replace the hardcoded `#777`/`#b94a48`, which are
    *exactly* the light theme's values for those tokens — so light rendering is unchanged
    and dark now adapts. Every `var()` carries a fallback, and the plugin defines no custom
    properties of its own. The editor backdrop follows `--body-background-color`.
  - **Verified before it was written**: Kanboard sets `box-sizing` in only two rules and has
    no global `border-box` reset, so padding on a `max-width: 100%` image would have pushed
    diagrams past their column. The rule sets `box-sizing` explicitly and a test holds it.
  - jsdom turned out to be able to carry more than expected: it parses the real stylesheet,
    matches selectors and computes the surface. What it cannot do is resolve `var()` or
    compute `::before` — so theme tokens are asserted from the parsed rule and colours are
    written as longhands (a `var()` inside a `background` shorthand is invisible to it).
    Mutation-checked: reverting the surface and the placeholder token fails three tests.
  - **One cascade finding worth keeping**: `.markdown img { max-width: 80% }` has
    specificity (0,1,1) and outranks the plugin's single class, so Kanboard — not the
    plugin — decides how wide a diagram is, as it always has. It sets no background, so the
    legibility surface is uncontested; a test now pins exactly that split.
  - `docs/MANUAL_TESTING.md` M-11 covers what no unit test can — light, dark and auto, with
    a transparent diagram and one carrying its own background.
- [x] **Task 27: Housekeeping and the v0.2.0 cut** (no new tests; suite steady at 108).
  - The brace-style outlier is settled by counting rather than opinion: four inline object
    literals across the three scripts use no inner spaces, one used them. Normalised the
    one. Also merged two comment blocks in `findFences()` that had been left stacked.
  - `.agents/skills/kanboard-plugin-dev/SKILL.md` gained the three checks the suite grew
    since it was written — read-only surfaces (`test/public-view.test.js` and the capture
    script), theme tokens in CSS (`test/theme.test.js`, with jsdom's limits spelled out),
    and version-bump agreement (`test/release-metadata.test.js`).
  - **Checked rather than assumed**: Kanboard is still on `v1.2.53` (released 2026-07-24),
    so `test/fixtures/public-task.html` and the Parsedown expectations need no regeneration;
    and every `test/*.test.js` on disk is wired into `npm test` — no test was silently
    orphaned by the last three tasks.
  - **v0.2.0 prepared**: `Plugin::getPluginVersion()`, `package.json`, `CHANGELOG.md`
    (Unreleased → `0.2.0 — 2026-08-19`) and dossier §4/§7/§8/§10/§13/§14 moved together,
    with the directory blurb updated to mention the viewer.
  - **The packaged artifact was installed, not just built** (lesson 20): `dist/Drawio-0.2.0.zip`
    extracted into a clean `kanboard/kanboard:v1.2.53` lists under **Installed Plugins** —
    not the incompatible table — as *Drawio · Youssef BOUTALEB · 0.2.0*, with the CSP
    directive present, all four assets returning 200, thirteen meta tags rendered and no PHP
    error in the log.

### Backlog (unscheduled)

- [ ] Inserting a new diagram while the cursor is inside a blockquote writes an unquoted
      fence, which ends the quote. Editing an existing quoted diagram is unaffected
      (Task 22); insertion would need the same prefix logic applied at the cursor's context.
- [ ] Rendering a diagram inside the board tooltip is covered by the `MutationObserver`
      and the fragment does carry `code.language-diagram` (verified against
      `/board/tooltip/1/description`), but no test exercises that path.
- [ ] Public **board** tooltips, which would mean reimplementing Kanboard's tooltip fetch
      on a page that ships no JavaScript.

---

## 🛠️ Essential Commands & Agentic Scripts

```bash
# Automated agent verification pipeline (JS syntax, PHP lint, 108 tests, packaging shape)
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
17. **A "compatible" claim is only worth what it is checked against.** The Wiki.js parity
    tests transcribe Wiki.js's own routines and assert against them; that is what surfaced
    the three-line invariant (`processMarkers()` skips any block where
    `line - foundStart !== 2`), which no amount of reading the format description would
    have made explicit.
18. **`parse_url()` returning no host is not an error case — it is the same-origin case.**
    Treating it as a failure and falling back to the public default silently allow-listed
    a third party for exactly the admins who had self-hosted to avoid one. Verify a
    security-relevant fallback with the input that makes it fire.
19. **The plugin settings page is `/extensions`**, not `/settings/plugins`, and it renders
    two tables — installed and incompatible. Check which one a plugin landed in, not just
    that its name appears.
20. **Test the packaged artifact, not the working tree.** Mounting the repository proves
    the code works; mounting the extracted release ZIP proves the *release* works, which
    is what `remote_install: true` promises to every user of the directory.
21. **Seed fixtures through the JSON-RPC API, not the UI.** `createProject`, `createTask`,
    `createComment`, `createUser` and `addProjectUser` (role `project-viewer`) with
    `-u admin:admin` set up the whole manual-test environment in five calls, including a
    task holding two identical diagrams — the fixture that catches wrong-block writes.
22. **The public views already worked; the documentation was the defect.** `layout.php`
    withholds `app.min.js` on `not_editable` pages but renders the plugin asset hooks
    outside that guard, so a feature nobody had claimed was shipping untested. Check what a
    page actually serves before writing a limitation into a README.
23. **The dangerous quoted shape is a blank line, not lazy continuation.** Parsedown ends a
    blockquote at a blank line, so `> ```diagram / > payload / (blank) / > ``` ` is *two*
    blockquotes with an unterminated fence in the first. The tokenizer spans it as one
    fence and reads the same payload — rendering is right — but writing over that region
    deletes the blank line and merges the quotes. Payload agreement between parser and
    tokenizer is necessary for reading and **not sufficient for writing**: a write also
    needs the region to contain nothing but the payload.
24. **`split('\n')` invents a last line.** The empty string after a document's final
    newline is not something the user wrote, and treating it as one condemned every
    unterminated quoted fence as unwritable. Any per-line rule needs to exclude it.
25. **A stylesheet is testable, within limits worth knowing.** jsdom parses the real CSS,
    matches selectors and computes ordinary declarations — but it does not resolve `var()`,
    does not implement `getComputedStyle(el, '::before')`, and drops a `var()` that sits
    inside a shorthand. Writing colours as longhands makes them assertable at all; the rest
    is what a manual theme pass is for.
26. **Kanboard has no global `box-sizing` reset.** Adding padding to anything with
    `max-width: 100%` overflows its container unless the plugin sets `border-box` itself.
27. **An action's presence is not a permission.** Gating the whole actions block on
    "can edit" quietly denied readers a way to *read* — and two tests had encoded that
    conflation as a proxy assertion. Assert the specific affordance (`a.drawio-diagram-edit`),
    never the container it happens to live in.
28. **Capturing state at render time is a bug waiting for an edit.** The view action first
    closed over the payload it was built with, which would have reopened the pre-edit
    diagram. Anything the DOM keeps current — here `refreshRendered()` — should be read at
    the moment of use, not at the moment of wiring.
