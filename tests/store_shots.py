#!/usr/bin/env python3
"""Bilder für README und Store aus einem frischen Testprofil mit erfundenen,
englischen Beispieldaten (Mails, Kontakte, Termine, Aufgaben) – nie echte Daten.

README-Bilder (Standard, Vorgabe des Designers, nur macOS):

    python3 tests/store_shots.py --port 2852 [--out /tmp/halo-readme-bilder] [--only mail-inbox,search]
        [--calendar week|month] [--search-menu] [--today-closed] [--snapshot] [--compose]

- Ganze Fenster 1500 × 940 pt, aufgenommen in 2x (3000 × 1880) einzeln per `screencapture -l <Fenster-ID>`
  MIT Schatten und durchsichtigen Rändern, Ampel sichtbar, kein Schreibtisch dahinter. Die Fenster-ID kommt
  aus der Fensterliste der Test-PID (CGWindowListCopyWindowInfo über osascript, wie ui_tour.py).
  Ausschnitte (sender-pictures, today-pane) aus einer Aufnahme ohne Schatten (`-o`), ebenfalls 2x.
  2x braucht einen Retina- bzw. HiDPI-Bildschirm; sonst bricht das Skript ab. --snapshot nimmt dann
  stattdessen drawSnapshot in 2x (nur der Fensterinhalt: ohne Schatten, Ampel und Fensterrand).
- Fester Tag: Freitag, 20.11.2026, 09:41. Die Systemuhr bleibt unberührt: im Testprofil wird `Date` in
  den Fenstern, im gemeinsamen Modul-Global (cal.dtz.now) und im Global der Erweiterung um den Abstand
  verschoben (die Uhr läuft ab 09:41 weiter). Mails und Termine hängen an diesem Zeitpunkt.
- Akzent Blau (ui.accentcolor wie die Systemfarbe), Lichtschein an, alle Schalter auf Werkseinstellung
  (nur das Wetter ist eingeschaltet, wie nach „Yes“ in der Begrüßung). Alles hell außer mail-dark (dieselbe
  Szene wie mail-inbox in einem zweiten, dunklen Lauf).
- Bilder: mail-inbox, sender-pictures, mail-dark, today-pane, search (--search-menu: offenes
  Vorschlagsmenü statt Trefferliste), calendar-week bzw. calendar-month (--calendar), quick-event,
  tasks, addressbook-contacts (--today-closed: Today Pane dafür zu), welcome. compose entfällt
  (--compose meldet nur „wartet auf I6FHI“).
- Ausgabe nur außerhalb des Repos (--out); ins Repo nur mit --ins-repo, nach Freigabe des Maintainers.

Store-Bilder (bisheriger Weg, unverändert):

    python3 tests/store_shots.py --store --port 2852 [--dark] [--out /tmp/halo-store-bilder]

Ergebnis: mail.png, search.png, calendar.png, addressbook.png in 1728 × 1024 und
dieselben als store-*.png in 1280 × 759 (Store). Fenster 1620 × 960, das Bild
wird auf 1728 × 1024 hochgerechnet (passt auf den 1080-px-Bildschirm des Testrechners).
Dazu welcome.png (Begrüßung mit Wetter und Ersatz für Chat) in doppelter Auflösung.
"""

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo_test as ht  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Testdaten in Teilen: der Store-Weg nimmt alle vier (DATA_JS), der README-Weg Kontakte und Wetter
DATA_MAIL_JS = r"""
const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
w.moveTo(0, 0); w.resizeTo(1620, 960); await wait(800);
// Mails (Lokale Ordner, erfundene Absender)
try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
const root = MailServices.accounts.localFoldersServer.rootFolder;
if (!root.subFolders.some(f => f.name == "Inbox")) { root.createSubfolder("Inbox", null); await wait(400); }
const inbox = root.subFolders.find(f => f.name == "Inbox");
inbox.setFlag(Ci.nsMsgFolderFlags.Inbox);
const now = Date.now();
const date = min => new Date(now - min * 60000).toUTCString().replace("GMT", "+0000");
const mails = [
  ["Mia Johnson <mia@northwind.example>", "Dinner on Friday?", "Hi! Are you free for dinner on Friday? I found a lovely little place near the river. Let me know and I'll book a table for seven.", 12, false, { star: true }],
  ["Studio North <team@studionorth.example>", "New icons for the app", "Here are the new icons for the app. We kept them simple and calm, with a little more space around each symbol.", 48, false, { att: ["App icons.zip"] }],
  ["Ben Carter <ben@carter.example>", "Photos from the trip", "The photos from our trip are online now. The sunset at the lake turned out even better than I hoped.", 95, false],
  ["SkyWay Air <trips@skyway.example>", "Your flight to Berlin", "Your booking is confirmed: Thursday, 07:10, seat 14A. Online check-in opens 24 hours before departure.", 180, true, { star: true, att: ["Boarding pass.pdf"] }],
  ["Olivia Brown <olivia@brown.example>", "Book club: next meeting", "The next book club meets on the 16th. We are reading a short novel this time, so there is still time to join.", 300, true],
  ["Weekly Notes <hello@weeklynotes.example>", "Five ideas for a calm week", "A short read for your Sunday: five small ideas for a calmer, more focused week.", 520, true],
  ["Lucas Meyer <lucas@meyer.example>", "Re: Garden project", "Sounds great. I can bring the tools on Saturday morning, around nine.", 900, true],
  ["City Library <info@citylibrary.example>", "Your books are ready", "The books you reserved are ready for pickup at the front desk until next Tuesday.", 1500, true],
  ["Emma Davis <emma@davis.example>", "Quick question about the offer", "Could you send me the updated offer by Wednesday? Then I can share it with the team before our call.", 2100, true, { star: true }],
  ["Green Market <news@greenmarket.example>", "Fresh this week: apples and pumpkins", "Autumn is here: fresh apples, pumpkins and warm bread at the market every Saturday.", 2900, true],
  ["Noah Wilson <noah@wilson.example>", "Running on Sunday", "Same time as last week? Meet at the park entrance at eight.", 3600, true],
  ["Summit Outdoor <hello@summit.example>", "Your order is on its way", "Good news: your new hiking boots left our warehouse today and should arrive on Thursday.", 4400, true],
  ["Sophia Martin <sophia@martin.example>", "Sketches for the poster", "Attached are three sketches for the poster. I like the second one best, what do you think?", 5200, true, { att: ["Poster sketches.pdf"] }],
];
// Anhänge: kleine erfundene Dateien (nur ein paar Bytes Inhalt)
mails.forEach(([from, subject, body, min, read, opt = {}], i) => {
  const text = `${body}\r\n\r\nBest,\r\n${from.split(" ")[0]}\r\n`;
  const type = n => n.endsWith(".pdf") ? "application/pdf" : "application/zip";
  const content = opt.att ? `Content-Type: multipart/mixed; boundary="halo-${i}"\r\n\r\n--halo-${i}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n` +
      opt.att.map(n => `--halo-${i}\r\nContent-Type: ${type(n)}; name="${n}"\r\nContent-Disposition: attachment; filename="${n}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n${btoa("halo.spaces example " + n)}\r\n`).join("") + `--halo-${i}--\r\n`
    : `Content-Type: text/plain; charset=UTF-8\r\n\r\n${text}`;
  inbox.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(
    // (ohne eigene Trennzeile – die schreibt Thunderbird selbst)
    `From: ${from}\r\nTo: You <you@example.invalid>\r\nSubject: ${subject}\r\nDate: ${date(min)}\r\n` +
    `Message-ID: <store-${i}@example.invalid>\r\nMIME-Version: 1.0\r\n${content}\r\n`);
});
await wait(800);
for (const h of inbox.messages) {
  const m = mails.find(x => x[1] == h.mime2DecodedSubject);
  if (m && m[4]) h.markRead(true);
  if (m?.[5]?.star) inbox.markMessagesFlagged([h], true);
}
"""

