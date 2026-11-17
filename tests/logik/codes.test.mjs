// Codes in E-Mails erkennen (findCode, GitHub #54): Bestätigungs- und
// Anmeldecodes wie Apple Mail, aber keine Telefonnummern, Datumsangaben,
// Beträge, Bestell- oder Kundennummern und keine Gutscheincodes
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { findCode } = lade();

test("Codes: typische Bestätigungs-Mails liefern den Code", () => {
  const faelle = [
    ["Your verification code", "Hi,\n\nYour verification code is 482913.\n\nIt expires in 10 minutes."],
    ["482913 is your Instagram code", "Someone tried to log in."],
    ["Anmeldung", "Ihr Bestätigungscode lautet: 7351\nBitte geben Sie ihn innerhalb von 15 Minuten ein."],
    ["Dein Sicherheitscode", "Hallo Anna,\n\ndein Code:\n\n604 218\n\nGültig bis 17.11.2026, 14:30 Uhr."],
    ["Security alert", "Use the one-time password 91827364 to sign in."],
    ["Sign-in attempt", "Your OTP is 5521. Do not share it with anyone."],
    ["Google", "G-319204 is your Google verification code."],
    ["Steam Guard", "Here is the Steam Guard code you need to login:\n\nF4K9Q\n"],
    ["Code de vérification", "Votre code de vérification est 220817."],
    ["Tu código", "Tu código de verificación: 663201"],
    ["Codice di accesso", "Il tuo codice è 448120."],
    ["Login-Code", "Dein Login-Code: 3390-1127"],
    ["pushTAN", "Ihre pushTAN: 813745"],
    ["Microsoft account security code", "Please use the following security code for the Microsoft account a***@example.com.\n\nSecurity code: 1185204\n\nIf you don't recognize the Microsoft account, you can click here to remove your email address."],
    ["Your code", "Enter this code in the app:\n\n  287 993  \n\nThanks, The Team\nCall us: +1 800 555 0199"],
  ];
  const erwartet = ["482913", "482913", "7351", "604218", "91827364", "5521", "319204", "F4K9Q", "220817", "663201",
    "448120", "33901127", "813745", "1185204", "287993"];
  assert.deepEqual(faelle.map(([s, t]) => findCode(s, t)), erwartet);
});

test("Codes: ohne Wort wie Code/OTP/TAN kein Treffer", () => {
  for (const [s, t] of [
    ["Your order", "Order 48291302 has shipped. Total: 49,90 €"],
    ["Meeting", "Let us meet on 17.11.2026 at 14:30 in room 4021."],
    ["Hallo", "Ruf mich an: 0664 1234567"],
    ["Newsletter", "Over 250000 readers enjoyed this issue."],
  ]) {
    assert.equal(findCode(s, t), "", `${s}: ${t}`);
  }
});

test("Codes: Fehlalarme in der Nähe von „Code“ werden verworfen", () => {
  for (const [s, t] of [
    // Telefonnummern
    ["Your code", "Didn't request a code? Call +49 30 1234567."],
    ["Dein Code", "Kein Code angefordert? Ruf uns an: 030 123 4567"],
    ["Verification code", "Questions about your code? Phone 555-0199"],
    // Datum, Uhrzeit, Jahreszahl
    ["Your code", "The code was requested on 2026-11-17 at 09:41."],
    ["Bestätigungscode", "Angefordert am 17.11.2026 um 14:30 Uhr."],
    ["Security code", "© 2026 Example Inc. Your security code will follow."],
    // Beträge und Einheiten
    ["Promo", "Use code at checkout and save 2500 €."],
    ["Payment code", "Amount due: $1250 by Friday."],
    ["Code", "Your code saves 1500 EUR on your order."],
    // Bestell-, Kunden-, Rechnungsnummern
    ["Your code", "Your code is on its way. Order number: 48291302"],
    ["Code", "Der Code folgt. Kundennummer 55120034, bitte bei Fragen angeben."],
    // Gutschein, Rabatt, Postleitzahl, Strichcode, Quelltext
    ["Rabatt", "Dein Gutscheincode: SAVE2025"],
    ["Sale", "Use promo code 4521 at checkout."],
    ["Address", "Zip code 10115, Berlin"],
    ["Paket", "Barcode 40123455 an der Kasse zeigen."],
    ["Release", "Source code for version 3021 is on GitHub."],
    ["Fehler", "Error code 5003 – bitte erneut versuchen."],
    // Adressen und Links
    ["Verify", "Click to confirm your code: https://example.com/verify?code=482913"],
    ["Code", "Write to user2026x@example.com for your code."],
    // Wörter, die nur „pin“ oder „tan“ enthalten
    ["Spinning class", "Spinning starts at 1830 in studio 4."],
    ["Sultan", "The Sultan visited 4021 guests."],
  ]) {
    assert.equal(findCode(s, t), "", `${s}: ${t}`);
  }
});

test("Codes: der Code steht nur in einer kurzen Zeile direkt nach dem Hinweis", () => {
  // lange Folgezeile mit Zahl: kein Code
  assert.equal(findCode("Hello", "Your code is below.\nWe processed 250000 requests in our new data center last month and more."), "");
  // drei Zeilen tiefer: zu weit weg
  assert.equal(findCode("Hello", "Your code:\n\nline one\nline two\nline three\n482913"), "");
  // Leerzeilen zählen nicht
  assert.equal(findCode("Hello", "Your code:\n\n\n\n482913"), "482913");
});

test("Codes: der Betreff geht vor, leere Eingaben liefern nichts", () => {
  assert.equal(findCode("Your code is 111222", "Your code: 333444"), "111222");
  assert.equal(findCode("", ""), "");
  assert.equal(findCode(null, undefined), "");
});
