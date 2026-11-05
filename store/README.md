# Store listing (addons.thunderbird.net)

> **On hold (2026-11-04):** ATN rejected 3.15.0 – it currently accepts no new
> add-ons that use their own Experiment API (only unmodified copies of the
> published drafts in `thunderbird/webext-experiments`), and halo.spaces cannot
> work without `mailCards`. Distribution stays on GitHub (`update_url` →
> `updates.json`). `publish.sh` no longer uploads to ATN unless called with
> `ATN=1`; only do that once ATN accepts Experiment add-ons again.
> The reviewer's follow-up (same day): the pause will most likely become
> permanent, ATN wants to spend its time on new official APIs instead. Treat
> GitHub as the only distribution channel.

Everything needed for the listing on addons.thunderbird.net (ATN). Texts are
ready to paste; the package is `dist/halo-spaces-<version>-atn.xpi`
(built by `./build.sh`, identical to the GitHub package except that it has no
`update_url` – ATN delivers updates itself).

| Field | Value |
|---|---|
| Name | halo.spaces |
| URL slug | `halo-spaces` |
| Summary | see `listing-en.md` / `listing-de.md` (first block, ≤ 250 characters) |
| Description | see `listing-en.md` / `listing-de.md` |
| Categories | Appearance · Calendar and Date/Time · Message and News Reading |
| Tags | design, macos, layout, calendar, contacts, today pane, dark mode |
| Support e-mail | (as in the add-on's feedback window) |
| Support site | https://github.com/sruf79/halo-spaces/issues |
| Homepage | https://github.com/sruf79/halo-spaces |
| Contributions URL | https://buymeacoffee.com/diversion (Developer Hub → Edit Product Page → Support; shows a “Support this developer” button) |
| License | Mozilla Public License 2.0 |
| Privacy policy | `privacy-en.md` (required: the add-on loads sender logos) |
| Notes to reviewer | `reviewer-notes.md` |
| Screenshots | `shot-mail.png`, `shot-calendar.png`, `shot-addressbook.png`, `shot-quick-event.png` (1280 px wide, made-up test data; `python3 tests/store_shots.py` recreates them) |
| Icon | `../extension/about/icon.svg` (export as 128×128 PNG: `store/icon-128.png`) |

Later versions: `ATN=1 ./publish.sh <version> notes.md` also uploads the store
package when `~/.config/halo-spaces/atn.env` exists (see `atn_upload.py`).

Notes from the first submission (2026-10-17):
- ATN stores no 4-byte characters: emoji in description or captions make saving fail silently.
- Experiment add-ons need `strict_max_version` (store/max-version) – raise it with every new Thunderbird release after testing.
- The upload sometimes fails with "status: 502" – just upload again.
- Before submitting again: `privacy-en.md` names only GitHub as update source
  (since 2026-11-05, while distribution is GitHub-only). The store package has
  no `update_url` – add that ATN installs get updates from
  addons.thunderbird.net (item 3, and the last sentence about who sees the IP
  address), and the README privacy paragraph likewise.
- Source code upload is needed (theme.css is generated): `git archive` of the release plus the current build.sh/store files; reviewer notes contain the build steps. `publish.sh` builds it as `dist/halo-spaces-<version>-source.zip`; the ATN upload API only takes the package, so upload the zip in the Developer Hub (version page, "Source code").
