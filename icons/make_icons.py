#!/usr/bin/env python3
"""Erzeugt den Icon-Satz im Apple-Mail-Stil und den CSS-Block für userChrome.css.

Eigene Zeichnungen (keine Apple-Grafiken): dünne, abgerundete Linien auf einem
24×24-Raster, wie die Symbole in macOS 27. Die SVGs werden als CSS-Maske
verwendet, die Farbe kommt aus currentColor – damit passen sie automatisch zu
Hell/Dunkel und zur Akzentfarbe.

Aufruf:  python3 make_icons.py            → schreibt svg/*.svg und icons.css
         python3 make_icons.py --inject   → ersetzt zusätzlich den Block in ../chrome/userChrome.css
"""

import os
import sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
STROKE = 1.7

# Name → (viewBox-Breite, SVG-Inhalt). Alles mit Strich, ohne Füllung, außer wo angegeben.
ICONS = {
    # Toolbar
    "envelope": (24, '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3.9 7.4 12 13.2l8.1-5.8"/>'),
    "compose": (24, '<path d="M11.2 4.5H6.6A2.6 2.6 0 0 0 4 7.1v10.3A2.6 2.6 0 0 0 6.6 20h10.3a2.6 2.6 0 0 0 2.6-2.6v-4.6"/>'
                    '<path d="M17.7 3.7a1.9 1.9 0 0 1 2.7 2.7l-8.1 8.1-3.4.8.8-3.4z"/>'),
    "reply": (24, '<path d="M9.5 6 4.5 11l5 5"/><path d="M4.8 11h8.7a6.5 6.5 0 0 1 6.5 6.5V19"/>'),
    "reply-all": (24, '<path d="M11 6 6 11l5 5"/><path d="M6.8 6 1.8 11l5 5"/><path d="M6.3 11h8.2a6.5 6.5 0 0 1 6.5 6.5V19"/>'),
    "forward": (24, '<path d="m14.5 6 5 5-5 5"/><path d="M19.2 11h-8.7A6.5 6.5 0 0 0 4 17.5V19"/>'),
    "archive": (24, '<rect x="3" y="4" width="18" height="4.8" rx="1.4"/><path d="M4.8 8.8v9.6A1.6 1.6 0 0 0 6.4 20h11.2a1.6 1.6 0 0 0 1.6-1.6V8.8"/><path d="M9.8 12.6h4.4"/>'),
    "trash": (24, '<path d="M3.8 6.6h16.4"/><path d="M9 6.6V5.1A1.6 1.6 0 0 1 10.6 3.5h2.8A1.6 1.6 0 0 1 15 5.1v1.5"/>'
                  '<path d="m5.9 6.6 1 12a1.6 1.6 0 0 0 1.6 1.4h7a1.6 1.6 0 0 0 1.6-1.4l1-12"/><path d="M10 10.4v6.2M14 10.4v6.2"/>'),
    "junk": (24, '<rect x="3" y="4" width="18" height="4.8" rx="1.4"/><path d="M4.8 8.8v9.6A1.6 1.6 0 0 0 6.4 20h11.2a1.6 1.6 0 0 0 1.6-1.6V8.8"/>'
                 '<path d="m9.6 11.4 4.8 5.2M14.4 11.4l-4.8 5.2"/>'),
    "folder-menu": (34, '<path d="M3 7.8A2.3 2.3 0 0 1 5.3 5.5h3.9l2.1 2.1h7.4A2.3 2.3 0 0 1 21 9.9v7.8a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.7z"/>'
                        '<path d="M3 10.3h18"/><path d="m26 11 3 3 3-3"/>'),
    # Stern („Starred“) im Stil von SF Symbols: Umriss, markiert gefüllt
    "star": (24, '<path d="M12 3.8 9.71 9.24l-5.89.5 4.47 3.87-1.34 5.75L12 16.3l5.05 3.06-1.34-5.75 4.47-3.87-5.89-.5z"/>'),
    "star-fill": (24, '<path d="M12 3.8 9.71 9.24l-5.89.5 4.47 3.87-1.34 5.75L12 16.3l5.05 3.06-1.34-5.75 4.47-3.87-5.89-.5z" fill="#000"/>'),
    # Geteilte Knöpfe wie Apple: Symbol | Trennlinie | Pfeil (Breite 46)
    "folder-split": (46, '<path d="M3 7.8A2.3 2.3 0 0 1 5.3 5.5h3.9l2.1 2.1h7.4A2.3 2.3 0 0 1 21 9.9v7.8a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.7z"/>'
                         '<path d="M3 10.3h18"/><path d="M30.5 6v12" stroke-width="1"/><path d="m36 10.5 3.5 3.5 3.5-3.5"/>'),
    # kleiner Pfeil für geteilte Knöpfe
    "chevron": (24, '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>'),
    # Drucker (Fenster einer geöffneten Mail, rechts wie Apple Mail)
    "print": (24, '<path d="M7 8V4.6A1.1 1.1 0 0 1 8.1 3.5h7.8A1.1 1.1 0 0 1 17 4.6V8"/>'
                  '<path d="M7 16.5H5.4A2.4 2.4 0 0 1 3 14.1v-3.7A2.4 2.4 0 0 1 5.4 8h13.2A2.4 2.4 0 0 1 21 10.4v3.7a2.4 2.4 0 0 1-2.4 2.4H17"/>'
                  '<rect x="7" y="13" width="10" height="7.5" rx="1.1"/><path d="M9.5 15.8h5M9.5 18h3.4"/>'),
    # Bereiche (Mail, Adressbuch, Kalender, Aufgaben, Chat, Einstellungen)
    "addressbook": (24, '<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"/><circle cx="12" cy="10.2" r="2.6"/><path d="M8.1 16.6c.8-1.9 2.2-2.8 3.9-2.8s3.1.9 3.9 2.8"/><path d="M4.5 7.5H3M4.5 12H3M4.5 16.5H3"/>'),
    "calendar": (24, '<rect x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 9.6h17"/><path d="M8 3.2v3.4M16 3.2v3.4"/><circle cx="8" cy="13.2" r=".9" fill="#000" stroke="none"/><circle cx="12" cy="13.2" r=".9" fill="#000" stroke="none"/><circle cx="16" cy="13.2" r=".9" fill="#000" stroke="none"/><circle cx="8" cy="16.8" r=".9" fill="#000" stroke="none"/><circle cx="12" cy="16.8" r=".9" fill="#000" stroke="none"/>'),
    "tasks": (24, '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/>'),
    "chat": (24, '<path d="M12 4.5c4.7 0 8.5 3 8.5 6.8s-3.8 6.8-8.5 6.8c-.9 0-1.8-.1-2.6-.3L5.3 19.6l1-3.4C4.6 14.9 3.5 13.2 3.5 11.3c0-3.8 3.8-6.8 8.5-6.8z"/>'),
    "settings": (24, '<path d="M18.86 10.61 L21.13 10.90 L21.13 13.10 L18.86 13.39 L17.83 15.87 L19.24 17.68 L17.68 19.24 L15.87 17.83 L13.39 18.86 L13.10 21.13 L10.90 21.13 L10.61 18.86 L8.13 17.83 L6.32 19.24 L4.76 17.68 L6.17 15.87 L5.14 13.39 L2.87 13.10 L2.87 10.90 L5.14 10.61 L6.17 8.13 L4.76 6.32 L6.32 4.76 L8.13 6.17 L10.61 5.14 L10.90 2.87 L13.10 2.87 L13.39 5.14 L15.87 6.17 L17.68 4.76 L19.24 6.32 L17.83 8.13Z"/><circle cx="12" cy="12" r="3"/>'),
    # Seitenleiste ein/aus (Bereiche-Menü an Apples Position)
    "sidebar": (24, '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M9.5 5v14"/><path d="M5.6 8.4h1.6M5.6 11h1.6"/>'),
    # Ordner
    "inbox": (24, '<path d="M3.5 13.4 6 6.6A1.6 1.6 0 0 1 7.5 5.5h9a1.6 1.6 0 0 1 1.5 1.1l2.5 6.8v4.5a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z"/>'
                  '<path d="M3.6 13.4H8l1.1 2.1h5.8l1.1-2.1h4.4"/>'),
    "drafts": (24, '<path d="M7.6 3.5h6.1L18.5 8.3v10.6a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 18.9V5.1a1.6 1.6 0 0 1 1.6-1.6z"/>'
                   '<path d="M13.6 3.6v4.8h4.8"/><path d="M9 12.6h6M9 16h4.4"/>'),
    "templates": (24, '<path d="M9.6 6.5h5.2l4.2 4.2v8.2a1.6 1.6 0 0 1-1.6 1.6H9.6A1.6 1.6 0 0 1 8 18.9V8.1a1.6 1.6 0 0 1 1.6-1.6z"/>'
                      '<path d="M14.7 6.6v4.2h4.2"/><path d="M5 16.5V5.1A1.6 1.6 0 0 1 6.6 3.5h6.4"/>'),
    "sent": (24, '<path d="M20.6 3.4 3.4 10.4l7.2 2.9 2.9 7.2z"/><path d="m20.6 3.4-10 9.9"/>'),
    "outbox": (24, '<path d="M3.5 13.4v4.5a1.6 1.6 0 0 0 1.6 1.6h13.8a1.6 1.6 0 0 0 1.6-1.6v-4.5H16l-1.1 2.1H9.1L8 13.4z"/>'
                   '<path d="M12 3.6v8.2"/><path d="M8.7 6.9 12 3.6l3.3 3.3"/>'),
    "folder": (24, '<path d="M3 7.8A2.3 2.3 0 0 1 5.3 5.5h3.9l2.1 2.1h7.4A2.3 2.3 0 0 1 21 9.9v7.8a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.7z"/><path d="M3 10.3h18"/>'),
    "server": (24, '<path d="M3.5 13.4 6 6.6A1.6 1.6 0 0 1 7.5 5.5h9a1.6 1.6 0 0 1 1.5 1.1l2.5 6.8v4.5a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z"/><path d="M3.6 13.4h16.8"/>'),
    "rss": (24, '<path d="M5.5 11a7.5 7.5 0 0 1 7.5 7.5M5.5 5.5a13 13 0 0 1 13 13"/><circle cx="6.5" cy="17.5" r="1.4" fill="#000" stroke="none"/>'),
    # Kopfzeilen
    "filter": (24, '<path d="M4.5 7h15M7.3 12h9.4M10 17h4"/>'),
    "ellipsis": (24, '<circle cx="6" cy="12" r="1.5" fill="#000" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="#000" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="#000" stroke="none"/>'),
    # Neu-Knöpfe in Adressbuch, Kalender, Aufgaben
    "new-contact": (24, '<circle cx="10" cy="8.3" r="3.6"/><path d="M3.5 19.8c.9-3.7 3.4-5.6 6.5-5.6 1.3 0 2.5.3 3.5 1"/><path d="M18.5 14v6M15.5 17h6"/>'),
    "new-address-book": (24, '<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"/><path d="M12 8.5v7M8.5 12h7M4.5 7.5H3M4.5 12H3M4.5 16.5H3"/>'),
    "new-list": (24, '<circle cx="9.5" cy="8.6" r="3.3"/><path d="M3.5 19.5c.8-3.3 3-5 6-5 1.4 0 2.6.4 3.6 1.1M15.5 5.6a3.2 3.2 0 0 1 0 6.1"/><path d="M18.5 14v6M15.5 17h6"/>'),
    "new-event": (24, '<rect x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 9.6h17M8 3.2v3.4M16 3.2v3.4M12 12.3v5.4M9.3 15h5.4"/>'),
    "new-task": (24, '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>'),
    "sidebar-get": (24, '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3.9 7.4 12 13.2l8.1-5.8"/>'),
}


