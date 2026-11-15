#!/usr/bin/env python3
# Tagesbericht (Markdown) → HTML-Seite für das Werkzeug Artifact (Skill /bericht, Maintainer 15.11.2026:
# „ich möchte stattdessen immer den bericht hier am laptop in dieser session öffnen können“).
# Ohne Zusatzpakete. Erhalten bleiben Überschriften, Absätze (Zeilenumbrüche bleiben Umbrüche), Listen
# (auch verschachtelt und nummeriert), Tabellen, <details>/<summary>, `Code`, **fett**, Links.
# Kein Doctype/html/head/body: das Artifact-Werkzeug legt das Gerüst selbst darum.
#   python3 tests/bericht-html.py <bericht.md> [<ausgabe.html>]   ohne Ausgabe: nach stdout
import html
import re
import sys

STIL = """<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Lesespalte, Kurzfassung als ruhige Fläche, Technik in aufklappbaren Blöcken */
:root { --bg: #f7f8fa; --fg: #1d2330; --leise: #5c6474; --linie: #d9dde5; --flaeche: #ffffff;
  --akzent: #2f6fdb; --code: #eef1f6; --schrift: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #16181d; --fg: #e6e8ee; --leise: #a0a7b5;
  --linie: #2e333d; --flaeche: #1e2128; --akzent: #7aa7ff; --code: #262a33; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #16181d; --fg: #e6e8ee; --leise: #a0a7b5; --linie: #2e333d; --flaeche: #1e2128;
  --akzent: #7aa7ff; --code: #262a33; color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--schrift);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 24px 48px; }
main { max-width: 46rem; margin: 0 auto; overflow-wrap: anywhere; }
h1 { font-size: 1.6rem; margin: 0 0 1rem; text-wrap: balance; }
h2 { font-size: 1.15rem; margin: 1.8rem 0 .6rem; color: var(--leise); text-transform: uppercase; letter-spacing: .04em; }
h3, h4, h5, h6 { font-size: 1rem; margin: 1.2rem 0 .4rem; text-wrap: balance; }
h2#kurzfassung + ul { background: var(--flaeche); border: 1px solid var(--linie); border-radius: 10px;
  padding: .8rem 1rem .8rem 2rem; margin: 0; }
p, ul, ol { margin: .5rem 0; }
li { margin: .2rem 0; }
a { color: var(--akzent); }
code { font: .88em var(--mono); background: var(--code); padding: .05em .3em; border-radius: 4px; }
details { border-top: 1px solid var(--linie); padding: .5rem 0; }
details:last-of-type { border-bottom: 1px solid var(--linie); }
summary { cursor: pointer; font-weight: 600; padding: .25rem 0; }
summary:focus-visible { outline: 2px solid var(--akzent); outline-offset: 2px; border-radius: 4px; }
details[open] > summary { color: var(--akzent); }
.tabelle { overflow-x: auto; margin: .6rem 0; }
table { border-collapse: collapse; font-size: .9rem; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--linie); padding: .3rem .5rem; text-align: left; vertical-align: top; }
th { background: var(--flaeche); }
</style>"""


def inline(t):
    t = html.escape(t, quote=False)
    teile = re.split(r"(`[^`]+`)", t)
    for i, s in enumerate(teile):
        if s.startswith("`") and s.endswith("`") and len(s) > 1:
            teile[i] = "<code>" + s[1:-1] + "</code>"
        else:
            s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
            s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
            teile[i] = s
    return "".join(teile)


def anker(t):
    return re.sub(r"[^a-z0-9äöüß]+", "-", t.lower()).strip("-")


