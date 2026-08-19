# Spec 004 — Dark-theme legibility

> Status: implemented (Milestone 4, Task 24)
> Milestone: 4
> Author: Milestone 4 planning

## Problem

Kanboard ships three themes. On the dark one the page background is `#222`, and a draw.io
diagram whose own background is transparent — dark strokes on nothing — is rendered
directly onto it. The lines disappear. The plugin also hardcodes two colours of its own,
`#777` for the "◇ draw.io diagram" placeholder and `#b94a48` for a decode error, which were
chosen against the light theme and stay put when the theme changes.

## Verified facts

| Fact | Source | Consequence |
|---|---|---|
| Themes are separate stylesheets chosen per user: `assets/css/{light,dark,auto}.min.css`, selected by `$this->user->getTheme()`; public pages force `light` | `app/Template/layout.php` | Nothing in the DOM says which theme is active — no `data-theme`, no class |
| `auto.min.css` carries exactly one `@media (prefers-color-scheme: dark)` block, which redefines the same custom properties | `assets/css/auto.min.css` | Only the *auto* theme follows the OS; explicit light and dark ignore it |
| Light defines `--color-light:#777`, `--color-error:#b94a48`, `--body-background-color:#FFF`; dark defines `--color-light:#a0a0a0`, `--color-error:#b94a48`, `--body-background-color:#222` | `assets/css/{light,dark}.min.css` | The plugin's two hardcoded colours are **exactly** the light theme's tokens, so switching to the variables is faithful on light and adaptive on dark |
| Kanboard sets `box-sizing` in only two rules; there is no global `* { box-sizing: border-box }` | `assets/css/light.min.css` | Padding added to a `max-width: 100%` image would overflow its container unless the plugin sets `box-sizing` itself |
| `.markdown img{display:block;max-width:80%;margin-top:10px}` — specificity (0,1,1), so it outranks a single class | `assets/css/light.min.css` | Kanboard, not the plugin, decides a diagram's width; it sets no background, so the surface is uncontested. Asserted in `test/theme.test.js` |
| draw.io's embed `export` action takes a `background` parameter; the plugin does not send one, so the exported SVG's background is whatever the diagram's author configured | drawio.com embed-mode documentation; `Asset/js/drawio-editor.js` | Whether a payload has its own background is **unknowable to the plugin** and varies per diagram |
| jsdom applies stylesheets and computes `background-color`/`padding`, tolerates `:has()`, exposes `var()` in a **longhand** but not inside a shorthand, does not resolve `var()`, and answers `getComputedStyle(el, '::before')` with "Not implemented" | probed with the installed jsdom 30 | The suite can assert the surface through the cascade and the theme tokens through the parsed rules; colours are written as longhands so they are readable at all |

## Assumptions

None outstanding.

## Design

**A constant, opaque surface under every diagram, and Kanboard's tokens for everything
else.**

`Asset/css/drawio.css`

- `.drawio-diagram-image` gets a light "paper" background, small padding, a hairline border
  in `--color-lighter` and `box-sizing: border-box` so the padding cannot push the image
  past its container. Colours are written as **longhands** (`background-color`,
  `border-color`) rather than shorthands, so a `var()` stays inspectable — see the jsdom
  row above.
- The placeholder colour becomes `var(--color-light, #777)` and the decode-error colour
  `var(--color-error, #b94a48)` — identical rendering on light, adaptive on dark, and the
  fallbacks keep the plugin correct if a future Kanboard drops the tokens.
- The editor overlay's backdrop becomes `var(--body-background-color, #ffffff)`, so the
  flash before draw.io paints matches the page instead of being white on a dark install.

No JavaScript changes, no new coupling: custom properties are read, never defined, and every
one has a fallback.

## Rejected alternatives

- **`@media (prefers-color-scheme: dark)` to apply the paper only on dark.** It gets the
  important case wrong. A user on the explicit *dark* theme with a light OS would get no
  paper and an unreadable diagram, which is precisely the bug being fixed; a user on the
  explicit *light* theme with a dark OS would get a white panel they do not need. The media
  query only tracks the *auto* theme.
