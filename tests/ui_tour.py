#!/usr/bin/env python3
"""Rundgang durch (fast) die ganze Oberfläche von Thunderbird mit halo.spaces.

Startet Thunderbird wie tests/halo_test.py in einem frischen, temporären
Profil (keine echten Konten, keine echten Daten), legt erfundene Testdaten an
(Mails, Ordner, Kontakte, Termine, Aufgaben – alle Adressen @example.invalid)
und besucht jede Oberfläche aus der Tabelle SURFACES: Bereiche, Fenster,
Dialoge, Menüs/Popups und Zustände. Je Oberfläche entsteht ein Bild
<out>/<hell|dunkel>-<id>.png.

  Hauptfenster, Tabs, Unterdialoge, eigene Fenster:  WebDriver:TakeScreenshot
  Popups/Menüs/Panels (eigene Widgets) und
  Rückfragen (commonDialog):                         screencapture -l <Fenster-ID>,
      nur für Fenster, die nachweislich dem gestarteten Test-Thunderbird gehören
      (Fensterliste per CGWindowListCopyWindowInfo über osascript, gefiltert nach dessen PID)
  Menüleiste (macOS, nativ):                         nicht gestaltbar, kein Bild

Nach jeder Oberfläche wird aufgeräumt (Popups, Unterdialoge, Account Hub, Nebenfenster,
Tabs); was übrig bleibt, meldet der Rundgang als „Reste nach <id>“. Das Ergebnis steht
zusätzlich in <out>/<hell|dunkel>-ergebnis.json (Läufe mit --only werden eingemischt).

Aufruf:
  python3 tests/ui_tour.py --list                       # alle Oberflächen auflisten
  python3 tests/ui_tour.py --xpi dist/….xpi --port 2851 --out tests/shots/tour/vorher
  python3 tests/ui_tour.py --dark --port 2852 --out …   # dunkel
  python3 tests/ui_tour.py --area kalender --only kal-woche,kal-monat
  python3 tests/ui_tour.py --only lesen-text --probe 'return getComputedStyle(msgDoc().body).fontFamily;'
  python3 tests/ui_tour.py --inventar tests/inventar.md --fortschritt tests/fortschritt.md --out tests/shots/tour/vorher
Ausgabe je Oberfläche: „OK <id> → <bild>“ oder „NICHT ERREICHBAR <id> – <grund>“.
"""

import argparse
import base64
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo_test as ht  # noqa: E402  (Marionette, PRELUDE, Profil/Start/Ende)

ROOT = ht.ROOT
DEFAULT_OUT = os.path.join(ROOT, "tests", "shots", "tour", "aktuell")
MAIN_SIZE = (1500, 900)

# Bereiche in Prioritätsreihenfolge (zuerst, was man täglich sieht)
AREAS = [
    ("mailliste", "Mailliste", "chrome/userChrome.css (Thread-Liste, Karten), extension/api/implementation.js (Karten, Listenkopf)"),
    ("lesen", "Leseansicht und Mailkopf", "chrome/userChrome.css (Mailkopf, Anhänge, Hinweisleisten), extension/parts.css, extension/plaintext.css"),
    ("verfassen", "Verfassen", "chrome/userChrome.css (Verfassen-Fenster, Adresszeilen, Format-Leiste)"),
    ("ordner", "Ordnerliste, Toolbar, Suche, Bereiche-Leiste", "chrome/userChrome.css (Ordnerliste, Unified Toolbar, Spaces), implementation.js (Suche, Today-Knopf)"),
    ("menues", "Menüs und Kontextmenüs", "chrome/userChrome.css (Menüs & Popups); Menüleiste nativ (macOS)"),
    ("kalender", "Kalender und Today-Pane", "chrome/spaces.css (Kalender), implementation.js (Schnellfenster, Today-Pane)"),
    ("aufgaben", "Aufgaben", "chrome/spaces.css (Aufgaben)"),
    ("kontakte", "Adressbuch", "chrome/spaces.css (Adressbuch), implementation.js (Avatare, Bearbeiten)"),
    ("chat", "Chat", "chrome/spaces.css (Chat)"),
    ("einstellungen", "Einstellungen", "chrome/spaces.css (Einstellungen, Unterdialoge)"),
    ("konten", "Kontoeinstellungen und Kontoassistenten", "chrome/spaces.css (Kontoeinstellungen), chrome/userChrome.css (Dialoge)"),
    ("addons", "Add-ons und halo.spaces-Fenster", "chrome/spaces.css (about:addons), extension/about/, extension/options/"),
    ("dialoge", "Seltene Dialoge", "chrome/userChrome.css (Dialoge, commonDialog), chrome/spaces.css"),
]
AREA_KEYS = [a[0] for a in AREAS]

KINDS = ("bereich", "fenster", "dialog", "menue", "popup", "zustand")


# Chat-Konto am IRC-Testserver (Raum #halo) und OpenPGP-Testschlüssel für die Identität der Lokalen Ordner
SERVER_JS = r"""
  const { IMServices } = ChromeUtils.importESModule("resource:///modules/IMServices.sys.mjs");
  const { RNP } = ChromeUtils.importESModule("chrome://openpgp/content/modules/RNP.sys.mjs");
  const { EnigmailKeyRing } = ChromeUtils.importESModule("chrome://openpgp/content/modules/keyRing.sys.mjs");
  const { PgpSqliteDb2 } = ChromeUtils.importESModule("chrome://openpgp/content/modules/sqliteDb.sys.mjs");
  const out = {};
  tm.openTab("chat", {}); await wait(1500);
  const acc = IMServices.accounts.createAccount("halo@127.0.0.1", "prpl-irc");
  acc.setInt("port", %d); acc.setBool("ssl", false); acc.alias = "Halo";
  acc.connect();
  out.chat = !!(await until(() => acc.connected, 15000));
  const fields = acc.getChatRoomDefaultFieldValues(); fields.setValue("channel", "#halo"); acc.joinChat(fields);
  out.room = !!(await until(() => IMServices.conversations.getConversations().find(c => c.name == "#halo"), 10000));
  await toMail();
  for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
  const id = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer)?.identities[0];
  if (id) {
    await RNP.init();
    const keyId = await RNP.genKey(`${id.fullName || "Halo Test"} <${id.email || "halo@example.invalid"}>`, "ECC", 0, 0, "");
    EnigmailKeyRing.clearCache();
    const key = EnigmailKeyRing.getKeyById(keyId);
    await PgpSqliteDb2.acceptAsPersonalKey(key.fpr);
    id.setUnicharAttribute("openpgp_key_id", key.keyId);
    out.key = key.keyId;
  }
  return out;"""


def S(id, area, kind, title, open=None, cap="main", close=None, **kw):
    """Eine Oberfläche: id, Bereich, Art, Titel, JS zum Öffnen/Schließen, Aufnahmeart.

    cap: "main"   – Hauptfenster aufnehmen (Bereiche, Tabs, Zustände, Unterdialoge im Tab)
         "window" – neues Fenster aufnehmen (win = Teil der URL, falls mehrere aufgehen)
         "popup"  – offenes Popup per screencapture -l aufnehmen (open setzt w.__tourPopup)
         "native" – nicht aufnehmbar/gestaltbar (Grund in skip)
    skip: Grund, warum die Oberfläche nicht besucht wird
    size: Fenstergröße des Hauptfensters (Standard 1500×900)
    then: (URL-Teil, JS) – zweiter Schritt im (modalen) Fenster, das open geöffnet hat
    screen: Fenster per screencapture -l (mit Titelleiste) statt TakeScreenshot aufnehmen – für Fenster,
            deren Hintergrund macOS zeichnet (dunkel sonst nur eine weiße Fläche)
    after: JS nach dem Öffnen (bei Popups nach der Zeigerbewegung, wenn open {pointer: [x, y]} liefert;
           hover = Wartezeit in s), z. B. Tooltip suchen und als w.__tourPopup merken
    """
    assert area in AREA_KEYS and kind in KINDS, id
    return {"id": id, "area": area, "kind": kind, "title": title, "open": open, "cap": cap, "close": close, **kw}


# Hilfen für den Rundgang (Chrome-Kontext des Hauptfensters, nach PRELUDE)
TOUR_JS = r"""
const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const lf = () => MailServices.accounts.localFoldersServer.rootFolder;
const fld = path => path.split("/").reduce((f, n) => f.getChildNamed(n), lf());
const subj = h => h?.mime2DecodedSubject || h?.subject || "";
// Ordner zeigen (Mail-Tab), ohne Auswahl zu verändern
const show = async path => { const p = await toMail(); const f = fld(path); p.displayFolder(f.URI);
  await until(() => p.gFolder?.URI == f.URI && p.gDBView, 5000); await wait(700); return p; };
// Mail mit diesem Betreff auswählen und warten, bis sie angezeigt wird
const pick = async (path, text) => { const p = await show(path); const v = p.gDBView; let i = -1;
  for (let k = 0; k < v.rowCount; k++) if (subj(v.getMsgHdrAt(k)).includes(text) || v.getMsgHdrAt(k)?.messageId == text) { i = k; break; }
  // in einem zugeklappten Thread: Thread aufklappen
  if (i < 0) { const h = [...fld(path).messages].find(m => subj(m).includes(text) || m.messageId == text); if (h) i = v.findIndexOfMsgHdr(h, true); }
  if (i < 0) throw new Error("Mail fehlt: " + text);
  p.threadTree.selectedIndex = i; p.threadTree.scrollToIndex?.(i);
  await until(() => p.messageBrowser?.contentDocument?.getElementById("messagepane")?.contentDocument?.body?.textContent, 6000);
  await wait(900); return p; };
const hdr = (path, text) => { for (const h of fld(path).messages) if (subj(h).includes(text)) return h; throw new Error("Mail fehlt: " + text); };
const msgDoc = () => tm.currentAbout3Pane.messageBrowser.contentDocument;
const tabWin = () => tm.currentTabInfo.browser?.contentWindow;
const tabDoc = () => tm.currentTabInfo.browser?.contentDocument || tm.currentAbout3Pane?.document;
const cmd3 = name => tm.currentAbout3Pane.commandController.doCommand(name);
// modale Dialoge blockieren den Aufrufer – deshalb erst nach dem Skript öffnen
const later = fn => { w.setTimeout(() => { try { fn(); } catch (e) { console.error("Rundgang:", e); } }, 0); return { later: true }; };
const vis = el => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
// Maus-Ereignis an einem Element (ox/oy: Abstand von links oben, sonst Mitte bzw. 40 px)
const fire = (el, type, o = {}) => { const v = el.ownerDocument.defaultView; const r = el.getBoundingClientRect();
  const x = r.left + (o.ox ?? Math.min(r.width / 2, 40)), y = r.top + (o.oy ?? r.height / 2);
  el.dispatchEvent(new v.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: v, button: o.button ?? 0, buttons: o.buttons ?? 0,
    clientX: x, clientY: y, screenX: v.mozInnerScreenX + x, screenY: v.mozInnerScreenY + y })); };
const ctx = async (el, o = {}) => { el.scrollIntoView?.({ block: "nearest" });
  fire(el, "mousedown", { ...o, button: 2, buttons: 2 }); fire(el, "contextmenu", { ...o, button: 2, buttons: 2 }); fire(el, "mouseup", { ...o, button: 2 }); await wait(400); };
// Popup öffnen lassen, auf „open“ warten und für die Aufnahme merken
const pop = async (p, opener) => { const id = typeof p == "string" ? p : null;
  if (id) p = d.getElementById(id);
  if (opener) await opener(p);
  if (id && !p) p = await until(() => d.getElementById(id), 3000);
  if (!p) throw new Error("Popup fehlt");
  await until(() => p.state == "open", 4000); await wait(400);
  if (p.state != "open") throw new Error(`Popup ${p.id || p.className} nicht offen (${p.state})`);
  w.__tourPopup = p; return { popup: p.id || p.className }; };
// Kontextmenü an einem Element: Popup finden (aus dem Dokument des Elements) und öffnen
const ctxPop = async (popupId, el, o = {}) => { const p = el.ownerDocument.getElementById(popupId) || d.getElementById(popupId);
  if (!p) throw new Error("Popup fehlt: " + popupId);
  return pop(p, async () => { await ctx(el, o);
    if (!await until(() => p.state == "open" || p.state == "showing", 1200)) {
      // Menüs über das context-Attribut: wie ein Rechtsklick an derselben Stelle öffnen
      const v = el.ownerDocument.defaultView, r = el.getBoundingClientRect();
      const x = r.left + (o.ox ?? Math.min(r.width / 2, 40)), y = r.top + (o.oy ?? r.height / 2);
      const ev = new v.MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: x, clientY: y, screenX: v.mozInnerScreenX + x, screenY: v.mozInnerScreenY + y });
      Object.defineProperty(ev, "target", { value: el });
      p.openPopupAtScreen(Math.round(v.mozInnerScreenX + x), Math.round(v.mozInnerScreenY + y), true, ev); } }); };
const openBtnPop = async (popup, btn) => pop(popup, async () => { if (btn.localName == "menulist") btn.open = true; else popup.openPopup(btn, "after_start"); });
const toolbarItem = id => [...d.querySelectorAll(`#unifiedToolbarContent li[item-id="${id}"]`)].find(vis);
// eingeklappte Toolbar-Knöpfe sichtbar machen: Today-Pane zu und breites Fenster
const roomyToolbar = async () => { w.__tourTodayWas = w.TodayPane.isVisible; if (w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand();
  w.resizeTo(Math.min(w.screen.availWidth, 1728), 900); await wait(1500); };
const restoreToolbar = async () => { if (w.__tourTodayWas && !w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); w.__tourTodayWas = null; await wait(600); };
const rowOf = (doc, sel, text) => [...doc.querySelectorAll(sel)].find(r => r.textContent.includes(text));
// Fenster eines Typs, sobald es geladen ist
const winOf = (type, ms = 10000) => until(() => { const x = Services.wm.getMostRecentWindow(type); return x?.document.readyState == "complete" && x; }, ms);
const winUrl = (part, ms = 10000) => until(() => [...Services.wm.getEnumerator(null)].find(x => x.location.href.includes(part) && x.document.readyState == "complete"), ms);
// Verfassen-Fenster mit der Test-Identität (example.invalid, kein Server)
const compose = async (o = {}) => {
  const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
  const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
  const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
  fields.to = o.to ?? "Anna Beispiel <anna@example.invalid>"; fields.subject = o.subject ?? "Halo Entwurf";
  if (o.cc) fields.cc = o.cc;
  fields.body = o.body ?? (o.plain ? "Hallo Anna,\n\ndas ist ein Testentwurf.\n\nViele Grüße\nHalo" : "<p>Hallo Anna,</p><p>das ist ein <b>Testentwurf</b> mit einer Liste:</p><ul><li>Punkt eins</li><li>Punkt zwei</li></ul><p>Viele Grüße<br>Halo</p>");
  params.composeFields = fields; params.identity = acc.identities[0];
  params.format = o.plain ? Ci.nsIMsgCompFormat.PlainText : Ci.nsIMsgCompFormat.HTML;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const cw = await until(() => { const x = Services.wm.getMostRecentWindow("msgcompose"); return x?.document.readyState == "complete" && x.gMsgCompose && x; }, 12000);
  if (!cw) throw new Error("Verfassen-Fenster nicht offen");
  await wait(1800); return cw; };
// Termin/Aufgabe eines beliebigen Kalenders nach Titel
const anyItem = async title => { for (const c of cal.manager.getCalendars()) { try {
  const it = (await c.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null)).find(i => i.title == title); if (it) return it; } catch {} }
  throw new Error("Eintrag fehlt: " + title); };
const calNamed = name => cal.manager.getCalendars().find(c => c.name == name);
const toTasks = async () => { tm.openTab("tasks", {}); await wait(1500); };
const toBook = async () => { tm.openTab("addressBookTab", {}); await until(() => tm.currentTabInfo.browser?.contentWindow?.cardsPane, 6000); await wait(1200); return tm.currentTabInfo.browser.contentWindow; };
const bookRow = (ab, name) => [...ab.document.querySelectorAll("#books li")].find(li => li.querySelector(":scope > .bookRow-container .bookRow-name, :scope > div .name, .name")?.textContent.trim() == name || li.textContent.trim().startsWith(name));
const selectCard = async (ab, name) => { const list = ab.document.getElementById("cards");
  const i = [...Array(list.view.rowCount).keys()].find(k => list.view.getCardFromRow(k)?.displayName == name);
  if (i == null) throw new Error("Kontakt fehlt: " + name); list.selectedIndex = i; await wait(1000); return i; };
const prefs = async (pane, frac) => { w.openPreferencesTab(pane); await until(() => tabWin()?.gLastCategory?.category == pane || tabDoc()?.querySelector(`#categories richlistitem[value="${pane}"][selected]`), 6000); await wait(1500);
// Scrollbereich: TB 158 scrollt #preferencesContainer statt .main-content
  if (frac != null) { const sc = [tabDoc().querySelector(".main-content"), tabDoc().getElementById("preferencesContainer")].find(e => e && e.scrollHeight > e.clientHeight + 20) || tabDoc().querySelector(".main-content"); sc.scrollTop = Math.round(frac * (sc.scrollHeight - sc.clientHeight)); await wait(500); }
  return tabWin(); };
// Unterdialog (SubDialog) im Tab-Dokument: warten, bis er geladen ist
const subFrame = async (doc, ms = 6000) => { const f = await until(() => [...doc.querySelectorAll(".dialogFrame")].find(fr => fr.contentDocument?.readyState == "complete" && fr.contentDocument.location.href != "about:blank"), ms);
  if (!f) throw new Error("Unterdialog nicht offen"); await wait(1200); return f.contentWindow; };
const abDialog = async fn => { const ab = await toBook(); later(() => fn(ab)); return subFrame(ab.document); };
const subDialog = async (pane, btnId) => { const cw = await prefs(pane); const b = cw.document.getElementById(btnId);
  if (!b) throw new Error("Knopf fehlt: " + btnId); b.scrollIntoView({ block: "center" }); b.click();
  return subFrame(cw.document); };
const accountPage = async (page) => { w.MsgAccountManager(null); const aw = await until(() => tm.currentTabInfo.browser?.contentWindow?.document.getElementById("accounttree") && tm.currentTabInfo.browser.contentWindow, 8000);
  await wait(1200); if (page) { const tree = aw.document.getElementById("accounttree");
    const li = [...tree.querySelectorAll("li")].find(l => (l.getAttribute("PageTag") || "") == page);
    if (!li) throw new Error("Kontoseite fehlt: " + page); tree.selectedIndex = tree.rows.indexOf(li); await wait(1800); }
  return aw; };
// Account Hub (neue Konto-/Adressbuch-Assistenten als <dialog> im Hauptfenster)
const hubDialog = () => [...d.querySelectorAll("account-hub-container")].map(c => c.shadowRoot?.querySelector("dialog")).find(x => x?.open);
const hubInputs = () => { const out = []; const walk = r => { for (const e of r.querySelectorAll("*")) { if (e.localName == "input") out.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
  for (const c of d.querySelectorAll("account-hub-container")) if (c.shadowRoot) walk(c.shadowRoot); return out; };
const prompt = (fn) => later(() => fn(Services.prompt, w.browsingContext, Ci.nsIPrompt.MODAL_TYPE_WINDOW));
// erfundene Mail nur für eine Oberfläche (Message-ID halo-temp-…): wird beim Aufräumen wieder gelöscht,
// damit Liste und Ordner der übrigen Bilder gleich bleiben
const tempMail = async (path, o) => { const f = fld(path); const id = `halo-temp-${o.key}@example.invalid`;
  let h = [...f.messages].find(m => m.messageId == id);
  if (!h) {
    const head = [`From: ${o.from ?? "Anna Beispiel <anna@example.invalid>"}`, `To: ${o.to ?? "Halo Test <halo@example.invalid>"}`, `Subject: ${o.subject}`,
      `Date: ${new Date(Date.now() - 5 * 60000).toUTCString()}`, `Message-ID: <${id}>`, ...(o.headers || []), "MIME-Version: 1.0", `Content-Type: ${o.type ?? "text/plain; charset=UTF-8"}`];
    f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(unescape(encodeURIComponent(head.join("\r\n") + "\r\n\r\n" + o.body + "\r\n\r\n")));
    h = await until(() => [...f.messages].find(m => m.messageId == id), 4000);
    if (!h) throw new Error("Testmail fehlt: " + o.subject);
  }
  return h; };
const dropTempMails = async () => { const hs = [];
  for (const f of lf().descendants) { try { for (const m of f.messages) if (m.messageId?.startsWith("halo-temp-")) hs.push(m); } catch {} }
  if (!hs.length) return 0;
  // Auswahl lösen, sonst rückt die nächste Mail nach und wird als gelesen markiert
  for (const t of tm.tabInfo) { try { const p = t.chromeBrowser?.contentWindow; if (p?.gDBView?.hdrForFirstSelectedMessage?.messageId?.startsWith("halo-temp-")) p.threadTree.selectedIndex = -1; } catch {} }
  await wait(300);
  for (const f of new Set(hs.map(h => h.folder))) f.deleteMessages(hs.filter(h => h.folder == f), null, true, false, null, false);
  await wait(500); return hs.length; };
// Kalender-Einladung (iMIP, METHOD:REQUEST) an die Test-Identität – nur ansehen, keinen Knopf auslösen (würde antworten)
const inviteMail = () => { const ics = (days, h) => { const t = new Date(); t.setDate(t.getDate() + days); t.setHours(h, 0, 0, 0); return t.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); };
  const b = "----=_halo_einladung";
  const vcal = ["BEGIN:VCALENDAR", "PRODID:-//Halo//Rundgang//DE", "VERSION:2.0", "METHOD:REQUEST", "BEGIN:VEVENT", "UID:halo-temp-einladung@example.invalid",
    `DTSTAMP:${ics(0, 8)}`, `DTSTART:${ics(3, 10)}`, `DTEND:${ics(3, 11)}`, "SUMMARY:Workshop Gestaltung", "LOCATION:Raum 2.01",
    "ORGANIZER;CN=Anna Beispiel:mailto:anna@example.invalid",
    "ATTENDEE;CN=Halo Test;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:halo@example.invalid",
    "ATTENDEE;CN=Anna Beispiel;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:anna@example.invalid", "SEQUENCE:0", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return tempMail("Inbox", { key: "einladung", subject: "Einladung: Workshop Gestaltung", type: `multipart/alternative; boundary="${b}"`,
    body: `--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nAnna Beispiel lädt dich zum Workshop Gestaltung ein (erfundene Einladung).\r\n`
      + `--${b}\r\nContent-Type: text/calendar; charset=UTF-8; method=REQUEST\r\n\r\n${vcal}\r\n--${b}--` }); };
const showInvite = async () => { await inviteMail(); await pick("Inbox", "Workshop Gestaltung"); const md = msgDoc();
  if (!await until(() => vis(md.getElementById("imip-bar")), 6000)) throw new Error("keine Einladungsleiste"); await wait(600); return md; };
// Bitte um Empfangsbestätigung (Disposition-Notification-To) – Leiste nur ansehen, sonst würde gesendet
const mdnMail = () => tempMail("Inbox", { key: "mdn", subject: "Bitte um Bestätigung: Vertragsentwurf", headers: ["Disposition-Notification-To: Anna Beispiel <anna@example.invalid>"],
  body: "Hallo,\r\n\r\nbitte kurz bestätigen, dass der Entwurf angekommen ist (erfundene Testnachricht).\r\n\r\nAnna" });
// HTML-Mail mit Formular und fremdem Ziel: Thunderbird warnt vor Betrug (maybeScam)
const scamMail = () => tempMail("Inbox", { key: "betrug", from: "Kontoservice <service@example.invalid>", subject: "Konto bestätigen (Formular-Test)", type: "text/html; charset=UTF-8",
  body: "<html><body><p>Bitte bestätigen Sie Ihr Konto (erfundene Testnachricht).</p><form action='https://example.invalid/login' method='post'><input name='benutzer'> <input type='submit' value='Bestätigen'></form></body></html>" });
const noteOf = (doc, value) => until(() => doc.querySelector(`notification-message[value="${value}"]`), 6000);
const noteBtn = n => n?.querySelector("button") || n?.shadowRoot?.querySelector("button");
// verschiedene Testdateien im Profilordner anhängen (Anhänge mit gleicher URL fasst Thunderbird zusammen)
const attachFiles = async (cw, names) => { const atts = [];
  for (const n of names) { const path = PathUtils.join(PathUtils.profileDir, n); if (!await IOUtils.exists(path)) await IOUtils.writeUTF8(path, "Erfundene Testdatei " + n + "\n");
    const a = Cc["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment); a.url = PathUtils.toFileURI(path); a.name = n; a.size = 30; atts.push(a); }
  cw.AddAttachments(atts); if (!await until(() => cw.gAttachmentBucket?.itemCount >= names.length, 4000)) throw new Error("Anhänge fehlen"); await wait(1200); };
// Termin-Dialog (Fenster) und sein Inhalt (iframe)
const eventDialog = async () => { await toCalendar(); w.switchCalendarView("week"); w.createEventWithDialog(testCalendar(), null, null, "Neuer Testtermin");
  const dw = await winUrl("calendar-event-dialog"); if (!dw) throw new Error("Termin-Dialog nicht offen"); await wait(2500);
  return { dw, iw: dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow || dw }; };
// Schnellfenster „Neuer Termin“ von halo.spaces mit aufgeklappten Details (Beginn, Ende, Wiederholen …)
const quickPanel = async () => { await toCalendar(); w.switchCalendarView("week"); await wait(800); const li = toolbarItem("new-event"); if (!li) throw new Error("„+“ fehlt");
  await pop("mcQuickPanel", () => li.querySelector("button").click()); const f = d.getElementById("mcQuickPanel").__mc;
  if (!f) throw new Error("Schnellfenster ohne Felder"); if (!vis(f.startDate)) { f.summary.click(); await wait(600); } return f; };
// Mauszeiger auf die Mitte eines Elements (Rückgabe für den Rundgang: Marionette bewegt den Zeiger im Hauptfenster,
// Rahmen wie about:3pane werden eingerechnet) – für Hover-Zustände und Tooltips. Merkt sich jeden Tooltip, der danach
// aufgeht: Knöpfe mit title nutzen den Standard-Tooltip des Dokuments (anonymer Inhalt, per querySelector unsichtbar)
const hoverAt = el => { el.scrollIntoView?.({ block: "nearest" }); const r = el.getBoundingClientRect(); let x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let v = el.ownerGlobal; v && v != w; ) { const fr = v.browsingContext?.embedderElement; if (!fr) break; const o = fr.getBoundingClientRect(); x += o.left; y += o.top; v = fr.ownerGlobal; }
  w.__tourTip = null;
  for (const dd of new Set([d, el.ownerDocument])) if (!dd.__tourTipWatch) { dd.__tourTipWatch = true;
    dd.addEventListener("popupshown", e => { if (e.originalTarget?.localName == "tooltip") w.__tourTip = e.originalTarget; }, true); }
  return { pointer: [Math.round(x), Math.round(y)] }; };
// offener Tooltip (nach dem Bewegen des Zeigers) für die Aufnahme merken
const openTip = async (ms = 4000) => { const tip = await until(() => (w.__tourTip?.state == "open" && w.__tourTip) || [d, tm.currentAbout3Pane?.document].filter(Boolean)
    .flatMap(x => [...x.querySelectorAll("tooltip")]).find(t => t.state == "open"), ms);
  if (!tip) throw new Error("Tooltip nicht offen"); await wait(300); w.__tourPopup = tip; return { popup: tip.id || (tip.hasAttribute("default") ? "Standard-Tooltip" : tip.className) }; };
// Schnellfilter: Text ins Suchfeld der Leiste tippen (Feld bleibt fokussiert)
const qfbText = async (p, text) => { const inp = p.document.getElementById("qfb-qs-textbox")?.shadowRoot?.querySelector("input");
  if (!inp) throw new Error("Suchfeld der Schnellfilter-Leiste fehlt"); inp.focus(); inp.value = text;
  inp.dispatchEvent(new p.InputEvent("input", { bubbles: true, composed: true })); await wait(1500); return inp; };
const qfbOpen = async () => { const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_toggleQuickFilterBar"); await wait(800);
  if (!vis(p.document.getElementById("quick-filter-bar"))) throw new Error("Schnellfilter-Leiste nicht sichtbar"); return p; };
// Termin mit fälliger Erinnerung im Kalender „Halo Test“ (öffnet das Erinnerungsfenster; beim Schließen wieder löschen)
const addAlarm = async () => { const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs"); const { CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs");
  const e = new CalEvent(); e.title = "Erinnerung Test"; const s = cal.dtz.now(); s.minute += 10; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
  const a = new CalAlarm(); a.related = Ci.calIAlarm.ALARM_RELATED_START; a.offset = cal.createDuration("-PT15M"); a.action = "DISPLAY"; e.addAlarm(a);
  w.__tourAlarm = await testCalendar().addItem(e); };
const dropAlarm = async () => { if (w.__tourAlarm) { try { await testCalendar().deleteItem(w.__tourAlarm); } catch {} w.__tourAlarm = null; } await wait(500); };
"""

