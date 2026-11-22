#!/usr/bin/env python3
"""Ersetzt Thunderbirds eigene Symbole (--icon-*-Variablen aus icons.css) durch
eigene Zeichnungen im Stil von macOS – überall: App-Menü, Menüs, Buttons, Dialoge.

Die SVGs nutzen context-stroke/context-fill, damit sie wie die Originale die
Farbe vom Element übernehmen (Hell/Dunkel, Hover, weiß auf Akzentfarbe).
Das funktioniert nur für chrome://- und resource://-Adressen, deshalb liegen
die Dateien in der Erweiterung; sie meldet resource://mailcards/ an und lädt
icon-vars.css als Benutzer-Stylesheet in alle Fenster.

Aufruf: python3 make_iconvars.py   → schreibt ../extension/icons/*.svg und ../extension/icon-vars.css
        python3 make_iconvars.py --extra → schreibt nur die Zusatzsymbole (EXTRA)
"""

import math
import os
import re
import sys

from make_icons import ICONS, PFEILE, STROKE

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "extension")
TB_ICONS_CSS = os.environ.get("TB_ICONS_CSS")  # optional: icons.css aus den Thunderbird-Quellen

F = ' fill="context-fill"'                     # Fläche wie bei Thunderbird (Deckkraft vom Element)
D = ' fill="context-stroke" fill-opacity="1" stroke="none"'      # massiver Punkt


def star(cx=12, cy=12.4, ro=8.6, ri=3.9):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = ro if i % 2 == 0 else ri
        pts.append(f"{cx + r * math.cos(a):.2f} {cy - r * math.sin(a):.2f}")
    return "M" + " L".join(pts) + "Z"


def body(name):
    return ICONS[name][1].replace('fill="#000"', 'fill="context-stroke" fill-opacity="1"')


ENVELOPE = '<rect x="3" y="5.5" width="18" height="13" rx="2.6"' + F + '/><path d="M3.9 7.4 12 13.2l8.1-5.8"/>'
CAL_FRAME = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.6"' + F + '/><path d="M3.5 9.6h17M8 3.2v3.4M16 3.2v3.4"/>'
CIRCLE = '<circle cx="12" cy="12" r="8.5"' + F + '/>'
PERSON = '<circle cx="12" cy="8.3" r="3.6"' + F + '/><path d="M5 19.8c.9-3.7 3.6-5.6 7-5.6s6.1 1.9 7 5.6"/>'
FOLDER = '<path d="M3 7.8A2.3 2.3 0 0 1 5.3 5.5h3.9l2.1 2.1h7.4A2.3 2.3 0 0 1 21 9.9v7.8a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.7z"' + F + '/>'
TRAY = '<path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>'
BUBBLE = '<path d="M12 4.5c4.7 0 8.5 3 8.5 6.8s-3.8 6.8-8.5 6.8c-.9 0-1.8-.1-2.6-.3L5.3 19.6l1-3.4C4.6 14.9 3.5 13.2 3.5 11.3c0-3.8 3.8-6.8 8.5-6.8z"' + F + '/>'
PLUS_BADGE = '<path d="M18.5 14v6M15.5 17h6"/>'
EYE = '<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"' + F + '/><circle cx="12" cy="12" r="2.8"/>'