def svg(name):
    width, body = ICONS[name]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 24" fill="none" '
        f'stroke="#000" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
    )


def data_uri(name):
    return "url(\"data:image/svg+xml," + quote(svg(name), safe=" =:/,;-.'") + "\")"


TOOLBAR = {
    "get-messages": "envelope",
    "write-message": "compose",
    "reply": "reply",
    "reply-all": "reply-all",
    "forward-inline": "forward",
    "archive": "archive",
    "delete": "trash",
    "junk": "junk",
    "move-to": "folder",
    "mark-as": "star",
    # Adressbuch, Kalender, Aufgaben
    "create-contact": "new-contact",
    "create-address-book": "new-address-book",
    "create-list": "new-list",
    "new-event": "new-event",
    "new-task": "new-task",
}

FOLDERS = {
    "inbox": "inbox",
    "drafts": "drafts",
    "templates": "templates",
    "sent": "sent",
    "archive": "archive",
    "junk": "junk",
    "trash": "trash",
    "outbox": "outbox",
}

TRANSPARENT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E\")"


def css():
    out = ["/* ==== Icons im Apple-Mail-Stil (generiert von icons/make_icons.py) ==== */", ":root {"]
    for name in ICONS:
        out.append(f"  --mi-{name}: {data_uri(name)};")
    out.append("}")
    out.append("""
/* Gemeinsam: Thunderbirds Bild leeren, eigenes Symbol als Maske in currentColor */
#unifiedToolbarContent li button .button-icon,
#folderTree li > .container .icon {
  content: {TRANSPARENT} !important;
  background-color: currentColor !important;
  mask-repeat: no-repeat !important;
  mask-position: center !important;
  mask-size: contain !important;
  fill: none !important;
  stroke: none !important;
}

#unifiedToolbarContent li button .button-icon {
  width: 22px !important;
  height: 22px !important;
}

/* Toolbar-Symbole so dunkel wie in Apple Mail */
#unifiedToolbarContent li:not([item-id="search-bar"]) button {
  color: color-mix(in srgb, var(--mt-text) 82%, transparent) !important;
}

/* Verschieben und Markieren: Thunderbirds eigener Pfeil (Hintergrundbild
   rechts + 20 px Abstand) entfällt. */
#unifiedToolbarContent li button[popup] {
  background-image: none !important;
  padding-inline: 8px !important;
}

/* Verschieben: ein Knopf wie bei Apple (Ordner und Pfeil ohne Trennstrich),
   jeder Klick öffnet das Menü. Markieren: echter geteilter Knopf aus denselben
   Teilen wie die Mehrfach-Kapseln – 40 px Stern | Trennstrich | 28 px Pfeil;
   ein Klick auf den Stern setzt bzw. entfernt den Stern der gewählten Mail
   (Erweiterung), der Pfeil öffnet das Menü */
#unifiedToolbarContent li:is([item-id="move-to"], [item-id="mark-as"]) button {
  position: relative !important;
  width: 69px !important;
  min-width: 69px !important;
  padding: 0 !important;
  justify-content: flex-start !important;
}

#unifiedToolbarContent li[item-id="move-to"] button {
  width: 62px !important;
  min-width: 62px !important;
}

#unifiedToolbarContent li:is([item-id="move-to"], [item-id="mark-as"]) button .button-icon {
  margin-inline-start: 9px !important;
}

#unifiedToolbarContent li[item-id="mark-as"] button::before {
  content: "" !important;
  position: absolute !important;
  inset-inline-start: 40px !important;
  top: 11px !important;
  bottom: 11px !important;
  width: 1px !important;
  background-color: var(--mt-pane-line) !important;
  pointer-events: none !important;
}

#unifiedToolbarContent li:is([item-id="move-to"], [item-id="mark-as"]) button::after {
  content: "" !important;
  position: absolute !important;
  inset-inline-start: 41px !important;
  width: 28px !important;
  top: 0 !important;
  bottom: 0 !important;
  background-color: currentColor !important;
  mask: var(--mi-chevron) center / 14px 14px no-repeat !important;
  pointer-events: none !important;
}

#unifiedToolbarContent li[item-id="move-to"] button::after {
  inset-inline-start: 34px !important;
  width: 26px !important;
}

/* Gewählte Mail mit Stern: Stern gefüllt in Orange wie Apple Mails Markierung */
#unifiedToolbarContent li[item-id="mark-as"][mc-starred] button:not([disabled]) .button-icon {
  mask-image: var(--mi-star-fill) !important;
  background-color: var(--mt-star) !important;
}

/* Hervorhebung beim Überfahren nur für die Hälfte unter der Maus (mc-hot
   setzt die Erweiterung) */
#unifiedToolbarContent > li[item-id="mark-as"][mc-hot] button:hover:not([disabled]) {
  background-color: transparent !important;
}

#unifiedToolbarContent > li[item-id="mark-as"][mc-hot="star"] button:hover:not([disabled]) {
  background-image: linear-gradient(to right, var(--mt-control-hover) 40px, transparent 40px) !important;
}

#unifiedToolbarContent > li[item-id="mark-as"][mc-hot="menu"] button:hover:not([disabled]) {
  background-image: linear-gradient(to right, transparent 41px, var(--mt-control-hover) 41px) !important;
}

#unifiedToolbarContent > li[item-id="mark-as"][mc-hot="star"] button:hover:not([disabled]):dir(rtl) {
  background-image: linear-gradient(to left, var(--mt-control-hover) 40px, transparent 40px) !important;
}

#unifiedToolbarContent > li[item-id="mark-as"][mc-hot="menu"] button:hover:not([disabled]):dir(rtl) {
  background-image: linear-gradient(to left, transparent 41px, var(--mt-control-hover) 41px) !important;
}

/* Feine Trennlinien zwischen den Knöpfen einer Kapsel */
#unifiedToolbarContent > li[item-id] {
  position: relative !important;
}

#unifiedToolbarContent > li:is([item-id="write-message"], [item-id="reply-all"], [item-id="forward-inline"], [item-id="delete"], [item-id="junk"])::before {
  content: "" !important;
  position: absolute !important;
  inset-inline-start: 0 !important;
  top: 11px !important;
  bottom: 11px !important;
  width: 1px !important;
  background-color: var(--mt-pane-line) !important;
  pointer-events: none !important;
}

/* Bereiche-Menü an die Stelle von Apples Seitenleisten-Knopf: oben rechts in
   der Seitenleiste (--mc-sidebar-right liefert die Erweiterung) – in jedem Tab */
#unifiedToolbarContainer {
  position: relative !important;
}

#unifiedToolbar {
  position: static !important;
}

#spacesPinnedButton {
  position: absolute !important;
  /* gleiche Stelle in allen Tabs; nie weiter links als neben die Fensterknöpfe */
  inset-inline-start: max(calc(var(--mc-sidebar-right, 220px) - 50px), 84px) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  /* gleiche Kapsel wie die Toolbar-Knöpfe: 40 × 38 px, grauer Hintergrund */
  width: 40px !important;
  height: 38px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 999px !important;
  background-color: var(--mt-control) !important;
  color: color-mix(in srgb, var(--mt-text) 82%, transparent) !important;
  justify-content: center !important;
  align-items: center !important;
}

/* Thunderbird blendet den Knopf aus, sobald die Bereiche-Leiste sichtbar ist –
   als Seitenleisten-Knopf muss er aber immer da sein */
#spacesPinnedButton[hidden] {
  display: flex !important;
}

#spacesPinnedButton:hover {
  background-color: var(--mt-control-hover) !important;
}

#spacesPinnedButton .toolbarbutton-icon {
  list-style-image: {TRANSPARENT} !important;
  width: 22px !important;
  height: 22px !important;
  background-color: currentColor !important;
  mask: var(--mi-sidebar) center / contain no-repeat !important;
  fill: none !important;
}
""".replace("{TRANSPARENT}", TRANSPARENT))
    for item, icon in TOOLBAR.items():
        out.append(f'#unifiedToolbarContent li[item-id="{item}"] button .button-icon {{ mask-image: var(--mi-{icon}) !important; }}')
    out.append("")
    out.append("/* Ordnerliste: Symbol in Akzentfarbe wie in Apple Mail (grau, wenn das Fenster inaktiv ist); 22 px groß (sichtbar ca. 17 px wie Apple Mail),\n   Text beginnt 29 px nach dem Symbol-Anfang wie bei Apple */")
    out.append("#folderTree li > .container .icon {\n  width: 22px !important;\n  height: 22px !important;\n  margin-inline-start: -2px !important;\n  margin-inline-end: 4px !important;\n  color: var(--mt-accent) !important;\n  mask-image: var(--mi-folder) !important;\n}")
    out.append("/* wie Apple: blau solange Thunderbird im Vordergrund ist, grau sobald eine andere App aktiv ist */")
    out.append("#folderTree li > .container .icon:-moz-window-inactive {\n  color: color-mix(in srgb, var(--mt-text) 80%, transparent) !important;\n}")
    out.append('#folderTree li[data-server-type] > .container .icon { mask-image: var(--mi-server) !important; }')
    out.append('#folderTree li[data-server-type="rss"] > .container .icon { mask-image: var(--mi-rss) !important; }')
    for ftype, icon in FOLDERS.items():
        out.append(f'#folderTree li[data-folder-type="{ftype}"] > .container .icon {{ mask-image: var(--mi-{icon}) !important; }}')
    out.append("""
/* Knöpfe über Ordner- und Mailliste: Thunderbird zeichnet ihr Symbol als
   Hintergrundbild – das wird ausgeblendet und durch eine Masken-Ebene ersetzt */
:is(#folderPaneGetMessages, #folderPaneWriteMessage, #folderPaneMoreButton,
    #threadPaneQuickFilterButton, #threadPaneDisplayButton) {
  background-image: none !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

:is(#folderPaneGetMessages, #folderPaneWriteMessage, #folderPaneMoreButton,
    #threadPaneQuickFilterButton, #threadPaneDisplayButton)::after {
  content: "" !important;
  display: block !important;
  width: 20px !important;
  height: 20px !important;
  background-color: currentColor !important;
  mask-repeat: no-repeat !important;
  mask-position: center !important;
  mask-size: contain !important;
}

/* Bereiche: Leiste am linken Rand und Bereiche-Menü */
/* Bereiche-Leiste wie die Toolbar-Kapseln: senkrechte graue Kapseln mit gleich
   großen 40-px-Knöpfen und demselben Trennstrich (hier waagerecht) */
/* Leistenbreite 67 px (9 + 48 + 9 + 1 px Linie); Thunderbird rückt den übrigen
   Inhalt um genau diesen Wert ein. Beim Ein-/Ausblenden animiert die
   Erweiterung --mc-spaces-w zwischen 0 und 67 px. */
:root,
:root[uidensity] {
  --spaces-total-width: var(--mc-spaces-w, 67px) !important;
}

#spacesToolbar {
  background: var(--mt-sidebar) !important;
  /* unten Platz für den Bereiche-Knopf (#mcSpacesToggle) */
  padding: 8px 9px 48px !important;
  inline-size: 67px !important;
  /* während der Animation schiebt sich die Leiste von links herein */
  transform: translateX(calc(var(--spaces-total-width) - 67px)) !important;
  box-sizing: border-box !important;
  gap: 0 !important;
  border-inline-end: 1px solid var(--mt-sidebar-border) !important;
  /* Thunderbirds eigene Positionierung (fest, volle Fensterhöhe) bleibt */
}

/* keine Kapsel – alle Knöpfe bekommen gleich viel Höhe (Container auflösen) */
#spacesToolbar .spaces-toolbar-container {
  display: contents !important;
}

#spacesToolbar > #spacesToolbarAddonsOverflowButton:not([hidden]),
#spacesToolbar .spaces-toolbar-container > .spaces-toolbar-button:not([hidden]) {
  flex: 1 1 0 !important;
  max-height: none !important;
}

/* Bereiche in dezenten Farben wie Post-it-Haftmarker: jedes Segment leicht
   getönt, Symbol in der Bereichsfarbe; der aktuelle Bereich kräftiger und mit
   einem Chevron rechts daneben */
#spacesToolbar .spaces-toolbar-button {
  --c: #8E8E93;
  position: relative !important;
  align-self: center !important;
  width: 48px !important;
  height: auto !important;
  min-height: 44px !important;
  margin: 3px 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 12px !important;
  background-color: color-mix(in srgb, var(--c) 11%, transparent) !important;
  box-shadow: none !important;
  color: color-mix(in srgb, var(--c) 70%, #3a3a3c) !important;
  justify-content: center !important;
  align-items: center !important;
}

#spacesToolbar #mailButton { --c: #0A84FF; }
#spacesToolbar #addressBookButton { --c: #30B850; }
#spacesToolbar #calendarButton { --c: #FF8A00; }
#spacesToolbar #tasksButton { --c: #FF2D78; }
#spacesToolbar #chatButton { --c: #AF52DE; }
#spacesToolbar #settingsButton { --c: #8E8E93; }

#spacesToolbar .spaces-toolbar-button:hover {
  background-color: color-mix(in srgb, var(--c) 16%, transparent) !important;
}

#spacesToolbar .spaces-toolbar-button.current {
  background-color: color-mix(in srgb, var(--c) 22%, transparent) !important;
  color: var(--c) !important;
}

#spacesToolbar .spaces-toolbar-button.current::after {
  content: "" !important;
  position: absolute !important;
  inset-inline-end: -13px !important;
  top: calc(50% - 9px) !important;
  width: 18px !important;
  height: 18px !important;
  background-color: var(--c) !important;
  mask: var(--mi-chevron) center / contain no-repeat !important;
  transform: rotate(-90deg) !important;
  pointer-events: none !important;
}

/* „Leiste ausblenden“ sitzt nicht in der Leiste, sondern als eigener Knopf
   unten links (#mcSpacesToggle, von der Erweiterung angelegt) */
#spacesToolbar #collapseButton,
#spacesToolbarReveal {
  display: none !important;
}

#mcSpacesToggle {
  position: fixed !important;
  z-index: 3 !important;
  bottom: 10px !important;
  inset-inline-start: 12px !important;
  width: 34px !important;
  height: 30px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  min-width: 0 !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: color-mix(in srgb, var(--mt-text) 82%, transparent) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  appearance: none !important;
}

/* Bei sichtbarer Leiste sitzt der Knopf mittig unten in der Leiste
   ((67 − 34) / 2 = 16,5 px), ausgeblendet 12 px vom Fensterrand. Während der
   Animation gleitet er mit der Leistenbreite (0–67 px) zwischen beiden Plätzen. */
#spacesToolbar:not([hidden]) ~ #mcSpacesToggle {
  inset-inline-start: calc(12px + var(--spaces-total-width) * 0.06716) !important;
}

#mcSpacesToggle:hover {
  background-color: var(--mt-control-hover) !important;
  color: var(--mt-text) !important;
}

/* Thunderbirds ursprüngliches Symbol (Strich mit Pfeil), so groß wie die
   übrigen Bereiche-Symbole; Pfeil nach rechts bei sichtbarer, nach links bei
   ausgeblendeter Leiste */
#mcSpacesToggle::before {
  content: "" !important;
  width: 24px !important;
  height: 24px !important;
  background-color: currentColor !important;
  transform: scaleX(-1) !important;
  mask: url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Cpath fill=%22%23000%22 d=%22M2.5 2a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5.5.5 0 0 0 .5-.5v-10a.5.5 0 0 0-.5-.5Zm6 1a.5.5 0 0 0-.354.146l-4 4A.5.5 0 0 0 4 7.5a.5.5 0 0 0 .146.354l4 4a.5.5 0 0 0 .708 0 .5.5 0 0 0 0-.708L5.707 8H13.5a.5.5 0 0 0 .5-.5.5.5 0 0 0-.5-.5H5.707l3.147-3.146a.5.5 0 0 0 0-.708A.5.5 0 0 0 8.5 3Z%22/%3E%3C/svg%3E") center / contain no-repeat !important;
}

#spacesToolbar[hidden] ~ #mcSpacesToggle::before {
  transform: none !important;
}

.spaces-toolbar-button > img,
.spaces-popup-menuitem > .menu-icon {
  content: {TRANSPARENT} !important;
  list-style-image: {TRANSPARENT} !important;
  width: 24px !important;
  height: 24px !important;
  background-color: currentColor !important;
  mask-repeat: no-repeat !important;
  mask-position: center !important;
  mask-size: contain !important;
  fill: none !important;
  stroke: none !important;
  transform: none !important;
}

.spaces-popup-menuitem > .menu-icon {
  width: 18px !important;
  height: 18px !important;
}

:is(#mailButton, #spacesPopupButtonMail) > :is(img, .menu-icon) { mask-image: var(--mi-envelope) !important; }
:is(#addressBookButton, #spacesPopupButtonAddressBook) > :is(img, .menu-icon) { mask-image: var(--mi-addressbook) !important; }
:is(#calendarButton, #spacesPopupButtonCalendar) > :is(img, .menu-icon) { mask-image: var(--mi-calendar) !important; }
:is(#tasksButton, #spacesPopupButtonTasks) > :is(img, .menu-icon) { mask-image: var(--mi-tasks) !important; }
:is(#chatButton, #spacesPopupButtonChat) > :is(img, .menu-icon) { mask-image: var(--mi-chat) !important; }
:is(#settingsButton, #spacesPopupButtonSettings) > :is(img, .menu-icon) { mask-image: var(--mi-settings) !important; }
:is(#collapseButton, #spacesPopupButtonReveal) > :is(img, .menu-icon) { mask-image: var(--mi-sidebar) !important; }

#folderPaneGetMessages::after { mask-image: var(--mi-envelope) !important; }
#folderPaneWriteMessage::after { mask-image: var(--mi-compose) !important; }
#folderPaneMoreButton::after,
#threadPaneDisplayButton::after { mask-image: var(--mi-ellipsis) !important; }
#threadPaneQuickFilterButton::after { mask-image: var(--mi-filter) !important; }
/* ==== Ende Icons ==== */""".replace("{TRANSPARENT}", TRANSPARENT))
    return "\n".join(out) + "\n"