# erfundene Testdaten (alle Adressen @example.invalid) – wird beim Start einmal ausgeführt
DATA_JS = r"""
  const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
  const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
  const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
  const out = {};
  // Konto „Local Folders“ mit Test-Identität (ohne Server)
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const server = MailServices.accounts.localFoldersServer;
  const acc = MailServices.accounts.findAccountForServer(server);
  if (!acc.identities.length) {
    const id = MailServices.accounts.createIdentity();
    id.fullName = "Halo Test"; id.email = "halo@example.invalid";
    acc.addIdentity(id);
  }
  const root = server.rootFolder;
  const folder = path => { let f = root;
    for (const name of path.split("/")) { if (!f.containsChildNamed(name)) f.createSubfolder(name, null); f = f.getChildNamed(name); }
    return f; };
  const bytes = s => unescape(encodeURIComponent(s));  // UTF-8 als Bytefolge für addMessage
  const pad = n => String(n).padStart(2, "0");
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const tz = dt => { const o = -dt.getTimezoneOffset(); return (o >= 0 ? "+" : "-") + pad(Math.floor(Math.abs(o) / 60)) + pad(Math.abs(o) % 60); };
  const rfc = dt => `${DAYS[dt.getDay()]}, ${pad(dt.getDate())} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:00 ${tz(dt)}`;
  // vor „days“ Tagen um h:min (heute höchstens 20 Minuten vor jetzt)
  const ago = (days, h = 9, min = 0) => { const dt = new Date(); dt.setDate(dt.getDate() - days); dt.setHours(h, min, 0, 0);
    if (dt > new Date()) dt.setTime(Date.now() - 20 * 60000); return dt; };
  let seq = 0;
  const mail = o => {
    seq++;
    const id = o.id || `halo-tour-${seq}@example.invalid`;
    const h = [`From: ${o.from}`, `To: ${o.to || "Halo Test <halo@example.invalid>"}`, ...(o.cc ? [`Cc: ${o.cc}`] : []),
      `Subject: ${o.subject}`, `Date: ${rfc(o.date)}`, `Message-ID: <${id}>`,
      ...(o.reply ? [`In-Reply-To: <${o.reply.at(-1)}>`, `References: ${o.reply.map(r => `<${r}>`).join(" ")}`] : []),
      ...(o.headers || []), "MIME-Version: 1.0"];
    const text = o.text || "Hallo,\r\n\r\ndas ist eine erfundene Testnachricht.\r\n\r\nViele Grüße\r\nHalo";
    let body;
    if (o.attach) {
      const b = "----=_halo_" + seq;
      h.push(`Content-Type: multipart/mixed; boundary="${b}"`);
      body = `--${b}\r\nContent-Type: ${o.html ? "text/html" : "text/plain"}; charset=UTF-8\r\n\r\n${o.html || text}\r\n`;
      for (const [name, type, data] of o.attach)
        body += `--${b}\r\nContent-Type: ${type}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${data}\r\n`;
      body += `--${b}--\r\n`;
    } else if (o.html) {
      h.push("Content-Type: text/html; charset=UTF-8"); body = o.html + "\r\n";
    } else {
      h.push("Content-Type: text/plain; charset=UTF-8; format=flowed"); body = text + "\r\n";
    }
    return { raw: bytes(h.join("\r\n") + "\r\n\r\n" + body + "\r\n"), id, o };
  };
  // kleine erfundene Anhänge
  const PDF = btoa("%PDF-1.4\n% erfundene Testdatei\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const TXT = btoa("Erfundene Notizen\nZeile 2\n");
  const add = async (f, list) => {
    if (f.getTotalMessages(false)) return 0;
    const lfo = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
    for (const m of list) lfo.addMessage(m.raw);
    await wait(300);
    // Status: gelesen, markiert, Schlagwort, Junk
    const db = f.msgDatabase;
    for (const m of list) {
      const hd = db.getMsgHdrForMessageID(m.id);
      if (!hd) continue;
      if (m.o.read !== false) f.markMessagesRead([hd], true);
      if (m.o.flag) f.markMessagesFlagged([hd], true);
      if (m.o.tag) f.addKeywordsToMessages([hd], m.o.tag);
      if (m.o.junk) f.setJunkScoreForMessages([hd], "100", "user", 100);
    }
    return list.length;
  };
  const T = "Projektplanung Q4";
  const longName = "Dr. Maximilian Alexander von Langenname-Überlänge";
  out.inbox = await add(folder("Inbox"), [
    mail({ from: "Anna Beispiel <anna@example.invalid>", cc: "Ben Muster <ben@example.invalid>", subject: "Treffen am Donnerstag", date: ago(0, 9, 41), read: false, text: "Hallo,\r\n\r\npasst dir Donnerstag um 10 Uhr? Ich bringe die Unterlagen mit.\r\n\r\nLiebe Grüße\r\nAnna" }),
    mail({ from: "Ben Muster <ben@example.invalid>", subject: T, date: ago(6, 8, 15), id: "halo-thread-1@example.invalid", text: "Hier ist der erste Entwurf der Planung." }),
    mail({ from: "Anna Beispiel <anna@example.invalid>", subject: "Re: " + T, date: ago(5, 10, 2), id: "halo-thread-2@example.invalid", reply: ["halo-thread-1@example.invalid"], text: "Danke, sieht gut aus.\r\n\r\n> Hier ist der erste Entwurf der Planung." }),
    mail({ from: "Carla Ölmann <carla@example.invalid>", subject: "Re: " + T, date: ago(4, 16, 30), id: "halo-thread-3@example.invalid", reply: ["halo-thread-1@example.invalid", "halo-thread-2@example.invalid"], read: false, text: "Ich ergänze noch die Zahlen für November." }),
    mail({ from: "Ben Muster <ben@example.invalid>", subject: "Re: " + T, date: ago(0, 7, 55), id: "halo-thread-4@example.invalid", reply: ["halo-thread-1@example.invalid", "halo-thread-3@example.invalid"], read: false, flag: true, text: "Finale Version im Anhang.", attach: [["Planung-Q4.pdf", "application/pdf", PDF]] }),
    mail({ from: "Halo Neuigkeiten <news@example.invalid>", subject: "Neu im Oktober: Herbstangebote und Tipps für ruhige Abende", date: ago(1, 7, 0), read: false,
           headers: ["List-ID: Halo Neuigkeiten <news.example.invalid>", "List-Unsubscribe: <https://example.invalid/abmelden?id=1>, <mailto:abmelden@example.invalid?subject=unsubscribe>"],
           html: "<html><body style='font-family: Helvetica, Arial, sans-serif; background:#f4f4f4; margin:0'><table width='100%' cellpadding='0' cellspacing='0'><tr><td align='center'><table width='560' style='background:#ffffff; margin:24px 0; border-radius:8px'><tr><td style='padding:32px'><h1 style='font-size:24px; margin:0 0 12px'>Herbst bei Halo</h1><p style='font-size:15px; line-height:1.5; color:#333'>Ruhige Farben, warme Getränke und neue Ideen für lange Abende. Dies ist ein erfundener Newsletter.</p><p><a href='https://example.invalid/angebote' style='display:inline-block; background:#0a84ff; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none'>Zu den Angeboten</a></p><p style='font-size:12px; color:#888'>Sie erhalten diese Mail, weil Sie sich angemeldet haben. <a href='https://example.invalid/abmelden'>Abmelden</a></p></td></tr></table></td></tr></table></body></html>" }),
    mail({ from: `${longName} <maximilian.von.langenname@example.invalid>`, subject: "Eine sehr lange Betreffzeile, die garantiert nicht in die Liste passt, weil sie wirklich außergewöhnlich viele Wörter enthält – und noch mehr", date: ago(1, 11, 20), text: "Kurzer Inhalt." }),
    mail({ from: "rechnung@example.invalid", subject: "Ihre Rechnung Nr. 2026-1042", date: ago(2, 13, 5), attach: [["Rechnung-2026-1042.pdf", "application/pdf", PDF]], tag: "$label1" }),
    mail({ from: "Fotoclub Ähren <fotos@example.invalid>", subject: "Bilder vom Ausflug", date: ago(2, 18, 40), flag: true, html: "<html><body><p>Hier die Bilder vom Samstag:</p><p><img src='https://example.invalid/foto1.jpg' alt='Ausflug' width='320' height='200'></p><p>Viel Spaß!</p></body></html>", attach: [["Ausflug-01.png", "image/png", PNG], ["Ausflug-02.png", "image/png", PNG], ["Notizen.txt", "text/plain", TXT]] }),
    mail({ from: "Dana Zöllner <dana@example.invalid>", to: "Halo Test <halo@example.invalid>, Anna Beispiel <anna@example.invalid>, Ben Muster <ben@example.invalid>, Carla Ölmann <carla@example.invalid>, Emil Kurz <emil@example.invalid>, Frieda Lang <frieda@example.invalid>, Gustav Weit <gustav@example.invalid>", cc: "Hannah Mehr <hannah@example.invalid>, Ida Viel <ida@example.invalid>", subject: "Einladung: Sommerfest – bitte bis Freitag zusagen", date: ago(3, 9, 12), read: false, tag: "$label4" }),
    mail({ from: "Kalender <kalender@example.invalid>", subject: "Erinnerung: Zahnarzt morgen 14:00", date: ago(3, 7, 30) }),
    mail({ from: "Shop Beispiel <shop@example.invalid>", subject: "Versendet: Ihr Paket ist unterwegs", date: ago(4, 12, 0), html: "<html><body><h2>Ihr Paket ist unterwegs</h2><p>Sendungsnummer: <b>HALO-0000-TEST</b></p><table border='1' cellpadding='6' style='border-collapse:collapse'><tr><th>Artikel</th><th>Menge</th></tr><tr><td>Teetasse</td><td>2</td></tr><tr><td>Kerze</td><td>1</td></tr></table></body></html>" }),
    mail({ from: "Emil Kurz <emil@example.invalid>", subject: "Kurz", date: ago(5, 15, 45), text: "Ok." }),
    mail({ from: "Frieda Lang <frieda@example.invalid>", subject: "Urlaubsvertretung vom 3. bis 14. November", date: ago(7, 10, 10), tag: "$label2" }),
    mail({ from: "Gustav Weit <gustav@example.invalid>", subject: "Fwd: Unterlagen für die Steuererklärung", date: ago(9, 17, 0), attach: [["Belege-2025.pdf", "application/pdf", PDF]] }),
    mail({ from: "Sicherheit <security@example.invalid>", subject: "Neue Anmeldung bei Ihrem Konto", date: ago(10, 22, 3), junk: true, read: false }),
    mail({ from: "Hannah Mehr <hannah@example.invalid>", subject: "Buchempfehlung", date: ago(12, 19, 30), text: "Lies mal „Die Kunst der Stille“ – erfunden, aber schön." }),
    mail({ from: "Ida Viel <ida@example.invalid>", subject: "Fragen zum Angebot", date: ago(15, 8, 0), flag: true, read: false }),
    mail({ from: "Verein Grünfläche <verein@example.invalid>", subject: "Protokoll der Mitgliederversammlung", date: ago(20, 20, 0), attach: [["Protokoll.pdf", "application/pdf", PDF]] }),
    mail({ from: "Jonas Ärmel <jonas@example.invalid>", subject: "Geburtstagsfeier am Samstag", date: ago(25, 12, 0), text: "Kommst du? Es gibt Kuchen." }),
    mail({ from: "Anna Beispiel <anna@example.invalid>", subject: "Folien für die Präsentation", date: ago(32, 9, 0), attach: [["Folien.pdf", "application/pdf", PDF]] }),
    mail({ from: "Ben Muster <ben@example.invalid>", subject: "Mittagessen?", date: ago(40, 11, 30) }),
    mail({ from: "Bank Beispiel <service@example.invalid>", subject: "Ihr Kontoauszug ist verfügbar", date: ago(60, 6, 0), tag: "$label3" }),
    mail({ from: "Carla Ölmann <carla@example.invalid>", subject: "Rückblick auf das Jahr", date: ago(200, 18, 0) }),
    mail({ from: "Lea Alt <lea@example.invalid>", subject: "Alte Nachricht aus dem Vorjahr", date: ago(400, 9, 0) }),
  ]);
  const me = "Halo Test <halo@example.invalid>";
  out.sent = await add(folder("Sent"), [
    mail({ from: me, to: "Anna Beispiel <anna@example.invalid>", subject: "Re: Treffen am Donnerstag", date: ago(0, 10, 2), text: "Passt, bis Donnerstag!" }),
    mail({ from: me, to: "Ben Muster <ben@example.invalid>", subject: "Unterlagen", date: ago(3, 14, 0), attach: [["Unterlagen.pdf", "application/pdf", PDF]] }),
  ]);
  out.drafts = await add(folder("Drafts"), [
    mail({ from: me, to: "Carla Ölmann <carla@example.invalid>", subject: "Entwurf: Ideen für 2027", date: ago(1, 21, 0), headers: ["X-Mozilla-Draft-Info: internal/draft; vcard=0; receipt=0; DSN=0; uuencode=0; attachmentreminder=0; deliveryformat=4"] }),
  ]);
  out.archive = await add(folder("Archives"), [mail({ from: "Anna Beispiel <anna@example.invalid>", subject: "Archiviert: Jahresplanung 2025", date: ago(300, 9, 0) })]);
  out.news = await add(folder("Newsletter"), [
    mail({ from: "Wochenpost <post@example.invalid>", subject: "Die Woche in Kürze", date: ago(2, 6, 30), read: false, headers: ["List-Unsubscribe: <https://example.invalid/wochenpost/abmelden>"], html: "<html><body><h1>Die Woche in Kürze</h1><p>Erfundene Meldungen.</p></body></html>" }),
    mail({ from: "Wochenpost <post@example.invalid>", subject: "Die Woche in Kürze (Vorwoche)", date: ago(9, 6, 30), headers: ["List-Unsubscribe: <https://example.invalid/wochenpost/abmelden>"], html: "<html><body><h1>Vorwoche</h1></body></html>" }),
  ]);
  out.projects = await add(folder("Projekte/Halo 2026"), [mail({ from: "Ben Muster <ben@example.invalid>", subject: "Meilensteine", date: ago(8, 9, 0), read: false })]);
  folder("Projekte/Leer");
  folder("Sehr langer Ordnername für Abrechnungen und Belege 2026");
  // Adressbuch: Personen, Firma, Liste, zweites und leeres Buch
  const { VCardUtils } = ChromeUtils.importESModule("resource:///modules/VCardUtils.sys.mjs");
  const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  const card = props => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
    for (const [k, v] of Object.entries(props)) if (!["DisplayName", "PrimaryEmail"].includes(k)) c.setProperty(k, v);
    c.displayName = props.DisplayName; c.primaryEmail = props.PrimaryEmail || ""; return c; };
  const has = (b, name) => b.childCards.some(c => c.displayName == name);
  for (const p of [
    { FirstName: "Anna", LastName: "Beispiel", DisplayName: "Anna Beispiel", PrimaryEmail: "anna@example.invalid", Company: "Beispiel GmbH", JobTitle: "Leitung", WorkPhone: "+43 1 234", CellularNumber: "+43 660 000 000" },
    { FirstName: "Ben", LastName: "Muster", DisplayName: "Ben Muster", PrimaryEmail: "ben@example.invalid", HomePhone: "+43 1 555", HomeCity: "Wien", HomeAddress: "Testgasse 1", HomeZipCode: "1010" },
    { FirstName: "Carla", LastName: "Ölmann", DisplayName: "Carla Ölmann", PrimaryEmail: "carla@example.invalid", SecondEmail: "carla.privat@example.invalid" },
    { FirstName: "Maximilian Alexander", LastName: "von Langenname-Überlänge", DisplayName: longName, PrimaryEmail: "maximilian.von.langenname@example.invalid", Company: "Sehr lange Firmenbezeichnung Holding und Partner KG", JobTitle: "Bereichsleiter für besondere Aufgaben" },
    { DisplayName: "Muster AG", Company: "Muster AG", PrimaryEmail: "info@example.invalid", WorkPhone: "+43 1 999" },
    { FirstName: "Dana", LastName: "Zöllner", DisplayName: "Dana Zöllner", PrimaryEmail: "dana@example.invalid" },
    { FirstName: "Emil", LastName: "Kurz", DisplayName: "Emil Kurz", PrimaryEmail: "emil@example.invalid" },
  ]) if (!has(book, p.DisplayName)) book.addCard(card(p));
  if (!has(book, "Jonas Ärmel")) book.addCard(VCardUtils.vCardToAbCard("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Jonas Ärmel\r\nN:Ärmel;Jonas;;;\r\nEMAIL;PREF=1:jonas@example.invalid\r\nBDAY:1990-03-15\r\nNOTE:Erfundener Testkontakt mit Geburtstag\r\nEND:VCARD\r\n"));
  if (!book.childNodes.some(l => l.dirName == "Projektteam")) {
    const list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
    list.isMailList = true; list.dirName = "Projektteam"; list.listNickName = "team"; list.description = "Erfundene Verteilerliste";
    const ml = book.addMailList(list);
    for (const c of book.childCards) if (["Anna Beispiel", "Ben Muster", "Carla Ölmann"].includes(c.displayName)) ml.addCard(c);
  }
  if (!MailServices.ab.directories.some(b => b.dirName == "Arbeit")) {
    MailServices.ab.newAddressBook("Arbeit", "", Ci.nsIAbManager.JS_DIRECTORY_TYPE);
    const work = MailServices.ab.directories.find(b => b.dirName == "Arbeit");
    work.addCard(card({ FirstName: "Frieda", LastName: "Lang", DisplayName: "Frieda Lang", PrimaryEmail: "frieda@example.invalid", Company: "Arbeit & Co", Department: "Einkauf" }));
    work.addCard(card({ FirstName: "Gustav", LastName: "Weit", DisplayName: "Gustav Weit", PrimaryEmail: "gustav@example.invalid" }));
  }
  if (!MailServices.ab.directories.some(b => b.dirName == "Leer")) MailServices.ab.newAddressBook("Leer", "", Ci.nsIAbManager.JS_DIRECTORY_TYPE);
  out.contacts = book.childCards.length;
  // Kalender: „Halo Test“, „Privat“ und ein schreibgeschützter mit Terminen und Aufgaben
  const mkCal = (name, color) => { let c = calNamed(name);
    if (!c) { c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = name; c.setProperty("color", color); cal.manager.registerCalendar(c); }
    return c; };
  const c1 = mkCal("Halo Test", "#FF9500"), c2 = mkCal("Privat", "#34C759"), c3 = mkCal("Feiertage (nur lesen)", "#AF52DE");
  const at = (days, h, m = 0) => { const t = cal.dtz.now(); t.day += days; t.hour = h; t.minute = m; t.second = 0; return t; };
  const day = days => { const t = cal.dtz.now(); t.day += days; t.isDate = true; return t; };
  const ev = async (c, title, s, e, extra = {}) => { const x = new CalEvent(); x.title = title; x.startDate = s; x.endDate = e;
    if (extra.location) x.setProperty("LOCATION", extra.location);
    if (extra.description) x.setProperty("DESCRIPTION", extra.description);
    if (extra.rrule) { x.recurrenceInfo = new CalRecurrenceInfo(x); x.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule(extra.rrule)); }
    return c.addItem(x); };
  const todo = async (c, title, due, extra = {}) => { const x = new CalTodo(); x.title = title; if (due) x.dueDate = due;
    if (extra.priority) x.priority = extra.priority;
    if (extra.percent != null) x.percentComplete = extra.percent;
    if (extra.done) { x.isCompleted = true; x.completedDate = cal.dtz.now(); }
    if (extra.description) x.setProperty("DESCRIPTION", extra.description);
    return c.addItem(x); };
  const existing = await c1.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
  if (!existing.some(i => i.title == "Teamrunde")) {
    await ev(c1, "Teamrunde", at(0, 9), at(0, 10), { location: "Raum 3.14", description: "Erfundene Besprechung mit Tagesordnung:\n1. Rückblick\n2. Planung" });
    await ev(c1, "Kundentermin (überlappend)", at(0, 9, 30), at(0, 11), { location: "Beispiel GmbH, Testgasse 1" });
    await ev(c2, "Zahnarzt", at(0, 14), at(0, 15, 30));
    await ev(c1, "Rückblick", at(-1, 15), at(-1, 16));
    await ev(c2, "Feiertag", day(1), day(2));
    await ev(c1, "Konferenz in Wien", day(2), day(6), { location: "Wien" });
    await ev(c1, "Ein sehr langer Termintitel, der in keine Spalte passt und abgeschnitten werden muss", at(1, 13), at(1, 14));
    await ev(c1, "Jour fixe", at(-7, 10), at(-7, 11), { rrule: "RRULE:FREQ=WEEKLY;COUNT=20" });
    await ev(c2, "Laufen", at(-3, 7), at(-3, 8), { rrule: "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=30" });
    await ev(c2, "Abendessen mit Freunden", at(3, 19), at(3, 22), { location: "Restaurant Beispiel" });
    await ev(c3, "Nationalfeiertag", day(7), day(8));
    await todo(c1, "Steuererklärung abgeben", at(-2, 12), { priority: 1, description: "Belege liegen im Ordner." });
    await todo(c1, "Präsentation vorbereiten", at(1, 17), { percent: 50 });
    await todo(c2, "Blumen gießen", at(0, 18), { done: true });
    await todo(c2, "Reisepass verlängern", null);
    await todo(c1, "Angebot für Muster AG prüfen und mit einer sehr langen Beschreibung versehen", at(5, 9), { priority: 5 });
  }
  c3.readOnly = true;
  out.items = (await c1.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null)).length;
  // Prüf-Datei für Anhänge im Verfassen-Fenster (nur im Testprofil)
  await IOUtils.writeUTF8(PathUtils.join(PathUtils.profileDir, "Angebot-Entwurf.txt"), "Erfundene Testdatei\n");
  return out;
"""

