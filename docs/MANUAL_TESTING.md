# Manual Testing — the draw.io round trip

> Task 16, Milestone 3. See [`CLAUDE.md`](../CLAUDE.md).

## Why this document exists

The automated suite (51 tests) covers everything on both sides of the draw.io frame:
the Markdown tokenizer, block identification, payload validation, rendering, the toolbar
button, and every edit path — the last of these against jsdom copies of Kanboard's own
markup. It cannot cover one thing: **the live `postMessage` handshake with draw.io itself**,
which is stubbed in `test/dom.test.js`.

That is the gap this checklist closes. Everything here needs a real browser and a real
`embed.diagrams.net`; nothing here duplicates what `npm test` already proves.

Every command below was executed against `kanboard/kanboard:v1.2.53` while this document
was written, and the observed output is quoted. If a command behaves differently for you,
that is a finding — record it.

---

## 1. Environment setup

### 1.1 Start Kanboard with the plugin mounted

```bash
cd /path/to/kanboard-plugin-drawio

docker run -d --name kanboard-test -p 8080:80 \
    -v "$(pwd)":/var/www/app/plugins/Drawio:ro \
    kanboard/kanboard:v1.2.53
```

Two details matter:

- **The mount point must end in `/Drawio`.** `Core\Plugin\Loader::scan()` derives the
  plugin class from the directory name, so a differently named mount silently loads
  nothing.
- **Keep `:ro`.** The image's entrypoint chowns everything under `/var/www/app`; without
  the read-only flag it rewrites the ownership of your working tree. With it, the
  container logs a harmless `chown: … Read-only file system` line per file and carries on.

The tag is `v1.2.53` — with the `v`. `kanboard/kanboard:1.2.53` does not exist.

Wait for the app, then log in at <http://localhost:8080> as `admin` / `admin`.

### 1.2 Confirm the plugin actually loaded

Before testing anything, prove the plugin is in the page. Two checks, no login needed:

```bash
curl -sI http://localhost:8080/ | grep -i content-security
```

Expected — note `frame-src`, which does not exist in stock Kanboard:

```
Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data:; frame-src 'self' https://embed.diagrams.net;
```

```bash
curl -sL http://localhost:8080/ | grep -o 'drawio-[a-zA-Z-]*'
```

Expected: `drawio-embed-url`, `drawio-max-payload`, and the eight `drawio-label-*` names,
plus the three script paths and the stylesheet.

If `frame-src` is missing, the plugin did not initialise — check
`docker logs kanboard-test` for a `Drawio:` line; `Loader::initializePlugin()` logs and
swallows every exception, so a broken plugin is silent in the UI.

### 1.3 Seed the fixtures

Rather than drawing test diagrams by hand, seed a task and a comment that already contain
a Wiki.js-format payload. This is also the fixture for **M-09**.

```bash
B=http://localhost:8080
api() { curl -sS -u admin:admin -H 'Content-Type: application/json' -d "$1" "$B/jsonrpc.php"; echo; }

api '{"jsonrpc":"2.0","method":"createProject","id":1,"params":{"name":"Diagram QA"}}'

# A minimal draw.io xmlsvg export: an SVG whose content attribute carries the mxfile XML.
SVG='<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" content="&lt;mxfile&gt;&lt;diagram id=&quot;q&quot;&gt;&lt;/diagram&gt;&lt;/mxfile&gt;"><rect width="100" height="50" fill="#dae8fc"/></svg>'
P=$(printf '%s' "$SVG" | base64 -w0)

python3 - "$P" > /tmp/seed.json <<'EOF'
import json, sys
p = sys.argv[1]
d = ("# Architecture\n\nNormal Markdown before.\n\n```diagram\n%s\n```\n\n"
     "Between the two.\n\n```diagram\n%s\n```\n\nNormal Markdown after.\n" % (p, p))
print(json.dumps({"jsonrpc":"2.0","method":"createTask","id":2,
                  "params":{"title":"Wiki.js diagram fixture","project_id":1,"description":d}}))
EOF
api "$(cat /tmp/seed.json)"

python3 - "$P" > /tmp/comment.json <<'EOF'
import json, sys
print(json.dumps({"jsonrpc":"2.0","method":"createComment","id":3,
                  "params":{"task_id":1,"user_id":1,
                            "content":"Comment with a diagram:\n\n```diagram\n%s\n```\n" % sys.argv[1]}}))
EOF
api "$(cat /tmp/comment.json)"
```