DATA_CONTACTS_JS = r"""
// Kontakte mit Bild: Personen als gezeichnete Gesichter, erfundene Firmen mit
// einfachem eigenem Logo – alles selbst gezeichnet (keine echten Fotos, keine echten Marken)
const { VCardUtils } = ChromeUtils.importESModule("resource:///modules/VCardUtils.sys.mjs");
const book = MailServices.ab.directories.find(b => b.dirPrefId == "ldap_2.servers.pab") || MailServices.ab.directories[0];
const X = "http://www.w3.org/1999/xhtml";
const canvas = () => { const c = d.createElementNS(X, "canvas"); c.width = c.height = 256; return c; };
const face = ([bg1, bg2, skin, hair, style, shirt]) => {
  const c = canvas(), g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, bg1); grad.addColorStop(1, bg2);
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  if (style == "long") { g.fillStyle = hair; g.beginPath(); g.ellipse(128, 128, 66, 78, 0, 0, Math.PI * 2); g.fill(); g.fillRect(62, 128, 132, 70); }
  g.fillStyle = shirt; g.beginPath(); g.ellipse(128, 262, 92, 64, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = skin; g.fillRect(112, 160, 32, 34); g.beginPath(); g.ellipse(128, 124, 50, 58, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = hair; g.beginPath();
  if (style == "bun") { g.arc(128, 58, 24, 0, Math.PI * 2); g.fill(); g.beginPath(); }
  g.ellipse(128, 100, 54, 40, 0, Math.PI, Math.PI * 2); g.fill();
  if (style == "short") { g.beginPath(); g.ellipse(128, 86, 50, 22, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#2b2b2e"; for (const x of [108, 148]) { g.beginPath(); g.arc(x, 128, 5.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "#2b2b2e"; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.arc(128, 146, 18, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  g.fillStyle = "rgba(255,120,120,0.25)"; for (const x of [96, 160]) { g.beginPath(); g.arc(x, 148, 10, 0, Math.PI * 2); g.fill(); }
  return c.toDataURL("image/png");
};
const logo = (bg, draw) => {
  const c = canvas(), g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 16; g.lineCap = "round"; g.lineJoin = "round";
  draw(g); return c.toDataURL("image/png");
};
const glyphs = {
  studio: g => { g.beginPath(); g.arc(128, 128, 64, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(128, 128, 22, 0, Math.PI * 2); g.fill(); },
  plane: g => { g.beginPath(); g.moveTo(60, 140); g.lineTo(196, 96); g.lineTo(150, 150); g.lineTo(196, 196); g.lineTo(128, 160); g.lineTo(96, 196); g.lineTo(100, 150); g.closePath(); g.fill(); },
  notes: g => { for (const y of [96, 128, 160]) { g.beginPath(); g.moveTo(64, y); g.bezierCurveTo(96, y - 24, 128, y + 24, 160, y); g.bezierCurveTo(176, y - 12, 186, y - 12, 192, y); g.stroke(); } },
  library: g => { g.beginPath(); g.moveTo(128, 88); g.lineTo(128, 184); g.moveTo(128, 88); g.quadraticCurveTo(96, 72, 64, 84); g.lineTo(64, 176); g.quadraticCurveTo(96, 166, 128, 184);
    g.moveTo(128, 88); g.quadraticCurveTo(160, 72, 192, 84); g.lineTo(192, 176); g.quadraticCurveTo(160, 166, 128, 184); g.stroke(); },
  market: g => { g.beginPath(); g.moveTo(80, 184); g.bezierCurveTo(70, 110, 130, 64, 192, 68); g.bezierCurveTo(196, 140, 150, 190, 80, 184); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 8; g.beginPath(); g.moveTo(84, 180); g.quadraticCurveTo(130, 130, 180, 82); g.stroke(); },
  summit: g => { g.beginPath(); g.moveTo(48, 188); g.lineTo(110, 92); g.lineTo(140, 136); g.lineTo(160, 112); g.lineTo(208, 188); g.closePath(); g.fill(); },
};
const people = [
  ["Mia", "Johnson", "mia@northwind.example", "Northwind Studio", ["#FFD6A5", "#FFB4A2", "#F2C4A0", "#6B3E26", "long", "#5E81F4"]],
  ["Ben", "Carter", "ben@carter.example", "", ["#BDE0FE", "#A2D2FF", "#C68B59", "#2E2E2E", "short", "#34C759"]],
  ["Olivia", "Brown", "olivia@brown.example", "City Library", ["#E4C1F9", "#D0A2F7", "#F5D1B5", "#C0392B", "bun", "#FF9500"]],
  ["Lucas", "Meyer", "lucas@meyer.example", "", ["#CAFFBF", "#9BF6A0", "#EAC09A", "#8D5524", "short", "#AF52DE"]],
  ["Emma", "Davis", "emma@davis.example", "Davis & Co.", ["#FFC8DD", "#FFAFCC", "#8D5524", "#1F1F1F", "long", "#0A84FF"]],
  ["Noah", "Wilson", "noah@wilson.example", "", ["#FDFFB6", "#FFE680", "#F1C27D", "#D9A441", "short", "#FF3B30"]],
  ["Sophia", "Martin", "sophia@martin.example", "Martin Design", ["#A0C4FF", "#BDB2FF", "#E0AC69", "#4A2C1D", "bun", "#30B0C7"]],
];
const companies = [
  ["Studio North", "team@studionorth.example", logo("#1C1C1E", glyphs.studio)],
  ["SkyWay Air", "trips@skyway.example", logo("#0A84FF", glyphs.plane)],
  ["Weekly Notes", "hello@weeklynotes.example", logo("#FF9F0A", glyphs.notes)],
  ["City Library", "info@citylibrary.example", logo("#8E5CF7", glyphs.library)],
  ["Green Market", "news@greenmarket.example", logo("#30B050", glyphs.market)],
  ["Summit Outdoor", "hello@summit.example", logo("#3A6B8C", glyphs.summit)],
];
const addCard = lines => book.addCard(VCardUtils.vCardToAbCard(["BEGIN:VCARD", "VERSION:4.0", ...lines, "END:VCARD"].join("\r\n")));
for (const [first, last, mail, org, look] of people) {
  addCard([`FN:${first} ${last}`, `N:${last};${first};;;`, `EMAIL;PREF=1:${mail}`, ...(org ? [`ORG:${org}`] : []),
           "TEL;TYPE=cell:+1 555 01" + String(10 + people.findIndex(p => p[0] == first)), `PHOTO:${face(look)}`]);
}
for (const [org, mail, photo] of companies) {
  addCard([`FN:${org}`, `ORG:${org}`, `EMAIL;PREF=1:${mail}`, `PHOTO:${photo}`]);
}
"""

