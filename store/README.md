# Store listing (addons.thunderbird.net)

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

Later versions: `./publish.sh <version> notes.md` also uploads the store
package when `~/.config/halo-spaces/atn.env` exists (see `atn_upload.py`).

Notes from the first submission (2026-10-17):
- ATN stores no 4-byte characters: emoji in description or captions make saving fail silently.
- Experiment add-ons need `strict_max_version` (store/max-version) – raise it with every new Thunderbird release after testing.
- The upload sometimes fails with "status: 502" – just upload again.
- Source code upload is needed (theme.css is generated): `git archive` of the release plus the current build.sh/store files; reviewer notes contain the build steps. `publish.sh` builds it as `dist/halo-spaces-<version>-source.zip`; the ATN upload API only takes the package, so upload the zip in the Developer Hub (version page, "Source code").
