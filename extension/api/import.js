/* halo.spaces – Import und Archiv (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js an der alten Stelle in dieselbe Umgebung (gemeinsamer
 * globaler Bereich der Experiment-API): PstFs und PstImport (Outlook-Datendatei
 * lesen) sowie ArchiveAccount und hookArchiveAccount (Konto lokal archivieren)
 * stehen danach dort direkt zur Verfügung. Zur Ladezeit nur Namen nutzen, die
 * vorher schon da sind; Namen aus implementation.js (tr, log …) erst zur
 * Laufzeit. Reihe „Code: implementation.js in Module zerlegen“ 4/8.
 */
// Outlook-Datendatei (PST) lesen und als Kopie importieren (Mails nach Lokale
// Ordner/<Name der Datei>, Ordnerbaum wie in der Datei). Bibliothek pst-extractor (MIT), gebündelt in
// vendor/pst (Herkunft und Lizenzen dort in SOURCE.md). Die Datei wird
// stückweise über Thunderbird gelesen, nicht ganz in den Speicher geladen.
const PstFs = {
  files: new Map(),
  next: 3,
  openSync(path) {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    const fis = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    fis.init(file, 0x01, 0, 0);
    const bin = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    bin.setInputStream(fis);
    const fd = this.next++;
    this.files.set(fd, { fis, bin, seek: fis.QueryInterface(Ci.nsISeekableStream), size: file.fileSize });
    return fd;
  },
  readSync(fd, buffer, offset, length, position) {
    const f = this.files.get(fd);
    const len = Math.max(0, Math.min(length, f.size - position));
    if (!len) {
      return 0;
    }
    f.seek.seek(Ci.nsISeekableStream.NS_SEEK_SET, position);
    const ab = new ArrayBuffer(len);
    const got = f.bin.readArrayBuffer(len, ab);
    buffer.set(new Uint8Array(ab, 0, got), offset);
    return got;
  },
  closeSync(fd) {
    this.files.get(fd)?.fis.close();
    this.files.delete(fd);
  },
};
const PstImport = {
  lib: null,
  load() {
    if (!this.lib) {
      globalThis.__haloPstFs = PstFs;
      const scope = {};
      Services.scriptloader.loadSubScript("resource://mailcards/vendor/pst/pst-extractor.js", scope);
      this.lib = scope.HaloPST;
    }
    return this.lib;
  },
  // Kopf einer Outlook-Datendatei („!BDN“): unterscheidet „keine PST“ von
  // „PST, die die Bibliothek nicht lesen kann“
  isPst(path) {
    try {
      const fd = PstFs.openSync(path);
      try {
        const head = new Uint8Array(4);
        PstFs.readSync(fd, head, 0, 4, 0);
        return String.fromCharCode(...head) == "!BDN";
      } finally {
        PstFs.closeSync(fd);
      }
    } catch {
      return false;
    }
  },
  // Datei öffnen: { pst, close }. Scheitert die Bibliothek schon beim Öffnen,
  // schließt sie die Datei nicht (unter Windows blieb sie dann gesperrt) –
  // alles, was ab hier geöffnet wird, schließt close() sicher
  openFile(path) {
    const lib = this.load();
    const firstFd = PstFs.next;
    const closeAll = () => {
      for (const fd of [...PstFs.files.keys()].filter(fd => fd >= firstFd)) {
        try {
          PstFs.closeSync(fd);
        } catch {}
      }
    };
    let pst;
    try {
      pst = new lib.PSTFile(path);
    } catch (e) {
      closeAll();
      throw e;
    }
    return {
      pst,
      close() {
        try {
          pst.close();
        } catch {}
        closeAll();
      },
    };
  },
  // Ordnerbaum { name, count, cls, children, ref }. Grenzen für Tiefe und
  // Ordnerzahl; ein Ordner, dessen Unterordner nicht lesbar sind, fehlt nur
  // selbst (die Bibliothek scheitert an manchen neueren PSTs aus Office 365 –
  // vorher hing sie dabei endlos, siehe tools/pst-bundle/fix.py)
  scan(pst) {
    let n = 0, broken = 0;
    const MAX_DEPTH = 30, MAX_FOLDERS = 10000;
    const walk = (folder, depth) => {
      let subs = [];
      try {
        subs = folder.hasSubfolders ? folder.getSubFolders() : [];
      } catch (e) {
        broken++;
        log("pst folder error", String(e).slice(0, 160));
      }
      const out = [];
      for (const sub of subs) {
        if (n >= MAX_FOLDERS) {
          break;
        }
        n++;
        let cls = "";
        try {
          cls = sub.containerClass || "";
        } catch {}
        out.push({ name: sub.displayName || "?", count: sub.contentCount || 0, cls, ref: sub,
          children: depth < MAX_DEPTH ? walk(sub, depth + 1) : [] });
      }
      return out;
    };
    const root = { name: "", count: 0, cls: "", children: walk(pst.getRootFolder(), 0) };
    if (!n && broken) {
      throw new Error("pst: folder tree unreadable");
    }
    return root;
  },
  // Ordnerbaum als Liste: [{ name, count, depth }], Gesamtzahl der Mails
  read(path) {
    const file = this.openFile(path);
    try {
      const folders = [];
      let total = 0;
      const flat = (list, depth) => {
        for (const f of list) {
          total += f.count;
          folders.push({ name: f.name, count: f.count, depth });
          flat(f.children, depth + 1);
        }
      };
      flat(this.scan(file.pst).children, 0);
      return { name: file.pst.getMessageStore?.()?.displayName || "", folders, total };
    } finally {
      file.close();
    }
  },

  // ---- Bausteine für den Import (reine Funktionen, Logik-Tests in tests/logik/pst.test.mjs)

  // Art eines Ordners nach seiner Klasse; ohne Klasse wie ein Mailordner
  kind(cls) {
    cls = String(cls || "");
    if (!cls || /^IPF\.(Note|Imap)(\.|$)/.test(cls)) {
      return "mail";
    }
    if (/^IPF\.Contact(\.|$)/.test(cls)) {
      return "contacts";
    }
    if (/^IPF\.Appointment(\.|$)/.test(cls)) {
      return "calendar";
    }
    if (/^IPF\.Task(\.|$)/.test(cls)) {
      return "tasks";
    }
    return "other";
  },
  // was importiert wird: Mailordner ohne leere Zweige, ohne Such- und
  // Systemordner; eine einzelne leere Hülle ohne Klasse oben („Top of Personal
  // Folders“, „Root - Mailbox“/„IPM_SUBTREE“) fällt weg. Kontakte, Kalender, Aufgaben:
  // alle Ordner dieser Art mit Inhalt
  plan(root) {
    const prune = node => {
      const children = (node.children || []).filter(c => this.kind(c.cls) == "mail").map(prune).filter(Boolean);
      return node.count > 0 || children.length ? { ...node, children } : null;
    };
    let top = (root.children || []).filter(c => this.kind(c.cls) == "mail").map(prune).filter(Boolean);
    while (top.length == 1 && !top[0].count && !top[0].cls && top[0].children.length) {
      top = top[0].children;
    }
    const mail = [];
    const flat = (list, depth, path) => {
      for (const n of list) {
        const p = [...path, n.name];
        mail.push({ name: n.name, count: n.count, depth, path: p, node: n });
        flat(n.children, depth + 1, p);
      }
    };
    flat(top, 0, []);
    const out = { mail, contacts: [], calendar: [], tasks: [] };
    const other = list => {
      for (const n of list || []) {
        const k = this.kind(n.cls);
        if (out[k] && k != "mail" && n.count > 0) {
          out[k].push({ name: n.name, count: n.count, node: n });
        }
        other(n.children);
      }
    };
    other(root.children);
    return out;
  },
  // Ordnername in Lokale Ordner (ohne Schrägstriche und Zeilenumbrüche)
  folderName(name) {
    return String(name || "").replace(/[\/\\\r\n\t]+/g, "-").replace(/^\.+/, "").trim().slice(0, 120) || "Outlook";
  },
  // kurzer, fester Fingerabdruck eines Textes (für erzeugte Message-IDs und UIDs)
  hash(s, rounds = 2) {
    s = String(s);
    let out = "";
    for (let r = 0; r < rounds; r++) {
      let h = (0x811c9dc5 ^ (r * 0x9e3779b9)) >>> 0;
      for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
      }
      out += h.toString(16).padStart(8, "0");
    }
    return out;
  },
  uuid(s) {
    const h = this.hash(s, 4);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  },
  bare(id) {
    return String(id || "").trim().replace(/^<|>$/g, "");
  },
  email(...candidates) {
    for (const c of candidates) {
      const e = String(c || "").trim().replace(/^<|>$/g, "");
      if (/^[^\s@<>"]+@[^\s@<>"]+$/.test(e)) {
        return e;
      }
    }
    return "";
  },
  // Text als Bytefolge (je Zeichen ein Byte 0–255), UTF-8
  utf8(s) {
    s = String(s ?? "");
    return unescape(encodeURIComponent(s.toWellFormed ? s.toWellFormed() : s));
  },
  bin(data) {
    if (typeof data == "string") {
      return data;
    }
    const parts = [];
    for (let i = 0; i < (data?.length || 0); i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, data.subarray ? data.subarray(i, i + 0x8000) : data.slice(i, i + 0x8000)));
    }
    return parts.join("");
  },
  b64(bin) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const out = [];
    for (let i = 0; i < bin.length; i += 3) {
      const n = (bin.charCodeAt(i) << 16) | ((bin.charCodeAt(i + 1) || 0) << 8) | (bin.charCodeAt(i + 2) || 0);
      out.push(A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bin.length ? A[(n >> 6) & 63] : "=") + (i + 2 < bin.length ? A[n & 63] : "="));
    }
    return out.join("");
  },
  // Base64 in Zeilen zu 76 Zeichen
  b64lines(bin) {
    const s = this.b64(bin), lines = [];
    for (let i = 0; i < s.length; i += 76) {
      lines.push(s.slice(i, i + 76));
    }
    return lines.join("\r\n");
  },
  // Kopfzeilen-Wert nach RFC 2047 (nur wenn nötig)
  word(s) {
    s = String(s ?? "").replace(/[\r\n]+/g, " ");
    if (/^[\x20-\x7e]*$/.test(s)) {
      return s;
    }
    const words = [];
    let cur = "";
    for (const ch of s) {
      const b = this.utf8(ch);
      if (cur.length + b.length > 45) {
        words.push(cur);
        cur = "";
      }
      cur += b;
    }
    if (cur) {
      words.push(cur);
    }
    return words.map(w => `=?UTF-8?B?${this.b64(w)}?=`).join("\r\n ");
  },
  addr(a) {
    const email = this.email(a?.email);
    const name = String(a?.name ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!name || name.toLowerCase() == email.toLowerCase()) {
      return email;
    }
    const n = /^[\x20-\x7e]*$/.test(name)
      ? (/[()<>@,;:\\".[\]]/.test(name) ? `"${name.replace(/[\\"]/g, "\\$&")}"` : name)
      : this.word(name);
    return `${n} <${email}>`;
  },
  rfcDate(d) {
    if (!d || typeof d.getTime != "function" || isNaN(d.getTime())) {
      return "";
    }
    const p = n => String(n).padStart(2, "0");
    return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]}, ${d.getUTCDate()} ` +
      `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
      `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
  },
  // Kopfzeilen aus dem Original (transportMessageHeaders): [[Name, Wert]],
  // Fortsetzungszeilen bleiben am Wert
  headers(raw) {
    const out = [];
    for (const line of String(raw || "").split(/\r?\n/)) {
      if (!line) {
        if (out.length) {
          break;
        }
        continue;
      }
      if (/^[ \t]/.test(line) && out.length) {
        out[out.length - 1][1] += `\r\n${line}`;
      } else {
        const m = /^([!-9;-~]+):[ \t]?(.*)$/.exec(line);
        if (m) {
          out.push([m[1], m[2]]);
        }
      }
    }
    return out;
  },
  KEEP: ["from", "sender", "reply-to", "to", "cc", "subject", "date", "in-reply-to", "references"],
  // Mail als RFC-822-Text. d: { headers (Original-Kopf, optional), from: { name,
  // email }, to, cc: [{ name, email }], subject, date, messageId, inReplyTo,
  // text, html, attachments: [{ name, type, data (Bytes), cid, message (d) }] }.
  // Kopfzeilen aus dem Original gehen vor; Inhalte als Base64, Zeilenende CRLF
  mime(d, depth = 0) {
    const keep = new Map();
    for (const [n, v] of this.headers(d.headers)) {
      if (this.KEEP.includes(n.toLowerCase()) && !keep.has(n.toLowerCase())) {
        keep.set(n.toLowerCase(), `${n}: ${v}`);
      }
    }
    const head = [];
    const put = (k, line) => {
      if (keep.has(k)) {
        head.push(keep.get(k));
      } else if (line) {
        head.push(line);
      }
    };
    const list = l => (l || []).map(a => this.addr(a)).filter(Boolean).join(",\r\n ");
    put("from", d.from && (this.addr(d.from) || null) && `From: ${this.addr(d.from)}`);
    put("sender");
    put("reply-to");
    put("to", list(d.to) && `To: ${list(d.to)}`);
    put("cc", list(d.cc) && `Cc: ${list(d.cc)}`);
    put("subject", `Subject: ${this.word(d.subject || "")}`);
    put("date", this.rfcDate(d.date) && `Date: ${this.rfcDate(d.date)}`);
    if (this.bare(d.messageId)) {
      head.push(`Message-ID: <${this.bare(d.messageId)}>`);
    }
    put("in-reply-to", this.bare(d.inReplyTo) && `In-Reply-To: <${this.bare(d.inReplyTo)}>`);
    put("references");
    head.push("MIME-Version: 1.0");
    const body = this.body(d, depth);
    return `${[...head, ...body.head].join("\r\n")}\r\n\r\n${body.text}\r\n`;
  },
  body(d, depth) {
    let count = 0;
    const part = (type, bin, extra = []) => ({ head: [`Content-Type: ${type}`, "Content-Transfer-Encoding: base64", ...extra], text: this.b64lines(bin) });
    const multi = (sub, parts) => {
      const b = `----=_halo_${depth}_${sub}_${count++}`;
      return { head: [`Content-Type: multipart/${sub}; boundary="${b}"`],
        text: `${parts.map(p => `--${b}\r\n${p.head.join("\r\n")}\r\n\r\n${p.text}\r\n`).join("")}--${b}--` };
    };
    const text = d.text ? part("text/plain; charset=UTF-8", this.utf8(d.text)) : null;
    // (eine Angabe im HTML wie charset=Windows-1252 passte nach dem Umschreiben nicht mehr)
    const html = d.html ? part("text/html; charset=UTF-8", this.utf8(String(d.html).replace(/(<meta\b[^>]*?charset=)(["']?)[\w.:-]+/gi, "$1$2utf-8"))) : null;
    const main = text && html ? multi("alternative", [text, html]) : html || text || part("text/plain; charset=UTF-8", "");
    const atts = (d.attachments || []).map(a => {
      const name = String(a.name || "attachment").replace(/[\r\n\t"\\]+/g, "_");
      const ascii = /^[\x20-\x7e]*$/.test(name);
      const fn = ascii ? `filename="${name}"` : `filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
      if (a.message && depth < 3) {
        return { head: ["Content-Type: message/rfc822", `Content-Disposition: attachment; ${fn}`], text: this.mime(a.message, depth + 1).replace(/\r\n$/, "") };
      }
      const type = /^[\w.+-]+\/[\w.+-]+$/.test(a.type || "") ? a.type.toLowerCase() : "application/octet-stream";
      const cid = this.bare(a.cid);
      return part(`${type}; name="${ascii ? name : this.word(name)}"`, this.bin(a.data || ""),
        [`Content-Disposition: ${cid && a.inline ? "inline" : "attachment"}; ${fn}`, ...(cid ? [`Content-ID: <${cid}>`] : [])]);
    });
    return atts.length ? multi("mixed", [main, ...atts]) : main;
  },
  valid(d) {
    return !!d && typeof d.getTime == "function" && !isNaN(d.getTime());
  },
  // Kalendertag eines Zeitpunkts: Outlook speichert Geburtstage, ganztägige
  // Termine und Aufgaben als Mitternacht der Ortszeit (in UTC) oder als
  // Mitternacht UTC – mit 12 Stunden Zuschlag ergibt beides denselben Tag
  day(d) {
    const x = new Date(d.getTime() + 12 * 3600e3);
    return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCDate()).padStart(2, "0")}`;
  },
  nextDay(day) {
    const x = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) + 1));
    return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCDate()).padStart(2, "0")}`;
  },
  utc(d) {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  },
  // Text in vCard und iCalendar (Rückstrich, Komma, Semikolon, Zeilenumbruch)
  esc(v) {
    return String(v ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  },
  // Kontakt als vCard 4.0 (wie Thunderbird sie speichert). c: { uid, display,
  // first, last, middle, prefix, suffix, nick, emails, org, dept, title,
  // phones: [[Art, Nummer]], adr: { work, home: { pobox, street, city, region,
  // zip, country } }, birthday, anniversary, url, note }
  vcard(c) {
    const e = v => this.esc(v);
    const L = ["BEGIN:VCARD", "VERSION:4.0"];
    if (c.uid) {
      L.push(`UID:${c.uid}`);
    }
    const emails = [...new Set((c.emails || []).map(x => this.email(x)).filter(Boolean))];
    const fn = c.display || [c.prefix, c.first, c.middle, c.last, c.suffix].filter(Boolean).join(" ") || c.org || emails[0] || "";
    L.push(`FN:${e(fn)}`);
    if (c.first || c.last || c.middle || c.prefix || c.suffix) {
      L.push(`N:${[c.last, c.first, c.middle, c.prefix, c.suffix].map(e).join(";")}`);
    }
    if (c.nick) {
      L.push(`NICKNAME:${e(c.nick)}`);
    }
    emails.forEach((x, i) => L.push(`EMAIL${i ? "" : ";PREF=1"}:${x}`));
    for (const [type, num] of c.phones || []) {
      if (String(num || "").trim()) {
        L.push(`TEL;TYPE=${type};VALUE=TEXT:${e(String(num).trim())}`);
      }
    }
    for (const type of ["work", "home"]) {
      const a = c.adr?.[type];
      if (a && [a.pobox, a.street, a.city, a.region, a.zip, a.country].some(Boolean)) {
        L.push(`ADR;TYPE=${type}:${[a.pobox, "", a.street, a.city, a.region, a.zip, a.country].map(e).join(";")}`);
      }
    }
    if (c.org || c.dept) {
      L.push(`ORG:${[c.org, c.dept].filter((x, i) => x || !i).map(e).join(";")}`);
    }
    if (c.title) {
      L.push(`TITLE:${e(c.title)}`);
    }
    if (this.valid(c.birthday)) {
      L.push(`BDAY;VALUE=DATE:${this.day(c.birthday)}`);
    }
    if (this.valid(c.anniversary)) {
      L.push(`ANNIVERSARY;VALUE=DATE:${this.day(c.anniversary)}`);
    }
    if (c.url) {
      L.push(`URL:${e(c.url)}`);
    }
    if (c.note) {
      L.push(`NOTE:${e(c.note)}`);
    }
    L.push("END:VCARD");
    return `${L.join("\r\n")}\r\n`;
  },
  // Wiederholung eines Serientermins aus der Outlook-Struktur
  // (PidLidAppointmentRecur, [MS-OXOCAL] 2.2.1.44): { rule (RRULE ohne Ende),
  // count, until (letzter Tag), day (erster Tag), startMin, endMin (Minuten ab
  // Mitternacht des ersten Tages, Ortszeit), exdays (gelöschte Tage) } oder null,
  // wenn sich die Regel nicht abbilden lässt (dann bleibt es ein einzelner Termin).
  // Geänderte Einzeltermine bleiben an ihrem ursprünglichen Platz in der Serie
  recur(bytes) {
    const b = bytes && bytes.length != null ? bytes : null;
    if (!b || b.length < 50) {
      return null;
    }
    let pos = 0;
    const u16 = () => {
      if (pos + 2 > b.length) {
        throw new Error("recur: zu kurz");
      }
      pos += 2;
      return b[pos - 2] | (b[pos - 1] << 8);
    };
    const u32 = () => (u16() + u16() * 0x10000) >>> 0;
    const minDay = min => {
      const d = new Date(min * 60000 - 11644473600000);
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    };
    const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const mask = m => DAYS.filter((_, i) => m & (1 << i)).join(",");
    try {
      u16(); u16();
      const freq = u16(), type = u16(), calType = u16();
      u32();
      const period = u32();
      u32();
      let spec = 0, nth = 0;
      if ([1, 2, 4].includes(type)) {
        spec = u32();
      } else if (type == 3) {
        spec = u32();
        nth = u32();
      } else if (type != 0) {
        return null; // (Hidschri-Kalender)
      }
      const endType = u32(), count = u32(), firstDow = u32();
      const deleted = Array.from({ length: Math.min(u32(), 5000) }, () => u32());
      const modified = Array.from({ length: Math.min(u32(), 5000) }, () => u32());
      const startDate = u32(), endDate = u32();
      u32(); u32();
      const startMin = u32(), endMin = u32();
      // ursprüngliche Tage der geänderten Einzeltermine (ExceptionInfo)
      const moved = new Set();
      try {
        const n = u16();
        for (let i = 0; i < n; i++) {
          u32(); u32();
          moved.add(minDay(u32()));
          const flags = u16();
          for (const [bit, kind] of [[1, "s"], [2, 4], [4, 4], [8, 4], [16, "s"], [32, 4], [64, 4], [128, 4], [256, 4]]) {
            if (flags & bit) {
              if (kind == "s") {
                u16();
                pos += u16();
              } else {
                pos += kind;
              }
            }
          }
        }
      } catch {
        modified.forEach(m => moved.add(minDay(m)));
      }
      if (calType || !period || startMin > 1440 || endMin < startMin) {
        return null;
      }
      const day = minDay(startDate);
      const wkst = firstDow < 7 ? `;WKST=${DAYS[firstDow]}` : "";
      let rule;
      if (freq == 0x200a && type == 0) {
        if (period % 1440) {
          return null;
        }
        rule = `FREQ=DAILY;INTERVAL=${period / 1440}`;
      } else if ((freq == 0x200b || freq == 0x200a) && type == 1 && mask(spec)) {
        rule = `FREQ=WEEKLY;INTERVAL=${period};BYDAY=${mask(spec)}${wkst}`;
      } else if ((freq == 0x200c || freq == 0x200d) && [2, 3, 4].includes(type)) {
        const yearly = freq == 0x200d || period % 12 == 0;
        const month = yearly ? `;BYMONTH=${+day.slice(4, 6)}` : "";
        const which = type == 2 ? (spec >= 1 && spec <= 31 ? `;BYMONTHDAY=${spec}` : null)
          : type == 4 ? ";BYMONTHDAY=-1"
          : mask(spec) && nth >= 1 && nth <= 5 ? `;BYDAY=${mask(spec)};BYSETPOS=${nth == 5 ? -1 : nth}` : null;
        if (!which) {
          return null;
        }
        rule = yearly ? `FREQ=YEARLY;INTERVAL=${Math.max(1, period / 12)}${month}${which}` : `FREQ=MONTHLY;INTERVAL=${period}${which}`;
      } else {
        return null;
      }
      return { rule, day, startMin, endMin,
        count: endType == 0x2022 && count > 0 ? count : 0,
        until: endType == 0x2021 ? minDay(endDate) : "",
        exdays: [...new Set(deleted.map(minDay))].filter(d => !moved.has(d)).sort() };
    } catch {
      return null;
    }
  },
  // Ortszeit „YYYYMMDD“ + Minuten als iCalendar-Zeit (ohne Zone)
  wall(day, min) {
    const x = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), 0, min));
    return x.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
  },
  // dieselbe Ortszeit in der Zone tz als UTC-Zeitpunkt
  wallUtc(day, min, tz) {
    const guess = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), 0, min);
    const offset = t => {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
    };
    let t = guess - offset(guess);
    t = guess - offset(t);
    return new Date(t);
  },
  // Termin als VEVENT. e: { uid, summary, start, end, allDay, location,
  // description, free, recur (siehe recur()), tzid (Zone für Serien) }; ohne
  // gültigen Beginn leer
  vevent(e) {
    if (!this.valid(e.start) && !e.recur) {
      return "";
    }
    const L = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${this.utc(this.valid(e.start) ? e.start : new Date(0))}`, `SUMMARY:${this.esc(e.summary)}`];
    const r = e.recur;
    if (r) {
      const end = r.count ? `;COUNT=${r.count}` : "";
      if (e.allDay) {
        const days = Math.max(1, Math.round((r.endMin - r.startMin) / 1440));
        L.push(`DTSTART;VALUE=DATE:${r.day}`, `DTEND;VALUE=DATE:${this.wall(r.day, days * 1440).slice(0, 8)}`,
          `RRULE:${r.rule}${end}${r.until ? `;UNTIL=${r.until}` : ""}`);
        if (r.exdays.length) {
          L.push(`EXDATE;VALUE=DATE:${r.exdays.join(",")}`);
        }
      } else {
        const tz = e.tzid ? `;TZID=${e.tzid}` : "";
        const until = !r.until ? "" : e.tzid ? this.utc(this.wallUtc(r.until, r.startMin, e.tzid)) : this.wall(r.until, r.startMin);
        L.push(`DTSTART${tz}:${this.wall(r.day, r.startMin)}`, `DTEND${tz}:${this.wall(r.day, r.endMin)}`,
          `RRULE:${r.rule}${end}${until ? `;UNTIL=${until}` : ""}`);
        if (r.exdays.length) {
          L.push(`EXDATE${tz}:${r.exdays.map(d => this.wall(d, r.startMin)).join(",")}`);
        }
      }
    } else if (e.allDay) {
      const start = this.day(e.start);
      let end = this.valid(e.end) ? this.day(e.end) : "";
      if (!end || end <= start) {
        end = this.nextDay(start);
      }
      L.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`);
    } else {
      L.push(`DTSTART:${this.utc(e.start)}`, `DTEND:${this.utc(this.valid(e.end) && e.end >= e.start ? e.end : e.start)}`);
    }
    if (e.location) {
      L.push(`LOCATION:${this.esc(e.location)}`);
    }
    if (e.description) {
      L.push(`DESCRIPTION:${this.esc(e.description)}`);
    }
    L.push(`TRANSP:${e.free ? "TRANSPARENT" : "OPAQUE"}`, "END:VEVENT");
    return `${L.join("\r\n")}\r\n`;
  },
  // Aufgabe als VTODO. t: { uid, summary, start, due, done, completed,
  // percent (0–1), description }
  vtodo(t) {
    const L = ["BEGIN:VTODO", `UID:${t.uid}`, `SUMMARY:${this.esc(t.summary)}`];
    const start = this.valid(t.start) ? this.day(t.start) : "";
    const due = this.valid(t.due) ? this.day(t.due) : "";
    if (start) {
      L.push(`DTSTART;VALUE=DATE:${start}`);
    }
    if (due && (!start || due >= start)) {
      L.push(`DUE;VALUE=DATE:${due}`);
    }
    if (t.done) {
      L.push("STATUS:COMPLETED", "PERCENT-COMPLETE:100");
      if (this.valid(t.completed)) {
        L.push(`COMPLETED:${this.utc(t.completed)}`);
      }
    } else if (t.percent > 0 && t.percent < 1) {
      L.push(`PERCENT-COMPLETE:${Math.round(t.percent * 100)}`);
    }
    if (t.description) {
      L.push(`DESCRIPTION:${this.esc(t.description)}`);
    }
    L.push("END:VTODO");
    return `${L.join("\r\n")}\r\n`;
  },

  // ---- Lesen aus der PST (Bibliothek) in die einfachen Daten oben

  // Elemente eines Ordners nacheinander (Fehler je Element: { error })
  *items(folder, convert) {
    try {
      folder.moveChildCursorTo(0);
    } catch {}
    const max = (folder.contentCount || 0) + 100;
    for (let i = 0; i < max; i++) {
      let item;
      try {
        item = folder.getNextChild();
      } catch (e) {
        log("pst item error", String(e).slice(0, 160));
        return;
      }
      if (!item) {
        return;
      }
      try {
        yield convert(item);
      } catch (e) {
        log("pst item error", String(e).slice(0, 160));
        yield { error: true };
      }
    }
  },
  mailOf(msg, store, depth = 0) {
    const s = v => (v == null ? "" : String(v));
    const date = msg.clientSubmitTime || msg.messageDeliveryTime || null;
    const to = [], cc = [];
    for (let i = 0; i < (msg.numberOfRecipients || 0); i++) {
      try {
        const r = msg.getRecipient(i);
        if (r) {
          (r.recipientType == 2 ? cc : r.recipientType == 1 ? to : []).push({ name: s(r.displayName), email: this.email(r.smtpAddress, r.emailAddress) });
        }
      } catch {}
    }
    const attachments = [];
    for (let i = 0; i < (msg.numberOfAttachments || 0); i++) {
      try {
        const a = msg.getAttachment(i);
        const name = s(a.longFilename || a.filename || a.displayName) || "attachment";
        // 5: eingebettete Nachricht (weitergeleitete Mail als Anhang)
        if (a.attachMethod == 5) {
          const inner = depth < 3 && a.embeddedPSTMessage;
          if (inner) {
            attachments.push({ name: name.endsWith(".eml") ? name : `${name}.eml`, message: this.mailOf(inner, store, depth + 1) });
          }
          continue;
        }
        const stream = a.fileInputStream;
        const len = stream ? Number(stream.length) : 0;
        const data = new Uint8Array(len);
        if (len) {
          stream.read(data);
        }
        attachments.push({ name, type: s(a.mimeTag), data, cid: s(a.contentId), inline: !!a.contentId && !!msg.bodyHTML });
      } catch (e) {
        log("pst attachment error", String(e).slice(0, 160));
      }
    }
    let flagged = false;
    try {
      flagged = msg.getIntItem(0x1090) == 2; // PidTagFlagStatus: 2 = markiert
    } catch {}
    const subject = s(msg.subject);
    return {
      headers: s(msg.transportMessageHeaders), subject, date,
      from: { name: s(msg.senderName || msg.sentRepresentingName), email: this.email(msg.senderEmailAddress, msg.sentRepresentingEmailAddress) },
      to, cc, text: s(msg.body), html: s(msg.bodyHTML), attachments,
      messageId: this.bare(msg.internetMessageId) || `pst.${this.hash(`${store}|${s(msg.descriptorNodeId)}|${subject}|${date?.getTime?.()}`)}@halo.spaces`,
      inReplyTo: s(msg.inReplyToId), read: !!msg.isRead, flagged,
    };
  },
  contactOf(c, store) {
    if (!/^IPM\.Contact/i.test(c.messageClass || "")) {
      return null; // (Verteilerlisten u. Ä.)
    }
    const s = v => (v == null ? "" : String(v).trim());
    return {
      uid: this.uuid(`${store}|contact|${s(c.descriptorNodeId)}|${s(c.displayName)}`),
      display: s(c.displayName), first: s(c.givenName), last: s(c.surname), middle: s(c.middleName),
      prefix: s(c.displayNamePrefix), suffix: s(c.generation), nick: s(c.nickname),
      emails: [c.email1EmailAddress, c.email2EmailAddress, c.email3EmailAddress].map(x => this.email(x)).filter(Boolean),
      org: s(c.companyName), dept: s(c.departmentName), title: s(c.title),
      phones: [["work", c.businessTelephoneNumber], ["home", c.homeTelephoneNumber], ["cell", c.mobileTelephoneNumber],
        ["fax", c.businessFaxNumber || c.homeFaxNumber || c.primaryFaxNumber], ["pager", c.pagerTelephoneNumber],
        ["voice", c.primaryTelephoneNumber || c.otherTelephoneNumber]].filter(([, n]) => s(n)).map(([t, n]) => [t, s(n)]),
      adr: {
        work: { pobox: s(c.workAddressPostOfficeBox || c.businessPoBox), street: s(c.workAddressStreet || c.businessAddressStreet),
          city: s(c.workAddressCity || c.businessAddressCity), region: s(c.workAddressState || c.businessAddressStateOrProvince),
          zip: s(c.workAddressPostalCode || c.businessPostalCode), country: s(c.workAddressCountry || c.businessAddressCountry) },
        home: { pobox: s(c.homeAddressPostOfficeBox), street: s(c.homeAddressStreet), city: s(c.homeAddressCity),
          region: s(c.homeAddressStateOrProvince), zip: s(c.homeAddressPostalCode), country: s(c.homeAddressCountry) },
      },
      birthday: c.birthday, anniversary: c.anniversary, url: s(c.businessHomePage || c.personalHomePage), note: s(c.body),
    };
  },
  eventOf(a, store) {
    if (!/^IPM\.Appointment/i.test(a.messageClass || "")) {
      return null; // (Antworten auf Einladungen u. Ä.)
    }
    const s = v => (v == null ? "" : String(v));
    return {
      uid: this.uuid(`${store}|event|${s(a.descriptorNodeId)}|${s(a.subject)}|${a.startTime?.getTime?.()}`),
      summary: s(a.subject), start: a.startTime, end: a.endTime, allDay: !!a.subType, location: s(a.location),
      description: s(a.body), free: a.busyStatus == 0, recur: this.recurOf(a),
    };
  },
  recurOf(a) {
    try {
      return a.isRecurring ? this.recur(a.recurrenceStructure) : null;
    } catch (e) {
      log("pst recurrence error", String(e).slice(0, 160));
      return null;
    }
  },
  taskOf(t, store) {
    if (!/^IPM\.Task/i.test(t.messageClass || "")) {
      return null;
    }
    const s = v => (v == null ? "" : String(v));
    return {
      uid: this.uuid(`${store}|task|${s(t.descriptorNodeId)}|${s(t.subject)}`), task: true,
      summary: s(t.subject), start: t.taskStartDate, due: t.taskDueDate, done: !!t.isTaskComplete,
      completed: t.taskDateCompleted, percent: Number(t.percentComplete) || 0, description: s(t.body),
    };
  },
  // was der Assistent und der Import brauchen: { name, mail: [{ name, count,
  // depth, path, items() }], contacts: [{ name, count, items() }], calendar:
  // [{ name, count, items() }] (Termine und Aufgaben) } – items() liefert die
  // Einträge nacheinander
  source(pst, name) {
    const plan = this.plan(this.scan(pst));
    const wrap = (list, conv) => list.map(f => ({ name: f.name, count: f.count, depth: f.depth, path: f.path,
      items: () => this.items(f.node.ref, x => conv(x, name)) }));
    return { name, mail: wrap(plan.mail, (m, n) => this.mailOf(m, n)), contacts: wrap(plan.contacts, (c, n) => this.contactOf(c, n)),
      calendar: [...wrap(plan.calendar, (a, n) => this.eventOf(a, n)), ...wrap(plan.tasks, (t, n) => this.taskOf(t, n))] };
  },
  // Anzahl je Teil (für Übersicht und Auswahl)
  counts(source) {
    const sum = list => (list || []).reduce((a, f) => a + (f.count || 0), 0);
    return { mail: sum(source.mail), contacts: sum(source.contacts), calendar: sum(source.calendar) };
  },

  // ---- Import in Lokale Ordner/<Name der Datei>

  running: null,
  copyFile(path, dest, flags) {
    return new Promise(resolve => {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      MailServices.copy.copyFileMessage(file, dest, null, false, flags, "", {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
        onStartCopy() {}, onProgress() {}, setMessageKey() {}, getMessageId() {},
        onStopCopy: status => resolve(Components.isSuccessCode(status)),
        OnStartCopy() {}, OnProgress() {}, SetMessageKey() {}, GetMessageId() {},
        OnStopCopy: status => resolve(Components.isSuccessCode(status)),
      }, null);
    });
  },
  async addMessage(d, dest) {
    let path = null;
    try {
      path = await IOUtils.createUniqueFile(PathUtils.tempDir, "halo-pst.eml", 0o600);
      await IOUtils.writeUTF8(path, this.mime(d));
      const flags = (d.read ? Ci.nsMsgMessageFlags.Read : 0) | (d.flagged ? Ci.nsMsgMessageFlags.Marked : 0);
      return await this.copyFile(path, dest, flags);
    } catch (e) {
      log("pst import error", String(e).slice(0, 160));
      return false;
    } finally {
      if (path) {
        await IOUtils.remove(path).catch(() => {});
      }
    }
  },
  // Elemente eines Ordners aus source (Funktion oder Liste)
  list(f) {
    return typeof f.items == "function" ? f.items() : f.items || [];
  },
  // source (siehe source()) als Kopie importieren: Mails nach Lokale Ordner,
  // Kontakte in ein eigenes Adressbuch, Termine und Aufgaben in einen eigenen
  // Kalender (je mit dem Namen der Datei). Ein zweiter Lauf überspringt, was
  // schon da ist (Mails nach Message-ID, Kontakte und Termine nach UID)
  async run(source, win, status = () => {}, progress = () => {}, parts = { mail: true, contacts: true, calendar: true }) {
    if (this.running) {
      return null;
    }
    const job = { stop: false, folders: 0, copied: 0, skipped: 0, failedMessages: 0, failed: [], done: [],
      contacts: { added: 0, skipped: 0, failed: 0 }, events: { added: 0, skipped: 0, failed: 0 } };
    this.running = job;
    try {
      if (parts.mail && source.mail?.length) {
        await this.runMail(job, source, win, status, progress, parts.folders);
      }
      if (parts.contacts && !job.stop && this.counts(source).contacts) {
        status(tr("Importing {folder}…", { folder: tr("Contacts") }));
        await this.runContacts(job, source, win);
      }
      if (parts.calendar && !job.stop && this.counts(source).calendar) {
        status(tr("Importing {folder}…", { folder: tr("Calendar") }));
        await this.runCalendar(job, source, win);
      }
      return job;
    } finally {
      this.running = null;
    }
  },
  // Lokale Ordner (ohne sie – neues Profil, nur Konten – legt Thunderbird sie erst bei Bedarf an)
  localRoot() {
    let server = null;
    try {
      server = MailServices.accounts.localFoldersServer;
    } catch {}
    if (!server) {
      MailServices.accounts.createLocalMailAccount();
      server = MailServices.accounts.localFoldersServer;
    }
    return server.rootFolder;
  },
  // folders: Pfade der gewählten Ordner (path.join("\u0000")); ohne Angabe alle.
  // Nicht gewählte Ordner über einem gewählten entstehen leer, damit der Baum stimmt
  async runMail(job, source, win, status, progress, folders = null) {
    const chosen = folders && new Set(folders);
    const key = f => f.path.join("\u0000");
    const needed = f => !chosen || chosen.has(key(f)) || [...chosen].some(k => k.startsWith(`${key(f)}\u0000`));
    const local = this.localRoot();
    const target = await ArchiveAccount.child(local, this.folderName(source.name), win);
    if (!target) {
      job.failed.push(source.name);
      return;
    }
    job.target = target;
    const dests = new Map();
    for (const f of source.mail) {
      if (job.stop) {
        break;
      }
      if (!needed(f)) {
        continue;
      }
      const parent = f.path.length > 1 ? dests.get(f.path.slice(0, -1).join("\u0000")) : target;
      const dest = parent && await ArchiveAccount.child(parent, this.folderName(f.name), win);
      if (!dest) {
        job.failed.push(f.name);
        progress(f, { state: "failed", copied: 0, total: f.count });
        continue;
      }
      dests.set(f.path.join("\u0000"), dest);
      if (chosen && !chosen.has(key(f))) {
        continue;
      }
      job.folders++;
      const have = new Set(ArchiveAccount.messages(dest).map(h => h.messageId));
      let mine = 0, failed = 0;
      status(tr("Importing {folder}…", { folder: f.name }));
      progress(f, { state: "busy", copied: 0, total: f.count });
      for (const d of this.list(f)) {
        if (job.stop) {
          break;
        }
        const id = this.bare(d?.messageId);
        if (!d) {
          continue;
        } else if (d.error) {
          failed++;
        } else if (id && have.has(id)) {
          job.skipped++;
        } else if (await this.addMessage(d, dest)) {
          id && have.add(id);
          job.copied++;
          mine++;
        } else {
          failed++;
        }
        progress(f, { state: "busy", copied: mine, total: f.count });
        // (der Assistent bleibt bedienbar, auch wenn ein Ordner lang ist)
        await new Promise(r => win.setTimeout(r, 0));
      }
      job.failedMessages += failed;
      if (failed) {
        job.failed.push(f.name);
      }
      job.done.push({ name: f.name, path: f.path, dest, source: f.count });
      progress(f, { state: failed ? "failed" : job.stop ? "stopped" : "done", copied: mine, total: f.count, imported: dest.getTotalMessages(false) });
    }
  },
  // Kontakte in das Adressbuch <Name der Datei> (neu, oder das vom letzten Import)
  async runContacts(job, source, win) {
    const { VCardUtils } = ChromeUtils.importESModule("resource:///modules/VCardUtils.sys.mjs");
    const name = source.name;
    let book = MailServices.ab.directories.find(d => d.dirName == name && d.dirType == Ci.nsIAbManager.JS_DIRECTORY_TYPE);
    if (!book) {
      book = MailServices.ab.getDirectoryFromId(MailServices.ab.newAddressBook(name, "", Ci.nsIAbManager.JS_DIRECTORY_TYPE));
    }
    job.book = book;
    const have = new Set(book.childCards.map(c => c.UID));
    for (const f of source.contacts || []) {
      for (const c of this.list(f)) {
        if (job.stop) {
          return;
        }
        if (!c) {
          continue;
        }
        if (c.error) {
          job.contacts.failed++;
        } else if (have.has(c.uid)) {
          job.contacts.skipped++;
        } else {
          try {
            book.addCard(VCardUtils.vCardToAbCard(this.vcard(c)));
            have.add(c.uid);
            job.contacts.added++;
          } catch (e) {
            log("pst contact error", String(e).slice(0, 160));
            job.contacts.failed++;
          }
        }
        await new Promise(r => win.setTimeout(r, 0));
      }
    }
  },
  // Termine und Aufgaben in den Kalender <Name der Datei> (neu, lokal)
  async runCalendar(job, source, win) {
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
    const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
    const name = source.name;
    let calendar = cal.manager.getCalendars().find(c => c.name == name && c.type == "storage");
    if (!calendar) {
      const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://"));
      c.name = name;
      cal.manager.registerCalendar(c);
      calendar = cal.manager.getCalendarById(c.id) || c;
    }
    job.calendar = calendar;
    // Serientermine in der eingestellten Zeitzone (Outlook speichert ihre Uhrzeit als Ortszeit)
    // (nur Zonen, die Thunderbird kennt; sonst Ortszeit ohne Zone)
    let tzid = "";
    for (const get of [() => cal.dtz.defaultTimezone?.tzid, () => Intl.DateTimeFormat().resolvedOptions().timeZone]) {
      try {
        const id = get() || "";
        if (/^[A-Za-z_]+\/[\w/+-]+$/.test(id) && !/^Etc\//.test(id) && cal.timezoneService.getTimezone(id)) {
          tzid = id;
          break;
        }
      } catch {}
    }
    for (const f of source.calendar || []) {
      for (const x of this.list(f)) {
        if (job.stop) {
          return;
        }
        if (!x) {
          continue;
        }
        try {
          const ical = x.error ? "" : x.task ? this.vtodo(x) : this.vevent(tzid ? { ...x, tzid } : x);
          if (!ical) {
            job.events.failed++;
          } else if (await calendar.getItem(x.uid)) {
            job.events.skipped++;
          } else {
            const item = x.task ? new CalTodo() : new CalEvent();
            item.icalString = ical;
            await calendar.addItem(item);
            job.events.added++;
          }
        } catch (e) {
          log("pst event error", String(e).slice(0, 160));
          job.events.failed++;
        }
        await new Promise(r => win.setTimeout(r, 0));
      }
    }
  },

  // Datei wählen und lesen: { file, source } oder { error } (Text für die Meldung im Assistenten)
  async pick(win) {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(win.browsingContext, tr("Open Outlook Data File"), Ci.nsIFilePicker.modeOpen);
    fp.appendFilter(tr("Outlook Data File (PST)"), "*.pst");
    fp.appendFilters(Ci.nsIFilePicker.filterAll);
    const result = await new Promise(resolve => fp.open(resolve));
    if (result != Ci.nsIFilePicker.returnOK || !fp.file) {
      return null;
    }
    let file;
    try {
      file = this.openFile(fp.file.path);
      return { file, path: fp.file.path, source: this.source(file.pst, fp.file.leafName.replace(/\.(pst|ost)$/i, "")) };
    } catch (e) {
      file?.close();
      log("pst read error", e);
      // gültige Outlook-Datei, nur nicht lesbar: ehrlich sagen statt „beschädigt“
      return { error: this.isPst(fp.file.path)
        ? tr("{file} is an Outlook data file that halo.spaces can’t read yet (some newer files from Outlook cannot be opened).", { file: fp.file.leafName })
        : tr("{file} could not be read. It may be damaged or not an Outlook data file.", { file: fp.file.leafName }) };
    }
  },
};

// Outlook-Datendatei im Import-Assistenten von Thunderbird (about:import, wie
// „Import from Apple Mail“): Schritt 1 eigene Auswahl unter den Quellen,
// Schritt 2 Datei wählen, Ordnerbaum mit Anzahl und Häkchen je Ordner (dazu
// Kontakte und Kalender, wenn die Datei welche hat), Schritt 3 Ziel und
// „Start Import“ mit Fortschritt, Anhalten und Abschluss – Aufbau und Klassen
// wie Thunderbirds eigene Importe, damit das Design der übrigen Schritte gilt.
// Der Assistent kennt seine Steuerung nur als let/const im Fensterskript:
// import-bruecke.js holt sie per loadSubScript in dasselbe Fenster
PstImport.hookWizard = function (cw) {
  const doc = cw.document;
  const sources = doc.getElementById("start-sources");
  if (cw.__mcPstFlow || !sources || !doc.getElementById("main")) {
    return cw.__mcPstFlow;
  }
  try {
    Services.scriptloader.loadSubScript("resource://mailcards/about/import-bruecke.js", cw);
  } catch (e) {
    log("pst wizard bridge error", e);
    return null;
  }
  const B = cw.__haloImportBridge;
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const l10n = (e, id) => (e.setAttribute("data-l10n-id", id), e);
  // Schritt 1: Auswahl nach „Import from Apple Mail“, vor „Import from a file“
  const choice = el("label", "toggle-container-with-text");
  choice.id = "mcPstSource";
  const radio = el("input");
  radio.type = "radio";
  radio.name = "appSource";
  radio.value = "halo-pst";
  choice.append(radio, el("p", null, tr("Import from an Outlook data file (PST)")),
    el("p", "tip-caption", tr("Import messages, contacts, and calendars from an Outlook data file (PST).")));
  const list = sources.querySelector(".source-list");
  const fileChoice = list?.querySelector("input[value=file]")?.closest("label");
  fileChoice ? list.insertBefore(choice, fileChoice) : list?.append(choice);

  // eigener Bereich wie tabPane-app: Ordner (Schritt 2), Bestätigung (Schritt 3)
  const pane = el("div", "tabPane");
  pane.id = "tabPane-halopst";
  pane.hidden = true;
  const h1 = () => el("h1", null, tr("Import Outlook Data File"));
  const fileRow = () => {
    const dl = el("dl");
    const dd = el("dd", "mc-pst-file");
    dl.append(l10n(el("dt"), "addr-book-directories-pane-source"), dd);
    return [dl, dd];
  };
  const items = el("section");
  items.id = "halopst-items";
  const [itemsDl, itemsFile] = fileRow();
  const folderBox = el("div", "option-list indent mc-pst-folders");
  const partBox = el("div", "option-list indent mc-pst-parts");
  const invalid = el("p", "center");
  invalid.append(el("span", null, tr("Choose at least one folder or item to import.")));
  items.append(h1(), itemsDl, l10n(el("h2", "light-heading"), "items-pane-title2"), folderBox, partBox, invalid);
  const summary = el("section");
  summary.id = "halopst-summary";
  const [sumDl, sumFile] = fileRow();
  const dest = el("dd", "mc-pst-dest");
  sumDl.append(el("dt", null, tr("Destination:")), dest);
  const sumList = el("ul", "summary-items indent");
  const note = el("p", "description");
  const startBtn = l10n(el("button", "primary before-progress center-button"), "summary-pane-start");
  const progressPane = el("div", "progressPane");
  const progressSec = el("section", "progressPane-progress");
  const bar = el("progress", "progressPaneProgressBar");
  const desc = el("p", "progressPaneDesc tip-caption");
  progressSec.append(bar, desc);
  const stopBtn = el("button", "center-button btn-link mc-pst-stop", tr("Stop"));
  progressPane.append(progressSec, stopBtn);
  const report = el("p", "progressFinish center mc-pst-report");
  const finishBtn = l10n(el("button", "progressFinish primary center-button"), "button-finish");
  const againBtn = l10n(el("button", "progressFinish no-restart center-button btn-link"), "summary-pane-start-over");
  summary.append(h1(), sumDl, l10n(el("h2", "light-heading"), "summary-pane-title"), sumList, note, startBtn, progressPane,
    report, finishBtn, againBtn);
  const footer = el("footer", "buttons-container");
  const backBtn = l10n(el("button", "back"), "button-back");
  const nextBtn = l10n(el("button", "primary next-button continue"), "button-continue");
  footer.append(backBtn, nextBtn);
  pane.append(items, summary, footer);
  doc.getElementById("main").insertBefore(pane, doc.getElementById("importFooter"));

  const state = { file: null, source: null, fileName: "", running: false };
  const close = () => {
    try {
      state.file?.close?.();
    } catch {}
    state.file = null;
  };
  cw.addEventListener("unload", () => {
    PstImport.running && state.running && (PstImport.running.stop = true);
    close();
  });
  const notify = async text => {
    const box = B.notifications();
    box.removeAllNotifications();
    const n = await box.appendNotification("error", { label: text, priority: box.PRIORITY_CRITICAL_HIGH }, null);
    n.dismissable = false;
  };
  const show = id => {
    for (const s of pane.querySelectorAll(":scope > section")) {
      s.hidden = s.id != `halopst-${id}`;
    }
    pane.dataset.step = id;
  };
  const counts = () => PstImport.counts(state.source);
  const want = () => {
    const folders = [...folderBox.querySelectorAll("input:checked")].map(b => b.dataset.path);
    const part = k => !!partBox.querySelector(`input[data-part=${k}]`)?.checked;
    return { mail: folders.length > 0, folders, contacts: part("contacts"), calendar: part("calendar") };
  };
  const update = () => {
    const w = want();
    const any = w.mail || w.contacts || w.calendar;
    nextBtn.disabled = !any;
    invalid.hidden = any;
  };
  folderBox.addEventListener("change", update);
  partBox.addEventListener("change", update);
  const box = (label, n, data) => {
    const l = el("label", "toggle-container-with-text");
    const b = el("input");
    b.type = "checkbox";
    b.checked = true;
    Object.assign(b.dataset, data);
    const name = el("span", "mc-pst-name", label);
    l.append(b, name, el("span", "mc-pst-count", String(n)));
    return l;
  };
  const stepItems = () => ({ returnTo: () => showItems() });
  // Schritt 2: Ordnerbaum mit Anzahl, alle vorgewählt
  const showItems = (fresh = false) => {
    B.showTab("halopst");
    pane.classList.remove("progress", "complete", "final-step");
    backBtn.disabled = false;
    if (fresh) {
      itemsFile.textContent = sumFile.textContent = state.fileName;
      folderBox.replaceChildren(...state.source.mail.map(f => {
        const l = box(f.name, f.count, { path: f.path.join("\u0000") });
        l.style.marginInlineStart = `${f.depth * 20}px`;
        return l;
      }));
      folderBox.hidden = !state.source.mail.length;
      const c = counts();
      partBox.replaceChildren(...[["contacts", "Contacts"], ["calendar", "Calendar"]].filter(([k]) => c[k])
        .map(([k, label]) => box(tr(label), c[k], { part: k })));
      partBox.hidden = !partBox.children.length;
    }
    B.steps().updateSteps(stepItems(), 1);
    show("items");
    update();
  };
  // Schritt 3: Ziel, Übersicht, Start
  const showSummary = () => {
    const w = want();
    const target = PstImport.folderName(state.source.name);
    let local = "Local Folders";
    try {
      local = MailServices.accounts.localFoldersServer?.prettyName || local;
    } catch {}
    dest.textContent = `${local}/${target}`;
    const picked = state.source.mail.filter(f => w.folders.includes(f.path.join("\u0000")));
    const c = counts();
    sumList.replaceChildren(...[
      w.mail ? tr("{n} messages in {f} folders", { n: picked.reduce((a, f) => a + (f.count || 0), 0), f: picked.length }) : null,
      w.contacts ? tr("{n} contacts", { n: c.contacts }) : null,
      w.calendar ? tr("{n} events and tasks", { n: c.calendar }) : null].filter(Boolean).map(t => el("li", null, t)));
    note.textContent = [w.mail ? tr("The messages are copied to Local Folders under {target}. The Outlook data file stays unchanged.", { target }) : null,
      w.contacts || w.calendar ? tr("Contacts go to a new address book, events and tasks to a new calendar, both named {name}.", { name: state.source.name }) : null]
      .filter(Boolean).join(" ");
    report.textContent = "";
    pane.classList.remove("progress", "complete");
    pane.classList.add("final-step");
    startBtn.disabled = false;
    backBtn.disabled = false;
    B.steps().updateSteps({}, 0);
    show("summary");
  };
  const start = async () => {
    if (state.running || !state.source) {
      return;
    }
    const w = want();
    state.running = true;
    pane.classList.add("progress");
    backBtn.disabled = true;
    stopBtn.hidden = false;
    // Fortschritt über alle gewählten Teile (Mails je Nachricht, Kontakte und Kalender je Teil)
    const picked = state.source.mail.filter(f => w.folders.includes(f.path.join("\u0000")));
    const c = counts();
    const total = (w.mail ? picked.reduce((a, f) => a + (f.count || 0), 0) : 0) + (w.contacts ? c.contacts : 0) + (w.calendar ? c.calendar : 0);
    const done = new Map();
    const setBar = () => {
      const sum = [...done.values()].reduce((a, b) => a + b, 0);
      bar.value = total ? Math.min(1, sum / total) : 0;
    };
    bar.value = 0;
    desc.textContent = "";
    const status = text => {
      desc.textContent = text;
      if (text == tr("Importing {folder}…", { folder: tr("Contacts") })) {
        picked.forEach(f => done.set(f, f.count || 0));
      } else if (text == tr("Importing {folder}…", { folder: tr("Calendar") })) {
        picked.forEach(f => done.set(f, f.count || 0));
        w.contacts && done.set("contacts", c.contacts);
      }
      setBar();
    };
    const progress = (f, st) => {
      done.set(f, st.state == "busy" ? st.copied : f.count || 0);
      setBar();
    };
    let job = null;
    try {
      job = await PstImport.run(state.source, cw, status, progress, w);
    } catch (e) {
      log("pst import error", e);
    }
    state.running = false;
    if (cw.closed) {
      return;
    }
    bar.value = 1;
    stopBtn.hidden = true;
    const lines = [tr(job?.stop ? "Import stopped." : "Import finished.")];
    if (job && w.mail) {
      lines.push(tr("{n} messages imported in {f} folders.", { n: job.copied, f: job.folders }));
      job.skipped && lines.push(tr("{n} messages were already there.", { n: job.skipped }));
    }
    if (job && w.contacts && job.book) {
      lines.push(tr("{n} contacts added to the address book {name}.", { n: job.contacts.added, name: state.source.name }));
      job.contacts.skipped && lines.push(tr("{n} contacts were already there.", { n: job.contacts.skipped }));
      job.contacts.failed && job.failed.push(tr("Contacts"));
    }
    if (job && w.calendar && job.calendar) {
      lines.push(tr("{n} events and tasks added to the calendar {name}.", { n: job.events.added, name: state.source.name }));
      job.events.skipped && lines.push(tr("{n} events and tasks were already there.", { n: job.events.skipped }));
      job.events.failed && job.failed.push(tr("Calendar"));
    }
    if (!job || job.failed.length) {
      lines.push(tr("Not copied: {list}", { list: [...new Set(job?.failed || [state.source.name])].join(", ") }));
    }
    report.textContent = lines.join(" ");
    desc.textContent = tr(job?.stop ? "Import stopped." : "Import finished.");
    pane.dataset.result = job?.stop ? "stopped" : job && !job.failed.length ? "done" : "failed";
    pane.classList.add("complete");
    close();
  };
  // Datei übernehmen (aus der Dateiauswahl oder, im Test, erfundene Daten)
  const use = (source, fileName, file = null) => {
    close();
    state.source = source;
    state.file = file;
    state.fileName = fileName;
    delete pane.dataset.result;
    B.notifications().removeAllNotifications();
    showItems(true);
  };
  // „Continue“ in Schritt 1: bei der PST-Auswahl Thunderbirds eigenen Weg abfangen
  doc.getElementById("tabPane-start").addEventListener("click", async event => {
    const btn = event.target.closest?.("button.continue");
    if (!btn || !radio.checked || sources.hidden) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    B.notifications().removeAllNotifications();
    const got = await PstImport.pick(cw);
    if (!got) {
      return;
    }
    if (got.error) {
      notify(got.error);
      return;
    }
    use(got.source, PathUtils.filename(got.path), got.file);
  }, true);
  backBtn.addEventListener("click", () => {
    B.notifications().removeAllNotifications();
    B.steps().backTo();
  });
  nextBtn.addEventListener("click", () => pane.dataset.step == "items" && !nextBtn.disabled && showSummary());
  startBtn.addEventListener("click", () => start());
  stopBtn.addEventListener("click", () => PstImport.running && (PstImport.running.stop = true));
  finishBtn.addEventListener("click", () => cw.close());
  againBtn.addEventListener("click", () => B.restart());
  cw.__mcPstFlow = { use, pane, radio };
  return cw.__mcPstFlow;
};

// für den Test: Import-Assistenten öffnen und mit source gleich bei Schritt 2 beginnen
PstImport.openWizard = async function (mailWin, source) {
  mailWin.openTab("contentTab", { url: "about:import#start" });
  const tabmail = mailWin.document.getElementById("tabmail");
  for (let i = 0; i < 200; i++) {
    const cw = tabmail.tabInfo.map(t => t.browser?.contentWindow).find(c => c?.document?.documentURI?.startsWith("about:import")
      && c.document.readyState == "complete");
    const flow = cw && (cw.__mcPstFlow || PstImport.hookWizard(cw));
    if (flow) {
      if (source) {
        flow.use(source, `${source.name}.pst`);
      }
      return cw;
    }
    await new Promise(r => mailWin.setTimeout(r, 50));
  }
  return null;
};

// Konto lokal archivieren (z. B. vor Ablauf eines befristeten Kontos): alle
// Ordner samt Unterordnern als Kopie nach Lokale Ordner/<Konto> (Archive).
// Papierkorb, Spam, Entwürfe, Postausgang und virtuelle Ordner bleiben weg.
// Ein erneuter Lauf vergleicht je Ordner über die Message-ID und kopiert nur
// Neues (keine Duplikate). Kontakte (CardDAV) und Kalender des Kontos kommen
// in ein lokales Adressbuch bzw. einen lokalen Kalender „<Konto> (Archiv)“,
// ebenfalls nur Neues (Vergleich über die UID).
const ArchiveAccount = {
  running: null,
  SKIP: Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Junk | Ci.nsMsgFolderFlags.Drafts |
    Ci.nsMsgFolderFlags.Queue | Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Templates,
  canArchive(folder) {
    const server = folder?.isServer ? folder.server : null;
    return !!server && server.type != "none" && server.type != "nntp" && server.type != "rss";
  },
  targetName(server) {
    return tr("{name} (Archive)", { name: server.prettyName });
  },
  // Ordner sicher anlegen (Lokale Ordner legen sofort an; kurz warten, bis er da ist)
  async child(parent, name, win) {
    let f = parent.getChildNamed?.(name) || null;
    if (!f) {
      try {
        parent.createSubfolder(name, null);
      } catch {}
      for (let i = 0; i < 50 && !f; i++) {
        f = parent.getChildNamed?.(name) || null;
        if (!f) {
          await new Promise(r => win.setTimeout(r, 100));
        }
      }
    }
    return f;
  },
  // IMAP: Kopfzeilen des Ordners auf den Stand des Servers bringen (fertig,
  // wenn Thunderbird „FolderLoaded“ meldet)
  update(folder, win) {
    return new Promise(resolve => {
      if (folder.server.type != "imap") {
        resolve();
        return;
      }
      const listener = {
        onFolderEvent(f, event) {
          if (f == folder && event == "FolderLoaded") {
            done();
          }
        },
      };
      const done = () => {
        win.clearTimeout(t);
        MailServices.mailSession.RemoveFolderListener(listener);
        resolve();
      };
      const t = win.setTimeout(done, 60000);
      MailServices.mailSession.AddFolderListener(listener, Ci.nsIFolderListener.event);
      try {
        folder.updateFolder(null);
      } catch {
        done();
      }
    });
  },
  // Schlüssel einer Mail für den Vergleich Quelle/Archiv: Message-ID, ohne
  // sie Datum, Absender und Betreff
  msgKey(h) {
    const id = String(h?.messageId || "").trim().replace(/^<|>$/g, "");
    return id || `~${h?.date || ""}|${h?.author || ""}|${h?.subject || ""}`;
  },
  // nur, was im Archiv noch fehlt (auch doppelte in der Quelle nur einmal)
  newOnly(source, existing, key = x => x) {
    const seen = new Set([...existing].map(key));
    const fresh = [];
    for (const x of source) {
      const k = key(x);
      if (!seen.has(k)) {
        seen.add(k);
        fresh.push(x);
      }
    }
    return { fresh, known: source.length - fresh.length };
  },
  // Wer ist das Konto: E-Mail-Adressen (klein), Benutzername, Identitäten
  who(server) {
    const emails = new Set(), identities = new Set();
    try {
      const account = MailServices.accounts.findAccountForServer(server);
      for (const id of account?.identities || []) {
        identities.add(id.key);
        id.email && emails.add(id.email.toLowerCase());
      }
    } catch {}
    server.username && emails.add(String(server.username).toLowerCase());
    return { emails, identities };
  },
  // gehört ein Adressbuch zum Konto? (CardDAV mit dessen Adresse als Benutzername)
  isLinkedBook(book, who) {
    return !!book.carddav && !!book.username && who.emails.has(String(book.username).toLowerCase());
  },
  // gehört ein Kalender zum Konto? (Identität für Einladungen oder Benutzername)
  isLinkedCalendar(c, who) {
    return (!!c.identity && who.identities.has(c.identity)) || (!!c.username && who.emails.has(String(c.username).toLowerCase()));
  },
  books(server) {
    const who = this.who(server);
    try {
      return MailServices.ab.directories.filter(d => this.isLinkedBook({
        carddav: d.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE, username: d.getStringValue("carddav.username", ""),
      }, who));
    } catch {
      return [];
    }
  },
  calendars(server) {
    const who = this.who(server);
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      return cal.manager.getCalendars().filter(c => this.isLinkedCalendar({
        identity: c.getProperty("imip.identity.key"), username: c.getProperty("username"),
      }, who));
    } catch {
      return [];
    }
  },
  // Kontakte und Kalender des Kontos (für Übersicht und Lauf)
  extras(server) {
    return [
      ...this.books(server).map(d => ({ kind: "contacts", source: d, URI: `ab:${d.UID}`,
        name: tr("{name} (Contacts)", { name: d.dirName }), count: this.cards(d).length })),
      ...this.calendars(server).map(c => ({ kind: "calendar", source: c, URI: `cal:${c.id}`,
        name: tr("{name} (Calendar)", { name: c.name }), count: null })),
    ];
  },
  cards(dir) {
    try {
      return dir.childCards.filter(c => !c.isMailList);
    } catch {
      return [];
    }
  },
  async events(calendar) {
    try {
      return await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
    } catch {
      return [];
    }
  },
  // lokales Adressbuch „<Konto> (Archiv)“ (vorhandenes wiederverwenden)
  targetBook(server) {
    const name = this.targetName(server);
    const local = d => d.dirType == Ci.nsIAbManager.JS_DIRECTORY_TYPE && d.dirName == name;
    let book = MailServices.ab.directories.find(local);
    if (!book) {
      const id = MailServices.ab.newAddressBook(name, "", Ci.nsIAbManager.JS_DIRECTORY_TYPE);
      book = MailServices.ab.getDirectoryFromId(id) || MailServices.ab.directories.find(local);
    }
    return book || null;
  },
  // lokaler Kalender „<Konto> (Archiv)“ (vorhandenen wiederverwenden)
  targetCalendar(server) {
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    const name = this.targetName(server);
    let c = cal.manager.getCalendars().find(x => x.type == "storage" && x.name == name);
    if (!c) {
      c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://"));
      c.name = name;
      cal.manager.registerCalendar(c);
    }
    return c;
  },
  // Kontakte und Termine kopieren, nur Neues (Vergleich über die UID)
  async runExtras(server, job, progress) {
    const extras = this.extras(server);
    let book = null, calendar = null;
    for (const x of extras) {
      if (job.stop) {
        return;
      }
      progress(x, { state: "busy", copied: 0 });
      let total = 0, copied = 0, failed = false, archived = 0;
      try {
        if (x.kind == "contacts") {
          book ||= this.targetBook(server);
          const src = this.cards(x.source);
          total = src.length;
          const { fresh } = this.newOnly(src, this.cards(book), c => c.UID);
          for (const card of fresh) {
            book.addCard(card);
            copied++;
          }
          job.contacts += copied;
          archived = total - this.newOnly(src, this.cards(book), c => c.UID).fresh.length;
        } else {
          calendar ||= this.targetCalendar(server);
          const src = await this.events(x.source);
          total = src.length;
          const { fresh } = this.newOnly(src, await this.events(calendar), i => i.id);
          for (const item of fresh) {
            if (job.stop) {
              break;
            }
            await calendar.addItem(item.clone());
            copied++;
          }
          job.events += copied;
          archived = total - this.newOnly(src, await this.events(calendar), i => i.id).fresh.length;
        }
      } catch (e) {
        log("archive extras", e);
        job.failed.push(x.name);
        failed = true;
      }
      progress(x, { state: failed ? "failed" : job.stop ? "stopped" : "done", copied, total, archived });
    }
  },
  messages(folder) {
    try {
      return [...folder.msgDatabase.enumerateMessages()];
    } catch {
      try {
        return [...folder.messages];
      } catch {
        return [];
      }
    }
  },
  copy(src, hdrs, dest, win) {
    return new Promise(resolve => {
      MailServices.copy.copyMessages(src, hdrs, dest, false, {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
        onStartCopy() {}, onProgress() {}, setMessageKey() {}, getMessageId() {},
        onStopCopy: status => resolve(Components.isSuccessCode(status)),
        // ältere Schreibweise
        OnStartCopy() {}, OnProgress() {}, SetMessageKey() {}, GetMessageId() {},
        OnStopCopy: status => resolve(Components.isSuccessCode(status)),
      }, null, false);
    });
  },
  // zu archivierende Ordner (ohne Papierkorb, Spam, Entwürfe …) mit Pfad und Tiefe
  plan(server) {
    const out = [];
    const walk = (folder, depth, path) => {
      for (const sub of folder.subFolders) {
        if (sub.getFlag(this.SKIP) || sub.flags & this.SKIP) {
          continue;
        }
        const p = [...path, sub.name];
        out.push({ folder: sub, depth, path: p.join("/"), name: sub.prettyName || sub.localizedName || sub.name,
          count: sub.getTotalMessages(false), size: Number(sub.sizeOnDisk) || 0 });
        walk(sub, depth + 1, p);
      }
    };
    walk(server.rootFolder, 0, []);
    return out;
  },
  // freier Platz dort, wo Lokale Ordner liegen (null: unbekannt)
  freeSpace() {
    try {
      return MailServices.accounts.localFoldersServer.localPath.diskSpaceAvailable;
    } catch {
      return null;
    }
  },
  async run(server, win, status = () => {}, progress = () => {}) {
    if (this.running) {
      return null;
    }
    const job = { stop: false, folders: 0, copied: 0, skipped: 0, contacts: 0, events: 0, failed: [], done: [] };
    this.running = job;
    try {
      const local = MailServices.accounts.localFoldersServer.rootFolder;
      const target = await this.child(local, this.targetName(server), win);
      if (!target) {
        job.failed.push(this.targetName(server));
        return job;
      }
      const walk = async (src, destParent) => {
        for (const sub of src.subFolders) {
          if (job.stop) {
            return;
          }
          if (sub.getFlag(this.SKIP) || sub.flags & this.SKIP) {
            continue;
          }
          const dest = await this.child(destParent, sub.name, win);
          if (!dest) {
            job.failed.push(sub.prettyName);
            continue;
          }
          job.folders++;
          status(tr("Archiving {folder}…", { folder: sub.prettyName }));
          progress(sub, { state: "busy", copied: 0 });
          await this.update(sub, win);
          const hdrs = this.messages(sub);
          // nur Mails, deren Message-ID im Archivordner noch fehlt
          const { fresh, known } = this.newOnly(hdrs, this.messages(dest), h => this.msgKey(h));
          job.skipped += known;
          let mine = 0, failed = false;
          for (let i = 0; i < fresh.length && !job.stop; i += 100) {
            const part = fresh.slice(i, i + 100);
            if (await this.copy(sub, part, dest, win)) {
              job.copied += part.length;
              mine += part.length;
            } else {
              job.failed.push(sub.prettyName);
              failed = true;
              break;
            }
            status(tr("Archiving {folder}… {n} messages", { folder: sub.prettyName, n: job.copied }));
            progress(sub, { state: "busy", copied: known + mine, total: hdrs.length });
          }
          // Abschluss: wie viele Mails der Quelle jetzt im Archiv liegen
          const archived = hdrs.length - this.newOnly(hdrs, this.messages(dest), h => this.msgKey(h)).fresh.length;
          job.done.push({ folder: sub, dest, source: hdrs.length });
          progress(sub, { state: failed ? "failed" : job.stop ? "stopped" : "done", copied: mine, total: hdrs.length, archived });
          await walk(sub, dest);
        }
      };
      await walk(server.rootFolder, target);
      if (!job.stop) {
        await this.runExtras(server, job, progress);
      }
      job.target = target;
      return job;
    } finally {
      this.running = null;
    }
  },
};

// Assistent „Konto lokal archivieren“ (eigenes kleines Fenster wie „Postfach
// exportieren“ bei Apple Mail): Konto wählen, Übersicht (Ordner, Anzahl,
// geschätzte Größe, freier Platz), Start, Fortschritt je Ordner, Abbruch,
// Abschluss mit Vergleich Quelle/Archiv
ArchiveAccount.openWizard = function (mailWin, server) {
  const existing = Services.wm.getEnumerator(null);
  for (const x of existing) {
    if (x.location?.href.startsWith("resource://mailcards/about/archive.html")) {
      x.focus();
      return x;
    }
  }
  const hw = mailWin.openDialog("resource://mailcards/about/archive.html", "halo-archive",
    "chrome,dialog=yes,centerscreen,resizable=yes,width=460,height=480");
  // (wie beim Hilfe-Fenster: auf das geladene Dokument warten – ein „load“
  // am zurückgegebenen Fenster kommt nicht immer an)
  let tries = 0;
  const wait = () => {
    if (hw.closed || tries++ > 100) {
      return;
    }
    const doc = hw.document;
    if (doc?.documentURI?.startsWith("resource://mailcards/about/archive.html") && doc.readyState == "complete" && doc.body) {
      build(doc);
    } else {
      mailWin.setTimeout(wait, 30);
    }
  };
  mailWin.setTimeout(wait, 30);
  const build = doc => {
    doc.title = tr("Archive Account Locally");
    const el = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) {
        e.className = cls;
      }
      if (text != null) {
        e.textContent = text;
      }
      return e;
    };
    const servers = MailServices.accounts.accounts.map(a => a.incomingServer).filter(sv => sv && ArchiveAccount.canArchive(sv.rootFolder));
    let current = servers.includes(server) ? server : servers[0];
    const h1 = el("h1", null, tr("Archive Account Locally"));
    const pickAccount = el("select");
    for (const sv of servers) {
      const o = el("option", null, sv.prettyName);
      o.value = sv.key;
      pickAccount.append(o);
    }
    const summary = el("p", "summary");
    const list = el("div", "folders");
    const table = el("table");
    list.append(table);
    const note = el("p", "note", tr("The copy goes to Local Folders and stays when you remove the account. Trash, Spam and Drafts are left out."));
    const cancel = el("button", "capsule");
    const start = el("button", "capsule primary");
    cancel.append(el("span", "label", tr("Cancel")));
    start.append(el("span", "label", tr("Start")));
    const buttons = el("div", "buttons");
    buttons.append(cancel, start);
    doc.body.replaceChildren(h1, pickAccount, summary, list, note, buttons);
    const mb = n => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
    const rows = new Map();
    let phase = "overview";
    const show = () => {
      pickAccount.value = current?.key || "";
      rows.clear();
      const plan = current ? ArchiveAccount.plan(current) : [];
      table.replaceChildren(...plan.map(p => {
        const tr0 = el("tr");
        const name = el("td", "name", p.name);
        name.style.paddingInlineStart = `${12 + p.depth * 14}px`;
        const num = el("td", "num", String(p.count));
        tr0.append(name, num);
        rows.set(p.folder.URI, { tr: tr0, num, count: p.count });
        return tr0;
      }));
      // Kontakte und Kalender des Kontos als eigene Zeilen (Termine zählt der Kalender später)
      const extras = current ? ArchiveAccount.extras(current) : [];
      for (const x of extras) {
        const tr0 = el("tr");
        tr0.dataset.kind = x.kind;
        const num = el("td", "num", x.count == null ? "…" : String(x.count));
        tr0.append(el("td", "name", x.name), num);
        table.append(tr0);
        rows.set(x.URI, { tr: tr0, num, count: x.count });
        if (x.count == null) {
          ArchiveAccount.events(x.source).then(list => {
            if (num.textContent == "…") {
              num.textContent = String(list.length);
            }
          });
        }
      }
      note.textContent = tr("The copy goes to Local Folders and stays when you remove the account. Trash, Spam and Drafts are left out.") +
        (extras.length ? ` ${tr("Contacts and calendars of the account go to a local address book and calendar.")}` : "");
      const total = plan.reduce((a, p) => a + p.count, 0), size = plan.reduce((a, p) => a + p.size, 0);
      const free = ArchiveAccount.freeSpace();
      summary.textContent = [tr("{n} messages in {f} folders", { n: total, f: plan.length }),
        size ? tr("about {size}", { size: mb(size) }) : null,
        free != null ? tr("{size} free", { size: mb(free) }) : null].filter(Boolean).join(" · ");
      start.disabled = !plan.length && !extras.length;
    };
    pickAccount.addEventListener("change", () => {
      current = servers.find(sv => sv.key == pickAccount.value) || current;
      show();
    });
    const progress = (folder, st) => {
      const r = rows.get(folder.URI);
      if (!r) {
        return;
      }
      r.tr.dataset.state = st.state;
      if (st.state == "busy") {
        r.num.textContent = st.total ? `${st.copied} / ${st.total}` : "…";
        r.tr.scrollIntoView({ block: "nearest" });
      } else if (st.archived != null) {
        // Abschluss: Quelle und Archiv nebeneinander
        r.num.textContent = st.archived >= st.total ? `${st.total} ✓` : `${st.archived} / ${st.total}`;
        if (st.archived < st.total && st.state == "done") {
          r.tr.dataset.state = "failed";
        }
      }
    };
    cancel.addEventListener("click", () => {
      if (phase == "running") {
        ArchiveAccount.running && (ArchiveAccount.running.stop = true);
      } else {
        hw.close();
      }
    });
    start.addEventListener("click", async () => {
      if (phase == "finished") {
        hw.close();
        return;
      }
      if (phase != "overview" || !current) {
        return;
      }
      phase = "running";
      pickAccount.disabled = true;
      start.disabled = true;
      cancel.querySelector(".label").textContent = tr("Stop");
      const job = await ArchiveAccount.run(current, mailWin, text => (summary.textContent = text), progress);
      phase = "finished";
      if (hw.closed || !job) {
        return;
      }
      const lines = [tr(job.stop ? "Archiving stopped." : "Archiving finished."),
        tr("{n} messages copied in {f} folders.", { n: job.copied, f: job.folders })];
      if (job.contacts || job.events) {
        lines.push(tr("{n} contacts and {e} events copied.", { n: job.contacts, e: job.events }));
      }
      if (job.skipped) {
        lines.push(tr("{n} messages were already archived.", { n: job.skipped }));
      }
      if (job.failed.length) {
        lines.push(tr("Not copied: {list}", { list: [...new Set(job.failed)].join(", ") }));
      }
      summary.textContent = lines.join(" ");
      note.textContent = tr("The archive is in Local Folders under {target}. It stays when you remove the account.", { target: ArchiveAccount.targetName(current) });
      cancel.hidden = true;
      start.disabled = false;
      start.querySelector(".label").textContent = tr("Done");
    });
    hw.addEventListener("unload", () => {
      if (phase == "running" && ArchiveAccount.running) {
        ArchiveAccount.running.stop = true;
      }
    });
    show();
  };
  return hw;
};

// Kontextmenü eines Kontos in der Ordnerliste: „Archive Account Locally…“
function hookArchiveAccount(a3, restorers) {
  const doc = a3.document;
  const popup = doc.getElementById("folderPaneContext");
  const mailWin = a3.browsingContext?.topChromeWindow;
  if (!popup || !mailWin || doc.getElementById("mcArchiveAccount")) {
    return;
  }
  // für den automatischen Test: Kopieren ohne Assistent anstoßen bzw. ihn öffnen
  mailWin.__mcArchiveAccount = server => ArchiveAccount.run(server, mailWin);
  mailWin.__mcArchiveWizard = server => ArchiveAccount.openWizard(mailWin, server);
  const item = doc.createXULElement("menuitem");
  item.id = "mcArchiveAccount";
  const anchor = doc.getElementById("folderPaneContext-properties") || popup.lastElementChild;
  anchor.before(item);
  item.addEventListener("command", () => {
    if (ArchiveAccount.running) {
      ArchiveAccount.running.stop = true;
      return;
    }
    // (beim Öffnen des Menüs gemerkt – nach dem Schließen ist es nicht mehr gesetzt)
    const folder = item.__mcFolder || a3.folderPaneContextMenu?.activeFolder;
    if (!ArchiveAccount.canArchive(folder)) {
      return;
    }
    ArchiveAccount.openWizard(mailWin, folder.server);
  });
  const onShow = event => {
    if (event.target != popup) {
      return;
    }
    const folder = a3.folderPaneContextMenu?.activeFolder;
    item.__mcFolder = folder;
    item.hidden = !ArchiveAccount.canArchive(folder);
    item.setAttribute("label", ArchiveAccount.running ? tr("Stop Archiving") : tr("Archive Account Locally…"));
  };
  popup.addEventListener("popupshowing", onShow);
  restorers.push(() => {
    popup.removeEventListener("popupshowing", onShow);
    item.remove();
    delete mailWin.__mcArchiveAccount;
    delete mailWin.__mcArchiveWizard;
  });
}