All three calls return `{"jsonrpc":"2.0","result":<id>,"id":<n>}`. The task now holds **two
identical diagrams** — deliberately, for **M-06** — separated by text, and the comment holds
a third.

### 1.4 Create the read-only user for M-08

```bash
api '{"jsonrpc":"2.0","method":"createUser","id":4,"params":{"username":"viewer","password":"viewer12345"}}'
api '{"jsonrpc":"2.0","method":"addProjectUser","id":5,"params":{"project_id":1,"user_id":2,"role":"project-viewer"}}'
```

The second call returns `true`. The role string is `project-viewer`
(`Kanboard\Core\Security\Role::PROJECT_VIEWER`); the UI equivalent is
**Project → Permissions** (`/project/1/permissions`) → "Project Viewer".

### 1.5 Lowering the payload budget for M-07

Drawing a 55 KB diagram by hand is tedious. Lower the ceiling instead:

```bash
docker exec kanboard-test sh -c \
    "printf \"\ndefine('DRAWIO_MAX_PAYLOAD_SIZE', 2000);\n\" >> /var/www/app/config.php"

curl -sL http://localhost:8080/ | grep -o 'drawio-max-payload" content="[0-9]*"'
# → drawio-max-payload" content="2000"
```

Restore it when M-07 is done:

```bash
docker exec kanboard-test sh -c "sed -i '/DRAWIO_MAX_PAYLOAD_SIZE/d' /var/www/app/config.php"
curl -sL http://localhost:8080/ | grep -o 'drawio-max-payload" content="[0-9]*"'
# → drawio-max-payload" content="55000"
```

Notes: this image ships `/var/www/app/config.php` and has **no** `data/config.php`, though
`app/common.php` loads both. The entrypoint regenerates `config.php` from environment
variables, so the override is lost on `docker restart` — re-apply it if you restart.

---

## 2. Test matrix

| ID | Case | Primarily proves |
|---|---|---|
| M-01 | Toolbar **Insert diagram** | The button exists, opens draw.io, and writes a fence at the cursor |
| M-02 | `postMessage` handshake | `init` → `load` → `save` → `export` completes against the real editor |
| M-03 | Rendering | The block becomes `<img src="data:image/svg+xml;base64,…">`, not inline SVG |
| M-04 | Edit from the rendered view | The Edit action opens Kanboard's own form and resumes on the right block |
| M-05 | Comments | Insert and edit work on the comment surface |
| M-06 | Multiple diagrams | Editing one leaves the other byte-identical |
| M-07 | Payload budget | An oversized diagram is refused before the textarea is touched |
| M-08 | Permissions | A Project Viewer gets no Edit button anywhere |
| M-09 | Wiki.js compatibility | An existing Wiki.js payload renders, edits, and stays readable by Wiki.js |

> M-06 is not in the original task list, which named eight cases while asking for nine. It
> was chosen because deterministic block identification is the riskiest logic in the plugin
> and the only listed gap the browser can add anything to.

---

### M-01 — Toolbar "Insert diagram"

1. Open task #1 → **Edit the task** (or press `e`).
2. In the description editor's **write** toolbar, find the sitemap icon after the code
   button. Hover: the tooltip reads "Insert diagram".
3. Place the cursor on the empty line after `Normal Markdown after.`
4. Click the button.

**Pass**

