/* halo.spaces – Kalender-Hilfen (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js an der alten Stelle in dieselbe Umgebung (gemeinsamer
 * globaler Bereich der Experiment-API): Mehrwochen-Ansicht (hookMultiweekScroll,
 * hookMultiweekBuffer), Termin-Dialog (appleEventLayout, Zeit- und Datumsfelder),
 * Kalender-Emoji (emojiFor) und Schnellfenster-Erkennung (parseNatural) stehen
 * danach dort direkt zur Verfügung. Zur Ladezeit nur Namen nutzen, die vorher
 * schon da sind; Namen aus implementation.js (tr, log …) erst zur Laufzeit.
 * Reihe „Code: implementation.js in Module zerlegen“ 5/8.
 */

// Mehrwochen-Ansicht stufenlos scrollen wie Apple Kalender – Reihe in
// fünf Schritten (2/6 bis 6/6), bis zum letzten nur mit
// extensions.mailcards.multiweekScroll (Standard aus). Schritt 2: unsichtbarer
// Unterbau. Die Ansicht lädt Puffer-Wochen vor und nach dem sichtbaren Teil
// mit (Termine darin sind schon geladen), die Zeilen dazu liegen außerhalb.
// Sichtbar bleibt alles wie bisher: Wochenzahl (calendar.weeks.inview),
// Überschrift, Pfeile, „Heute“ und Zoom richten sich nach dem sichtbaren Teil
const MULTIWEEK_SCROLL_PREF = "extensions.mailcards.multiweekScroll";
// Schritt 5/6: Schwung nach einem Wischer am Trackpad (Standard aus, nur
// zusammen mit multiweekScroll): die Ansicht läuft mit der zuletzt gemessenen
// Geschwindigkeit aus und kommt genau auf einer Wochengrenze zur Ruhe
const MULTIWEEK_MOMENTUM_PREF = "extensions.mailcards.multiweekMomentum";
// Abklingzeit des Schwungs in ms (zurückgelegt wird etwa Geschwindigkeit * Zeit)
const MULTIWEEK_MOMENTUM_MS = 325;
// je Seite zwölf Wochen Vorrat (erst zwei, dann sechs): beim Scrollen wird
// erst neu aufgebaut, wenn er fast aufgebraucht ist, nach dem Einrasten nur,
// wenn über die Hälfte verbraucht ist – und dann im Leerlauf (Rückmeldung
// 6.11.2026: zu oft nachgeladen, das störte das Scrollen). Mehr Vorrat macht
// jeden Neuaufbau teurer (rund 30 ms bei zwölf Wochen, daher Standbild und
// Neuaufbau in zwei Bildern)
const MULTIWEEK_BUFFER_WEEKS = 12;
// Nacharbeit (9.11.2026, „nach einiger Zeit ruckelt es“): Thunderbird holt bei
// jedem Neuaufbau alle Termine der geladenen Wochen neu und trug sie in einem
// Stück ein – mit vielen Terminen ein langer Halt mitten im Scrollen, und die
// Suche nach dem Tag lief je Termin und Tag über alle Tageszellen. Jetzt: Tag
// über eine Tabelle, Termine der sichtbaren Wochen (eine Woche Rand) sofort,
// die übrigen in Häppchen von höchstens MULTIWEEK_SLICE_MS je Bild, die
// nächstgelegenen zuerst. Unter MULTIWEEK_DEFER_MIN Terminen alles auf einmal
const MULTIWEEK_DEFER_MIN = 60;
const MULTIWEEK_SLICE_MS = 4;
// Schritt 4/6: Monat als Zahl (Jahr * 12 + Monat) und sein Name wie in der
// Überschrift von Apple Kalender („December 2026“)
const monthKey = (year, month) => year * 12 + month;
function monthTitle(key) {
  try {
    const locale = Services.locale.appLocalesAsBCP47[0];
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
      .format(new Date(Math.floor(key / 12), key % 12, 1));
  } catch {
    return "";
  }
}
// Schritt 3/6: pixelgenau scrollen wie Apple Kalender (Mausrad und Trackpad
// gleich), nach dem Scrollen weich auf die nächstgelegene ganze Woche
// einrasten. Schwung erst in 5/6. Nacharbeit nach Rückmeldung (5.11.2026,
// 120-Hz-Display: langsam, Termine kamen zu spät, Flackern beim Einrasten):
// - Bewegungen gesammelt und einmal je Bild angewandt, nur als transform am
//   Raster (vorher zwei CSS-Variablen an der ganzen Ansicht je Ereignis →
//   Neuberechnung aller Tageszellen) und mit gemerkter Wochenhöhe
// - neu aufgebaut (Thunderbird zeichnet dabei alle Tage neu und holt die
//   Termine) nur in Ruhe nach dem Einrasten oder kurz vor dem Ende des
//   Vorrats – und dann hinter einem Standbild der Ansicht, bis die Termine
//   wieder stehen
// - Termine um die Ansicht beim Öffnen vorab abgefragt (wärmt die Kalender)
// Zweite Nacharbeit (6.11.2026, „zu oft nachgeladen“): Einrasten baut nicht
// mehr neu auf, es setzt nur den sichtbaren Bereich (Überschrift, Pfeile,
// gewählter Tag) auf die eingerastete Woche; neu aufgebaut wird erst, wenn
// über die Hälfte des Vorrats verbraucht ist, im Leerlauf. Termine werden
// schon kurz nach dem Start von Thunderbird für ein halbes Jahr vorab abgefragt
function hookMultiweekScroll(mv, win, on, B, orig) {
  const LINE = 18; // eine Mausrad-Raste: etwa eine Textzeile
  // pos: Verschiebung gegen den geladenen Bereich; moved: alles, was seit
  // dem Öffnen um ganze Wochen weitergerückt wurde (für das Standbild)
  let pos = 0, moved = 0, idle = 0, anim = 0, frame = 0, rowCache = 0, shownAt = 0, mask = null;
  // vis: um so viele Wochen ist der sichtbare Bereich gegen den geladenen
  // (Mitte) schon weitergerückt, ohne Neuaufbau; later: Neuaufbau im Leerlauf
  let vis = 0, later = 0, shifting = false, pending = 0;
  // Schritt 4/6: oberste sichtbare Woche (gegen den geladenen Bereich), ihr
  // Monat, erster geladener Tag und die Tage des Rasters
  let topRow = NaN, topKey = -1, rowBase = null, boxes = [];
  // Zahl der Neuaufbauten durch das Scrollen (für die Prüfung)
  mv.__mcScrollShifts = 0;
  // Höhe einer Woche aus dem Platz, den die Ansicht hat (nicht aus ihrem
  // Inhalt – das Raster ist mit den Puffer-Wochen höher als sichtbar);
  // gemessen bei Größenänderung, nicht bei jeder Bewegung
  const measure = () => {
    const headH = mv.querySelector("calendar-day-label")?.getBoundingClientRect().height || 0;
    const weeks = mv.weeksInView || 4;
    rowCache = Math.max(20, (mv.clientHeight - headH) / weeks);
    mv.style.setProperty("--mc-mw-row", `${rowCache.toFixed(2)}px`);
    return rowCache;
  };
  const rowH = () => rowCache || measure();
  const active = () => on() && !!mv.__mcVisible && mv.isVisible?.();
  const table = () => mv.querySelector(".monthtable");
  // Monat oben (Schritt 4/6): der Monat des letzten Tags der obersten
  // sichtbaren Woche – die Woche mit dem 1. trägt den Monatsnamen über sich
  // und löst den vorigen Monat ab, sobald sie oben ankommt. Überschrift und
  // Ausgrauen der Tage anderer Monate folgen (nur bei einem Wechsel)
  const track = () => {
    if (!rowBase) {
      return;
    }
    const r = B + Math.floor(pos / rowH() + 1e-3);
    if (r == topRow) {
      return;
    }
    topRow = r;
    const d = new Date(rowBase.getFullYear(), rowBase.getMonth(), rowBase.getDate() + 7 * r + 6);
    const key = monthKey(d.getFullYear(), d.getMonth());
    if (key == topKey) {
      return;
    }
    topKey = key;
    mv.__mcTopMonth = key;
    for (const box of boxes) {
      box.toggleAttribute("mc-other", box.__mcKey >= 0 && box.__mcKey != key);
    }
    if (mv.isVisible?.()) {
      const el = mv.ownerDocument.getElementById("intervalDescription");
      if (el) {
        el.textContent = monthTitle(key);
      }
    }
  };
  // Monatsnamen im Band (Schritt 4/6): vor jeder Woche mit einem
  // Monatsersten, ab der Spalte des 1.; sie liegen im Raster und wandern mit
  // ihm, ohne Arbeit je Bild. Nach jedem Aufbau neu, Einstellung aus: weg
  const months = () => {
    const t = table();
    topRow = NaN;
    topKey = -1;
    rowBase = null;
    delete mv.__mcTopMonth;
    if (!t) {
      return;
    }
    for (const el of t.querySelectorAll(".mc-mw-monthlabel")) {
      el.remove();
    }
    const use = active() && !!mv.mStartDate;
    boxes = [...t.querySelectorAll("calendar-month-day-box")];
    for (const box of boxes) {
      const row = box.closest("tr");
      const d = use && row && !row.hasAttribute("hidden") ? box.date : null;
      box.__mcKey = d ? monthKey(d.year, d.month) : NaN;
      if (!use) {
        box.removeAttribute("mc-other");
      } else if (d?.day == 1) {
        const cells = [...row.cells].filter(c => !c.hidden && !c.firstElementChild?.hidden);
        const label = mv.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "div");
        label.className = "mc-mw-monthlabel";
        label.textContent = monthTitle(box.__mcKey);
        label.style.gridRow = box.style.gridRow;
        label.style.gridColumnStart = Math.max(1, cells.indexOf(box.parentNode) + 1);
        t.append(label);
      }
    }
    if (use) {
      const s = mv.mStartDate;
      rowBase = new Date(s.year, s.month, s.day);
    } else {
      boxes = [];
    }
  };
  const paint = () => {
    frame = 0;
    const t = table();
    if (!t) {
      return;
    }
    if (!mv.hasAttribute("mc-mw-scroll")) {
      t.style.removeProperty("transform");
      for (const label of t.querySelectorAll("calendar-day-label")) {
        label.style.removeProperty("transform");
      }
      return;
    }
    const y = -B * rowH() - pos;
    t.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    // das Standbild wandert mit, solange es liegt (Weiterrücken mitten im Scrollen)
    if (mask) {
      mask.style.transform = `translate3d(0, ${(mask.__mcAt - (moved + pos)).toFixed(2)}px, 0)`;
    }
    // Kopfzeile (Wochentage) steht still
    for (const label of t.querySelectorAll("calendar-day-label")) {
      label.style.transform = `translate3d(0, ${(-y).toFixed(2)}px, 0)`;
    }
    track();
  };
  const apply = () => {
    const was = mv.hasAttribute("mc-mw-scroll");
    mv.toggleAttribute("mc-mw-scroll", active());
    if (!was || !rowCache) {
      measure();
    }
    paint();
  };
  const schedule = () => {
    frame ||= win.requestAnimationFrame(paint);
  };
  // Standbild über der Ansicht, solange Thunderbird neu aufbaut (die Tage
  // leeren sich dabei und füllen sich mit den neu abgefragten Terminen)
  const cover = () => {
    if (mask || typeof win.CanvasRenderingContext2D?.prototype.drawWindow != "function") {
      return;
    }
    try {
      // nur die Wochen unter der stehenden Kopfzeile
      const v = mv.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
      const head = mv.querySelector("calendar-day-label")?.getBoundingClientRect().bottom ?? v.top;
      const r = { left: v.left, top: head, width: v.width, height: v.bottom - head };
      const c = mv.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      c.width = Math.ceil(r.width * dpr);
      c.height = Math.ceil(r.height * dpr);
      c.className = "mc-mw-mask";
      c.style.top = `${head - v.top}px`;
      c.style.height = `${r.height}px`;
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.drawWindow(win, r.left, r.top, r.width, r.height, win.getComputedStyle(mv).backgroundColor || "rgb(255,255,255)");
      c.__mcAt = moved + pos;
      mv.append(c);
      mask = c;
    } catch (e) {
      log("multiweek mask error", String(e).slice(0, 120));
    }
  };
  // weg, sobald die Termine wieder stehen (Zahl drei Bilder lang gleich), höchstens 600 ms
  const uncover = () => {
    if (!mask) {
      return;
    }
    const t0 = win.performance.now();
    let last = -1, same = 0;
    const check = () => {
      // nur die Wochen ohne Puffer: dort trägt Thunderbird sofort ein, in
      // die Puffer-Wochen kommen die Termine danach in Häppchen
      const n = mv.querySelectorAll("tr:not([mc-buffer]) calendar-month-day-box-item").length;
      same = n == last ? same + 1 : 0;
      last = n;
      if (same >= 3 || win.performance.now() - t0 > 600) {
        mask?.remove();
        mask = null;
        return;
      }
      win.requestAnimationFrame(check);
    };
    win.requestAnimationFrame(check);
  };
  // sichtbaren Bereich ohne Neuaufbau auf die Woche k (gegen die Mitte des
  // geladenen) setzen: Überschrift, Pfeile und gewählter Tag folgen
  const show = k => {
    const base = mv.__mcVisible;
    if (k == vis || !base) {
      return;
    }
    try {
      const s = base[0].clone(), e = base[1].clone();
      s.day += 7 * k;
      e.day += 7 * k;
      mv.rangeStartDate = s;
      mv.rangeEndDate = e;
      if (mv.isVisible()) {
        (win.wrappedJSObject || win).calendarNavigationBar?.setDateRange(s, e);
      }
      const sel = mv.selectedDay;
      if (sel) {
        sel.day += 7 * (k - vis);
        mv.selectedDay = sel;
      }
    } catch (e) {
      log("multiweek show error", String(e).slice(0, 120));
    }
    vis = k;
  };
  // um ganze Wochen gegen die Mitte des geladenen Bereichs weiterrücken
  // (Thunderbird baut den Bereich neu); wie moveView, aber vom geladenen
  // statt vom schon weitergerückten sichtbaren Bereich aus
  const shift = weeks => {
    const base = mv.__mcVisible;
    if (later) {
      (win.cancelIdleCallback || win.clearTimeout).call(win, later);
      later = 0;
    }
    shifting = true;
    try {
      cover();
      const date = base[0].clone();
      date.day += 7 * (weeks + Services.prefs.getIntPref("calendar.previousweeks.inview", 0));
      // gewählter Tag rückt mit wie bei moveView (soweit noch nicht über show)
      const sel = mv.selectedDay;
      sel && (sel.day += 7 * (weeks - vis));
      vis = 0;
      mv.__mcScrollShifts++;
      mv.goToDay(date);
      if (sel) {
        mv.selectedDay = sel;
      }
    } catch (e) {
      log("multiweek scroll error", String(e).slice(0, 120));
    }
    shifting = false;
    uncover();
  };
  // ganze Wochen der Verschiebung in den Bereich übernehmen
  const settle = () => {
    const h = rowH();
    const weeks = Math.trunc(pos / h);
    if (weeks) {
      pos -= weeks * h;
      moved += weeks * h;
      shift(weeks);
    }
    paint();
  };
  // Neuaufbau im Leerlauf, sobald über die Hälfte des Vorrats verbraucht ist
  const refill = () => {
    if (later || Math.abs(pos) <= (B / 2) * rowH()) {
      return;
    }
    const run = () => {
      later = 0;
      if (!anim && active()) {
        settle();
      }
    };
    later = win.requestIdleCallback ? win.requestIdleCallback(run, { timeout: 1500 }) : win.setTimeout(run, 300);
  };
  // einrasten: weich zur nächstgelegenen Woche (mehr als halb im Bild → dorthin),
  // dann nur den sichtbaren Bereich nachziehen – ohne Neuaufbau
  const snap = () => {
    const h = rowH();
    // Schwung: Geschwindigkeit der letzten Pixel-Bewegungen (Trackpad) trägt
    // die Ansicht weiter, das Ziel ist die nächste Wochengrenze davon
    // (höchstens bis kurz vor das Ende des Vorrats)
    const v = glideSpeed();
    samples = [];
    let target = Math.round(pos / h) * h;
    let dur = 180;
    let curve = cubicBezier(0.25, 0.1, 0.25, 1);
    if (v) {
      const limit = (B - 1) * h;
      target = Math.max(-limit, Math.min(limit, Math.round((pos + v * MULTIWEEK_MOMENTUM_MS) / h) * h));
      if (target != pos) {
        // auslaufend (kubisch): Anfangsgeschwindigkeit 3 * Weg / Dauer
        dur = Math.max(300, Math.min(1800, (3 * Math.abs(target - pos)) / Math.abs(v)));
        curve = k => 1 - Math.pow(1 - k, 3);
      }
    }
    const start = pos, t0 = win.performance.now(), ms = motionMs(dur);
    const step = now => {
      const k = ms ? Math.min(1, (now - t0) / ms) : 1;
      pos = start + (target - start) * curve(k);
      if (k < 1) {
        paint();
        anim = win.requestAnimationFrame(step);
        return;
      }
      anim = 0;
      pos = target;
      show(Math.round(pos / h));
      paint();
      refill();
    };
    anim = win.requestAnimationFrame(step);
  };
  // Geschwindigkeit (px/ms) aus den Bewegungen der letzten 100 ms vor dem
  // Ende; 0, wenn der Schwung aus ist, zu langsam oder von einem Mausrad kommt
  let samples = [];
  const glideSpeed = () => {
    if (!Services.prefs.getBoolPref(MULTIWEEK_MOMENTUM_PREF, false) || samples.length < 3) {
      return 0;
    }
    const last = samples[samples.length - 1].t;
    const recent = samples.filter(x => last - x.t <= 100);
    const span = Math.max(16, last - recent[0].t);
    const v = recent.reduce((a, x) => a + x.dy, 0) / span;
    return Math.abs(v) >= 0.4 ? v : 0;
  };
  const onWheel = event => {
    if (!active() || event.ctrlKey || event.altKey || event.metaKey || !event.deltaY) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (anim) {
      win.cancelAnimationFrame(anim);
      anim = 0;
    }
    if (later) {
      (win.cancelIdleCallback || win.clearTimeout).call(win, later);
      later = 0;
    }
    const h = rowH();
    // Richtung für die Reihenfolge, in der Termine der Puffer-Wochen kommen
    mv.__mcDir = Math.sign(event.deltaY);
    // nur Pixel-Bewegungen (Trackpad) tragen Schwung, ein Mausrad nicht
    samples = event.deltaMode === 0 ? [...samples.slice(-12), { t: event.timeStamp, dy: event.deltaY }] : [];
    pos += event.deltaMode == event.DOM_DELTA_LINE ? event.deltaY * LINE
      : event.deltaMode == event.DOM_DELTA_PAGE ? event.deltaY * h : event.deltaY;
    // Vorrat fast aufgebraucht (eine Woche Rest): jetzt schon weiterrücken –
    // Standbild in diesem Bild, Neuaufbau im nächsten (beides in einem Bild
    // ließ es länger als zwei Bildwechsel stehen)
    if (Math.abs(pos) > (B - 1) * h && !pending) {
      cover();
      pending = win.requestAnimationFrame(() => {
        pending = 0;
        settle();
      });
    }
    schedule();
    win.clearTimeout(idle);
    // mit Schwung früher einrasten bzw. loslaufen (die Wartezeit wäre sonst
    // eine Pause zwischen Wischer und Auslaufen)
    idle = win.setTimeout(snap, glideSpeed() ? 70 : 160);
  };
  // Termine um die Ansicht vorab abfragen (beim Start von Thunderbird und
  // beim Einblenden, höchstens alle 10 Minuten): ±26 Wochen um den geladenen
  // Bereich bzw. um heute
  const warm = (force = false) => {
    if (!force && !active() || win.performance.now() - shownAt < 600000 && shownAt) {
      return;
    }
    shownAt = win.performance.now();
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const s = mv.startDate?.clone() || cal.dtz.now(), e = mv.endDate?.clone() || cal.dtz.now();
      s.day -= 7 * 26;
      e.day += 7 * 26;
      cal.view.getCompositeCalendar(win)
        .getItemsAsArray(Ci.calICalendar.ITEM_FILTER_TYPE_EVENT | Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES, 0, s, e)
        .catch(err => log("multiweek warm error", String(err).slice(0, 120)));
    } catch (err) {
      log("multiweek warm error", String(err).slice(0, 120));
    }
  };
  mv.addEventListener("wheel", onWheel, { capture: true, passive: false });
  const ro = new win.ResizeObserver(() => {
    if (active()) {
      measure();
      paint();
      warm();
    }
  });
  ro.observe(mv);
  const prefObs = () => {
    pos = 0;
    vis = 0;
    shownAt = 0;
    apply();
  };
  // schon kurz nach dem Start (im Leerlauf, nach dem Laden der Kalender)
  let startWarm = 0;
  if (on()) {
    startWarm = win.setTimeout(() => {
      startWarm = 0;
      win.requestIdleCallback ? win.requestIdleCallback(() => warm(true), { timeout: 5000 }) : warm(true);
    }, 8000);
  }
  // neuer Bereich von außen (Pfeile, „Heute“, Zoom, Ansichtswechsel): wieder
  // genau an seiner Wochengrenze
  mv.__mcScrollReset = () => {
    if (!shifting) {
      pos = 0;
      vis = 0;
      if (later) {
        (win.cancelIdleCallback || win.clearTimeout).call(win, later);
        later = 0;
      }
    }
  };
  Services.prefs.addObserver(MULTIWEEK_SCROLL_PREF, prefObs);
  // nach jedem Neuaufbau (Pfeile, „Heute“, Zoom) wieder an der Wochengrenze
  mv.__mcScrollApply = () => {
    rowCache = 0;
    months();
    if (!anim) {
      apply();
    }
  };
  mv.__mcScrollPos = () => pos;
  apply();
  return () => {
    mv.removeEventListener("wheel", onWheel, { capture: true });
    ro.disconnect();
    Services.prefs.removeObserver(MULTIWEEK_SCROLL_PREF, prefObs);
    win.clearTimeout(idle);
    win.clearTimeout(startWarm);
    if (later) {
      (win.cancelIdleCallback || win.clearTimeout).call(win, later);
    }
    for (const id of [anim, frame, pending]) {
      if (id) {
        win.cancelAnimationFrame(id);
      }
    }
    mask?.remove();
    const t = table();
    if (t) {
      for (const el of t.querySelectorAll(".mc-mw-monthlabel")) {
        el.remove();
      }
      for (const box of t.querySelectorAll("calendar-month-day-box[mc-other]")) {
        box.removeAttribute("mc-other");
      }
      t.style.removeProperty("transform");
      for (const label of t.querySelectorAll("calendar-day-label")) {
        label.style.removeProperty("transform");
      }
    }
    mv.removeAttribute("mc-mw-scroll");
    mv.style.removeProperty("--mc-mw-row");
    delete mv.__mcScrollApply;
    delete mv.__mcScrollPos;
    delete mv.__mcScrollReset;
    delete mv.__mcScrollShifts;
    delete mv.__mcDir;
    delete mv.__mcTopMonth;
  };
}