# Aufräumen nach jeder Oberfläche: Popups zu, Nebenfenster zu, nur der erste Tab bleibt
CLEANUP_JS = r"""
  const docs = new Set();
  const addDoc = dd => { if (!dd || docs.has(dd)) return; docs.add(dd);
    for (const b of dd.querySelectorAll("browser, iframe")) { try { addDoc(b.contentDocument); } catch {} } };
  for (const x of Services.wm.getEnumerator(null)) addDoc(x.document);
  for (const dd of docs) for (const p of dd.querySelectorAll("menupopup, panel")) {
    if (["open", "showing"].includes(p.state)) { try { p.hidePopup(); } catch {} } }
  // Unterdialoge (SubDialog, Druckvorschau) schließen – die Druckvorschau hängt am Fenster, nicht am Tab
  const subs = () => [...docs].flatMap(dd => { try { return [...dd.querySelectorAll(".dialogFrame")]; } catch { return []; } })
    .filter(f => { try { return f.isConnected && f.contentDocument && f.contentDocument.location.href != "about:blank"; } catch { return false; } });
  for (const f of subs()) { try { f.contentWindow.close(); } catch {} }
  // zweimal: eine geschlossene Rückfrage lässt ihr Fenster (z. B. Verfassen) offen;
  // neueste zuerst: ein modales Fenster schließt sich erst, wenn sein modales Kind zu ist.
  // Warten über den Zeitgeber des Moduls – solange ein modaler Dialog offen ist, ruhen die des Hauptfensters
  const { setTimeout: modTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  const pause = ms => new Promise(r => modTimeout(r, ms));
  for (const pass of [1, 2]) {
    for (const x of [...Services.wm.getEnumerator(null)].reverse()) if (x != w) {
      try { if (x.gMsgCompose) { x.gContentChanged = false; x.gMsgCompose.bodyModified = false; } x.close(); } catch {}
      await pause(150); }
    await pause(400);
  }
  for (const t of tm.tabInfo) { try { const dp = t.browser?.contentWindow?.detailsPane; if (dp) dp.isDirty = false; } catch {} }
  // Mails nur für eine Oberfläche (Einladung, Empfangsbestätigung …) wieder entfernen
  try { await dropTempMails(); } catch (e) { console.error("Rundgang:", e); }
  while (tm.tabInfo.length > 1) tm.closeTab(tm.tabInfo[tm.tabInfo.length - 1]);
  tm.switchToTab(0);
  // Account Hub und andere HTML-Dialoge im Hauptfenster schließen
  for (const c of d.querySelectorAll("account-hub-container")) { try { c.shadowRoot?.querySelector("dialog[open]")?.close(); } catch {} }
  for (const dl of d.querySelectorAll("dialog[open]")) { try { dl.close(); } catch {} }
  w.__tourPopup = null;
  await wait(300);
  // Reste melden (sonst liegen sie unbemerkt über den nächsten Bildern)
  const left = [];
  docs.clear(); for (const x of Services.wm.getEnumerator(null)) addDoc(x.document);
  for (const f of subs()) { try { left.push("Unterdialog " + f.contentDocument.location.href.split("/").pop()); } catch {} }
  if (hubDialog()) left.push("Account Hub");
  for (const f of lf().descendants) { try { if ([...f.messages].some(m => m.messageId?.startsWith("halo-temp-"))) left.push("Testmail in " + f.name); } catch {} }
  for (const x of Services.wm.getEnumerator(null)) if (x != w) left.push("Fenster " + x.location.href.split("/").pop());
  for (const dd of [d, tm.currentAbout3Pane?.document].filter(Boolean)) for (const p of dd.querySelectorAll("menupopup, panel")) if (p.state == "open") left.push("Popup " + (p.id || p.className));
  return left;
"""

# Popups, die nicht Teil eines Fensters sind (für die Fallback-Prüfung)
POPUP_RECT_JS = r"""
  const p = w.__tourPopup; if (!p) return null;
  const r = p.getOuterScreenRect(); return { state: p.state, x: r.left, y: r.top, w: r.width, h: r.height, pid: Services.appinfo.processID };
"""


# ------------------------------------------------------------------ Oberflächen
def _menubar():
    """Menüleiste: unter macOS die native Leiste oben am Bildschirm – nicht gestaltbar."""
    menus = [
        ("datei", "Datei (Neu, Öffnen, Speichern unter, Abrufen für, Offline)"),
        ("bearbeiten", "Bearbeiten (Auswählen, Suchen)"),
        ("ansicht", "Ansicht (Symbolleisten, Layout, Ordner, Dichte, Zoom, Schriftgröße, Today-Pane, Kalender, Aufgaben, Sortieren, Nachrichten, Threads, Kopfzeilen, Nachrichteninhalt)"),
        ("gehe", "Gehe (Weiter, Zurück, Ordner, Zuletzt geschlossene Tabs)"),
        ("nachricht", "Nachricht (Weiterleiten als, Anhänge, Schlagwort, Markieren, Verschieben, Kopieren)"),
        ("termine", "Termine und Aufgaben (Fortschritt, Priorität, Aufgabe verschieben)"),
        ("extras", "Extras (Chat-Status, Entwicklerwerkzeuge)"),
        ("fenster", "Fenster"),
        ("hilfe", "Hilfe (inkl. „halo.spaces …“)"),
    ]
    return [S(f"menueleiste-{k}", "menues", "menue", f"Menüleiste: {t}", cap="native",
              skip="nativ: macOS-Menüleiste (NSMenu) – weder gestaltbar noch per Fenster-ID aufnehmbar") for k, t in menus]


def _prefs_pages():
    pages = [("allgemein", "paneGeneral", "Allgemein", 4), ("darstellung", "paneAppearance", "Darstellung", 2),
             ("verfassen", "paneCompose", "Verfassen", 3), ("datenschutz", "panePrivacy", "Datenschutz & Sicherheit", 4),
             ("chat", "paneChat", "Chat", 2), ("kalender", "paneCalendar", "Kalender", 3), ("qr", "paneQrExport", "Export für Mobilgeräte", 1)]
    out = []
    for key, pane, name, n in pages:
        for i in range(n):
            frac = "null" if n == 1 else f"{i / (n - 1):.3f}"
            out.append(S(f"einst-{key}-{i + 1}" if n > 1 else f"einst-{key}", "einstellungen", "bereich",
                         f"Einstellungen: {name}" + (f" ({i + 1}/{n}, gescrollt)" if n > 1 and i else (f" (1/{n})" if n > 1 else "")),
                         f'await prefs("{pane}", {frac});'))
    return out


def _prefs_subdialogs():
    dlgs = [
        ("schriften", "paneGeneral", "advancedFonts", "Schriftarten (erweitert)"),
        ("dock", "paneGeneral", "dockOptions", "Dock-Optionen"),
        ("benachrichtigung", "paneGeneral", "customizeMailAlert", "Benachrichtigung anpassen"),
        ("schlagwort", "paneGeneral", "newTagButton", "Neues Schlagwort"),
        ("empfangsbestaetigung", "paneGeneral", "showReturnReceipts", "Empfangsbestätigungen"),
        ("updates", "paneGeneral", "showUpdateHistory", "Update-Chronik"),
        ("verbindung", "paneGeneral", "catProxiesButton", "Verbindungs-Einstellungen"),
        ("offline", "paneGeneral", "offlineSettingsButton", "Offline-Einstellungen"),
        ("sprachen", "paneGeneral", "manageMessengerLanguagesButton", "Sprachen"),
        ("anhang-erinnerung", "paneCompose", "attachment_reminder_button", "Anhang-Erinnerung: Schlüsselwörter"),
        ("fremdinhalte", "panePrivacy", "remoteContentExceptions", "Ausnahmen für entfernte Inhalte"),
        ("cookie-ausnahmen", "panePrivacy", "cookieExceptions", "Cookie-Ausnahmen"),
        ("cookies", "panePrivacy", "showCookiesButton", "Cookies"),
        ("passwoerter", "panePrivacy", "showPasswords", "Gespeicherte Passwörter"),
        ("zertifikate", "panePrivacy", "manageCertificatesButton", "Zertifikatverwaltung"),
        ("geraete", "panePrivacy", "viewSecurityDevicesButton", "Kryptographie-Module"),
        ("kategorie", "paneCalendar", "newCButton", "Kalender: Neue Kategorie"),
    ]
    return [S(f"einst-dlg-{k}", "einstellungen", "dialog", f"Einstellungen → {t}",
              f'await subDialog("{pane}", "{btn}");') for k, pane, btn, t in dlgs] + [
        S("einst-dlg-systemintegration", "einstellungen", "dialog", "Einstellungen → Systemintegration (Standardprogramm)",
          'await subDialog("paneGeneral", "checkDefaultButton");'),
        # „Verzeichnisse bearbeiten“ ist nur aktiv, wenn „Verzeichnisserver“ angehakt ist (ohne Verzeichnis, kein Netz)
        S("einst-dlg-verzeichnisse", "einstellungen", "dialog", "Einstellungen → Verfassen → LDAP-Verzeichnisse verwalten",
          'Services.prefs.setBoolPref("ldap_2.autoComplete.useDirectory", true); await subDialog("paneCompose", "editButton");',
          close='Services.prefs.clearUserPref("ldap_2.autoComplete.useDirectory");',
          note="Unterdialog pref-editdirectories.xhtml; der Rundgang hakt „Verzeichnisserver“ nur dafür an"),
        # „Protokoll anzeigen“ ist nur mit eingeschaltetem Junk-Protokoll aktiv und öffnet ein echtes Fenster (kein Unterdialog)
        S("einst-dlg-junk-protokoll", "einstellungen", "dialog", "Einstellungen → Datenschutz → Junk-Protokoll anzeigen",
          'Services.prefs.setBoolPref("mail.spam.logging.enabled", true); const cw = await prefs("panePrivacy"); const b = cw.document.getElementById("openJunkLogButton");'
          ' if (!b) throw new Error("Knopf fehlt"); if (b.disabled) throw new Error("Knopf deaktiviert"); b.scrollIntoView({ block: "center" }); later(() => b.click());',
          cap="window", win="junkLog", screen=True, close='Services.prefs.clearUserPref("mail.spam.logging.enabled");',
          note="Fenster junkLog.xhtml; der Rundgang schaltet das Junk-Protokoll nur dafür ein"),
        S("einst-dlg-hauptpasswort", "einstellungen", "dialog", "Einstellungen → Hauptpasswort ändern", cap="native",
          skip="verlangt vorher eine macOS-Anmeldung (Systempasswort) – bewusst ausgelassen"),
    ]


def _account_pages():
    pages = [("konto-start", None, "Kontoeinstellungen: Local Folders"),
             ("konto-server", "am-server.xhtml", "Kontoeinstellungen: Server-Einstellungen"),
             ("konto-kopien", "am-copies.xhtml", "Kontoeinstellungen: Kopien & Ordner"),
             ("konto-verfassen", "am-addressing.xhtml", "Kontoeinstellungen: Verfassen & Adressieren"),
             ("konto-junk", "am-junk.xhtml", "Kontoeinstellungen: Junk"),
             ("konto-speicher", "am-offline.xhtml", "Kontoeinstellungen: Speicherplatz"),
             ("konto-smtp", "am-smtp.xhtml", "Kontoeinstellungen: Postausgang-Server (SMTP)")]
    return [S(k, "konten", "bereich", t, f"await accountPage({json.dumps(p)});") for k, p, t in pages]


