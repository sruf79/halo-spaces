/* halo.spaces – Grundlagen (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js an der alten Stelle in dieselbe Umgebung (gemeinsamer
 * globaler Bereich der Experiment-API): Protokoll (log), Hilfsfunktionen, Suche
 * wie Apple Mail, Logo-Cache (LogoCache), Fotos aus der Mediathek (MacPhotos),
 * Absenderbilder (AvatarResolver) und Design aus der Erweiterung (EarlyTheme,
 * ThemeSheet) stehen danach dort direkt zur Verfügung. Zur Ladezeit nur Namen
 * nutzen, die vorher schon da sind; Namen aus implementation.js (tr,
 * extensionRoot …) erst zur Laufzeit.
 * Reihe „Code: implementation.js in Module zerlegen“ 6/8.
 */

"use strict";

// ---------------------------------------------------------------------------
// Protokoll (mail-cards-debug.log im Profilordner, max. ~200 KB)
// ---------------------------------------------------------------------------

const LOG_PATH = PathUtils.join(PathUtils.profileDir, "mail-cards-debug.log");
let logChain = Promise.resolve();
let logged = 0;
// Ausführliche Einträge (z. B. Absenderadressen beim Bild-Auflösen) nur mit
// extensions.mailcards.debug = true – Fehler werden immer protokolliert
function debugLog(...parts) {
  if (Services.prefs.getBoolPref("extensions.mailcards.debug", false)) {
    log(...parts);
  }
}

function log(...parts) {
  if (++logged > 2000) {
    return;
  }
  const line =
    new Date().toISOString() +
    " " +
    parts
      // Fehler aus anderen Bereichen sind kein „instanceof Error“ – an message erkennen
      .map(p => (p && typeof p == "object" && typeof p.message == "string"
        ? `${p.name || "Error"}: ${p.message}${p.stack ? ` @ ${String(p.stack).split("\n")[0]}` : ""}`
        : typeof p == "string" ? p : JSON.stringify(p)))
      .join(" ") +
    "\n";
  logChain = logChain
    .then(async () => {
      try {
        const info = await IOUtils.stat(LOG_PATH);
        if (info.size > 200 * 1024) {
          await IOUtils.remove(LOG_PATH);
        }
      } catch {} // gewollt: Protokoll fehlt noch, wird neu angelegt
      await IOUtils.writeUTF8(LOG_PATH, line, { mode: "appendOrCreate" });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function orgDomain(domain) {
  // Thunderbirds Liste der Domain-Endungen (co.uk, com.pl, co.kr …)
  try {
    return Services.eTLD.getBaseDomainFromHost(domain.toLowerCase().replace(/\.$/, ""));
  } catch {} // gewollt: eigene Liste der Domain-Endungen darunter
  const parts = domain.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo)
    ? parts.slice(-3).join(".")
    : lastTwo;
}

// Datum in der Mailliste immer mit Uhrzeit: „Heute, 14:32“, „Gestern, 14:32“,
// davor das ganze Datum (17.10.2026, 14:32) – kein Wochentag.
// Formatiert wie der Mailkopf: Thunderbirds eigener Formatierer ohne Sprache
// nimmt die Regionaleinstellungen des Systems (auch 12/24 Stunden) – sonst
// stand in der Liste „12:49 AM“ neben „00:49“ im Kopf
function appleListDate(ms, now = new Date()) {
  const fmt = opts => new Services.intl.DateTimeFormat(undefined, opts);
  const d = new Date(ms);
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  // immer mit Uhrzeit: „Heute, 14:32“, „Gestern, 14:32“, sonst „17.10.2026,
  // 14:32“ – Datum in der Zukunft (falsche Uhr beim Absender, Spam „oben
  // halten“) zeigt das ganze Datum
  const time = fmt({ timeStyle: "short" }).format(d);
  if (days == 0) {
    return tr("Today, {time}", { time });
  }
  if (days == 1) {
    return tr("Yesterday, {time}", { time });
  }
  // „mittel“ ist das ganze Datum im Muster des Systems (17.10.2026); Datum
  // und Uhrzeit getrennt formatiert und mit Komma verbunden – zusammen
  // setzt Englisch „at“ dazwischen („17.10.2026 at 14:32“)
  return `${fmt({ dateStyle: "medium" }).format(d)}, ${time}`;
}

// Absender ohne eigenen Namen (nur die Adresse, oft auch als Name
// wiederholt): wie Apple Mail der Firmenname aus der Domain
// („rueckgabe@amazon.de“ → „Amazon“). Bei Freemail-Adressen bleibt die Adresse.
function senderLabel(name, email) {
  name = (name || "").trim();
  if (name && !/^[^\s@]+@[^\s@]+$/.test(name)) {
    return name;
  }
  email ||= name.toLowerCase();
  const domain = email.split("@")[1] || "";
  const org = domain ? orgDomain(domain) : "";
  if (!org || FREEMAIL.has(org)) {
    return email;
  }
  const label = org.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Wer in der Karte steht: der Absender – in Gesendet, Entwürfen, Vorlagen und
// Postausgang wie bei Thunderbird die Empfänger (ohne Empfänger der Absender)
function personsFor(hdr, outgoing = false) {
  const parse = header => {
    try {
      return MailServices.headerParser.parseDecodedHeader(header || "")
        .filter(p => p?.email || p?.name)
        .map(p => ({ name: p.name || "", email: (p.email || "").toLowerCase() }));
    } catch {
      return [];
    }
  };
  const list = outgoing ? parse(hdr.mime2DecodedRecipients || hdr.recipients) : [];
  return list.length ? list : parse(hdr.mime2DecodedAuthor || hdr.author);
}

function initialsFor(name, email) {
  let source = (name || "").replace(/["'<>()[\]]/g, "").trim();
  if (!source || source.includes("@")) {
    source = (email || "").split("@")[0].replace(/[._\-+0-9]+/g, " ").trim();
  }
  const words = source.split(/\s+/).filter(w => /\p{L}/u.test(w));
  if (!words.length) {
    return "?";
  }
  const first = [...words[0]][0] || "";
  const second = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return (first + second).toUpperCase();
}

// Vorschautext wie in Apple Mail: Fließtext ohne Zitate, Links und
// unsichtbare Füllzeichen (Newsletter verstecken damit ihren „Preheader“).
// Manche Absender (z. B. Amazon) schicken im Text-Teil in Wahrheit HTML –
// dann stünde Code in der Vorschau. Tags, Stile und Skripte entfernen.
// Benannte Zeichen (&zwnj;, &hellip; …) stehen oft auch in reinen Text-Teilen.
const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", shy: "",
  zwnj: "", zwj: "", lrm: "", rlm: "", ensp: " ", emsp: " ", thinsp: " ",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»", bull: "•",
  middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", deg: "°",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] == "#") {
      const n = e[1].toLowerCase() == "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? all;
  });
}

function stripHtml(text) {
  if (!/<(?:!doctype|html|head|body|div|table|p|span|br|style|meta|td)\b/i.test(text)) {
    return decodeEntities(text);
  }
  return decodeEntities(text
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(style|script|head)\b[\s\S]*$/i, " ") // angeschnitten (Vorschau gekürzt)
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/<[^>]*$/, " ")); // angeschnittenes Tag am Ende
}

// Liegt die Mail noch im Ordner? Nach Löschen/Verschieben kennt der Ordner
// ihren Schlüssel nicht mehr – Vorschau-Abruf dann auslassen statt Fehler
function msgStillInFolder(hdr) {
  try {
    const db = hdr?.folder?.msgDatabase;
    return !!db && db.containsKey(hdr.messageKey);
  } catch {
    return false;
  }
}

// Zeile der Mailliste, die es in der Ansicht nicht mehr gibt: Thunderbird
// füllt Zeilen erst im nächsten Bild (requestAnimationFrame). Wird die
// Ansicht dazwischen kleiner (Suche beim Tippen grenzt ein), zeigt die Zeile
// noch auf eine alte Position – die Ansicht wirft dann
// NS_MSG_INVALID_DBVIEW_INDEX. Solche Zeilen auslassen, die Liste setzt
// ihre Positionen gleich neu und füllt sie dann.
function rowGone(row) {
  try {
    const index = row?._index;
    const count = row?.view?.rowCount;
    return !Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count;
  } catch {
    return true;
  }
}

