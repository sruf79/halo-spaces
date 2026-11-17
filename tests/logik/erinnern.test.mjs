// Erinnern (Remind, extension/api/mail.js): gemerkte Erinnerungen gehen nicht verloren
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const PREF = "extensions.mailcards.reminders";

function ordner(name, msgs = []) {
  return {
    URI: `imap://x/${name}`, name,
    msgDatabase: { getMsgHdrForMessageID: id => msgs.find(m => m.messageId == id) || null },
    markMessagesRead() {},
  };
}

test("Erinnern: erneut erinnern an eine Mail im Ordner „Erinnern“ verschiebt nur die Zeit, die Erinnerung bleibt", async () => {
  const { Remind, prefs } = lade();
  const inbox = ordner("INBOX"), remind = ordner("Remind Me");
  const hdr = { messageId: "a@x", folder: remind, mime2DecodedSubject: "Hallo" };
  prefs.set(PREF, JSON.stringify([{ id: "a@x", at: 1000, back: inbox.URI, folder: remind.URI, subject: "Hallo" }]));
  Remind.folderFor = async () => remind;
  const moves = [];
  Remind.move = async (...args) => moves.push(args);
  const when = new Date(5000);
  await Remind.remind([hdr], when);
  const list = JSON.parse(prefs.get(PREF));
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "a@x");
  assert.equal(list[0].at, 5000);
  assert.equal(list[0].back, inbox.URI);
  assert.equal(moves.length, 0);
});

test("Erinnern: eine Erinnerung, die während der Prüfung fälliger Mails dazukommt, bleibt erhalten", async () => {
  const { Remind, prefs, context } = lade();
  const fällig = { messageId: "alt@x" };
  const remind = ordner("Remind Me", [fällig]), inbox = ordner("INBOX");
  const ordnerFür = { [remind.URI]: remind, [inbox.URI]: inbox };
  context.MailServices = { folderLookup: { getFolderForURL: uri => ordnerFür[uri] } };
  context.setTimeout = (fn, ms) => setTimeout(fn, Math.min(ms, 10)); // Thunderbirds Zeitgeber ist im Lader eine Attrappe
  prefs.set(PREF, JSON.stringify([{ id: "alt@x", at: 1, back: inbox.URI, folder: remind.URI, subject: "Alt" }]));
  Remind.notify = () => {};
  // während die fällige Mail zurückwandert, erinnert der Nutzer an eine andere
  Remind.move = async () => {
    const list = Remind.list();
    list.push({ id: "neu@x", at: Date.now() + 3600e3, back: inbox.URI, folder: remind.URI, subject: "Neu" });
    Remind.save(list);
  };
  await Remind.check();
  const ids = JSON.parse(prefs.get(PREF)).map(e => e.id);
  assert.deepEqual(ids, ["neu@x"]);
});

test("Erinnern: nur für Mails, die man verschieben kann – Kontextmenü und Menüleiste fragen dieselbe Regel", () => {
  const { Remind, context } = lade();
  const F = { Drafts: 0x400, Queue: 0x800, Templates: 0x400000 };
  context.Ci = { nsMsgFolderFlags: F };
  const mail = (flags = 0, type = "imap") => ({ folder: { isSpecialFolder: f => !!(f & flags), server: { type } } });
  assert.equal(Remind.canRemind([mail()]), true);
  assert.equal(Remind.canRemind([]), false);
  assert.equal(Remind.canRemind([mail(), mail(F.Drafts)]), false);
  assert.equal(Remind.canRemind([mail(F.Queue)]), false);
  assert.equal(Remind.canRemind([mail(F.Templates)]), false);
  assert.equal(Remind.canRemind([mail(0, "nntp")]), false);
  assert.equal(Remind.canRemind([{ folder: null }]), false);
});