- A full-screen white overlay appears with the draw.io editor inside it.
- Nothing behind it is clickable, and the Kanboard modal is still open underneath.
- Draw a shape, click **Save**. The overlay closes.
- The textarea now contains a new ` ```diagram ` fence **at the cursor**, on its own lines,
  with a blank line separating it from the text around it. The rest of the description is
  unchanged.
- Save the task. The new diagram renders.

**On failure**

- No button → the toolbar selector moved; check
  `.text-editor-write-mode > .text-editor-toolbar` in the page and in `drawio-ui.js`.
- Button present, overlay blank → see §3.4, CSP.
- Fence written in the wrong place → the cursor offsets were captured before the editor
  opened; check `insertDiagram()`.

---

### M-02 — The `postMessage` handshake

This is the case the automated suite cannot reach. Follow §3 for the console setup, then:

1. Open DevTools → Console, paste the listener from §3.1.
2. Trigger any diagram editor (M-01 is easiest).
3. Draw something and click **Save**.

**Pass** — the console shows, in order:

| # | Direction | Message |
|---|---|---|
| 1 | draw.io → us | `{"event":"init"}` |
| 2 | us → draw.io | `{"action":"load","autosave":0,"modified":"unsavedChanges","xml":"…","title":"…"}` (inferred — see §3.3) |
| 3 | draw.io → us | `{"event":"save",…}` when Save is clicked |
| 4 | us → draw.io | `{"action":"export","format":"xmlsvg"}` (inferred) |
| 5 | draw.io → us | `{"event":"export","format":"xmlsvg","data":"data:image/svg+xml;base64,…", …}` |

- The iframe `src` is
  `https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=1&noSaveBtn=1&noExitBtn=0`.
- Every incoming event has `origin === "https://embed.diagrams.net"`.
- Closing with the exit button produces `{"event":"exit"}` and writes nothing.

Also run the forged-message check in §3.2. It must be ignored.

**On failure**

- No `init` → the frame never loaded; §3.4.
- `init` arrives but the diagram is empty when editing an existing block → the `load`
  action's `xml` was not the decoded SVG; check `decodePayload()` output in the console.
- `save` arrives but no `export` → the export request was refused; look for a console error
  naming a target-origin mismatch.
- `export` arrives but nothing is written → the payload failed validation; the alert says
  "draw.io returned a diagram that could not be read".

---

### M-03 — Rendering

1. Open task #1 with the plugin **enabled**.
2. Inspect the description in DevTools → Elements.

**Pass**

- Each diagram is a `<figure class="drawio-diagram">` containing
  `<img class="drawio-diagram-image" src="data:image/svg+xml;base64,…">`.
- There is **no** `<svg>` element anywhere in the description, and no `<script>`.
- The original `<pre><code class="language-diagram">` is still in the DOM immediately after
  the figure, carrying `class="drawio-diagram-source"`, visually hidden by CSS. Its
  `textContent` is the untouched payload.
- Console shows no CSP violation for the image.

**On failure**

- Base64 visible as a code block → the CSS did not load, or `:has()` is unsupported; check
  the stylesheet is in the page.
- A "◇ draw.io diagram" placeholder remains → the JS did not run or the payload failed
  validation; check the console.

---

### M-04 — Editing from the rendered view

1. Open task #1 as `admin`, without opening the edit form first.
2. Under the **second** diagram, click **Edit diagram**.

**Pass**

- Kanboard's own large task-edit modal opens (the same one the sidebar's "Edit the task"
  opens).
- draw.io then opens **by itself**, on the second diagram — the one you clicked, not the
  first. Confirm by the shape you edit in M-06.
- Edit, click **Save**. The overlay closes and the modal's description textarea now shows
  the new payload in the second fence.
- Submit the form. The task view reloads with the new diagram.

**On failure**

- Modal opens but draw.io does not follow → the `modal.afterRender` handler did not find
  `#modal-content .text-editor textarea`.
- draw.io opens on the wrong diagram → block identification is wrong. Stop and re-run
  `php test/parsedown-parity.php` against this Kanboard; this is the failure mode the
  parity fixtures exist to catch.
- An alert says the diagram is no longer where it was → the ordinal drifted and the payload
  fallback was ambiguous. Correct behaviour if the description really changed; a bug if it
  did not.

---

### M-05 — Comments

1. On task #1, find the seeded comment. Its diagram renders with an **Edit diagram** action.
2. Click it: the comment's own edit modal opens (medium width), then draw.io.
3. Save, submit the comment form, confirm the comment shows the new diagram.
4. Now write a new comment: in the comment editor's toolbar, use **Insert diagram**, draw
   something, save, and submit.

**Pass** — both flows behave exactly as M-01 and M-04, scoped to the comment. The task
description is untouched by either.

**On failure** — no Edit action on the comment means
`.comment-actions a.js-modal-medium` was not found; open the comment's ⚙ dropdown and check
whether Kanboard renders an Edit entry at all. If it does not, that is M-08 behaviour, not
a bug.

---

### M-06 — Multiple diagrams

The seeded description holds **two identical payloads**. This is the case where a
naive implementation corrupts data.