def main():
    os.makedirs(os.path.join(HERE, "svg"), exist_ok=True)
    for name in ICONS:
        with open(os.path.join(HERE, "svg", f"{name}.svg"), "w") as f:
            f.write(svg(name) + "\n")
    block = css()
    with open(os.path.join(HERE, "icons.css"), "w") as f:
        f.write(block)
    if "--inject" in sys.argv:
        path = os.path.join(HERE, "..", "chrome", "userChrome.css")
        text = open(path).read()
        start = text.find("/* ==== Icons im Apple-Mail-Stil")
        end = text.find("/* ==== Ende Icons ==== */")
        if start != -1 and end != -1:
            # nur die erzeugten Symbol-Variablen (:root { --mi-… }) ersetzen –
            # die Regeln darunter werden in userChrome.css von Hand gepflegt
            # (eine veraltete Vorlage hier würde sie sonst zurücksetzen)
            def root_vars(css_text, offset=0):
                a = css_text.index(":root {", offset)
                b = css_text.index("\n}\n", a) + 3
                return a, b
            ga, gb = root_vars(block)
            ua, ub = root_vars(text, start)
            if ub > end:
                raise SystemExit("Symbol-Variablen in userChrome.css nicht gefunden")
            text = text[:ua] + block[ga:gb] + text[ub:]
        else:
            anchor = "/* ---------- Menüs & Popups (wie macOS 27) ---------- */"
            text = text.replace(anchor, block + "\n" + anchor)
        open(path, "w").write(text)
    print(f"{len(ICONS)} Icons geschrieben")


if __name__ == "__main__":
    main()
