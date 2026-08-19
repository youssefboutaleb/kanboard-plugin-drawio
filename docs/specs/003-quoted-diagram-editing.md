# Spec 003 — Editing a diagram inside a blockquote

> Status: implemented (Milestone 4, Task 22)
> Milestone: 4
> Author: Milestone 4 planning

## Problem

Replying to a comment that contains a diagram produces a quoted copy of it —
`TextHelper::reply()` prefixes every line with `> `. That copy renders, because the
tokenizer counts quoted fences so ordinals stay right, but the Edit button refuses to write
to it: replacing the payload would have to re-quote the new one, and Milestone 1 chose a
refusal over a half-rewritten quote. The result is a diagram a user can see, can open, and
then cannot save — the most common way a diagram reaches a comment is also the one place
editing does not work.

## Verified facts

Probed against the vendored Parsedown 1.7.4 (`libs/erusev/parsedown/Parsedown.php` from
`kanboard/kanboard` 1.2.53) and compared line by line with `findDiagrams()`:

| Case | Parsedown | Tokenizer | Consequence |
|---|---|---|---|
| `> ```diagram` / `> QUFB` / `> ``` ` | one diagram, `QUFB` | agrees, `quoted: true` | The shape `reply()` produces; the case worth supporting |
| Content line without a marker (lazy continuation) | one diagram, `QUFB` | agrees | The payload region contains a line that is *not* quoted |
| Content **and** closing fence lazy | one diagram, `QUFB` | agrees | Same |
| Nested `> > ` | one diagram | agrees | The prefix is two markers deep and must be reproduced verbatim |
| `>` with no space | one diagram | agrees | The prefix is `>`, not `> ` |
| Unterminated quoted fence | one diagram | agrees | Content region runs to end of document |
| `> ~~~diagram` | one diagram | agrees | Tilde fences quote like backtick fences |
| Mixed indentation inside the quote (`>  QUFB`, `>   ``` `) | one diagram | agrees | Extra spaces are code content, irrelevant to a base64 payload |
| **Blank line inside the quoted fence** | one diagram, `QUFB` | agrees on the payload | **But the structures differ** — see below |
| Quote indented by three spaces | one diagram | agrees | Still one diagram |
| Quoted diagram followed by an unquoted one | two diagrams, in order | agrees, `[true, false]` | Ordinals are unaffected by quoting |

**The blank-line case is why this feature is not a one-line change.** In

```
> ```diagram
> QUFB
                  ← blank
> ```
```

Parsedown ends the blockquote at the blank line, so the fence is unterminated inside the
first quote and the trailing `> ``` ` is a *second* blockquote. The tokenizer scans lines
and treats the whole thing as one fence whose content region spans the payload **and the
blank line**. Both agree the payload is `QUFB`, which is all the read path needs — but
writing over that region would delete the blank line and merge two blockquotes into one.
That is content damage, not a payload edit.

## Assumptions

None outstanding. Every row above was executed, not reasoned about; the probe cases are now
fixtures in `test/fixtures/markdown-cases.json` with expectations regenerated from the real
Parsedown.

## Design

**Write only into a fence whose payload region is entirely inside the quote.** A quoted
fence becomes writable when every line of its content region carries at least the opening
line's quote depth. That admits the shape `reply()` produces and every consistently quoted
variant, and refuses lazy continuation and the blank-line case — the two shapes where
rewriting the region would change something other than the payload.

`Asset/js/drawio-markdown.js`

- `findFences()` records, for a fence opened inside a quote, the **exact** prefix consumed
  from the opening line (`quotePrefix`, e.g. `"> "`, `"> > "`, `">"`, `"   > "`) and its
  depth, and sets `lazyQuote` if any content line strips to a shallower depth.
- `isWritableFence(fence)` — pure predicate: unquoted fences are writable; quoted ones are
  writable when they have a prefix and no lazy content line.
- `fenceReplacement(fence, payload)` — the exact text to write over the content region,
  which is the prefix plus the payload plus a newline. `replacePayload()` uses it, so the
  string written is the same one the tests assert.

`Asset/js/drawio-ui.js`

- `isWritable()` asks `isWritableFence()` instead of rejecting every quoted fence.
- Editing a quoted diagram asks for confirmation once, before the editor opens. Rewriting
  a quotation changes words attributed to someone else; that is worth one click, and it is
  the only place in the plugin where a successful edit changes text the user did not write.
- The write itself goes through `fenceReplacement()`.

`Template/layout/config.php` — the `quoted` string is reworded to describe the shape that
is actually refused, and a `quotedConfirm` string is added.

No new coupling to Kanboard: this is entirely inside the plugin's own tokenizer and its
existing textarea write path.

## Rejected alternatives

- **Write with the prefix of each original content line.** The payload becomes one line, so
  there is no per-line prefix to preserve — only the opening line's prefix is meaningful.
- **Re-quote the whole fence (opening line, payload and closing line).** Touches lines the
  edit has no reason to touch, and turns a payload edit into a reformat.
- **Support the blank-line and lazy shapes by normalising them into a consistent quote.**
  It would render correctly, but it silently rewrites the user's document structure —
  deleting a blank line, merging two blockquotes — to make an edit convenient. A refusal
  costs a click; this costs trust.
- **Unquote the diagram and edit it as the user's own.** Changes the meaning of the text: a
  quotation would become an assertion.
- **Drop the confirmation.** Considered, because a dialog on every quoted edit is friction.
  Kept because the friction is proportional to what is being changed, and quoted diagrams
  are rare enough that nobody meets the dialog often.

## Storage impact

None. The Markdown field remains the only storage, and only the payload region of one fence
is rewritten.

## Security review

- **Does anything reach the DOM that is not an `<img>` `data:` URI?** No change to the
  render path.
- **Does anything new cross an origin boundary?** No. The same editor session, the same
  pinned origin.
- **Does this widen the CSP?** No.
- **Can any input reach the Markdown without validation?** No. The payload is still checked
  by `isValidPayload()` before it is written, so nothing containing a newline, a backtick or
  a quote marker can reach the document and break out of its fence. The prefix written is
  not user input in the free-text sense — it is a substring the tokenizer consumed from the
  document's own opening line, and it is re-emitted verbatim.

One property worth stating: the prefix is copied from the fence being edited, so a document
cannot be made *more* quoted or *less* quoted by an edit. Depth in equals depth out.

## Tests

| Test | File | What it proves |
|---|---|---|
| a quoted diagram is writable and keeps its `> ` prefix | `test/markdown.test.js` | The `reply()` shape round-trips |
| a nested `> > ` prefix is reproduced verbatim | `test/markdown.test.js` | Depth in equals depth out |
| a `>` marker with no space keeps its exact form | `test/markdown.test.js` | The prefix is copied, not reconstructed |
| an unterminated quoted fence is written to the end of the document | `test/markdown.test.js` | The content region is respected |
| a lazy continuation line makes the fence non-writable | `test/markdown.test.js` | The refusal that protects unquoted content |
| a blank line inside a quoted fence makes it non-writable | `test/markdown.test.js` | The structural-damage case is refused, not normalised |
| editing a quoted diagram leaves every other byte untouched | `test/markdown.test.js` | The core guarantee, now for quoted fences |
| a quoted edit does not change how the document tokenizes | `test/markdown.test.js` | Ordinals survive the edit |
| the tokenizer agrees with Parsedown on the new quoted fixtures | `test/parity.test.js` | The parser, not the memory of it |
| a quoted diagram offers Edit and writes back after confirmation | `test/dom.test.js` | Replaces the old "renders but is not editable" test |
| declining the confirmation writes nothing | `test/dom.test.js` | The dialog is a gate, not a notice |
| a non-writable quoted diagram still refuses | `test/dom.test.js` | The refusal path survives |

## Failure modes

| If | The user sees |
|---|---|
| The quoted fence is lazily continued or broken by a blank line | An explanation that this quotation cannot be edited in place. The Markdown is untouched. |
| The user declines the confirmation | Nothing happens. No editor, no write. |
| The Markdown changed while draw.io was open | The existing relocate-or-refuse path, unchanged: ordinal, then unique payload, then refusal. |
| A future Parsedown changes how quoted fences parse | `test/parity.test.js` fails on regeneration, before any user is affected. |