GLYPHS = {
    # Pfeile/Chevrons (wie chevron.* in macOS)
    "nav-down": '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    "nav-up": '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
    "nav-left": '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
    "nav-right": '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
    "nav-back": '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
    "nav-forward": '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
    "nav-down-unread": '<path d="m4.5 9.5 5.5 5.5 5.5-5.5"/><circle cx="19.5" cy="7" r="2.2"' + D + '/>',
    "nav-up-unread": '<path d="m4.5 14.5 5.5-5.5 5.5 5.5"/><circle cx="19.5" cy="17" r="2.2"' + D + '/>',
    "check": '<path d="m5.5 12.6 4.1 4.1 8.9-9.4"/>',
    "checkbox": '<rect x="4" y="4" width="16" height="16" rx="3.6"' + F + '/><path d="m8 12.3 2.8 2.8 5.2-5.6"/>',
    "add": '<path d="M12 5v14M5 12h14"/>',
    "circle-add": CIRCLE + '<path d="M12 8v8M8 12h8"/>',
    "subtract-circle": CIRCLE + '<path d="M8 12h8"/>',
    "remove": '<path d="M5 12h14"/>',
    "close": '<path d="m6.8 6.8 10.4 10.4M17.2 6.8 6.8 17.2"/>',
    "clear": CIRCLE + '<path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
    # Lupe fein und ohne getönte Fläche (Farbe grau setzt das Suchfeld)
    "search": '<circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.1 15.1 4.9 4.9"/>',
    "more": '<circle cx="6" cy="12" r="1.5"' + D + '/><circle cx="12" cy="12" r="1.5"' + D + '/><circle cx="18" cy="12" r="1.5"' + D + '/>',
    "kebab": CIRCLE + '<circle cx="8.3" cy="12" r="1.1"' + D + '/><circle cx="12" cy="12" r="1.1"' + D + '/><circle cx="15.7" cy="12" r="1.1"' + D + '/>',
    "overflow": '<path d="m6.5 7 5 5-5 5M12.5 7l5 5-5 5"/>',
    "app-menu": '<path d="M5 7h14M5 12h14M5 17h14"/>',
    # Post
    "mail": ENVELOPE,
    "new-mail": body("compose"),
    # Konten (verschlüsselt) wie in der Ordnerliste: Ablage statt Umschlag mit Schloss
    "mail-secure": body("server").replace('<path d="M3.5 13.4 6', '<path' + F + ' d="M3.5 13.4 6', 1),
    "inbox": body("inbox"),
    "outbox": body("outbox"),
    "sent": body("sent"),
    "draft": body("drafts"),
    "file-draft": body("drafts"),
    "template": body("templates"),
    "archive": body("archive"),
    "trash": body("trash"),
    "spam": body("junk"),
    "folder": FOLDER,
    "folder-filter": FOLDER + '<path d="M8.5 12.6h7M10 15.6h4"/>',
    "folder-save": FOLDER + '<path d="M12 10.8v5.4M9.6 14l2.4 2.4 2.4-2.4"/>',
    # freier Platz in „Symbolleiste anpassen“: Pfeile nach außen, dazwischen drei Punkte
    "flexible-space": '<path d="M6.3 7.8 2.5 12l3.8 4.2M17.7 7.8l3.8 4.2-3.8 4.2"/><circle cx="9" cy="12" r=".95"' + D + '/><circle cx="12" cy="12" r=".95"' + D + '/><circle cx="15" cy="12" r=".95"' + D + '/>',
    # Ordner komprimieren (Symbolleiste): Ordner, darin zwei flache Pfeile zur Mitte (von oben und unten),
    # mit Luft dazwischen, damit es nicht wie das Kreuz von Junk wirkt
    "folder-compact": FOLDER + '<path d="m9.4 10.6 2.6 2 2.6-2M9.4 17.6l2.6-2 2.6 2"/>',
    "rss": body("rss"),
    "newsletter": '<rect x="3.5" y="5" width="17" height="14.5" rx="2.4"' + F + '/><path d="M7 9h10M7 12.3h10M7 15.6h6"/>',
    "reply": body("reply"),
    "reply-all": body("reply-all"),
    "reply-list": body("reply-all"),
    "forward": body("forward"),
    "redirect": f'<path d="{PFEILE["redirect"]}"/>',
    "replies": body("reply"),
    "unread": '<circle cx="12" cy="12" r="4.6"' + D + '/>',
    "dot": '<circle cx="12" cy="12" r="3.4"' + D + '/>',
    "star": f'<path d="{star()}"' + F + '/>',
    "tag": '<path d="M3.8 12.6V5.4a1.6 1.6 0 0 1 1.6-1.6h7.2l7.9 7.9a1.6 1.6 0 0 1 0 2.3l-6.5 6.5a1.6 1.6 0 0 1-2.3 0z"' + F + '/><circle cx="8.3" cy="8.3" r="1.3"' + D + '/>',
    "attachment": '<path d="M19 11.4 12.2 18.2a4.4 4.4 0 0 1-6.2-6.2l7.5-7.5a2.9 2.9 0 0 1 4.1 4.1l-7.4 7.4a1.45 1.45 0 0 1-2.05-2.05l6.8-6.8"/>',
    "thread": '<path d="M5 6.5h14M9.5 12h9.5M9.5 17.5h9.5M5.5 7v8a2.5 2.5 0 0 0 2.5 2.5"/>',
    "conversation": '<path d="M10 4.5c3.9 0 7 2.4 7 5.5s-3.1 5.5-7 5.5c-.7 0-1.4-.1-2-.2L5 17l.8-2.8C4.3 13.2 3 11.7 3 10c0-3.1 3.1-5.5 7-5.5z"' + F + '/><path d="M19.2 9.6c1.1.9 1.8 2.1 1.8 3.4 0 1.5-.9 2.8-2.2 3.7l.6 2.3-2.6-1.2c-.6.1-1.1.2-1.8.2-1.9 0-3.6-.6-4.8-1.6"/>',
    "print": '<path d="M7 9V4.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"' + F + '/><path d="M7 14h10v5.5H7z"/>',
    "priority": '<path d="M12 5v9"/><circle cx="12" cy="18.6" r="1.25"' + D + '/>',
    "priority-low": '<path d="M12 5v12M7.5 12.5 12 17l4.5-4.5"/>',
    "quote": '<path d="M5.5 8v10M10 8h9M10 12h9M10 16h6"/>',
    # Bereiche
    "address-book": body("addressbook"),
    "new-address-book": '<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"' + F + '/><path d="M12 8.5v7M8.5 12h7M4.5 7.5H3M4.5 12H3M4.5 16.5H3"/>',
    "contact": PERSON,
    "user": PERSON,
    "new-contact": '<circle cx="10" cy="8.3" r="3.6"' + F + '/><path d="M3.5 19.8c.9-3.7 3.4-5.6 6.5-5.6 1.3 0 2.5.3 3.5 1"/>' + PLUS_BADGE,
    "user-list": '<circle cx="9.5" cy="8.6" r="3.3"' + F + '/><path d="M3.5 19.5c.8-3.3 3-5 6-5s5.2 1.7 6 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6.1M17.6 14.8c1.5.8 2.4 2.4 2.9 4.7"/>',
    "new-user-list": '<circle cx="9.5" cy="8.6" r="3.3"' + F + '/><path d="M3.5 19.5c.8-3.3 3-5 6-5 1.4 0 2.6.4 3.6 1.1M15.5 5.6a3.2 3.2 0 0 1 0 6.1"/>' + PLUS_BADGE,
    "id": '<rect x="3" y="5.5" width="18" height="13" rx="2.4"' + F + '/><circle cx="8.5" cy="10.5" r="1.9"/><path d="M5.6 15.6c.5-1.3 1.6-2.1 2.9-2.1s2.4.8 2.9 2.1M14 10h4M14 13.5h4"/>',
    "calendar": body("calendar"),
    "calendar-today": CAL_FRAME + '<circle cx="12" cy="15" r="2"' + D + '/>',
    "nav-today": CAL_FRAME + '<circle cx="12" cy="15" r="2"' + D + '/>',
    "new-event": CAL_FRAME + '<path d="M12 12.3v5.4M9.3 15h5.4"/>',
    "calendar-empty": CAL_FRAME,
    "tasks": body("tasks").replace('<circle cx="12" cy="12" r="8.5"/>', CIRCLE),
    "new-task": CIRCLE + '<path d="M12 8v8M8 12h8"/>',
    "chat": BUBBLE,
    "new-chat": '<path d="M11 4.5c4.1 0 7.5 2.7 7.5 6 0 .5-.1 1-.2 1.5M11 16.5c-.8 0-1.6-.1-2.3-.3L4.9 18.2l.9-3C4.3 14.1 3.5 12.4 3.5 10.5c0-3.3 3.4-6 7.5-6"' + F + '/>' + PLUS_BADGE,
    # App-Menü & Werkzeuge
    "settings": body("settings"),
    "account-settings": '<circle cx="12" cy="12" r="8.5"' + F + '/><circle cx="12" cy="10" r="3"/><path d="M6.4 17.9c1.3-1.9 3.2-2.9 5.6-2.9s4.3 1 5.6 2.9"/>',
    "extension": '<path d="M9.5 6V5a2 2 0 0 1 4 0v1h4A1.5 1.5 0 0 1 19 7.5V11h-1a2 2 0 0 0 0 4h1v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1a2 2 0 0 0-4 0v1H6.5A1.5 1.5 0 0 1 5 18.5V15h1a2 2 0 0 0 0-4H5V7.5A1.5 1.5 0 0 1 6.5 6z"' + F + '/>',
    "tools": '<path d="M14.6 4a4.6 4.6 0 0 0-3.3 6.1l-6.6 6.6a1.9 1.9 0 0 0 2.7 2.7l6.6-6.6A4.6 4.6 0 0 0 20.1 9.4l-2.8 1-2.3-.6-.6-2.3z"' + F + '/>',
    "question": CIRCLE + '<path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.4"/><circle cx="12" cy="16.9" r="1.05"' + D + '/>',
    "info": CIRCLE + '<path d="M12 11v5.3"/><circle cx="12" cy="7.9" r="1.05"' + D + '/>',
    "warning": '<path d="M10.6 4.7a1.6 1.6 0 0 1 2.8 0l7.3 12.9a1.6 1.6 0 0 1-1.4 2.4H4.7a1.6 1.6 0 0 1-1.4-2.4z"' + F + '/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.7" r="1.05"' + D + '/>',
    "error-circle": CIRCLE + '<path d="M12 7.6v5.2"/><circle cx="12" cy="16" r="1.05"' + D + '/>',
    "success": CIRCLE + '<path d="m8.2 12.2 2.6 2.6 5-5.4"/>',
    "quit": '<path d="M12 3.8v7.4"/><path d="M7.3 6.6a7.3 7.3 0 1 0 9.4 0"/>',
    "layout": '<rect x="3" y="5" width="18" height="14" rx="2.6"' + F + '/><path d="M9.5 5v14M9.5 12H21"/>',
    "display-options": '<path d="M4 7h8.5M17.5 7H20M4 12h2.5M11.5 12H20M4 17h10.5M19.5 17h.5"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
    "density-compact": '<path d="M5 6.5h14M5 10.2h14M5 13.9h14M5 17.6h14"/>',
    "density-default": '<path d="M5 7h14M5 12h14M5 17h14"/>',
    "density-relaxed": '<rect x="4" y="5" width="16" height="6" rx="1.8"/><rect x="4" y="13" width="16" height="6" rx="1.8"/>',
    "font": '<path d="M3.5 19 8.6 5.5h.8L14.5 19M5.4 14.5h7.2M15.6 19l2.6-6.6h.6L21.4 19M16.4 17h4.2"/>',
    "import": '<path d="M12 4v10.2M8 10.5l4 4 4-4"/>' + TRAY,
    "download": '<path d="M12 4v10.2M8 10.5l4 4 4-4"/>' + TRAY,
    "export": '<path d="M12 14.5V4.3M8 8l4-4 4 4"/>' + TRAY,
    "upload": '<path d="M12 14.5V4.3M8 8l4-4 4 4"/>' + TRAY,
    "cloud-download": '<path d="M7.2 18.5a4 4 0 0 1-.7-7.9 5.6 5.6 0 0 1 10.8-1 4.5 4.5 0 0 1-.5 8.9z"' + F + '/><path d="M12 11v5M9.9 14 12 16.1 14.1 14"/>',
    "sync": '<path d="M19.5 12a7.5 7.5 0 0 1-13.1 5M4.5 12a7.5 7.5 0 0 1 13.1-5"/><path d="M18 3.6v3.6h-3.6M6 20.4v-3.6h3.6"/>',
    "restore": '<path d="M8.8 6.3 4.8 10.3l4 4"/><path d="M5.2 10.3h8.3a5 5 0 0 1 0 10H11"/>',
    "pencil": '<path d="M15.6 4.9a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L8.6 18.9 4 20l1.1-4.6z"' + F + '/><path d="m14 6.5 3.5 3.5"/>',
    "key": '<circle cx="8" cy="12" r="4.2"' + F + '/><path d="M12.2 12h8.3M17.6 12v3.2M20.3 12v2.4"/>',
    "lock": '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"' + F + '/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    "pin": '<path d="M9 4h6l-1 5.2 3 2.8v1.6H7V12l3-2.8z"' + F + '/><path d="M12 13.6V20"/>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2.2"' + F + '/><path d="M16 8V6.2A2.2 2.2 0 0 0 13.8 4H6.2A2.2 2.2 0 0 0 4 6.2v7.6A2.2 2.2 0 0 0 6.2 16H8"/>',
    "paste": '<rect x="5.5" y="5" width="13" height="15.5" rx="2.2"' + F + '/><path d="M9.3 5V4.3a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1V5a1 1 0 0 1-1 1h-3.4a1 1 0 0 1-1-1z"/>',
    "cut": '<circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="17" r="2.6"/><path d="M8.6 15 16.8 4M15.4 15 7.2 4"/>',
    "shortcut": '<rect x="2.8" y="6.3" width="18.4" height="11.4" rx="2.4"' + F + '/><path d="M8 14.3h8"/><circle cx="7" cy="10.2" r=".9"' + D + '/><circle cx="10.3" cy="10.2" r=".9"' + D + '/><circle cx="13.7" cy="10.2" r=".9"' + D + '/><circle cx="17" cy="10.2" r=".9"' + D + '/>',
    "file": '<path d="M7.6 3.5h6.1L18.5 8.3v10.6a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 18.9V5.1a1.6 1.6 0 0 1 1.6-1.6z"' + F + '/><path d="M13.5 3.7v3.4a1.4 1.4 0 0 0 1.4 1.4h3.4"/>',
    "clock": CIRCLE + '<path d="M12 7.5V12l3 2"/>',
    "bell": '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"' + F + '/><path d="M10 20.8h4"/>',
    "notification": '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"' + F + '/><path d="M10 20.8h4"/>',
    "eye": EYE,
    "hidden": EYE + '<path d="m4.5 4.5 15 15"/>',
    "heart": '<path d="M12 19.5s-7.5-4.6-7.5-9.7A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4c0 5.1-7.5 9.7-7.5 9.7z"' + F + '/>',
    "globe": CIRCLE + '<path d="M3.5 12h17M12 3.5c-2.4 2.4-3.6 5.2-3.6 8.5s1.2 6.1 3.6 8.5M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5"/>',
    "globe-secure": CIRCLE + '<path d="M3.5 12h17M12 3.5c-2.4 2.4-3.6 5.2-3.6 8.5s1.2 6.1 3.6 8.5M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5"/>',
    "spaces-menu": '<rect x="4" y="4" width="6.6" height="6.6" rx="1.8"' + F + '/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.8"' + F + '/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.8"' + F + '/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.8"' + F + '/>',
    "column-menu": '<rect x="3.5" y="5" width="17" height="14" rx="2.4"' + F + '/><path d="M9.2 5v14M14.8 5v14"/>',
    "filter": body("filter"),
    "sort": '<path d="M7.5 5v14M4 15.5 7.5 19l3.5-3.5M16.5 19V5M13 8.5 16.5 5 20 8.5"/>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "offline": '<path d="M5 12.5a10 10 0 0 1 3-2M12 8.5c2.6 0 5 1 7 2.8M8.3 15.6A5.5 5.5 0 0 1 12 14.2M4.5 4.5l15 15"/><circle cx="12" cy="18.6" r="1.1"' + D + '/>',
    "online": '<path d="M5 11.3a10 10 0 0 1 14 0M8.3 14.6a5.5 5.5 0 0 1 7.4 0"/><circle cx="12" cy="18.2" r="1.1"' + D + '/>',
    # weitere (Verfassen, Kalender, Sortierung)
    "lock-disabled": '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"' + F + '/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.6-1.6"/>',
    "mail-lock": '<rect x="3" y="5.5" width="14.5" height="11" rx="2.4"' + F + '/><path d="M3.9 7.3 10.2 12l6.4-4.7"/><rect x="15" y="14.6" width="6.5" height="5.4" rx="1.2"/><path d="M16.5 14.6v-1.3a1.75 1.75 0 0 1 3.5 0v1.3"/>',
    "spelling": '<path d="M3.5 15 6.6 6.5h.8L10.5 15M4.6 12.3h4.8M12.5 6.5v8.5h2.6a2.2 2.2 0 0 0 0-4.4h-2.6M13 10.6h1.8a2 2 0 0 0 0-4.1h-2.3"/><path d="m14 19 2.2 2.2 4.6-4.8"/>',
    "get-mail": '<path d="M12 3.5v7.2M9 7.8l3 3 3-3"/><path d="M3.5 13.5h4.6l1.2 2.2h5.4l1.2-2.2h4.6v4.3a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z"' + F + '/>',
    "folder-rss": FOLDER + '<path d="M9 12.2a4.6 4.6 0 0 1 4.6 4.6"/><circle cx="9.6" cy="16.3" r=".9"' + D + '/>',
    "ascending": '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
    "descending": '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    "bell-disabled": '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 9.2-4.1M17.5 11v5.5l1.5 2H8"/><path d="M10 20.8h4M4.5 4.5l15 15"/>',
    "bell-ring": '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"' + F + '/><path d="M10 20.8h4M3.5 8.5a8 8 0 0 1 2.3-4M20.5 8.5a8 8 0 0 0-2.3-4"/>',
    "recurrence": '<path d="M4.5 12a7.5 7.5 0 0 1 13.1-5M19.5 12a7.5 7.5 0 0 1-13.1 5"/><path d="M18 3.6v3.6h-3.6M6 20.4v-3.6h3.6"/>',
    "recurrence-exception": '<path d="M4.5 12a7.5 7.5 0 0 1 13.1-5M19.5 12a7.5 7.5 0 0 1-13.1 5"/><path d="M18 3.6v3.6h-3.6M6 20.4v-3.6h3.6M4.5 4.5l15 15"/>',
    "date-time": CAL_FRAME + '<circle cx="16.5" cy="16.5" r="4"/><path d="M16.5 14.8v1.9l1.2.8"/>',
    "shield": '<path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.7-7 9-4.1-1.3-7-4.6-7-9V6z"' + F + '/>',
    "paint-brush": '<path d="M19.5 4.5 11 13"/><path d="M10.6 13.4a2.8 2.8 0 0 0-4 0c-1.3 1.3-.6 3.4-2.1 4.9 2.7.8 5.3.3 6.6-1 1.1-1.1 1.1-2.8-.5-3.9z"' + F + '/>',
    "collapse": '<path d="m8 4.5 4 4 4-4M8 19.5l4-4 4 4"/>',
    "compress": '<path d="m8 4.5 4 4 4-4M8 19.5l4-4 4 4"/>',
    "maximize": '<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5l-6 6M4.5 19.5l6-6"/>',
    "minimize": '<path d="M19.5 10H14V4.5M4.5 14H10v5.5M14 10l6-6M10 14l-6 6"/>',
    "new-key": '<circle cx="8" cy="12" r="4.2"' + F + '/><path d="M12.2 12h5"/>' + PLUS_BADGE.replace("M18.5 14v6M15.5 17h6", "M19 9v6M16 12h6"),
    "moon": '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"' + F + '/>',
    "sun": '<circle cx="12" cy="12" r="3.8"' + F + '/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    "receipt": '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"' + F + '/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    "address-book-new": '<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"' + F + '/><path d="M12 8.5v7M8.5 12h7M4.5 7.5H3M4.5 12H3M4.5 16.5H3"/>',
    "address-book-remote": body("addressbook"),
    "tentative": CIRCLE + '<path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.4"/><circle cx="12" cy="16.9" r="1.05"' + D + '/>',
    "account-sync": '<path d="M19.5 12a7.5 7.5 0 0 1-13.1 5M4.5 12a7.5 7.5 0 0 1 13.1-5"/><path d="M18 3.6v3.6h-3.6M6 20.4v-3.6h3.6"/>',
}

