/* halo.spaces – Import und Archiv (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js an der alten Stelle in dieselbe Umgebung (gemeinsamer
 * globaler Bereich der Experiment-API): PstFs und PstImport (Outlook-Datendatei
 * lesen) sowie ArchiveAccount und hookArchiveAccount (Konto lokal archivieren)
 * stehen danach dort direkt zur Verfügung. Zur Ladezeit nur Namen nutzen, die
 * vorher schon da sind; Namen aus implementation.js (tr, log …) erst zur
 * Laufzeit. Reihe „Code: implementation.js in Module zerlegen“ 4/8.
 */
// Outlook-Datendatei (PST) lesen – Schritt 1: Ordnerbaum mit Anzahl der Mails
// anzeigen, noch ohne Import. Bibliothek pst-extractor (MIT), gebündelt in
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
  // Ordnerbaum: [{ name, count, depth }], Gesamtzahl der Mails. Grenzen für
  // Tiefe und Ordnerzahl; ein Ordner, dessen Unterordner nicht lesbar sind,
  // fehlt nur selbst (die Bibliothek scheitert an manchen neueren PSTs aus
  // Office 365 – vorher hing sie dabei endlos, siehe tools/pst-bundle/fix.py)
  read(path) {
    const lib = this.load();
    // scheitert die Bibliothek schon beim Öffnen, schließt sie die Datei nicht
    // (unter Windows blieb sie dann gesperrt) – alles, was ab hier geöffnet
    // wird, am Ende sicher schließen
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
    try {
      const folders = [];
      let total = 0, broken = 0;
      const MAX_DEPTH = 30, MAX_FOLDERS = 10000;
      const walk = (folder, depth) => {
        let subs = [];
        try {
          subs = folder.hasSubfolders ? folder.getSubFolders() : [];
        } catch (e) {
          broken++;
          log("pst folder error", String(e).slice(0, 160));
        }
        for (const sub of subs) {
          if (folders.length >= MAX_FOLDERS) {
            return;
          }
          const count = sub.contentCount || 0;
          total += count;
          folders.push({ name: sub.displayName || "?", count, depth });
          if (depth < MAX_DEPTH) {
            walk(sub, depth + 1);
          }
        }
      };
      walk(pst.getRootFolder(), 0);
      if (!folders.length && broken) {
        throw new Error("pst: folder tree unreadable");
      }
      // „Top of Personal Folders“ u. Ä. als eigene Ebene weglassen, wenn nur sie oben steht
      return { name: pst.getMessageStore?.()?.displayName || "", folders, total };
    } finally {
      try {
        pst.close();
      } catch {}
      closeAll();
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
    let info;
    try {
      info = this.read(fp.file.path);
    } catch (e) {
      log("pst read error", e);
      // gültige Outlook-Datei, nur nicht lesbar: ehrlich sagen statt „beschädigt“
      await Services.prompt.asyncAlert(bc, Services.prompt.MODAL_TYPE_WINDOW, title, this.isPst(fp.file.path)
        ? tr("{file} is an Outlook data file that halo.spaces can’t read yet (some newer files from Outlook cannot be opened).", { file: fp.file.leafName })
        : tr("{file} could not be read. It may be damaged or not an Outlook data file.", { file: fp.file.leafName }));
      return;
    }
    const lines = info.folders.slice(0, 40).map(f => `${"    ".repeat(f.depth)}${f.name}: ${f.count}`);
    if (info.folders.length > 40) {
      lines.push("…");
    }
    const head = tr("{file}: {n} messages in {f} folders.", { file: fp.file.leafName, n: info.total, f: info.folders.length });
    await Services.prompt.asyncAlert(bc, Services.prompt.MODAL_TYPE_WINDOW, title,
      `${head}\n\n${lines.join("\n")}\n\n${tr("Importing the messages comes in a later version.")}`);
  },
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