function cleanPreview(text) {
  return stripHtml(text || "")
    .replace(/[\u034f\u00ad\u200b-\u200f\u2060\ufeff]/g, "")
    .split(/\r?\n/)
    .filter(line => !/^\s*>/.test(line))
    .join(" ")
    .replace(/<https?:[^>]*>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[(?:image|cid):[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// ---------------------------------------------------------------------------
// Suche wie Apple Mail: das Suchfeld oben durchsucht in der Mail alle
// Postfächer (außer Papierkorb und Spam) über einen versteckten Suchordner;
// Treffer stehen in der Kartenliste, gelb markiert, oben mit Anzahl.
// ---------------------------------------------------------------------------
const SEARCH_FOLDER_NAME = "halo.spaces search";
// Suchordner für „Markiert“ unter den Favoriten (versteckt unter „Lokale Ordner“)
const STARRED_FOLDER_NAME = "halo.spaces starred";
// Thunderbirds Index (Gloda): so lange wird vor der Suche auf seine Treffer
// gewartet (sonst ohne ihn), höchstens so viele Treffer (neueste zuerst);
// kürzere Begriffe fragen ihn nicht (riesige Präfix-Abfragen, die sich beim
// Tippen im Gloda-Thread stauen und nicht abbrechen lassen)
const GLODA_WAIT_MS = 400;
const GLODA_LIMIT = 3000;
const GLODA_MIN_CHARS = 3;

// Datum im Suchbegriff („12.10“, „12.10.“, „12.10.26“, „12.10.2026“) – ohne
// Jahr das letzte vergangene Vorkommen
function searchDate(text, now = new Date()) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?\s*$/.exec(text || "");
  if (!m) {
    return null;
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (m[3]) {
    const year = m[3].length == 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = new Date(year, month - 1, day);
    return date.getMonth() == month - 1 && date.getDate() == day ? date : null;
  }
  // ohne Jahr: letztes vergangenes Vorkommen, auch für den 29.2. (8 Jahre
  // reichen auch über Jahrhundertjahre ohne Schalttag; „31.4“ gibt es nie)
  for (let year = now.getFullYear(), i = 0; i < 8; i++, year--) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() == month - 1 && date.getDate() == day && date <= now) {
      return date;
    }
  }
  return null;
}

// Suchbegriff in einem Element gelb hinterlegen (nur Text, per DOM)
function markHits(el, term) {
  if (!el) {
    return;
  }
  for (const old of el.querySelectorAll("mark.mc-hit")) {
    old.replaceWith(old.textContent);
  }
  el.normalize();
  const needle = (term || "").trim().toLowerCase();
  if (needle.length < 2) {
    return;
  }
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let at = lower.indexOf(needle);
    if (at < 0) {
      continue;
    }
    const frag = doc.createDocumentFragment();
    let from = 0;
    while (at >= 0) {
      frag.append(text.slice(from, at));
      const mark = doc.createElementNS("http://www.w3.org/1999/xhtml", "mark");
      mark.className = "mc-hit";
      mark.textContent = text.slice(at, at + needle.length);
      frag.append(mark);
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    frag.append(text.slice(from));
    node.replaceWith(frag);
  }
}

function bytesToBase64(win, bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return win.btoa(binary);
}

// Einen Kopfeintrag der Nachricht lesen, den Thunderbird nicht in der
// Datenbank hält (z. B. List-Unsubscribe-Post); "" wenn nicht vorhanden
function readHeader(hdr, name) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(""), 5000);
    try {
      MsgHdrToMimeMessage(hdr, null, (msgHdr, mime) => {
        clearTimeout(timer);
        resolve(String(mime?.headers?.[name.toLowerCase()]?.[0] || ""));
      }, true, { partsOnDemand: true, examineEncryptedParts: false });
    } catch {
      clearTimeout(timer);
      resolve("");
    }
  });
}

// Nur öffentliche https-Adressen – Absender bestimmen die Adresse (BIMI,
// Kontaktfotos), damit darf kein Zugriff auf lokale Geräte oder Firmennetze
// ausgelöst werden
function isPublicHttps(url) {
  try {
    // nsIURI statt URL: URL gibt es im Experiment-Kontext nicht (new URL
    // warf, damit galt jede Adresse als gesperrt und es kamen keine Logos)
    const u = Services.io.newURI(url);
    if (u.scheme != "https") {
      return false;
    }
    const host = u.host.toLowerCase();
    return !(host == "localhost" || host.endsWith(".local") || host.endsWith(".localhost") ||
      /\.(invalid|example|test|onion)$/.test(host) || host.endsWith(".example.com") ||
      host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home") ||
      /^[\d.]+$/.test(host) || host.includes(":") || !host.includes("."));
  } catch {
    return false;
  }
}

// Zeitüberschreitungen zählen: dann kein „kein Logo“ merken (nur langsames Netz)
let fetchTimeouts = 0;

// Abruf über einen eigenen Kanal statt fetch: fetch folgt Umleitungen, bevor
// sich ihr Ziel prüfen lässt – der Absender könnte so auf Geräte im lokalen
// Netz umleiten. Hier wird jedes Umleitungsziel vor dem Verbinden geprüft.
// Zeitlimit und Größengrenze (max Bytes) gelten für die ganze Antwort, danach
// wird abgebrochen; mit truncate liefert eine längere Antwort nur ihren Anfang.
// Ergebnis wie bei fetch: ok, status, url, headers.get(), text(), arrayBuffer()
function fetchWithTimeout(win, url, { method = "GET", headers = {}, body = null, max = 2 * 1024 * 1024, truncate = false, followRedirects = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!isPublicHttps(url)) {
      reject(new Error("blocked url"));
      return;
    }
    const channel = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true })
      .QueryInterface(Ci.nsIHttpChannel);
    // ohne Cookies und Anmeldedaten (wie credentials: "omit")
    channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
    if (body != null) {
      const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      // setUTF8Data statt setByteStringData: das gibt es in Thunderbird 128 ESR
      // noch nicht, dort scheiterte sonst jeder POST (Ein-Klick-Abmeldung); der
      // Body ist reines ASCII („List-Unsubscribe=One-Click“)
      stream.setUTF8Data(body);
      channel.QueryInterface(Ci.nsIUploadChannel2).explicitSetUploadStream(stream, null, -1, method, false);
    } else {
      channel.requestMethod = method;
    }
    for (const [name, value] of Object.entries(headers)) {
      channel.setRequestHeader(name, value, false);
    }
    let current = channel;
    let settled = false;
    const parts = [];
    let size = 0;
    // redirected: Antwort 3xx, der nicht gefolgt wurde – gilt als Erfolg
    const finish = (request, redirected = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.length;
      }
      try {
        const http = request.QueryInterface(Ci.nsIHttpChannel);
        resolve({
          ok: http.requestSucceeded || (redirected && http.responseStatus >= 300 && http.responseStatus < 400),
          status: http.responseStatus,
          url: http.URI.spec,
          headers: {
            get(name) {
              try {
                return http.getResponseHeader(name);
              } catch {
                return null;
              }
            },
          },
          arrayBuffer: async () => bytes.buffer,
          text: async () => new win.TextDecoder().decode(bytes),
        });
      } catch (e) {
        reject(e);
      }
    };
    const fail = error => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
      try {
        current.cancel(Cr.NS_BINDING_ABORTED);
      } catch {} // gewollt: Anfrage schon beendet
    };
    const timer = setTimeout(() => {
      fetchTimeouts++;
      fail(new Error("timeout"));
    }, FETCH_TIMEOUT);
    channel.notificationCallbacks = {
      QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor", "nsIChannelEventSink"]),
      getInterface(iid) {
        return this.QueryInterface(iid);
      },
      asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
        // ohne Weiterleiten (Ein-Klick-Abmeldung): der Server hat die Anfrage
        // schon erhalten – die 3xx-Antwort ist das Ergebnis, die Bestätigungsseite
        // (oft http oder intern) wird nicht mehr geladen
        if (!followRedirects) {
          callback.onRedirectVerifyCallback(Cr.NS_ERROR_ABORT);
          finish(oldChannel, true);
          fail(new Error("redirect not followed"));
          return;
        }
        // das Ziel muss ebenfalls öffentlich sein – sonst gar nicht erst verbinden
        if (!isPublicHttps(newChannel.URI.spec)) {
          callback.onRedirectVerifyCallback(Cr.NS_ERROR_ABORT);
          fail(new Error("blocked redirect"));
          return;
        }
        current = newChannel;
        callback.onRedirectVerifyCallback(Cr.NS_OK);
      },
    };
    try {
      channel.asyncOpen({
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
        onStartRequest(request) {
          current = request;
        },
        onDataAvailable(request, stream, offset, count) {
          const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
          input.setInputStream(stream);
          const chunk = new Uint8Array(count);
          input.readArrayBuffer(count, chunk.buffer);
          if (size + count > max) {
            if (!truncate) {
              fail(new Error("too large"));
              return;
            }
            parts.push(chunk.subarray(0, max - size));
            size = max;
            finish(request);
            request.cancel(Cr.NS_BINDING_ABORTED);
            return;
          }
          parts.push(chunk);
          size += count;
        },
        onStopRequest(request, status) {
          if (request != current) {
            return; // alter Kanal nach einer Umleitung
          }
          if (Components.isSuccessCode(status)) {
            finish(request);
          } else {
            fail(new Error(`network error 0x${(status >>> 0).toString(16)}`));
          }
        },
      });
    } catch (e) {
      fail(e);
    }
  });
}