ALIAS_SUFFIX = re.compile(r"-(xs|sm|md|lg)$")


# Strichstärke je Eigengröße, damit kleine Symbole nicht zu dünn werden (in px: ~1–1.5)
WIDTHS = {8: 2.8, 12: 2.1, 16: STROKE, 20: 1.6, 24: 1.5}


def svg(name, size=16):
    # feste Eigengröße wie bei den Originalen – wichtig für content:/list-style-image ohne CSS-Größe
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" fill-opacity="context-fill-opacity" '
        f'stroke="context-stroke" stroke-width="{WIDTHS.get(size, STROKE)}" stroke-linecap="round" stroke-linejoin="round">{GLYPHS[name]}</svg>\n'
    )


SIZES = {"xs": 8, "sm": 12, "md": 20, "lg": 24}

# Eigene Symbole ohne Gegenstück in Thunderbirds icons.css (keine --icon-Variable,
# das Design bindet sie direkt ein): Datei → (Zeichnung, Eigengröße, Strich).
# Strich nach der freigegebenen Vorschau „Symbole: Pfeil und Häkchen“ (15.11.2026):
# der Doppelpfeil der Auswahlfelder (Wert wählen, wie chevron.up.chevron.down)
# und das Häkchen im Kästchen so kräftig wie Thunderbirds bisheriges.
EXTRA = {
    "chevron-updown-14.svg": ('<path d="m7.5 9.5 4.5-4.5 4.5 4.5M7.5 14.5l4.5 4.5 4.5-4.5"/>', 14, 2.3),
    "check-box-12.svg": (GLYPHS["check"], 12, 3.4),
    # „Anhänge anordnen“ im Verfassen-Fenster (Vorschau „Seltene Symbole“, 15.11.2026):
    # ganz nach vorne/hinten mit Anschlag, zusammenrücken als zwei Pfeile zur Mitte
    "move-first.svg": ('<path d="M6.5 6v12M16.5 6.5 11 12l5.5 5.5"/>', 16, STROKE),
    "move-last.svg": ('<path d="M17.5 6v12M7.5 6.5 13 12l-5.5 5.5"/>', 16, STROKE),
    "move-together.svg": ('<path d="M3.5 12h6M7 9.5 9.5 12 7 14.5M20.5 12h-6M17 9.5 14.5 12l2.5 2.5"/>', 16, STROKE),
    # Person ganz gefüllt (Teilnehmer-Dialog: Pflicht; Linie = optional)
    "user-fill.svg": ('<circle cx="12" cy="8.3" r="3.6" fill="context-stroke" fill-opacity="1"/>'
                      '<path d="M5 19.8c.9-3.7 3.6-5.6 7-5.6s6.1 1.9 7 5.6z" fill="context-stroke" fill-opacity="1"/>', 16, STROKE),
    # Seltene Symbole Teil 2 (15.11.2026): App-Menü „Get Involved“ (zwei Hände) und „Export for Mobile“
    # (Telefon mit Pfeil nach oben, wie die Kachel in den Einstellungen als Linie), Leerzustand der
    # globalen Suche als ruhige Lupe 40 px mit dünnem Strich
    "handshake.svg": ('<path d="M2.8 11.3 6.4 7.7l2.7.9"/><path d="M21.2 11.3l-3.6-3.6-3.3 1.1-3.7 2.9a1.3 1.3 0 0 0 1.6 2l2-1.4 3.9 3.6"/>'
                      '<path d="M5.1 13.5l4.7 4.6a1.3 1.3 0 0 0 1.8 0l4.2-3.9"/><path d="M7.6 15.8l1.8-1.7M10 18.1l1.7-1.6"/>', 16, STROKE),
    "mobile-export.svg": ('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><path d="M12 15.2V8.6M9.4 11.2 12 8.6l2.6 2.6"/>', 16, STROKE),
    "mobile-export-24.svg": ('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><path d="M12 15.2V8.6M9.4 11.2 12 8.6l2.6 2.6"/>', 24, 1.5),
    "search-empty-40.svg": (GLYPHS["search"], 40, 1.5),
}


