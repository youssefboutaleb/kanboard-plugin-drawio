# Draw.io diagrams for Kanboard Markdown

Kanboard Markdown now natively supports draw.io diagrams.

A fenced block tagged `diagram` is displayed as the diagram it describes, with an
**Edit diagram** action, and the Markdown toolbar gains an **Insert diagram**
button that opens the draw.io editor.

````markdown
# Architecture

Some normal Markdown.

```diagram
PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIC4uLg==
```

More Markdown.
````

This is a Markdown extension, not a wiki. There is no diagram store, no document
system, no extra table and no extra permission model — the Markdown field is the
only place a diagram ever lives.

## What it does

| | |
|---|---|
| **View** | Every Markdown surface — task descriptions, comments, project and swimlane descriptions, the editor preview pane — renders `diagram` blocks as images. |
| **Edit** | The diagram carries an *Edit diagram* action wherever Kanboard itself offers an edit action for the surrounding text. Saving replaces that one block in the textarea; the change is then saved by Kanboard's ordinary form. |
| **Insert** | The Markdown editor toolbar gets an *Insert diagram* button that opens draw.io and writes a new fence at the cursor. |
| **Interoperate** | The payload is byte-for-byte the format [Wiki.js](https://js.wiki) uses, so diagrams move between the two in either direction. |

## Requirements

- Kanboard **1.2.20** or later (verified against 1.2.53)
- A browser that can reach the draw.io editor, by default `https://embed.diagrams.net`

No PHP extension, no Composer dependency, no build step, no database change. The
plugin ships no third-party code.

## Installation

Unpack the plugin into Kanboard's `plugins/` directory. **The directory must be
named `Drawio`** — Kanboard derives the plugin's namespace from it.

```bash
cd /path/to/kanboard/plugins
git clone https://github.com/youssefboutaleb/kanboard-plugin-drawio Drawio
```

Nothing else is required: the plugin adds its own `frame-src` entry to
Kanboard's Content-Security-Policy when it loads.

### Configuration

Both settings are optional constants in Kanboard's `config.php`.

```php
// Use a self-hosted draw.io instead of the public editor.
define('DRAWIO_EMBED_URL', 'https://drawio.example.com/');

// Largest base64 payload the plugin will write into a Markdown field, in bytes.
// 0 disables the check. Default: 55000.
define('DRAWIO_MAX_PAYLOAD_SIZE', 55000);
```

`DRAWIO_EMBED_URL` must point at a draw.io deployment that supports embed mode;
the plugin appends `embed=1&proto=json&…` itself. Its origin is what the plugin
adds to the CSP and what it checks incoming `postMessage` events against, so
pointing this at a host you do not trust hands that host your editing session.

#### A note on MySQL

MySQL and MariaDB store task descriptions and comments in a `TEXT` column, which
holds **65535 bytes** — and overflowing it truncates the entire field, not just
the diagram. That is why the plugin refuses to write a payload larger than
`DRAWIO_MAX_PAYLOAD_SIZE`. SQLite and PostgreSQL have no such limit; on those
you can raise or disable it. Admins who want large diagrams on MySQL can widen
the columns themselves:

```sql
ALTER TABLE tasks MODIFY description MEDIUMTEXT;
ALTER TABLE comments MODIFY comment MEDIUMTEXT;
```

## Storage format

Inside the fence is the base64 of an SVG produced by draw.io's `xmlsvg` export.
The SVG's `content` attribute carries the editable `mxfile` XML, which is what
makes one payload serve as both the picture and the source:

````
```diagram
<base64 of <svg … content="&lt;mxfile&gt;…&lt;/mxfile&gt;">…</svg>>
```
````

This is exactly what Wiki.js writes and reads, so existing Wiki.js pages paste
into Kanboard unchanged and vice versa. No Wiki.js code is used or included;
only the on-disk format is shared.

## Security

- **Diagrams render as `<img src="data:image/svg+xml;base64,…">`, never as
  inline SVG markup.** An SVG loaded through `<img>` is handled in the browser's
  restricted "SVG as an image" mode: scripts do not run, event handlers do not
  fire, and external subresources are not fetched. A hostile diagram is inert
  without anything having to sanitise it, and diagrams cannot phone home.
- **Payloads are validated before they are written.** Only canonical base64 of
  something that parses as an SVG document is accepted. Since the base64
  alphabet contains no backtick, tilde or newline, a payload cannot terminate
  its own fence or inject Markdown around it.
- **The draw.io frame is pinned.** Messages are accepted only when both the
  origin and the source window match the frame the plugin opened, and outgoing
  messages are addressed to that origin rather than `*`.
- **CSP is widened by exactly one directive.** `frame-src 'self' <embed origin>`;
  `img-src` already allowed `data:` in stock Kanboard. Existing rules, including
  any contributed by other plugins, are preserved.
- **Authorisation and CSRF are Kanboard's.** The plugin has no controller, route
  or endpoint. It writes into a textarea inside a Kanboard form; a user who
  cannot open that form sees no Edit button, and a user who forges the request
  hits Kanboard's own checks. A read-only user has no path to persist anything.

## Limitations

- A diagram inside a blockquote (what replying to a comment produces) renders,
  but cannot be edited in place — rewriting a quoted block's payload would have
  to re-quote it, and a half-rewritten quote is worse than a refusal.
- Notification emails contain the Markdown as Kanboard renders it server-side,
  so a diagram appears there as a code block rather than a picture.
- Public (token) board views load none of Kanboard's JavaScript, so diagrams are
  not rendered there.

## Development

```bash
npm install  # jsdom, the only development dependency
npm test     # node --test
```

The suite covers the Markdown tokenizer, block identification and payload
validation as pure functions, and the browser side — rendering, the toolbar
button, and every edit path — against jsdom copies of Kanboard's own markup.

`test/fixtures/parsedown-expected.json` records what Kanboard's parser actually
emits for a set of awkward inputs, and the suite asserts the JavaScript tokenizer
agrees with it. Regenerate it against a Kanboard checkout after a Kanboard
upgrade:

```bash
php test/parsedown-parity.php /path/to/kanboard
```

Before opening a pull request, run the full pipeline:

```bash
bash scripts/agent-verify.sh
```

It lints both languages, runs the suite, and checks the rules no unit test can see —
that every asset on disk is attached in `Plugin.php`, that no template carries an inline
`<script>` (Kanboard's CSP refuses them), that no schema or route has appeared, and that
nothing reaches the DOM through `innerHTML`.

Releases are built by `bash scripts/package-plugin.sh`, which refuses to package a red
suite and asserts the archive extracts to `Drawio/` — a GitHub source archive would not,
and Kanboard's installer would load it under the wrong name.

### Further reading

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | What was verified in the Kanboard source, the architecture comparison, and every coupling the plugin has |
| [AGENTS.md](AGENTS.md) | Non-negotiable rules for humans and AI agents working here |
| [CLAUDE.md](CLAUDE.md) | Milestone roadmap, command cheat-sheet, and the running task log |
| [docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md) | The browser checklist for the draw.io round trip — the one thing the automated suite cannot cover |
| [docs/specs/](docs/specs/) | Feature specs — write one before writing feature code |
| [docs/decisions/](docs/decisions/) | Architecture decision records |
| [docs/kanboard-directory-submission.md](docs/kanboard-directory-submission.md) | Everything needed to list the plugin in the official directory |

## License

MIT — see [LICENSE](LICENSE).
