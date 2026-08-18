# 1. Render diagrams in the browser, not in the Markdown pipeline

Date: 2026-08-18
Status: accepted

## Context

Kanboard centralises Markdown rendering in `TextHelper::markdown()`, which constructs
`Kanboard\Core\Markdown` — a Parsedown subclass. The obvious way to add a diagram block is
to subclass that parser and render the diagram server-side.

Reading the source changed the question. `Parsedown::blockFencedCode()` already turns a
` ```diagram ` fence into `<pre><code class="language-diagram">payload</code></pre>`, with
the payload preserved byte-for-byte. The block we need already exists in every rendered
Kanboard page, with no plugin involved.

Meanwhile `TextHelper::markdown()` hardcodes `new Markdown($this->container, $isPublicLink)`,
so reaching a subclass means replacing the whole text helper — copying the body of
`markdown()`, competing with any other plugin that overrides `text`, and re-verifying after
every Kanboard release.

## Decision

Render in the browser. The plugin contributes no parser and no server-side rendering. It
attaches three scripts and one stylesheet, adds one CSP directive, and does its work on the
DOM Kanboard already produces.

## Consequences

**Gained**

- The only server-side coupling is three hook names and the shape of `$container['cspRules']`.
- No conflict with any other plugin; nothing in the Markdown pipeline is replaced.
- Every Markdown surface is covered at once, including ones added by other plugins.
- Disabling the plugin is inert: the stored Markdown was never transformed.

**Given up**

- Notification emails show a diagram as a code block rather than a picture. Server-side
  rendering would emit `<img src="data:…">`, which most mail clients block anyway — the
  loss is smaller than it looks.
- Public token board views load none of Kanboard's JavaScript, so diagrams do not render
  there.
- Rendering depends on the CSS class name Parsedown emits. If that changes, diagrams stop
  rendering — a visible, non-destructive failure, and one the parity fixtures catch on the
  next upgrade.

**Reversible**

Adding a server-side renderer later is additive: it would not change the stored format, the
block identification, or the client. This decision does not need to be undone to gain
server-side output — only extended.