def svg_extra(glyph, size, width):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" fill-opacity="context-fill-opacity" '
        f'stroke="context-stroke" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round">{glyph}</svg>\n'
    )


def tb_names():
    """(Name, Eigengröße) aller --icon-*-Variablen aus Thunderbirds icons.css (falls angegeben),
    die Größe aus der jeweiligen Original-SVG; sonst nur die Grundnamen mit 16 px."""
    if not (TB_ICONS_CSS and os.path.exists(TB_ICONS_CSS)):
        return [(n, 16) for n in sorted(GLYPHS)]
    root = os.path.dirname(TB_ICONS_CSS)
    found = {}
    for name, path in re.findall(r"^\s*--icon-([a-z0-9-]+):\s*url\(\"chrome://messenger/skin/([^\"]+)\"", open(TB_ICONS_CSS).read(), re.M):
        size = None
        try:
            m = re.search(r'<svg[^>]*\swidth="(\d+)', open(os.path.join(root, path)).read())
            size = int(m.group(1)) if m else None
        except OSError:
            pass
        suffix = ALIAS_SUFFIX.search(name)
        found[name] = size or (SIZES[suffix.group(1)] if suffix else 16)
    return sorted(found.items())


def write_extra():
    folder = os.path.join(OUT, "icons")
    for file, (glyph, size, width) in EXTRA.items():
        with open(os.path.join(folder, file), "w") as f:
            f.write(svg_extra(glyph, size, width))


