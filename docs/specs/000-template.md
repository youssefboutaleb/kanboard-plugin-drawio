# Spec NNN — <Feature name>

> Status: draft | approved | implemented | superseded
> Milestone: <n>
> Author: <who>

## Problem

What a user cannot do today, in one paragraph. No solution here.

## Verified facts

What was read in the source, with file and line. Anything not verified goes under
Assumptions below and must be verified before implementation starts.

| Fact | Source | Consequence |
|---|---|---|
| | | |

## Assumptions

Anything the design depends on that has **not** been read in the source. Each one needs a
verification step and must be resolved before code is written.

- `ASSUMPTION`: …  → verify by: …

## Design

What changes, file by file. Name the extension points used. If a new coupling to Kanboard
markup or internals is introduced, list it — it also goes in `ARCHITECTURE.md`.

## Rejected alternatives

What else was considered and the specific cost that ruled it out. "Less elegant" is not a
cost.

## Storage impact

Must be "none". The Markdown field is the only storage. If this feature appears to need a
table, a cache or a side file, stop and write an ADR in `docs/decisions/` instead.

## Security review

- Does anything reach the DOM that is not an `<img>` `data:` URI?
- Does anything new cross an origin boundary?
- Does this widen the CSP? By which directive, and why is that the minimum?
- Can any input reach the Markdown without validation?

## Tests

| Test | File | What it proves |
|---|---|---|
| | | |

Parser assumptions need a fixture in `test/fixtures/markdown-cases.json` and regenerated
expectations from the real Parsedown.

## Failure modes

For each way this can break: what the user sees. Every answer must be a missing
affordance, never corrupted Markdown.