def umwandeln(md):
    aus, absatz, listen = [], [], []   # listen: Stapel (Einrückung, Tag)

    def absatz_ende():
        if absatz:
            aus.append("<p>" + "<br>\n".join(inline(z) for z in absatz) + "</p>")
            absatz.clear()

    def listen_ende(bis=-1):
        while listen and listen[-1][0] > bis:
            aus.append("</li></%s>" % listen.pop()[1])

    zeilen = md.split("\n")
    i = 0
    while i < len(zeilen):
        z = zeilen[i].rstrip()
        s = z.strip()
        m_det = re.fullmatch(r"<details>(?:<summary>(.*?)</summary>)?", s)
        if m_det:
            absatz_ende(); listen_ende()
            aus.append("<details>" + ("<summary>%s</summary>" % inline(m_det.group(1)) if m_det.group(1) is not None else ""))
        elif s == "</details>":
            absatz_ende(); listen_ende(); aus.append("</details>")
        elif not s:
            absatz_ende()
            # Leerzeile beendet eine Liste nur, wenn danach kein Listenpunkt folgt
            n = next((x for x in zeilen[i + 1:] if x.strip()), "")
            if not re.match(r"\s*(?:[-*]|\d+\.)\s+", n):
                listen_ende()
        elif re.match(r"#{1,6} ", s):
            absatz_ende(); listen_ende()
            n = len(s) - len(s.lstrip("#")); t = s[n:].strip()
            aus.append('<h%d id="%s">%s</h%d>' % (n, anker(t), inline(t), n))
        elif s.startswith("|") and i + 1 < len(zeilen) and re.fullmatch(r"\s*\|?[\s:|-]+\|?\s*", zeilen[i + 1]) and "-" in zeilen[i + 1]:
            absatz_ende(); listen_ende()
            zellen = lambda x: [c.strip() for c in x.strip().strip("|").split("|")]
            kopf = zellen(s); aus.append('<div class="tabelle"><table><thead><tr>' + "".join("<th>%s</th>" % inline(c) for c in kopf) + "</tr></thead><tbody>")
            i += 2
            while i < len(zeilen) and zeilen[i].strip().startswith("|"):
                aus.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in zellen(zeilen[i])) + "</tr>")
                i += 1
            aus.append("</tbody></table></div>")
            continue
        else:
            m = re.match(r"(\s*)([-*]|\d+\.)\s+(.*)", z)
            if m:
                absatz_ende()
                tiefe, tag = len(m.group(1).expandtabs(4)), ("ol" if m.group(2)[0].isdigit() else "ul")
                if listen and tiefe > listen[-1][0]:
                    listen.append((tiefe, tag)); aus.append("<%s><li>" % tag)
                else:
                    listen_ende(tiefe)
                    if listen and listen[-1][0] == tiefe and listen[-1][1] == tag:
                        aus.append("</li><li>")
                    else:
                        if listen and listen[-1][0] == tiefe:
                            aus.append("</li></%s>" % listen.pop()[1])
                        listen.append((tiefe, tag))
                        start = int(m.group(2)[:-1]) if tag == "ol" else 1
                        aus.append(("<ol start=\"%d\"><li>" % start) if tag == "ol" and start != 1 else "<%s><li>" % tag)
                aus.append(inline(m.group(3)))
            elif listen and z.startswith(" "):
                aus.append("<br>" + inline(s))       # Fortsetzungszeile eines Listenpunkts
            else:
                listen_ende(); absatz.append(s)
        i += 1
    absatz_ende(); listen_ende()
    return "\n".join(aus)


def seite(md):
    m = re.search(r"^# (.+)$", md, re.M)
    d = re.search(r"\d{1,2}\.\d{1,2}\.\d{4}", m.group(1)) if m else None
    titel = "Bericht " + d.group(0) if d else "Tagesbericht"
    return "<title>%s</title>\n%s\n<main>\n%s\n</main>\n" % (html.escape(titel), STIL, umwandeln(md))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Aufruf: bericht-html.py <bericht.md> [<ausgabe.html>]")
    text = seite(open(sys.argv[1], encoding="utf-8").read())
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(text)
    else:
        sys.stdout.write(text)
