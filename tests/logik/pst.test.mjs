// Outlook-Datendatei (PST) importieren: welche Ordner übernommen werden, Mail als
// RFC-822-Text (Kopf, Text/HTML, Anhänge), feste Message-IDs für den zweiten Import
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { PstImport: P } = lade();
const n = x => JSON.parse(JSON.stringify(x));
const ordner = (name, count, cls, children = []) => ({ name, count, cls, children });

// Teil der Mail mit Kopf und Inhalt (Base64 entschlüsselt) zu einem Content-Type
function teil(mail, typ) {
  const i = mail.indexOf(`Content-Type: ${typ}`);
  assert.ok(i >= 0, `Teil ${typ} fehlt`);
  const rest = mail.slice(i);
  const [kopf, ...inhalt] = rest.split("\r\n\r\n");
  const b64 = inhalt.join("\r\n\r\n").split("\r\n--")[0].replace(/\r\n/g, "");
  return { kopf, daten: Buffer.from(b64, "base64") };
}

test("PST: Ordnerarten nach Klasse, ohne Klasse wie Mail", () => {
  assert.equal(P.kind(""), "mail");
  assert.equal(P.kind("IPF.Note"), "mail");
  assert.equal(P.kind("IPF.Note.OutlookHomepage"), "mail");
  assert.equal(P.kind("IPF.Contact"), "contacts");
  assert.equal(P.kind("IPF.Appointment.Birthday"), "calendar");
  assert.equal(P.kind("IPF.Task"), "tasks");
  assert.equal(P.kind("Outlook.Reminder"), "other");
  assert.equal(P.kind("IPF.Configuration"), "other");
});

test("PST: leere Hülle oben fällt weg, leere Zweige und Systemordner bleiben draußen", () => {
  // wie enron.pst aus pst-extractor: „Top of Personal Folders“ als einzige Hülle
  const pst = ordner("", 0, "", [
    ordner("Top of Personal Folders", 0, "", [
      ordner("Deleted Items", 0, ""),
      ordner("lokay-m", 0, "IPF.Note", [ordner("Personal", 47, "IPF.Note"), ordner("Sent Items", 2, "IPF.Note")]),
      ordner("Kontakte", 3, "IPF.Contact"),
    ]),
    ordner("Search Root", 0, ""),
    ordner("Reminders", 22, "Outlook.Reminder"),
  ]);
  const plan = P.plan(pst);
  assert.deepEqual(n(plan.mail.map(f => [f.path.join("/"), f.count, f.depth])),
    [["lokay-m", 0, 0], ["lokay-m/Personal", 47, 1], ["lokay-m/Sent Items", 2, 1]]);
  assert.deepEqual(n(plan.contacts.map(f => [f.name, f.count])), [["Kontakte", 3]]);
});

test("PST: OST mit zwei Hüllen (Root - Mailbox, IPM_SUBTREE) – Mailordner direkt unter dem Ziel", () => {
  const ost = ordner("", 0, "", [
    ordner("Root - Public", 0, "", [ordner("IPM_SUBTREE", 0, "")]),
    ordner("Root - Mailbox", 0, "", [
      ordner("Finder", 0, "", [ordner("Tracked Mail Processing", 0, "IPF.Note")]),
      ordner("IPM_SUBTREE", 0, "", [ordner("Inbox", 10, "IPF.Note"), ordner("Outbox", 0, "IPF.Note"), ordner("Calendar", 9, "IPF.Appointment")]),
    ]),
  ]);
  const plan = P.plan(ost);
  assert.deepEqual(n(plan.mail.map(f => f.path.join("/"))), ["Inbox"]);
  assert.deepEqual(n(plan.calendar.map(f => f.name)), ["Calendar"]);
});

test("PST: Ordnernamen ohne Schrägstrich, nie leer", () => {
  assert.equal(P.folderName("Rechnungen/2019"), "Rechnungen-2019");
  assert.equal(P.folderName(""), "Outlook");
  assert.equal(P.folderName(".versteckt"), "versteckt");
});