SURFACES = [
    # ------------------------------------------------------------ Mailliste
    S("mail-karten", "mailliste", "bereich", "Mailliste als Karten, Posteingang mit ausgewählter Mail",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); p.threadTree.focus();'),
    S("mail-karten-ohne-auswahl", "mailliste", "zustand", "Posteingang ohne Auswahl (leere Leseansicht)",
      'const p = await show("Inbox"); p.threadTree.selectedIndex = -1; p.threadTree.focus(); await wait(800);'),
    S("mail-tabelle", "mailliste", "zustand", "Mailliste als Tabelle",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_threadPaneViewTable"); await wait(1500);',
      close='cmd3("cmd_threadPaneViewCards"); await wait(800);'),
    S("mail-tabelle-threads", "mailliste", "zustand", "Tabelle nach Threads gruppiert, Threads aufgeklappt",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_threadPaneViewTable"); w.__tourThreaded = p.gViewWrapper.showThreaded;'
      ' p.gViewWrapper.showThreaded = true; await wait(800); cmd3("cmd_expandAllThreads"); await wait(1200);',
      close='const p = tm.currentAbout3Pane; cmd3("cmd_collapseAllThreads"); p.gViewWrapper.showThreaded = !!w.__tourThreaded; cmd3("cmd_threadPaneViewCards"); await wait(800);'),
    S("mail-karten-threads", "mailliste", "zustand", "Karten nach Threads gruppiert, Thread aufgeklappt",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); w.__tourThreaded = p.gViewWrapper.showThreaded;'
      ' p.gViewWrapper.showThreaded = true; await wait(800); cmd3("cmd_expandAllThreads"); await wait(1200);'
      ' const v = p.gDBView; for (let k = 0; k < v.rowCount; k++) if (subj(v.getMsgHdrAt(k)).includes("Projektplanung")) { p.threadTree.selectedIndex = k; break; } await wait(1500);',
      close='cmd3("cmd_collapseAllThreads"); tm.currentAbout3Pane.gViewWrapper.showThreaded = !!w.__tourThreaded; await wait(800);'),
    S("mail-hover", "mailliste", "zustand", "Karte unter dem Mauszeiger (Hover mit Aktionen)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); const rows = [...p.document.querySelectorAll(\'#threadTree tr[is="thread-card"], #threadTree tr[is="thread-row"]\')];'
      ' const row = rows[2]; const off = p.browsingContext.embedderElement.getBoundingClientRect(); const r = row.getBoundingClientRect();'
      ' return { pointer: [Math.round(off.left + r.left + r.width / 2), Math.round(off.top + r.top + r.height / 2)] };'),
    S("mail-fokusring", "mailliste", "zustand", "Tastaturfokus in der Liste (Fokusring)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); p.threadTree.blur(); p.threadTree.focus({ focusVisible: true }); await wait(500);'),
    S("mail-auswahl-unfokussiert", "mailliste", "zustand", "Ausgewählte Mail, Fokus in der Ordnerliste (ausgewählt-unfokussiert)",
      'const p = await pick("Inbox", "Bilder vom Ausflug"); p.folderTree.focus(); await wait(600);'),
    S("mail-mehrfachauswahl", "mailliste", "zustand", "Mehrere Mails ausgewählt (Zusammenfassung)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); p.threadTree.selectedIndices = [0, 1, 2, 3]; await wait(2000);'),
    S("mail-schnellantwort", "mailliste", "zustand", "Schnellantwort unter der Mail mit Text (halo.spaces)",
      'await pick("Inbox", "Treffen am Donnerstag"); const md = msgDoc(); const bar = await until(() => md.getElementById("mcQuickReply"), 4000);'
      ' if (!bar) throw new Error("Schnellantwort fehlt"); const f = bar.querySelector(".mc-qr-field"); f.value = "Danke, passt mir gut!";'
      ' f.dispatchEvent(new md.defaultView.Event("input", { bubbles: true })); f.focus(); await wait(500);',
      close='const bar = msgDoc()?.getElementById("mcQuickReply"); if (bar) { const f = bar.querySelector(".mc-qr-field"); f.value = ""; f.dispatchEvent(new f.ownerDocument.defaultView.Event("input", { bubbles: true })); }'),
    S("mail-nachfassen", "mailliste", "zustand", "Posteingang: Hinweis „Nachfassen“ zu eigener Mail ohne Antwort (halo.spaces)",
      'const s = fld("Sent"); s.setFlag(Ci.nsMsgFolderFlags.SentMail); const sent = s.QueryInterface(Ci.nsIMsgLocalMailFolder);'
      ' const dt = new Date(Date.now() - 5 * 86400000).toUTCString().replace("GMT", "+0000");'
      ' if (!s.msgDatabase.getMsgHdrForMessageID("tour-follow@example.invalid")) { sent.addMessage("From: Halo Test <halo@example.invalid>\\r\\nTo: Ben Muster <ben@example.invalid>\\r\\nSubject: Angebot Werkstatt\\r\\nDate: " + dt + "\\r\\nMessage-ID: <tour-follow@example.invalid>\\r\\n\\r\\nWie besprochen.\\r\\n"); await wait(800); }'
      ' const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");'
      ' Cu.evalInSandbox("FollowUp", ExtensionParent.GlobalManager.getExtension("' + ht.ADDON_ID + '").experimentAPIManager.global).cache = null;'
      ' await show("Inbox"); await until(() => tm.currentAbout3Pane.document.getElementById("mcFollowUp"), 4000); await wait(500);'),
    S("mail-senden-rueckgaengig", "mailliste", "zustand", "Nach dem Senden: „Senden rückgängig“ unten (halo.spaces)",
      'Services.prefs.setIntPref("extensions.mailcards.undoSend", 30); const cw = await compose({ subject: "Treffen nächste Woche" }); w.__tourUndo = cw;'
      ' cw.goDoCommand("cmd_sendNow"); await until(() => d.getElementById("mcUndoSend"), 5000); await toMail(); await wait(600);',
      close='d.getElementById("mcUndoSend")?.querySelector(".mc-us-undo")?.click(); await wait(400); const cw = w.__tourUndo; delete w.__tourUndo;'
            ' if (cw && !cw.closed) { cw.gMsgCompose.bodyModified = false; cw.SetContentAndBodyAsUnmodified?.(); cw.close(); } Services.prefs.clearUserPref("extensions.mailcards.undoSend"); await wait(500);'),
    S("mail-leerer-ordner", "mailliste", "zustand", "Leerer Ordner",
      'await show("Projekte/Leer"); await wait(500);'),
    S("mail-entwuerfe", "mailliste", "zustand", "Ordner Entwürfe",
      'const p = await show("Drafts"); p.threadTree.selectedIndex = 0; await wait(1500);'),
    S("mail-gesendet", "mailliste", "zustand", "Ordner Gesendet (Empfänger statt Absender)",
      'const p = await show("Sent"); p.threadTree.selectedIndex = 0; await wait(1500);'),
    S("mail-alle-posteingaenge", "mailliste", "zustand", "Alle Posteingänge (Sammelordner)",
      'const p = await toMail(); const row = [...p.document.querySelectorAll("#folderTree li")].find(li => li.querySelector(".name")?.textContent.trim() == "All Inboxes" || li.querySelector(".name")?.textContent.trim() == "Alle Posteingänge");'
      ' if (!row) throw new Error("Sammelordner nicht in der Ordnerliste"); p.folderTree.selectedRow = row; await wait(1800);'),
    S("mail-konto-startseite", "mailliste", "zustand", "Konto-Startseite (Local Folders ausgewählt)",
      'const p = await toMail(); p.displayFolder(lf().URI); await wait(2000);'),
    S("mail-schmal-1100", "mailliste", "zustand", "Schmales Fenster (1100 px bzw. kleinste mögliche Breite)",
      'await pick("Inbox", "Treffen am Donnerstag");', size=(1100, 900)),
    S("mail-dichte-kompakt", "mailliste", "zustand", "Dichte „kompakt“",
      'Services.prefs.setIntPref("mail.uidensity", 0); await pick("Inbox", "Treffen am Donnerstag"); await wait(800);',
      close='Services.prefs.clearUserPref("mail.uidensity"); await wait(800);'),
    S("mail-dichte-gross", "mailliste", "zustand", "Dichte „Touch“ (groß)",
      'Services.prefs.setIntPref("mail.uidensity", 2); await pick("Inbox", "Treffen am Donnerstag"); await wait(800);',
      close='Services.prefs.clearUserPref("mail.uidensity"); await wait(800);'),
    S("mail-layout-klassisch", "mailliste", "zustand", "Layout „klassisch“ (Liste oben, Mail unten)",
      'await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_viewClassicMailLayout"); await wait(1500);',
      close='cmd3("cmd_viewVerticalMailLayout"); await wait(800);'),
    S("mail-ohne-leseansicht", "mailliste", "zustand", "Leseansicht ausgeblendet (nur Liste)",
      'await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_toggleMessagePane"); await wait(1200);',
      close='cmd3("cmd_toggleMessagePane"); await wait(800);'),
    S("mail-schnellfilter", "mailliste", "zustand", "Schnellfilter-Leiste offen",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_toggleQuickFilterBar"); await wait(1000);',
      close='cmd3("cmd_resetQuickFilterBar"); cmd3("cmd_toggleQuickFilterBar"); await wait(600);'),
    S("mail-schnellfilter-aktiv", "mailliste", "zustand", "Schnellfilter „Ungelesen“ aktiv",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_toggleQuickFilterBar"); await wait(800);'
      ' p.document.getElementById("qfb-unread").click(); await wait(1500);',
      close='cmd3("cmd_resetQuickFilterBar"); cmd3("cmd_toggleQuickFilterBar"); await wait(600);'),
    # Schnellfilter mit Suchtext: Zeile „Absender / Empfänger / Betreff / Text“; ohne Treffer der Hinweis auf die globale Suche
    S("mail-schnellfilter-text", "mailliste", "zustand", "Schnellfilter mit Suchtext (Zeile „Absender / Empfänger / Betreff / Text“)",
      'const p = await qfbOpen(); await qfbText(p, "Planung");'
      ' if (!vis(p.document.getElementById("quick-filter-bar-filter-text-bar"))) throw new Error("Zeile für den Suchtext fehlt"); await wait(600);',
      close='cmd3("cmd_resetQuickFilterBar"); cmd3("cmd_toggleQuickFilterBar"); await wait(600);'),
    S("mail-schnellfilter-ohne-treffer", "mailliste", "popup", "Schnellfilter ohne Treffer: Hinweis „Enter: in allen Ordnern suchen“",
      'const p = await qfbOpen(); return await pop(p.document.getElementById("qfb-text-search-upsell"), () => qfbText(p, "Zebra"));', cap="popup",
      close='cmd3("cmd_resetQuickFilterBar"); cmd3("cmd_toggleQuickFilterBar"); await wait(600);',
      note="Tooltip #qfb-text-search-upsell (Gloda aktiv, Suchfeld fokussiert)"),
    S("mail-schnellfilter-schlagwoerter", "mailliste", "zustand", "Schnellfilter „Schlagwörter“ (Zeile mit Schlagwort-Knöpfen)",
      'const p = await qfbOpen(); p.document.getElementById("qfb-tags").click(); await wait(1200);'
      ' if (!vis(p.document.getElementById("quickFilterBarTagsContainer"))) throw new Error("Schlagwort-Zeile fehlt");',
      close='cmd3("cmd_resetQuickFilterBar"); cmd3("cmd_toggleQuickFilterBar"); await wait(600);'),
    S("mail-schnellfilter-schlagwort-modus", "mailliste", "popup", "Schnellfilter „Schlagwörter“: Menü „Beliebig / Alle / Keine“",
      'const p = await qfbOpen(); p.document.getElementById("qfb-tags").click(); await wait(1200);'
      ' const ml = p.document.getElementById("qfb-tag-filter-mode"); if (!vis(ml)) throw new Error("Auswahl fehlt"); return await openBtnPop(ml.menupopup, ml);', cap="popup",
      close='cmd3("cmd_resetQuickFilterBar"); cmd3("cmd_toggleQuickFilterBar"); await wait(600);'),
    S("mail-spaltenauswahl", "mailliste", "popup", "Tabelle: Spaltenauswahl (Listen-Spaltenmenü)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_threadPaneViewTable"); await wait(1500);'
      ' const b = [...p.document.querySelectorAll("#threadTree .button-column-picker")].find(vis); if (!b) throw new Error("Spaltenknopf fehlt");'
      ' return await pop(p.document.querySelector("#threadTree menupopup.menupopup-column-picker"), () => b.click());',
      cap="popup", close='cmd3("cmd_threadPaneViewCards"); await wait(800);'),
    S("mail-ansichtsoptionen", "mailliste", "popup", "Listenkopf: Ansichtsoptionen (…)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); const b = p.document.getElementById("threadPaneDisplayButton");'
      ' return await pop(p.document.getElementById("threadPaneDisplayContext"), () => b.click());', cap="popup"),
    S("mail-filtermenue", "mailliste", "popup", "Listenkopf: Filter-Bedingungen (Rechtsklick oder Halten auf den Filterknopf)",
      'await pick("Inbox", "Treffen am Donnerstag"); const b = d.querySelector("#mcListHeader .mc-lh-filter"); const r = b.getBoundingClientRect();'
      ' return await pop("mcMailFilterPopup", () => b.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })));',
      cap="popup"),
    S("mail-gefiltert", "mailliste", "zustand", "Filter an: „Filtered by: Unread“ unter dem Titel",
      'await pick("Inbox", "Treffen am Donnerstag"); d.querySelector("#mcListHeader .mc-lh-filter").click(); await wait(1200);',
      close='d.querySelector("#mcListHeader .mc-lh-filter").click(); await wait(800);'),
    S("mail-ansichtsoptionen-sortieren", "mailliste", "popup", "Listenkopf: Ansichtsoptionen → Sortieren nach",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); const b = p.document.getElementById("threadPaneDisplayButton");'
      ' await pop(p.document.getElementById("threadPaneDisplayContext"), () => b.click());'
      ' const sub = p.document.getElementById("menu_threadPaneSortPopup"); return await pop(sub, () => { sub.parentNode.open = true; });', cap="popup"),
    # Ansichtsoptionen → Sortieren nach → „Gruppiert nach Sortierung“: Gruppenköpfe (dummy-Zeilen) Heute, Gestern …
    S("mail-gruppiert", "mailliste", "zustand", "Karten gruppiert nach Sortierung (Gruppenköpfe Heute, Gestern, Letzte 7 Tage …)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); w.__tourView = { threaded: p.gViewWrapper.showThreaded, grouped: p.gViewWrapper.showGroupedBySort };'
      ' p.gViewWrapper.showGroupedBySort = true; await wait(1000); cmd3("cmd_expandAllThreads"); await wait(1200);'
      ' if (!p.gViewWrapper.showGroupedBySort) throw new Error("Gruppierung nicht aktiv"); p.threadTree.scrollToIndex?.(0); await wait(600);',
      close='const p = tm.currentAbout3Pane, v = w.__tourView || {}; if (p?.gViewWrapper && !v.grouped) { p.gViewWrapper.showGroupedBySort = false;'
            ' if (v.threaded) p.gViewWrapper.showThreaded = true; else p.gViewWrapper.showUnthreaded = true; await wait(600); cmd3("cmd_collapseAllThreads"); } w.__tourView = null; await wait(800);'),
    S("mail-gruppiert-tabelle", "mailliste", "zustand", "Tabelle gruppiert nach Sortierung (Gruppenköpfe)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); w.__tourView = { threaded: p.gViewWrapper.showThreaded, grouped: p.gViewWrapper.showGroupedBySort };'
      ' cmd3("cmd_threadPaneViewTable"); await wait(1000); p.gViewWrapper.showGroupedBySort = true; await wait(1000); cmd3("cmd_expandAllThreads"); await wait(1200);'
      ' if (!p.gViewWrapper.showGroupedBySort) throw new Error("Gruppierung nicht aktiv"); p.threadTree.scrollToIndex?.(0); await wait(600);',
      close='const p = tm.currentAbout3Pane, v = w.__tourView || {}; if (p?.gViewWrapper && !v.grouped) { p.gViewWrapper.showGroupedBySort = false;'
            ' if (v.threaded) p.gViewWrapper.showThreaded = true; else p.gViewWrapper.showUnthreaded = true; await wait(600); cmd3("cmd_collapseAllThreads"); } w.__tourView = null; cmd3("cmd_threadPaneViewCards"); await wait(800);'),

    # ------------------------------------------------------------ Leseansicht / Mailkopf
    S("lesen-text", "lesen", "bereich", "Leseansicht: Textmail mit Cc",
      'await pick("Inbox", "Treffen am Donnerstag");'),
    S("lesen-newsletter", "lesen", "zustand", "HTML-Newsletter mit Abmelde-Hinweis (List-Unsubscribe)",
      'await pick("Inbox", "Neu im Oktober");'),
    S("lesen-thread-anhang", "lesen", "zustand", "Antwort im Thread mit einem Anhang",
      'await pick("Inbox", "halo-thread-4@example.invalid");',
      close='cmd3("cmd_collapseAllThreads"); await wait(500);'),
    S("lesen-anhaenge-fremdinhalt", "lesen", "zustand", "Mail mit drei Anhängen und blockiertem Bild (Hinweisleiste)",
      'await pick("Inbox", "Bilder vom Ausflug"); await wait(800);'),
    S("lesen-anhaenge-liste", "lesen", "zustand", "Anhangsliste aufgeklappt",
      'await pick("Inbox", "Bilder vom Ausflug"); const md = msgDoc(); md.defaultView.toggleAttachmentList?.(true, true); await wait(900);'),
    S("lesen-viele-empfaenger", "lesen", "zustand", "Mailkopf mit vielen Empfängern",
      'await pick("Inbox", "Einladung: Sommerfest");'),
    S("lesen-alle-empfaenger", "lesen", "zustand", "Mailkopf: alle Empfänger ausgeklappt",
      'await pick("Inbox", "Einladung: Sommerfest"); const md = msgDoc(); const more = [...md.querySelectorAll(".show-more-recipients, button.show-more-recipients")].find(vis);'
      ' if (!more) throw new Error("kein „weitere“-Knopf"); more.click(); await wait(900);'),
    S("lesen-langer-betreff", "lesen", "zustand", "Sehr langer Betreff und Absendername",
      'await pick("Inbox", "Eine sehr lange Betreffzeile");'),
    S("lesen-junk", "lesen", "zustand", "Als Junk markierte Mail (Junk-Leiste)",
      'await pick("Inbox", "Neue Anmeldung bei Ihrem Konto"); await wait(800);'),
    S("lesen-entwurf", "lesen", "zustand", "Entwurf in der Leseansicht (Bearbeiten-Leiste)",
      'await pick("Drafts", "Entwurf: Ideen");'),
    S("lesen-html-tabelle", "lesen", "zustand", "HTML-Mail mit Tabelle",
      'await pick("Inbox", "Versendet: Ihr Paket");'),
    S("lesen-tab", "lesen", "bereich", "Mail im eigenen Tab",
      'const h = hdr("Inbox", "Treffen am Donnerstag"); tm.openTab("mailMessageTab", { messageURI: h.folder.getUriForMsg(h), background: false }); await wait(2500);'),
    S("lesen-fenster", "lesen", "fenster", "Mail im eigenen Fenster",
      'const h = hdr("Inbox", "Treffen am Donnerstag"); w.MsgOpenNewWindowForMessage(h);', cap="window", win="messageWindow"),
    S("lesen-suchleiste", "lesen", "zustand", "Suchleiste in der Mail (Bearbeiten → Suchen)",
      'await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_find"); await wait(900);'
      ' const fb = msgDoc().querySelector("findbar"); if (fb) { fb._findField.value = "Donnerstag"; fb.onFindCommand?.(); fb._find?.(); } await wait(800);'),
    S("lesen-quelltext", "lesen", "fenster", "Quelltext der Mail",
      'await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_viewPageSource");', cap="window", win="viewSource"),
    S("lesen-mehr-menue", "lesen", "popup", "Mailkopf: „Mehr“-Menü",
      'await pick("Inbox", "Treffen am Donnerstag"); const md = msgDoc(); const b = md.getElementById("otherActionsButton");'
      ' if (!vis(b)) throw new Error("Knopf ausgeblendet: halo.spaces blendet die Symbolleiste im Mailkopf aus (Aktionen über Toolbar und Kontextmenü)");'
      ' return await pop(md.getElementById("otherActionsPopup"), () => b.click());', cap="popup"),
    S("lesen-adresse-popup", "lesen", "popup", "Mailkopf: Menü zur Absenderadresse",
      'await pick("Inbox", "Treffen am Donnerstag"); const md = msgDoc(); const el = md.querySelector("#fromRecipient0");'
      ' return await pop(md.getElementById("emailAddressPopup"), () => { (el.querySelector(".recipient-single-line, .recipient-multi-line-name") || el).click(); });', cap="popup"),
    S("lesen-kopf-anpassen", "lesen", "popup", "Mailkopf anpassen (Panel)",
      'await pick("Inbox", "Treffen am Donnerstag"); const md = msgDoc(); const b = md.getElementById("otherActionsButton");'
      ' if (!vis(b)) throw new Error("Knopf ausgeblendet: halo.spaces blendet die Symbolleiste im Mailkopf (und damit „Anpassen“) aus");'
      ' return await pop(md.getElementById("messageHeaderCustomizationPanel"), p => p.openPopup(b, "after_end"));', cap="popup"),
    S("lesen-anhaenge-speichern", "lesen", "popup", "Anhänge: Menü „Alle speichern“",
      'await pick("Inbox", "Bilder vom Ausflug"); const md = msgDoc(); const b = md.getElementById("attachmentSaveAllMultiple");'
      ' return await pop(md.getElementById("attachmentSaveAllMultipleMenu"), p => p.openPopup(b, "after_end"));', cap="popup"),
    S("lesen-fremdinhalt-optionen", "lesen", "popup", "Hinweisleiste: Optionen für entfernte Inhalte",
      'await pick("Inbox", "Bilder vom Ausflug"); const md = msgDoc(); const n = await until(() => md.querySelector(\'#mail-notification-top notification-message[value="remoteContent"]\'));'
      ' const b = n?.querySelector("button") || n?.shadowRoot?.querySelector("button"); if (!b) throw new Error("Knopf fehlt");'
      ' return await pop(md.getElementById("remoteContentOptions"), p => p.openPopup(b, "after_start"));', cap="popup"),
    # Mails nur für diese Oberflächen (tempMail): Einladung, Empfangsbestätigung, Betrugswarnung – keinen Knopf der Leisten auslösen
    S("lesen-einladung", "lesen", "zustand", "Mail mit Kalender-Einladung (iMIP-Leiste: Zusagen, Vielleicht, Absagen, Mehr)",
      'await showInvite();', close="await dropTempMails();"),
    S("lesen-einladung-zusagen", "lesen", "popup", "Einladung: Menü am Knopf „Zusagen“",
      'const md = await showInvite(); return await openBtnPop(md.getElementById("imipAcceptDropdown"), md.getElementById("imipAcceptButton"));', cap="popup",
      close="await dropTempMails();"),
    S("lesen-einladung-mehr", "lesen", "popup", "Einladung: Menü „Mehr“",
      'const md = await showInvite(); return await openBtnPop(md.getElementById("imipMoreDropdown"), md.getElementById("imipMoreButton"));', cap="popup",
      close="await dropTempMails();"),
    S("lesen-empfangsbestaetigung", "lesen", "zustand", "Hinweisleiste „Absender bittet um Empfangsbestätigung“",
      'await mdnMail(); await pick("Inbox", "Bitte um Bestätigung"); if (!await noteOf(msgDoc(), "mdnRequested")) throw new Error("keine Leiste"); await wait(600);',
      close="await dropTempMails();"),
    S("lesen-betrugswarnung", "lesen", "zustand", "Hinweisleiste „Diese Nachricht könnte Betrug sein“",
      'await scamMail(); await pick("Inbox", "Formular-Test"); if (!await noteOf(msgDoc(), "maybeScam")) throw new Error("keine Leiste"); await wait(600);',
      close="await dropTempMails();"),
    S("lesen-betrugswarnung-optionen", "lesen", "popup", "Betrugswarnung: Menü am Knopf der Hinweisleiste",
      'await scamMail(); await pick("Inbox", "Formular-Test"); const md = msgDoc(); const b = noteBtn(await noteOf(md, "maybeScam")); if (!b) throw new Error("Knopf fehlt");'
      ' return await pop(md.getElementById("phishingOptions"), p => p.openPopup(b, "after_start"));', cap="popup", close="await dropTempMails();"),
    S("lesen-kontakt-bearbeiten", "lesen", "popup", "Mailkopf: Panel „Kontakt bearbeiten“ (über das Menü zur Absenderadresse)",
      'await pick("Inbox", "Treffen am Donnerstag"); const md = msgDoc(); const el = md.querySelector("#fromRecipient0"); const menu = md.getElementById("emailAddressPopup");'
      ' await pop(menu, () => { (el.querySelector(".recipient-single-line, .recipient-multi-line-name") || el).click(); });'
      ' const item = md.getElementById("editContactItem"); if (!item || item.hidden) throw new Error("Absender nicht im Adressbuch"); item.doCommand(); menu.hidePopup();'
      ' const panel = await until(() => md.getElementById("editContactPanel"), 4000); if (!panel) throw new Error("Panel fehlt"); return await pop(panel);', cap="popup",
      note="Stern-Knopf im Mailkopf ist in halo.spaces ausgeblendet – erreichbar über das Menü zur Absenderadresse"),

    # ------------------------------------------------------------ Verfassen
    S("verfassen-html", "verfassen", "fenster", "Verfassen (HTML) mit Formatleiste",
      'await compose();', cap="window", win="messengercompose"),
    S("verfassen-spaeter-senden", "verfassen", "popup", "Verfassen: Später senden (Pfeil am Senden-Knopf, halo.spaces)",
      'const cw = await compose(); const b = cw.document.getElementById("mcSendLater"); if (!b) throw new Error("Später-senden-Knopf fehlt");'
      ' return await pop(b.menupopup || cw.document.getElementById("mcSendLaterPopup"), () => { b.open = true; });', cap="popup"),
    S("verfassen-text", "verfassen", "fenster", "Verfassen (reiner Text)",
      'await compose({ plain: true });', cap="window", win="messengercompose"),
    S("verfassen-antwort", "verfassen", "fenster", "Antworten (zitierter Text)",
      'await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_reply"); await winOf("msgcompose"); await wait(1500);', cap="window", win="messengercompose"),
    S("verfassen-cc-bcc", "verfassen", "fenster", "Verfassen mit Cc und vielen Empfängern",
      'await compose({ to: "Anna Beispiel <anna@example.invalid>, Ben Muster <ben@example.invalid>, Carla Ölmann <carla@example.invalid>, " + "' + "Dr. Maximilian Alexander von Langenname-Überlänge <maximilian.von.langenname@example.invalid>" + '", cc: "Projektteam <team@example.invalid>" });',
      cap="window", win="messengercompose"),
    S("verfassen-anhaenge", "verfassen", "fenster", "Verfassen mit Anhängen",
      'const cw = await compose(); const f = await IOUtils.getFile(PathUtils.join(PathUtils.profileDir, "Angebot-Entwurf.txt"));'
      ' const atts = ["Angebot-Entwurf.txt", "Zweiter Anhang mit langem Namen.txt"].map(n => { const a = Cc["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment); a.url = Services.io.newFileURI(f).spec; a.name = n; a.size = 20; return a; });'
      ' cw.AddAttachments(atts); await wait(1500);', cap="window", win="messengercompose"),
    S("verfassen-kontakte", "verfassen", "fenster", "Verfassen mit Kontakte-Seitenleiste",
      'const cw = await compose(); cw.toggleContactsSidebar(); await wait(2500);', cap="window", win="messengercompose",
      # Seitenleiste wieder zu, sonst merkt Thunderbird sie sich für alle späteren Verfassen-Bilder
      close='const cw = Services.wm.getMostRecentWindow("msgcompose"); if (cw) { cw.toggleContactsSidebar(); await wait(600); }'),
    S("verfassen-absender-menue", "verfassen", "popup", "Verfassen: Absender-Auswahl",
      'const cw = await compose(); const b = cw.document.getElementById("msgIdentity"); return await openBtnPop(cw.document.getElementById("msgIdentityPopup"), b);', cap="popup"),
    S("verfassen-autovervollstaendigung", "verfassen", "popup", "Verfassen: Adress-Vorschläge beim Tippen",
      'const cw = await compose({ to: "" }); const inp = cw.document.querySelector(".address-row:not(.hidden) input.address-row-input, #toAddrInput");'
      ' if (!inp) throw new Error("Adressfeld fehlt"); inp.focus(); inp.value = "an"; inp.controller.handleText();'
      ' if (!await until(() => inp.controller.matchCount > 0, 5000)) throw new Error("keine Vorschläge");'
      ' return await pop(inp.popup, () => { if (inp.popup.state != "open") inp.openPopup(); });', cap="popup"),
    S("verfassen-absatz-menue", "verfassen", "popup", "Formatleiste: Absatzformat",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("ParagraphPopup"), cw.document.getElementById("ParagraphSelect"));', cap="popup"),
    S("verfassen-schrift-menue", "verfassen", "popup", "Formatleiste: Schriftart",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("FontFacePopup"), cw.document.getElementById("FontFaceSelect"));', cap="popup"),
    S("verfassen-einfuegen-menue", "verfassen", "popup", "Formatleiste: Einfügen",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("InsertPopup"), cw.document.getElementById("InsertPopupButton"));', cap="popup"),
    S("verfassen-anhang-menue", "verfassen", "popup", "Symbolleiste: Anhängen-Menü",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("button-attachPopup"), cw.document.getElementById("button-attach"));', cap="popup"),
    S("verfassen-speichern-menue", "verfassen", "popup", "Symbolleiste: Speichern-Menü",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("button-savePopup"), cw.document.getElementById("button-save"));', cap="popup"),
    S("verfassen-rechtschreibung-menue", "verfassen", "popup", "Symbolleiste: Rechtschreibung/Sprache",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("languageMenuList"), cw.document.getElementById("spellingButton"));', cap="popup"),
    S("verfassen-weitere-felder", "verfassen", "popup", "Adressfelder: weitere Felder (…)",
      'const cw = await compose(); const b = cw.document.getElementById("extraAddressRowsMenuButton"); return await openBtnPop(cw.document.getElementById("extraAddressRowsMenu"), b);', cap="popup"),
    S("verfassen-farbe", "verfassen", "dialog", "Verfassen: Textfarbe wählen",
      'const cw = await compose(); later(() => cw.EditorSelectColor("Text", null));', cap="window", win="EdColorPicker"),
    S("verfassen-link", "verfassen", "dialog", "Verfassen: Link einfügen",
      'const cw = await compose(); later(() => cw.goDoCommand("cmd_link"));', cap="window", win="EdLinkProps"),
    S("verfassen-tabelle", "verfassen", "dialog", "Verfassen: Tabelle einfügen",
      'const cw = await compose(); later(() => cw.goDoCommand("cmd_InsertTable"));', cap="window", win="EdInsertTable"),
    S("verfassen-speichern-frage", "verfassen", "dialog", "Verfassen schließen: „Speichern?“-Frage",
      'const cw = await compose(); cw.gContentChanged = true; later(() => cw.goDoCommand("cmd_close"));', cap="window", win="commonDialog", prompt=True),
    S("verfassen-kontext-text", "verfassen", "popup", "Kontextmenü im Nachrichtentext (Verfassen)",
      'const cw = await compose(); const body = cw.document.getElementById("messageEditor").contentDocument.body;'
      ' return await pop(cw.document.getElementById("msgComposeContext"), () => ctx(body.querySelector("p") || body));', cap="popup"),
    S("verfassen-kontext-anhang", "verfassen", "popup", "Kontextmenü eines Anhangs (Verfassen)",
      'const cw = await compose(); await attachFiles(cw, ["Angebot-Entwurf.txt", "Zweiter Anhang mit langem Namen.txt"]);'
      ' const it = cw.document.querySelector("#attachmentBucket richlistitem"); if (!it) throw new Error("kein Anhang"); cw.document.getElementById("attachmentBucket").selectedItem = it;'
      ' return await ctxPop("msgComposeAttachmentItemContext", it);', cap="popup"),
    S("verfassen-anhaenge-anordnen", "verfassen", "popup", "Panel „Anhänge neu anordnen“",
      'const cw = await compose(); await attachFiles(cw, ["Angebot-Entwurf.txt", "Zweiter Anhang mit langem Namen.txt", "Dritter Anhang.txt"]);'
      ' cw.document.getElementById("attachmentBucket").selectedIndex = 1;'
      ' return await pop(cw.document.getElementById("reorderAttachmentsPanel"), () => cw.goDoCommand("cmd_reorderAttachments"));', cap="popup"),
    S("verfassen-anhang-erinnerung", "verfassen", "zustand", "Hinweisleiste „Anhang vergessen?“ (Schlüsselwort im Text)",
      'const cw = await compose({ body: "<p>Hallo Anna,</p><p>im Anhang findest du das Dokument (attached).</p><p>Viele Grüße<br>Halo</p>" });'
      ' await cw.gAttachmentNotifier.checkForAttachmentKeywords?.(); if (!await until(() => cw.document.querySelector(\'notification-message[value="attachmentReminder"]\'), 6000)) throw new Error("keine Leiste"); await wait(800);',
      cap="window", win="messengercompose"),
    S("verfassen-bild", "verfassen", "dialog", "Verfassen: Bild einfügen",
      'const cw = await compose(); later(() => cw.goDoCommand("cmd_image"));', cap="window", win="EdImageProps"),
    S("verfassen-rechtschreibung-dialog", "verfassen", "dialog", "Verfassen: Rechtschreibung prüfen",
      'const cw = await compose({ body: "<p>Ein Tset mit Fehlrn und noch mehr Fehlren.</p>" }); later(() => cw.goDoCommand("cmd_spelling"));', cap="window", win="EdSpellCheck"),
    # Formatleiste: weitere Menüs
    S("verfassen-schriftgroesse-menue", "verfassen", "popup", "Formatleiste: Textgröße",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("AbsoluteFontSizeButtonPopup"), cw.document.getElementById("AbsoluteFontSizeButton"));', cap="popup"),
    S("verfassen-ausrichtung-menue", "verfassen", "popup", "Formatleiste: Ausrichtung (mit Symbolen)",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("AlignPopup"), cw.document.getElementById("AlignPopupButton"));', cap="popup"),
    S("verfassen-smiley-menue", "verfassen", "popup", "Formatleiste: Smileys",
      'const cw = await compose(); return await openBtnPop(cw.document.getElementById("smileyPopup"), cw.document.getElementById("smileButtonMenu"));', cap="popup"),
    S("verfassen-suchleiste", "verfassen", "zustand", "Verfassen: Suchleiste im Nachrichtentext (Bearbeiten → Suchen)",
      'const cw = await compose(); cw.goDoCommand("cmd_find"); const fb = await until(() => { const f = cw.document.getElementById("FindToolbar"); return f && !f.hidden && f; }, 4000);'
      ' if (!fb) throw new Error("Suchleiste ging nicht auf"); fb._findField.value = "Liste"; fb._find?.(); await wait(800);', cap="window", win="messengercompose"),
    S("verfassen-suchen-ersetzen", "verfassen", "dialog", "Verfassen: Suchen und Ersetzen",
      'const cw = await compose(); later(() => cw.goDoCommand("cmd_findReplace"));', cap="window", win="EdReplace"),
    S("verfassen-anker", "verfassen", "dialog", "Verfassen: Einfügen → Anker",
      'const cw = await compose(); later(() => cw.goDoCommand("cmd_anchor"));', cap="window", win="EdNamedAnchorProps"),
    S("verfassen-toolbar-kontext", "verfassen", "popup", "Verfassen: Kontextmenü der Symbolleiste",
      'const cw = await compose(); return await ctxPop("toolbar-context-menu", cw.document.getElementById("composeToolbar2"));', cap="popup"),
    # „Anpassen…“ öffnet unter macOS ein Sheet (Panel) im Verfassen-Fenster – nichts verschieben, beim Schließen „Fertig“
    S("verfassen-toolbar-anpassen", "verfassen", "popup", "Verfassen: Symbolleiste anpassen (Sheet)",
      'const cw = await compose(); const p = cw.document.getElementById("customizeToolbarSheetPopup"); if (!p) throw new Error("Sheet fehlt");'
      ' const r = await pop(p, () => cw.CustomizeMailToolbar("compose-toolbox", "CustomizeComposeToolbar"));'
      ' await until(() => p.style.visibility != "hidden", 6000); await wait(1500); return r;', cap="popup",
      close='const cw = Services.wm.getMostRecentWindow("msgcompose"); try { cw?.document.getElementById("customizeToolbarSheetIFrame")?.contentWindow?.onClose?.(); } catch {} await wait(800);'),

    # ------------------------------------------------------------ Ordnerliste, Toolbar, Suche, Spaces
    S("ordner-mehr-menue", "ordner", "popup", "Ordnerliste: „…“-Menü (Ordner-Modi)",
      'const p = await toMail(); const b = p.document.getElementById("folderPaneMoreButton"); return await pop(p.document.getElementById("folderPaneMoreContext"), () => b.click());', cap="popup"),
    S("ordner-modi", "ordner", "zustand", "Ordnerliste mit Modi „Ungelesen“ und „Markiert“",
      'const p = await toMail(); w.__tourModes = p.folderPane.activeModes; p.folderPane.activeModes = [...new Set([...p.folderPane.activeModes, "unread", "flagged"])]; await wait(1500);',
      close='const p = tm.currentAbout3Pane; if (w.__tourModes) p.folderPane.activeModes = w.__tourModes; await wait(800);'),
    S("ordner-kompakt", "ordner", "zustand", "Ordnerliste kompakt (ohne Kopf/Abrufen-Knöpfe)",
      'const p = await toMail(); cmd3("cmd_toggleFolderPane"); await wait(400); cmd3("cmd_toggleFolderPane"); await wait(400); p.folderPane.toggleCompactMode?.(true); await wait(1200);',
      close='tm.currentAbout3Pane.folderPane.toggleCompactMode?.(false); await wait(600);'),
    S("ordner-ausgeblendet", "ordner", "zustand", "Ordnerliste ausgeblendet",
      'await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_toggleFolderPane"); await wait(1200);',
      close='cmd3("cmd_toggleFolderPane"); await wait(800);'),
    S("ordner-abrufen-menue", "ordner", "popup", "Ordnerliste: Abrufen-Knopf (Kontextmenü)",
      'const p = await toMail(); const b = p.document.getElementById("folderPaneGetMessages");'
      ' if (b.disabled) throw new Error("Knopf deaktiviert: kein Konto mit Server im Testprofil"); return await ctxPop("folderPaneGetMessagesContext", b);', cap="popup"),
    S("toolbar-verschieben", "ordner", "popup", "Toolbar: „Verschieben“ (Ordnerauswahl)",
      'await pick("Inbox", "Treffen am Donnerstag"); await roomyToolbar(); const li = toolbarItem("move-to"); if (!li) throw new Error("Knopf auch im breiten Fenster eingeklappt");'
      ' return await pop("toolbarMoveToPopup", () => li.querySelector("button").click());', cap="popup", close="await restoreToolbar();"),
    S("toolbar-markieren", "ordner", "popup", "Toolbar: „Markieren“",
      'await pick("Inbox", "Treffen am Donnerstag"); await roomyToolbar(); const li = toolbarItem("mark-as"); if (!li) throw new Error("Knopf auch im breiten Fenster eingeklappt");'
      ' return await pop("toolbarMarkPopup", () => li.querySelector("button").click());', cap="popup", close="await restoreToolbar();"),
    S("toolbar-abrufen", "ordner", "popup", "Toolbar: „Abrufen“ (Kontomenü)",
      'await toMail(); const li = toolbarItem("get-messages"); if (!li) throw new Error("Knopf fehlt"); const b = li.querySelector("button");'
      ' if (b.disabled) throw new Error("Knopf deaktiviert: kein Konto mit Server im Testprofil"); return await ctxPop("toolbarGetMessagesContext", b);', cap="popup"),
    S("toolbar-anpassen", "ordner", "zustand", "Toolbar anpassen",
      'await toMail(); d.querySelector("unified-toolbar").showCustomization(); await wait(2000);',
      close='const c = d.querySelector("unified-toolbar-customization"); c?.toggle?.(false); d.querySelector("unified-toolbar")?.closeCustomization?.(); await wait(600);'),
    S("suche-ergebnisse", "ordner", "zustand", "Suche oben: Treffer in allen Postfächern",
      'await show("Inbox"); const bar = d.querySelector("#unifiedToolbarContent global-search-bar");'
      ' bar.dispatchEvent(new CustomEvent("search", { detail: "Projekt", cancelable: true })); await until(() => tm.currentAbout3Pane.gDBView?.rowCount >= 2, 6000); await wait(1500);',
      close='d.querySelector("#unifiedToolbarContent global-search-bar")?.dispatchEvent(new CustomEvent("autocomplete", { detail: "", cancelable: true })); await wait(1200);'),
    S("suche-globale-ergebnisse", "ordner", "bereich", "Globale Suche (Ergebnis-Tab)",
      'w.openGlodaSearchTab?.(); await wait(3000); if (tm.tabInfo.length < 2) throw new Error("kein Such-Tab");'),
    # im Mail-Tab fängt halo.spaces die Vorschläge ab – in Kalender, Aufgaben, Chat … erscheint weiter die Gloda-Liste
    S("suche-vorschlaege", "ordner", "popup", "Suchfeld oben außerhalb der Mailansicht: Vorschlagsliste (Kalender-Tab)",
      'await toCalendar(); const bar = [...d.querySelectorAll("#unifiedToolbarContent global-search-bar")].find(vis); const inp = bar?.shadowRoot?.querySelector("input");'
      ' if (!inp) throw new Error("Suchfeld fehlt"); return await pop("PopupGlodaAutocomplete", async () => { inp.focus(); inp.value = "Anna";'
      ' inp.dispatchEvent(new w.InputEvent("input", { bubbles: true, composed: true })); });', cap="popup",
      close='const inp = [...d.querySelectorAll("#unifiedToolbarContent global-search-bar")].find(vis)?.shadowRoot?.querySelector("input");'
            ' if (inp) { inp.value = ""; inp.dispatchEvent(new w.InputEvent("input", { bubbles: true, composed: true })); inp.blur(); }'
            ' d.getElementById("PopupGlodaAutocomplete")?.hidePopup?.(); await wait(500);',
      note="PopupGlodaAutocomplete; im Mail-Tab ersetzt halo.spaces die Liste durch die eigene Suche"),
    S("today-pane-zu", "ordner", "zustand", "Mail ohne Today-Pane",
      'await pick("Inbox", "Treffen am Donnerstag"); if (w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); await wait(1500);',
      close='if (!w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); await wait(1000);'),
    S("today-wetter", "ordner", "zustand", "Today-Pane mit Wetter-Symbol (Regen, Option von halo.spaces)",
      'const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");'
      ' const W = Cu.evalInSandbox("Weather", ExtensionParent.GlobalManager.getExtension("' + ht.ADDON_ID + '").experimentAPIManager.global);'
      ' Services.prefs.setStringPref("extensions.mailcards.weatherState", JSON.stringify({ for: "Wien", place: "Wien, Österreich", status: "ok", time: Date.now(), kind: "rain", temp: 12 }));'
      ' Services.prefs.setStringPref("extensions.mailcards.weatherPlace", "Wien"); Services.prefs.setBoolPref("extensions.mailcards.weather", true); W.show();'
      ' await pick("Inbox", "Treffen am Donnerstag"); if (!w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); await wait(1200);',
      close='for (const p of ["weather", "weatherPlace", "weatherState"]) Services.prefs.clearUserPref("extensions.mailcards." + p); await wait(300);'),
    S("spaces-eingeklappt", "ordner", "zustand", "Bereiche-Leiste eingeklappt",
      'await pick("Inbox", "Treffen am Donnerstag"); w.gSpacesToolbar.toggleToolbar(true); await wait(1500);',
      close='w.gSpacesToolbar.toggleToolbar(false); await wait(1000);'),
    S("spaces-menue-knopf", "ordner", "popup", "Bereiche-Leiste eingeklappt: Bereiche-Menü", cap="native",
      skip="von halo.spaces ersetzt: der Knopf blendet die Seitenleiste ein/aus, das Menü wird blockiert (implementation.js, hookSidebarButton)"),
    S("spaces-anpassen", "ordner", "popup", "Bereiche-Leiste anpassen (Panel)",
      'await toMail(); const gs = w.gSpacesToolbar; const anchor = d.getElementById("collapseButton");'
      ' return await pop("spacesToolbarCustomizationPanel", p => { if (vis(anchor)) return gs.showCustomize();'
      ' gs.isCustomizing = true; gs._resetColorInputs?.(); p.openPopup(d.getElementById("settingsButton"), "end_after", 6, 0, false); });', cap="popup",
      close='w.gSpacesToolbar.customizePanel?.hidePopup(); await wait(400);',
      note="showCustomize() verankert das Panel am ausgeblendeten collapseButton – dort geht es nicht auf; der Rundgang öffnet es am Einstellungen-Knopf"),
    S("appmenu", "ordner", "popup", "App-Menü (≡)",
      'await toMail(); const anchor = toolbarItem("search-bar") || d.getElementById("unifiedToolbarContent"); await w.PanelUI.ensureReady?.();'
      ' await pop("appMenu-popup", async () => { await w.PanelMultiView.openPopup(w.PanelUI.panel, anchor, { position: "bottomright topright" }); }); return { popup: "appMenu-popup" };', cap="popup",
      note="Knopf ≡ ist in halo.spaces ausgeblendet – der Rundgang öffnet das Menü am Suchfeld"),
    S("appmenu-ansicht", "ordner", "popup", "App-Menü → Ansicht (Unteransicht)",
      'await toMail(); const anchor = toolbarItem("search-bar") || d.getElementById("unifiedToolbarContent"); await w.PanelUI.ensureReady?.();'
      ' await pop("appMenu-popup", async () => { await w.PanelMultiView.openPopup(w.PanelUI.panel, anchor, { position: "bottomright topright" }); });'
      ' const item = d.getElementById("appmenu_View"); if (!item) throw new Error("Eintrag Ansicht fehlt"); item.click(); await wait(1200); return { popup: "appMenu-popup" };', cap="popup",
      note="Knopf ≡ ist in halo.spaces ausgeblendet – der Rundgang öffnet das Menü am Suchfeld"),

    # ------------------------------------------------------------ Menüs und Kontextmenüs
    *_menubar(),
    S("kontext-mailliste", "menues", "popup", "Kontextmenü: Mailliste",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); const row = p.document.querySelector(\'#threadTree tr.selected, #threadTree tr[aria-selected="true"]\');'
      ' return await ctxPop("mailContext", row);', cap="popup"),
    S("kontext-mailliste-erinnern", "menues", "popup", "Kontextmenü: Mailliste → Erinnern (halo.spaces)",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); const row = p.document.querySelector(\'#threadTree tr.selected, #threadTree tr[aria-selected="true"]\');'
      ' await ctxPop("mailContext", row); const sub = p.document.getElementById("mcRemindMenu").menupopup; return await pop(sub, () => { sub.parentNode.open = true; });', cap="popup"),
    S("kontext-mailliste-untermenue", "menues", "popup", "Kontextmenü: Mailliste → Schlagwort",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); const row = p.document.querySelector(\'#threadTree tr.selected, #threadTree tr[aria-selected="true"]\');'
      ' await ctxPop("mailContext", row); const sub = p.document.getElementById("mailContext-tagpopup"); return await pop(sub, () => { sub.parentNode.open = true; });', cap="popup"),
    S("kontext-ordnerliste", "menues", "popup", "Kontextmenü: Ordnerliste",
      'const p = await toMail(); const row = [...p.document.querySelectorAll("#folderTree li")].find(li => li.querySelector(".name")?.textContent.trim() == "Newsletter");'
      ' return await ctxPop("folderPaneContext", row.querySelector(".container") || row);', cap="popup"),
    S("kontext-mailtext", "menues", "popup", "Kontextmenü: Mailtext",
      'await pick("Inbox", "Treffen am Donnerstag"); const body = msgDoc().getElementById("messagepane").contentDocument.body;'
      ' await ctx(body.firstElementChild || body); const p = await until(() => [msgDoc(), tm.currentAbout3Pane.document, d].map(x => x.getElementById("mailContext") || x.getElementById("browserContext")).find(x => x?.state == "open"), 4000);'
      ' if (!p) throw new Error("Kontextmenü ging nicht auf"); return await pop(p);', cap="popup"),
    S("kontext-mailkopf", "menues", "popup", "Kontextmenü: Mailkopf (Symbolleiste)",
      'await pick("Inbox", "Treffen am Donnerstag"); const md = msgDoc(); const el = md.getElementById("header-view-toolbar");'
      ' if (!vis(el)) throw new Error("Symbolleiste im Mailkopf von halo.spaces ausgeblendet – kein Ort für dieses Kontextmenü"); return await ctxPop("header-toolbar-context-menu", el);', cap="popup"),
    S("kontext-anhang", "menues", "popup", "Kontextmenü: Anhang",
      'await pick("Inbox", "Bilder vom Ausflug"); const md = msgDoc(); md.defaultView.toggleAttachmentList?.(true, true); await wait(800);'
      ' const it = md.querySelector("#attachmentList richlistitem, #attachmentList .attachmentItem"); if (!it) throw new Error("kein Anhang sichtbar"); return await ctxPop("attachmentItemContext", it);', cap="popup"),
    S("kontext-tab", "menues", "popup", "Kontextmenü: Tab",
      'await toCalendar(); const t = tm.tabContainer.allTabs[0]; return await ctxPop("tabContextMenu", t);', cap="popup"),
    S("kontext-toolbar", "menues", "popup", "Kontextmenü: Toolbar",
      'await toMail(); const el = d.getElementById("unifiedToolbarContent"); return await ctxPop("unifiedToolbarMenu", el, { ox: el.getBoundingClientRect().width - 400 });', cap="popup"),
    S("kontext-einstellungen-knopf", "menues", "popup", "Kontextmenü: Einstellungen-Knopf der Bereiche-Leiste",
      'await toMail(); return await ctxPop("settingsContextMenu", d.getElementById("settingsButton"));', cap="popup"),
    S("kontext-schnellfilter", "menues", "popup", "Kontextmenü: Schnellfilter-Leiste",
      'const p = await pick("Inbox", "Treffen am Donnerstag"); cmd3("cmd_toggleQuickFilterBar"); await wait(800);'
      ' return await ctxPop("quickFilterButtonsContext", p.document.getElementById("qfb-unread"));', cap="popup",
      close='cmd3("cmd_toggleQuickFilterBar"); await wait(500);'),
    S("kontext-verfassen-adresse", "menues", "popup", "Kontextmenü: Adresse im Verfassen-Fenster",
      'const cw = await compose(); const pill = cw.document.querySelector("mail-address-pill"); if (!pill) throw new Error("keine Adresse"); return await ctxPop("emailAddressPillPopup", pill);', cap="popup"),
    # Tooltip: nur echte Zeigerbewegung füllt ihn (openPopup reicht nicht) – Marionette fährt über „Verfassen“ und wartet
    S("tooltip-toolbar", "menues", "popup", "Tooltip an einem Toolbar-Knopf („Verfassen“)",
      'await toMail(); const b = toolbarItem("write-message")?.querySelector("button"); if (!b) throw new Error("Knopf fehlt"); return hoverAt(b);',
      cap="popup", after="return await openTip();", hover=1.4,
      note="Standard-Tooltip des Dokuments (title-Attribut, anonymer Inhalt) – nicht #aHTMLTooltip; gemessen: appearance auto, grau, eckig"),

    # ------------------------------------------------------------ Kalender
    S("kal-tag", "kalender", "bereich", "Kalender: Tag",
      'await toCalendar(); w.switchCalendarView("day"); w.currentView().goToDay(cal.dtz.now()); await wait(1500);'),
    S("kal-woche", "kalender", "bereich", "Kalender: Woche",
      'await toCalendar(); w.switchCalendarView("week"); w.currentView().goToDay(cal.dtz.now()); await wait(1500);'),
    S("kal-mehrwochen", "kalender", "bereich", "Kalender: Mehrere Wochen",
      'await toCalendar(); w.switchCalendarView("multiweek"); w.currentView().goToDay(cal.dtz.now()); await wait(1500);'),
    S("kal-monat", "kalender", "bereich", "Kalender: Monat",
      'await toCalendar(); w.switchCalendarView("month"); w.currentView().goToDay(cal.dtz.now()); await wait(1500);'),
    S("kal-woche-auswahl", "kalender", "zustand", "Woche mit ausgewähltem Termin",
      'await toCalendar(); w.switchCalendarView("week"); w.currentView().goToDay(cal.dtz.now()); await wait(1200);'
      ' const b = [...d.querySelectorAll("#week-view calendar-event-box")].find(x => x.occurrence?.title == "Teamrunde"); if (!b) throw new Error("Termin fehlt");'
      ' w.currentView().setSelectedItems([b.occurrence]); await wait(900);'),
    S("kal-woche-leer", "kalender", "zustand", "Leere Woche",
      'await toCalendar(); w.switchCalendarView("week"); const t = cal.dtz.now(); t.year += 2; w.currentView().goToDay(t); await wait(1500);'),
    S("kal-schmal-1100", "kalender", "zustand", "Woche im schmalen Fenster (1100 px bzw. kleinste mögliche Breite)",
      'await toCalendar(); w.switchCalendarView("week"); w.currentView().goToDay(cal.dtz.now()); await wait(1500);', size=(1100, 900)),
    S("kal-suche", "kalender", "zustand", "Kalender: Termine suchen (Liste oben)",
      'await toCalendar(); w.switchCalendarView("week"); const box = d.getElementById("bottom-events-box");'
      ' if (box && getComputedStyle(box).display == "none") throw new Error("von halo.spaces bewusst ausgeblendet (Suchliste gibt es in Apple Kalender nicht)");'
      ' if (!vis(box)) w.toggleUnifinder(); await wait(1500);'
      ' const f = d.getElementById("unifinder-search-field"); if (f) { f.value = "e"; f.dispatchEvent(new w.Event("input")); f.dispatchEvent(new w.Event("command")); } await wait(1500);',
      close='await toCalendar(); const box = d.getElementById("bottom-events-box"); if (box && vis(box)) { try { w.toggleUnifinder(); } catch {} } await wait(600);'),
    S("kal-today-pane", "kalender", "zustand", "Today-Pane in der Mailansicht",
      'await pick("Inbox", "Treffen am Donnerstag"); if (!w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); await wait(1500);'),
    S("kal-schnellfenster", "kalender", "popup", "Kalender: Schnellfenster „Neuer Termin“",
      'await toCalendar(); w.switchCalendarView("week"); await wait(800); const li = toolbarItem("new-event"); if (!li) throw new Error("„+“ fehlt");'
      ' return await pop("mcQuickPanel", () => li.querySelector("button").click());', cap="popup"),
    # Bild für README und Store (screenshots/quick-event.png, store/shot-quick-event.png): erfundenes Beispiel
    S("kal-schnellfenster-beispiel", "kalender", "popup", "Schnellfenster mit Beispiel (Team Lunch, Café Central, wöchentlich, Erinnerung)",
      'await toCalendar(); w.switchCalendarView("week"); await wait(800); const li = toolbarItem("new-event"); if (!li) throw new Error("„+“ fehlt");'
      ' await pop("mcQuickPanel", () => li.querySelector("button").click()); const p = d.getElementById("mcQuickPanel"), f = p.__mc;'
      ' f.title.value = "Team Lunch"; f.location.value = "Café Central";'
      ' f.repeat.value = "WEEKLY"; f.repeat.dispatchEvent(new Event("change")); f.alert.value = "PT15M"; f.alert.dispatchEvent(new Event("change"));'
      ' f.title.blur(); await wait(500); w.__tourPopup = p; return p;', cap="popup"),
    # Schnellfenster: Popups der HTML-Felder (Datum, Auswahlliste) und das eigene Kalendermenü von halo.spaces
    S("kal-schnellfenster-datum", "kalender", "popup", "Schnellfenster: Datumsauswahl (Datumsfeld „Beginn“)",
      'const f = await quickPanel(); return await pop("DateTimePickerPanel", () => { d.notifyUserGestureActivation(); f.startDate.showPicker(); });', cap="popup",
      note="DateTimePickerPanel (datetimepicker.xhtml) – in userChrome.css/spaces.css bisher ohne eigene Regeln"),
    S("kal-schnellfenster-auswahlliste", "kalender", "popup", "Schnellfenster: aufgeklappte Auswahlliste „Wiederholen“",
      'const f = await quickPanel(); const p = d.getElementById("ContentSelectDropdown")?.menupopup; if (!p) throw new Error("Auswahlliste fehlt");'
      ' return await pop(p, () => { d.notifyUserGestureActivation(); f.repeat.showPicker(); });', cap="popup",
      note="Popup #ContentSelectDropdown – dasselbe erscheint für „Vorschauzeilen“ in den halo.spaces-Einstellungen"),
    S("kal-schnellfenster-kalender", "kalender", "popup", "Schnellfenster: Kalendermenü mit Farbpunkten",
      'const f = await quickPanel(); return await pop("mcQuickCalMenu", () => fire(f.calendar, "mousedown"));', cap="popup"),
    S("kal-neu-popover", "kalender", "popup", "Today-Pane: „+“ → Neuer Termin / Neue Aufgabe",
      'await toMail(); if (!w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); await wait(1000);'
      ' return await pop("mcNewPopup", () => d.getElementById("mcTodayNew").click());', cap="popup"),
    S("kal-termin-dialog", "kalender", "fenster", "Neuer Termin (Dialog)",
      'await toCalendar(); w.switchCalendarView("week"); w.createEventWithDialog(testCalendar(), null, null, "Neuer Testtermin");', cap="window", win="calendar-event-dialog"),
    S("kal-termin-bearbeiten", "kalender", "fenster", "Termin bearbeiten (Ort, Beschreibung)",
      'await toCalendar(); const it = await anyItem("Teamrunde"); w.modifyEventWithDialog(it, true);', cap="window", win="calendar-event-dialog"),
    S("kal-termin-erinnerung-menue", "kalender", "popup", "Termin-Dialog: Erinnerung (Auswahl)",
      'await toCalendar(); w.createEventWithDialog(testCalendar(), null, null, "Neuer Testtermin"); const dw = await winUrl("calendar-event-dialog"); await wait(2500);'
      ' const iw = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow || dw; const ml = iw.document.getElementById("item-alarm");'
      ' if (!ml) throw new Error("Erinnerungsfeld fehlt"); return await openBtnPop(ml.menupopup || ml.querySelector("menupopup"), ml);', cap="popup"),
    S("kal-wiederholung-dialog", "kalender", "dialog", "Termin: benutzerdefinierte Wiederholung",
      'await toCalendar(); w.createEventWithDialog(testCalendar(), null, null, "Neuer Testtermin"); const dw = await winUrl("calendar-event-dialog"); await wait(2500);'
      ' const iw = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow || dw; const ml = iw.document.getElementById("item-repeat");'
      ' ml.value = "custom"; later(() => iw.editRepeat ? iw.editRepeat() : iw.updateRepeat());', cap="window", win="calendar-event-dialog-recurrence"),
    S("kal-teilnehmer-dialog", "kalender", "dialog", "Termin: Teilnehmer einladen",
      'await toCalendar(); w.createEventWithDialog(testCalendar(), null, null, "Neuer Testtermin"); const dw = await winUrl("calendar-event-dialog"); await wait(2500);'
      ' const iw = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow || dw; later(() => iw.editAttendees());', cap="window", win="calendar-event-dialog-attendees"),
    # Termin-Dialog: aufgeklappte Felder (Datum, Uhrzeit, Kategorien) und Menüs der Symbolleiste
    S("kal-termin-datum", "kalender", "popup", "Termin-Dialog: Datumsauswahl (Minimonat im Datumsfeld)",
      'const { iw } = await eventDialog(); const ml = iw.document.querySelector("#event-starttime datepicker menulist"); if (!ml) throw new Error("Datumsfeld fehlt");'
      ' return await openBtnPop(ml.menupopup, ml);', cap="popup"),
    S("kal-termin-uhrzeit", "kalender", "popup", "Termin-Dialog: Uhrzeit-Popover (nur Uhrzeit, wie Apple Kalender)",
      'const { iw } = await eventDialog(); const ml = iw.document.querySelector("#event-starttime timepicker menulist"); if (!ml) throw new Error("Uhrzeitfeld fehlt");'
      ' const p = await until(() => iw.document.querySelector(".mc-time-panel"), 3000); if (!p) throw new Error("Uhrzeit-Popover fehlt");'
      ' return await pop(p, () => { ml.open = true; });', cap="popup"),
    S("kal-termin-kategorien", "kalender", "popup", "Termin-Dialog: Kategorien (Auswahl mit Häkchen)",
      'const { iw } = await eventDialog(); const ml = iw.document.getElementById("item-categories"); if (!ml) throw new Error("Kategorien fehlen");'
      ' return await openBtnPop(iw.document.getElementById("item-categories-popup"), ml);', cap="popup"),
    S("kal-termin-privatsphaere", "kalender", "popup", "Termin-Dialog: Symbolleiste „Privatsphäre“ (Menü)",
      'const { dw } = await eventDialog(); const b = dw.document.getElementById("button-privacy"); if (!vis(b)) throw new Error("Knopf ausgeblendet");'
      ' return await openBtnPop(dw.document.getElementById("event-privacy-menupopup"), b);', cap="popup"),
    S("kal-termin-anhang-menue", "kalender", "popup", "Termin-Dialog: Symbolleiste „Anhängen“ (Menü)",
      'const { dw } = await eventDialog(); const b = dw.document.getElementById("button-url"); if (!vis(b)) throw new Error("Knopf ausgeblendet");'
      ' return await openBtnPop(dw.document.getElementById("button-attach-menupopup"), b);', cap="popup"),
    S("kal-erinnerung-anpassen", "kalender", "dialog", "Termin: Erinnerungen anpassen (Erinnerung → Benutzerdefiniert…)",
      'const { iw } = await eventDialog(); const ml = iw.document.getElementById("item-alarm"); if (!ml) throw new Error("Erinnerungsfeld fehlt");'
      ' ml.value = "custom"; later(() => iw.updateReminder());', cap="window", win="calendar-event-dialog-reminder"),
    S("kal-zusammenfassung", "kalender", "fenster", "Termin aus schreibgeschütztem Kalender (Zusammenfassung)",
      'await toCalendar(); const it = await anyItem("Nationalfeiertag"); w.modifyEventWithDialog(it, true);', cap="window", win="calendar-summary-dialog"),
    S("kal-erinnerung", "kalender", "fenster", "Erinnerungsfenster (Alarm)",
      'await addAlarm();', cap="window", win="calendar-alarm-dialog", close='await dropAlarm();'),
    S("kal-erinnerung-spaeter", "kalender", "popup", "Erinnerungsfenster: Menü „Später erinnern“ (Schlummern für alle)",
      'await addAlarm(); const aw = await winUrl("calendar-alarm-dialog", 15000); if (!aw) throw new Error("Erinnerungsfenster nicht offen"); await wait(1500);'
      ' const b = aw.document.getElementById("alarm-snooze-all-button"); if (!vis(b)) throw new Error("Knopf „Später erinnern“ fehlt");'
      ' return await pop(aw.document.getElementById("alarm-snooze-all-popup"), p => p.openPopup(b, "after_start"));', cap="popup",
      close='await dropAlarm();', note="nur geöffnet, kein Eintrag gewählt; Termin wird danach gelöscht"),
    # Tooltip eines Termins: Marionette fährt mit dem Zeiger über die Terminbox (tooltip="itemTooltip")
    S("kal-termin-tooltip", "kalender", "popup", "Kalender: Tooltip eines Termins (Titel, Zeit, Ort, Kalender)",
      'await toCalendar(); w.switchCalendarView("week"); w.currentView().goToDay(cal.dtz.now()); await wait(1200);'
      ' const b = [...d.querySelectorAll("#week-view calendar-event-box")].find(x => x.occurrence?.title == "Teamrunde" && vis(x)); if (!b) throw new Error("Termin fehlt");'
      ' return hoverAt(b);', cap="popup", after="return await openTip();", hover=1.4),
    S("kal-eigenschaften", "kalender", "dialog", "Kalender-Eigenschaften",
      'w.openDialog("chrome://calendar/content/calendar-properties-dialog.xhtml", "_blank", "centerscreen,chrome,titlebar,resizable", { calendar: testCalendar() });', cap="window", win="calendar-properties-dialog"),
    S("kal-neuer-kalender", "kalender", "dialog", "Neuer Kalender (Assistent)",
      'await toCalendar(); later(() => d.getElementById("calendar_new_calendar_command").doCommand());', cap="window", win="calendar-creation"),
    S("kal-wiederholung-frage", "kalender", "dialog", "Wiederholten Termin löschen: Nachfrage",
      'await toCalendar(); w.switchCalendarView("week"); w.currentView().goToDay(cal.dtz.now()); await wait(1000); const it = await anyItem("Jour fixe");'
      ' const occ = it.recurrenceInfo.getNextOccurrence(cal.dtz.now()) || it; later(() => w.calendarViewController.deleteOccurrences([occ], false, false));', cap="window", win="calendar-occurrence-prompt"),
    S("kal-druck", "kalender", "zustand", "Kalender drucken (Druckvorschau)",
      'await toCalendar(); w.switchCalendarView("week"); await wait(800); later(() => w.goDoCommand("cmd_print")); await wait(4000);'
      ' if (![...d.querySelectorAll(".dialogFrame, browser")].some(f => /print/.test(f.getAttribute("src") || f.currentURI?.spec || ""))) throw new Error("keine Druckvorschau");'),
    S("kal-kontext-ansicht", "kalender", "popup", "Kontextmenü: Kalenderansicht (leere Stelle)",
      'await toCalendar(); w.switchCalendarView("week"); await wait(1000); const cols = [...d.querySelectorAll("#week-view calendar-event-column")].filter(vis);'
      ' const col = cols.find(c => ![...c.querySelectorAll("calendar-event-box")].some(b => vis(b))) || cols.at(-1);'
      ' return await ctxPop("calendar-view-context-menu", col, { oy: 40 });', cap="popup"),
    S("kal-kontext-termin", "kalender", "popup", "Kontextmenü: Termin",
      'await toCalendar(); w.switchCalendarView("week"); w.currentView().goToDay(cal.dtz.now()); await wait(1200);'
      ' const b = [...d.querySelectorAll("#week-view calendar-event-box")].find(x => x.occurrence?.title == "Teamrunde"); return await ctxPop("calendar-item-context-menu", b);', cap="popup"),
    S("kal-kontext-kalenderliste", "kalender", "popup", "Kontextmenü: Kalenderliste",
      'await toCalendar(); const li = rowOf(d, "#calendar-list li", "Halo Test"); return await ctxPop("list-calendars-context-menu", li);', cap="popup"),
    S("kal-kontext-today", "kalender", "popup", "Kontextmenü: Termin in der Today-Pane",
      'await toMail(); if (!w.TodayPane.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand(); await wait(1200);'
      ' const it = [...d.querySelectorAll("#agenda li")].find(li => vis(li) && /Teamrunde|Kundentermin|Zahnarzt/.test(li.textContent)); if (!it) throw new Error("kein Termin in der Today-Pane");'
      ' return await ctxPop("agenda-menupopup", it);', cap="popup"),

    # ------------------------------------------------------------ Aufgaben
    S("aufg-liste", "aufgaben", "bereich", "Aufgaben mit ausgewählter Aufgabe",
      'await toTasks(); const t = d.getElementById("calendar-task-tree"); await until(() => t.view?.rowCount > 0, 5000); d.getElementById("opt_all_filter")?.click(); await wait(800);'
      ' t.view.selection.select(0); await wait(1200);'),
    S("aufg-ueberfaellig", "aufgaben", "zustand", "Aufgaben: Filter „Überfällig“",
      'await toTasks(); d.getElementById("opt_overdue_filter")?.click(); await wait(1500);',
      close='d.getElementById("opt_throughcurrent_filter")?.click(); await wait(500);'),
    S("aufg-erledigt", "aufgaben", "zustand", "Aufgaben: Filter „Erledigt“",
      'await toTasks(); d.getElementById("opt_completed_filter")?.click(); await wait(1500);',
      close='d.getElementById("opt_throughcurrent_filter")?.click(); await wait(500);'),
    S("aufg-leer", "aufgaben", "zustand", "Aufgaben: keine Treffer (Leeranzeige)",
      'await toTasks(); const f = d.getElementById("task-text-filter-field"); f.value = "xyzxyz"; f.dispatchEvent(new w.Event("input")); f.dispatchEvent(new w.Event("command")); await wait(1500);',
      close='const f = d.getElementById("task-text-filter-field"); if (f) { f.value = ""; f.dispatchEvent(new w.Event("input")); f.dispatchEvent(new w.Event("command")); } await wait(500);'),
    S("aufg-dialog", "aufgaben", "fenster", "Neue Aufgabe (Dialog)",
      'await toTasks(); w.createTodoWithDialog(testCalendar());', cap="window", win="calendar-event-dialog"),
    S("aufg-bearbeiten", "aufgaben", "fenster", "Aufgabe bearbeiten",
      'await toTasks(); const it = await anyItem("Präsentation vorbereiten"); w.modifyEventWithDialog(it, true);', cap="window", win="calendar-event-dialog"),
    S("aufg-schnellfenster", "aufgaben", "popup", "Aufgaben: Schnellfenster „Neue Aufgabe“",
      'await toTasks(); const li = toolbarItem("new-event") || toolbarItem("new-task"); if (!li) throw new Error("„+“ fehlt");'
      ' return await pop("mcQuickPanel", () => li.querySelector("button").click());', cap="popup"),
    S("aufg-kontext", "aufgaben", "popup", "Kontextmenü: Aufgabe",
      'await toTasks(); const t = d.getElementById("calendar-task-tree"); await until(() => t.view?.rowCount > 0, 5000); t.view.selection.select(0); await wait(500);'
      ' const tc = t.querySelector("treechildren"); return await ctxPop("taskitem-context-menu", tc, { oy: 8 });', cap="popup"),
    S("aufg-prioritaet-menue", "aufgaben", "popup", "Aufgabe: Priorität (Menü)",
      'await toTasks(); const t = d.getElementById("calendar-task-tree"); await until(() => t.view?.rowCount > 0, 5000); t.view.selection.select(0); await wait(800);'
      ' const b = d.getElementById("task-actions-priority"); return await pop("task-actions-priority-menupopup", p => p.openPopup(b, "after_start"));', cap="popup"),

    # ------------------------------------------------------------ Adressbuch
    S("ab-kontakt", "kontakte", "bereich", "Adressbuch: Kontakt ansehen",
      'const ab = await toBook(); await selectCard(ab, "Anna Beispiel");'),
    S("ab-firma", "kontakte", "zustand", "Adressbuch: Firma ansehen",
      'const ab = await toBook(); await selectCard(ab, "Muster AG");'),
    S("ab-langer-name", "kontakte", "zustand", "Adressbuch: langer Name und Firma",
      'const ab = await toBook(); await selectCard(ab, "Dr. Maximilian Alexander von Langenname-Überlänge");'),
    S("ab-geburtstag", "kontakte", "zustand", "Adressbuch: Kontakt mit Geburtstag und Notiz",
      'const ab = await toBook(); await selectCard(ab, "Jonas Ärmel");'),
    S("ab-bearbeiten", "kontakte", "zustand", "Adressbuch: Kontakt bearbeiten",
      'const ab = await toBook(); await selectCard(ab, "Anna Beispiel"); ab.document.getElementById("editButton").click(); await wait(1500);',
      close='const ab = tm.currentTabInfo.browser?.contentWindow; if (ab?.detailsPane) { ab.detailsPane.isDirty = false; ab.document.getElementById("cancelEditButton")?.click(); } await wait(400);'),
    S("ab-neu", "kontakte", "zustand", "Adressbuch: neuer Kontakt",
      'const ab = await toBook(); ab.createContact(); await wait(1500);',
      close='const ab = tm.currentTabInfo.browser?.contentWindow; if (ab?.detailsPane) { ab.detailsPane.isDirty = false; ab.document.getElementById("cancelEditButton")?.click(); } await wait(400);'),
    S("ab-foto-dialog", "kontakte", "zustand", "Adressbuch: Kontaktbild wählen (Dialog)",
      'const ab = await toBook(); await selectCard(ab, "Anna Beispiel"); ab.document.getElementById("editButton").click(); await wait(1500);'
      ' ab.document.getElementById("photoButton").click(); await wait(1200); if (!ab.document.getElementById("photoDialog").open) throw new Error("Bild-Dialog nicht offen");',
      close='const ab = tm.currentTabInfo.browser?.contentWindow; ab?.document.getElementById("photoDialog")?.close(); if (ab?.detailsPane) { ab.detailsPane.isDirty = false; ab.document.getElementById("cancelEditButton")?.click(); } await wait(400);'),
    S("ab-verteiler", "kontakte", "zustand", "Adressbuch: Verteilerliste",
      'const ab = await toBook(); const li = bookRow(ab, "Projektteam"); if (!li) throw new Error("Liste fehlt"); ab.booksList.selectedIndex = ab.booksList.rows.indexOf(li); await wait(1200);'
      ' ab.document.getElementById("cards").selectedIndex = 0; await wait(1000);'),
    S("ab-leeres-buch", "kontakte", "zustand", "Adressbuch: leeres Buch",
      'const ab = await toBook(); const li = bookRow(ab, "Leer"); if (!li) throw new Error("Buch fehlt"); ab.booksList.selectedIndex = ab.booksList.rows.indexOf(li); await wait(1500);'),
    S("ab-suche", "kontakte", "zustand", "Adressbuch: Suche",
      'const ab = await toBook(); const s = ab.document.getElementById("searchInput"); s.value = "an"; s.dispatchEvent(new ab.CustomEvent("autocomplete", { detail: "an" })); s.dispatchEvent(new ab.Event("input", { bubbles: true })); await wait(1500);'),
    S("ab-mehrfachauswahl", "kontakte", "zustand", "Adressbuch: mehrere Kontakte ausgewählt",
      'const ab = await toBook(); const list = ab.document.getElementById("cards"); list.selectedIndices = [0, 1, 2]; await wait(1500);'),
    S("ab-schmal-1100", "kontakte", "zustand", "Adressbuch im schmalen Fenster (1100 px bzw. kleinste mögliche Breite)",
      'const ab = await toBook(); await selectCard(ab, "Anna Beispiel");', size=(1100, 900)),
    S("ab-sortieren", "kontakte", "popup", "Adressbuch: Listenoptionen (Sortieren)",
      # in halo.spaces über „…“ im Listenkopf oben (der Knopf im Kartenkopf ist ausgeblendet)
      'const ab = await toBook(); const more = [...d.querySelectorAll("#mcListHeader .mc-lh-more")].find(vis);'
      ' const b = more || ab.document.getElementById("displayButton"); return await pop(ab.document.getElementById("sortContext"), () => b.click());', cap="popup"),
    # Listenoptionen → Tabellenansicht (bleibt im xulStore – beim Schließen zurück auf Karten)
    S("ab-tabelle", "kontakte", "zustand", "Adressbuch als Tabelle (Listenoptionen → Tabellenansicht)",
      'const ab = await toBook(); ab.cardsPane.toggleLayout(true); await wait(1200); await selectCard(ab, "Anna Beispiel");',
      close='const ab = tm.currentTabInfo.browser?.contentWindow; ab?.cardsPane?.toggleLayout(false); await wait(600);'),
    S("ab-tabelle-spalten", "kontakte", "popup", "Adressbuch-Tabelle: Spaltenauswahl",
      'const ab = await toBook(); ab.cardsPane.toggleLayout(true); await wait(1200);'
      ' const b = [...ab.document.querySelectorAll("#cards .button-column-picker")].find(vis); if (!b) throw new Error("Spaltenknopf fehlt");'
      ' return await pop(ab.document.querySelector("#cards menupopup.menupopup-column-picker"), () => b.click());', cap="popup",
      close='const ab = tm.currentTabInfo.browser?.contentWindow; ab?.cardsPane?.toggleLayout(false); await wait(600);'),
    S("ab-toolbar-neues-buch", "kontakte", "popup", "Adressbuch-Toolbar: „Neues Adressbuch“ (Menü)",
      'await toBook(); const li = toolbarItem("create-address-book"); if (!li) throw new Error("Knopf fehlt");'
      ' return await pop("unifiedToolbarCreateBook", () => (li.querySelector("button") || li.firstElementChild).click());', cap="popup"),
    S("ab-account-hub", "kontakte", "dialog", "Adressbuch hinzufügen (Account Hub, „+“ in der Bücherliste)",
      'const ab = await toBook(); ab.document.getElementById("booksPaneCreateBook").click(); if (!await until(hubDialog, 6000)) throw new Error("Account Hub nicht offen"); await wait(1500);'),
    S("ab-neu-menue", "kontakte", "popup", "Adressbuch: „Neues Adressbuch“-Menü (Rechtsklick auf „+“)",
      'const ab = await toBook(); const b = ab.document.getElementById("booksPaneCreateBook"); return await ctxPop("booksPaneCreateBookContext", b);', cap="popup"),
    S("ab-kontext-kontakt", "kontakte", "popup", "Kontextmenü: Kontakt",
      'const ab = await toBook(); await selectCard(ab, "Anna Beispiel"); const row = ab.document.querySelector("#cards tr.selected, #cards tr[aria-selected=true]");'
      ' return await ctxPop("cardContext", row);', cap="popup"),
    S("ab-kontext-buch", "kontakte", "popup", "Kontextmenü: Adressbuch",
      'const ab = await toBook(); const li = bookRow(ab, "Arbeit"); return await ctxPop("bookContext", li.firstElementChild || li);', cap="popup"),
    S("ab-neue-liste", "kontakte", "dialog", "Neue Verteilerliste (Unterdialog)",
      'await abDialog(ab => ab.createList());'),
    S("ab-neues-buch", "kontakte", "dialog", "Neues Adressbuch (Unterdialog)",
      'await abDialog(ab => ab.createBook());'),
    S("ab-carddav", "kontakte", "dialog", "Neues CardDAV-Adressbuch (Unterdialog, ohne Netz)",
      'await abDialog(ab => ab.createBook(Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE));'),
    S("ab-ldap", "kontakte", "dialog", "Neues LDAP-Verzeichnis (Unterdialog, ohne Netz)",
      'await abDialog(ab => ab.createBook(Ci.nsIAbManager.LDAP_DIRECTORY_TYPE));'),
    S("ab-adressen-suchen", "kontakte", "dialog", "Adressen suchen (erweiterte Suche)",
      'later(() => w.MsgSearchAddresses());', cap="window", win="abSearchDialog"),

    # ------------------------------------------------------------ Chat
    S("chat-start", "chat", "bereich", "Chat ohne Konto (Startseite)",
      'w.showChatTab(); await wait(2000);'),

    # ------------------------------------------------------------ Einstellungen
    *_prefs_pages(),
    S("einst-suche", "einstellungen", "zustand", "Einstellungen: Suche („font“)",
      'const cw = await prefs("paneGeneral"); const s = cw.document.getElementById("searchInput"); s.value = "font"; s.dispatchEvent(new cw.Event("command")); s.dispatchEvent(new cw.Event("input")); await wait(2000);'),
    S("einst-menue-darstellung", "einstellungen", "popup", "Einstellungen: Auswahl Hell/Dunkel (halo.spaces)",
      'const cw = await prefs("paneAppearance"); const ml = cw.document.getElementById("mcAppearance"); if (!ml) throw new Error("Auswahl fehlt"); ml.scrollIntoView({ block: "center" }); await wait(300); return await openBtnPop(ml.menupopup, ml);', cap="popup"),
    S("einst-menue-schrift", "einstellungen", "popup", "Einstellungen: Auswahlliste Schriftart",
      'const cw = await prefs("paneGeneral"); const ml = cw.document.getElementById("defaultFont"); ml.scrollIntoView({ block: "center" }); await wait(300); return await openBtnPop(ml.menupopup, ml);', cap="popup"),
    S("einst-menue-woche", "einstellungen", "popup", "Einstellungen: Auswahlliste Wochenbeginn",
      'const cw = await prefs("paneCalendar"); const ml = cw.document.getElementById("weekstarts"); ml.scrollIntoView({ block: "center" }); await wait(300); return await openBtnPop(ml.menupopup, ml);', cap="popup"),
    *_prefs_subdialogs(),
    S("einst-konfiguration", "einstellungen", "bereich", "Konfiguration bearbeiten (about:config)",
      'const cw = await prefs("paneGeneral"); cw.document.getElementById("configEditor").click(); await wait(2500);'
      ' const cd = tabDoc(); const b = cd?.getElementById("warningButton"); if (b) { b.click(); await wait(1200); }'),

    # ------------------------------------------------------------ Konten
    *_account_pages(),
    S("konto-hinzufuegen-menue", "konten", "popup", "Kontoeinstellungen: Konto hinzufügen (Menü)",
      'const aw = await accountPage(null); const b = aw.document.getElementById("accountTreeCreateAccount"); return await pop(aw.document.getElementById("accountAddPopup"), () => b.click());', cap="popup"),
    S("konto-smtp-dialog", "konten", "dialog", "Postausgang-Server hinzufügen (Dialog, ohne Speichern)",
      'const aw = await accountPage("am-smtp.xhtml"); const cf = aw.document.getElementById("contentFrame").contentWindow; const b = cf.document.getElementById("addButton");'
      ' if (!b) throw new Error("Knopf fehlt"); later(() => b.click()); await subFrame(aw.document);'),
    S("konto-archiv-optionen", "konten", "dialog", "Kontoeinstellungen → Kopien & Ordner → Archiv-Optionen (Unterdialog)",
      'const aw = await accountPage("am-copies.xhtml"); const cf = aw.document.getElementById("contentFrame").contentWindow; const b = cf.document.getElementById("archiveHierarchyButton");'
      ' if (!b) throw new Error("Knopf fehlt"); if (b.disabled) throw new Error("Knopf deaktiviert"); b.scrollIntoView({ block: "center" }); later(() => b.click()); await subFrame(aw.document);'),
    S("konto-einrichten", "konten", "dialog", "E-Mail-Konto einrichten (Account Hub, ohne Netz)",
      'await toMail(); w.openAccountHub(); if (!await until(hubDialog, 6000)) throw new Error("Account Hub nicht offen"); await wait(1500);'
      # Name kommt sonst aus dem macOS-Benutzerkonto – durch den Testnamen ersetzen (nichts wird abgeschickt)
      ' for (const i of hubInputs()) if (i.id == "realName") { i.value = "Halo Test"; i.dispatchEvent(new w.Event("input", { bubbles: true, composed: true })); } await wait(500);'),
    S("konto-feed-assistent", "konten", "dialog", "Feed-Konto anlegen (Assistent, abgebrochen)",
      'later(() => w.AddFeedAccount());', cap="window"),
    S("konto-news-assistent", "konten", "dialog", "Newsgruppen-Konto (Assistent, abgebrochen)",
      'later(() => w.openNewsgroupAccountWizard());', cap="window"),
    S("konto-chat-assistent", "konten", "dialog", "Chat-Konto (Assistent, abgebrochen)",
      'later(() => w.openIMAccountWizard());', cap="window"),

    # ------------------------------------------------------------ Add-ons und halo.spaces
    S("addons-erweiterungen", "addons", "bereich", "Add-ons: Erweiterungen",
      'w.openAddonsMgr("addons://list/extension"); await wait(3000);'),
    S("addons-themes", "addons", "bereich", "Add-ons: Themes",
      'w.openAddonsMgr("addons://list/theme"); await wait(3000);'),
    S("addons-detail", "addons", "bereich", "Add-ons: halo.spaces (Details)",
      f'w.openAddonsMgr("addons://detail/" + encodeURIComponent("{ht.ADDON_ID}")); await wait(3000);'),
    S("addons-halo-einstellungen", "addons", "bereich", "halo.spaces-Einstellungen (im Add-ons-Manager)",
      f'w.openAddonsMgr("addons://detail/" + encodeURIComponent("{ht.ADDON_ID}") + "/preferences"); await wait(3500);'),
    S("addons-karten-menue", "addons", "zustand", "Add-ons: Menü einer Erweiterung (…)",
      'w.openAddonsMgr("addons://list/extension"); await wait(3000); const ad = tabDoc(); const b = ad.querySelector("addon-card .more-options-button");'
      ' if (!b) throw new Error("Knopf fehlt"); b.click(); await wait(900);'),
    S("addons-werkzeuge-menue", "addons", "zustand", "Add-ons: Zahnrad-Menü (Updates, Add-on aus Datei installieren, Tastenkombinationen …)",
      'w.openAddonsMgr("addons://list/extension"); await wait(3000); const ad = tabDoc(); const b = ad.querySelector("addon-page-header .page-options-menu .more-options-button");'
      ' if (!b) throw new Error("Knopf fehlt"); b.click(); await wait(900); if (!ad.getElementById("page-options-panel-list")?.open) throw new Error("Menü ging nicht auf");'),
    S("halo-begruessung", "addons", "fenster", "Begrüßung nach der Installation mit Wetter-Frage (halo.spaces)",
      'const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");'
      ' const g = ExtensionParent.GlobalManager.getExtension("' + ht.ADDON_ID + '").experimentAPIManager.global;'
      ' await toMail(); Cu.evalInSandbox("enhancer", g).openHaloWindow(w, { welcome: true });', cap="window", win="halo.html"),
    S("halo-info", "addons", "fenster", "Hilfe → halo.spaces … (Info-Fenster)",
      'await toMail(); d.getElementById("mcHaloSpaces").doCommand();', cap="window", win="halo.html"),

    # ------------------------------------------------------------ Seltene Dialoge
    S("dlg-ordner-eigenschaften", "dialoge", "dialog", "Ordner-Eigenschaften",
      'await show("Newsletter"); later(() => cmd3("cmd_properties"));', cap="window", win="folderProps"),
    S("dlg-ordner-neu", "dialoge", "dialog", "Neuer Ordner",
      'await show("Inbox"); later(() => cmd3("cmd_newFolder"));', cap="window", win="newFolderDialog"),
    S("dlg-ordner-umbenennen", "dialoge", "dialog", "Ordner umbenennen",
      'await show("Newsletter"); later(() => cmd3("cmd_renameFolder"));', cap="window", win="renameFolderDialog"),
    S("dlg-suchordner", "dialoge", "dialog", "Neuer Suchordner (gespeicherte Suche)",
      'await show("Inbox"); later(() => cmd3("cmd_newVirtualFolder"));', cap="window", win="virtualFolderProperties"),
    S("dlg-filterliste", "dialoge", "fenster", "Nachrichtenfilter (Liste)",
      'await show("Inbox"); w.MsgFilters(null, fld("Inbox"));', cap="window", win="FilterListDialog"),
    S("dlg-filter-editor", "dialoge", "dialog", "Filterregeln bearbeiten (Filter-Editor)",
      'await show("Inbox"); w.MsgFilters(null, fld("Inbox")); const fw = await winUrl("FilterListDialog"); await wait(1000); later(() => fw.onNewFilter());', cap="window", win="FilterEditor"),
    S("dlg-filterprotokoll", "dialoge", "fenster", "Nachrichtenfilter → Filterprotokoll",
      'await show("Inbox"); w.MsgFilters(null, fld("Inbox")); const fw = await winUrl("FilterListDialog"); if (!fw) throw new Error("Filterliste nicht offen"); await wait(1000);'
      ' const b = fw.document.getElementById("filterLogButton"); if (!vis(b)) throw new Error("Knopf fehlt"); fw.setTimeout(() => b.click(), 0);', cap="window", win="viewLog", screen=True,
      note="Bild per screencapture -l mit Titelleiste (dunkel lieferte TakeScreenshot nur eine weiße Fläche)"),
    S("dlg-suchordner-ordnerwahl", "dialoge", "dialog", "Suchordner → Ordner auswählen (Ordnerliste zum Durchsuchen)",
      # der Suchordner-Dialog ist modal (Zeitgeber des Hauptfensters ruhen) – Knopf daher im Dialog selbst auslösen (then)
      'await show("Inbox"); later(() => cmd3("cmd_newVirtualFolder"));', cap="window", win="virtualFolderListEdit",
      then=("virtualFolderProperties", 'const b = d.getElementById("folderListPicker"); if (!b) throw new Error("Knopf fehlt"); setTimeout(() => b.click(), 0); return 1;')),
    S("dlg-suche", "dialoge", "fenster", "Nachrichten suchen (erweiterte Suche)",
      'const f = await show("Inbox"); later(() => w.openSearchDialog(tm.currentAbout3Pane?.gFolder ?? null));', cap="window", win="earchDialog.xhtml",
      # alle Nachrichten suchen, damit die Ergebnisliste gefüllt ist (ab TB 160 eine Liste wie die Mailliste)
      then=("earchDialog.xhtml", 'await new Promise(r => setTimeout(r, 800));'
            ' const v = [...d.querySelectorAll("#searchTermList input:not([type=checkbox])")].find(e => e.getBoundingClientRect().width);'
            ' if (v) { v.focus(); v.value = "e"; v.dispatchEvent(new Event("input", { bubbles: true })); }'
            ' d.getElementById("search-button")?.click(); await new Promise(r => setTimeout(r, 3000)); return 1;')),
    S("dlg-lesen-nach-datum", "dialoge", "dialog", "Nach Datum als gelesen markieren",
      'await show("Inbox"); later(() => cmd3("cmd_markReadByDate"));', cap="window", win="markByDate"),
    S("dlg-schlagwort", "dialoge", "dialog", "Neues Schlagwort (aus der Mailliste)",
      'await pick("Inbox", "Treffen am Donnerstag"); later(() => cmd3("cmd_addTag"));', cap="window", win="newTagDialog"),
    S("dlg-druckvorschau", "dialoge", "zustand", "Druckvorschau einer Mail",
      'await pick("Inbox", "Treffen am Donnerstag"); later(() => cmd3("cmd_print")); await wait(4500);'),
    S("dlg-ueber", "dialoge", "fenster", "Über Thunderbird",
      'later(() => w.openAboutDialog());', cap="window", win="aboutDialog"),
    S("dlg-aktivitaeten", "dialoge", "fenster", "Aktivitäten",
      'later(() => w.openActivityMgr());', cap="window", win="activity"),
    S("dlg-downloads", "dialoge", "bereich", "Gespeicherte Dateien (about:downloads)",
      'await toMail(); await w.openSavedFilesWnd(); await wait(2500); if (tm.tabInfo.length < 2) throw new Error("kein Tab");'),
    S("dlg-openpgp", "dialoge", "fenster", "OpenPGP-Schlüssel verwalten",
      'later(() => w.openKeyManager());', cap="window", win="KeyManager"),
    # Assistent ist modal zur Schlüsselverwaltung – daher im Fenster selbst öffnen (then); nur ansehen, nichts erzeugen
    S("dlg-openpgp-schluessel-erzeugen", "dialoge", "dialog", "OpenPGP: Neues Schlüsselpaar erzeugen (Assistent)",
      'later(() => w.openKeyManager());', cap="window", win="keyWizard", screen=True,
      then=("KeyManager", 'if (typeof openKeyWizard != "function") throw new Error("openKeyWizard fehlt"); setTimeout(() => openKeyWizard(), 0); return 1;'),
      note="Test-Identität halo@example.invalid; geschlossen ohne „Schlüssel erzeugen“"),
    # Rückfrage der automatischen Komprimierung (sonst aus C++): nicht modal öffnen, nie „Jetzt komprimieren“ drücken
    S("dlg-ordner-komprimieren", "dialoge", "dialog", "Rückfrage „Ordner komprimieren?“ (mit Kästchen und „Weitere Informationen“)",
      'const bag = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag2); bag.setPropertyAsAString("compactSize", "120 MB");'
      ' w.openDialog("chrome://messenger/content/compactFoldersDialog.xhtml", "", "chrome,dialog,centerscreen", bag);', cap="window", win="compactFoldersDialog"),
    S("dlg-verlauf-loeschen", "dialoge", "dialog", "Neueste Chronik löschen (nur ansehen)",
      'later(() => w.toSanitize());', cap="window", win="sanitize"),
    S("dlg-fehlerbehebung", "dialoge", "bereich", "Informationen zur Fehlerbehebung (about:support)",
      'w.openAboutSupport(); await wait(3000);'),
    S("dlg-import", "dialoge", "bereich", "Importieren (about:import)",
      'w.toImport(); await wait(3000);'),
    S("dlg-export", "dialoge", "bereich", "Exportieren",
      'w.toExport(); await wait(3000);'),
    S("dlg-hinweis", "dialoge", "dialog", "Hinweis (Services.prompt.alert)",
      'prompt((ps, bc, t) => ps.asyncAlert(bc, t, "Hinweis", "Das ist ein erfundener Hinweis für den Rundgang."));', cap="window", win="commonDialog", prompt=True),
    S("dlg-fehler", "dialoge", "dialog", "Fehlermeldung (Senden fehlgeschlagen, erfunden)",
      'prompt((ps, bc, t) => ps.asyncAlert(bc, t, "Senden fehlgeschlagen", "Die Nachricht konnte nicht gesendet werden, weil die Verbindung zum Server smtp.example.invalid fehlgeschlagen ist."));', cap="window", win="commonDialog", prompt=True),
    S("dlg-bestaetigung", "dialoge", "dialog", "Bestätigung (OK/Abbrechen)",
      'prompt((ps, bc, t) => ps.asyncConfirm(bc, t, "Ordner löschen", "Soll der Ordner „Newsletter“ wirklich gelöscht werden?"));', cap="window", win="commonDialog", prompt=True),
    S("dlg-drei-knoepfe", "dialoge", "dialog", "Frage mit drei Knöpfen und Kästchen",
      'prompt((ps, bc, t) => ps.asyncConfirmEx(bc, t, "Nachricht speichern", "Möchten Sie die Nachricht speichern?",'
      ' ps.BUTTON_TITLE_SAVE * ps.BUTTON_POS_0 + ps.BUTTON_TITLE_CANCEL * ps.BUTTON_POS_1 + ps.BUTTON_TITLE_DONT_SAVE * ps.BUTTON_POS_2, null, null, null, "Nicht mehr fragen", false));', cap="window", win="commonDialog", prompt=True),
    S("dlg-eingabe", "dialoge", "dialog", "Eingabe (Text)",
      'prompt((ps, bc, t) => ps.asyncPrompt(bc, t, "Ordner umbenennen", "Neuer Name:", "Newsletter", null, false));', cap="window", win="commonDialog", prompt=True),
    S("dlg-anmeldung", "dialoge", "dialog", "Anmeldung (Benutzer und Passwort, leer)",
      'prompt((ps, bc, t) => ps.asyncPromptUsernameAndPassword(bc, t, "Anmeldung", "Bitte melden Sie sich bei mail.example.invalid an.", "", "", null, false));', cap="window", win="commonDialog", prompt=True),
    S("dlg-abonnieren", "dialoge", "dialog", "Abonnieren (Newsgruppen/IMAP-Ordner)", cap="native",
      skip="braucht ein News- oder IMAP-Konto (Netzwerk) – im Testprofil nicht vorhanden"),
    # ohne gespeicherte Aktion für den Dateityp zeigt Thunderbird nur diesen Dialog – geschrieben/geöffnet wird erst nach OK
    S("dlg-anhang-oeffnen", "dialoge", "dialog", "Anhang öffnen: Dialog „Öffnen von …“ (Programmauswahl)",
      'await pick("Inbox", "Bilder vom Ausflug"); const mw = msgDoc().defaultView;'
      ' const a = await until(() => mw.currentAttachments?.find(x => x.name == "Notizen.txt"), 4000); if (!a) throw new Error("Anhang Notizen.txt fehlt");'
      # Sicherheit: mit gespeicherter Aktion würde Thunderbird die Datei sofort mit einem Programm öffnen
      ' const mi = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).getFromTypeAndExtension(a.contentType, "txt");'
      ' if (Cc["@mozilla.org/uriloader/handler-service;1"].getService(Ci.nsIHandlerService).exists(mi) && !mi.alwaysAskBeforeHandling)'
      ' throw new Error("gespeicherte Aktion für " + a.contentType + " – der Dialog käme nicht, Datei würde geöffnet");'
      ' later(() => a.open(mw.browsingContext));', cap="window", win="unknownContentType", screen=True,
      note="Fenster unknownContentType.xhtml; nur angesehen, nie OK – kein PDF (öffnet intern im Tab)"),
    S("dlg-dateiauswahl", "dialoge", "dialog", "Dateiauswahl (Anhängen, Kontaktbild …)", cap="native",
      skip="nativ: macOS-Dateidialog – nicht gestaltbar"),
    S("addons-empfehlungen", "addons", "bereich", "Add-ons: Empfehlungen", cap="native",
      skip="lädt Inhalte aus dem Netz (addons.thunderbird.net) – im Testprofil ausgelassen"),
    # Testschlüssel (OpenPGP) und Chat-Konto am IRC-Testserver legt main() vorher an (SERVER_JS)
    S("verfassen-verschluesselung", "verfassen", "fenster", "Verfassen mit Verschlüsselung (OpenPGP-Testschlüssel)",
      'const cw = await compose({ to: "Halo Test <halo@example.invalid>" }); if (!cw.gSendEncrypted) cw.toggleEncryptMessage(); await wait(1500);',
      cap="window", win="messengercompose"),
    S("verfassen-verschluesselung-menue", "verfassen", "popup", "Verfassen: Menü am Schloss (Verschlüsselung, Signatur)",
      'const cw = await compose({ to: "Halo Test <halo@example.invalid>" }); const b = cw.document.getElementById("button-encryption-options");'
      ' if (!b) throw new Error("Menü der Verschlüsselung fehlt"); return await openBtnPop(b.menupopup || b.querySelector("menupopup"), b);', cap="popup"),
    S("chat-unterhaltung", "chat", "bereich", "Chat-Unterhaltung, Kontaktliste, Teilnehmer (IRC-Testserver)",
      'tm.openTab("chat", {}); await wait(1500); const lb = d.getElementById("contactlistbox");'
      ' const it = await until(() => [...lb.querySelectorAll("richlistitem")].find(i => i.getAttribute("displayname") == "#halo"), 8000);'
      ' if (!it) throw new Error("Chat-Raum fehlt"); lb.selectedItem = it; await wait(2000);'),
]