1. Before editing, capture the description:
   ```bash
   curl -sS -u admin:admin -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","method":"getTask","id":1,"params":{"task_id":1}}' \
       http://localhost:8080/jsonrpc.php > /tmp/before.json
   ```
2. Edit **only the second** diagram (M-04) — make it visibly different, e.g. add a red box.
3. Save the task, then capture again into `/tmp/after.json`.
4. Compare the two fences:
   ```bash
   python3 - <<'EOF'
   import json, re
   b = json.load(open('/tmp/before.json'))['result']['description']
   a = json.load(open('/tmp/after.json'))['result']['description']
   fb = re.findall(r'```diagram\n(.*?)\n```', b, re.S)
   fa = re.findall(r'```diagram\n(.*?)\n```', a, re.S)
   print("count      :", len(fb), "->", len(fa))
   print("first same :", fb[0] == fa[0])
   print("second same:", fb[1] == fa[1])
   print("text same  :", re.sub(r'```diagram\n.*?\n```', 'X', b, flags=re.S)
                      == re.sub(r'```diagram\n.*?\n```', 'X', a, flags=re.S))
   EOF
   ```

**Pass** — `count 2 -> 2`, `first same: True`, `second same: False`, `text same: True`.

**On failure** — `first same: False` means the wrong block was rewritten and the plugin
must not ship. `text same: False` means surrounding Markdown was disturbed.

---

### M-07 — Payload budget

1. Apply the low ceiling from §1.5 (2000 bytes) and reload the page.
2. Insert or edit a diagram, draw a few shapes so the export exceeds 2 KB, and click
   **Save**.

**Pass**

- An alert: "This diagram is too large to be stored in this field. Simplify it and try
  again."
- The textarea is **unchanged** — no partial write, no truncated fence.
- The task can still be saved normally.

Restore the ceiling afterwards (§1.5).

**On failure** — if the fence is written anyway, the check ran after the write; on MySQL
this truncates the entire description, so treat it as a release blocker.

---

### M-08 — Permission-derived edit buttons

1. Log out; log in as `viewer` / `viewer12345`.
2. Open task #1.

**Pass**

- Both description diagrams and the comment diagram **render normally**.
- **No** "Edit diagram" action appears anywhere — not under the description diagrams, not
  under the comment's.
- The Markdown editor toolbar is absent because the viewer cannot open the form at all.

This is inherited, not implemented: the plugin looks for Kanboard's own edit links, and
Kanboard does not render them for this role. Verify the underlying cause directly:

```bash
# As viewer: the sidebar has no js-modal-large, and comment-actions has no js-modal-medium.
# As admin: exactly one of each — /task/1/comment/1/edit for the comment.
```

Observed while writing this document: viewer → 0 sidebar edit links, 0 `js-modal-medium`
anchors inside `.comment-actions`; admin → the sidebar link plus exactly one
`.comment-actions a.js-modal-medium` pointing at `/task/1/comment/1/edit` (the Remove entry
is `js-modal-confirm`, so the selector is unambiguous).

**On failure** — an Edit button visible to a viewer means the selector is matching
something Kanboard renders regardless of permission. Clicking it would produce Kanboard's
"Access Forbidden" page, so nothing is written, but the affordance is wrong and must be
fixed.

---

### M-09 — Wiki.js compatibility

1. The seeded fixtures already use the Wiki.js format. Confirm they render (M-03).
2. Edit one through draw.io and save (M-04).
3. Extract the resulting payload and check it is still a Wiki.js-shaped block:
   ```bash
   python3 - <<'EOF'
   import json, re, base64, urllib.request
   req = urllib.request.Request('http://localhost:8080/jsonrpc.php',
       data=json.dumps({"jsonrpc":"2.0","method":"getTask","id":1,
                        "params":{"task_id":1}}).encode(),
       headers={'Content-Type':'application/json'})
   import base64 as b
   req.add_header('Authorization','Basic '+b.b64encode(b'admin:admin').decode())
   d = json.load(urllib.request.urlopen(req))['result']['description']
   for i, p in enumerate(re.findall(r'```diagram\n(.*?)\n```', d, re.S)):
       svg = base64.b64decode(p).decode('utf-8', 'replace')
       print(i, "single line:", '\n' not in p,
                "| svg:", svg.lstrip().startswith(('<?xml', '<svg')),
                "| mxfile embedded:", 'mxfile' in svg,
                "| bytes:", len(p))
   EOF
   ```

