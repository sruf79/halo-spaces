# Security Policy

## Supported versions

Only the latest release of halo.spaces gets fixes. Thunderbird installs
updates automatically (every 24 hours, or right away via
**Help → halo.spaces → Check for Updates**), so please update before
reporting.

| Version | Supported |
|---|---|
| latest release | yes |
| older releases | no |

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

Report them privately on GitHub instead: open the
[Security tab](https://github.com/sruf79/halo-spaces/security) of this
repository and choose **Report a vulnerability**.

Please include:

- the halo.spaces and Thunderbird versions and your operating system,
- what happens and how to reproduce it,
- what an attacker could do with it, if you know.

You'll get an answer as soon as possible. Once a fix is released, the report
is published as a security advisory, with credit to you if you like.

## What halo.spaces does and doesn't do

- It's a Thunderbird add-on, distributed only as an `.xpi` from this
  repository's [Releases](https://github.com/sruf79/halo-spaces/releases).
  Updates come from `updates.json` in this repository, checked by Thunderbird
  against the package's SHA-256 hash.
- It has no server, no account, no analytics and no telemetry. What it loads
  from the internet is listed in the [privacy policy](store/privacy-en.md).
- The shell and Python scripts in this repository (`build.sh`, `release.sh`,
  `tests/…`) are developer tools for building and testing. Users never need
  to run them.