function hookMultiweekBuffer(mv, restorers) {
  // Thunderbirds eigene Sicht auf das Element: Änderungen durch die
  // Schutzschicht der Erweiterung (Xray) sähe der Kalender sonst nicht
  // (über die Klasse: beim ersten Aufruf ist die Ansicht oft noch nicht
  // aufgebaut – dann fehlten monthbody und die eigenen Methoden)
  const win = mv?.ownerDocument?.defaultView;
  mv = mv?.wrappedJSObject || mv;
  const View = (win?.wrappedJSObject || win)?.customElements?.get("calendar-multiweek-view");
  if (!win || !View || View.prototype.__mcBuffer || typeof View.prototype.setDateRange != "function") {
    return;
  }
  const proto = View.prototype;
  proto.__mcBuffer = true;
  const doc = win.document;
  const on = () => Services.prefs.getBoolPref(MULTIWEEK_SCROLL_PREF, false);
  const B = MULTIWEEK_BUFFER_WEEKS;
  // wie Thunderbird die Wochenzeilen anlegt (sechs), nur so viele wie nötig
  const ensureRows = view => {
    const body = view.monthbody;
    const want = Math.max(6, (view.weeksInView || 6) + 2 * B);
    while (body.children.length < want) {
      const row = doc.createElement("tr");
      for (let day = 1; day <= 7; day++) {
        const cell = doc.createElement("td");
        cell.append(doc.createXULElement("calendar-month-day-box"));
        row.append(cell);
      }
      body.append(row);
    }
  };
  // nach jedem Aufbau: Puffer-Zeilen markieren und fortlaufend ins Raster
  // (leere Rasterzeilen nähmen sonst Platz ein). Schritt 3: die Puffer bleiben
  // sichtbar – das ganze Raster wird pixelweise unter der Kopfzeile verschoben
  // (scroll unten), nur der sichtbare Teil liegt im Fenster
  const afterLayout = view => {
    const rows = [...view.monthbody.children];
    const buffered = on() && !!view.__mcVisible;
    const used = rows.filter(r => !r.hasAttribute("hidden"));
    let n = 2;
    rows.forEach((row, i) => {
      const k = used.indexOf(row);
      const buffer = buffered && k >= 0 && (k < B || k >= used.length - B);
      row.toggleAttribute("mc-buffer", buffer);
      for (const cell of row.cells) {
        cell.firstElementChild.style.gridRow = buffered ? (row.hasAttribute("hidden") ? "" : n) : i + 2;
      }
      if (buffered && !row.hasAttribute("hidden")) {
        n++;
      }
    });
  };
  const saved = ["relayout", "setDateRange", "moveView", "findDayBoxForDate", "addItems", "clearItems", "doRemoveItem", "removeItemsFromCalendar"].map(name => [name, Object.hasOwn(proto, name), proto[name]]);
  const orig = Object.fromEntries(saved.map(([name, , fn]) => [name, fn]));
  // gewählter Tag in einer Zeile, die Thunderbird beim Neuaufbau geleert hat
  // (Puffer-Zeilen, Einstellung aus): seine Auswahl zeigte sonst ins Leere
  // („mSelectedDayBox.date is undefined“) – dann vergessen
  const dropStale = view => {
    if (view.mSelectedDayBox && !view.mSelectedDayBox.date) {
      view.mSelectedDayBox.selected = false;
      view.mSelectedDayBox = null;
    }
  };
  proto.relayout = function (...args) {
    dropStale(this);
    const r = orig.relayout.apply(this, args);
    dropStale(this);
    try {
      afterLayout(this);
      this.__mcScrollApply?.();
    } catch (e) {
      log("multiweek buffer layout error", String(e).slice(0, 120));
    }
    return r;
  };
  proto.setDateRange = function (startDate, endDate) {
    if (!on()) {
      this.__mcVisible = null;
      // Einstellung aus: die zusätzlichen Puffer-Zeilen wieder weg (Thunderbird hat sechs)
      const body = this.monthbody;
      while (body && body.children.length > 6) {
        if (this.mSelectedDayBox && body.lastElementChild.contains(this.mSelectedDayBox)) {
          this.mSelectedDayBox = null;
        }
        body.lastElementChild.remove();
      }
      return orig.setDateRange.call(this, startDate, endDate);
    }
    ensureRows(this);
    this.__mcScrollReset?.();
    this.__mcVisible = [startDate.clone(), endDate.clone()];
    const s = startDate.clone();
    const e = endDate.clone();
    s.day -= 7 * B;
    e.day += 7 * B;
    // Thunderbird baut neu, wenn sich der Bereich ändert, und fragt die
    // Kalender für ihn ab; danach wieder der sichtbare Teil als „angezeigter
    // Bereich“ (Überschrift, Pfeile)
    orig.setDateRange.call(this, s, e);
    this.rangeStartDate = startDate;
    this.rangeEndDate = endDate;
    if (this.isVisible()) {
      (win.wrappedJSObject || win).calendarNavigationBar?.setDateRange(startDate, endDate);
    }
    return undefined;
  };
  // Pfeile: Thunderbird rechnet vom ersten geladenen Tag – mit Puffer zwei
  // Wochen zu früh; also vom ersten sichtbaren
  proto.moveView = function (weeksToMove) {
    if (!on() || !weeksToMove || !this.rangeStartDate) {
      return orig.moveView.call(this, weeksToMove);
    }
    const date = this.rangeStartDate.clone();
    const savedSelectedDay = this.selectedDay.clone();
    const prevWeeks = Services.prefs.getIntPref("calendar.previousweeks.inview", 0);
    date.day += 7 * (weeksToMove + prevWeeks);
    this.goToDay(date);
    savedSelectedDay.day += 7 * weeksToMove;
    this.selectedDay = savedSelectedDay;
    return undefined;
  };
  // Tageszelle zu einem Datum über eine Tabelle statt über alle Zellen (mit
  // Puffer rund 200, je Termin und Tag); Treffer zur Sicherheit wie bei
  // Thunderbird verglichen, sonst dessen eigene Suche
  proto.findDayBoxForDate = function (date) {
    const boxes = this.mDateBoxes;
    if (!on() || !boxes || !date) {
      return orig.findDayBoxForDate.call(this, date);
    }
    const key = d => d.year * 512 + d.month * 32 + d.day;
    let index = this.__mcBoxIndex;
    if (index?.boxes !== boxes) {
      index = this.__mcBoxIndex = { boxes, map: new Map() };
      for (const box of boxes) {
        if (box.mDate) {
          index.map.set(key(box.mDate), box);
        }
      }
    }
    const box = index.map.get(key(date));
    return box && box.mDate.compare(date) == 0 ? box : orig.findDayBoxForDate.call(this, date);
  };
  // Termine eintragen: die sichtbaren Wochen (eine Woche Rand) sofort, die
  // Puffer-Wochen danach in Häppchen je Bild, nächstgelegene zuerst
  const dropQueue = view => {
    const q = view.__mcQueue;
    if (q) {
      if (q.frame) {
        win.cancelAnimationFrame(q.frame);
      }
      view.__mcQueue = null;
    }
  };
  const pump = view => {
    const q = view.__mcQueue;
    if (!q) {
      return;
    }
    q.frame = 0;
    const t0 = win.performance.now();
    try {
      while (q.items.length && win.performance.now() - t0 < MULTIWEEK_SLICE_MS) {
        orig.addItems.call(view, q.items.splice(0, 8));
      }
    } catch (e) {
      log("multiweek queue error", String(e).slice(0, 120));
      q.items = [];
    }
    if (q.items.length) {
      q.frame = win.requestAnimationFrame(() => pump(view));
    } else if (view.__mcQueue == q) {
      view.__mcQueue = null;
    }
  };
  proto.addItems = function (items) {
    if (!on() || !this.__mcVisible || !this.rangeStartDate || !this.rangeEndDate || items.length < MULTIWEEK_DEFER_MIN) {
      return orig.addItems.call(this, items);
    }
    const s = this.rangeStartDate.clone(), e = this.rangeEndDate.clone();
    s.day -= 7;
    e.day += 8;
    // Entfernung von der Mitte; in Scrollrichtung zählt sie ein Drittel
    // (dorthin kommt der Nutzer zuerst)
    const mid = (s.nativeTime + e.nativeTime) / 2, dir = this.__mcDir || 0;
    const dist = item => {
      const delta = (item.startDate || item.entryDate || item.dueDate).nativeTime - mid;
      return Math.abs(delta) * (dir && Math.sign(delta) == dir ? 1 : 3);
    };
    const now = [], rest = [];
    for (const item of items) {
      const a = item.startDate || item.entryDate || item.dueDate;
      const b = item.endDate || item.dueDate || a;
      if (!a || a.compare(e) < 0 && b.compare(s) >= 0) {
        now.push(item);
      } else {
        rest.push(item);
      }
    }
    orig.addItems.call(this, now);
    if (!rest.length) {
      return undefined;
    }
    // zu den wartenden (mehrere Kalender) und nach Entfernung ordnen
    const q = this.__mcQueue ||= { items: [], frame: 0 };
    q.items = q.items.concat(rest).map(item => [dist(item), item]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    q.frame ||= win.requestAnimationFrame(() => pump(this));
    return undefined;
  };
  proto.clearItems = function (...args) {
    dropQueue(this);
    return orig.clearItems.apply(this, args);
  };
  proto.doRemoveItem = function (item, ...args) {
    const q = this.__mcQueue;
    if (q && item) {
      q.items = q.items.filter(x => x.hashId != item.hashId);
    }
    return orig.doRemoveItem.call(this, item, ...args);
  };
  proto.removeItemsFromCalendar = function (calendarId, ...args) {
    const q = this.__mcQueue;
    if (q) {
      q.items = q.items.filter(x => x.calendar?.id != calendarId);
    }
    return orig.removeItemsFromCalendar.call(this, calendarId, ...args);
  };
  // Einstellung umgeschaltet: denselben Bereich neu aufbauen
  const observer = () => {
    try {
      const start = mv.rangeStartDate?.clone();
      const end = mv.rangeEndDate?.clone();
      mv.mViewStart = null;
      if (start && end && mv.monthbody) {
        mv.setDateRange(start, end);
      }
    } catch (e) {
      log("multiweek buffer pref error", String(e).slice(0, 120));
    }
  };
  Services.prefs.addObserver(MULTIWEEK_SCROLL_PREF, observer);
  const stopScroll = hookMultiweekScroll(mv, win, on, B, orig);
  restorers?.push(() => {
    stopScroll();
    Services.prefs.removeObserver(MULTIWEEK_SCROLL_PREF, observer);
    for (const [name, own, fn] of saved) {
      if (own) {
        proto[name] = fn;
      } else {
        delete proto[name];
      }
    }
    delete proto.__mcBuffer;
  });
  if (on()) {
    observer();
  }
}

function appleEventLayout(win) {
  const doc = win.document;
  const grid = doc.getElementById("event-grid");
  if (!grid || grid.__mcApple || !win.calendarItem?.isEvent?.()) {
    return;
  }
  grid.__mcApple = true;
  const X = "http://www.w3.org/1999/xhtml";
  const body = grid.tBodies?.[0] || grid;
  const row = id => doc.getElementById(id);
  const calendarRow = doc.getElementById("item-calendar")?.closest("tr");
  // Teilnehmer: eigene Karte „Add Invitees“ (öffnet „Teilnehmer einladen“)
  const invRow = doc.createElementNS(X, "tr");
  invRow.id = "mc-invitees-row";
  const invTh = doc.createElementNS(X, "th");
  const invTd = doc.createElementNS(X, "td");
  const invBtn = doc.createElementNS(X, "button");
  invBtn.type = "button";
  invBtn.className = "mc-invitees";
  invBtn.addEventListener("click", () => win.editAttendees?.());
  invTd.append(invBtn);
  invRow.append(invTh, invTd);
  // Zeitkarte wie Apple Kalender: Beschriftungen „All Day:“, „Starts:“,
  // „Ends:“, „Repeat:“, „Alert:“, „Show As:“ rechtsbündig (Doppelpunkt per
  // CSS), alle Werte in einer Spalte – das Kästchen für „All Day“ steht
  // rechts neben seiner Beschriftung statt mit eigenem Text in der Wertespalte
  const label = (text, control) => {
    const l = doc.createXULElement("label");
    l.setAttribute("value", tr(text));
    if (control) {
      l.setAttribute("control", control);
    }
    return l;
  };
  const allTh = row("event-grid-allday-row")?.querySelector(":scope > th");
  if (allTh && row("event-all-day")) {
    allTh.replaceChildren(label("All Day", "event-all-day"));
    row("event-all-day").setAttribute("aria-label", tr("All Day"));
  }
  for (const [id, text] of [["event-grid-startdate-row", "Starts"], ["event-grid-enddate-row", "Ends"],
    ["event-grid-recurrence-row", "Repeat"], ["event-grid-alarm-row", "Alert"]]) {
    const l = row(id)?.querySelector(":scope > th label.event-only, :scope > th label:not(.todo-only)");
    l?.setAttribute("value", tr(text));
    // Tastenkürzel, dessen Buchstabe im neuen Text fehlt, stünde unter Linux
    // und Windows in Klammern dahinter („Ends (U):“) – dann weglassen
    const key = l?.getAttribute("accesskey");
    if (key && !tr(text).toLowerCase().includes(key.toLowerCase())) {
      l.removeAttribute("accesskey");
    }
  }
  // „Show As“ (frei/beschäftigt) als Zeile der Zeitkarte statt unten in der
  // Statuszeile; ändert über Thunderbirds eigenen Befehl im Fenster
  const pdoc = win.parent?.document;
  const busyItem = pdoc?.getElementById("options-freebusy-busy-menuitem") || pdoc?.getElementById("event-freebusy-busy-menuitem");
  const freeItem = pdoc?.getElementById("options-freebusy-free-menuitem") || pdoc?.getElementById("event-freebusy-free-menuitem");
  const busyLabel = pdoc?.getElementById("status-freebusy-busy-label");
  let showRow = null;
  if (busyItem && freeItem && busyLabel && win.parent.editShowTimeAs) {
    showRow = doc.createElementNS(X, "tr");
    showRow.id = "mc-showas-row";
    const th = doc.createElementNS(X, "th");
    const td = doc.createElementNS(X, "td");
    th.append(label("Show As", "mc-showas"));
    const ml = doc.createXULElement("menulist");
    ml.id = "mc-showas";
    ml.setAttribute("disable-on-readonly", "true");
    const pop = doc.createXULElement("menupopup");
    for (const [value, item] of [["OPAQUE", busyItem], ["TRANSPARENT", freeItem]]) {
      const mi = doc.createXULElement("menuitem");
      mi.setAttribute("label", item.getAttribute("label") || value);
      mi.setAttribute("value", value);
      pop.append(mi);
    }
    ml.append(pop);
    td.append(ml);
    showRow.append(th, td);
    body.append(showRow);
    const sync = () => {
      ml.value = busyLabel.hidden ? "TRANSPARENT" : "OPAQUE";
    };
    sync();
    new win.MutationObserver(sync).observe(busyLabel, { attributes: true, attributeFilter: ["hidden"] });
    ml.addEventListener("command", () => win.parent.editShowTimeAs({ getAttribute: () => ml.value }));
    pdoc.documentElement.setAttribute("mc-showas-row", "");
  }
  const cards = [
    ["title", ["event-grid-title-row"]],
    ["time", ["event-grid-allday-row", "event-grid-startdate-row", "event-grid-enddate-row", "event-grid-recurrence-row", "event-grid-alarm-row", showRow]],
    ["location", ["event-grid-location-row"]],
    ["invitees", [invRow]],
    ["calendar", [calendarRow]],
    ["category", ["event-grid-category-row"]],
    ["link", ["event-grid-link-row"]],
  ];
  // Reihenfolge nur per CSS (order in einer Flex-Spalte): beim Umhängen im Dokument
  // bauten sich Thunderbirds Datum/Uhrzeit-Felder ein zweites Mal auf
  body.append(invRow);
  let order = 0;
  for (const [name, rows] of cards) {
    const els = rows.map(r => (typeof r == "string" ? row(r) : r)).filter(Boolean);
    els.forEach((el, i) => {
      el.dataset.mcCard = name;
      el.toggleAttribute("data-mc-first", i == 0);
      el.toggleAttribute("data-mc-last", i == els.length - 1);
      el.style.order = String(++order);
    });
  }
  // Platzhalter wie Apple Kalender (Felder ohne Beschriftung)
  row("item-title")?.setAttribute("placeholder", tr("Title"));
  row("item-location")?.setAttribute("placeholder", tr("Add Location or Video Call"));
  // Teilnehmer-Karte: „Add Invitees“ bzw. die Namen der Eingeladenen
  const syncInvitees = () => {
    const list = (win.window.attendees || []).filter(a => !a.isOrganizer);
    invBtn.textContent = list.length ? list.map(a => a.commonName || a.toString().replace(/^mailto:/i, "")).join(", ") : tr("Add Invitees");
    invBtn.classList.toggle("mc-has", !!list.length);
    // Reiter unten nur, wenn es Anhänge oder Teilnehmer gibt (sonst wie Apple nur die Notiz)
    const attachments = doc.getElementById("attachment-link")?.itemCount || 0;
    doc.documentElement.toggleAttribute("mc-event-tabs", !!(attachments || list.length));
  };
  syncInvitees();
  const mo = new win.MutationObserver(syncInvitees);
  for (const el of [doc.getElementById("attachment-link"), doc.querySelector(".item-attendees-list-container"), doc.getElementById("event-grid-tab-attendees")]) {
    if (el) {
      mo.observe(el, { childList: true, subtree: true, attributes: true });
    }
  }
  // Streifen in der Kalenderfarbe links neben Titel und Zeitkarte
  const stripe = doc.createElementNS(X, "div");
  stripe.id = "mc-calendar-stripe";
  grid.append(stripe);
  const place = () => {
    const first = row("event-grid-title-row"), last = showRow || row("event-grid-alarm-row");
    const g = grid.getBoundingClientRect();
    if (!first || !last) {
      return;
    }
    stripe.style.top = `${first.getBoundingClientRect().top - g.top + 6}px`;
    stripe.style.height = `${Math.max(0, last.getBoundingClientRect().bottom - first.getBoundingClientRect().top - 12)}px`;
    let color = "";
    try {
      color = win.getCurrentCalendar?.()?.getProperty("color") || "";
    } catch {}
    stripe.style.backgroundColor = color || "var(--mt-accent)";
    // dieselbe Farbe für das gewählte Feld der Uhrzeit (.mc-time-seg)
    doc.documentElement.style.setProperty("--mc-item-cal", color || "var(--mt-accent)");
  };
  new win.ResizeObserver(place).observe(grid);
  row("item-calendar")?.addEventListener("command", () => win.setTimeout(place, 0));
  place();
  // Notiz: Platzhalter im leeren Beschreibungsfeld
  const desc = doc.getElementById("item-description");
  const setNotesPlaceholder = () => {
    const b = desc?.contentDocument?.body;
    if (!b) {
      return;
    }
    b.setAttribute("data-mc-placeholder", tr("Add Notes or URL"));
    const update = () => b.classList.toggle("mc-empty", !b.textContent.trim() && !b.querySelector("img"));
    update();
    if (!b.__mcPlaceholder) {
      b.__mcPlaceholder = true;
      b.addEventListener("input", update);
      new desc.contentWindow.MutationObserver(update).observe(b, { childList: true, subtree: true, characterData: true });
    }
  };
  setNotesPlaceholder();
  desc?.addEventListener("load", () => win.setTimeout(setNotesPlaceholder, 0), true);
  win.setTimeout(setNotesPlaceholder, 500);
  doc.documentElement.setAttribute("mc-apple-event", "");
}

// Termin/Aufgabe: Beginn und Ende wie Apple Kalender nur in eine Richtung
// gekoppelt – Beginn verschieben nimmt das Ende mit (gleiche Dauer), Ende
// ändern ändert nur die Dauer. So macht es Thunderbird, solange sein
// Kopplungs-Knopf (Kettensymbol) aus ist; an schob er beim Ändern des Endes
// auch den Beginn mit, mehrtägige Termine ließen sich nicht anlegen. Knopf
// dauerhaft aus (auch ein früher gemerktes „an“) und per CSS ausgeblendet
function keepDurationOneWay(win) {
  const doc = win.document;
  const kdb = doc.getElementById("keepduration-button");
  if (!kdb) {
    return;
  }
  if (kdb.getAttribute("keep") != "false") {
    kdb.setAttribute("keep", "false");
    kdb.setAttribute("aria-pressed", "false");
  }
  doc.getElementById("link-image-top")?.setAttribute("keep", "false");
  doc.documentElement.setAttribute("mc-keep-duration", "");
}

// Uhrzeit im Termin wie Apple Kalender zum Eintippen: Stunden und Minuten
// (ggf. AM/PM) als Text, das gewählte Feld in der Kalenderfarbe hinterlegt.
// Tippen einer Ziffer in ein Feld: liefert neuen Wert [Stunde, Minute], den
// Zwischenstand (erste Ziffer, auf die zweite wird gewartet) und ob es zum
// nächsten Feld weitergeht – wie bei macOS-Uhrzeitfeldern
function timeTypeDigit(seg, buf, digit, [h, m], h12 = false) {
  const digits = buf + digit, n = Number(digits), d = Number(digit);
  if (seg == "m") {
    if (digits.length == 1) {
      return { value: [h, d], buf: d > 5 ? "" : digits, next: d > 5 };
    }
    return { value: [h, n], buf: "", next: true };
  }
  const max = h12 ? 12 : 23, pm = h >= 12;
  const hour = x => (h12 ? (x % 12) + (pm ? 12 : 0) : x);
  if (digits.length == 1) {
    if (d * 10 > max) {
      return { value: [hour(d), m], buf: "", next: true };
    }
    // (12 Stunden: „0“ allein ist keine Stunde, erst mit der zweiten Ziffer)
    return { value: h12 && d == 0 ? [h, m] : [hour(d), m], buf: digits, next: false };
  }
  if (n <= max && !(h12 && n == 0)) {
    return { value: [hour(n), m], buf: "", next: true };
  }
  // zweite Ziffer passt nicht (z. B. „2“, „7“): sie beginnt neu
  return timeTypeDigit(seg, "", digit, [h, m], h12);
}

// Pfeil hoch/runter: nur das gewählte Feld ändert sich (Minuten 59 → 00 ohne
// die Stunde), AM/PM wechselt die Tageshälfte
function timeStep(seg, [h, m], dir) {
  if (seg == "m") {
    return [h, (m + dir + 60) % 60];
  }
  if (seg == "ap") {
    return [(h + 12) % 24, m];
  }
  return [(h + dir + 24) % 24, m];
}

// Uhrzeit als Text zum Eintippen: Klick wählt Stunden bzw. Minuten, Tab/→
// springt weiter, ↑/↓ und Mausrad ändern den Wert. io: { get() → [Stunde,
// Minute] | null, set([Stunde, Minute]), off() → bool } – für Thunderbirds
// timepicker (inlineTimeEdit) und das Schnellfenster
function timeSegEdit(win, io) {
  const doc = win.document, X = "http://www.w3.org/1999/xhtml";
  const fmt = new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" });
  const parts = d => fmt.formatToParts(d);
  const box = doc.createElementNS(X, "span");
  box.className = "mc-time-edit";
  const segs = [];
  for (const part of parts(new Date(2000, 0, 1, 9, 0))) {
    const el = doc.createElementNS(X, "span");
    const seg = { hour: "h", minute: "m", dayPeriod: "ap" }[part.type];
    if (seg) {
      el.className = "mc-time-seg";
      el.dataset.seg = seg;
      el.tabIndex = 0;
      el.setAttribute("role", "spinbutton");
      segs.push(el);
    } else {
      el.className = "mc-time-sep";
    }
    el.dataset.type = part.type;
    box.append(el);
  }
  const h12 = segs.some(el => el.dataset.seg == "ap");
  const off = () => io.off();
  const render = (value = io.get()) => {
    const [h, m] = value || [];
    if (!Number.isInteger(h)) {
      return;
    }
    const list = parts(new Date(2000, 0, 1, h, m));
    [...box.children].forEach((el, i) => {
      const part = list[i]?.type == el.dataset.type ? list[i] : list.find(p => p.type == el.dataset.type);
      if (part && el.textContent != part.value) {
        el.textContent = part.value;
      }
      if (el.dataset.seg) {
        el.setAttribute("aria-valuenow", el.dataset.seg == "h" ? h : el.dataset.seg == "m" ? m : h >= 12 ? 1 : 0);
        el.setAttribute("aria-valuetext", el.textContent);
      }
    });
  };
  const sync = () => {
    box.toggleAttribute("disabled", off());
    for (const el of segs) {
      el.tabIndex = off() ? -1 : 0;
    }
  };
  const write = value => {
    io.set(value); // meldet „change“ nur bei einer Änderung
    render();
  };
  // erste Ziffer, auf deren zweite gewartet wird: nur anzeigen, noch nicht
  // übernehmen (sonst sprang z. B. das Ende beim Tippen von „11“ kurz auf 01:00
  // vor den Beginn) – übernommen mit der zweiten Ziffer oder beim Weitergehen
  let buf = "", pending = null;
  const commit = () => {
    if (pending) {
      const value = pending;
      pending = null;
      write(value);
    }
  };
  // gewähltes Feld als Merkmal (nicht :focus – das gilt nur im aktiven Fenster)
  const mark = target => {
    for (const el of segs) {
      el.toggleAttribute("selected", el == target);
    }
  };
  const pick = el => {
    if (el) {
      commit();
      buf = "";
      el.focus();
      mark(el);
    }
  };
  box.addEventListener("focusin", event => {
    commit();
    buf = "";
    mark(event.target);
  });
  box.addEventListener("focusout", event => {
    if (!box.contains(event.relatedTarget)) {
      commit();
      for (const el of segs) {
        el.removeAttribute("selected");
      }
    }
  });
  box.addEventListener("mousedown", event => {
    if (event.button != 0 || off()) {
      return;
    }
    event.preventDefault();
    const seg = event.target.closest?.(".mc-time-seg");
    const r = box.getBoundingClientRect();
    pick(seg || (event.clientX < r.left + r.width / 2 ? segs[0] : segs[1]) || segs[0]);
  });
  box.addEventListener("keydown", event => {
    const el = event.target.closest?.(".mc-time-seg");
    if (!el || off() || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const seg = el.dataset.seg, value = io.get(), i = segs.indexOf(el);
    if (!value) {
      return;
    }
    let handled = true;
    if (/^[0-9]$/.test(event.key) && seg != "ap") {
      const r = timeTypeDigit(seg, buf, event.key, pending || value, h12);
      buf = r.buf;
      if (r.buf) {
        pending = r.value;
        render(pending);
      } else {
        pending = null;
        write(r.value);
      }
      if (r.next && segs[i + 1]) {
        pick(segs[i + 1]);
      }
    } else if (seg == "ap" && /^[ap]$/i.test(event.key)) {
      const pm = event.key.toLowerCase() == "p";
      if (pm != value[0] >= 12) {
        write(timeStep("ap", value, 1));
      }
    } else if (event.key == "ArrowUp" || event.key == "ArrowDown") {
      commit();
      buf = "";
      write(timeStep(seg, io.get(), event.key == "ArrowUp" ? 1 : -1));
    } else if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
      pick(segs[i + (event.key == "ArrowRight" ? 1 : -1)]);
    } else if (event.key == "Backspace" || event.key == "Delete") {
      pending = null;
      buf = "";
      render();
    } else {
      // Eingabe, Tab o. ä.: Angefangenes übernehmen
      commit();
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  // Mausrad über Stunden bzw. Minuten (linke/rechte Hälfte): je Rastung eine
  // Einheit; Trackpad-Schritte werden aufsummiert (~40 px je Einheit)
  let sum = 0;
  box.addEventListener("wheel", event => {
    if (off() || !event.deltaY) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    sum += event.deltaMode == 0 ? event.deltaY / 40 : Math.sign(event.deltaY);
    const units = Math.trunc(sum);
    if (!units) {
      return;
    }
    sum -= units;
    const r = box.getBoundingClientRect();
    const onHour = event.clientX < r.left + r.width / 2;
    const [h, m] = io.get() || [0, 0];
    // Rad nach oben (deltaY < 0) zählt hoch, wie bei macOS-Uhrzeitfeldern
    const total = ((onHour ? h * 60 + m - units * 60 : h * 60 + m - units) % 1440 + 1440) % 1440;
    write([Math.floor(total / 60), total % 60]);
  }, { passive: false });
  render();
  sync();
  return { box, segs, pick, render, sync };
}

// Uhrzeitfeld eines Thunderbird-timepickers als Text zum Eintippen: ersetzt
// dessen Auswahlfeld (bleibt verborgen und hält den Wert)
function inlineTimeEdit(win, tp, set = v => (tp.value = v)) {
  const edit = timeSegEdit(win, {
    get: () => tp.value,
    set,
    off: () => tp.hasAttribute("disabled") || tp.hidden,
  });
  // neuer Wert von Thunderbird: danach (Stunden/Minuten stehen erst nach dem
  // Setzer fest) neu zeichnen
  afterInputBoxValue(tp, () => edit.render());
  new win.MutationObserver(edit.sync).observe(tp, { attributes: true, attributeFilter: ["disabled", "hidden"] });
  tp.append(edit.box);
  tp.setAttribute("mc-inline", "");
  tp.focus = () => edit.pick(edit.segs[0]);
  return edit;
}

// Ende nach einer eingetippten Uhrzeit [Stunde, Minute]: Liegt sie am Tag
// des Beginns vor dem Beginn, gilt der Folgetag (22:00 bis „01:00“ → 3
// Stunden) statt des Hinweises „Ende vor Beginn“. Ein Termin unter 24 Stunden
// rechnet vom Tag des Beginns aus (ein schon auf den Folgetag gesprungenes
// Ende kommt so zurück, wenn die Uhrzeit wieder nach dem Beginn liegt – auch
// beim Tippen von Stunden und dann Minuten); ein längerer behält seinen Endtag
function endFromTime(start, end, [h, m]) {
  const span = end.getTime() - start.getTime();
  const t = new Date((span >= 0 && span < 86400000 ? start : end).getTime());
  t.setHours(h, m, 0, 0);
  if (t < start && t.getFullYear() == start.getFullYear() && t.getMonth() == start.getMonth() &&
      t.getDate() == start.getDate()) {
    t.setDate(t.getDate() + 1);
  }
  return t;
}

// Dauer für die Auswahlliste der Endzeit: „30 minutes“, „1 hour“, „1,5 hours“
// (Dezimalzeichen nach der Region des Systems)
function durationText(minutes, locale = regionLocale()) {
  if (minutes < 60) {
    return tr("{n} minutes", { n: minutes });
  }
  if (minutes == 60) {
    return tr("1 hour");
  }
  return tr("{n} hours", { n: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60) });
}

// Endzeit im Termin wie Apple Kalender: Klick in die Uhrzeit des Endes zeigt
// darunter die nächsten sechs Zeiten im 30-Minuten-Raster ab dem Beginn mit
// der Dauer, die aktuelle mit Häkchen; Tippen geht weiter (die Liste nimmt
// keine Tasten), Klick auf eine Zeile setzt das Ende – auch über Mitternacht
function endTimeList(win, dtp, edit) {
  const doc = win.document;
  const dp = dtp.querySelector("datepicker"), tp = dtp.querySelector("timepicker");
  const list = endTimeMenu(win, edit, {
    start: () => doc.getElementById("event-starttime")?.value,
    end: () => dtp.value,
    // Reihenfolge so, dass das Ende zwischendurch nie vor dem Beginn liegt
    set: t => {
      const date = () => (dp.value = t), time = () => (tp.value = [t.getHours(), t.getMinutes()]);
      if (t > dtp.value) {
        date();
        time();
      } else {
        time();
        date();
      }
    },
    // nur im Termin-Fenster (nicht „Teilnehmer einladen“), nicht ganztägig
    usable: () => doc.documentElement.hasAttribute("mc-apple-event") && !tp.hasAttribute("disabled") &&
      !!doc.getElementById("event-starttime")?.value?.getTime,
  });
  dtp.addEventListener("change", list.__mcRefill);
  return list;
}

// Liste der Endzeit für ein Uhrzeitfeld (Termin-Dialog und Schnellfenster):
// io.start()/io.end() liefern die Zeitpunkte, io.set(t) setzt das Ende,
// io.usable() sagt, ob die Liste gerade passt (nicht ganztägig); host: das
// Popover, in dem das Feld steht (die Liste als dessen Kind, sonst läge sie
// darunter)
function endTimeMenu(win, edit, io, host = null) {
  const doc = win.document;
  const fmt = new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" });
  const list = doc.createXULElement("menupopup");
  list.className = "mc-end-list";
  list.setAttribute("ignorekeys", "true");
  (host || doc.querySelector("popupset") || doc.documentElement).append(list);
  const fill = () => {
    const start = io.start(), end = io.end();
    list.replaceChildren();
    for (let k = 1; k <= 6; k++) {
      const t = new Date(start.getTime() + k * 30 * 60000);
      const item = doc.createXULElement("menuitem");
      item.setAttribute("type", "checkbox");
      item.setAttribute("label", fmt.format(t));
      item.setAttribute("acceltext", durationText(k * 30));
      if (t.getTime() == end?.getTime()) {
        item.setAttribute("checked", "true");
      }
      item.addEventListener("command", () => io.set(t));
      list.append(item);
    }
  };
  edit.box.addEventListener("mousedown", event => {
    if (event.button != 0 || !io.usable() || list.state == "open" || list.state == "showing") {
      return;
    }
    fill();
    // knapp unter dem Feld, die Zeiten der Liste etwas links der Uhrzeit des
    // Feldes (Häkchen-Spalte davor)
    list.openPopup(edit.box, "after_start", -40, 0, false, false);
  });
  // geänderte Zeiten bei offener Liste: Häkchen und Zeiten nachziehen
  list.__mcRefill = () => {
    if (list.state == "open" && io.usable()) {
      fill();
    }
  };
  edit.box.addEventListener("focusout", event => {
    if (!edit.box.contains(event.relatedTarget)) {
      list.hidePopup();
    }
  });
  edit.box.addEventListener("keydown", event => {
    if (event.key == "Escape" && list.state == "open") {
      list.hidePopup();
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  return list;
}

// Datum im Termin wie Apple Kalender zum Eintippen: Tag, Monat und Jahr als
// Text im Format des Systems, das gewählte Feld in der Kalenderfarbe; darunter
// ein kleiner Monatskalender. Werte als [Jahr, Monat (0–11), Tag]
// Datum aus einem anderen Fenster (instanceof gilt nur im eigenen)
function isDate(t) {
  return typeof t?.getTime == "function" && !isNaN(t.getTime());
}

function daysInMonth(y, m) {
  const d = new Date(2000, 0, 1);
  d.setFullYear(y, m + 1, 0);
  return d.getDate();
}

// Tag passend zum Monat (31. → 30. bzw. 28./29.)
function clampDate([y, m, d]) {
  return [y, m, Math.min(d, daysInMonth(y, m))];
}

// Tippen einer Ziffer in Tag („d“), Monat („m“) oder Jahr („y“): neuer Wert,
// Zwischenstand (Ziffern, auf deren Rest gewartet wird) und ob es zum
// nächsten Feld weitergeht – wie bei macOS-Datumsfeldern. Ein angefangenes
// Jahr (1–3 Ziffern) steht roh im Wert; dateFinish macht daraus ein Jahr
function dateTypeDigit(seg, buf, digit, [y, m, d]) {
  const digits = buf + digit, n = Number(digits), k = Number(digit);
  if (seg == "y") {
    if (digits.length >= 4) {
      return { value: clampDate([Number(digits.slice(-4)), m, d]), buf: "", next: true };
    }
    return { value: [n, m, d], buf: digits, next: false };
  }
  const max = seg == "d" ? daysInMonth(y, m) : 12;
  const put = v => clampDate(seg == "d" ? [y, m, v] : [y, v - 1, d]);
  if (digits.length == 1) {
    if (k * 10 > max) {
      return { value: put(k), buf: "", next: true };
    }
    // „0“ allein ist kein Tag/Monat: erst mit der zweiten Ziffer
    return { value: k ? put(k) : [y, m, d], buf: digits, next: false };
  }
  if (n >= 1 && n <= max) {
    return { value: put(n), buf: "", next: true };
  }
  // zweite Ziffer passt nicht (z. B. „35“): sie beginnt neu
  return dateTypeDigit(seg, "", digit, [y, m, d]);
}

// angefangenes Jahr übernehmen: zweistellig wie Thunderbird als 20xx
function dateFinish([y, m, d]) {
  return clampDate([y < 100 ? 2000 + y : y, m, d]);
}

// Pfeil hoch/runter: nur das gewählte Feld ändert sich (Tag 31 → 1 ohne den
// Monat, Dezember → Januar ohne das Jahr)
function dateStep(seg, [y, m, d], dir) {
  if (seg == "d") {
    const n = daysInMonth(y, m);
    return [y, m, ((d - 1 + dir) % n + n) % n + 1];
  }
  if (seg == "m") {
    return clampDate([y, (m + dir + 12) % 12, d]);
  }
  return clampDate([y + dir, m, d]);
}

// Wochen des kleinen Monatskalenders: immer sechs Zeilen (die Fläche springt
// beim Blättern nicht), beginnend am ersten Wochentag (0 = Sonntag)
function monthWeeks(y, m, weekStart = 1) {
  const first = new Date(2000, 0, 1);
  first.setFullYear(y, m, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const t = new Date(2000, 0, 1);
      t.setFullYear(y, m, 1 + w * 7 + i - lead);
      week.push([t.getFullYear(), t.getMonth(), t.getDate()]);
    }
    weeks.push(week);
  }
  return weeks;
}

// Thunderbird schreibt jeden neuen Wert eines date-/timepickers über
// _inputBoxValue ins (verborgene) Auswahlfeld – danach fn aufrufen
function afterInputBoxValue(picker, fn) {
  let proto = Object.getPrototypeOf(picker), desc = null;
  while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, "_inputBoxValue"))) {
    proto = Object.getPrototypeOf(proto);
  }
  if (desc?.set) {
    Object.defineProperty(picker, "_inputBoxValue", {
      configurable: true,
      get() {
        return desc.get.call(this);
      },
      set(v) {
        desc.set.call(this, v);
        Promise.resolve().then(fn);
      },
    });
  }
}

// Terminerinnerungen wie bei Apple Kalender als Mitteilung des Systems statt
// Thunderbirds Erinnerungsfenster. start() schaltet das Fenster als Vorgabe
// ab (calendar.alarms.show – wer es selbst eingeschaltet hat, behält es, dann
// zeigt Thunderbird wie bisher sein Fenster) und beobachtet die Erinnerungen:
// je Erinnerung eine Mitteilung mit Titel, Zeit und Ort, Klick öffnet den
// Termin. Danach gilt sie als erledigt wie mit „Dismiss“ im Fenster – sonst
// käme sie beim nächsten Start als verpasst wieder. Den Ton spielt weiter
// Thunderbird (calendar.alarms.playsound).
// alerts: Mitteilungsdienst (Tests setzen einen eigenen)
const ALARM_SHOW_PREF = "calendar.alarms.show";
const AlarmAlerts = {
  alerts: null,
  observer: null,
  service: null,
  showBefore: null,
  start() {
    if (this.observer) {
      return;
    }
    const defaults = Services.prefs.getDefaultBranch("");
    this.showBefore = defaults.getBoolPref(ALARM_SHOW_PREF, true);
    defaults.setBoolPref(ALARM_SHOW_PREF, false);
    try {
      this.service = Cc["@mozilla.org/calendar/alarm-service;1"].getService(Ci.calIAlarmService);
      this.observer = {
        QueryInterface: ChromeUtils.generateQI(["calIAlarmServiceObserver"]),
        onAlarm: (item, alarm) => this.onAlarm(item, alarm),
        onNotification() {},
        onRemoveAlarmsByItem() {},
        onRemoveAlarmsByCalendar() {},
        onAlarmsLoaded() {},
      };
      this.service.addObserver(this.observer);
    } catch (e) {
      log("alarm alerts start error", String(e).slice(0, 160));
      this.stop();
    }
  },
  stop() {
    if (this.observer) {
      try {
        this.service.removeObserver(this.observer);
      } catch {
        // gewollt: der Dienst ist beim Beenden schon fort
      }
    }
    this.observer = null;
    if (this.showBefore != null) {
      Services.prefs.getDefaultBranch("").setBoolPref(ALARM_SHOW_PREF, this.showBefore);
      this.showBefore = null;
    }
  },
  // Text unter dem Titel: Zeit (wie in Thunderbirds Erinnerungsfenster) und Ort
  text(cal, item) {
    let when = "";
    try {
      when = cal.dtz.formatter.formatItemInterval(item);
    } catch (e) {
      log("alarm alert time error", String(e).slice(0, 120));
    }
    const where = item.getProperty("LOCATION");
    return [when, where].filter(Boolean).join("\n");
  },
  onAlarm(item, alarm) {
    if (alarm.action != "DISPLAY" || Services.prefs.getBoolPref(ALARM_SHOW_PREF, false)) {
      return;
    }
    // abgesagte Termine und abgelehnte Einladungen wie Thunderbird nicht melden
    if (item.status == "CANCELLED") {
      return;
    }
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      if (item.calendar instanceof Ci.calISchedulingSupport && item.calendar.isInvitation(item)
          && item.calendar.getInvitedAttendee(item)?.participationStatus == "DECLINED") {
        return;
      }
      const alerts = this.alerts || Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
      const notice = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
      const fields = {
        name: `mc-alarm-${item.hashId}`,
        // macOS zeigt das Symbol der App selbst
        imageURL: Services.appinfo.OS == "Darwin" ? "" : "chrome://branding/content/icon48.png",
        title: item.title || "",
        text: this.text(cal, item),
        textClickable: true,
      };
      const open = () => cal.window.getCalendarWindow()?.openEventDialogForViewing(item);
      // wie Thunderbird selbst (ab 159 mit Rückrufen; ältere Versionen über observe)
      try {
        if (typeof notice.initWithObject == "function" && typeof alerts.showAlertWithCallbacks == "function") {
          notice.initWithObject(fields);
          alerts.showAlertWithCallbacks(notice, {
            QueryInterface: ChromeUtils.generateQI(["nsIAlertCallbacks"]),
            onAlertClick: () => open(),
            onAlertFinished() {},
          });
        } else {
          notice.init(fields.name, fields.imageURL, fields.title, fields.text, true);
          alerts.showAlert(notice, { observe: (subject, topic) => topic == "alertclickcallback" && open() });
        }
      } catch (e) {
        // kein Mitteilungsdienst (z. B. Linux ohne Benachrichtigungsdienst, xvfb): Erinnerung nicht verlieren,
        // sondern wie ohne halo.spaces in Thunderbirds Erinnerungsfenster, dort bleibt sie bis „Dismiss“
        log("alarm alert fallback window", (e?.result ?? 0).toString(16));
        Promise.resolve().then(() => this.showWindow(item, alarm));
        return;
      }
      // wie „Dismiss“ im Erinnerungsfenster (wiederholte Termine: nur dieses Vorkommen)
      this.service.dismissAlarm(item, alarm)?.catch?.(e => log("alarm dismiss error", String(e).slice(0, 120)));
    } catch (e) {
      log("alarm alert error", String(e).slice(0, 160));
    }
  },
  // Thunderbirds Erinnerungsfenster für eine Erinnerung öffnen (wie CalAlarmMonitor.onAlarm bei
  // calendar.alarms.show). Läuft nach den übrigen Beobachtern, der Monitor hat sie dann schon in mAlarms;
  // fehlt sie dort (eigener Aufruf), kommt sie dazu – sonst schlösse das Fenster beim Laden gleich wieder
  showWindow(item, alarm) {
    try {
      const mon = Cc["@mozilla.org/calendar/alarm-monitor;1"].getService(Ci.calIAlarmServiceObserver).wrappedJSObject;
      if (!mon.mAlarms.some(([i, a]) => i == item && a == alarm)) {
        mon.mAlarms.push([item, alarm]);
      }
      const win = Services.wm.getMostRecentWindow("Calendar:AlarmWindow");
      if (!win && (!mon.mWindowOpening || mon.mWindowOpening.closed)) {
        mon.mWindowOpening = Services.ww.openWindow(null, "chrome://calendar/content/calendar-alarm-dialog.xhtml",
          "_blank", "chrome,dialog=yes,all,resizable", mon);
      }
      if (!mon.mWindowOpening) {
        win.addWidgetFor(item, alarm);
      }
    } catch (e) {
      log("alarm window error", String(e).slice(0, 160));
    }
  },
};

// Datumsfeld als Text zum Eintippen. io: { get() → Date|null, set(Date),
// off() → bool } – so auch für andere Felder als Thunderbirds datepicker
function inlineDateEdit(win, io) {
  const doc = win.document, X = "http://www.w3.org/1999/xhtml";
  const fmt = systemDateFormat();
  const dateOf = ([y, m, d]) => {
    const t = new Date(2000, 0, 1);
    t.setFullYear(y, m, d);
    return t;
  };
  const box = doc.createElementNS(X, "span");
  box.className = "mc-date-edit";
  const segs = [];
  for (const part of fmt.formatToParts(new Date(2026, 10, 16))) {
    const el = doc.createElementNS(X, "span");
    const seg = { day: "d", month: "m", year: "y" }[part.type];
    if (seg) {
      el.className = "mc-time-seg mc-date-seg";
      el.dataset.seg = seg;
      el.tabIndex = 0;
      el.setAttribute("role", "spinbutton");
      segs.push(el);
    } else {
      el.className = "mc-time-sep";
    }
    el.dataset.type = part.type;
    box.append(el);
  }
  const triple = () => {
    const t = io.get();
    return isDate(t) ? [t.getFullYear(), t.getMonth(), t.getDate()] : null;
  };
  let buf = "", pending = null, typing = null;
  const render = (value = triple()) => {
    if (!value) {
      return;
    }
    const list = fmt.formatToParts(dateOf(clampDate([Math.max(value[0], 1), value[1], value[2]])));
    [...box.children].forEach((el, i) => {
      const part = list[i]?.type == el.dataset.type ? list[i] : list.find(p => p.type == el.dataset.type);
      // angefangenes Jahr so, wie es getippt wurde
      const text = el.dataset.seg && el.dataset.seg == typing?.seg && typing.buf ? typing.buf : part?.value;
      if (text != null && el.textContent != text) {
        el.textContent = text;
      }
      if (el.dataset.seg) {
        el.setAttribute("aria-valuetext", el.textContent);
      }
    });
  };
  const write = value => {
    io.set(dateOf(value)); // meldet „change“ nur bei einer Änderung
    render();
  };
  // angefangene Eingabe übernehmen (mit der letzten Ziffer, beim Weitergehen)
  const commit = () => {
    typing = null;
    if (pending) {
      const value = dateFinish(pending);
      pending = null;
      write(value);
    }
  };
  const mark = target => {
    for (const el of segs) {
      el.toggleAttribute("selected", el == target);
    }
  };
  const pick = el => {
    if (el) {
      commit();
      buf = "";
      el.focus();
      mark(el);
    }
  };
  const sync = () => {
    box.toggleAttribute("disabled", io.off());
    for (const el of segs) {
      el.tabIndex = io.off() ? -1 : 0;
    }
  };
  box.addEventListener("focusin", event => {
    commit();
    buf = "";
    mark(event.target);
  });
  box.addEventListener("focusout", event => {
    if (!box.contains(event.relatedTarget)) {
      commit();
      for (const el of segs) {
        el.removeAttribute("selected");
      }
    }
  });
  box.addEventListener("mousedown", event => {
    if (event.button != 0 || io.off()) {
      return;
    }
    event.preventDefault();
    const seg = event.target.closest?.(".mc-time-seg");
    if (seg) {
      pick(seg);
      return;
    }
    // zwischen den Feldern: das nächstgelegene
    const near = segs.map(el => {
      const r = el.getBoundingClientRect();
      return [Math.abs(event.clientX - (r.left + r.right) / 2), el];
    }).sort((a, b) => a[0] - b[0])[0];
    pick(near?.[1] || segs[0]);
  });
  box.addEventListener("keydown", event => {
    const el = event.target.closest?.(".mc-time-seg");
    const value = triple();
    if (!el || !value || io.off() || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const seg = el.dataset.seg, i = segs.indexOf(el);
    let handled = true;
    if (/^[0-9]$/.test(event.key)) {
      const r = dateTypeDigit(seg, buf, event.key, pending || value);
      buf = r.buf;
      if (r.buf) {
        pending = r.value;
        typing = { seg, buf };
        render(seg == "y" ? value : pending);
      } else {
        pending = null;
        typing = null;
        write(r.value);
      }
      if (r.next && segs[i + 1]) {
        pick(segs[i + 1]);
      }
    } else if (event.key == "ArrowUp" || event.key == "ArrowDown") {
      commit();
      buf = "";
      write(dateStep(seg, triple(), event.key == "ArrowUp" ? 1 : -1));
    } else if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
      pick(segs[i + (event.key == "ArrowRight" ? 1 : -1)]);
    } else if (event.key == "Backspace" || event.key == "Delete") {
      pending = null;
      typing = null;
      buf = "";
      render();
    } else {
      // Eingabe, Tab o. ä.: Angefangenes übernehmen
      commit();
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  render();
  sync();
  return { box, segs, pick, render, sync, commit };
}

// kleiner Monatskalender unter dem Datum wie Apple Kalender: Monat und Jahr
// fett, rechts ◀ ● ▶ (Monat zurück, heute, vor), Wochentage, Tage anderer
// Monate grau, heute rot, der gewählte Tag grau hinterlegt. Er nimmt nie den
// Fokus – Tippen im Datum geht weiter und blättert mit; Klick auf einen Tag
// übernimmt ihn und schließt
function miniMonthPopover(win, edit, io, host = null) {
  const doc = win.document, X = "http://www.w3.org/1999/xhtml";
  const h = (tag, cls, ...kids) => {
    const n = doc.createElementNS(X, tag);
    if (cls) {
      n.className = cls;
    }
    n.append(...kids);
    return n;
  };
  const panel = doc.createXULElement("panel");
  panel.className = "mc-date-panel";
  panel.__mcFor = edit.box;
  panel.setAttribute("noautofocus", "true");
  // Klick in ein anderes Feld des Datums wirkt sofort (nicht erst den Kalender schließen)
  panel.setAttribute("consumeoutsideclicks", "never");
  panel.setAttribute("level", "top");
  let weekStart = 1;
  try {
    weekStart = Services.prefs.getIntPref("calendar.week.start", 1);
  } catch {}
  const title = h("span", "mc-mini-title");
  const nav = (cls, label, dir) => {
    const b = h("span", `mc-mini-nav ${cls}`);
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", label);
    b.title = label;
    b.dataset.dir = dir;
    return b;
  };
  const head = h("div", "mc-mini-head", title,
    nav("mc-mini-prev", tr("Previous Month"), "-1"), nav("mc-mini-today", tr("Today"), "0"), nav("mc-mini-next", tr("Next Month"), "1"));
  const dayNames = new Services.intl.DateTimeFormat(undefined, { weekday: "short" });
  const wd = h("div", "mc-mini-weekdays");
  for (let i = 0; i < 7; i++) {
    // 5.1.2025 war ein Sonntag; zwei Zeichen wie „Mo“, „Tu“ bzw. „Mo“, „Di“
    const name = dayNames.format(new Date(2025, 0, 5 + ((weekStart + i) % 7))).replace(/\.$/, "").slice(0, 2);
    wd.append(h("span", "", name));
  }
  const grid = h("div", "mc-mini-grid");
  panel.append(h("div", "mc-mini", head, wd, grid));
  // (in einem Popover als dessen Kind, sonst läge der Kalender darunter)
  (host || doc.querySelector("popupset") || doc.documentElement).append(panel);
  const monthFmt = new Services.intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
  let shown = null;
  const fill = () => {
    const t = io.get();
    if (!isDate(t) || !shown) {
      return;
    }
    const [y, m] = shown;
    const first = new Date(2000, 0, 1);
    first.setFullYear(y, m, 1);
    title.textContent = monthFmt.format(first);
    const now = new Date();
    const same = (a, b) => a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
    const sel = [t.getFullYear(), t.getMonth(), t.getDate()], today = [now.getFullYear(), now.getMonth(), now.getDate()];
    grid.replaceChildren();
    for (const week of monthWeeks(y, m, weekStart)) {
      for (const day of week) {
        const c = h("span", "mc-mini-day", String(day[2]));
        c.dataset.date = day.join("-");
        c.toggleAttribute("othermonth", day[1] != m);
        c.toggleAttribute("today", same(day, today));
        c.toggleAttribute("selected", same(day, sel));
        grid.append(c);
      }
    }
  };
  const showMonth = t => {
    shown = [t.getFullYear(), t.getMonth()];
    fill();
  };
  // nie den Fokus nehmen (sonst endet das Tippen im Datum); Ereignisse nicht
  // an ein umgebendes Popover weitergeben (Schnellfenster: dessen
  // popuphidden räumt sonst auf)
  panel.addEventListener("mousedown", event => {
    event.preventDefault();
    event.stopPropagation();
  });
  for (const type of ["popupshowing", "popupshown", "popuphiding", "popuphidden"]) {
    panel.addEventListener(type, event => event.target == panel && event.stopPropagation());
  }
  panel.addEventListener("click", event => {
    event.stopPropagation();
    if (event.button != 0) {
      return;
    }
    const day = event.target.closest?.(".mc-mini-day");
    const b = event.target.closest?.(".mc-mini-nav");
    if (day) {
      edit.commit();
      const [y, m, d] = day.dataset.date.split("-").map(Number);
      const t = new Date(2000, 0, 1);
      t.setFullYear(y, m, d);
      io.set(t);
      edit.render();
      panel.hidePopup();
    } else if (b && shown) {
      const dir = Number(b.dataset.dir);
      if (!dir) {
        showMonth(new Date());
      } else {
        const t = new Date(2000, 0, 1);
        t.setFullYear(shown[0], shown[1] + dir, 1);
        showMonth(t);
      }
    }
  });
  // Mausrad blättert die Monate (aufsummiert wie bei der Uhrzeit)
  let sum = 0;
  panel.addEventListener("wheel", event => {
    if (!shown || !event.deltaY) {
      return;
    }
    event.preventDefault();
    sum += event.deltaMode == 0 ? event.deltaY / 40 : Math.sign(event.deltaY);
    const units = Math.trunc(sum);
    if (units) {
      sum -= units;
      const t = new Date(2000, 0, 1);
      t.setFullYear(shown[0], shown[1] + units, 1);
      showMonth(t);
    }
  }, { passive: false });
  panel.addEventListener("popupshowing", () => edit.box.setAttribute("open", ""));
  panel.addEventListener("popuphidden", () => edit.box.removeAttribute("open"));
  const open = () => panel.state == "open" || panel.state == "showing";
  edit.box.addEventListener("mousedown", event => {
    if (event.button != 0 || io.off() || open() || !isDate(io.get())) {
      return;
    }
    showMonth(io.get());
    // direkt unter dem Datum, links bündig mit seinem Text
    panel.openPopup(edit.box, "after_start", -4, 0, false, false);
  });
  edit.box.addEventListener("focusout", event => {
    if (!edit.box.contains(event.relatedTarget)) {
      panel.hidePopup();
    }
  });
  edit.box.addEventListener("keydown", event => {
    if ((event.key == "Escape" || event.key == "Enter") && open()) {
      edit.commit();
      panel.hidePopup();
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  // gleich öffnen (Aufgaben-Details: der Klick auf den Wert ist schon vorbei)
  const show = () => {
    if (!open() && isDate(io.get())) {
      showMonth(io.get());
      panel.openPopup(edit.box, "after_start", -4, 0, false, false);
    }
  };
  return { panel, show, sync: () => open() && isDate(io.get()) && showMonth(io.get()) };
}

// Thunderbirds datepicker als Text zum Eintippen mit kleinem Monatskalender:
// dessen Auswahlfeld bleibt verborgen und hält den Wert
function inlineDatePicker(win, dp) {
  const io = {
    get: () => (isDate(dp.value) ? dp.value : null),
    set: t => (dp.value = t),
    off: () => dp.hasAttribute("disabled") || dp.hidden,
  };
  const edit = inlineDateEdit(win, io);
  const mini = miniMonthPopover(win, edit, io);
  afterInputBoxValue(dp, () => {
    edit.render();
    mini.sync();
  });
  new win.MutationObserver(edit.sync).observe(dp, { attributes: true, attributeFilter: ["disabled", "hidden"] });
  dp.append(edit.box);
  dp.setAttribute("mc-inline", "");
  dp.focus = () => edit.pick(edit.segs[0]);
  // Thunderbirds eigene Datumsauswahl nie öffnen: stattdessen das Datum wählen
  dp._popup?.addEventListener("popupshowing", event => {
    if (event.target == dp._popup) {
      event.preventDefault();
      win.setTimeout(() => edit.pick(edit.segs[0]), 0);
    }
  });
  return { edit, mini };
}

function hookDateTimePickers(win) {
  for (const dtp of win.document.querySelectorAll("datetimepicker")) {
    const dp = dtp.querySelector("datepicker"), tp = dtp.querySelector("timepicker");
    const timePopup = tp?._popup;
    if (!dp?._popup || !timePopup || dtp.__mcCombined) {
      continue;
    }
    dtp.__mcCombined = true;
    // Ende: Uhrzeit vor dem Beginn am selben Tag → Folgetag; Reihenfolge so,
    // dass das Ende zwischendurch nie vor dem Beginn liegt (sonst Hinweis)
    const start = () => win.document.getElementById("event-starttime")?.value;
    const edit = inlineTimeEdit(win, tp, dtp.id != "event-endtime" ? undefined : v => {
      const s = start(), e = dtp.value;
      const t = isDate(s) && isDate(e) && !tp.hasAttribute("disabled") ? endFromTime(s, e, v) : null;
      if (!t || t.toDateString() == e.toDateString()) {
        tp.value = v;
      } else if (t > e) {
        dp.value = t;
        tp.value = v;
      } else {
        tp.value = v;
        dp.value = t;
      }
    });
    if (dtp.id == "event-endtime") {
      endTimeList(win, dtp, edit);
    }
    // Thunderbirds Stundenraster nie öffnen (Alt+↓ o. ä.): stattdessen die Stunden wählen
    timePopup.addEventListener("popupshowing", event => {
      if (event.target == timePopup) {
        event.preventDefault();
        win.setTimeout(() => edit.pick(edit.segs[0]), 0);
      }
    });
    // Datum ebenso als Text zum Eintippen, mit kleinem Monatskalender
    inlineDatePicker(win, dp);
  }
}

// ---------------------------------------------------------------------------
// Kalender: passendes Emoji vor dem Titel (nur Anzeige, der Termin bleibt
// unverändert). stems greifen auch in zusammengesetzten Wörtern
// („Geburtstagsfeier“, „Herbstferien“), words nur als ganzes Wort („Bad“
// nicht in „Badminton“). Reihenfolge: Spezielles vor Allgemeinem.
// ---------------------------------------------------------------------------
const EMOJI_PREF = "extensions.mailcards.calendarEmoji";
const EMOJI_RULES = [
  ["🎂", { stems: ["geburtstag", "birthday", "rodjendan", "rođendan"], words: ["bday"] }],
  ["🎃", { stems: ["halloween"] }],
  ["🎄", { stems: ["weihnacht", "christmas", "xmas", "nikolaus", "advent"] }],
  ["🎆", { stems: ["silvester", "new year"] }],
  ["🐣", { stems: ["ostern", "easter"] }],
  ["💍", { stems: ["hochzeit", "wedding"] }],
  ["🐾", { stems: ["tierarzt", "tierärzt"], words: ["vet"] }],
  ["🦷", { stems: ["zahnarzt", "zahnärzt", "kieferchirurg", "kieferorthop", "dentist", "zahnreinigung"] }],
  ["💉", { stems: ["impfung", "vaccin", "blutabnahme"] }],
  ["🏥", { stems: ["krankenhaus", "spital", "hospital"] }],
  // „Ordination“ nur am Wortanfang (nicht in „Koordination“)
  ["🩺", { stems: ["arzt", "ärztin", "doctor", "therapie", "physio", "untersuchung", "befund"], re: /(?<![\p{L}\p{N}])ordination/u }],
  ["💇", { stems: ["friseur", "frisör", "haircut", "beauty", "kosmetik", "maniküre", "pediküre"] }],
  ["✈️", { stems: ["flughafen", "airport", "abflug", "rückflug", "flight"], words: ["flug"] }],
  ["🚆", { stems: ["bahnhof"], words: ["zug", "bahn", "train", "öbb"] }],
  ["🏖️", { stems: ["urlaub", "ferien", "vacation", "holiday", "strand"] }],
  ["🧘", { stems: ["yoga", "pilates", "meditation"] }],
  ["🏃", { stems: ["joggen", "laufen", "marathon"], words: ["run", "lauf"] }],
  ["🏊", { stems: ["schwimm"], words: ["swim"] }],
  ["⚽", { stems: ["fußball", "fussball", "soccer"], words: ["match"] }],
  ["🎾", { stems: ["tennis", "padel"] }],
  ["⛷️", { stems: ["skifahren", "skitag", "skiurlaub"], words: ["ski"] }],
  ["🏋️", { stems: ["training", "fitness", "workout", "turnen"], words: ["gym", "sport"] }],
  ["🎓", { stems: ["sponsion", "graduation", "matura", "abschlussfeier"] }],
  ["📚", { stems: ["schule", "schul", "englisch", "mathe", "nachhilfe", "prüfung", "hausübung", "hausaufgabe", "vorlesung", "lernen", "exam"], words: ["uni", "kurs", "course"] }],
  ["🏠", { stems: ["home office", "homeoffice"] }],
  ["📞", { stems: ["telefon", "anruf"], words: ["call", "zoom", "teams", "webex", "facetime"] }],
  ["👥", { stems: ["meeting", "besprechung", "jour fixe", "standup", "workshop"] }],
  ["☕", { stems: ["kaffee", "coffee"] }],
  ["🍽️", { stems: ["mittagessen", "abendessen", "frühstück", "breakfast", "brunch", "lunch", "dinner", "restaurant"], words: ["essen"] }],
  ["🍻", { stems: ["stammtisch"], words: ["bier", "drinks", "beer"] }],
  ["🎉", { stems: ["party", "feier", "fest "] }],
  ["🎵", { stems: ["konzert", "concert", "klavier", "gitarre", "musikschule", "chorprobe"] }],
  ["🎬", { stems: ["kino", "movie"] }],
  ["🎭", { stems: ["theater", "musical"], words: ["oper"] }],
  ["⚖️", { stems: ["gericht", "anwalt", "verhandlung", "notar"] }],
  // „Steuer“ auch in „Einkommensteuer“, aber nicht in Lenkungsgremien
  // („Steuerung(sgruppe)“, „Steuerkreis“, „Steuergruppe“)
  ["💰", { stems: ["finanzamt", "steuerberat"], words: ["bank"], re: /steuer(?!ung|kreis|gruppe)/u }],
  ["🛒", { stems: ["einkauf", "shopping", "supermarkt"] }],
  ["📦", { stems: ["umzug", "paket", "lieferung"] }],
  ["🚗", { stems: ["werkstatt", "pickerl", "reifenwechsel", "autoservice"], words: ["auto"] }],
  ["🔧", { stems: ["handwerker", "installateur", "reparatur", "elektriker"] }],
  ["🛁", { stems: ["badezimmer"], words: ["bad"] }],
  ["💻", { stems: ["laptop", "computer"] }],
  ["🧹", { stems: ["putzen", "reinigung", "putzfrau"] }],
  ["👶", { stems: ["baby", "kindergarten", "kita"] }],
  ["🐶", { stems: ["hund", "gassi"] }],
].map(([emoji, { stems = [], words = [], re = null }]) => ({
  emoji,
  stems,
  // eigener Ausdruck (auf den kleingeschriebenen Titel) für Sonderfälle
  re,
  // ganze Wörter: davor und danach kein Buchstabe und keine Ziffer
  word: words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})(?![\\p{L}\\p{N}])`, "iu") : null,
}));
const HAS_EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_CUSTOM_PREF = "extensions.mailcards.emojiCustom";
const emojiCache = new Map();
// eigene Stichwörter aus den Einstellungen: je Zeile „Stichwort = Emoji“
let customEmoji = null;
function customEmojiRules() {
  if (!customEmoji) {
    customEmoji = [];
    for (const line of Services.prefs.getStringPref(EMOJI_CUSTOM_PREF, "").split(/\r?\n/)) {
      const m = line.match(/^\s*(.+?)\s*[=:]\s*(\S+)\s*$/u);
      if (m && HAS_EMOJI.test(m[2])) {
        customEmoji.push({ stem: m[1].toLocaleLowerCase(), emoji: m[2] });
      }
    }
  }
  return customEmoji;
}
function resetEmojiRules() {
  customEmoji = null;
  emojiCache.clear();
}
function emojiFor(title) {
  const text = String(title || "").trim();
  if (!text || HAS_EMOJI.test(text)) {
    return ""; // schon ein Emoji im Titel – nichts zusätzlich
  }
  if (emojiCache.has(text)) {
    return emojiCache.get(text);
  }
  const lower = text.toLocaleLowerCase();
  // eigene Stichwörter zuerst
  let found = customEmojiRules().find(r => lower.includes(r.stem))?.emoji || "";
  for (const rule of found ? [] : EMOJI_RULES) {
    if (rule.stems.some(st => lower.includes(st)) || rule.word?.test(text) || rule.re?.test(lower)) {
      found = rule.emoji;
      break;
    }
  }
  if (emojiCache.size > 2000) {
    emojiCache.clear();
  }
  emojiCache.set(text, found);
  return found;
}

// ---------------------------------------------------------------------------
// Schnellfenster: natürliche Eingabe wie bei Fantastical – „Lunch mit Anna
// morgen 12 Uhr“ → Titel „Lunch mit Anna“, morgen 12:00–13:00. Erkennt
// Deutsch und Englisch: heute/morgen/übermorgen, Wochentage, 17.10.(2026),
// 17. Oktober, Uhrzeiten (12 Uhr, 12:30, 9am), Zeiträume (10–11 Uhr,
// von 10 bis 12), Dauer (für 2 Stunden) und „ganztägig“.
// ---------------------------------------------------------------------------
const NL_MONTHS = {
  jan: 0, januar: 0, jänner: 0, january: 0, feb: 1, februar: 1, february: 1, mär: 2, märz: 2, mar: 2, march: 2,
  apr: 3, april: 3, mai: 4, may: 4, jun: 5, juni: 5, june: 5, jul: 6, juli: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, oct: 9, october: 9, nov: 10, november: 10, dez: 11, dezember: 11, dec: 11, december: 11,
};
const NL_WEEKDAYS = {
  sonntag: 0, sunday: 0, so: 0, sun: 0, montag: 1, monday: 1, mo: 1, mon: 1, dienstag: 2, tuesday: 2, di: 2, tue: 2,
  mittwoch: 3, wednesday: 3, mi: 3, wed: 3, donnerstag: 4, thursday: 4, do: 4, thu: 4,
  freitag: 5, friday: 5, fr: 5, fri: 5, samstag: 6, saturday: 6, sa: 6, sat: 6,
};
function parseNatural(text, now = new Date()) {
  let rest = ` ${text} `;
  const take = re => {
    const m = rest.match(re);
    if (m) {
      rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
    }
    return m;
  };
  const B = "(?<![\\p{L}\\p{N}])"; // Wortanfang
  const E = "(?![\\p{L}\\p{N}])"; // Wortende
  let day = null;
  let allDay = false;
  // ganztägig
  if (take(new RegExp(`${B}(ganztägig|ganztags|den ganzen tag|all[ -]?day)${E}`, "iu"))) {
    allDay = true;
  }
  const dayNames = Object.keys(NL_WEEKDAYS).filter(k => k.length > 3).join("|");
  // relative Tage („morgen“ nach einem Wochentag ist der Vormittag: „Freitag
  // morgen 8 Uhr“ – nur nach dem ganzen Wort, nach „Karfreitag“ bleibt es morgen)
  let m = take(new RegExp(`${B}(übermorgen|day after tomorrow)${E}`, "iu"));
  if (m) {
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  } else if ((m = take(new RegExp(`${B}(heute|today|(?<!${B}(?:${dayNames})\\s+)morgen|tomorrow)${E}`, "iu")))) {
    const plus = /^(morgen|tomorrow)$/i.test(m[1]) ? 1 : 0;
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + plus);
  }
  // Datum 17.10.(2026) / 17/10
  if (!day && (m = take(new RegExp(`${B}(?:am\\s+|on\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?${E}`, "iu")))) {
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) {
      y += 2000;
    }
    day = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      day.setFullYear(y + 1); // ohne Jahr: nächstes Vorkommen
    }
  }
  // 17. Oktober / Oct 17 / October 17th
  const monthNames = Object.keys(NL_MONTHS).sort((a, b) => b.length - a.length).join("|");
  if (!day && (m = take(new RegExp(`${B}(?:am\\s+|on\\s+)?(\\d{1,2})\\.?\\s*(${monthNames})\\.?(?:\\s+(\\d{4}))?${E}`, "iu")))) {
    day = new Date(m[3] ? Number(m[3]) : now.getFullYear(), NL_MONTHS[m[2].toLowerCase()], Number(m[1]));
  } else if (!day && (m = take(new RegExp(`${B}(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, "iu")))) {
    day = new Date(m[3] ? Number(m[3]) : now.getFullYear(), NL_MONTHS[m[1].toLowerCase()], Number(m[2]));
  }
  if (day && !m?.[3] && day < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !/heute|today/i.test(m?.[0] || "")) {
    day.setFullYear(day.getFullYear() + 1);
  }
  // Wochentag (nächstes Vorkommen; „nächsten Montag“ = in der nächsten Woche)
  if (!day && (m = take(new RegExp(`${B}(?:(am|on|nächsten|nächste[rn]?|next)\\s+)?(${dayNames})(?:\\s+morgens?)?${E}`, "iu")))) {
    const target = NL_WEEKDAYS[m[2].toLowerCase()];
    let diff = (target - now.getDay() + 7) % 7;
    if (diff == 0 || /^(nächst|next)/i.test(m[1] || "")) {
      diff += diff == 0 ? 7 : 0;
    }
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  }
  // Dauer (vor den Uhrzeiten, sonst wird „für 2h“ als 02:00 gelesen)
  let duration = null;
  if ((m = take(new RegExp(`${B}(?:für|for)\\s+(\\d+(?:[.,]5)?)\\s*(stunden?|std\\.?|hours?|hrs?|h|minuten|min\\.?|minutes?|mins?)${E}`, "iu")))) {
    const n = Number(m[1].replace(",", "."));
    duration = /^m/i.test(m[2]) ? n : n * 60;
  }
  // Uhrzeit: Zeitraum oder Einzelzeit
  const T = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?";
  const toMinutes = (h, min, ap) => {
    let hh = Number(h);
    if (ap && /p/i.test(ap) && hh < 12) hh += 12;
    if (ap && /a/i.test(ap) && hh == 12) hh = 0;
    return hh * 60 + Number(min || 0);
  };
  let startMin = null;
  let endMin = null;
  const range = take(new RegExp(`${B}(?:von\\s+|from\\s+|um\\s+|at\\s+)?${T}\\s*(?:-|–|bis|to|until)\\s*${T}\\s*(?:uhr|h)?${E}`, "iu"));
  if (range) {
    startMin = toMinutes(range[1], range[2], range[3]);
    endMin = toMinutes(range[4], range[5], range[6]);
    // „11-12am“ meint umgangssprachlich bis Mittag, nicht bis Mitternacht
    if (!range[3] && /^a/i.test(range[6]) && endMin == 0) {
      endMin = 12 * 60;
    }
    // nur das Ende hat am/pm: der Beginn übernimmt es, wenn er dann vor dem Ende
    // liegt („2-4pm“ → 14–16 Uhr, aber „11-1pm“ → 11–13 Uhr)
    if (!range[3] && range[6] && toMinutes(range[1], range[2], range[6]) < endMin) {
      startMin = toMinutes(range[1], range[2], range[6]);
    }
    // nur das Ende hat „am“ und liegt nach Mitternacht: der Beginn ist am
    // Abend davor („11-1am“ → 23–1 Uhr, nicht 11 Uhr bis 1 Uhr nachts)
    if (!range[3] && /^a/i.test(range[6] || "") && startMin > endMin) {
      const pm = toMinutes(range[1], range[2], "pm");
      if (pm > endMin) {
        startMin = pm;
      }
    }
  } else if ((m = take(new RegExp(`${B}(?:um\\s+|at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr|h)${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2]);
  } else if ((m = take(new RegExp(`${B}(?:um\\s+|at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2], m[3]);
  } else if ((m = take(new RegExp(`${B}(?:um|at)\\s+(\\d{1,2})(?:[:.](\\d{2}))?${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2]);
  } else if ((m = take(new RegExp(`${B}(\\d{1,2})[:](\\d{2})${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2]);
  }
  if (startMin != null && (startMin >= 24 * 60 || (endMin != null && endMin >= 24 * 60))) {
    return { title: text.trim() }; // keine gültige Uhrzeit – nichts erkannt
  }
  if (day == null && startMin == null && !allDay) {
    return { title: text.trim() };
  }
  // Füllwörter am Rand entfernen („am“, „um“, „on“, „at“)
  const title = rest.replace(new RegExp(`${B}(am|um|on|at|von|from)\\s*$`, "iu"), "")
    .replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
  const base = day || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Dauer ohne Uhrzeit („Meeting morgen für 2h“): nicht ganztägig, die
  // Uhrzeit kommt aus der Vorbelegung des Schnellfensters
  const result = { title: title || text.trim(), allDay: allDay || (startMin == null && !!day && duration == null) };
  if (duration != null) {
    result.duration = duration;
  }
  if (!result.allDay && startMin != null) {
    result.start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(startMin / 60), startMin % 60);
    let end = endMin != null ? endMin : startMin + (duration ?? 60);
    if (endMin != null && end <= startMin) {
      // Ende vor dem Beginn: „9-5“ → 17:00, „22-2 Uhr“ → 02:00 am Folgetag;
      // 12-Stunden-Lesart nur bei Beginn bis Mittag („18-7 Uhr“ endet um 7 Uhr früh)
      end += !range[6] && startMin < 13 * 60 && end < 12 * 60 && end + 12 * 60 > startMin ? 12 * 60 : 24 * 60;
    }
    result.end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(end / 60), end % 60);
    if (result.end <= result.start) {
      result.end = new Date(result.start.getTime() + 3600 * 1000);
    }
  } else {
    result.start = base;
  }
  return result;
}