DATA_CAL_JS = r"""
// Kalender: Personal, Work, Family mit englischen Terminen (Emojis aus den Stichwörtern)
// Thunderbirds Standardkalender wird „Personal“ (bleibt der gewählte, beschreibbare Kalender)
const mk = (name, color) => { const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = name; c.setProperty("color", color); cal.manager.registerCalendar(c); return c; };
const home = cal.manager.getCalendars().find(c => c.type == "storage") || mk("Personal", "#34C759");
home.name = "Personal"; home.setProperty("color", "#34C759"); home.setProperty("disabled", false);
const work = mk("Work", "#FF9500"), fam = mk("Family", "#AF52DE");
const t0 = cal.dtz.now();
const at = (d, h, m = 0) => { const t = t0.clone(); t.day = d; t.hour = h; t.minute = m; t.second = 0; return t; };
const day = d => { const t = t0.clone(); t.day = d; t.isDate = true; return t; };
const ev = async (c, title, s, e, rrule) => { const x = new CalEvent(); x.title = title; x.startDate = s; x.endDate = e;
  if (rrule) { x.recurrenceInfo = new CalRecurrenceInfo(x); x.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule(rrule)); }
  return c.addItem(x); };
const monday = (() => { for (let d = 1; d <= 7; d++) { const t = t0.clone(); t.day = d; if (t.weekday == 1) return d; } return 1; })();
await ev(work, "Team meeting", at(monday, 9, 30), at(monday, 10, 30), "RRULE:FREQ=WEEKLY;COUNT=6");
await ev(home, "Yoga", at(monday + 1, 7), at(monday + 1, 8), "RRULE:FREQ=WEEKLY;COUNT=6");
await ev(home, "Tennis", at(monday + 3, 18), at(monday + 3, 19, 30), "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3");
await ev(fam, "Anna's birthday", day(3), day(4));
await ev(home, "Dentist", at(6, 8, 30), at(6, 9, 15));
await ev(work, "Flight to Berlin", at(8, 7, 10), at(8, 8, 25));
await ev(work, "Workshop in Berlin", day(8), day(10));
await ev(work, "Lunch with Ben", at(13, 12, 30), at(13, 13, 30));
await ev(home, "Haircut", at(14, 17), at(14, 17, 45));
await ev(fam, "Concert", at(16, 20), at(16, 22, 30));
await ev(work, "Call with the client", at(20, 15), at(20, 15, 45));
await ev(home, "Coffee with Mia", at(21, 10), at(21, 11));
await ev(home, "Doctor", at(22, 11), at(22, 11, 30));
await ev(fam, "Dinner with friends", at(23, 19, 30), at(23, 22));
await ev(fam, "Shopping", at(24, 10), at(24, 11, 30));
await ev(work, "Workshop", at(Math.min(t0.day + 1, 28), 13), at(Math.min(t0.day + 1, 28), 16));
await ev(fam, "Movie night", at(Math.min(t0.day + 2, 28), 20), at(Math.min(t0.day + 2, 28), 22));
await ev(home, "Gym", at(Math.min(t0.day + 3, 28), 18), at(Math.min(t0.day + 3, 28), 19));
await ev(fam, "Halloween party", at(31, 19), at(31, 23));
await ev(home, "Vacation", day(17), day(20));
await ev(work, "Design review", at(t0.day, 14), at(t0.day, 15));
"""

DATA_WEATHER_JS = r"""
// Wetter in der Today-Pane: Open-Meteo nachgestellt (feste Antwort, kein Netz, kein echter Ort)
const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
Cu.evalInSandbox(`fetchWithTimeout = async (win, url) => {
    const body = url.includes("geocoding") ? { results: [{ name: "Vienna", country: "Austria", latitude: 48.21, longitude: 16.37 }] }
      : { current: { weather_code: 2, is_day: 1, temperature_2m: 18.4 } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }; };`,
  ExtensionParent.GlobalManager.getExtension("mail-cards@sebastian.local").experimentAPIManager.global);
Services.prefs.setStringPref("extensions.mailcards.weatherPlace", "Vienna");
Services.prefs.setBoolPref("extensions.mailcards.weather", true);
await wait(1500);
"""

DATA_JS = DATA_MAIL_JS + DATA_CONTACTS_JS + DATA_CAL_JS + DATA_WEATHER_JS + r"""
return { mails: inbox.getTotalMessages(false), contacts: book.childCards.length };
"""

# sw: anderes Fenster (z. B. Begrüßung) statt des Hauptfensters, dann in doppelter Auflösung
SNAP_JS = r"""
const tw = typeof sw != "undefined" ? sw : w;
const bmp = await tw.browsingContext.currentWindowGlobal.drawSnapshot(null, tw == w ? 1728 / w.innerWidth : 2, "white");
const c = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = bmp.width; c.height = bmp.height;
c.getContext("2d").drawImage(bmp, 0, 0);
return c.toDataURL("image/png");
"""

SHOTS = [
    ("mail", r"""
      const a3 = await toMail();
      const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
      const inbox = MailServices.accounts.localFoldersServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
      a3.displayFolder(inbox.URI); await wait(1500);
      for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject == "Photos from the trip") a3.threadTree.selectedIndex = i;
      await wait(2500); a3.threadTree.focus(); await wait(400);"""),
    # Suche oben rechts: Treffer gleich in der Mailliste, auch nur im Mailtext
    ("search", r"""
      const a3 = await toMail();
      const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
      const input = bar.shadowRoot?.querySelector("input") || bar.querySelector("input");
      if (input) { input.value = "week"; }
      bar.dispatchEvent(new w.CustomEvent("search", { detail: "week", bubbles: true, composed: true })); await wait(3500);
      a3.threadTree.selectedIndex = 0; await wait(2500);"""),
    ("calendar", r"""
      tm.openTab("calendar", {}); await wait(2000); w.switchCalendarView("month", true); await wait(2500); w.currentView().goToDay(cal.dtz.now()); await wait(1500);"""),
    ("addressbook", r"""
      tm.openTab("addressBookTab", {}); await wait(2500);
      const ab = tm.currentTabInfo.browser.contentWindow;
      const list = ab.document.getElementById("cards");
      for (let i = 0; i < (list?.view?.rowCount || 0); i++) { if (list.view.getCardFromRow(i)?.displayName == "Mia Johnson") { list.selectedIndex = i; break; } }
      await wait(2000);"""),
    # Begrüßung nach der Installation: Wetter und Chat (Ersatz durch Bereich eines Add-ons oder Webseite)
    ("welcome", r"""
      const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
      const g = ExtensionParent.GlobalManager.getExtension("mail-cards@sebastian.local").experimentAPIManager.global;
      Cu.evalInSandbox(`enhancer.openHaloWindow(Services.wm.getMostRecentWindow("mail:3pane"), { welcome: true });`, g);
      const sw = await until(() => [...Services.wm.getEnumerator(null)].find(x => x.location?.href.startsWith("resource://mailcards/about/halo.html")
        && x.document.getElementById("fifth")), 8000);
      await wait(800);
      const btn = (sec, text) => [...sw.document.querySelectorAll(`#${sec} button`)].find(b => b.textContent == text);
      btn("weather", "Yes")?.click(); await wait(900);
      btn("fifth", "No")?.click(); await wait(900);"""),
]
# nur Bilder des Hauptfensters bekommen eine Store-Fassung
NO_STORE = {"welcome"}


