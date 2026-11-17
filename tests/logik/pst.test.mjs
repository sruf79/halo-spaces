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
