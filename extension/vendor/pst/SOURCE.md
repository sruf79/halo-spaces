# pst-extractor.js

Third-party code, bundled unchanged with esbuild into one file so that
halo.spaces can read Outlook data files (PST).

- Main library: [pst-extractor](https://www.npmjs.com/package/pst-extractor) 1.12.0 (MIT)
- Its dependencies: long 5.3.2 (Apache-2.0), iconv-lite 0.7.3 (MIT), uuid-parse 1.1.0 (MIT)
- Browser replacements for Node.js modules: buffer 6.0.3 (MIT, with base64-js, ieee754),
  pako 2.1.0 (MIT and Zlib, replaces `zlib`), string_decoder 1.3.0 (MIT)
- File access (`fs`) is provided at run time by halo.spaces (reads the file in pieces
  through Thunderbird), see `PstFs` in `api/implementation.js`

Licenses: `LICENSES.txt` in this folder.

Rebuild (needs Node.js, exact versions are pinned): `tools/pst-bundle/build.sh`
in the source repository (https://github.com/sruf79/halo-spaces). The small shim
files used for the build are in `tools/pst-bundle/`.