def find_xpi(args):
    import glob
    return args.xpi or max((x for x in glob.glob(os.path.join(ROOT, "dist", "halo-spaces-*.xpi")) if not x.endswith("-atn.xpi")),
                           key=os.path.getmtime)


def store_main(args):
    """Bisheriger Weg: Store-Bilder (store-*.png, 1280 × 759) und ihre großen Fassungen."""
    xpi = find_xpi(args)
    args.out = args.out or "/tmp/halo-store-bilder"
    os.makedirs(args.out, exist_ok=True)
    profile = ht.create_profile(xpi, args.port, args.dark, prefix="halo-store-")
    proc = ht.start_thunderbird(ht.DEFAULT_TB, profile)
    try:
        if not ht.wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)
        m = ht.Marionette(args.port)
        m.cmd("WebDriver:SetTimeouts", {"script": 120000})
        print("Daten:", m.js(DATA_JS), flush=True)
        m.js("await wait(3000); return 1;")
        prefix = "dunkel-" if args.dark else ""
        for name, js in SHOTS:
            data = m.js(js + SNAP_JS)
            path = os.path.join(args.out, f"{prefix}{name}.png")
            with open(path, "wb") as f:
                f.write(base64.b64decode(data.split(",", 1)[1]))
            print("Bild:", path, flush=True)
            if name in NO_STORE:
                continue
            store = os.path.join(args.out, f"{prefix}store-{name}.png")
            subprocess.run(["sips", "-z", "759", "1280", path, "--out", store], capture_output=True, check=True)
    finally:
        ht.stop_thunderbird(args.port, proc)
        shutil.rmtree(profile, ignore_errors=True)


# ====================================================================== README-Bilder (Vorgabe des Designers)
# Telefonnummern bleiben im README weg (keine Zahlen über 99); Zeile muss es im Kontaktteil geben
_TEL = '\n           "TEL;TYPE=cell:+1 555 01" + String(10 + people.findIndex(p => p[0] == first)), `PHOTO:${face(look)}`]);'
assert _TEL in DATA_CONTACTS_JS, "Kontaktteil geändert: Telefonzeile nicht gefunden"
WIN_W, WIN_H = 1500, 940  # Fenster in pt, Aufnahme in 2x → 3000 × 1880
README_OUT = "/tmp/halo-readme-bilder"

# Uhr des Testprofils auf Freitag, 20.11.2026, 09:41 (Ortszeit) stellen, ohne die Systemuhr zu ändern: in jedem
# betroffenen Global ersetzt eine kleine Datei `Date` durch eine Fassung mit festem Abstand (läuft ab 09:41 weiter,
# damit Zeitgeber, die mit Date.now() rechnen, nicht stehen bleiben). Betroffen: Hauptfenster, eingebettete Seiten
# (about:3pane, Adressbuch), das gemeinsame Global der Module (cal.dtz.now() → Today Pane, Kalender, Agenda) und das
# Global der Erweiterung (Datum in den Karten, „now“/„in 2 hr“). Die Marionette-Sandbox behält die echte Uhr.
CLOCK_JS = r"""
const FIXED = new Date(2026, 10, 20, 9, 41, 0).getTime();
const OFF = FIXED - Date.now();
const uhrDatei = PathUtils.join(PathUtils.profileDir, "halo-uhr.js");
await IOUtils.writeUTF8(uhrDatei, `(function (g) { if (g.__haloUhr) return; const D = g.Date, off = ${OFF};
  const F = function Date(...a) { if (!new.target) return new D(D.now() + off).toString(); return a.length ? new D(...a) : new D(D.now() + off); };
  Object.setPrototypeOf(F, D); F.prototype = D.prototype; F.now = () => D.now() + off;
  Object.defineProperty(g, "Date", { value: F, writable: true, configurable: true }); g.__haloUhr = D; })(this);`);
const uhrUrl = PathUtils.toFileURI(uhrDatei);
const uhr = g => { try { if (!g) return "fehlt"; Services.scriptloader.loadSubScript(uhrUrl, g); return (g.wrappedJSObject || g).__haloUhr ? "ok" : "?"; }
  catch (e) { return String(e).slice(0, 80); } };
const haloGlobal = () => ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs").ExtensionParent
  .GlobalManager.getExtension("mail-cards@sebastian.local").experimentAPIManager.global;
const uhrAlle = () => { const r = { fenster: uhr(w), module: uhr(Cu.getGlobalForObject(cal)), halo: uhr(haloGlobal()) };
  tm.tabInfo.forEach((t, i) => { try { const b = t.chromeBrowser || t.browser; if (b?.contentWindow) r["tab" + i] = uhr(b.contentWindow); } catch {} });
  return r; };
"""