# Sortierung nach Bereichs-Priorität (Reihenfolge innerhalb eines Bereichs bleibt)
SURFACES.sort(key=lambda s: AREA_KEYS.index(s["area"]))
assert len({s["id"] for s in SURFACES}) == len(SURFACES), "doppelte id"


# ------------------------------------------------------------------ Fenster der Test-PID
WINLIST_JS = r"""
ObjC.import('CoreGraphics');
function run(argv) {
  const pid = parseInt(argv[0]);
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0))) || [];
  return JSON.stringify(list.filter(w => w.kCGWindowOwnerPID == pid).map(w => ({ id: w.kCGWindowNumber, layer: w.kCGWindowLayer,
    x: w.kCGWindowBounds.X, y: w.kCGWindowBounds.Y, w: w.kCGWindowBounds.Width, h: w.kCGWindowBounds.Height, name: w.kCGWindowName || "" })));
}
"""


def windows_of(pid):
    """Fenster (CGWindowList) des Prozesses pid – nur diese dürfen aufgenommen werden."""
    try:
        out = subprocess.run(["osascript", "-l", "JavaScript", "-e", WINLIST_JS, str(pid)], capture_output=True, text=True, timeout=15)
        return json.loads(out.stdout or "[]")
    except Exception:
        return []


def capture_window(pid, wid, path):
    """Ein Fenster per screencapture -l aufnehmen – nur, wenn es zur Test-PID gehört."""
    if not any(w["id"] == wid for w in windows_of(pid)):
        raise RuntimeError(f"Fenster {wid} gehört nicht zur Test-PID {pid}")
    subprocess.run(["screencapture", "-x", "-o", "-l", str(wid), path], check=True, timeout=20)
    return path


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def crop_to_popup(path, win, wins, margin=16, cap=None):
    """Panels als Kindfenster: screencapture liefert das Elternfenster mit – dann auf das Panel (plus Rand) zuschneiden.
    cap = das aufgenommene Fenster (Panel), win = das Rechteck, auf das zugeschnitten wird."""
    width, height = png_size(path)
    if width <= win["w"] * 3 + 4 and height <= win["h"] * 3 + 4 and abs(width / max(win["w"], 1) - height / max(win["h"], 1)) < 0.1:
        return  # Bild zeigt nur das Popup
    hosts = [(h, s) for h in sorted(wins, key=lambda w: -w["w"] * w["h"]) for s in (1, 2, 3) if h["w"] * s == width and h["h"] * s == height]
    if not hosts and cap:
        # ragt das Panel über das Elternfenster hinaus (z. B. „+“ der Today-Pane am rechten Rand), zeigt
        # das Bild die Vereinigung beider Fenster
        for h in sorted(wins, key=lambda w: -w["w"] * w["h"]):
            x, y = min(h["x"], cap["x"]), min(h["y"], cap["y"])
            uw, uh = max(h["x"] + h["w"], cap["x"] + cap["w"]) - x, max(h["y"] + h["h"], cap["y"] + cap["h"]) - y
            hosts += [({"x": x, "y": y}, s) for s in (1, 2, 3) if uw * s == width and uh * s == height]
    for host, scale in hosts[:1]:
        x0 = max(0, (win["x"] - host["x"] - margin) * scale)
        y0 = max(0, (win["y"] - host["y"] - margin) * scale)
        cw = min(width - x0, (win["w"] + 2 * margin) * scale)
        ch = min(height - y0, (win["h"] + 2 * margin) * scale)
        subprocess.run(["sips", "-c", str(int(ch)), str(int(cw)), "--cropOffset", str(int(y0)), str(int(x0)), path, "--out", path],
                       capture_output=True, timeout=20)


