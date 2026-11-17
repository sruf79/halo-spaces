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
  // was der Assistent und der Import brauchen: { name, mail: [{ name, count,
  // depth, path, items() }] } – items() liefert die Mails nacheinander
  source(pst, name) {
    const plan = this.plan(this.scan(pst));
    const wrap = list => list.map(f => ({ name: f.name, count: f.count, depth: f.depth, path: f.path,
      items: () => this.items(f.node.ref, m => this.mailOf(m, name)) }));
    return { name, mail: wrap(plan.mail) };
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
  // Mails aus source (siehe source()) als Kopie importieren; ein zweiter Lauf
  // überspringt Mails, deren Message-ID im Zielordner schon steht
  async run(source, win, status = () => {}, progress = () => {}) {
    if (this.running) {
      return null;
    }
    const job = { stop: false, folders: 0, copied: 0, skipped: 0, failedMessages: 0, failed: [], done: [] };
    this.running = job;
    try {
      const local = MailServices.accounts.localFoldersServer.rootFolder;
      const target = await ArchiveAccount.child(local, this.folderName(source.name), win);
      if (!target) {
        job.failed.push(source.name);
        return job;
      }
      job.target = target;
      const dests = new Map();
      for (const f of source.mail || []) {
        if (job.stop) {
          break;
        }
        const parent = f.path.length > 1 ? dests.get(f.path.slice(0, -1).join("\u0000")) : target;
        const dest = parent && await ArchiveAccount.child(parent, this.folderName(f.name), win);
        if (!dest) {
          job.failed.push(f.name);
          progress(f, { state: "failed", copied: 0, total: f.count });
          continue;
        }
        dests.set(f.path.join("\u0000"), dest);
        job.folders++;
        const have = new Set(ArchiveAccount.messages(dest).map(h => h.messageId));
        let mine = 0, failed = 0;
        status(tr("Importing {folder}…", { folder: f.name }));
        progress(f, { state: "busy", copied: 0, total: f.count });
        for (const d of typeof f.items == "function" ? f.items() : f.items || []) {
          if (job.stop) {
            break;
          }
          const id = this.bare(d?.messageId);
          if (!d || d.error) {
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
      return job;
    } finally {
      this.running = null;
    }
  },

  async open(win) {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(win.browsingContext, tr("Open Outlook Data File"), Ci.nsIFilePicker.modeOpen);
    fp.appendFilter(tr("Outlook Data File (PST)"), "*.pst");
    fp.appendFilters(Ci.nsIFilePicker.filterAll);
    const result = await new Promise(resolve => fp.open(resolve));
    if (result != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    const bc = win.browsingContext;
    const title = tr("Outlook Data File (PST)");
    let file, source;
    try {
      file = this.openFile(fp.file.path);
      source = this.source(file.pst, fp.file.leafName.replace(/\.(pst|ost)$/i, ""));
    } catch (e) {
      file?.close();
      log("pst read error", e);
      // gültige Outlook-Datei, nur nicht lesbar: ehrlich sagen statt „beschädigt“
      await Services.prompt.asyncAlert(bc, Services.prompt.MODAL_TYPE_WINDOW, title, this.isPst(fp.file.path)
        ? tr("{file} is an Outlook data file that halo.spaces can’t read yet (some newer files from Outlook cannot be opened).", { file: fp.file.leafName })
        : tr("{file} could not be read. It may be damaged or not an Outlook data file.", { file: fp.file.leafName }));
      return;
    }
    this.openWizard(win, source, () => file.close());
  },
};

// Assistent „Outlook-Datendatei importieren“ (eigenes kleines Fenster wie
// „Konto lokal archivieren“ und „Postfächer importieren“ bei Apple Mail):
// Übersicht (Ordner mit Anzahl), Import, Fortschritt je Ordner, Abbruch,
// Abschluss mit Anzahl je Ordner. done() schließt die Datei wieder
PstImport.openWizard = function (mailWin, source, done = () => {}) {
  const hw = mailWin.openDialog("resource://mailcards/about/pst.html", "_blank",
    "chrome,dialog=yes,centerscreen,resizable=yes,width=460,height=480");
  let tries = 0, closed = false;
  const finish = () => {
    if (!closed) {
      closed = true;
      done();
    }
  };
  const wait = () => {
    if (hw.closed || tries++ > 100) {
      finish();
      return;
    }
    const doc = hw.document;
    if (doc?.documentURI?.startsWith("resource://mailcards/about/pst.html") && doc.readyState == "complete" && doc.body) {
      build(doc);
    } else {
      mailWin.setTimeout(wait, 30);
    }
  };
  mailWin.setTimeout(wait, 30);
  const build = doc => {
    doc.title = tr("Import Outlook Data File");
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
    const h1 = el("h1", null, tr("Import “{name}”", { name: source.name }));
    const summary = el("p", "summary");
    const list = el("div", "folders");
    const table = el("table");
    list.append(table);
    const target = PstImport.folderName(source.name);
    const note = el("p", "note", tr("The messages are copied to Local Folders under {target}. The Outlook data file stays unchanged.", { target }));
    const cancel = el("button", "capsule");
    const start = el("button", "capsule primary");
    cancel.append(el("span", "label", tr("Cancel")));
    start.append(el("span", "label", tr("Import")));
    const buttons = el("div", "buttons");
    buttons.append(cancel, start);
    doc.body.replaceChildren(h1, summary, list, note, buttons);
    const rows = new Map();
    table.replaceChildren(...source.mail.map(f => {
      const tr0 = el("tr");
      const name = el("td", "name", f.name);
      name.style.paddingInlineStart = `${12 + f.depth * 14}px`;
      const num = el("td", "num", String(f.count));
      tr0.append(name, num);
      rows.set(f, { tr: tr0, num });
      return tr0;
    }));
    const total = source.mail.reduce((a, f) => a + f.count, 0);
    summary.textContent = tr("{n} messages in {f} folders", { n: total, f: source.mail.length });
    start.disabled = !total;
    let phase = "overview";
    const progress = (f, st) => {
      const r = rows.get(f);
      if (!r) {
        return;
      }
      r.tr.dataset.state = st.state;
      if (st.state == "busy") {
        r.num.textContent = st.total ? `${st.copied} / ${st.total}` : "…";
        r.tr.scrollIntoView({ block: "nearest" });
      } else if (st.imported != null) {
        // Abschluss: Anzahl in der Datei und im Zielordner
        r.num.textContent = st.imported >= st.total ? `${st.total} ✓` : `${st.imported} / ${st.total}`;
        if (st.imported < st.total && st.state == "done") {
          r.tr.dataset.state = "failed";
        }
      }
    };
    cancel.addEventListener("click", () => {
      if (phase == "running") {
        PstImport.running && (PstImport.running.stop = true);
      } else {
        hw.close();
      }
    });
    start.addEventListener("click", async () => {
      if (phase == "finished") {
        hw.close();
        return;
      }
      if (phase != "overview") {
        return;
      }
      phase = "running";
      start.disabled = true;
      cancel.querySelector(".label").textContent = tr("Stop");
      const job = await PstImport.run(source, mailWin, text => (summary.textContent = text), progress);
      phase = "finished";
      finish();
      if (hw.closed || !job) {
        return;
      }
      const lines = [tr(job.stop ? "Import stopped." : "Import finished."),
        tr("{n} messages imported in {f} folders.", { n: job.copied, f: job.folders })];
      if (job.skipped) {
        lines.push(tr("{n} messages were already there.", { n: job.skipped }));
      }
      if (job.failed.length) {
        lines.push(tr("Not copied: {list}", { list: [...new Set(job.failed)].join(", ") }));
      }
      summary.textContent = lines.join(" ");
      cancel.hidden = true;
      start.disabled = false;
      start.querySelector(".label").textContent = tr("Done");
    });
    hw.addEventListener("unload", () => {
      if (phase == "running" && PstImport.running) {
        PstImport.running.stop = true;
      } else {
        finish();
      }
    });
  };
  return hw;
};

// Konto lokal archivieren (z. B. vor Ablauf eines befristeten Kontos): alle
// Ordner samt Unterordnern als Kopie nach Lokale Ordner/<Konto> (Archive).
// Papierkorb, Spam, Entwürfe, Postausgang und virtuelle Ordner bleiben weg.
// Ein erneuter Lauf überspringt Ordner, die schon gleich viele Mails haben.
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
  messages(folder) {
    try {
      return [...folder.msgDatabase.enumerateMessages()];
    } catch {
      return [...folder.messages];
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
    const job = { stop: false, folders: 0, copied: 0, skipped: 0, failed: [], done: [] };
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
          let mine = 0, failed = false;
          if (hdrs.length && dest.getTotalMessages(false) >= hdrs.length) {
            job.skipped += hdrs.length;
          } else {
            for (let i = 0; i < hdrs.length && !job.stop; i += 100) {
              const part = hdrs.slice(i, i + 100);
              if (await this.copy(sub, part, dest, win)) {
                job.copied += part.length;
                mine += part.length;
              } else {
                job.failed.push(sub.prettyName);
                failed = true;
                break;
              }
              status(tr("Archiving {folder}… {n} messages", { folder: sub.prettyName, n: job.copied }));
              progress(sub, { state: "busy", copied: mine, total: hdrs.length });
            }
          }
          job.done.push({ folder: sub, dest, source: hdrs.length });
          progress(sub, { state: failed ? "failed" : job.stop ? "stopped" : "done", copied: mine, total: hdrs.length, archived: dest.getTotalMessages(false) });
          await walk(sub, dest);
        }
      };
      await walk(server.rootFolder, target);
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
      const total = plan.reduce((a, p) => a + p.count, 0), size = plan.reduce((a, p) => a + p.size, 0);
      const free = ArchiveAccount.freeSpace();
      summary.textContent = [tr("{n} messages in {f} folders", { n: total, f: plan.length }),
        size ? tr("about {size}", { size: mb(size) }) : null,
        free != null ? tr("{size} free", { size: mb(free) }) : null].filter(Boolean).join(" · ");
      start.disabled = !plan.length;
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