// Zeitkurve wie CSS cubic-bezier(x1, y1, x2, y2)
// Ordnernamen wie in Apple Mail (Ordnerliste und Titel über der Mailliste)
function appleLabels() {
  const lang = Services.locale.appLocaleAsBCP47;
  // andere Sprachen: Thunderbirds eigene, übersetzte Namen behalten
  if (!lang.startsWith("de") && !lang.startsWith("en")) {
    return { native: true };
  }
  return lang.startsWith("de")
    ? { favourites: "Favoriten", allInboxes: "Alle Eingänge", allSent: "Alle gesendeten", onMyMac: IS_MAC ? "Auf meinem Mac" : "Auf diesem Computer",
        Inbox: "Posteingang", Drafts: "Entwürfe", SentMail: "Gesendet", Junk: "Werbung", Trash: "Papierkorb", Archive: "Archiv", Templates: "Vorlagen" }
    : { favourites: "Favourites", allInboxes: "All Inboxes", allSent: "All Sent", onMyMac: IS_MAC ? "On My Mac" : "On This Computer",
        Inbox: "Inbox", Drafts: "Drafts", SentMail: "Sent", Junk: "Junk", Trash: "Bin", Archive: "Archive", Templates: "Templates" };
}
// Name der lokalen Ordner in der Ordnerliste („On My Mac“, „On This
// Computer“, in anderen Sprachen Thunderbirds eigener)
function localFoldersName() {
  const L = appleLabels();
  return L.native ? (MailServices.accounts.localFoldersServer?.prettyName || "Local Folders") : L.onMyMac;
}
// Posteingang immer zuerst (order 0), Gmails „Wichtig“ direkt danach (1)
// Breite der Mailliste wie in Apple Mail fest; die Nachricht nimmt den Rest
// (Thunderbird hält sonst die Nachricht fest und lässt die Liste auf großen
// Bildschirmen auf über 2000 px wachsen)
const LIST_WIDTH_PREF = "extensions.mailcards.listWidth";
const LIST_WIDTH_DEFAULT = 460;
const FOLDER_ORDER = { Inbox: 0, Drafts: 2, SentMail: 3, Junk: 4, Trash: 5, Archive: 6, Templates: 7 };
function folderRole(folder) {
  return Object.keys(FOLDER_ORDER).find(k => folder?.getFlag(Ci.nsMsgFolderFlags[k]));
}

// Titel über der Mailliste wie Apple: „All Inboxes“ bzw. „Inbox – Google“
// Ordnername wie in der Ordnerliste (ohne Konto) – z. B. „Sent“ im Platzhalter der Suche
function appleFolderName(folder) {
  const L = appleLabels();
  const role = folderRole(folder);
  // frisch angelegte Ordner haben noch keinen prettyName (null) – dann name
  const plain = folder.prettyName || folder.localizedName || folder.name;
  if (folder.name == STARRED_FOLDER_NAME && folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    return tr("Starred");
  }
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI)) {
    if (role == "Inbox" && !L.native) return L.allInboxes;
    if (role == "SentMail" && !L.native) return L.allSent;
    return plain;
  }
  return role && !L.native ? L[role] : plain;
}

function appleFolderTitle(folder) {
  const L = appleLabels();
  const name = appleFolderName(folder);
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI) || folder.name == STARRED_FOLDER_NAME) {
    return name;
  }
  const account = folder.server?.type == "none" && !L.native ? L.onMyMac : folder.server?.prettyName;
  return account ? `${name} – ${account}` : name;
}

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleY = t => ((ay * t + by) * t + cy) * t;
  const slopeX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0 || x >= 1) {
      return Math.min(1, Math.max(0, x));
    }
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      const d = slopeX(t);
      if (Math.abs(dx) < 1e-6 || Math.abs(d) < 1e-6) {
        break;
      }
      t -= dx / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

// Ziehen an der Trennlinie einer Seitenleiste (links) bzw. der Today-Pane
// (rechts, gespiegelt) – eine Logik für alle Bereiche, wie in Apple Mail:
// unter der Schwelle verschwindet die Leiste sofort, zurückgezogen kommt sie
// im selben Zug wieder (beliebig oft, bis zum Loslassen), alles ohne
// Animation. Aus der ausgeblendeten Lage heraus (Greifzone am Rand) ebenso.
// Die Breite folgt dem Zeiger, wenn pane.setWidth da ist (sonst feste Breite:
// nur ein-/ausblenden).
//   pane.side: "left" | "right"
//   pane.hidden(), pane.setHidden(bool), pane.width()
//   pane.threshold(startHidden, startWidth): Breite, unter der die Leiste aus ist
//   pane.setWidth(px) (optional), pane.done(hidden) (optional, beim Loslassen)
function dragPane(event, pane) {
  if (event.button != 0) {
    return;
  }
  const doc = event.currentTarget.ownerDocument;
  const win = doc.defaultView;
  const root = doc.documentElement;
  const dir = pane.side == "right" ? -1 : 1;
  // Lage auf dem Bildschirm statt im Dokument: blendet das Ziehen die
  // Bereiche-Leiste aus, rutscht ein eingebettetes Dokument (Adressbuch,
  // Einstellungen, Mail) mit – clientX spränge dann unter dem Zeiger
  const posX = e => e.clientX + (win.mozInnerScreenX || 0);
  const startX = posX(event);
  const startHidden = pane.hidden();
  const startWidth = startHidden ? 0 : pane.width();
  const threshold = pane.threshold(startHidden, startWidth);
  let hidden = startHidden;
  // Zeiger an die Seite binden: Bewegungen kommen weiter an, auch wenn die
  // Trennlinie mit der Leiste verschwindet oder der Zeiger die Seite verlässt
  try {
    root.setPointerCapture(event.pointerId);
  } catch {} // gewollt: Zeiger schon losgelassen
  const cursor = root.style.cursor;
  root.style.cursor = "col-resize";
  const onMove = e => {
    if (!(e.buttons & 1)) {
      end();
      return;
    }
    const size = startWidth + dir * (posX(e) - startX);
    const hide = size < threshold;
    if (hide != hidden) {
      hidden = hide;
      pane.setHidden(hide);
    }
    if (!hide) {
      pane.setWidth?.(size);
    }
  };
  const end = () => {
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", end, true);
    root.style.cursor = cursor;
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {} // gewollt: Zeiger schon losgelassen
    pane.done?.(hidden);
  };
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", end, true);
}