# ------------------------------------------------------------------ Rundgang
CAPS = {"unhandledPromptBehavior": "ignore"}


def connect(port):
    m = ht.Marionette(port, CAPS)
    m.cmd("WebDriver:SetTimeouts", {"script": 180000})
    m.sock.settimeout(240)  # hängt ein Befehl, nach 4 Minuten abbrechen statt nach 11
    return m


class Tour:
    def __init__(self, m, port, pid, out, scheme, probe=None):
        self.m, self.port, self.pid, self.out, self.scheme, self.probe = m, port, pid, out, scheme, probe
        self.main = self.handle()
        self.results = []
        self.echo = True

    def reconnect(self):
        """Nach einer Zeitüberschreitung: neue Verbindung (die alte Antwort käme sonst beim nächsten Befehl an)."""
        try:
            self.m.sock.close()
        except Exception:
            pass
        time.sleep(1)
        self.m = connect(self.port)
        print("   (Marionette neu verbunden)", flush=True)

    def handle(self):
        r = self.m.cmd("WebDriver:GetWindowHandle")
        return r["value"] if isinstance(r, dict) else r

    def handles(self):
        r = self.m.cmd("WebDriver:GetWindowHandles")
        r = r.get("value") if isinstance(r, dict) else r
        return r if isinstance(r, list) else []

    def js(self, body):
        try:
            return self.m.js(TOUR_JS + body)
        except RuntimeError as e:
            # Marionette schließt eine noch offene Rückfrage (commonDialog) und meldet das – dann noch einmal
            if "Unexpected" in str(e) and "dialog" in str(e):
                return self.m.js(TOUR_JS + body)
            raise

    def win_js(self, body):
        """JavaScript im gerade gewählten (Neben-)Fenster."""
        script = ("return (async () => { const w = window, d = document; const wait = ms => new Promise(r => setTimeout(r, ms));"
                  " const until = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { const v = fn(); if (v) return v; await wait(100); } return fn(); };"
                  + body + "})();")
        return self.m.cmd("WebDriver:ExecuteScript", {"script": script, "args": []}).get("value")

    def path(self, sid, n=0):
        return os.path.join(self.out, f"{self.scheme}-{sid}{'' if not n else f'-{n + 1}'}.png")

    def screenshot(self, path):
        data = self.m.cmd("WebDriver:TakeScreenshot", {})["value"]
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        return path

    def do_probe(self, sid, in_window=False):
        if not self.probe:
            return
        try:
            if in_window:
                res = self.win_js(self.probe)
            else:
                res = self.js("const popup = w.__tourPopup; const cur = tabDoc();" + self.probe)
            print(f"PROBE {sid} {json.dumps(res, ensure_ascii=False)}", flush=True)
        except Exception as e:
            print(f"PROBE {sid} FEHLER {e}", flush=True)

    def cleanup(self, s=None):
        try:
            self.m.cmd("WebDriver:SwitchToWindow", {"handle": self.main, "focus": False})
        except Exception:
            pass
        if s and s.get("close"):
            try:
                self.js(s["close"] + " return 1;")
            except Exception as e:
                print(f"   (Schließen {s['id']}: {e})", flush=True)
        try:
            left = self.js(CLEANUP_JS)
            if left:
                print(f"   (Reste nach {s['id'] if s else 'Start'}: {', '.join(left)})", flush=True)
        except Exception as e:
            print(f"   (Aufräumen: {e})", flush=True)
        # Maus aus der Liste nehmen (Hover-Zustände)
        try:
            self.m.pointer([{"type": "pointerMove", "x": 3, "y": 3, "origin": "viewport"}])
        except Exception:
            pass

    def visit(self, s, retry=True):
        sid = s["id"]
        if s.get("skip"):
            return self.report(s, False, s["skip"])
        if s["cap"] == "popup" and retry:
            # Popups in Tab-Inhalten (Adressbuch, Einstellungen) gehen nur im aktiven
            # Fenster auf – ist Thunderbird gerade im Hintergrund, einmal nach vorn holen
            self.echo = False  # ersten Versuch erst melden, wenn feststeht, ob er zählt
            entry = self.visit(s, retry=False)
            self.echo = True
            if entry["ok"] or "nicht offen" not in entry.get("reason", ""):
                self.print_entry(entry)
                return entry
            self.results.pop()
            print(f"   ({sid}: Popup ging nicht auf – Fenster nach vorn, neuer Versuch)", flush=True)
            self.js("w.focus(); await wait(1200); return 1;")
            return self.visit(s, retry=False)
        try:
            self.m.cmd("WebDriver:SwitchToWindow", {"handle": self.main, "focus": False})
            wdt, hgt = s.get("size", MAIN_SIZE)
            self.js(f"if (w.outerWidth != {wdt} || w.outerHeight != {hgt}) {{ w.resizeTo({wdt}, {hgt}); await wait(1200); }} return 1;")
            before = set(self.handles())
            before_wins = {w["id"] for w in windows_of(self.pid)} if s.get("prompt") or s.get("screen") else set()
            res = self.js(s["open"] + "\n;return null;")
            res = res if isinstance(res, dict) else {}
            if res.get("pointer") and s["cap"] == "popup":
                # Tooltips: echte Zeigerbewegung (Marionette) über das Element, dann ruhen lassen;
                # after merkt den offenen Tooltip für die Aufnahme
                x, y = res["pointer"]
                self.m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}])
                time.sleep(s.get("hover", 0.8))
            if s.get("after"):
                self.js(s["after"] + "\n;return null;")
            if s["cap"] == "popup":
                files = self.capture_popups(sid)
                self.do_probe(sid)
                return self.report(s, True, files)
            if s.get("prompt"):
                return self.capture_prompt(s, before_wins)
            if s["cap"] == "window":
                return self.capture_new_window(s, before, before_wins)
            if s.get("size"):
                # Mindestbreite hängt vom Bereich ab – nach dem Öffnen noch einmal anpassen
                self.js(f"w.resizeTo({wdt}, {hgt}); await wait(1500); return 1;")
            if res.get("pointer"):
                x, y = res["pointer"]
                self.m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}])
                time.sleep(0.8)
            time.sleep(s.get("settle", 0.6))
            path = self.screenshot(self.path(sid))
            self.do_probe(sid)
            return self.report(s, True, [path])
        except Exception as e:
            if isinstance(e, (TimeoutError, OSError)) or "timed out" in str(e):
                try:
                    self.reconnect()
                except Exception as e2:
                    print(f"   (Neu verbinden fehlgeschlagen: {e2})", flush=True)
            return self.report(s, False, (str(e).splitlines() or [repr(e)])[0][:300])
        finally:
            self.cleanup(s)

    def capture_popups(self, sid):
        info = None
        for _ in range(20):
            info = self.js(POPUP_RECT_JS)
            if info and info["state"] == "open":
                break
            time.sleep(0.2)
        if not info or info["state"] != "open":
            raise RuntimeError(f"Popup nicht offen ({info and info['state']})")
        if info["pid"] != self.pid:
            raise RuntimeError("Marionette gehört nicht zum gestarteten Test-Thunderbird")
        # Popup-Fenster der Test-PID: das zum gemerkten Popup passende zuerst
        # (Menüs liegen auf Ebene 101, Panels teils auf Ebene 0 ohne Titel),
        # weitere offene Menüs (Untermenüs, Ebene > 0) danach
        dist = lambda w: abs(w["x"] - info["x"]) + abs(w["y"] - info["y"]) + abs(w["w"] - info["w"]) + abs(w["h"] - info["h"])
        primary, extra = None, []
        for _ in range(12):
            wins = [w for w in windows_of(self.pid) if w["w"] > 4 and w["h"] > 4]
            cand = sorted((w for w in wins if w["layer"] > 0 or not w["name"]), key=dist)
            if cand and dist(cand[0]) <= 80:
                primary = cand[0]
                extra = [w for w in cand[1:] if w["layer"] > 0]
                break
            time.sleep(0.3)
        if not primary:
            raise RuntimeError("kein passendes Popup-Fenster der Test-PID gefunden")
        files = []
        for n, win in enumerate([primary] + extra[:3]):
            path = capture_window(self.pid, win["id"], self.path(sid, n))
            # das gemerkte Popup auf sein eigenes Rechteck zuschneiden: manche Panels (z. B. „+“ der
            # Today-Pane) liefern als Fenster das ganze Hauptfenster
            crop_to_popup(path, info if n == 0 else win, wins, cap=win)
            files.append(path)
        return files

    def win_sync(self, script):
        """Kurzes, synchrones Skript im gewählten Fenster (kein Warten im Fenster – ein
        geschlossenes Fenster würde ein wartendes Skript sonst nie beenden)."""
        try:
            return self.m.cmd("WebDriver:ExecuteScript", {"script": script, "args": []}).get("value")
        except Exception:
            return None

    def capture_prompt(self, s, before_wins):
        """Rückfragen (commonDialog) per screencapture: Marionette würde sie beim nächsten Befehl darin schließen."""
        win = None
        for _ in range(40):
            new = [w for w in windows_of(self.pid) if w["id"] not in before_wins and w["w"] > 80 and w["h"] > 40 and w["name"]]
            if new:
                win = max(new, key=lambda w: w["id"])
                break
            time.sleep(0.25)
        if not win:
            raise RuntimeError("keine Rückfrage (kein neues Fenster der Test-PID)")
        time.sleep(s.get("settle", 1.2))
        path = capture_window(self.pid, win["id"], self.path(s["id"]))
        return self.report(s, True, [path])

    def find_new_window(self, before, part, timeout=15):
        """Neues Fenster (nicht in before), dessen URL part enthält – Handle oder None."""
        seen = {}
        end = time.time() + timeout
        while time.time() < end:
            for h in [h for h in self.handles() if h not in before]:
                if seen.get(h, "") in ("", "about:blank"):
                    self.m.cmd("WebDriver:SwitchToWindow", {"handle": h, "focus": False})
                    seen[h] = self.win_sync("return location.href;") or ""
                if part in seen[h] and self.win_sync("return document.readyState;") == "complete":
                    return h
            time.sleep(0.25)
        return None

    def run_then(self, s, before):
        """Zweiter Schritt in einem Fenster, das open geöffnet hat (then=(URL-Teil, JS)): nötig, wenn
        dieses Fenster modal ist – dann ruhen die Zeitgeber des Hauptfensters und dort darf nicht gewartet werden."""
        part, script = s["then"]
        h = self.find_new_window(before, part)
        if not h:
            raise RuntimeError(f"Fenster „{part}“ für den zweiten Schritt nicht gefunden")
        self.m.cmd("WebDriver:SwitchToWindow", {"handle": h, "focus": False})
        time.sleep(1.0)
        self.win_js(script)

    def capture_screen_window(self, s, before_wins):
        """Fenster per screencapture -l (mit Titelleiste) statt WebDriver:TakeScreenshot – für Fenster, deren
        Hintergrund macOS zeichnet (dunkel kam per TakeScreenshot nur eine weiße Fläche). Nur Fenster der Test-PID."""
        title = self.win_sync("return document.title;") or ""
        # Ebene 0: normale Fenster, Ebene 8: modale Fenster (z. B. OpenPGP-Assistent, ohne Titel)
        new = [w for w in windows_of(self.pid) if w["id"] not in before_wins and w["layer"] in (0, 8) and w["w"] > 80 and w["h"] > 40]
        win = max((w for w in new if title and w["name"] == title), key=lambda w: w["id"], default=None) \
            or max(new, key=lambda w: w["id"], default=None)
        if not win:
            raise RuntimeError(f"Fenster „{title}“ der Test-PID nicht gefunden")
        return capture_window(self.pid, win["id"], self.path(s["id"]))

    def capture_new_window(self, s, before, before_wins=frozenset()):
        sid, want = s["id"], s.get("win")
        if s.get("then"):
            self.run_then(s, before)
        seen, target = {}, None
        end = time.time() + s.get("timeout", 15)
        while time.time() < end and not target:
            for h in [h for h in self.handles() if h not in before]:
                if seen.get(h, "") in ("", "about:blank"):
                    self.m.cmd("WebDriver:SwitchToWindow", {"handle": h, "focus": False})
                    seen[h] = self.win_sync("return location.href;") or ""
                if want and want in seen[h]:
                    target = h
                    break
            if not target and not want and any(v not in ("", "about:blank") for v in seen.values()):
                time.sleep(0.6)  # evtl. folgt noch ein Fenster
                target = [h for h, v in seen.items() if v not in ("", "about:blank")][-1]
            if not target:
                time.sleep(0.25)
        if not target:
            opened = ", ".join(os.path.basename(v) for v in seen.values()) or "keins"
            raise RuntimeError(f"Fenster „{want or 'neu'}“ nicht gefunden (neue Fenster: {opened})")
        self.m.cmd("WebDriver:SwitchToWindow", {"handle": target, "focus": False})
        for _ in range(40):
            if self.win_sync("return document.readyState;") == "complete":
                break
            time.sleep(0.2)
        time.sleep(s.get("settle", 1.4))
        if s.get("inwin"):
            self.win_js(s["inwin"])
        path = self.capture_screen_window(s, before_wins) if s.get("screen") else self.screenshot(self.path(sid))
        self.do_probe(sid, in_window=True)
        return self.report(s, True, [path])

    def report(self, s, ok, detail):
        entry = {"id": s["id"], "area": s["area"], "kind": s["kind"], "title": s["title"], "ok": ok}
        if ok:
            entry["files"] = [os.path.relpath(f, ROOT) for f in detail]
        else:
            entry["reason"] = detail
        self.results.append(entry)
        if self.echo:
            self.print_entry(entry)
        return entry

    @staticmethod
    def print_entry(entry):
        if entry["ok"]:
            print(f"OK {entry['id']} → {', '.join(entry['files'])}", flush=True)
        else:
            print(f"NICHT ERREICHBAR {entry['id']} – {entry['reason']}", flush=True)