test("PST: Mail mit Text, HTML, Umlauten und Anhang als RFC-822", () => {
  const mail = P.mime({
    subject: "Grüße aus Wien", date: new Date(Date.UTC(2026, 10, 17, 13, 5, 9)),
    from: { name: "Dora Müller", email: "dora@example.invalid" },
    to: [{ name: "Halo, Test", email: "halo@example.invalid" }, { name: "", email: "x@example.invalid" }],
    cc: [{ name: "Nur Name", email: "/O=EXCHANGE/CN=X" }],
    text: "Hallo Welt – schön", html: "<p>Hallo <b>Welt</b></p>", messageId: "<abc@example.invalid>",
    attachments: [{ name: "Rechnung.pdf", type: "application/pdf", data: new Uint8Array([37, 80, 68, 70, 0, 255]) },
      { name: "Bild ä.png", type: "image/png", data: new Uint8Array([1, 2, 3]), cid: "<bild1>", inline: true }],
  });
  assert.match(mail, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <dora@example\.invalid>\r\n/);
  assert.match(mail, /\r\nTo: "Halo, Test" <halo@example\.invalid>,\r\n x@example\.invalid\r\n/);
  assert.ok(!/\r\nCc:/.test(mail.split("\r\n\r\n")[0]) || /Cc: Nur Name/.test(mail));
  assert.match(mail, /\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(mail, /\r\nDate: Tue, 17 Nov 2026 13:05:09 \+0000\r\n/);
  assert.match(mail, /\r\nMessage-ID: <abc@example\.invalid>\r\n/);
  assert.match(mail, /\r\nContent-Type: multipart\/mixed; boundary="/);
  assert.match(mail, /Content-Type: multipart\/alternative; boundary="/);
  assert.equal(teil(mail, "text/plain").daten.toString("utf8"), "Hallo Welt – schön");
  assert.equal(teil(mail, "text/html").daten.toString("utf8"), "<p>Hallo <b>Welt</b></p>");
  const pdf = teil(mail, "application/pdf");
  assert.deepEqual([...pdf.daten], [37, 80, 68, 70, 0, 255]);
  assert.match(pdf.kopf, /Content-Disposition: attachment; filename="Rechnung\.pdf"/);
  const bild = teil(mail, "image/png");
  assert.match(bild.kopf, /Content-Disposition: inline; filename\*=UTF-8''Bild%20%C3%A4\.png/);
  assert.match(bild.kopf, /Content-ID: <bild1>/);
  // nur ASCII (Inhalte als Base64), Zeilen höchstens 998 Zeichen
  assert.ok(/^[\x00-\x7f]*$/.test(mail));
  assert.ok(mail.split("\r\n").every(l => l.length <= 998));
  // Betreff zurück: UTF-8 in Base64
  const s = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(mail)[1];
  assert.equal(Buffer.from(s, "base64").toString("utf8"), "Grüße aus Wien");
});

test("PST: Kopfzeilen aus dem Original gehen vor (Absender, Datum, Verweise), Message-ID bleibt die eigene", () => {
  const mail = P.mime({
    headers: "Received: from x\r\nFrom: \"Orig\" <orig@example.invalid>\r\nSubject: Original\r\n =?UTF-8?B?w6Q=?=\r\nDate: Mon, 12 Oct 2026 10:00:00 +0200\r\n" +
      "References: <a@x>\r\n <b@x>\r\nMessage-ID: <falsch@x>\r\nContent-Type: text/plain\r\n\r\n",
    from: { name: "PST", email: "pst@example.invalid" }, subject: "PST-Betreff", messageId: "richtig@x", text: "x",
  });
  const kopf = mail.split("\r\n\r\n")[0];
  assert.match(kopf, /^From: "Orig" <orig@example\.invalid>\r\n/);
  assert.match(kopf, /\r\nSubject: Original\r\n =\?UTF-8\?B\?w6Q=\?=\r\n/);
  assert.match(kopf, /\r\nDate: Mon, 12 Oct 2026 10:00:00 \+0200\r\n/);
  assert.match(kopf, /\r\nReferences: <a@x>\r\n <b@x>\r\n/);
  assert.match(kopf, /\r\nMessage-ID: <richtig@x>\r\n/);
  assert.ok(!/falsch|Received|PST-Betreff|pst@example/.test(kopf));
  assert.equal((kopf.match(/Content-Type:/g) || []).length, 1);
});

test("PST: Zeichensatz-Angabe im HTML passt zum neuen Teil (UTF-8)", () => {
  const mail = P.mime({ html: '<meta http-equiv="Content-Type" content="text/html; charset=Windows-1252"><meta charset=iso-8859-1><p>ä</p>' });
  assert.equal(teil(mail, "text/html").daten.toString("utf8"),
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta charset=utf-8><p>ä</p>');
});

test("PST: weitergeleitete Mail als Anhang (message/rfc822), leere Mail mit leerem Text", () => {
  const mail = P.mime({ subject: "Fwd", text: "siehe Anhang", attachments: [{ name: "Alt.eml", message: { subject: "Alt", text: "innen" } }] });
  assert.match(mail, /Content-Type: message\/rfc822\r\nContent-Disposition: attachment; filename="Alt\.eml"\r\n\r\nSubject: Alt\r\n/);
  const leer = P.mime({ subject: "" });
  assert.match(leer, /Subject: \r\nMIME-Version: 1\.0\r\nContent-Type: text\/plain; charset=UTF-8\r\n/);
});

test("PST: feste Kennungen – gleiche Eingabe gleiche ID, andere Eingabe andere", () => {
  assert.equal(P.hash("a|1|x"), P.hash("a|1|x"));
  assert.notEqual(P.hash("a|1|x"), P.hash("a|2|x"));
  assert.match(P.hash("x"), /^[0-9a-f]{16}$/);
  assert.match(P.uuid("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(P.bare("<abc@x>"), "abc@x");
  assert.equal(P.email("/O=EX/CN=X", " <a@b.c> "), "a@b.c");
  assert.equal(P.email("kein"), "");
});

test("PST: Base64 wie Node", () => {
  for (const s of ["", "a", "ab", "abc", "abcd", "ÿ\u0000\u0080"]) {
    assert.equal(P.b64(s), Buffer.from(s, "latin1").toString("base64"));
  }
  assert.equal(P.utf8("ä"), "Ã¤");
});

test("PST: Kontakt als vCard 4.0 mit Namen, Adressen, Telefon, Geburtstag; Sonderzeichen maskiert", () => {
  const v = P.vcard({
    uid: "11111111-2222-3333-4444-555555555555", first: "Dora", last: "Müller", prefix: "Dr.", nick: "Do",
    emails: ["dora@example.invalid", "/O=EX/CN=X", "dora@example.invalid", "d2@example.invalid"],
    org: "Halo, GmbH", dept: "Technik", title: "Leitung", phones: [["work", "+43 1 234"], ["cell", " "]],
    adr: { work: { street: "Ring 1;\nStiege 2", city: "Wien", zip: "1010", country: "Österreich" }, home: {} },
    // Mitternacht in Wien als UTC (Vortag 23:00) – bleibt der 4. Mai
    birthday: new Date(Date.UTC(1980, 4, 3, 23)), note: "Zeile 1\nZeile 2",
  });
  const L = v.split("\r\n");
  assert.equal(L[0], "BEGIN:VCARD");
  assert.equal(L[1], "VERSION:4.0");
  assert.ok(L.includes("UID:11111111-2222-3333-4444-555555555555"));
  assert.ok(L.includes("FN:Dr. Dora Müller"));
  assert.ok(L.includes("N:Müller;Dora;;Dr.;"));
  assert.ok(L.includes("NICKNAME:Do"));
  assert.deepEqual(L.filter(l => l.startsWith("EMAIL")), ["EMAIL;PREF=1:dora@example.invalid", "EMAIL:d2@example.invalid"]);
  assert.deepEqual(L.filter(l => l.startsWith("TEL")), ["TEL;TYPE=work;VALUE=TEXT:+43 1 234"]);
  assert.deepEqual(L.filter(l => l.startsWith("ADR")), ["ADR;TYPE=work:;;Ring 1\\;\\nStiege 2;Wien;;1010;Österreich"]);
  assert.ok(L.includes("ORG:Halo\\, GmbH;Technik"));
  assert.ok(L.includes("TITLE:Leitung"));
  assert.ok(L.includes("BDAY;VALUE=DATE:19800504"));
  assert.ok(L.includes("NOTE:Zeile 1\\nZeile 2"));
  assert.equal(L.at(-2), "END:VCARD");
  // nur E-Mail: Anzeigename aus der Adresse
  assert.match(P.vcard({ emails: ["x@example.invalid"] }), /\r\nFN:x@example\.invalid\r\n/);
});

test("PST: Termin als VEVENT – mit Uhrzeit in UTC, ganztägig als Datum mit Ende am Folgetag", () => {
  const e = P.vevent({ uid: "u1", summary: "Besprechung; Raum 2", start: new Date(Date.UTC(2026, 10, 17, 13, 0)), end: new Date(Date.UTC(2026, 10, 17, 14, 30)),
    location: "Wien, Büro", description: "a\nb" });
  const L = e.split("\r\n");
  assert.deepEqual([L[0], L.at(-2)], ["BEGIN:VEVENT", "END:VEVENT"]);
  assert.ok(L.includes("UID:u1"));
  assert.ok(L.includes("SUMMARY:Besprechung\\; Raum 2"));
  assert.ok(L.includes("DTSTART:20261117T130000Z"));
  assert.ok(L.includes("DTEND:20261117T143000Z"));
  assert.ok(L.includes("LOCATION:Wien\\, Büro"));
  assert.ok(L.includes("DESCRIPTION:a\\nb"));
  assert.ok(L.includes("TRANSP:OPAQUE"));
  // ganztägig, in Wien angelegt (Mitternacht Ortszeit = 23:00 UTC am Vortag)
  const a = P.vevent({ uid: "u2", summary: "Feiertag", allDay: true, start: new Date(Date.UTC(2026, 11, 7, 23)), end: new Date(Date.UTC(2026, 11, 8, 23)), free: true });
  assert.ok(a.includes("\r\nDTSTART;VALUE=DATE:20261208\r\nDTEND;VALUE=DATE:20261209\r\n"));
  assert.ok(a.includes("TRANSP:TRANSPARENT"));
  // ganztägig ohne Ende, Monatsende
  assert.ok(P.vevent({ uid: "u3", allDay: true, start: new Date(Date.UTC(2026, 11, 31)) }).includes("DTEND;VALUE=DATE:20270101"));
  // ohne Beginn: nichts
  assert.equal(P.vevent({ uid: "u4", summary: "x", start: null }), "");
});

// Outlook-Struktur eines Serientermins ([MS-OXOCAL] 2.2.1.44.5) aus Einzelwerten; Tage als „YYYYMMDD“
const minuten = tag => (Date.UTC(+tag.slice(0, 4), +tag.slice(4, 6) - 1, +tag.slice(6, 8)) + 11644473600000) / 60000;
function serie({ freq, type, period, spec = [], endType = 0x2023, count = 10, firstDow = 1, deleted = [], modified = [], start, end = null,
  startMin, endMin, exceptions = [] }) {
  const out = [];
  const u16 = v => out.push(v & 255, (v >> 8) & 255);
  const u32 = v => { u16(v & 0xffff); u16(Math.floor(v / 0x10000) & 0xffff); };
  u16(0x3004); u16(0x3004); u16(freq); u16(type); u16(0); u32(0); u32(period); u32(0);
  spec.forEach(u32);
  u32(endType); u32(count); u32(firstDow);
  u32(deleted.length); deleted.forEach(d => u32(minuten(d)));
  u32(modified.length); modified.forEach(d => u32(minuten(d)));
  u32(minuten(start)); u32(end ? minuten(end) : 0x5ae980df);
  u32(0x3006); u32(0x3009); u32(startMin); u32(endMin);
  u16(exceptions.length);
  for (const x of exceptions) {
    u32(minuten(x.neu) + 600); u32(minuten(x.neu) + 660); u32(minuten(x.alt) + startMin);
    u16(x.betreff ? 0x11 : 0x10);
    if (x.betreff) {
      u16(x.betreff.length + 1); u16(x.betreff.length); [...x.betreff].forEach(c => out.push(c.charCodeAt(0)));
    }
    u16(2); u16(1); out.push(0x52);
  }
  u32(0); u32(0);
  return Uint8Array.from(out);
}

test("PST: Serientermine – Regel aus der Outlook-Struktur (täglich, Werktage, monatlich, n-ter Wochentag, jährlich), Ende, gelöschte Tage", () => {
  // wöchentlich Mo und Mi, 09:00–10:30, zehnmal, ein Termin gelöscht, einer verschoben (bleibt in der Serie)
  const w = P.recur(serie({ freq: 0x200b, type: 1, period: 1, spec: [0b0001010], endType: 0x2022, count: 10, start: "20261102",
    startMin: 540, endMin: 630, deleted: ["20261109", "20261111"], modified: ["20261112"], exceptions: [{ alt: "20261111", neu: "20261112", betreff: "Neu" }] }));
  assert.deepEqual(n(w), { rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;WKST=MO", day: "20261102", startMin: 540, endMin: 630, count: 10, until: "", exdays: ["20261109"] });
  // täglich alle 2 Tage bis zu einem Datum
  const d = P.recur(serie({ freq: 0x200a, type: 0, period: 2880, endType: 0x2021, start: "20261201", end: "20261231", startMin: 480, endMin: 510 }));
  assert.equal(d.rule, "FREQ=DAILY;INTERVAL=2");
  assert.equal(d.until, "20261231");
  // monatlich am 15., jeden 2. Monat; letzter Tag des Monats; letzter Freitag
  assert.equal(P.recur(serie({ freq: 0x200c, type: 2, period: 2, spec: [15], start: "20260115", startMin: 0, endMin: 60 })).rule, "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15");
  assert.equal(P.recur(serie({ freq: 0x200c, type: 4, period: 1, spec: [31], start: "20260131", startMin: 0, endMin: 60 })).rule, "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1");
  assert.equal(P.recur(serie({ freq: 0x200c, type: 3, period: 1, spec: [0b0100000, 5], start: "20260130", startMin: 0, endMin: 60 })).rule,
    "FREQ=MONTHLY;INTERVAL=1;BYDAY=FR;BYSETPOS=-1");
  // jährlich (Geburtstag im Kalender, ganztägig): Monat aus dem ersten Tag
  const y = P.recur(serie({ freq: 0x200d, type: 2, period: 12, spec: [3], start: "19800503", startMin: 0, endMin: 1440 }));
  assert.equal(y.rule, "FREQ=YEARLY;INTERVAL=1;BYMONTH=5;BYMONTHDAY=3");
  // nicht abbildbar oder kaputt: kein Serientermin
  assert.equal(P.recur(serie({ freq: 0x200c, type: 0x0b, period: 1, spec: [1, 1], start: "20260101", startMin: 0, endMin: 60 })), null);
  assert.equal(P.recur(Uint8Array.from([4, 48, 4, 48, 11, 32])), null);
  assert.equal(P.recur(null), null);
  // ohne lesbare Einzeltermine: geänderte Tage aus der Liste bleiben in der Serie
  const b = serie({ freq: 0x200b, type: 1, period: 1, spec: [2], start: "20261102", startMin: 540, endMin: 600, deleted: ["20261109"], modified: ["20261109"] });
  assert.deepEqual(n(P.recur(b.slice(0, b.length - 10)).exdays), []);
});

test("PST: Serientermin als VEVENT – Ortszeit mit Zone, UNTIL in UTC, EXDATE; ganztägig als Datum", () => {
  const recur = { rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", day: "20261026", startMin: 540, endMin: 630, count: 0, until: "20261130", exdays: ["20261109"] };
  const L = P.vevent({ uid: "s1", summary: "Jour fixe", start: new Date(Date.UTC(2026, 9, 26, 8)), recur, tzid: "Europe/Vienna" }).split("\r\n");
  assert.ok(L.includes("DTSTART;TZID=Europe/Vienna:20261026T090000"));
  assert.ok(L.includes("DTEND;TZID=Europe/Vienna:20261026T103000"));
  // 30.11. 09:00 Wien (Winterzeit) = 08:00 UTC
  assert.ok(L.includes("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20261130T080000Z"));
  assert.ok(L.includes("EXDATE;TZID=Europe/Vienna:20261109T090000"));
  // Sommerzeit: 09:00 Wien = 07:00 UTC
  assert.equal(P.utc(P.wallUtc("20260706", 540, "Europe/Vienna")), "20260706T070000Z");
  // ganztägig jährlich, ohne Ende
  const g = P.vevent({ uid: "s2", summary: "Geburtstag", allDay: true, start: null,
    recur: { rule: "FREQ=YEARLY;INTERVAL=1;BYMONTH=5;BYMONTHDAY=3", day: "19800503", startMin: 0, endMin: 1440, count: 0, until: "", exdays: [] } });
  assert.ok(g.includes("\r\nDTSTART;VALUE=DATE:19800503\r\nDTEND;VALUE=DATE:19800504\r\nRRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=5;BYMONTHDAY=3\r\n"));
  // mit Anzahl, ohne Zone: Ortszeit ohne Zone
  const c = P.vevent({ uid: "s3", summary: "x", recur: { ...recur, until: "", count: 4 } });
  assert.ok(c.includes("\r\nDTSTART:20261026T090000\r\n") && c.includes(";COUNT=4\r\n"));
});

test("PST: Aufgabe als VTODO mit Beginn, Fälligkeit, erledigt und Fortschritt", () => {
  const t = P.vtodo({ uid: "t1", summary: "Steuer", start: new Date(Date.UTC(2026, 10, 1)), due: new Date(Date.UTC(2026, 10, 30)), percent: 0.5 });
  assert.ok(t.startsWith("BEGIN:VTODO\r\nUID:t1\r\nSUMMARY:Steuer\r\n"));
  assert.ok(t.includes("\r\nDTSTART;VALUE=DATE:20261101\r\nDUE;VALUE=DATE:20261130\r\n"));
  assert.ok(t.includes("\r\nPERCENT-COMPLETE:50\r\n"));
  const d = P.vtodo({ uid: "t2", summary: "Erledigt", done: true, completed: new Date(Date.UTC(2026, 9, 2, 8)) });
  assert.ok(d.includes("\r\nSTATUS:COMPLETED\r\nPERCENT-COMPLETE:100\r\nCOMPLETED:20261002T080000Z\r\n"));
});

test("PST: Kontakte, Termine und Aufgaben aus Bibliotheksobjekten, Verteilerlisten und Antworten bleiben weg", () => {
  const c = P.contactOf({ messageClass: "IPM.Contact", descriptorNodeId: 42, displayName: "Dora Müller", givenName: "Dora", surname: "Müller",
    email1EmailAddress: "dora@example.invalid", email2EmailAddress: "/O=EX", companyName: "Halo", businessTelephoneNumber: "+43 1",
    mobileTelephoneNumber: "", workAddressCity: "Wien", birthday: null }, "Archiv");
  assert.equal(c.display, "Dora Müller");
  assert.deepEqual(n(c.emails), ["dora@example.invalid"]);
  assert.deepEqual(n(c.phones), [["work", "+43 1"]]);
  assert.equal(c.adr.work.city, "Wien");
  assert.match(c.uid, /^[0-9a-f-]{36}$/);
  assert.equal(c.uid, P.contactOf({ messageClass: "IPM.Contact", descriptorNodeId: 42, displayName: "Dora Müller" }, "Archiv").uid);
  assert.equal(P.contactOf({ messageClass: "IPM.DistList" }, "Archiv"), null);
  const start = new Date(Date.UTC(2026, 10, 17, 9));
  const e = P.eventOf({ messageClass: "IPM.Appointment", descriptorNodeId: 7, subject: "Termin", startTime: start, endTime: start, subType: false, busyStatus: 0 }, "Archiv");
  assert.equal(e.summary, "Termin");
  assert.equal(e.free, true);
  assert.equal(P.eventOf({ messageClass: "IPM.Schedule.Meeting.Resp.Pos" }, "Archiv"), null);
  const t = P.taskOf({ messageClass: "IPM.Task", descriptorNodeId: 8, subject: "Aufgabe", isTaskComplete: true, percentComplete: 1 }, "Archiv");
  assert.equal(t.task, true);
  assert.equal(t.done, true);
  assert.deepEqual(n(P.counts({ mail: [{ count: 2 }, { count: 3 }], contacts: [{ count: 4 }], calendar: [] })), { mail: 5, contacts: 4, calendar: 0 });
});

test("PST: Korrekturen an der gebündelten Bibliothek sind drin (tools/pst-bundle/fix.py)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../extension/vendor/pst/pst-extractor.js", import.meta.url), "utf8");
  // 1. kein endloses Lesen ohne Daten
  assert.ok(src.includes("if (numRead === -1 || numRead === 0) {"));
  // 2. Tabellenkopf über den Verweis (TCINFO.hidRowIndex) statt fest an HID 0x20 – PST aus Microsoft 365
  assert.ok(src.includes("BTHHEADER über den Verweis suchen"));
  assert.ok(!src.includes("const headerNodeInfo = this.getNodeInfo(32);"));
});