def main():
    # nur die eigenen Zusatzsymbole schreiben (Ordner bleibt, wie er ist)
    if "--extra" in sys.argv:
        write_extra()
        print(f"{len(EXTRA)} Zusatzsymbole")
        return
    # Ohne Thunderbirds icons.css fehlen die Größenvarianten (-12, -20, -24 …):
    # dann nicht den vollständigen Satz im Repo durch einen kleineren ersetzen
    if not (TB_ICONS_CSS and os.path.exists(TB_ICONS_CSS)) and "--minimal" not in sys.argv:
        raise SystemExit(
            "TB_ICONS_CSS fehlt (Pfad zu icons.css aus den Thunderbird-Quellen) – ohne sie "
            "entstünden nur die Grundgrößen und vorhandene Symbole würden gelöscht.\n"
            "Aufruf: TB_ICONS_CSS=…/icons.css python3 make_iconvars.py  (oder --minimal)"
        )
    folder = os.path.join(OUT, "icons")
    os.makedirs(folder, exist_ok=True)
    for old in os.listdir(folder):
        os.remove(os.path.join(folder, old))
    rules = []
    for tb, size in tb_names():
        base = ALIAS_SUFFIX.sub("", tb)
        if base not in GLYPHS:
            continue
        file = f"{base}.svg" if size == 16 else f"{base}-{size}.svg"
        with open(os.path.join(folder, file), "w") as f:
            f.write(svg(base, size))
        rules.append(f'  --icon-{tb}: url("resource://mailcards/icons/{file}") !important;')
    write_extra()
    css = (
        "/* Erzeugt von icons/make_iconvars.py – eigene Symbole statt der Thunderbird-Originale. */\n"
        ":root {\n" + "\n".join(rules) + "\n}\n"
    )
    with open(os.path.join(OUT, "icon-vars.css"), "w") as f:
        f.write(css)
    print(f"{len(GLYPHS)} Symbole, {len(rules)} Variablen")


if __name__ == "__main__":
    main()