# ------------------------------------------------------------------ Listen und Markdown
def select(args):
    chosen = SURFACES
    if args.area:
        areas = set(args.area.split(","))
        unknown = areas - set(AREA_KEYS)
        if unknown:
            sys.exit(f"unbekannter Bereich: {', '.join(unknown)} (bekannt: {', '.join(AREA_KEYS)})")
        chosen = [s for s in chosen if s["area"] in areas]
    if args.only:
        ids = args.only.split(",")
        unknown = set(ids) - {s["id"] for s in SURFACES}
        if unknown:
            sys.exit(f"unbekannte id: {', '.join(sorted(unknown))}")
        chosen = [s for s in chosen if s["id"] in ids]
    return chosen


def clean_reason(text):
    return re.sub(r"^(Error|TypeError|RuntimeError): ", "", text or "").replace("\n", " ")


def load_results(out):
    res = {}
    for scheme in ("hell", "dunkel"):
        p = os.path.join(out, f"{scheme}-ergebnis.json")
        if os.path.exists(p):
            for e in json.load(open(p)):
                res.setdefault(e["id"], {})[scheme] = e
    return res


# Besonderheiten, die beim Bau des Rundgangs aufgefallen sind (für Inventar und Durchsicht)
BESONDERHEITEN = [
    "Menüleiste: unter macOS nativ (NSMenu) – weder gestaltbar noch aufnehmbar; Inhalt siehe Einträge `menueleiste-*`.",
    "Kontextmenüs sind in Thunderbird nicht nativ (`widget.macos.native-context-menus` = false) – sie laufen über "
    "`menupopup` und damit über das Menü-CSS von halo.spaces.",
    "Popups/Panels sind eigene Fenster: Menüs liegen auf Fensterebene 101, Panels (z. B. `mcNewPopup`, "
    "`mcQuickPanel`) als titellose Kindfenster auf Ebene 0 – `screencapture -l` liefert dort das Elternfenster mit, "
    "der Rundgang schneidet auf das Panel (plus 16 pt Rand) zu.",
    "Mailkopf: halo.spaces blendet die Symbolleiste im Mailkopf aus – „Mehr“-Menü, Kopf anpassen und deren "
    "Kontextmenü sind dadurch nicht erreichbar (Aktionen über Toolbar und Kontextmenü der Liste).",
    "App-Menü (≡): Knopf in halo.spaces ausgeblendet; der Rundgang öffnet das Menü am Suchfeld.",
    "Bereiche-Leiste anpassen: `gSpacesToolbar.showCustomize()` verankert das Panel am ausgeblendeten "
    "`collapseButton` und geht dann nicht auf (auch über das Kontextmenü der Leiste) – möglicher Fehler, prüfen.",
    "Bereiche-Knopf (`spacesPinnedButton`) ist in halo.spaces der Seitenleisten-Knopf; sein Menü wird blockiert.",
    "Kalender: Suchliste „Termine suchen“ (`#bottom-events-box`) ist bewusst ausgeblendet (gibt es bei Apple nicht).",
    "Toolbar: halo.spaces klappt bei wenig Platz Knöpfe ein (Verschieben, Markieren, Junk …); der Rundgang "
    "schließt dafür die Today-Pane und nutzt die volle Bildschirmbreite.",
    "Adressbuch-, Konto- und Einstellungsdialoge sind meist Unterdialoge im Tab (SubDialog), keine Fenster; "
    "neue Konten und Adressbücher öffnen den Account Hub (`<dialog>` im Hauptfenster).",
    "Mindestbreite: Mit den Testdaten lässt sich das Fenster in der Mailansicht nicht schmaler "
    "ziehen als rund 1490 px (min-width von halo.spaces, mit Today-Pane), im Kalender 1136 px – die „schmal“-Zustände zeigen "
    "daher die kleinste mögliche Breite.",
    "Ohne Konto mit Server sind „Abrufen“ (Toolbar, Ordnerliste) deaktiviert – deren Menüs bleiben unerreichbar.",
    "Druckvorschau und andere Systemzugriffe können macOS-Berechtigungsabfragen auslösen (Systemdialog eines "
    "anderen Prozesses, gilt für das ganze Thunderbird-Programm) – nie im Namen des Nutzers beantworten.",
    "Mails nur für einzelne Oberflächen (Einladung, Empfangsbestätigung, Betrugswarnung) legt der Rundgang mit "
    "Message-ID `halo-temp-…` an und löscht sie beim Aufräumen wieder (nur im Testprofil) – die übrigen Bilder "
    "behalten dieselbe Liste. Die Knöpfe dieser Leisten werden nie ausgelöst (sie würden antworten).",
    "Modale Dialoge (z. B. Suchordner) halten die Zeitgeber des Hauptfensters an: zweite Schritte darin laufen "
    "über `then=(URL-Teil, JS)` im Dialog selbst, das Aufräumen wartet über den Zeitgeber des Moduls und schließt "
    "die neuesten Fenster zuerst.",
    "Popups der HTML-Felder im Schnellfenster (Datum: `DateTimePickerPanel`, Auswahlliste: `#ContentSelectDropdown`) "
    "gehen nur nach `notifyUserGestureActivation()` auf; das Bild `-2` zeigt das Schnellfenster dazu.",
    "Tooltips (`aHTMLTooltip`, `itemTooltip`) füllen sich nur bei echter Zeigerbewegung: der Rundgang fährt per "
    "Marionette über das Element (`hoverAt`, S()-Parameter `after`/`hover`) und nimmt den offenen Tooltip auf.",
    "Anhang öffnen: ohne gespeicherte Aktion für den Dateityp zeigt Thunderbird nur den Dialog „Öffnen von …“ – "
    "der Rundgang prüft das vorher (sonst würde die Datei sofort mit einem Programm geöffnet) und schließt ohne OK.",
    "Einige Fenster (Filterprotokoll, Junk-Protokoll, „Öffnen von …“, OpenPGP-Assistent) kamen dunkel per "
    "`WebDriver:TakeScreenshot` nur als weiße Fläche mit hellem Text heraus, obwohl das Fenster auf dem Bildschirm "
    "dunkel ist – sie werden mit `screen=True` per `screencapture -l` (mit Titelleiste) aufgenommen.",
]