**Pass** — every block reports `single line: True`, `svg: True`, `mxfile embedded: True`.
That is precisely what Wiki.js's `editor-markdown.vue` expects when it base64-decodes the
payload line and hands the SVG back to draw.io.

4. Round trip the other way if a Wiki.js instance is available: paste the edited block into
   a Wiki.js page, confirm it renders and reopens for editing there.

**On failure** — a multi-line payload breaks Wiki.js, which reads the block as exactly
three lines. A missing `mxfile` means the export format was not `xmlsvg` and the diagram is
no longer editable by anyone.

### M-10 — Quoted diagram (added in Milestone 4, Task 22)

The suite stubs `window.confirm`; only a browser shows the real dialog and the real focus
behaviour behind the draw.io overlay.

1. On task 1, use **Reply** on the comment that holds a diagram. Kanboard prefills the reply
   textarea with the comment quoted line by line — including the ` ```diagram ` fence.
2. Save the reply, then click **Edit diagram** under the quoted copy.
3. A confirmation appears: *"This diagram is inside a quoted block. Editing it changes the
   quotation. Continue?"* Press **Cancel** first.
4. Nothing should happen — no draw.io overlay, no change to the comment.
5. Click **Edit diagram** again, **confirm**, change something, and save.
6. Read the stored Markdown back and check the prefix survived:
   ```bash
   curl -s -u admin:admin -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"getAllComments","params":{"task_id":1}}' \
       http://localhost:8080/jsonrpc.php | python3 -m json.tool | grep -c '> ```diagram'
   ```

**Pass** — every line of the quoted fence still begins with `> `, the payload changed, and
the surrounding quoted text is untouched. **On failure** — a payload line that lost its
`> ` marker means the quote was broken by the write, which is the one outcome this feature
must never produce.

Also worth one look: a quoted diagram whose fence is broken by a blank line should refuse
with an explanation rather than writing anything.

### M-11 — Themes (added in Milestone 4, Task 24)

"Is this legible" is not a claim a unit test can make: jsdom does not resolve `var()`, so
the suite can only prove the declarations are theme tokens. This case checks what they
resolve to.

Prepare two diagrams: one saved with draw.io's default (transparent) background, and one
where a page background colour was set in the editor. Put both in task 1's description.

Switch the theme under **My profile → Edit profile → Theme** and reload after each change:

| Theme | Expect |
|---|---|
| Light | Both diagrams legible on a white panel with a hairline border. Nothing looks different from before this task. |
| Dark | Both still legible: the transparent one keeps its white panel rather than vanishing into `#222`. |
| Auto | Follows the OS setting; flip the OS between light and dark and confirm neither breaks. |

Then, on the **dark** theme:

1. The "◇ draw.io diagram" placeholder (visible for a moment before the image renders, or
   permanently with JavaScript disabled) should be readable grey, not the light theme's
   `#777` on `#222`.
2. Break a payload deliberately — edit the task description and delete a few characters from
   inside a fence — and confirm the error line is readable.
3. Open the draw.io editor. The backdrop behind the frame should match the page while it
   loads, with no white flash.

**Pass** — no diagram is invisible in any theme, and no plugin text is unreadable against
the page. **On failure** — a diagram that disappears on dark means the surface rule is not
reaching the image; check that `.drawio-diagram-image` still carries the plugin's class.

### M-12 — Full-size viewer (added in Milestone 4, Task 23)

jsdom has no layout engine, so the suite can prove the overlay exists, closes and toggles a
class — but not that anything is actually *bigger*. That is this case.

1. On task 1, click **View full size** under a diagram. It should fill the screen on a dark
   backdrop, noticeably larger than the inline render.
2. Press **Escape**. The viewer closes — and the task page beneath it stays open. (Do this
   with the diagram inside a Kanboard modal too: the modal must survive.)
3. Reopen, then click the **picture**: it switches to the diagram's own size and the surface
   scrolls. Click again to fit. Nothing should close on these clicks.
4. Reopen, then click the **backdrop** beside the image. It closes.
5. Keyboard: Tab to the View link, press Enter, confirm focus lands on the close button,
   press Tab a few times (focus must not escape behind the overlay), press Enter to close,
   and confirm focus returns to the View link.
