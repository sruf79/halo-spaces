#!/usr/bin/env python3
"""Bilder für Store und README aus einem frischen Testprofil mit erfundenen,
englischen Beispieldaten (Mails, Kontakte, Termine) – nie echte Daten.

    python3 tests/store_shots.py --port 2852 [--dark] [--out /tmp/bilder]

Ergebnis: mail.png, search.png, calendar.png, addressbook.png in 1728 × 1024 (README) und
dieselben als store-*.png in 1280 × 759 (Store). Fenster 1620 × 960, das Bild
wird auf 1728 × 1024 hochgerechnet (passt auf den 1080-px-Bildschirm des Testrechners).
Dazu welcome.png (Begrüßung mit Wetter und Ersatz für Chat) in doppelter Auflösung.
"""

import argparse
import base64
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo_test as ht  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_JS = r"""
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


def main():
    ap = argparse.ArgumentParser(description="Bilder für Store und README (Testprofil, erfundene Daten)")
    ap.add_argument("--port", type=int, default=2852)
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--xpi", default=None)
    ap.add_argument("--out", default="/tmp/halo-store-bilder")
    args = ap.parse_args()
    import glob
    xpi = args.xpi or max((x for x in glob.glob(os.path.join(ROOT, "dist", "halo-spaces-*.xpi")) if not x.endswith("-atn.xpi")),
                          key=os.path.getmtime)
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


if __name__ == "__main__":
    main()