def write_inventory(path, out):
    """tests/inventar.md aus der Tabelle und den Ergebnissen des letzten Rundgangs."""
    res = load_results(out)
    lines = ["# Inventar der Oberflächen", "",
             "Erzeugt mit `python3 tests/ui_tour.py --inventar tests/inventar.md --out " + os.path.relpath(out, ROOT) + "`",
             "aus der Tabelle `SURFACES` in `tests/ui_tour.py` und dem Ergebnis des letzten",
             "Rundgangs (hell und dunkel). Bilder: `" + os.path.relpath(out, ROOT) + "/<hell|dunkel>-<id>.png`",
             "(gitignored, nur Testprofil mit erfundenen Daten).", "",
             "Arten: bereich (Hauptansicht/Tab), fenster (eigenes Fenster), dialog, menue, popup",
             "(eigenes Widget, per `screencapture -l` der Test-PID aufgenommen), zustand (Variante",
             "einer Ansicht: Hover, Fokus, schmal, leer …).", "",
             "## Besonderheiten", "", *[f"- {b}" for b in BESONDERHEITEN], ""]
    for prio, (key, title, files) in enumerate(AREAS, 1):
        items = [s for s in SURFACES if s["area"] == key]
        if not items:
            continue
        lines += [f"## {prio}. {title} (`{key}`)", "", f"CSS/Code: {files}", "",
                  "| id | Titel | Art | erreichbar | Hinweis |", "|---|---|---|---|---|"]
        for s in items:
            r = res.get(s["id"], {})
            oks = [sch for sch, e in r.items() if e["ok"]]
            if s.get("skip"):
                reach, note = "nein", s["skip"]
            elif not r:
                reach, note = "?", "noch nicht besucht"
            elif len(oks) == len(r):
                reach, note = "ja", ""
            elif oks:
                bad = {sch: e.get("reason", "") for sch, e in r.items() if not e["ok"]}
                reach, note = "teilweise", "; ".join(f"{k}: {clean_reason(v)}" for k, v in bad.items())
            else:
                reach, note = "nein", clean_reason(next(iter(r.values())).get("reason", ""))
            if s.get("note"):
                note = (note + "; " if note else "") + s["note"]
            note = note.replace("|", "/")
            lines.append(f"| `{s['id']}` | {s['title']} | {s['kind']} | {reach} | {note} |")
        lines.append("")
    total = len(SURFACES)
    reached = sum(1 for s in SURFACES if any(e["ok"] for e in res.get(s["id"], {}).values()))
    lines += [f"Gesamt: {total} Oberflächen, davon {reached} mit Bild.", ""]
    with open(path, "w") as f:
        f.write("\n".join(lines))
    print(f"Inventar → {path}")


def old_progress(path):
    """Bisherige Einträge „erledigt …“ aus fortschritt.md (id → Status), damit ein Neuschreiben sie behält."""
    keep = {}
    if os.path.exists(path):
        for line in open(path):
            m = re.match(r"- \[.\] `([^`]+)` – .*?: (erledigt\b.*)$", line.rstrip("\n"))
            if m:
                keep[m.group(1)] = m.group(2)
    return keep


def write_progress(path, out):
    """tests/fortschritt.md: jede Oberfläche offen bzw. übersprungen (mit Grund); „erledigt“ bleibt erhalten."""
    res = load_results(out)
    done = old_progress(path)
    lines = ["# Fortschritt der Design-Durchsicht", "",
             "Zu Beginn jeder Runde lesen. Status je Oberfläche: `offen`, `erledigt` (mit Commit)",
             "oder `übersprungen: Grund`. Reihenfolge = Priorität (siehe tests/inventar.md).", "",
             "Vorher-Bilder: `" + os.path.relpath(out, ROOT) + "/` (hell-*/dunkel-*), Paket `tests/shots/review-r1.xpi`.", ""]
    for prio, (key, title, _files) in enumerate(AREAS, 1):
        items = [s for s in SURFACES if s["area"] == key]
        if not items:
            continue
        lines += [f"## {prio}. {title} (`{key}`)", ""]
        for s in items:
            r = res.get(s["id"], {})
            if s["id"] in done:
                status = done[s["id"]]
            elif s.get("skip"):
                status = f"übersprungen: {s['skip']}"
            elif r and not any(e["ok"] for e in r.values()):
                status = "übersprungen: nicht erreichbar – " + clean_reason(next(iter(r.values())).get("reason", ""))
            else:
                status = "offen"
            lines.append(f"- [{' ' if status == 'offen' else 'x'}] `{s['id']}` – {s['title']}: {status}")
        lines.append("")
    with open(path, "w") as f:
        f.write("\n".join(lines))
    print(f"Fortschritt → {path}")


# ------------------------------------------------------------------ Start
def main():
    ap = argparse.ArgumentParser(description="Rundgang durch alle Oberflächen (Testprofil, erfundene Daten)")
    ap.add_argument("--xpi", help="Paket (Standard: neuestes dist/halo-spaces-*.xpi)")
    ap.add_argument("--port", type=int, default=2851, help="Marionette-Port (Standard 2851; nie den eines anderen Laufs)")
    ap.add_argument("--dark", action="store_true", help="im Dunkelmodus (Bilder dunkel-*.png)")
    ap.add_argument("--out", default=DEFAULT_OUT, help="Ordner für die Bilder (Standard tests/shots/tour/aktuell)")
    ap.add_argument("--only", help="nur diese ids (Komma-getrennt)")
    ap.add_argument("--area", help="nur diese Bereiche (Komma-getrennt): " + ", ".join(AREA_KEYS))
    ap.add_argument("--list", action="store_true", help="Oberflächen auflisten und beenden")
    ap.add_argument("--probe", help="JavaScript nach dem Öffnen jeder Oberfläche ausführen und als JSON ausgeben "
                                    "(Hauptfenster: Hilfen aus PRELUDE/TOUR_JS, popup, cur; Fenster: w, d)")
    ap.add_argument("--keep", action="store_true", help="Testprofil nicht löschen")
    ap.add_argument("--tb", default=ht.DEFAULT_TB, help="Thunderbird-Programm")
    ap.add_argument("--tb-log", help="Ausgabe von Thunderbird in diese Datei")
    ap.add_argument("--inventar", metavar="DATEI", help="Inventar (Markdown) aus Tabelle und Ergebnissen in --out schreiben")
    ap.add_argument("--fortschritt", metavar="DATEI", help="Fortschrittsliste (Markdown) schreiben")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    # bei einem Hänger: kill -USR1 <pid> gibt den Python-Stack aus
    import faulthandler
    import signal
    faulthandler.register(signal.SIGUSR1)

    if args.inventar or args.fortschritt:
        if args.inventar:
            write_inventory(args.inventar, out)
        if args.fortschritt:
            write_progress(args.fortschritt, out)
        return
    chosen = select(args)
    if args.list:
        for s in chosen:
            note = f"  [{s['skip']}]" if s.get("skip") else ""
            print(f"{s['area']:<14} {s['id']:<36} {s['kind']:<8} {s['cap']:<7} {s['title']}{note}")
        print(f"\n{len(chosen)} Oberflächen")
        return
    if args.port == ht.PORT:
        sys.exit(f"Port {ht.PORT} gehört dem normalen Testlauf – bitte einen eigenen Port wählen (--port)")
    if sys.platform != "darwin":
        print("Hinweis: Popups werden nur unter macOS (screencapture) aufgenommen.", flush=True)

    xpi = args.xpi or max((x for x in glob.glob(os.path.join(ROOT, "dist", "halo-spaces-*.xpi")) if not x.endswith("-atn.xpi")),
                          key=os.path.getmtime, default=None)
    if not xpi or not os.path.exists(xpi):
        sys.exit("Kein Paket gefunden – zuerst ./build.sh oder --xpi")
    os.makedirs(out, exist_ok=True)
    scheme = "dunkel" if args.dark else "hell"
    profile = ht.create_profile(xpi, args.port, args.dark, prefix="halo-tour-")
    print(f"Rundgang {scheme} · Paket {os.path.relpath(xpi, ROOT) if xpi.startswith(ROOT) else xpi} · Profil {profile}", flush=True)
    proc = ht.start_thunderbird(args.tb, profile, args.tb_log)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from testserver import MailServers
    servers = MailServers()
    tour = None
    try:
        if not ht.wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)
        m = connect(args.port)
        # Sicherheit: nur das selbst gestartete Thunderbird im Temp-Profil
        info = m.js("return { pid: Services.appinfo.processID, profile: PathUtils.profileDir };")
        if info["pid"] != proc.pid or os.path.realpath(info["profile"]) != os.path.realpath(profile):
            sys.exit(f"Marionette auf Port {args.port} gehört nicht zum gestarteten Test-Thunderbird ({info})")
        m.js("""for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
                w.moveTo(0, 0); w.resizeTo(1500, 900); await wait(800); return 1;""")
        data = m.js(TOUR_JS + DATA_JS)
        print(f"Testdaten: {json.dumps(data, ensure_ascii=False)}", flush=True)
        # Chat (IRC-Testserver, nur 127.0.0.1) und OpenPGP-Testschlüssel – ändern keine anderen Oberflächen
        m.cmd("WebDriver:SetTimeouts", {"script": 120000})
        print(f"Chat und Schlüssel: {json.dumps(m.js(TOUR_JS + SERVER_JS % servers.irc_port), ensure_ascii=False)}", flush=True)
        servers.irc.say("#halo", "anna", "Hallo! Kommst du morgen zum Treffen?")
        servers.irc.say("#halo", "ben", "Ich bringe die Unterlagen mit.")
        m.cmd("WebDriver:SetTimeouts", {"script": 30000})
        m.js("await wait(2500); return 1;")  # Karten, Kalender und Adressbuch nachziehen lassen
        tour = Tour(m, args.port, proc.pid, out, scheme, args.probe)
        tour.cleanup()
        for s in chosen:
            tour.visit(s)
    finally:
        ht.stop_thunderbird(args.port, proc)
        servers.close()
        if not args.keep:
            shutil.rmtree(profile, ignore_errors=True)
    if tour:
        # Ergebnis zusammenführen (frühere Läufe mit --only behalten)
        rp = os.path.join(out, f"{scheme}-ergebnis.json")
        old = {e["id"]: e for e in json.load(open(rp))} if os.path.exists(rp) else {}
        for e in tour.results:
            old[e["id"]] = e
        order = {s["id"]: i for i, s in enumerate(SURFACES)}
        json.dump(sorted(old.values(), key=lambda e: order.get(e["id"], 9999)), open(rp, "w"), indent=1, ensure_ascii=False)
        ok = sum(1 for e in tour.results if e["ok"])
        print(f"\n{ok} von {len(tour.results)} Oberflächen aufgenommen, {len(tour.results) - ok} nicht erreichbar → {rp}")


if __name__ == "__main__":
    main()