README_DATA_JS = CLOCK_JS + r"""
const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
// nur das Hauptfenster mit dem Mail-Tab (Begrüßung, Kontoeinrichtung u. Ä. zu)
for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
while (tm.tabInfo.length > 1) tm.closeTab(tm.tabInfo[tm.tabInfo.length - 1]);
w.moveTo(40, 60); w.resizeTo(@WIN_W@, @WIN_H@); await stabil(() => [w.outerWidth, w.outerHeight]);
const uhrStand = uhrAlle();
// zwei Konten (Personal, Work) ohne Server; „Lokale Ordner“ ausgeblendet, damit die Seitenleiste nur
// Favoriten und die zwei Konten zeigt
const konto = (user, host, pretty, email) => {
  const s = MailServices.accounts.createIncomingServer(user, host, "none"); s.prettyName = pretty;
  const id = MailServices.accounts.createIdentity(); id.fullName = "Alex Morgan"; id.email = email;
  const a = MailServices.accounts.createAccount(); a.incomingServer = s; a.addIdentity(id);
  const root = s.rootFolder;
  for (const [n, f] of [["Inbox", "Inbox"], ["Drafts", "Drafts"], ["Sent", "SentMail"], ["Archives", "Archive"], ["Trash", "Trash"]]) {
    if (!root.containsChildNamed(n)) root.createSubfolder(n, null);
    root.getChildNamed(n).setFlag(Ci.nsMsgFolderFlags[f]); }
  return a; };
const personal = konto("alex", "personal.example", "Personal", "alex@morgan.example");
const workAcc = konto("alex.morgan", "work.example", "Work", "alex@brightlane.example");
MailServices.accounts.defaultAccount = personal;
try { MailServices.accounts.localFoldersServer.hidden = true; } catch {}
await wait(800);  // Ordner anlegen (kein Fertig-Zeichen)
// Mails relativ zu Freitag 09:41 (Minuten davor); Anhang-Bild selbst gezeichnet
const date = min => new Date(FIXED - min * 60000).toUTCString().replace("GMT", "+0000");
const bild = (() => { const c = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = 320; c.height = 200; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 320, 200); gr.addColorStop(0, "#5E81F4"); gr.addColorStop(1, "#AF52DE"); g.fillStyle = gr; g.fillRect(0, 0, 320, 200);
  g.fillStyle = "rgba(255,255,255,0.9)"; for (const [x, s] of [[40, 64], [130, 48], [204, 32], [262, 20]]) { g.beginPath(); g.roundRect(x, 100 - s / 2, s, s, s * 0.22); g.fill(); }
  return c.toDataURL("image/png").split(",")[1]; })();
const att = n => n.endsWith(".png") ? ["image/png", bild] : [n.endsWith(".pdf") ? "application/pdf" : "application/zip", btoa("halo.spaces example " + n)];
const post = (folder, list, tag) => list.forEach(([from, subject, body, min, read, opt = {}], i) => {
  const text = `${body}\r\n\r\nBest,\r\n${from.split(" ")[0]}\r\n`;
  const content = opt.att ? `Content-Type: multipart/mixed; boundary="halo-${tag}${i}"\r\n\r\n--halo-${tag}${i}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n` +
      opt.att.map(n => `--halo-${tag}${i}\r\nContent-Type: ${att(n)[0]}; name="${n}"\r\nContent-Disposition: attachment; filename="${n}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n${att(n)[1]}\r\n`).join("") + `--halo-${tag}${i}--\r\n`
    : `Content-Type: text/plain; charset=UTF-8\r\n\r\n${text}`;
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(
    `From: ${from}\r\nTo: Alex Morgan <alex@morgan.example>\r\nSubject: ${subject}\r\nDate: ${date(min)}\r\n` +
    `Message-ID: <readme-${tag}${i}@example.invalid>\r\nMIME-Version: 1.0\r\n${content}\r\n`); });
const mailsP = [
  ["Mia Johnson <mia@northwind.example>", "Dinner tonight?", "Are we still on for dinner tonight? I booked a table for seven at the little place near the river.", 6, false, { star: true }],
  ["Studio North <team@studionorth.example>", "New icons for the app", "Hi Alex,\r\n\r\nhere are the new icons for the app. We kept them calm and simple. The preview shows all sizes on one sheet.", 24, true, { att: ["Icon preview.png", "App icons.zip"] }],
  ["Grace Lee <grace@lee.example>", "Coffee next week?", "It has been far too long. Do you have time for a coffee next week? Any morning works for me.", 58, false],
  ["SkyWay Air <trips@skyway.example>", "Your flight to Lisbon", "Your booking is confirmed. Online check-in opens one day before departure.", 95, true, { star: true, att: ["Boarding pass.pdf"] }],
  ["Ben Carter <ben@carter.example>", "Photos from the trip", "The photos from our trip are online now. The sunset at the lake turned out even better than I hoped.", 140, true],
  ["Weekly Notes <hello@weeklynotes.example>", "Five ideas for a calm week", "A short read for your weekend: five small ideas for a calmer, more focused week.", 700, true],
  ["Olivia Brown <olivia@brown.example>", "Book club: next meeting", "The next book club meets on Thursday. We are reading a short novel this time, so there is still time to join.", 1100, true],
  ["Daniel Kim <daniel@kim.example>", "Re: Garden project", "Sounds great. I can bring the tools on Saturday morning, around nine.", 1500, true],
  ["City Library <info@citylibrary.example>", "Your books are ready", "The books you reserved are ready for pickup at the front desk until next Tuesday.", 2300, true],
  ["Emma Davis <emma@davis.example>", "Quick question about the offer", "Could you send me the updated offer by Wednesday? Then I can share it with the team before our call.", 2900, true, { star: true }],
  ["Green Market <news@greenmarket.example>", "Fresh this week: apples and pumpkins", "Autumn is here: fresh apples, pumpkins and warm bread at the market every Saturday.", 3700, true],
  ["Noah Wilson <noah@wilson.example>", "Running on Sunday", "Same time as last week? Meet at the park entrance at eight.", 4600, true],
  ["Summit Outdoor <hello@summit.example>", "Your order is on its way", "Good news: your new hiking boots left our warehouse today and should arrive soon.", 5400, true],
  ["Sophia Martin <sophia@martin.example>", "Sketches for the poster", "Attached are three sketches for the poster. I like the second one best, what do you think?", 6800, true, { att: ["Poster sketches.pdf"] }],
];
const mailsW = [
  ["Lucas Meyer <lucas@meyer.example>", "Agenda for Monday", "Here is the agenda for Monday. Let me know if anything is missing.", 35, false],
  ["Emma Davis <emma@davis.example>", "Updated offer", "Thanks for the quick reply. The updated offer looks good to us.", 300, true],
  ["Studio North <team@studionorth.example>", "Plans for December", "Shall we plan the next round of icons for early December?", 1800, true],
  ["Noah Wilson <noah@wilson.example>", "Team lunch", "Team lunch is on Wednesday at half past twelve.", 3000, true],
];
const inboxOf = a => a.incomingServer.rootFolder.getChildNamed("Inbox");
post(inboxOf(personal), mailsP, "p"); post(inboxOf(workAcc), mailsW, "w");
await wait(800);  // Mails schreiben (kein Fertig-Zeichen)
for (const [a, list] of [[personal, mailsP], [workAcc, mailsW]]) { const f = inboxOf(a);
  for (const h of f.messages) { const m = list.find(x => x[1] == h.mime2DecodedSubject);
    if (m && m[4]) h.markRead(true); if (m?.[5]?.star) f.markMessagesFlagged([h], true); } }
""" + DATA_CONTACTS_JS.replace(_TEL, ' `PHOTO:${face(look)}`]);') + r"""
// Kalender (Personal, Work, Family) und Aufgaben im November 2026, Woche Mo 16. bis So 22.; heute Freitag, 20.
const mk = (name, color) => { const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = name; c.setProperty("color", color); cal.manager.registerCalendar(c); return c; };
const home = cal.manager.getCalendars().find(c => c.type == "storage") || mk("Personal", "#34C759");
home.name = "Personal"; home.setProperty("color", "#34C759"); home.setProperty("disabled", false);
const work = mk("Work", "#FF9500"), fam = mk("Family", "#AF52DE");
const t0 = cal.dtz.now();
const at = (dd, h, m = 0) => { const t = t0.clone(); t.year = 2026; t.month = 10; t.day = dd; t.hour = h; t.minute = m; t.second = 0; return t; };
const day = dd => { const t = at(dd, 0); t.isDate = true; return t; };
const ev = async (c, title, s, e, rrule) => { const x = new CalEvent(); x.title = title; x.startDate = s; x.endDate = e;
  if (rrule) { x.recurrenceInfo = new CalRecurrenceInfo(x); x.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule(rrule)); }
  return c.addItem(x); };
await ev(work, "Team meeting", at(2, 9, 30), at(2, 10, 30), "RRULE:FREQ=WEEKLY;COUNT=5");
await ev(home, "Yoga", at(3, 7), at(3, 8), "RRULE:FREQ=WEEKLY;COUNT=5");
await ev(home, "Tennis", at(5, 18), at(5, 19, 30), "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3");
await ev(fam, "Anna's birthday", day(3), day(4));
await ev(home, "Dentist", at(6, 8, 30), at(6, 9, 15));
await ev(work, "Flight to Lisbon", at(10, 7, 10), at(10, 9, 25));
await ev(work, "Workshop in Lisbon", day(10), day(13));
await ev(work, "Lunch with Ben", at(13, 12, 30), at(13, 13, 30));
await ev(home, "Haircut", at(14, 17), at(14, 17, 45));
await ev(fam, "Concert", at(17, 20), at(17, 22, 30));
await ev(work, "Call with the client", at(18, 15), at(18, 15, 45));
await ev(home, "Doctor", at(19, 11), at(19, 11, 30));
await ev(work, "Team stand-up", at(20, 9, 30), at(20, 10));
await ev(work, "Design review", at(20, 11, 45), at(20, 12, 30));
await ev(home, "Coffee with Grace", at(20, 16), at(20, 16, 45));
await ev(fam, "Dinner with Mia", at(20, 19), at(20, 21));
await ev(home, "Farmers market", at(21, 10), at(21, 11, 30));
await ev(fam, "Movie night", at(21, 20), at(21, 22));
await ev(home, "Run in the park", at(22, 8), at(22, 9));
await ev(fam, "Family brunch", at(22, 11), at(22, 13));
await ev(fam, "Shopping", at(24, 10), at(24, 11, 30));
await ev(home, "Gym", at(26, 18), at(26, 19));
await ev(fam, "Weekend trip", day(27), day(30));
const todo = async (c, title, due, opt = {}) => { const x = new CalTodo(); x.title = title; if (due) x.dueDate = due;
  if (opt.prio) x.priority = opt.prio; if (opt.text) x.setProperty("DESCRIPTION", opt.text); if (opt.done) x.isCompleted = true; return c.addItem(x); };
await todo(home, "Pay the electricity bill", at(20, 18), { prio: 1 });
await todo(home, "Pick up dry cleaning", at(20, 17));
await todo(work, "Prepare slides for Monday", at(23, 9), { text: "Ten slides at most. Start with the new icons, then the plans for December." });
await todo(home, "Book train tickets", at(21, 12));
await todo(fam, "Send photos to Ben", at(22, 20));
await todo(home, "Renew library card", at(18, 12), { done: true });
""" + DATA_WEATHER_JS + r"""
// Today Pane und Minikalender auf den festen Tag
try { w.TodayPane.setDay(cal.dtz.now()); } catch {}
for (const mm of d.querySelectorAll("calendar-minimonth")) { try { mm.showMonth(new Date(FIXED)); } catch {} }
await ruhig(1500);
return { uhr: uhrStand, heute: cal.dtz.now().icalString, mails: inboxOf(personal).getTotalMessages(false) + inboxOf(workAcc).getTotalMessages(false),
  kontakte: book.childCards.length, dpr: w.devicePixelRatio };
"""

