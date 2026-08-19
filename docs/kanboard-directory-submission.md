# Kanboard Plugin Directory — Submission Dossier

Everything required to list **Drawio** in the official Kanboard plugin directory, which is
the `plugins.json` file in the [`kanboard/website`](https://github.com/kanboard/website)
repository and is what powers <https://kanboard.org/plugins.html> and Kanboard's in-app
plugin installer.

> **State: `v0.2.0` is prepared but not yet tagged; `v0.1.0` and `v0.1.1` are published;
> nothing is submitted to the directory.**
>
> `v0.1.1` (2026-08-18) is the newest published release. `v0.2.0` adds quoted-diagram
> editing, the full-size viewer and dark-theme legibility — everything in this dossier
> points at it. The maintainer commits and tags; CI builds and publishes the asset.
>
> No pull request has been opened against `kanboard/website`, so the plugin is not listed —
> confirmed against the live file on 2026-08-18: 158 entries, case-insensitively ordered,
> no `Drawio`, insertion point between `DiscordNotifier` and `duedate`.

---

## 1. Repository URL

<https://github.com/youssefboutaleb/kanboard-plugin-drawio>

## 2. Plugin name

**Drawio**

## 3. Plugin identifier

`Drawio`

This is the `plugins.json` object key, the value returned by `Plugin::getPluginName()`,
the PHP namespace segment (`Kanboard\Plugin\Drawio`), **and** the directory name inside
`plugins/`. `Core\Plugin\Loader::scan()` derives the plugin class from the folder name,
so all four must match exactly — including case.

> Note the deliberate mismatch: the **repository** is `kanboard-plugin-drawio` while the
> **plugin** is `Drawio`. That is allowed — the identifier comes from the directory inside
> the archive, not from the repository name — but it is exactly why `remote_install` must
> point at a purpose-built release asset and never at a GitHub source archive (see §8).

## 4. Current version

`0.2.0` — declared by `Plugin::getPluginVersion()`, the single source of truth.
`0.1.0` and `0.1.1` remain on the releases page; `0.2.0` is the version to list.
`scripts/package-plugin.sh` reads the version from there, and `CHANGELOG.md` must agree.

## 5. License

**MIT** (`LICENSE`, `package.json`, and the `license` field below all agree).

The plugin ships **no third-party code**: no vendored library, no bundle, no build output.
`jsdom` is a development dependency used only by the test suite and is not packaged.

The storage format is byte-compatible with [Wiki.js](https://js.wiki), which is AGPL-3.0,
but no Wiki.js code is copied, adapted or redistributed — only the on-disk data format is
shared, and a data format is not a derivative work. There is therefore no copyleft
obligation on this MIT listing.

## 6. Compatibility

`>=1.2.20`

Derived, not guessed. The floor is set by the front end the plugin attaches to: the `KB`
component runtime, the `template:layout:head` hook, and the `text-editor` component whose
toolbar receives the Insert button. All three are present in v1.2.20 (verified by fetching
`app/Template/layout.php` and `assets/js/components/text-editor.js` at that tag), and the
CSP container key and `AssetHelper::js()` behaviour predate it.

`Plugin::getCompatibleVersion()` returns the same string, so `Core\Plugin\Loader` refuses
the plugin cleanly on an older core instead of failing inside a hook.

Verified against Kanboard v1.2.53 (current release at time of writing) with Parsedown
1.7.4, the copy vendored at `libs/erusev/parsedown/`. Requires **PHP >= 8.1**.

## 7. Release URL

    https://github.com/youssefboutaleb/kanboard-plugin-drawio/releases/tag/v0.2.0

## 8. Download ZIP URL

    https://github.com/youssefboutaleb/kanboard-plugin-drawio/releases/download/v0.2.0/Drawio-0.2.0.zip

This is the release **asset** built by `scripts/package-plugin.sh`, not a GitHub source
archive. The distinction is mandatory: the `kanboard/website` README explicitly warns that
GitHub archive URLs "create incorrect directory structures". A source archive would extract
to `kanboard-plugin-drawio-0.2.0/`, which Kanboard would try to load as a plugin named
`Kanboard-plugin-drawio-0.2.0` — the class would not resolve and the plugin would never
load.

The built asset extracts to `Drawio/`, and the packaging script fails the build if the
archive's first entry is anything else — which also matters because
`Core\Plugin\Installer::update()` reads `statIndex(0)` to decide which directory to delete
before reinstalling.

## 9. README URL

    https://github.com/youssefboutaleb/kanboard-plugin-drawio/blob/main/README.md

## 10. Suggested `plugins.json` entry

`plugins.json` is ordered case-insensitively by key (verified against the live file: 158
entries, all in case-insensitive order). `drawio` sorts after `discordnotifier` and before
`duedate`, so the entry is inserted **between `DiscordNotifier` and `duedate`**. Keys
within the object are alphabetical, as every existing entry has them; all fifteen fields
are required.

```json
    "Drawio": {
        "author": "Youssef BOUTALEB",
        "compatible_version": ">=1.2.20",
        "description": "Draw.io diagrams inside Kanboard Markdown. A fenced block tagged \"diagram\" is displayed as the diagram it describes, with a View full size action for every reader and an Edit action wherever Kanboard offers one for the surrounding text, and the Markdown toolbar gains an Insert diagram button that opens the draw.io editor. The Markdown field is the only storage: no database table, no document system, no separate permission model. The payload format is compatible with Wiki.js, so existing diagrams move between the two unchanged.",
        "download": "https://github.com/youssefboutaleb/kanboard-plugin-drawio/releases/download/v0.2.0/Drawio-0.2.0.zip",
        "has_hooks": true,
        "has_overrides": false,
        "has_schema": false,
        "homepage": "https://github.com/youssefboutaleb/kanboard-plugin-drawio",
        "is_type": "plugin",
        "last_updated": "2026-08-19",
        "license": "MIT",
        "readme": "https://github.com/youssefboutaleb/kanboard-plugin-drawio/blob/main/README.md",
        "remote_install": true,
        "title": "Draw.io Diagrams",
        "version": "0.2.0"
    },
```

Field notes:

| Field | Value | Why |
|---|---|---|
| `author` | `Youssef BOUTALEB` | Matches `Plugin::getPluginAuthor()`. |
| `compatible_version` | `>=1.2.20` | Matches `Plugin::getCompatibleVersion()`; see §6. |
| `has_hooks` | `true` | Attaches to `template:layout:head`, `template:layout:css`, `template:layout:js`. |
| `has_overrides` | `false` | Ships one template of its own (`Template/layout/config.php`); no core template is replaced and `setTemplateOverride()` is never called. |
| `has_schema` | `false` | No `Schema/` directory, no tables, no migrations — by design, the Markdown is the only storage. |
| `is_type` | `plugin` | Not an `action`, `theme` or `connector`. |
| `remote_install` | `true` | The download is a purpose-built asset with the correct root directory (§8). Set to `false` if you ever publish only a source archive. |
| `license` | `MIT` | SPDX identifier, and the most common value in the directory. |
| `homepage` / `readme` | repository URLs | Must match `Plugin::getPluginHomepage()`. |
| `title` | `Draw.io Diagrams` | Human-readable; the **key** stays `Drawio`. |
| `last_updated` | release date | Must match the day the release is published. Update on every release. |

## 11. Exact changes required in the `kanboard/website` repository

Single file: **`plugins.json`**.

1. Fork <https://github.com/kanboard/website>.
2. Branch: `git checkout -b add-drawio`
3. Open `plugins.json` and insert the §10 object between the `"DiscordNotifier"` and
   `"duedate"` keys, preserving the file's existing indentation.
4. Confirm the comma placement. The file is strict JSON — the entry needs a trailing comma
   because it is not last, and the final entry in the file must have none.
5. Validate before committing:
   ```bash
   python3 -m json.tool plugins.json > /dev/null && echo "valid JSON"
   ```
6. Commit, push, and open a PR against `master`.

No other file changes are needed; the directory page and the in-app installer are
generated from `plugins.json`.

## 12. Pull request title

    Add Drawio plugin

## 13. Pull request description

```markdown
Adds **Drawio** to the plugin directory.

Draw.io diagrams inside Kanboard Markdown. A fenced ```diagram block renders as the
diagram it describes, with an Edit action, and the Markdown toolbar gains an Insert
diagram button that opens the draw.io editor.

- **Repository:** https://github.com/youssefboutaleb/kanboard-plugin-drawio
- **Release:** https://github.com/youssefboutaleb/kanboard-plugin-drawio/releases/tag/v0.2.0
- **License:** MIT
- **Compatible with:** Kanboard >= 1.2.20 (requires PHP >= 8.1)

Notes for reviewers:

- The download URL is a purpose-built release asset, not a GitHub source archive, so it
  extracts to `Drawio/` as the installer expects. `remote_install` is `true`.
- No database schema, no migrations, no routes, no controllers, and no Kanboard core files
  are modified. The Markdown field is the only storage, so disabling the plugin leaves
  existing content untouched.
- The plugin adds exactly one CSP directive, `frame-src 'self' https://embed.diagrams.net`,
  merged into the existing rules rather than replacing them. `DRAWIO_EMBED_URL` points it
  at a self-hosted draw.io instead.
- Diagrams render as `<img src="data:image/svg+xml;base64,…">`, never as inline SVG, so a
  hostile payload cannot execute script.
- No third-party code is bundled. CI runs the test suite and `php -l`.
- Entry inserted case-insensitively between `DiscordNotifier` and `duedate`;
  `plugins.json` validates as strict JSON.
```

## 14. Maintainer considerations

**Release history worth knowing**

`v0.1.0` shipped a README stating that public (token) views render no diagrams; Milestone 4
Task 20 disproved that against a live instance. `v0.1.1` corrected it — documentation only,
identical code — so that the first archive anyone installs from the directory is accurate.
Neither is withdrawn; nothing about them is unsafe.

A corrected asset was deliberately **not** re-uploaded onto the existing `v0.1.0` tag:
Kanboard's installer keys updates off the version number, so the same version with different
contents would be invisible to it.

**Steps for the maintainer**

1. Review the working tree: `Plugin.php` (`0.2.0`), `CHANGELOG.md`, `package.json` and
   §4/§7/§8/§10/§13 of this dossier moved together, and `test/release-metadata.test.js`
   fails the suite if any of them drifts apart.
2. `bash scripts/agent-verify.sh` — expect **108 tests**, six steps green.
3. Commit, then `git tag v0.2.0 && git push origin main --tags`. The CI release job builds
   and attaches `Drawio-0.2.0.zip`; `dist/` is gitignored and is not what gets published.
4. Confirm the §8 URL returns HTTP 200 once that job finishes, and that the archive's root
   entry is `Drawio/`.
5. Work through `docs/MANUAL_TESTING.md` — the verdict table in §4 is still blank, and
   M-10 to M-12 (quoted diagrams, themes, the viewer) have never been exercised in a real
   browser.
6. Open the `plugins.json` pull request using §11–13.

**Before submitting**

- [x] Complete Milestone 3 in `CLAUDE.md` — the manual browser pass over the draw.io
      `init`/`save`/`export` round trip, which the automated suite stubs. *(Reported
      complete by the maintainer; the verdict table in `docs/MANUAL_TESTING.md` §4 is still
      blank and should be filled in for the record.)*
- [x] Publish a release and confirm the asset URL returns HTTP 200. *(Verified for
      `v0.1.0`: published 2026-08-18, `Drawio-0.1.0.zip`, 20597 bytes, root entry
      `Drawio/`, 15 files. Repeat for `v0.1.1` once tagged — step 4 above.)*
- [x] Download that asset and install it into a clean Kanboard >= 1.2.20 through the admin
      UI's remote installer, which is the path `remote_install: true` promises. *(Milestone 3
      Task 19 installed the packaged artifact into a clean `kanboard/kanboard:v1.2.53`.)*
- [x] Confirm the plugin appears under **Settings → Extensions** (route `/extensions`, not
      `/settings/plugins`), in the compatible table rather than the incompatible one.
      *(Verified showing `0.1.0`; re-checking on `0.2.0` is a version string, not new
      behaviour.)*
- [x] Confirm a diagram renders and can be edited on that clean install, and that the
      `frame-src` directive is present in the response headers.
- [ ] Tag `v0.2.0`, run the manual matrix, then open the `plugins.json` pull request.

The fifteen fields in §10 are re-diffed against `Plugin.php`, `CHANGELOG.md` and
`package.json` on every run of the test suite by `test/release-metadata.test.js`, so a
version bump that forgets this file fails the build rather than shipping.

**There is no code review.** The Kanboard documentation states plainly that there is no
approval process for the directory — a merged PR publishes the entry as-is. Correctness is
entirely the submitter's responsibility, which is why §14 is a checklist rather than a
formality.

**Ongoing obligations**

- Every release needs a `plugins.json` PR updating `version`, `download` and
  `last_updated`. Kanboard's installer compares the directory's `version` against the
  installed one to offer updates, so a stale entry means users are never prompted.
- Keep `compatible_version` truthful. Raise it only when a genuinely newer core API is
  adopted; lower it only after testing against the older release.
- Because `remote_install` is `true`, the download URL must stay reachable at that exact
  address forever. Deleting or renaming a release asset breaks installs for everyone who
  has not yet upgraded.
- Re-run `php test/parsedown-parity.php /path/to/kanboard` after each Kanboard upgrade. If
  the fixtures change, block identification has changed with them and the plugin needs a
  fix before the next release.

**Naming**

`title` is `"Draw.io Diagrams"` (human-readable) while the key and directory name are
`Drawio`. Do not change the key after listing — Kanboard matches installed plugins to
directory entries by that identifier, and renaming it orphans every existing install from
update notifications.