6. Open the draw.io editor on a diagram; while it is open, no viewer should be reachable.
7. As a `project-viewer` user, and on the public task URL, confirm **View full size** is
   present and **Edit diagram** is not.

**Pass** — the viewer is larger than the inline render in every case, closes three ways,
and never leaves the keyboard stranded. **On failure** — a viewer that closes when the
picture is clicked means the backdrop test is matching the image; a page that navigates
means the action's `preventDefault` is not firing.

---

## 3. DevTools protocol inspection guide

### 3.1 Watch the messages draw.io sends

Open the console **on the Kanboard page** (not inside the iframe) and paste this before
opening any diagram:

```js
window.__drawioLog = [];
window.addEventListener('message', function (e) {
    if (e.origin.indexOf('diagrams.net') === -1) return;
    var d = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
    window.__drawioLog.push({origin: e.origin, data: d});
    console.log('%c⇦ draw.io', 'color:#2b7', e.origin, d.slice(0, 300));
}, false);
```

Every protocol event from the editor is now logged. `window.__drawioLog` holds the whole
exchange for after-the-fact inspection.

### 3.2 Prove the origin check (security)

With the editor open, forge an export from the page itself:

```js
window.postMessage(JSON.stringify({
    event: 'export',
    format: 'xmlsvg',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='
}), '*');
```

**Nothing must happen.** No textarea change, no overlay close. The message is refused
because `event.source` is the top window rather than the plugin's frame, and because its
origin is Kanboard's, not draw.io's — the two checks in `drawio-editor.js:onMessage()`.

If the textarea changes, the origin pinning is broken and the plugin must not ship: any
page able to reach this window could rewrite a task description.

### 3.3 About outgoing messages

The plugin's own `load` and `export` actions **cannot be intercepted** from the console.
They are sent through `iframe.contentWindow.postMessage`, and `contentWindow` for a
cross-origin frame is a `WindowProxy` whose methods cannot be patched — which is a browser
security property, not a limitation of the plugin.

Infer them from their effects, which is sufficient:

- The `load` action worked if the diagram appears in the editor with its existing content
  (for an edit) or empty (for an insert).
- The `export` action worked if an `{"event":"export"}` message arrives after Save.
- A **wrong target origin** is loud: the console shows
  `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided … does not
  match the recipient window's origin`. Seeing that message means `DRAWIO_EMBED_URL` and
  the frame's actual origin disagree.

To read the raw outgoing calls, set a breakpoint on the `send` function in
`drawio-editor.js` via DevTools → Sources instead.

### 3.4 CSP failures

If the overlay appears but stays blank, check the console for:

```
Refused to frame 'https://embed.diagrams.net/' because it violates the following
Content-Security-Policy directive: "frame-src 'self'".
```

That means `Plugin::allowEmbedFrame()` did not run or was overwritten by another plugin
calling `setContentSecurityPolicy()` with a replacement array. Re-check §1.2 — the header
is the authority, not the source.

---

## 4. Results log

Copy this table into the pull request or the task that tracks Milestone 3. A run is only
complete when every row has a verdict and a browser recorded.

| ID | Verdict | Browser / version | Notes |
|---|---|---|---|
| M-01 Insert | | | |
| M-02 Handshake | | | |
| M-03 Rendering | | | |
| M-04 Edit from view | | | |
| M-05 Comments | | | |
| M-06 Multiple diagrams | | | |
| M-07 Budget | | | |
| M-08 Permissions | | | |
| M-09 Wiki.js | | | |
| M-10 Quoted diagram | | | |
| M-11 Themes | | | |
| M-12 Full-size viewer | | | |

Run the matrix on at least one Chromium-based and one Gecko-based browser: the plugin uses
`document.execCommand('insertText')` for undo-preserving writes with a `value` assignment
fallback, and the two engines take different paths through it.

Record every finding in `CLAUDE.md` under Milestone 3, with root cause — not just a
verdict.

---

## 5. Teardown

```bash
docker rm -f kanboard-test
```

Then confirm the plugin's most important property, which needs no browser at all: **its
absence changes nothing.** Restart Kanboard without the mount, open the task, and check
that the ` ```diagram ` blocks are still present and byte-identical as plain code blocks.
The plugin never writes to storage, so this must hold by construction — verify it anyway.