# gemeinsame Hilfen der Szenen (Rechtecke in Koordinaten des Hauptfensters)
SCENE_JS = r"""
const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const personalInbox = () => MailServices.accounts.accounts.find(a => a.incomingServer.prettyName == "Personal").incomingServer.rootFolder.getChildNamed("Inbox");
const todayPane = async open => { if (w.TodayPane.isVisible != open) { d.getElementById("calendar_toggle_todaypane_command").doCommand(); await ruhig(1200); } };
const box = (el, off = { x: 0, y: 0 }) => { const r = el.getBoundingClientRect(); return { x: r.left + off.x, y: r.top + off.y, w: r.width, h: r.height }; };
const mailScene = async () => { const a3 = await toMail();
  try { a3.paneLayout.folderPaneVisible = true; } catch {}
  a3.displayFolder(personalInbox().URI); await bis(() => a3.gDBView?.rowCount > 0, "Mails im Posteingang");
  for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject == "New icons for the app") a3.threadTree.selectedIndex = i;
  await todayPane(true); await ruhig(2500); a3.threadTree.focus(); await ruhig(600); return a3; };
"""

# Szenen: name → (Datei, Art, JS). Art: window = ganzes Hauptfenster, crop = Ausschnitt (JS liefert das Rechteck),
# popup = Popup w.__shotPopup, other = anderes Fenster w.__shotWin
SCENES = {
    "mail-inbox": ("mail-inbox.png", "window", "await mailScene();"),
    "sender-pictures": ("sender-pictures.png", "crop", r"""
      const a3 = await mailScene(); const b = tm.tabInfo[0].chromeBrowser.getBoundingClientRect();
      return box(a3.document.getElementById("threadTree"), { x: b.left, y: b.top });"""),
    "today-pane": ("today-pane.png", "crop", r"""
      await mailScene(); return box(d.getElementById("today-pane-panel"));"""),
    # Suche oben rechts: Treffer in der Kartenliste mit Kopf „Searching … results“
    "search": ("search.png", "window", r"""
      const a3 = await toMail(); await todayPane(true);
      const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
      const input = bar.shadowRoot?.querySelector("input") || bar.querySelector("input");
      if (input) { input.value = "week"; }
      bar.dispatchEvent(new w.CustomEvent("search", { detail: "week", bubbles: true, composed: true })); await ruhig(3500);
      a3.threadTree.selectedIndex = 0; await ruhig(2500);"""),
    # Ausweich (--search-menu): offenes Vorschlagsmenü der Suche
    "search-menu": ("search.png", "window", r"""
      await mailScene();
      const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
      const input = bar.shadowRoot?.querySelector("input") || bar.querySelector("input");
      if (!input) throw new Error("Suchfeld fehlt");
      input.focus(); input.value = "wee"; input.dispatchEvent(new w.InputEvent("input", { bubbles: true, composed: true, data: "e", inputType: "insertText" }));
      await ruhig(2000);"""),
    "calendar-week": ("calendar-week.png", "window", r"""
      await toCalendar(); w.switchCalendarView("week", true); await ruhig(1500); w.currentView().goToDay(cal.dtz.now()); await ruhig(2000);"""),
    "calendar-month": ("calendar-month.png", "window", r"""
      await toCalendar(); w.switchCalendarView("month", true); await ruhig(1500); w.currentView().goToDay(cal.dtz.now()); await ruhig(2000);"""),
    # Schnellfenster „Neuer Termin“ mit Beispiel (wie ui_tour.py „kal-schnellfenster-beispiel“)
    "quick-event": ("quick-event.png", "popup", r"""
      await toCalendar(); w.switchCalendarView("week", true); await ruhig(800);
      const li = [...d.querySelectorAll(`#unifiedToolbarContent li[item-id="new-event"]`)].find(x => x.getBoundingClientRect().width > 0);
      if (!li) throw new Error("„+“ fehlt");
      li.querySelector("button").click();
      const p = await bis(() => (x => x?.state == "open" && x)(d.getElementById("mcQuickPanel")), "Schnellfenster offen");
      const f = p.__mc; f.title.value = "Team Lunch"; f.location.value = "Café Central";
      f.repeat.value = "WEEKLY"; f.repeat.dispatchEvent(new w.Event("change")); f.alert.value = "PT15M"; f.alert.dispatchEvent(new w.Event("change"));
      f.title.blur(); await ruhig(800); w.__shotPopup = p;"""),
    "tasks": ("tasks.png", "window", r"""
      tm.openTab("tasks", {}); await ruhig(2000);
      const tree = d.getElementById("calendar-task-tree");
      await until(() => tree?.view?.rowCount > 0, 5000);
      for (let i = 0; i < (tree?.view?.rowCount || 0); i++) { const it = tree.getTaskAtRow?.(i); if (it?.title == "Prepare slides for Monday") { tree.view.selection.select(i); break; } }
      await ruhig(2000);"""),
    "addressbook-contacts": ("addressbook-contacts.png", "window", r"""
      tm.openTab("addressBookTab", {}); await ruhig(2500);
      if (@TODAY_CLOSED@) await todayPane(false);
      const ab = tm.currentTabInfo.browser.contentWindow;
      const list = ab.document.getElementById("cards");
      for (let i = 0; i < (list?.view?.rowCount || 0); i++) { if (list.view.getCardFromRow(i)?.displayName == "Mia Johnson") { list.selectedIndex = i; break; } }
      await ruhig(2000);"""),
    # Begrüßung nach der Installation: Wetter und Chat (Ersatz durch Bereich eines Add-ons oder Webseite)
    "welcome": ("welcome.png", "other", r"""
      const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
      const g = ExtensionParent.GlobalManager.getExtension("mail-cards@sebastian.local").experimentAPIManager.global;
      Cu.evalInSandbox(`enhancer.openHaloWindow(Services.wm.getMostRecentWindow("mail:3pane"), { welcome: true });`, g);
      const sw = await bis(() => [...Services.wm.getEnumerator(null)].find(x => x.location?.href.startsWith("resource://mailcards/about/halo.html")
        && x.document.getElementById("fifth")), "Begrüßung offen", 8000);
      await ruhig(800);
      const btn = (sec, text) => [...sw.document.querySelectorAll(`#${sec} button`)].find(b => b.textContent == text);
      btn("weather", "Yes")?.click(); await ruhig(900);
      btn("fifth", "No")?.click(); await ruhig(900);
      w.__shotWin = sw;"""),
}
README_ORDER = ["mail-inbox", "sender-pictures", "mail-dark", "today-pane", "search", "calendar", "quick-event", "tasks",
                "addressbook-contacts", "welcome", "compose"]