// Thunderbirds eigenes Ziehen an einer Trennlinie (XUL-Splitter, Pane-Splitter)
// abschalten – dragPane übernimmt es (beide reagieren auf „mousedown“)
function blockNativeSplitter(event) {
  if (event.button == 0) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

// ---------------------------------------------------------------------------
// Logo-Cache (pro Domain, im Profil gespeichert)
// ---------------------------------------------------------------------------

// Fotos aus der macOS-Kontakte-App. iCloud liefert Kontaktfotos nur als Link,
// der eine iCloud-Web-Anmeldung verlangt – die Kontakte-App hat sie aber lokal.
// Ein Hilfsskript (eigener Prozess, nur lesend) legt stündlich Vorschaubilder
// und eine Zuordnungsliste (E-Mail, Name) im Profilordner „mail-cards-photos“
// ab. An den Kontakten selbst ändert sich nichts.
const MAC_PHOTOS_PREF = "extensions.mailcards.macContactPhotos";
// Updates beim Start suchen und installieren (höchstens alle 6 Stunden)
const AUTO_UPDATE_PREF = "extensions.mailcards.autoUpdate";
const AUTO_UPDATE_LAST_PREF = "extensions.mailcards.autoUpdateLast";
// reine Textmails in der Systemschrift (plaintext.css)
const PLAIN_TEXT_PREF = "extensions.mailcards.plainTextSystemFont";
// aus: keine Anfrage an Absender-Websites (Favicon, BIMI, Startseite)
const SENDER_LOGOS_PREF = "extensions.mailcards.senderLogos";
const MAC_PHOTOS_SCRIPT = `
ObjC.import('Contacts');
ObjC.import('Foundation');
function run(argv) {
  const dir = argv[0];
  const store = $.CNContactStore.alloc.init;
  const keys = $([$.CNContactIdentifierKey, $.CNContactImageDataAvailableKey, $.CNContactThumbnailImageDataKey,
    $.CNContactEmailAddressesKey, $.CNContactGivenNameKey, $.CNContactFamilyNameKey, $.CNContactOrganizationNameKey]);
  const req = $.CNContactFetchRequest.alloc.initWithKeysToFetch(keys);
  const out = [];
  store.enumerateContactsWithFetchRequestErrorUsingBlock(req, null, function (c, stop) {
    if (!c.imageDataAvailable) return;
    const data = c.thumbnailImageData;
    if (!data || Number(data.length) == 0) return;
    const file = ObjC.unwrap(c.identifier).replace(/[^A-Za-z0-9]/g, "_") + ".img";
    data.writeToFileAtomically(dir + "/" + file, true);
    const emails = [];
    for (let i = 0; i < Number(c.emailAddresses.count); i++) {
      emails.push(String(ObjC.unwrap(c.emailAddresses.objectAtIndex(i).value)).toLowerCase());
    }
    out.push({ f: file, e: emails,
      n: (String(ObjC.unwrap(c.givenName) || "") + " " + String(ObjC.unwrap(c.familyName) || "")).trim(),
      o: String(ObjC.unwrap(c.organizationName) || "") });
  });
  $(JSON.stringify(out)).writeToFileAtomicallyEncodingError(dir + "/index.json", true, $.NSUTF8StringEncoding, null);
  return String(out.length);
}`;

const MacPhotos = {
  byEmail: new Map(), // E-Mail → Dateipfad
  byName: new Map(), // Name (klein) → Dateipfad
  version: 0,
  running: false,
  listeners: new Set(),

  folder() {
    const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
    f.append("mail-cards-photos");
    return f.path;
  },

  norm(name) {
    return (name || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  },

  async load() {
    if (Services.prefs.prefHasUserValue(MAC_PHOTOS_PREF) && !Services.prefs.getBoolPref(MAC_PHOTOS_PREF)) {
      return; // ausgeschaltet
    }
    try {
      const list = await IOUtils.readJSON(PathUtils.join(this.folder(), "index.json"));
      this.byEmail.clear();
      this.byName.clear();
      for (const entry of list) {
        const path = PathUtils.join(this.folder(), entry.f);
        for (const e of entry.e || []) {
          this.byEmail.set(e, path);
        }
        for (const n of [entry.n, entry.o]) {
          if (n && !this.byName.has(this.norm(n))) {
            this.byName.set(this.norm(n), path);
          }
        }
      }
      this.version++;
      log("mac photos loaded", { photos: list.length, emails: this.byEmail.size });
    } catch {} // Kandidat fürs Protokoll: Bilder aus Fotos nicht ladbar
  },

  // Dateipfad zum Foto eines Kontakts (über E-Mail-Adressen, sonst Name)
  lookup(emails = [], name = "") {
    for (const e of emails) {
      const hit = e && this.byEmail.get(String(e).toLowerCase());
      if (hit) {
        return hit;
      }
    }
    return this.byName.get(this.norm(name)) || null;
  },

  fileURL(path) {
    return PathUtils.toFileURI(path) + "?v=" + this.version;
  },

  // Liest die macOS-Kontakte (dafür fragt macOS einmal nach Zugriff) – nur,
  // wenn eingeschaltet (extensions.mailcards.macContactPhotos = true) oder
  // schon einmal eingerichtet (Fotoverzeichnis vorhanden)
  async enabled() {
    if (Services.prefs.prefHasUserValue(MAC_PHOTOS_PREF)) {
      return Services.prefs.getBoolPref(MAC_PHOTOS_PREF);
    }
    return IOUtils.exists(PathUtils.join(this.folder(), "index.json")).catch(() => false);
  },

  async sync() {
    if (Services.appinfo.OS != "Darwin" || this.running || !(await this.enabled())) {
      return;
    }
    this.running = true;
    const t0 = Date.now();
    const dir = this.folder();
    const script = PathUtils.join(PathUtils.tempDir, "mail-cards-contact-photos.js");
    try {
      await IOUtils.makeDirectory(dir, { ignoreExisting: true });
      await IOUtils.writeUTF8(script, MAC_PHOTOS_SCRIPT);
      const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
      const proc = await Subprocess.call({ command: "/usr/bin/osascript", arguments: ["-l", "JavaScript", script, dir], stderr: "pipe" });
      const killer = setTimeout(() => proc.kill(), 120000);
      const [out, err] = await Promise.all([proc.stdout.readString(), proc.stderr.readString()]);
      const { exitCode } = await proc.wait();
      clearTimeout(killer);
      log("mac photos sync", { ms: Date.now() - t0, exitCode, photos: out.trim(), err: err.trim().slice(0, 160) });
      if (exitCode == 0) {
        await this.load();
        // Dateien von Kontakten, die es nicht mehr gibt, entfernen
        const keep = new Set([...this.byEmail.values(), ...this.byName.values()]);
        for (const child of await IOUtils.getChildren(dir)) {
          if (child.endsWith(".img") && !keep.has(child)) {
            await IOUtils.remove(child).catch(() => {});
          }
        }
        this.listeners.forEach(fn => fn());
      }
    } catch (e) {
      log("mac photos sync error", String(e).slice(0, 200));
    } finally {
      this.running = false;
      await IOUtils.remove(script).catch(() => {});
    }
  },
};

class LogoCache {
  constructor() {
    this.path = PathUtils.join(PathUtils.profileDir, CACHE_FILE);
    this.entries = {};
    this.loaded = this.load();
    this.saveTimer = null;
  }

  async load() {
    try {
      this.entries = await IOUtils.readJSON(this.path);
    } catch {
      this.entries = {};
    }
    // Abgelaufenes entfernen – sonst wächst die Datei mit jedem Absender
    let dropped = 0;
    for (const [domain, e] of Object.entries(this.entries)) {
      if (!e || !e.t || Date.now() - e.t > (e.src ? HIT_TTL : MISS_TTL) || (!e.src && e.v !== 2)) {
        delete this.entries[domain];
        dropped++;
      }
    }
    if (dropped) {
      this.scheduleSave();
    }
  }

  get(domain) {
    const e = this.entries[domain];
    if (!e) {
      return undefined;
    }
    // „kein Logo“ aus älteren Versionen verwerfen: bis 3.0.82 scheiterte jeder Abruf
    if (!e.src && e.v !== 2) {
      return undefined;
    }
    const ttl = e.src ? HIT_TTL : MISS_TTL;
    return Date.now() - e.t < ttl ? e : undefined;
  }

  set(domain, value) {
    this.entries[domain] = { ...value, t: Date.now() };
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        await IOUtils.writeJSON(this.path, this.entries, {
          tmpPath: this.path + ".tmp",
        });
      } catch (e) {
        log("cache save failed", e);
      }
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Absenderbilder
// ---------------------------------------------------------------------------

class AvatarResolver {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.cache = new LogoCache();
    this.byEmail = new Map(); // email -> {src, small} | null
    this.pending = new Map(); // email -> Promise
    this.domainPending = new Map();
  }

  peek(email) {
    return this.byEmail.get(email);
  }

  resolve(email, hint = {}) {
    if (this.byEmail.has(email)) {
      return Promise.resolve(this.byEmail.get(email));
    }
    if (!this.pending.has(email)) {
      const p = this._resolve(email, hint)
        .catch(e => {
          log("avatar error", email, e);
          return null;
        })
        .then(result => {
          this.byEmail.set(email, result);
          this.pending.delete(email);
          return result;
        });
      this.pending.set(email, p);
    }
    return this.pending.get(email);
  }

  async _resolve(email, hint = {}) {
    const fromAb = await this.fromAddressBook(email);
    if (fromAb) {
      debugLog("avatar", email, "Adressbuch");
      return { src: await this.normalize(fromAb), small: false };
    }
    const domain = email.split("@")[1];
    if (!domain) {
      return null;
    }
    const org = orgDomain(domain);
    if (FREEMAIL.has(org) || FREEMAIL.has(domain)) {
      debugLog("avatar", email, "Initialen (Freemail)");
      return null;
    }
    let logo = await this.domainLogo(domain, org);
    let used = org;
    // Versand über fremde Dienste (z. B. brave.discoursemail.com): Die Marke
    // steckt dann oft nur in der Message-ID (…@community.brave.app). Nur
    // nutzen, wenn ihr Name auch im Absender vorkommt – sonst kämen Logos von
    // Versanddiensten wie Amazon SES oder Mailchimp.
    const idHost = ((hint.messageId || "").split("@")[1] || "").replace(/[>\s]/g, "").toLowerCase();
    if (!logo && idHost && idHost.includes(".")) {
      // von der Basisdomain aufwärts: community.brave.app → brave.app
      // (brave.app steht selbst in der Liste der Domain-Endungen)
      const sender = `${hint.name || ""} ${domain}`.toLowerCase();
      const labels = orgDomain(idHost).split(".");
      for (let i = 0; !logo && labels.length - i >= 2; i++) {
        const d = labels.slice(i).join(".");
        const brand = labels[i];
        if (d != org && brand.length >= 3 && sender.includes(brand) && !FREEMAIL.has(d)) {
          logo = await this.domainLogo(d, d);
          used = d;
        }
      }
    }
    debugLog("avatar", email, logo ? `Logo ${used} (${logo.source || "Speicher"})` : "Initialen (kein Logo)");
    return logo;
  }

  // Einheitliche Größe: einfarbigen bzw. durchsichtigen Rand eines Logos
  // erkennen, wegschneiden und das Motiv mit gleichem Abstand neu zentrieren.
  // Bilder ohne erkennbaren Rand (Fotos, randlose Logos) bleiben unverändert.
  async normalize(src) {
    const win = this.getWindow();
    if (!win || !src) {
      return src;
    }
    try {
      const img = new win.Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
      });
      const N = 128;
      const XHTML = "http://www.w3.org/1999/xhtml";
      const canvas = win.document.createElementNS(XHTML, "canvas");
      canvas.width = canvas.height = N;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const iw = img.naturalWidth || N;
      const ih = img.naturalHeight || N;
      const scale = Math.min(N / iw, N / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (N - dw) / 2;
      const oy = (N - dh) / 2;
      ctx.drawImage(img, ox, oy, dw, dh);
      const data = ctx.getImageData(0, 0, N, N).data;
      const at = (x, y) => {
        const i = (Math.min(N - 1, Math.max(0, Math.round(y))) * N + Math.min(N - 1, Math.max(0, Math.round(x)))) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
      };
      const corners = [
        at(ox + 1, oy + 1), at(ox + dw - 2, oy + 1),
        at(ox + 1, oy + dh - 2), at(ox + dw - 2, oy + dh - 2),
      ];
      const opaque = corners.filter(c => c[3] > 200).length >= 3;
      // Fotos erkennt man an unterschiedlichen Ecken – die bleiben unverändert
      if (opaque) {
        const spread = k => Math.max(...corners.map(c => c[k])) - Math.min(...corners.map(c => c[k]));
        if (spread(0) + spread(1) + spread(2) > 60) {
          return src;
        }
      }
      const bg = opaque
        ? [0, 1, 2].map(k => Math.round(corners.reduce((a, c) => a + c[k], 0) / 4))
        : null;
      let minX = N, minY = N, maxX = -1, maxY = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4;
          const a = data[i + 3];
          const content = opaque
            ? a > 24 && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 48
            : a > 24;
          if (content) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        return src;
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      // Randlose, durchsichtige Logos (z. B. ein runder Spotify-Kreis) sind
      // bereits für den Kreis gestaltet. Alle anderen Logos – zu kleine wie
      // zu große – kommen auf dieselbe Größe.
      if (!opaque && bw > N * 0.9 && bh > N * 0.9) {
        return src;
      }
      const cx = (minX + maxX + 1) / 2;
      const cy = (minY + maxY + 1) / 2;
      // Scheibe auf durchsichtigem Grund (z. B. Tasse auf farbigem Kreis oder
      // Rundquadrat mit Rand): Berührt die Fläche an allen vier Kantenmitten
      // einfarbig den Rand, ist sie selbst der Hintergrund – zuschneiden und
      // den Kreis damit füllen statt sie verkleinert auf Weiß zu setzen
      let disc = null;
      if (!opaque) {
        const pts = [at(minX + 3, cy), at(maxX - 3, cy), at(cx, minY + 3), at(cx, maxY - 3)];
        const same = [0, 1, 2].every(k => Math.max(...pts.map(c => c[k])) - Math.min(...pts.map(c => c[k])) <= 16);
        if (same && pts.every(c => c[3] > 200)) {
          disc = [0, 1, 2].map(k => Math.round(pts.reduce((t, c) => t + c[k], 0) / 4));
        }
      }
      // Motiv auf ca. 69 % der Kantenlänge – passt auch diagonal in den Kreis
      const side = Math.max(bw, bh) * (disc ? 1 : 1.45);
      const out = win.document.createElementNS(XHTML, "canvas");
      out.width = out.height = N;
      const octx = out.getContext("2d");
      octx.fillStyle = opaque ? `rgb(${bg.join(",")})` : disc ? `rgb(${disc.join(",")})` : "#fff";
      octx.fillRect(0, 0, N, N);
      octx.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, N, N);
      return out.toDataURL("image/png");
    } catch (e) {
      log("normalize error", e);
      return src;
    }
  }

  async fromAddressBook(email) {
    let card = null;
    try {
      card = MailServices.ab.cardForEmailAddress(email);
    } catch {
      return null;
    }
    const url = card?.photoURL;
    if (url?.startsWith("data:")) {
      return url;
    }
    if (url?.startsWith("file:")) {
      // Foto im lokalen Adressbuch: Thunderbird legt es als Datei in <Profil>/Photos ab
      const win = this.getWindow();
      if (win) {
        try {
          const path = Services.io.newURI(url).QueryInterface(Ci.nsIFileURL).file.path;
          // nur ganze Dateien bis 2 MB – größere (alte Profile: Kamerafoto
          // unverändert kopiert) nicht abgeschnitten anzeigen, sondern wie im
          // Netz-Zweig überspringen
          const { size } = await IOUtils.stat(path);
          if (size >= 100 && size <= 2 * 1024 * 1024) {
            const buf = await IOUtils.read(path);
            return `data:image/jpeg;base64,${bytesToBase64(win, buf)}`;
          }
        } catch {} // gewollt: kein Bild in diesem Ordner, nächster Weg
      }
    }
    // Foto aus der macOS-Kontakte-App (iCloud-Fotos sind nur als Link hinterlegt)
    const local = MacPhotos.lookup([email, ...(card?.emailAddresses || [])], card?.displayName);
    if (local) {
      const win = this.getWindow();
      try {
        const buf = await IOUtils.read(local);
        return `data:image/jpeg;base64,${bytesToBase64(win, buf)}`;
      } catch {} // gewollt: kein lokales Bild, nächster Weg
    }
    if (!url) {
      return null;
    }
    const win = this.getWindow();
    if (!win) {
      return null;
    }
    try {
      const res = await fetchWithTimeout(win, url);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      // Anmeldeseiten (iCloud: 401 mit HTML) sind kein Foto – dann Initialen
      if (!res.ok || !type.startsWith("image/")) {
        return null;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 100 || buf.length > 2 * 1024 * 1024) {
        return null;
      }
      return `data:${type};base64,${bytesToBase64(win, buf)}`;
    } catch {
      return null;
    }
  }

  async domainLogo(domain, org) {
    if (!Services.prefs.getBoolPref(SENDER_LOGOS_PREF, true)) {
      return null;
    }
    await this.cache.loaded;
    const key = org;
    let cached = this.cache.get(key);
    // BIMI-Logos bis 3.23.1 wurden wie Favicons verkleinert (weißer Ring im
    // Kreis) – das Original ist dann verloren, also einmal neu holen
    if (cached?.source == "BIMI" && cached.n !== 3) {
      cached = undefined;
    }
    if (cached) {
      if (!cached.src) {
        return null;
      }
      if (cached.n !== 2 && cached.source != "BIMI") {
        // Logo aus einer älteren Version: einmalig zuschneiden und merken
        const src = await this.normalize(cached.src);
        this.cache.set(key, { src, small: false, n: 2, source: cached.source });
        return { src, small: false, source: cached.source };
      }
      return { src: cached.src, small: false, source: cached.source };
    }
    if (!this.domainPending.has(key)) {
      const p = (async () => {
        const win = this.getWindow();
        if (!win) {
          return null;
        }
        let found = null;
        const timeoutsBefore = fetchTimeouts;
        for (const d of new Set([domain, org])) {
          found = await this.bimi(win, d);
          if (found) {
            break;
          }
        }
        if (!found) {
          found = await this.siteIcon(win, org);
        }
        // BIMI-Logos sind laut Vorgabe für den Kreis gestaltet (quadratisch,
        // Motiv in der Mitte) – wie Apple Mail randlos in den Kreis, nicht
        // zuschneiden und verkleinern wie Favicons
        if (found?.source == "BIMI") {
          found = { src: found.src, small: false, n: 3, source: "BIMI" };
        } else if (found) {
          found = { src: await this.normalize(found.src), small: false, n: 2, source: found.source };
        }
        if (found || fetchTimeouts == timeoutsBefore) {
          this.cache.set(key, found || { src: null, v: 2 });
        }
        return found;
      })().finally(() => this.domainPending.delete(key));
      this.domainPending.set(key, p);
    }
    return this.domainPending.get(key);
  }

  async bimi(win, domain) {
    let records;
    try {
      records = await DNS.txt(`default._bimi.${domain}`);
    } catch {
      return null;
    }
    for (const rec of records || []) {
      const txt = (rec.strings || [rec.data || ""]).join("");
      if (!/v=BIMI1/i.test(txt)) {
        continue;
      }
      const m = txt.match(/(?:^|;)\s*l=([^;\s]+)/i);
      if (!m || !m[1].startsWith("https://")) {
        continue;
      }
      try {
        const res = await fetchWithTimeout(win, m[1], { max: 256 * 1024 });
        if (!res.ok) {
          continue;
        }
        const svg = await res.text();
        if (svg.length > 256 * 1024 || !/<svg[\s>]/i.test(svg.slice(0, 4096))) {
          continue;
        }
        return {
          src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
          small: false,
          source: "BIMI",
        };
      } catch {
        // nächster Eintrag oder nächste Quelle
      }
    }
    return null;
  }

  async siteIcon(win, org) {
    const candidates = [
      `https://${org}/apple-touch-icon.png`,
      `https://www.${org}/apple-touch-icon.png`,
    ];
    // Icons aus dem <head> der Startseite (apple-touch-icon bevorzugt)
    for (const home of [`https://www.${org}/`, `https://${org}/`]) try {
      // nur der Anfang mit dem <head> wird gebraucht
      const res = await fetchWithTimeout(win, home, {
        headers: { Accept: "text/html" },
        max: 200000,
        truncate: true,
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 200000);
        const base = res.url;
        const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(x => x[0]);
        const scored = [];
        for (const tag of links) {
          const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || "";
          const href = (tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
          if (!href || !/icon/i.test(rel)) {
            continue;
          }
          const sizes = (tag.match(/\bsizes\s*=\s*["']?(\d+)/i) || [])[1];
          let score = Number(sizes) || 32;
          if (/apple-touch-icon/i.test(rel)) {
            score += 1000;
          }
          if (/\.svg(\?|$)/i.test(href)) {
            score += 500;
          }
          try {
            scored.push({ url: Services.io.newURI(base).resolve(href), score });
          } catch {} // gewollt: ungültige Adresse im Logo-Verweis
        }
        scored.sort((a, b) => b.score - a.score);
        candidates.unshift(...scored.slice(0, 3).map(s => s.url));
        break;
      }
    } catch (e) {
      debugLog("siteIcon", home, "Fehler", String(e));
    }
    candidates.push(`https://www.${org}/favicon.ico`, `https://${org}/favicon.ico`);

    for (const url of new Set(candidates)) {
      if (!url.startsWith("https://")) {
        continue;
      }
      try {
        const res = await fetchWithTimeout(win, url, { max: 512 * 1024 });
        const type = (res.headers.get("content-type") || "").split(";")[0];
        if (!res.ok || !type.startsWith("image/")) {
          continue;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length < 100 || buf.length > 512 * 1024) {
          continue;
        }
        const small = !/apple-touch-icon|\.svg/i.test(url) && buf.length < 6000;
        return {
          src: `data:${type};base64,${bytesToBase64(win, buf)}`,
          small,
          source: "Website",
        };
      } catch (e) {
        debugLog("siteIcon", url, "Fehler", String(e));
      }
    }
    return null;
  }
}

// CSS-Variable nur setzen, wenn sich der Wert ändert – jede Änderung am
// Wurzelelement lässt Thunderbird das ganze Fenster neu durchrechnen (~10 ms)
function setVar(el, name, value) {
  if (el && el.style.getPropertyValue(name) != value) {
    el.style.setProperty(name, value);
  }
}

// Platz, den die Toolbar rechts der Mailliste braucht: alle Knöpfe in
// natürlicher Breite, das Suchfeld mit 333 px, der kleinste Abstand nach
// „Verfassen“ (12 px), der Rand rechts und 6 px Einzug an der Listenkante
// Breite der Fensterknöpfe rechts in der Toolbar-Zeile (Windows/Linux:
// Minimieren, Maximieren, Schließen; auf dem Mac 0)
function captionWidth(doc) {
  if (Services.appinfo.OS == "Darwin") {
    return 0; // auf dem Mac sitzen sie links (Ampel)
  }
  return Math.round(doc.querySelector("#unifiedToolbarContainer .titlebar-buttonbox-container")?.getBoundingClientRect().width || 0);
}

// Platz rechts neben der Knopfleiste in der Toolbar-Zeile (Windows/Linux:
// ≡-Menü und Fensterknöpfe stehen dort neben #unifiedToolbarContent und
// nehmen ihm Breite weg; auf dem Mac 0)
function rowTail(doc) {
  if (Services.appinfo.OS == "Darwin") {
    return 0;
  }
  const row = doc.getElementById("unifiedToolbarContainer")?.getBoundingClientRect();
  const content = doc.getElementById("unifiedToolbarContent")?.getBoundingClientRect();
  if (!row?.width || !content?.width) {
    return 0;
  }
  return Math.max(0, Math.round(row.right - content.right));
}

// minimal: nur die Pillen, die bei Platzmangel nie weichen (KEEP_PILLS), der
// Überlauf-Knopf und das Suchfeld in seiner kleinsten sinnvollen Breite – für
// Ziehgrenzen
function toolbarNeed(doc, minimal = false, searchMin = 160) {
  const content = doc.getElementById("unifiedToolbarContent");
  if (!content) {
    return 0;
  }
  const win = doc.defaultView;
  // rechts: Abstand für Today-Pane/-Knopf und was unter Windows/Linux neben
  // der Knopfleiste steht (≡-Menü, Fensterknöpfe – das Padding ist darum
  // kleiner, siehe --mc-row-tail)
  const pad = parseFloat(win.getComputedStyle(content).paddingInlineEnd) || 0;
  let need = 10 + Math.max(pad, 60) + rowTail(doc) + 12 + (minimal ? OVERFLOW_W : 0);
  let afterFirst = false;
  for (const li of content.children) {
    const id = li.getAttribute("item-id");
    if (id == "spacer") {
      afterFirst = true;
      continue;
    }
    if (!afterFirst || li.hidden || li.id == OVERFLOW_ID || (!li.getBoundingClientRect().width && !li.hasAttribute("mc-squeezed"))) {
      continue;
    }
    if (minimal && id != "search-bar" && !KEEP_PILLS.flat().includes(id)) {
      continue;
    }
    if (!minimal && li.hasAttribute("mc-squeezed")) {
      continue;
    }
    const cs = win.getComputedStyle(li);
    const margins = (parseFloat(cs.marginInlineStart) || 0) + (id == "write-message" ? 12 : parseFloat(cs.marginInlineEnd) || 0);
    need += (id == "search-bar" ? (minimal ? searchMin : 333) : li.getBoundingClientRect().width) + margins;
  }
  if (!minimal) {
    const ov = doc.getElementById(OVERFLOW_ID);
    if (ov && !ov.hasAttribute("mc-squeezed")) {
      need += OVERFLOW_W;
    }
  }
  return Math.ceil(need);
}

// Zu wenig Platz in der Toolbar-Zeile (z. B. 1280 px mit Today-Pane): wie
// Apple Mail zuerst das Suchfeld bis auf die Lupe, dann ganze Pillen
// (Knopfgruppen) ausblenden – nie eine Pille abschneiden oder nur einzelne
// Knöpfe daraus. Links neben dem Suchfeld erscheint dann der Überlauf-Knopf
// „»“, sein Menü zeigt die Aktionen aller ausgeblendeten Pillen. Gilt in
// allen eigenen Bereichen (nicht in Bereichen fremder Add-ons, z. B. einem
// ersetzten Chat). fits() misst nach jedem Schritt. Streng in dieser
// Reihenfolge (zurück umgekehrt) – eine schmalere Pille kommt nicht vor einer
// wichtigeren zurück, sonst wechselten sie sich beim Ändern der Breite ab.
// Pillen weichen von rechts nach links wie in Apple Mail; Knöpfe von Add-ons
// (unbekannte item-id) zuerst, jeder als eigene Pille.
const SQUEEZE_PILLS = [
  ["mark-as"], ["move-to"], ["archive", "delete", "junk"], ["reply", "reply-all", "forward-inline"],
  ["create-address-book", "create-list"],
];
// weichen nie: Abrufen + Verfassen, „Neu“ in Kalender, Aufgaben und Adressbuch
const KEEP_PILLS = [["get-messages", "write-message"], ["new-event", "new-task"], ["create-contact"]];
const OVERFLOW_ID = "mcToolbarOverflow";
// Kapsel 40 px + 6 px Abstand zum Suchfeld
const OVERFLOW_W = 46;
// Bereiche, deren Toolbar halo.spaces gestaltet (sonst, z. B. ein von einem
// Add-on ersetzter Chat, bleibt die Leiste unberührt)
const OVERFLOW_TABS = ["mail3PaneTab", "mailMessageTab", "calendar", "tasks", "addressBookTab", "chat", "preferencesTab"];

// ids der Knöpfe in Toolbar-Reihenfolge → Pillen in der Reihenfolge, in der
// sie weichen (reine Funktion, siehe tests/logik/ueberlauf.test.mjs)
function overflowPills(ids) {
  const known = new Set([...SQUEEZE_PILLS, ...KEEP_PILLS].flat());
  const foreign = ids.filter(id => id && !["spacer", "search-bar"].includes(id) && !known.has(id)).reverse().map(id => [id]);
  return [...foreign, ...SQUEEZE_PILLS.map(pill => pill.filter(id => ids.includes(id))).filter(pill => pill.length)];
}

function squeezeToolbar(doc, fits) {
  const content = doc.getElementById("unifiedToolbarContent");
  if (!content) {
    return;
  }
  for (const li of content.querySelectorAll(":scope > li[mc-squeezed]")) {
    li.removeAttribute("mc-squeezed");
  }
  // (der Überlauf-Knopf ist ausgeblendet wie eine Pille: so blendet er beim
  // Ein-/Ausblenden der Today-Pane mit aus, statt zu springen)
  const ov = overflowButton(doc, content);
  ov.setAttribute("mc-squeezed", "");
  // Suchfeld erst wieder frei (es misst sich mit allen Pillen)
  const search = content.querySelector(':scope > li[item-id="search-bar"]');
  lockSearch(content, search, false);
  if (fits()) {
    return;
  }
  // Ab hier weichen Pillen: das Suchfeld bleibt dabei die Lupe (40 px) und
  // wird auch nicht wieder breiter, wenn das Fenster weiter schrumpft – sonst
  // nahm es den Platz jeder gewichenen Pille, wurde 47 → 66 → 46 → 104 px
  // (Mail, 1620 → 1580 px) und sprang beim Ziehen hin und her. Erst wenn alle
  // Pillen wieder passen, gibt die Messung oben das Feld wieder frei
  // (Maintainer 11.11.2026).
  lockSearch(content, search, true);
  if (fits()) {
    return;
  }
  // nur Knöpfe, die ohne Ausblenden zu sehen wären (Thunderbird blendet
  // manche selbst aus, z. B. „Neue Aufgabe“ im Kalender)
  const win = doc.defaultView;
  const shown = [...content.children].filter(li => !li.hidden && li.id != OVERFLOW_ID && win.getComputedStyle(li).display != "none");
  const byId = new Map(shown.map(li => [li.getAttribute("item-id"), li]));
  const pills = overflowPills(shown.map(li => li.getAttribute("item-id")));
  if (!pills.length) {
    return;
  }
  ov.removeAttribute("mc-squeezed");
  for (const pill of pills) {
    for (const id of pill) {
      byId.get(id)?.setAttribute("mc-squeezed", "");
    }
    if (fits()) {
      break;
    }
  }
}

// Suchfeld auf die Lupe festhalten (mc-search-lupe), solange Pillen weichen
function lockSearch(content, search, lock) {
  content.toggleAttribute("mc-search-lupe", lock);
  if (!search) {
    return;
  }
  // (über eine Variable, die userChrome.css in min() liest – Inline-Stile
  // schlagen die !important-Regeln des Nutzer-Stilblatts nicht)
  if (lock) {
    search.style.setProperty("--mc-search-lock", "40px");
  } else {
    search.style.removeProperty("--mc-search-lock");
  }
}

// Überlauf-Knopf „»“ direkt links neben dem Suchfeld (eigene Kapsel); wird
// angelegt, wenn er fehlt (Thunderbird baut die Leiste beim Anpassen neu)
function overflowButton(doc, content) {
  let li = doc.getElementById(OVERFLOW_ID);
  // (Thunderbird blendet beim Bereichswechsel alle Einträge, die nicht zum
  // Bereich gehören, mit hidden aus – auch diesen; sichtbar macht ihn nur
  // mc-squeezed)
  if (li) {
    li.hidden = false;
  }
  const search = content.querySelector(':scope > li[item-id="search-bar"]:not([hidden])');
  if (li && li.parentNode == content && (!search || li.nextElementSibling == search)) {
    return li;
  }
  if (!li) {
    li = doc.createElement("li");
    li.id = OVERFLOW_ID;
    li.setAttribute("mc-squeezed", "");
    // Thunderbirds Toolbar ruft bei jedem Tab-Wechsel bzw. Schließen diese
    // Methoden aller Einträge auf (sonst TypeError in der Fehlerkonsole)
    li.onTabSwitched = () => {};
    li.onTabClosing = () => {};
    const button = doc.createElement("button");
    button.className = "unified-toolbar-button button";
    button.title = tr("More");
    button.setAttribute("aria-label", tr("More"));
    button.setAttribute("aria-haspopup", "menu");
    const icon = doc.createElement("img");
    icon.className = "button-icon";
    icon.alt = "";
    button.append(icon);
    li.append(button);
    button.addEventListener("click", () => openOverflowMenu(doc, button));
  }
  if (search) {
    search.before(li);
  } else {
    content.append(li);
  }
  return li;
}

// Menü mit den Aktionen aller ausgeblendeten Pillen (Toolbar-Reihenfolge):
// Symbol und Name des Knopfs; Knöpfe mit eigenem Menü (Verschieben,
// Markieren) öffnen es am Überlauf-Knopf
function openOverflowMenu(doc, button) {
  const win = doc.defaultView;
  doc.getElementById("mcToolbarOverflowMenu")?.remove();
  const menu = doc.createXULElement("menupopup");
  menu.id = "mcToolbarOverflowMenu";
  const hidden = [...doc.querySelectorAll(`#unifiedToolbarContent > li[mc-squeezed]:not([hidden], #${OVERFLOW_ID})`)];
  for (const li of hidden) {
    const b = li.querySelector("button");
    if (!b) {
      continue;
    }
    // ausgeblendete Knöpfe erfahren nicht immer, dass sich die Auswahl
    // geändert hat (z. B. „Antworten“ blieb grau): Zustand jetzt abfragen
    try {
      b.onCommandContextChange?.();
    } catch {} // gewollt: Knopf ohne Zustandsabfrage
    const label = (b.querySelector(".button-label")?.textContent || b.getAttribute("aria-label") || b.title || "").trim();
    const item = doc.createXULElement("menuitem");
    item.className = "menuitem-iconic";
    item.setAttribute("label", label || li.getAttribute("item-id"));
    item.setAttribute("mc-item", li.getAttribute("item-id") || "");
    if (b.disabled || b.hasAttribute("disabled")) {
      item.setAttribute("disabled", "true");
    }
    const icon = b.querySelector(".button-icon");
    const mask = icon ? win.getComputedStyle(icon).maskImage : "none";
    if (mask && mask != "none") {
      item.style.setProperty("--mc-ov-icon", mask);
    }
    const popupId = b.getAttribute("popup");
    item.addEventListener("command", () => {
      if (popupId) {
        // erst nach dem Schließen dieses Menüs (sonst schließt es das neue mit)
        win.setTimeout(() => doc.getElementById(popupId)?.openPopup(button, "after_end", 0, 2, false, false), 0);
      } else {
        b.click();
      }
    });
    menu.append(item);
  }
  (doc.getElementById("mainPopupSet") || doc.documentElement).append(menu);
  button.setAttribute("open", "true");
  menu.addEventListener("popuphiding", event => event.target == menu && button.removeAttribute("open"));
  menu.addEventListener("popuphidden", event => event.target == menu && menu.remove());
  menu.openPopup(button, "after_end", 0, 2, false, false);
}

function removeOverflowButton(doc) {
  squeezeToolbar(doc, () => true);
  doc.getElementById(OVERFLOW_ID)?.remove();
  doc.getElementById("mcToolbarOverflowMenu")?.remove();
}

const UNREAD_TINT_PREF = "extensions.mailcards.unreadTint";
const SOLID_MENUS_PREF = "extensions.mailcards.solidMenus";
const BDAY_PREF = "extensions.mailcards.birthdays";
const BDAY_CAL_PREF = "extensions.mailcards.birthdayCalendarId";
// iCloud hängt alten Erinnerungslisten nach dem Update der Erinnerungen-App
// ein ⚠️ an den Namen – diese Listen werden nicht mehr über CalDAV abgeglichen
function calendarNote(calendar) {
  const name = calendar?.name || "";
  let host = "";
  try {
    host = calendar?.uri?.host || "";
  } catch {} // gewollt: Kalender ohne Adresse
  if (!/\u26A0\uFE0F?\s*$/.test(name) || !/(^|\.)icloud\.com$/i.test(host)) {
    return null;
  }
  return Services.locale.appLocaleAsBCP47.startsWith("de")
    ? "iCloud markiert diese Liste mit ⚠️: Sie wurde in der Erinnerungen-App aktualisiert und wird nicht mehr über CalDAV abgeglichen – neue Erinnerungen erscheinen hier nicht."
    : "iCloud marks this list with ⚠️: it was upgraded in the Reminders app and no longer syncs over CalDAV – new reminders won't appear here.";
}

// Kanten für die Toolbar-Zeile nur dort setzen, wo sie gebraucht werden:
// an der Wurzel ließe jede Änderung alle ~5000 Elemente neu berechnen
// (25–40 ms pro Bild – die Seitenleisten-Animation ruckelt), an der
// Toolbar-Zeile sind es ~80.
function barTarget(doc) {
  return doc.getElementById("unifiedToolbarContainer") || doc.documentElement;
}
// Rechteck in Schreibrichtung: bei Rechts-nach-links-Sprachen gespiegelt
// (left = Abstand vom rechten Fensterrand), damit die Positionsrechnungen der
// Toolbar-Zeile für beide Richtungen gelten – die Werte landen in
// inset-inline-start & Co., die sich selbst spiegeln
function rectOf(el) {
  if (!el) {
    return undefined;
  }
  const r = el.getBoundingClientRect();
  const doc = el.ownerDocument;
  if (doc.__mcRtl === undefined) {
    doc.__mcRtl = doc.defaultView?.getComputedStyle(doc.documentElement).direction == "rtl";
  }
  if (!doc.__mcRtl) {
    return r;
  }
  const W = doc.documentElement.clientWidth;
  return { left: W - r.right, right: W - r.left, x: W - r.right, top: r.top, bottom: r.bottom, y: r.y, width: r.width, height: r.height };
}

// Erster Abstandhalter der Toolbar, an dem die Knöpfe ausgerichtet werden –
// nur wenn er wirklich vorn steht (davor können ausgeblendete Knöpfe anderer
// Bereiche liegen). Eigene Anordnungen ohne ihn (z. B. „Synchronisieren, Neu,
// Bearbeiten, Löschen“) bekommen den Abstand als Einzug der ganzen Zeile
// (mc-no-lead), sonst lagen ihre Knöpfe über der Seitenleiste
function leadSpacer(content) {
  if (!content) {
    return null;
  }
  const view = content.ownerDocument.defaultView;
  if (!view) {
    return null;
  }
  const first = [...content.children].find(li => !li.hidden && view.getComputedStyle(li).display != "none");
  const lead = first?.getAttribute("item-id") == "spacer" ? first : null;
  content.toggleAttribute("mc-no-lead", !!first && !lead);
  return lead;
}
function setBarVar(doc, name, value) {
  setVar(barTarget(doc), name, value);
}

// ---------------------------------------------------------------------------
// Design aus der Erweiterung (theme.css)
// ---------------------------------------------------------------------------

// Das komplette Design liegt als theme.css in der Erweiterung – so kommt es
// mit jedem Update automatisch mit, ohne userChrome.css im Profil. Liegt dort
// noch eine (ältere, manuell kopierte) userChrome.css dieses Designs, gilt
// diese und theme.css bleibt aus, damit nichts doppelt greift.
// Kopfzeile der eigenen userChrome.css (ältere Fassungen trugen noch den alten Text)
const THEME_MARKERS = ["halo.spaces – ruhiges Design für Thunderbird", "Thunderbird im Stil von Apple Mail"];
// Start ohne Aufblitzen (Einstellung, Standard aus): Thunderbird zeichnet das
// Fenster, bevor Erweiterungen starten – nur eine userChrome.css im Profil gilt
// von Anfang an. Ist die Option an, schreibt halo.spaces sein Design dorthin
// (mit eigener Kopfzeile) und schaltet toolkit.legacyUserProfileCustomizations.
// stylesheets ein; nach Updates neu geschrieben. Aus, deaktiviert oder
// deinstalliert: Datei weg, Einstellung zurück. Eine userChrome.css ohne unsere
// Kopfzeile (selbst angelegt, alte Handinstallation) wird nie angefasst
const EARLY_THEME_PREF = "extensions.mailcards.earlyTheme";
const EARLY_LEGACY_PREF = "extensions.mailcards.earlyThemeSetLegacy";
const LEGACY_PREF = "toolkit.legacyUserProfileCustomizations.stylesheets";
const EarlyTheme = {
  HEAD: "/* halo.spaces: automatisch geschrieben (Start ohne Aufblitzen), Version ",
  file() {
    const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("chrome");
    file.append("userChrome.css");
    return file;
  },
  // Fassung aus unserer Kopfzeile, sonst null (fremde oder keine Datei)
  versionOf(head) {
    const at = (head || "").indexOf(this.HEAD);
    return at < 0 ? null : head.slice(at + this.HEAD.length).split(" ")[0];
  },
  async head() {
    const path = this.file().path;
    if (!(await IOUtils.exists(path))) {
      return null;
    }
    return (await IOUtils.readUTF8(path)).slice(0, 4096);
  },
  async sync() {
    try {
      if (Services.prefs.getBoolPref(EARLY_THEME_PREF, false) && Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
        await this.write();
      } else {
        await this.remove();
      }
    } catch (e) {
      log("early theme error", e);
    }
  },
  async write() {
    const head = await this.head();
    if (head !== null && this.versionOf(head) === null) {
      log("early theme: eigene userChrome.css des Nutzers – nicht überschrieben");
      return false;
    }
    if (head !== null && this.versionOf(head) == extensionVersion) {
      this.legacyOn();
      return true;
    }
    const channel = NetUtil.newChannel({ uri: "resource://mailcards/theme.css", loadUsingSystemPrincipal: true });
    const stream = channel.open();
    const css = NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
    stream.close();
    const file = this.file();
    await IOUtils.makeDirectory(file.parent.path, { ignoreExisting: true });
    await IOUtils.writeUTF8(file.path, `${this.HEAD}${extensionVersion} – nicht von Hand ändern, wird ersetzt */\n${css}`);
    this.legacyOn();
    return true;
  },
  legacyOn() {
    if (!Services.prefs.getBoolPref(LEGACY_PREF, false)) {
      Services.prefs.setBoolPref(LEGACY_PREF, true);
      Services.prefs.setBoolPref(EARLY_LEGACY_PREF, true);
    }
  },
  async remove() {
    const head = await this.head();
    if (head !== null && this.versionOf(head) !== null) {
      await IOUtils.remove(this.file().path);
    }
    // nur zurücksetzen, was halo.spaces selbst eingeschaltet hat
    if (Services.prefs.getBoolPref(EARLY_LEGACY_PREF, false)) {
      Services.prefs.clearUserPref(LEGACY_PREF);
      Services.prefs.clearUserPref(EARLY_LEGACY_PREF);
    }
  },
};

const ThemeSheet = {
  uri: "resource://mailcards/theme.css",
  active: false,
  init() {
    this.active = false;
    if (!Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      return;
    }
    try {
      const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("chrome");
      file.append("userChrome.css");
      if (file.exists()) {
        const stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
        stream.init(file, -1, 0, 0);
        const head = NetUtil.readInputStreamToString(stream, Math.min(stream.available(), 4096));
        stream.close();
        // eigene Kopie für den Start ohne Aufblitzen (EarlyTheme): gilt nur in der
        // aktuellen Fassung – nach einem Update lud Thunderbird noch die alte
        const managed = EarlyTheme.versionOf(head);
        if (managed !== null) {
          if (managed == extensionVersion) {
            log("theme: eigene userChrome.css (Start ohne Aufblitzen) ist aktuell");
            return;
          }
        } else if (THEME_MARKERS.some(m => head.includes(m))) {
          log("theme: userChrome.css im Profil hat Vorrang");
          return;
        }
      }
    } catch (e) {
      log("theme check error", String(e).slice(0, 120));
    }
    this.active = true;
  },
  // alle Thunderbird-eigenen Dokumente (wie userChrome.css: chrome://-Seiten)
  // sowie die Inhalts-Tabs Adressbuch, Einstellungen, Add-ons …
  wanted(doc) {
    const url = doc?.documentURI || "";
    return url.startsWith("chrome://") ||
      /^about:(addressbook|preferences|addons|accountsettings|accountsetup|message|3pane|import|profiling|downloads|support|config)/.test(url);
  },
  apply(win) {
    if (!this.active || !win || win.__mcTheme == this.uri || !this.wanted(win.document)) {
      return;
    }
    try {
      // nach einem Update: die alte Fassung in schon offenen Seiten ersetzen
      if (win.__mcTheme) {
        try {
          win.windowUtils.removeSheetUsingURIString(win.__mcTheme, win.windowUtils.USER_SHEET);
        } catch {} // gewollt: alte Fassung schon entfernt
      }
      win.windowUtils.loadSheetUsingURIString(this.uri, win.windowUtils.USER_SHEET);
      win.__mcTheme = this.uri;
    } catch {} // Kandidat fürs Protokoll: Design lässt sich im Fenster nicht laden
  },
  // alle Dokumente eines Fensters – auch die der Inhalts-Tabs (Einstellungen,
  // Adressbuch …): deren Browser sind eigene Bäume, nicht Teil des Fensters
  contexts(top) {
    const roots = [top?.browsingContext];
    for (const browserEl of top?.document?.querySelectorAll("browser") || []) {
      roots.push(browserEl.browsingContext);
    }
    const all = new Set();
    for (const root of roots) {
      for (const bc of root?.getAllBrowsingContextsInSubtree?.() || []) {
        all.add(bc);
      }
    }
    return all;
  },
  applyTree(top) {
    for (const bc of this.contexts(top)) {
      this.apply(bc.window); // null für Inhalte in anderen Prozessen (Mails)
    }
  },
  removeAll() {
    for (const top of Services.wm.getEnumerator(null)) {
      for (const bc of this.contexts(top)) {
        const win = bc.window;
        if (win?.__mcTheme) {
          try {
            win.windowUtils.removeSheetUsingURIString(win.__mcTheme, win.windowUtils.USER_SHEET);
          } catch {} // gewollt: Fassung schon entfernt
          delete win.__mcTheme;
        }
      }
    }
  },
};
