# Integrity Rules & Standards for AI Agents

All AI agents (Claude Code, Antigravity, GitHub Copilot, etc.) interacting with this
repository **MUST** strictly follow these non-negotiable rules.

This plugin's whole premise is that **the Markdown field is the only storage**. Most of
the rules below exist to keep that true.

---

## 1. Core Integrity Rules

1. **Do Not Guess**:
   - Never invent or assume Kanboard core APIs, hooks, template names, CSS class names,
     DOM anchors, or the draw.io embed protocol.
   - Verify against the actual source: `kanboard/kanboard` for core, `jgraph/drawio` and
     the official embed-mode documentation for the editor, `requarks/wiki` for the
     Wiki.js payload format.
   - If uncertain, mark it `UNKNOWN` or `ASSUMPTION` and state the verification step
     before writing production code.

2. **Do Not Modify Kanboard Core**:
   - All functionality stays inside this plugin directory.
   - Use only documented extension points: `Kanboard\Core\Plugin\Base`,
     `$this->template->hook->attach()`, `$this->route->addRoute()`,
     `setContentSecurityPolicy()`.
   - Overriding `TextHelper` or subclassing `Kanboard\Core\Markdown` is **rejected by
     design** (see `ARCHITECTURE.md`). Reopening that decision requires a new ADR, not a
     commit.

3. **The Markdown Is the Source of Truth**:
   - No database table, no migration, no diagram store, no cache, no side file.
   - The plugin never writes to Kanboard storage. It writes into a textarea inside a
     Kanboard form and lets Kanboard save it.
   - Disabling the plugin must leave every ` ```diagram ` block byte-identical.

4. **Never Identify a Diagram by Payload Alone**:
   - A document can hold several identical diagrams. Locate by ordinal, **confirm against
     the payload**, and refuse to write when the answer is ambiguous.
   - Never add ids, markers or comments to the Markdown to make identification easier.

5. **Untrusted Payloads**:
   - A diagram payload is untrusted input. It is rendered **only** as
     `<img src="data:image/svg+xml;base64,…">`.
   - Never inject a decoded payload into `innerHTML`, never build inline `<svg>`, never
     pass it to `eval`, `Function`, or a template that interpolates markup.
   - Validate before writing: canonical base64 whose decoded bytes are an SVG document.

6. **Pin the draw.io Frame**:
   - Accept a `postMessage` only when **both** `event.origin` matches the configured
     embed origin **and** `event.source` is the frame the plugin opened.
   - Post to that explicit origin, never to `'*'`.

7. **Prefer Safety Over Speed**:
   - When a Markdown edit cannot be located deterministically, refuse and tell the user.
     A wrong write corrupts a task description; a refusal costs a click.

8. **Small, Reviewable Steps**:
   - Work in small, isolated, testable tasks. Keep git diffs focused and minimal.

9. **Tests are Mandatory**:
   - Every tokenizer rule, block-location rule, validation rule and DOM behaviour must
     have automated coverage before a task is declared complete.
   - Parser assumptions must be verified against the real Parsedown, not asserted from
     memory — see `test/parsedown-parity.php`.

10. **Documentation is Part of the Code**:
    - Update `ARCHITECTURE.md`, `docs/specs/`, `docs/decisions/` and `CLAUDE.md` whenever
      structure, behaviour or milestone status changes.

11. **No Secrets**:
    - Never request, hardcode or store API keys, credentials, tokens or production
      connection strings.

12. **Always Produce a Plan First**:
    - Draft the spec in `docs/specs/<nnn>-<feature>.md` and get approval before writing
      feature code.

13. **Mandatory Step Update**:
    - `CLAUDE.md` MUST be updated at the end of every completed task step with progress,
      what changed, root cause where relevant, and the test command and count.

---

## 2. Technical Standards & Guidelines

### PHP

- **Runtime**: PHP >= 8.1. Strict types (`declare(strict_types=1);`) in every PHP file
  the plugin owns except templates, which follow Kanboard's own template style.
- **Coding Standard**: PSR-12.
- **Namespace**: `Kanboard\Plugin\Drawio\` — and the plugin directory must be `Drawio`,
  because `Core\Plugin\Loader::scan()` derives the class name from the folder.
- **Output Escaping**: every value rendered from a template goes through
  `$this->text->e()`. Never echo a raw variable.
- **No inline `<script>` or `<style>`**: Kanboard's CSP is `default-src 'self'` with no
  `script-src` exception. Inline blocks are silently refused by the browser. Pass values
  to the front end as `<meta>` or `data-*` attributes.

### JavaScript

- **No framework, no build step, no bundler, no runtime dependency.** ES5-style
  `var`/`function` in `Asset/js/`, matching Kanboard's own `assets/js/`.
- **Three modules, one responsibility each**: `drawio-markdown.js` is pure logic and must
  stay DOM-free and testable under Node; `drawio-editor.js` owns the frame and the
  protocol; `drawio-ui.js` owns the DOM.
- **Build DOM with `document.createElement`**, never with `innerHTML` on anything derived
  from user content.
- **Idempotence**: every enhancement runs inside a `MutationObserver` pass and must be
  safe to run repeatedly. Guard with a `data-drawio` marker.

### Front-end coupling

- Every selector borrowed from Kanboard's markup is a dependency. Add it to the table in
  `ARCHITECTURE.md` in the same commit, with the consequence of it breaking.
- Every failure mode must degrade to a missing affordance, never to corrupted Markdown.

---

## 3. Agentic Workflow Conventions

1. **Pre-Commit Verification**:
   - Run `bash scripts/agent-verify.sh` before declaring any task complete.

2. **Git Commit Format**:
   - Conventional commits:
     - `feat: <description>` for new capability
     - `fix: <description>` for bug fixes
     - `test: <description>` for test suite additions
     - `docs: <description>` for documentation updates
     - `security: <description>` for security enhancements
     - `chore: <description>` for tooling and packaging

3. **Subagent Delegation & Task Boundaries**:
   - Work strictly within the single task assigned in the current plan phase.
   - Do not make opportunistic edits to unrelated components.

5. **No AI Git Commits or Pushes**:
   - AI agents (Claude Code, Antigravity, etc.) are **NEVER** allowed to run `git commit`, `git tag`, or `git push`.
   - All commits, tags, and pushes must be performed manually by the maintainer in the terminal CLI to guarantee 100% human author identity (`Youssef BOUTALEB <youssefboutaleb.info@gmail.com>`).

4. **Release Discipline**:
   - `Plugin::getPluginVersion()` is the single source of truth for the version.
   - `CHANGELOG.md` and `docs/kanboard-directory-submission.md` must agree with it.
   - Releases are built by `bash scripts/package-plugin.sh`, never by a GitHub source
     archive — see the submission dossier for why.