WIN_INFO_JS = r"""
const tw = (@WHICH@) || w;
return { pid: Services.appinfo.processID, x: tw.screenX, y: tw.screenY, w: tw.outerWidth, h: tw.outerHeight,
         ix: tw.mozInnerScreenX, iy: tw.mozInnerScreenY, dpr: tw.devicePixelRatio };
"""
POPUP_INFO_JS = r"""
const p = w.__shotPopup; if (!p) return null;
const r = p.getOuterScreenRect(); return { state: p.state, x: r.left, y: r.top, w: r.width, h: r.height, pid: Services.appinfo.processID };
"""
# Ausweich ohne HiDPI (--snapshot): Fensterinhalt bzw. Rechteck in 2x per drawSnapshot (ohne Schatten, Ampel, Rand)
SNAP2_JS = r"""
const tw = (@WHICH@) || w, rc = @RECT@;
const bmp = await tw.browsingContext.currentWindowGlobal.drawSnapshot(rc ? new tw.DOMRect(rc.x, rc.y, rc.w, rc.h) : null, 2, "white");
const c = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = bmp.width; c.height = bmp.height;
c.getContext("2d").drawImage(bmp, 0, 0);
return c.toDataURL("image/png");
"""


def _ut():
    # Fensterliste der Test-PID und Zuschnitt von Popups aus dem Rundgang (erst bei Bedarf laden)
    import ui_tour
    return ui_tour


def cg_window(pid, info, popup=False):
    """Fenster-ID (CGWindowList) der Test-PID, deren Rahmen am besten zu info passt."""
    dist = lambda c: abs(c["x"] - info["x"]) + abs(c["y"] - info["y"]) + abs(c["w"] - info["w"]) + abs(c["h"] - info["h"])
    for _ in range(12):
        wins = [c for c in _ut().windows_of(pid) if c["w"] > 4 and c["h"] > 4 and (popup or c["layer"] == 0)]
        if popup:
            wins = [c for c in wins if c["layer"] > 0 or not c["name"]]
        wins.sort(key=dist)
        if wins and dist(wins[0]) <= 80:
            return wins[0]
        time.sleep(0.3)
    raise RuntimeError(f"kein passendes Fenster der Test-PID {pid} für {info}")


def screencapture(wid, path, shadow):
    # -x ohne Ton; ohne -o mit Schatten und durchsichtigem Rand (nur dieses Fenster, kein Schreibtisch)
    subprocess.run(["screencapture", "-x", *([] if shadow else ["-o"]), "-l", str(wid), path], check=True, timeout=30)


def sips_crop(path, x, y, cw, ch, out):
    subprocess.run(["sips", "-c", str(int(ch)), str(int(cw)), "--cropOffset", str(int(y)), str(int(x)), path, "--out", out],
                   check=True, capture_output=True, timeout=30)


def save_data_url(data, path):
    with open(path, "wb") as f:
        f.write(base64.b64decode(data.split(",", 1)[1]))


def readme_shot(m, args, name, out):
    """Eine Szene stellen und aufnehmen; liefert den Pfad."""
    file, kind, js = SCENES[name]
    path = os.path.join(out, file)
    rect = m.js(SCENE_JS + js.replace("@TODAY_CLOSED@", "true" if args.today_closed else "false") + "\nreturn null;")
    which = "w.__shotWin" if kind == "other" else "null"
    if kind == "popup":
        info = None
        for _ in range(20):
            info = m.js(POPUP_INFO_JS)
            if info and info["state"] == "open":
                break
            time.sleep(0.2)
        if not info or info["state"] != "open":
            raise RuntimeError("Popup nicht offen")
        win = cg_window(info["pid"], info, popup=True)
        screencapture(win["id"], path, shadow=False)
        _ut().crop_to_popup(path, info, _ut().windows_of(info["pid"]), cap=win)
        m.js("w.__shotPopup?.hidePopup?.(); w.__shotPopup = null; await ruhig(600); return 1;")
        return path
    if args.snapshot:
        save_data_url(m.js(SNAP2_JS.replace("@WHICH@", which).replace("@RECT@", json.dumps(rect if kind == "crop" else None))), path)
    else:
        info = m.js(WIN_INFO_JS.replace("@WHICH@", which))
        win = cg_window(info["pid"], info)
        if kind == "crop":
            tmp = path + ".ganz.png"
            screencapture(win["id"], tmp, shadow=False)
            scale = _ut().png_size(tmp)[0] / win["w"]
            ox, oy = info["ix"] - win["x"], info["iy"] - win["y"]
            sips_crop(tmp, (rect["x"] + ox) * scale, (rect["y"] + oy) * scale, rect["w"] * scale, rect["h"] * scale, path)
            os.remove(tmp)
        else:
            screencapture(win["id"], path, shadow=True)
    if kind == "other":
        m.js("try { w.__shotWin?.close(); } catch {} w.__shotWin = null; await ruhig(600); return 1;")
    return path


