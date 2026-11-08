// Mailliste: Absender ohne Namen zeigt den Firmennamen aus der Domain
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

test("Absender: eigener Name bleibt, sonst Firmenname aus der Domain", () => {
  const { senderLabel } = lade();
  assert.equal(senderLabel("Anna", "a@example.at"), "Anna");
  assert.equal(senderLabel("", "rueckgabe@amazon.de"), "Amazon");
  assert.equal(senderLabel("info@shop.co.uk", ""), "Shop");
  assert.equal(senderLabel("", "x@mail.example.at"), "Example");
});

test("Absender: Freemail und Adressen ohne Domain bleiben Adresse", () => {
  const { senderLabel } = lade();
  assert.equal(senderLabel("", "max@gmail.com"), "max@gmail.com");
  assert.equal(senderLabel("max@gmx.at", ""), "max@gmx.at");
  assert.equal(senderLabel("", "lokal"), "lokal");
});

test("Domain: zweite Ebene (co.uk) ohne Thunderbirds Liste", () => {
  const { orgDomain } = lade();
  assert.equal(orgDomain("mail.example.co.uk"), "example.co.uk");
  assert.equal(orgDomain("A.B.Example.COM."), "example.com");
  assert.equal(orgDomain("x.at"), "x.at");
});