- **Detecting the theme in JavaScript** by measuring `getComputedStyle(document.body)
  .backgroundColor` and setting a class. It would work for all three themes and for custom
  stylesheets, but it adds a runtime dependency on computed styles, a class that must be
  kept in sync with re-renders, and a second code path — to solve, at best, the cosmetic
  question of whether a light page shows a white panel on white. A constant surface already
  makes both themes correct. Worth revisiting only if the panel proves visually intrusive.
- **Asking draw.io for a background at export time** (`{action:'export', format:'xmlsvg',
  background:'#ffffff'}`). It bakes a light background into the stored payload, which
  changes the artifact for Wiki.js and for anyone reading it on a dark surface, and it fixes
  nothing for the diagrams that already exist. The storage format should stay the author's
  diagram, not the reader's theme.
- **Inspecting the decoded SVG for a background rect and adapting.** Requires parsing
  untrusted payload content to make a rendering decision — the exact thing
  `AGENTS.md` §1.5 forbids — for a marginal gain.
- **Using `--body-background-color` as the image surface.** On dark that is `#222`, so a
  transparent diagram with dark strokes would be exactly as invisible as before.

## Storage impact

None. This is a stylesheet.

## Security review

- **Does anything reach the DOM that is not an `<img>` `data:` URI?** No change.
- **Does anything new cross an origin boundary?** No. No new asset, font or URL: the
  stylesheet gained no `url()`.
- **Does this widen the CSP?** No.
- **Can any input reach the Markdown without validation?** No write path is touched.

The payload is still never parsed to decide how to render it, which is why the surface is a
constant rather than something inferred from the SVG.

## Tests

| Test | File | What it proves |
|---|---|---|
| a rendered diagram sits on an opaque surface | `test/theme.test.js` | The dark-theme bug is fixed at the element that shows the diagram |
| the surface cannot push the image out of its container | `test/theme.test.js` | `box-sizing: border-box`, given Kanboard has no global reset |
| the placeholder colour is a Kanboard theme token with a fallback | `test/theme.test.js` | It follows the theme instead of staying light-grey |
| the decode-error colour is a Kanboard theme token with a fallback | `test/theme.test.js` | Same, for the error state |
| the editor backdrop follows the page background | `test/theme.test.js` | No white flash on a dark install |
| the border colour is a Kanboard theme token with a fallback | `test/theme.test.js` | The edge follows the theme too |
| Kanboard's own `.markdown img` rule cannot take the surface away | `test/theme.test.js` | The one core rule that outranks a single class decides width, not legibility |
| the fallbacks are the values the light theme defines | `test/theme.test.js` | Light rendering is unchanged by this task |
| the stylesheet defines no custom properties of its own | `test/theme.test.js` | The plugin reads Kanboard's theme; it does not ship one |
| every theme token used carries a fallback | `test/theme.test.js` | A Kanboard that drops a token cannot leave a colour unset |

The stylesheet is loaded from disk and parsed by jsdom rather than grepped. The surface and
`box-sizing` are read back through selector matching and the cascade; the two
pseudo-element colours are read from the parsed rule, because jsdom does not implement
`getComputedStyle` for pseudo-elements — that proves the declaration parses and is attached
to the intended selector, not that the selector matches. What jsdom cannot do at all —
resolve `var()` against a real theme — is exactly what the manual pass covers.

**Manual**: `docs/MANUAL_TESTING.md` M-11 walks light, dark and auto against a diagram with
its own background and one without, because "is this legible" is not a claim a unit test
can make.

## Failure modes

| If | The user sees |
|---|---|
| A future Kanboard drops a custom property | The fallback: today's light-theme colour. Nothing breaks. |
| A diagram carries its own dark background | A light border around a dark picture, identically in both themes — predictable, if not beautiful. |
| A custom stylesheet redefines the tokens | The diagram surface stays constant and legible; the placeholder and error text follow that stylesheet. |