def readme_run(args, xpi, names, dark):
    """Ein Thunderbird-Lauf (hell oder dunkel) für die angegebenen Szenen."""
    profile = ht.create_profile(xpi, args.port, dark, prefix="halo-readme-")
    # Profil für Bilder: keine alte Designkopie der Prüfung „Design: alte Kopie“, Akzent fest auf Systemblau
    shutil.rmtree(os.path.join(profile, "chrome"), ignore_errors=True)
    try:
        os.remove(os.path.join(profile, "prefs.js"))
    except FileNotFoundError:
        pass
    with open(os.path.join(profile, "user.js"), "a") as f:
        f.write(f'user_pref("ui.accentcolor", "{"#0A84FF" if dark else "#007AFF"}");\n'
                'user_pref("ui.accentcolortext", "#FFFFFF");\n')
    proc = ht.start_thunderbird(ht.DEFAULT_TB, profile)
    done = []
    try:
        if not ht.wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)  # wie der Store-Weg: Hauptfenster muss stehen, bevor PRELUDE es greift
        m = ht.Marionette(args.port)
        m.cmd("WebDriver:SetTimeouts", {"script": 180000})
        # Start abwarten: Hauptfenster mit Mail-Tab bereit
        m.js('await bis(() => tm?.currentAbout3Pane?.document.readyState == "complete", "Mail-Tab", 60000); await ruhig(3000); return 1;')
        data = m.js(README_DATA_JS.replace("@WIN_W@", str(WIN_W)).replace("@WIN_H@", str(WIN_H)))
        print("Daten:", json.dumps(data, ensure_ascii=False), flush=True)
        if (data or {}).get("dpr", 1) < 2 and not args.snapshot:
            sys.exit(f"Bildschirm in {data.get('dpr')}x: 2x braucht einen Retina-/HiDPI-Bildschirm "
                     "(oder --snapshot: drawSnapshot in 2x ohne Schatten, Ampel und Fensterrand)")
        bad = [k for k, v in (data or {}).get("uhr", {}).items() if v != "ok"]
        if bad:
            print("Hinweis: Uhr nicht festgenagelt in", ", ".join(bad), flush=True)
        for name in names:
            scene = "mail-inbox" if name == "mail-dark" else name
            path = readme_shot(m, args, scene, args.out)
            if name == "mail-dark":
                os.replace(path, os.path.join(args.out, "mail-dark.png"))
                path = os.path.join(args.out, "mail-dark.png")
            w_, h_ = _ut().png_size(path)
            print(f"Bild: {path} ({w_} × {h_})", flush=True)
            done.append(path)
            if name == "search-menu":
                # Vorschlagsmenü als eigenes Fenster (Ebene > 0)? Dann zusätzlich für sich aufnehmen
                pid = m.js("return Services.appinfo.processID;")
                extra = [c for c in _ut().windows_of(pid) if c["layer"] > 0 and c["w"] > 40 and c["h"] > 40]
                if extra:
                    p2 = os.path.join(args.out, "search-popup.png")
                    screencapture(extra[0]["id"], p2, shadow=True)
                    print("Hinweis: Vorschlagsmenü ist ein eigenes Fenster, zusätzlich", p2, flush=True)
    finally:
        ht.stop_thunderbird(args.port, proc)
        shutil.rmtree(profile, ignore_errors=True)
    return done


def readme_names(args):
    """Szenen in Reihenfolge nach --only und den Optionen."""
    wanted = [x.strip() for x in args.only.split(",")] if args.only else list(README_ORDER)
    unknown = [x for x in wanted if x not in README_ORDER and x not in SCENES]
    if unknown:
        sys.exit("Unbekannte Bilder: " + ", ".join(unknown) + " (möglich: " + ", ".join(README_ORDER) + ")")
    names = []
    for x in wanted:
        if x == "compose":
            if args.compose or args.only:
                print("compose: wartet auf I6FHI (kein Bild)", flush=True)
            continue
        if x == "calendar":
            x = f"calendar-{args.calendar}"
        if x == "search" and args.search_menu:
            x = "search-menu"
        names.append(x)
    return names


def readme_main(args):
    if sys.platform != "darwin" and not args.snapshot:
        sys.exit("README-Bilder nur unter macOS (screencapture); sonst --snapshot")
    args.out = os.path.abspath(args.out or README_OUT)
    if (args.out + os.sep).startswith(ROOT + os.sep) and not args.ins_repo:
        sys.exit(f"--out {args.out} liegt im Repo: nur mit --ins-repo (Freigabe des Maintainers)")
    names = readme_names(args)
    light = [n for n in names if n != "mail-dark"]
    os.makedirs(args.out, exist_ok=True)
    xpi = find_xpi(args)
    done = []
    if light:
        done += readme_run(args, xpi, light, dark=False)
    if "mail-dark" in names:
        done += readme_run(args, xpi, ["mail-dark"], dark=True)
    print(f"Fertig: {len(done)} Bilder in {args.out}", flush=True)


def main():
    ap = argparse.ArgumentParser(description="Bilder für README und Store (Testprofil, erfundene Daten)")
    ap.add_argument("--port", type=int, default=2852)
    ap.add_argument("--xpi", default=None)
    ap.add_argument("--out", default=None, help=f"Zielordner (README: {README_OUT}, Store: /tmp/halo-store-bilder)")
    ap.add_argument("--store", action="store_true", help="bisherige Store-Bilder (store-*.png, 1280 × 759)")
    ap.add_argument("--dark", action="store_true", help="nur mit --store: dunkel (README: mail-dark kommt von selbst)")
    ap.add_argument("--only", default=None, help="README: nur diese Bilder, mit Komma getrennt (" + ", ".join(README_ORDER) + ")")
    ap.add_argument("--calendar", choices=["week", "month"], default="week", help="README: calendar-week.png oder calendar-month.png")
    ap.add_argument("--search-menu", action="store_true", help="README: search.png mit offenem Vorschlagsmenü statt Trefferliste")
    ap.add_argument("--today-closed", action="store_true", help="README: Today Pane für addressbook-contacts zu")
    ap.add_argument("--compose", action="store_true", help="README: Verfassen-Fenster (noch ohne Bild, wartet auf I6FHI)")
    ap.add_argument("--snapshot", action="store_true", help="README ohne HiDPI: drawSnapshot in 2x (ohne Schatten und Ampel)")
    ap.add_argument("--ins-repo", action="store_true", help="README: --out im Repo erlauben (nur nach Freigabe des Maintainers)")
    args = ap.parse_args()
    if args.store:
        store_main(args)
    else:
        if args.dark:
            sys.exit("--dark gilt nur mit --store; mail-dark entsteht im README-Weg von selbst")
        readme_main(args)


if __name__ == "__main__":
    main()
