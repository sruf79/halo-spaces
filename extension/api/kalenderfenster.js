/* halo.spaces – Kalender (Teil der Experiment-API mailCards).
 *
 * Methoden von CardEnhancer, ausgelagert aus implementation.js: Schnellfenster
 * (openQuickCreate), Agenda (hookAgendaMonthRange …), Today-Pane
 * (animateTodayPane, syncTodayModes, todayPaneEverywhere …) und Termin-,
 * Erinnerungs- und Übersichtsdialoge (tidyEventDialog, fitAlarmDialog,
 * fitSummaryDialog …). Sie stehen hier in der Klasse EnhancerKalender;
 * implementation.js lädt diese Datei mit loadPart() direkt nach CardEnhancer
 * und hängt die Methoden unverändert an CardEnhancer.prototype an (this ist
 * also weiter der CardEnhancer). Zur Ladezeit nur Namen nutzen, die vorher
 * schon da sind; alles andere erst zur Laufzeit. Reihe „Code: implementation.js
 * in Module zerlegen“ 8/8.
 */

"use strict";

class EnhancerKalender {
  // ---------------------------------------------------------------------------
  // Schnellfenster „Neuer Termin / Neue Aufgabe“ wie in Apple Kalender: ein
  // Popover am „+“ mit den wichtigsten Feldern; „Mehr Optionen …“ öffnet
  // Thunderbirds großes Fenster mit allen Eingaben. Gespeichert wird über
  // Thunderbirds eigene Transaktion (damit „Rückgängig“ funktioniert).
  // ---------------------------------------------------------------------------
  // preset (Doppelklick im Kalender): { start: Date, allDay, at: {x, y} (Bildschirm), calendar }
  openQuickCreate(w, mode = "event", anchor = null, preset = null) {
    const d = w.document;
    const X = "http://www.w3.org/1999/xhtml";
    const locale = regionLocale();
    let cal, CalEvent, CalTodo, CalAlarm, CalRecurrenceInfo;
    try {
      ({ cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs"));
      ({ CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs"));
      ({ CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs"));
      ({ CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs"));
      ({ CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs"));
    } catch (e) {
      log("quick create import error", String(e).slice(0, 160));
      w.goDoCommand(mode == "task" ? "calendar_new_todo_command" : "calendar_new_event_command");
      return;
    }
    const el = (tag, props = {}, ...kids) => {
      const node = d.createElementNS(X, tag);
      for (const [k, v] of Object.entries(props)) {
        if (k == "class") {
          node.className = v;
        } else if (k in node && typeof v != "string") {
          node[k] = v;
        } else {
          node.setAttribute(k, v);
        }
      }
      node.append(...kids);
      return node;
    };
    const pad = n => String(n).padStart(2, "0");
    const dateValue = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const timeValue = dt => `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const parse = (dateStr, timeStr) => {
      const [y, m, day] = (dateStr || "").split("-").map(Number);
      const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
      return y ? laterHour(new Date(y, m - 1, day, hh || 0, mm || 0)) : null;
    };
    // Uhrzeit in der doppelten Stunde (Ende der Sommerzeit): die zweite, wie der
    // Kalender selbst sie speichert (Wanduhrzeit mit Zeitzone) – sonst wäre der
    // angelegte Termin eine Stunde kürzer als im Schnellfenster angezeigt
    function laterHour(dt) {
      const next = new Date(dt.getTime() + 3600000);
      return next.getHours() == dt.getHours() && next.getMinutes() == dt.getMinutes() ? next : dt;
    }
    // Dauer als echte Dauer rechnen (wie Apple Kalender): „2 Stunden“ bleiben auch über
    // die Zeitumstellung zwei echte Stunden. Weil die
    // Felder nur Wanduhrzeit zeigen, merkt sich jedes Feldpaar den genauen Zeitpunkt
    // (die doppelte Stunde wäre sonst mehrdeutig) und nutzt ihn, solange die Felder passen
    const plusMinutes = (dt, min) => new Date(dt.getTime() + min * 60000);
    const setWhen = (di, ti, dt) => {
      di.value = dateValue(dt);
      ti.value = timeValue(dt);
      di.__mcExact = dt;
    };
    const when = (di, ti, time = ti.value) => {
      const x = di.__mcExact;
      return x && dateValue(x) == di.value && timeValue(x) == time ? x : parse(di.value, time);
    };
    const fmtDate = systemDateFormat();
    const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    const toCal = (js, dateOnly) => {
      const dt = cal.dtz.jsDateToDateTime(js, cal.dtz.defaultTimezone);
      if (dateOnly) {
        dt.isDate = true;
      }
      return dt;
    };

    let panel = d.getElementById("mcQuickPanel");
    if (!panel) {
      panel = d.createXULElement("panel");
      panel.id = "mcQuickPanel";
      panel.setAttribute("type", "arrow");
      const f = {};
      f.segEvent = el("button", { type: "button", "data-mode": "event" }, tr("Event"));
      f.segTask = el("button", { type: "button", "data-mode": "task" }, tr("Task"));
      f.title = el("input", { class: "mc-qc-title", type: "text" });
      f.line1 = el("div", { class: "mc-qc-line1" });
      f.line2 = el("div", { class: "mc-qc-line2" });
      f.summary = el("div", { class: "mc-qc-summary", tabindex: "0" }, f.line1, f.line2);
      f.allDay = el("input", { type: "checkbox" });
      f.startDate = el("input", { type: "date" });
      f.startTime = el("input", { type: "time" });
      f.endDate = el("input", { type: "date" });
      f.endTime = el("input", { type: "time" });
      f.hasDue = el("input", { type: "checkbox" });
      f.dueDate = el("input", { type: "date" });
      f.dueTime = el("input", { type: "time" });
      const options = (pairs) => pairs.map(([v, label]) => el("option", { value: v }, label));
      f.repeat = el("select", {}, ...options([
        ["", tr("Never")], ["DAILY", tr("Every Day")], ["WEEKLY", tr("Every Week")],
        ["MONTHLY", tr("Every Month")], ["YEARLY", tr("Every Year")], ["CUSTOM", tr("Custom…")],
      ]));
      f.alert = el("select", {}, ...options([
        ["", tr("None")], ["PT0M", tr("At time of event")], ["PT5M", tr("5 minutes before")],
        ["PT15M", tr("15 minutes before")], ["PT30M", tr("30 minutes before")],
        ["PT1H", tr("1 hour before")], ["P1D", tr("1 day before")], ["CUSTOM", tr("Custom…")],
      ]));
      f.showAs = el("select", {}, ...options([["OPAQUE", tr("Busy")], ["TRANSPARENT", tr("Free")]]));
      const row = (label, cls, ...ctrls) => el("div", { class: `mc-qc-row ${cls || ""}` }, el("label", {}, label), el("div", { class: "mc-qc-ctrl" }, ...ctrls));
      f.details = el("div", { class: "mc-qc-details" },
        row(tr("All Day"), "mc-ev", f.allDay),
        row(tr("Starts"), "mc-ev", f.startDate, f.startTime),
        row(tr("Ends"), "mc-ev", f.endDate, f.endTime),
        row(tr("Due"), "mc-td", f.hasDue, f.dueDate, f.dueTime),
        row(tr("Repeat"), "mc-ev", f.repeat),
        row(tr("Alert"), "", f.alert),
        row(tr("Show As"), "mc-ev", f.showAs),
      );
      f.time = el("div", { class: "mc-qc-time mc-qc-card" }, f.summary, f.details);
      f.main = el("div", { class: "mc-qc-main" }, el("div", { class: "mc-qc-card mc-qc-titlecard" }, f.title), f.time);
      f.location = el("input", { class: "mc-qc-card mc-qc-field mc-ev-only", type: "text", placeholder: tr("Add Location") });
      f.invitees = el("button", { type: "button", class: "mc-qc-card mc-qc-field mc-qc-placeholder mc-ev-only" }, tr("Add Invitees…"));
      f.calendar = el("select", { class: "mc-qc-calsel" });
      f.calCard = el("div", { class: "mc-qc-card mc-qc-field mc-qc-calcard" }, f.calendar);
      f.notes = el("textarea", { class: "mc-qc-card mc-qc-field", rows: "2", placeholder: tr("Add Notes or URL") });
      f.more = el("button", { type: "button", class: "mc-qc-link" }, tr("More Options…"));
      f.cancel = el("button", { type: "button", class: "mc-qc-btn" }, tr("Cancel"));
      f.add = el("button", { type: "button", class: "mc-qc-btn mc-qc-primary" }, tr("Add"));
      const root = el("div", { class: "mc-qc" },
        el("div", { class: "mc-qc-seg" }, f.segEvent, f.segTask),
        f.main, f.location, f.invitees, f.calCard, f.notes,
        el("div", { class: "mc-qc-footer" }, f.more, el("span", { class: "mc-qc-spacer" }), f.cancel, f.add),
      );
      panel.append(root);
      (d.getElementById("mainPopupSet") || d.documentElement).append(panel);
      panel.__mc = f;
      this.restorers.push(() => panel.remove());

      // --- Verhalten ---
      const state = { mode: "event" };
      panel.__mcState = state;
      const writable = c => {
        try {
          return cal.acl.isCalendarWritable(c) && cal.acl.userCanAddItemsToCalendar(c);
        } catch {
          return !c.readOnly;
        }
      };
      const calendars = () => cal.manager.getCalendars().filter(c =>
        writable(c) && !c.getProperty("disabled") &&
        (state.mode == "task" ? c.getProperty("capabilities.tasks.supported") !== false
          : c.getProperty("capabilities.events.supported") !== false));
      const color = c => c?.getProperty("color") || "#8E8E93";
      const fillCalendars = () => {
        const list = calendars();
        const current = f.calendar.value;
        f.calendar.replaceChildren(...list.map(c => el("option", { value: c.id }, c.name)));
        let def = null;
        try {
          def = w.getSelectedCalendar?.();
        } catch {} // gewollt: kein gewählter Kalender, der erste gilt
        f.calendar.value = list.some(c => c.id == current) ? current : (list.some(c => c.id == def?.id) ? def.id : list[0]?.id || "");
        // kein passender Kalender (z. B. keiner kann Aufgaben): sagen statt still nichts tun
        if (!list.length) {
          f.calendar.replaceChildren(el("option", { value: "" },
            state.mode == "task" ? tr("No calendar for tasks") : tr("No writable calendar")));
        }
        f.add.disabled = !list.length;
        f.more.disabled = !list.length;
        updateColor();
      };
      const selectedCalendar = () => cal.manager.getCalendarById(f.calendar.value);
      const updateColor = () => {
        root.style.setProperty("--mc-qc-color", color(selectedCalendar()));
        panel.__mcGhost?.style.setProperty("--mc-ghost-color", color(selectedCalendar()));
      };
      const updateSummary = () => {
        if (state.mode == "task") {
          // Erinnerung braucht eine Fälligkeit (sonst ginge sie beim Anlegen verloren)
          if (f.alert.value && !f.hasDue.checked) {
            f.hasDue.checked = true;
            root.toggleAttribute("data-due", true);
          }
          const due = f.hasDue.checked ? parse(f.dueDate.value, f.dueTime.value) : null;
          f.line1.textContent = due ? `${tr("Due")} ${fmtDate.format(due)} ${fmtTime.format(due)}` : tr("No Due Date");
          f.line2.textContent = f.alert.value ? chosen(f.alert) : tr("Add Due Date or Alert");
          return;
        }
        const s = parse(f.startDate.value, f.startTime.value);
        const e = parse(f.endDate.value, f.endTime.value);
        if (!s) {
          f.line1.textContent = "";
        } else if (f.allDay.checked) {
          const sameDay = !e || f.startDate.value == f.endDate.value;
          f.line1.textContent = sameDay ? `${fmtDate.format(s)}  ${tr("all-day")}` : `${fmtDate.format(s)} – ${fmtDate.format(e)}`;
        } else {
          const sameDay = e && f.startDate.value == f.endDate.value;
          f.line1.textContent = sameDay
            ? `${fmtDate.format(s)}  ${fmtTime.format(s)} – ${fmtTime.format(e)}`
            : `${fmtDate.format(s)} ${fmtTime.format(s)} – ${e ? `${fmtDate.format(e)} ${fmtTime.format(e)}` : ""}`;
        }
        const set = [f.repeat, f.alert].filter(x => x.value).map(chosen);
        f.line2.textContent = set.length ? set.join(" · ") : tr("Add Alert or Repeat");
      };
      // gewählte Wiederholung/Erinnerung als Text („Wöchentlich · 15 Minuten vorher“)
      function chosen(select) {
        const label = select.selectedOptions[0]?.textContent || "";
        return select == f.alert ? `${tr("Alert")}: ${label}` : label;
      }
      // „Custom…“ bei Wiederholung und Erinnerung: Thunderbirds eigene Dialoge
      // (wie im großen Fenster); Abbrechen lässt die vorige Auswahl stehen
      const customOption = select => select.querySelector('option[value="CUSTOM"]');
      const resetCustom = () => {
        panel.__mcRecurrence = null;
        panel.__mcAlarms = null;
        customOption(f.repeat).textContent = tr("Custom…");
        customOption(f.alert).textContent = tr("Custom…");
      };
      panel.__mcResetCustom = resetCustom;
      const modal = (url, args) => {
        // das Fenster bleibt offen, während der Dialog den Fokus hat
        panel.setAttribute("noautohide", "true");
        try {
          w.openDialog(url, "_blank", "chrome,titlebar,modal,resizable,centerscreen", args);
        } finally {
          panel.removeAttribute("noautohide");
        }
      };
      const lastChoice = new WeakMap([[f.repeat, ""], [f.alert, ""]]);
      for (const input of [f.repeat, f.alert]) {
        input.addEventListener("change", () => {
          if (input.value == "CUSTOM") {
            const draft = buildItem({ plain: true }).item;
            let ok = false;
            if (input == f.repeat) {
              modal("chrome://calendar/content/calendar-event-dialog-recurrence.xhtml", {
                calendarEvent: draft,
                recurrenceInfo: panel.__mcRecurrence || null,
                startTime: draft.startDate,
                endTime: draft.endDate,
                onOk: info => {
                  panel.__mcRecurrence = info;
                  ok = !!info;
                },
              });
              if (ok) {
                const { recurrenceRule2String } = ChromeUtils.importESModule("resource:///modules/calendar/calRecurrenceUtils.sys.mjs");
                // nur die erste Zeile („Occurs every 2 weeks“), ohne Beginn und Uhrzeit
                const text = recurrenceRule2String(panel.__mcRecurrence, draft.startDate, draft.endDate, draft.startDate.isDate) || "";
                customOption(f.repeat).textContent = text.split("\n")[0].replace(/[.,;:]\s*$/, "").trim() || tr("Custom…");
              }
            } else {
              modal("chrome://calendar/content/calendar-event-dialog-reminder.xhtml", {
                reminders: panel.__mcAlarms || [],
                item: draft,
                timezone: cal.dtz.defaultTimezone,
                calendar: selectedCalendar(),
                onOk: reminders => {
                  panel.__mcAlarms = reminders;
                  ok = reminders.length > 0;
                },
                onCancel() {},
              });
              if (ok) {
                const alarms = panel.__mcAlarms;
                customOption(f.alert).textContent = alarms.length == 1
                  ? alarms[0].toString(draft)
                  : tr("{n} alerts", { n: alarms.length });
              }
            }
            if (!ok) {
              input.value = lastChoice.get(input);
            }
          }
          lastChoice.set(input, input.value);
          updateSummary();
        });
      }
      const setMode = m => {
        state.mode = m;
        root.dataset.mode = m;
        f.segEvent.toggleAttribute("selected", m == "event");
        f.segTask.toggleAttribute("selected", m == "task");
        f.title.placeholder = m == "task" ? tr("New Task") : tr("New Event");
        fillCalendars();
        updateSummary();
        panel.__mcApplyNatural?.();
      };
      panel.__mcSetMode = setMode;
      // Aufgabe statt Termin: kein vorläufiger Termin im Tag
      for (const seg of [f.segEvent, f.segTask]) {
        seg.addEventListener("click", () => {
          if (state.mode == "task" && panel.__mcGhost) {
            panel.__mcGhost.remove();
            panel.__mcGhost = null;
            panel.removeAttribute("mc-tip");
          }
        });
      }
      panel.__mcUpdate = updateSummary;
      panel.__mcFillCalendars = fillCalendars;
      f.segEvent.addEventListener("click", () => setMode("event"));
      f.segTask.addEventListener("click", () => setMode("task"));
      const expand = () => {
        root.toggleAttribute("data-expanded", true);
      };
      f.summary.addEventListener("click", expand);
      f.summary.addEventListener("keydown", e => (e.key == "Enter" || e.key == " ") && expand());
      f.allDay.addEventListener("change", () => {
        root.toggleAttribute("data-allday", f.allDay.checked);
        updateSummary();
      });
      // Beginn verschoben → Ende mitschieben (gleiche Dauer)
      let lastStart = null;
      const onStart = () => {
        const s = when(f.startDate, f.startTime);
        const e = when(f.endDate, f.endTime);
        if (s && e && lastStart) {
          setWhen(f.endDate, f.endTime, new Date(e.getTime() + (s - lastStart)));
        }
        lastStart = s;
        updateSummary();
      };
      panel.__mcSetLastStart = v => (lastStart = v);
      for (const input of [f.startDate, f.startTime]) {
        input.addEventListener("change", onStart);
      }
      for (const input of [f.endDate, f.endTime, f.dueDate, f.dueTime]) {
        input.addEventListener("change", updateSummary);
      }
      f.hasDue.addEventListener("change", () => {
        root.toggleAttribute("data-due", f.hasDue.checked);
        if (!f.hasDue.checked) {
          f.alert.value = "";
        }
        updateSummary();
      });
      f.calendar.addEventListener("change", updateColor);

      // Natürliche Eingabe: Datum/Uhrzeit aus dem Titel übernehmen, solange
      // sie nicht von Hand geändert wurden; der Titel wird ohne sie angelegt
      for (const input of [f.allDay, f.startDate, f.startTime, f.endDate, f.endTime, f.hasDue, f.dueDate, f.dueTime]) {
        input.addEventListener("change", event => {
          if (event.isTrusted) {
            panel.__mcManualTime = true;
          }
        });
      }
      // Datum und Uhrzeit wie im Termin-Dialog als Text zum Eintippen, das
      // Datum mit kleinem Monatskalender; die Eingabefelder bleiben verborgen
      // und halten den Wert („JJJJ-MM-TT“ bzw. „hh:mm“)
      const valueDesc = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value");
      const textField = (input, kind) => {
        let after = () => {};
        // neuer Wert (auch aus dem Code, z. B. natürliche Eingabe): neu zeichnen
        Object.defineProperty(input, "value", {
          configurable: true,
          get() {
            return valueDesc.get.call(this);
          },
          set(v) {
            valueDesc.set.call(this, v);
            after();
          },
        });
        const put = v => {
          if (input.value == v) {
            return;
          }
          input.value = v;
          // von Hand geändert (das Ereignis unten gilt nicht als echte Eingabe)
          panel.__mcManualTime = true;
          input.dispatchEvent(new w.Event("change", { bubbles: true }));
        };
        const off = () => false;
        if (kind == "date") {
          const io = {
            get: () => {
              const [y, m, day] = (input.value || "").split("-").map(Number);
              if (!y) {
                return null;
              }
              const t = new Date(2000, 0, 1);
              t.setFullYear(y, m - 1, day);
              return t;
            },
            set: t => put(dateValue(t)),
            off,
          };
          const edit = inlineDateEdit(w, io), mini = miniMonthPopover(w, edit, io, panel);
          this.restorers.push(() => mini.panel.remove());
          after = () => {
            edit.render();
            mini.sync();
          };
          input.after(edit.box);
        } else {
          const edit = timeSegEdit(w, {
            get: () => {
              const [h, m] = (input.value || "").split(":").map(Number);
              return Number.isInteger(h) && Number.isInteger(m) ? [h, m] : null;
            },
            set: ([h, m]) => {
              // Ende vor dem Beginn am selben Tag → Folgetag (wie im Termin-Dialog)
              const s = when(f.startDate, f.startTime), e = when(f.endDate, f.endTime);
              if (input == f.endTime && !f.allDay.checked && s && e) {
                const day = dateValue(endFromTime(s, e, [h, m]));
                if (day != f.endDate.value) {
                  f.endDate.value = day;
                  f.endDate.dispatchEvent(new w.Event("change", { bubbles: true }));
                }
              }
              put(`${pad(h)}:${pad(m)}`);
            },
            off,
          });
          after = () => edit.render();
          input.after(edit.box);
          // Ende: Klick zeigt die Liste mit Halbstunden und Dauer wie im Termin-Dialog
          if (input == f.endTime) {
            const list = endTimeMenu(w, edit, {
              start: () => when(f.startDate, f.startTime),
              end: () => when(f.endDate, f.endTime),
              set: t => {
                const day = dateValue(t);
                if (day != f.endDate.value) {
                  f.endDate.value = day;
                  panel.__mcManualTime = true;
                  f.endDate.dispatchEvent(new w.Event("change", { bubbles: true }));
                }
                put(timeValue(t));
                f.endDate.__mcExact = t;
              },
              usable: () => !f.allDay.checked && !!when(f.startDate, f.startTime) && !!when(f.endDate, f.endTime),
            }, panel);
            this.restorers.push(() => list.remove());
            after = () => {
              edit.render();
              list.__mcRefill();
            };
          }
        }
        input.setAttribute("mc-inline", "");
        after();
      };
      for (const input of [f.startDate, f.endDate, f.dueDate]) {
        textField(input, "date");
      }
      for (const input of [f.startTime, f.endTime, f.dueTime]) {
        textField(input, "time");
      }
      const applyNatural = () => {
        if (panel.__mcManualTime) {
          return;
        }
        const r = parseNatural(f.title.value);
        const def = panel.__mcDefaults;
        panel.__mcParsed = r.start ? r : null;
        let start = r.start || def.start;
        let end = r.end || (r.allDay ? start : plusMinutes(start, 60));
        // nur Tag und Dauer erkannt: Uhrzeit wie vorbelegt, Ende nach der Dauer
        if (r.start && !r.allDay && !r.end && r.duration != null) {
          start = laterHour(new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate(), def.start.getHours(), def.start.getMinutes()));
          end = plusMinutes(start, r.duration);
        } else if (r.start && !r.allDay && r.duration != null) {
          start = laterHour(r.start);
          end = plusMinutes(start, r.duration);
        }
        const allDay = r.start ? !!r.allDay : def.allDay;
        if (state.mode == "task") {
          f.hasDue.checked = !!r.start || def.hasDue;
          root.toggleAttribute("data-due", f.hasDue.checked);
          f.dueDate.value = dateValue(start);
          if (!r.allDay) {
            f.dueTime.value = timeValue(start);
          }
        } else {
          f.allDay.checked = allDay;
          root.toggleAttribute("data-allday", allDay);
          const timed = r.start && !r.allDay;
          setWhen(f.startDate, f.startTime, timed || !r.start ? start : laterHour(new Date(start.getFullYear(), start.getMonth(), start.getDate(), def.start.getHours(), def.start.getMinutes())));
          setWhen(f.endDate, f.endTime, timed ? end : allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), def.end.getHours(), def.end.getMinutes()) : def.end);
          panel.__mcSetLastStart(when(f.startDate, f.startTime));
        }
        updateSummary();
      };
      panel.__mcApplyNatural = applyNatural;
      f.title.addEventListener("input", applyNatural);
      // vorläufiger Termin im Tag zeigt den Titel gleich mit
      f.title.addEventListener("input", () => {
        const name = panel.__mcGhost?.querySelector(".mc-ghost-title");
        if (name) {
          name.textContent = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Event");
        }
      });
      // zu (Abbrechen, Esc, Klick daneben): vorläufigen Termin entfernen – nach
      // „Add“ erst, wenn der echte Termin da ist (sonst kurz eine Lücke)
      panel.addEventListener("popuphidden", event => {
        if (event.target != panel) {
          return;
        }
        panel.removeAttribute("mc-tip");
        const ghost = panel.__mcGhost;
        panel.__mcGhost = null;
        if (ghost) {
          (panel.__mcAdding || Promise.resolve()).finally(() => ghost.remove());
        }
      });

      // Eigenes Menü statt der Auswahlliste von macOS: dort gibt es keine
      // Farben pro Eintrag – hier steht vor jedem Kalender sein Farbpunkt
      const dot = c => `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color(c)}"/></svg>`)}`;
      const calMenu = d.createXULElement("menupopup");
      calMenu.id = "mcQuickCalMenu";
      panel.append(calMenu);
      const openCalMenu = () => {
        if (!calendars().length) {
          return;
        }
        const current = f.calendar.value;
        calMenu.replaceChildren(...calendars().map(c => {
          const item = d.createXULElement("menuitem");
          item.className = "menuitem-iconic";
          item.setAttribute("label", c.name);
          item.setAttribute("image", dot(c));
          const note = calendarNote(c);
          if (note) {
            item.setAttribute("tooltiptext", note);
          }
          if (c.id == current) {
            item.setAttribute("mc-current", "true");
          }
          item.addEventListener("command", () => {
            f.calendar.value = c.id;
            f.calendar.dispatchEvent(new w.Event("change", { bubbles: true }));
          });
          return item;
        }));
        calMenu.style.minWidth = `${Math.round(f.calCard.getBoundingClientRect().width)}px`;
        calMenu.openPopup(f.calCard, "after_start", 0, 2);
      };
      f.calendar.addEventListener("mousedown", event => {
        if (event.button == 0) {
          event.preventDefault();
          openCalMenu();
        }
      });
      f.calendar.addEventListener("keydown", event => {
        if ([" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          openCalMenu();
        }
      });

      const buildItem = ({ plain = false } = {}) => {
        const calendar = selectedCalendar();
        let item;
        if (state.mode == "task") {
          item = new CalTodo();
          item.title = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Task");
          if (f.hasDue.checked) {
            const due = parse(f.dueDate.value, f.dueTime.value);
            if (due) {
              item.dueDate = toCal(due, false);
            }
          }
        } else {
          item = new CalEvent();
          item.title = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Event");
          let s = when(f.startDate, f.startTime, f.allDay.checked ? "00:00" : f.startTime.value) || new Date();
          let e = when(f.endDate, f.endTime, f.allDay.checked ? "00:00" : f.endTime.value);
          if (f.allDay.checked) {
            // Ende vor dem Beginn: ein Tag am Beginn
            const last = e && e >= s ? e : s;
            e = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
          } else if (!e || e <= s) {
            e = plusMinutes(s, 60);
          }
          item.startDate = toCal(s, f.allDay.checked);
          item.endDate = toCal(e, f.allDay.checked);
          const loc = f.location.value.trim();
          if (loc) {
            item.setProperty("LOCATION", loc);
          }
          item.setProperty("TRANSP", f.showAs.value);
          if (!plain && f.repeat.value == "CUSTOM" && panel.__mcRecurrence) {
            const info = panel.__mcRecurrence.clone();
            info.item = item;
            item.recurrenceInfo = info;
          } else if (!plain && f.repeat.value && f.repeat.value != "CUSTOM") {
            const info = new CalRecurrenceInfo(item);
            const rule = cal.createRecurrenceRule();
            rule.type = f.repeat.value;
            rule.interval = 1;
            info.appendRecurrenceItem(rule);
            item.recurrenceInfo = info;
          }
        }
        const notes = f.notes.value.trim();
        if (notes) {
          item.setProperty("DESCRIPTION", notes);
        }
        if (!plain && f.alert.value == "CUSTOM" && panel.__mcAlarms) {
          for (const alarm of panel.__mcAlarms) {
            item.addAlarm(alarm.clone());
          }
        } else if (!plain && f.alert.value && f.alert.value != "CUSTOM" && (state.mode == "event" || item.dueDate)) {
          const alarm = new CalAlarm();
          alarm.related = state.mode == "task" ? Ci.calIAlarm.ALARM_RELATED_END : Ci.calIAlarm.ALARM_RELATED_START;
          const offset = cal.createDuration(f.alert.value);
          offset.isNegative = f.alert.value != "PT0M";
          alarm.offset = offset;
          alarm.action = "DISPLAY";
          item.addAlarm(alarm);
        }
        item.calendar = calendar;
        return { item, calendar };
      };
      const add = async () => {
        const { item, calendar } = buildItem();
        if (!calendar) {
          return;
        }
        // (vor dem Schließen: der vorläufige Termin bleibt, bis der echte da ist)
        let added;
        panel.__mcAdding = new Promise(resolve => (added = resolve));
        panel.hidePopup();
        try {
          await w.doTransaction("add", item, calendar, null, null);
        } catch (e) {
          log("quick create add error", String(e).slice(0, 160));
        } finally {
          added();
          panel.__mcAdding = null;
        }
      };
      const more = () => {
        const { item, calendar } = buildItem();
        panel.hidePopup();
        try {
          if (state.mode == "task") {
            w.createTodoWithDialog(calendar, null, null, item);
          } else {
            w.createEventWithDialog(calendar, null, null, null, item);
          }
        } catch (e) {
          log("quick create dialog error", String(e).slice(0, 160));
        }
      };
      f.add.addEventListener("click", add);
      f.more.addEventListener("click", more);
      f.invitees.addEventListener("click", more);
      f.cancel.addEventListener("click", () => panel.hidePopup());
      root.addEventListener("keydown", e => {
        if (e.key == "Enter" && !e.isComposing && e.target.localName == "input" && e.target.type == "text") {
          e.preventDefault();
          add();
        }
      });
    }

    // --- Vorbelegen und öffnen ---
    const f = panel.__mc;
    const root = panel.firstElementChild;
    root.removeAttribute("data-expanded");
    root.removeAttribute("data-allday");
    root.removeAttribute("data-due");
    f.title.value = "";
    f.location.value = "";
    f.notes.value = "";
    f.allDay.checked = false;
    f.hasDue.checked = false;
    f.repeat.value = "";
    f.alert.value = "";
    panel.__mcResetCustom?.();
    f.showAs.value = "OPAQUE";
    // Tag: in der Today-Pane der dort gewählte Tag, sonst heute; Beginn zur
    // nächsten vollen Stunde, eine Stunde lang
    const now = new Date();
    let day = now;
    try {
      const ts = w.TodayPane?.start;
      if (anchor?.id == "todaypane-new-event-button" && ts) {
        day = new Date(ts.year, ts.month, ts.day, now.getHours(), now.getMinutes());
      }
    } catch {} // gewollt: Beginn der Today-Pane nicht lesbar, es gilt heute
    // ein anderer Tag als heute bleibt auch nach 23 Uhr dieser Tag (23:00 statt
    // 0:00 am Folgetag); heute – auch per „+“ der Today-Pane – wie bisher 0:00 am
    // Folgetag statt eines Beginns in der Vergangenheit (Datum vergleichen, die
    // Today-Pane liefert ein eigenes Date-Objekt)
    const nextHour = Math.min(now.getHours() + 1, 23);
    const isToday = day.getFullYear() == now.getFullYear() && day.getMonth() == now.getMonth() && day.getDate() == now.getDate();
    let start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), isToday ? now.getHours() + 1 : nextHour, 0);
    if (preset?.start) {
      start = preset.allDay
        ? new Date(preset.start.getFullYear(), preset.start.getMonth(), preset.start.getDate(), nextHour, 0)
        : new Date(preset.start);
    }
    start = laterHour(start);
    const end = plusMinutes(start, 60);
    if (preset?.allDay) {
      f.allDay.checked = true;
      root.toggleAttribute("data-allday", true);
    }
    setWhen(f.startDate, f.startTime, start);
    setWhen(f.endDate, f.endTime, end);
    f.dueDate.value = dateValue(start);
    f.dueTime.value = timeValue(start);
    panel.__mcSetLastStart(start);
    // Ausgangswerte für die natürliche Eingabe (zurück, wenn „morgen“ wieder gelöscht wird)
    panel.__mcDefaults = { start, end, allDay: !!preset?.allDay, hasDue: false };
    panel.__mcParsed = null;
    panel.__mcManualTime = false;
    panel.__mcSetMode(mode);
    // Kalender, in den doppelgeklickt wurde (sonst der ausgewählte)
    if (preset?.calendar?.id && [...f.calendar.options].some(o => o.value == preset.calendar.id)) {
      f.calendar.value = preset.calendar.id;
      f.calendar.dispatchEvent(new w.Event("change", { bubbles: true }));
    }
    // Das Fenster ist 380 px breit. Thunderbird schiebt es am Bildschirmrand
    // nicht zurück, sondern drückt es zusammen (rechts abgeschnitten) – daher
    // selbst so weit nach links rücken, dass es ganz ins Fenster und auf den
    // Bildschirm passt (z. B. unter dem „+“ ganz rechts in der Today-Pane)
    const PANEL_W = 380;
    const screenRight = w.screen.availLeft + w.screen.availWidth;
    panel.__mcPlaced = null;
    // wie Apple Kalender: Doppelklick legt sofort sichtbar einen vorläufigen
    // Termin „New Event“ im Tag an (in der Farbe des Kalenders, kein echter
    // Termin bis „Add“); der Dialog zeigt mit einer Spitze darauf
    panel.__mcGhost?.remove();
    panel.__mcGhost = null;
    const ghostCell = mode == "event" && preset?.at?.rect && preset.at.cell?.isConnected ? preset.at.cell : null;
    if (ghostCell) {
      try {
        const gd = ghostCell.ownerDocument;
        const li = gd.createElementNS(X, "li");
        li.className = "mc-qc-ghost";
        const name = gd.createElementNS(X, "span");
        name.className = "mc-ghost-title";
        name.textContent = tr("New Event");
        li.append(name);
        const start = f.startDate.value ? when(f.startDate, f.startTime) : null;
        if (start && !f.allDay.checked) {
          const time = gd.createElementNS(X, "span");
          time.className = "mc-ghost-time";
          time.textContent = fmtTime.format(start);
          li.append(time);
        }
        li.style.setProperty("--mc-ghost-color", f.calendar.value ? (cal.manager.getCalendarById(f.calendar.value)?.getProperty("color") || "#8E8E93") : "#8E8E93");
        if (ghostCell.localName == "calendar-month-day-box") {
          li.classList.add("calendar-month-day-box-list-item");
          ghostCell.dayList?.prepend(li);
        } else if (ghostCell.localName == "calendar-event-column" && start && !f.allDay.checked) {
          // in der Tagesspalte an der Uhrzeit, eine Stunde hoch
          const ppm = ghostCell.pixelsPerMinute || 0.8;
          li.classList.add("mc-qc-ghost-timed");
          li.style.insetBlockStart = `${(start.getHours() * 60 + start.getMinutes()) * ppm}px`;
          li.style.height = `${60 * ppm}px`;
          ghostCell.eventsListElement?.append(li);
        } else {
          ghostCell.eventsListElement?.prepend(li);
        }
        if (li.isConnected) {
          panel.__mcGhost = li;
        }
      } catch (e) {
        log("quick ghost error", e);
      }
    }
    panel.removeEventListener("popupshown", panel.__mcReplace);
    if (preset?.at?.rect) {
      // neben dem angeklickten Tag wie in Apple Kalender: auf der Seite zur
      // Fenstermitte hin (Tag rechts → links daneben), senkrecht mittig zur
      // Zelle bzw. Uhrzeit, dann ins Fenster und auf den Bildschirm geschoben
      // sehr breite Zelle (Tagesansicht: eine Spalte fast so breit wie das
      // Fenster): neben der Klickstelle statt neben der ganzen Spalte, sonst
      // landete das Fenster weit weg am Fensterrand
      let cell = preset.at.rect.width > 2 * PANEL_W ? { ...preset.at.rect, left: preset.at.x, width: 0 } : preset.at.rect;
      // mit vorläufigem Termin: daneben, senkrecht auf seiner Mitte
      const ghost = panel.__mcGhost;
      const TIP = 9;
      const gr = ghost?.getBoundingClientRect();
      const gw = ghost?.ownerDocument.defaultView;
      const toRightOfCell = cell.left + cell.width / 2 < w.mozInnerScreenX + w.innerWidth / 2;
      if (gr?.width && gw) {
        cell = { left: gw.mozInnerScreenX + gr.left, top: gw.mozInnerScreenY + gr.top, width: gr.width, height: gr.height };
      }
      const fit = (v, size, lo, hi) => (hi - lo >= size ? Math.max(lo, Math.min(v, hi - size)) : lo);
      const place = height => {
        const winL = w.mozInnerScreenX;
        const winT = w.mozInnerScreenY;
        const scrL = w.screen.availLeft;
        const scrT = w.screen.availTop;
        const left = Math.max(winL, scrL) + 8;
        const right = Math.min(winL + w.innerWidth, scrL + w.screen.availWidth) - 8;
        const top = Math.max(winT, scrT) + 8;
        const bottom = Math.min(winT + w.innerHeight, scrT + w.screen.availHeight) - 8;
        const toRight = ghost ? toRightOfCell : cell.left + cell.width / 2 < winL + w.innerWidth / 2;
        // (mit Spitze: das Panel ist um sie breiter und berührt den Termin fast)
        const pw = ghost ? PANEL_W + TIP : PANEL_W;
        const gap = ghost ? 2 : 6;
        const x = toRight ? cell.left + cell.width + gap : cell.left - gap - pw;
        const y = cell.top + cell.height / 2 - height / 2;
        const placed = {
          x: Math.round(right - left >= pw ? fit(x, pw, left, right) : fit(x, pw, scrL + 8, scrL + w.screen.availWidth - 8)),
          y: Math.round(bottom - top >= height ? fit(y, height, top, bottom) : fit(y, height, scrT + 8, scrT + w.screen.availHeight - 8)),
          side: toRight ? "right" : "left",
        };
        // Spitze genau auf der senkrechten Mitte des Termins (am Rand begrenzt)
        placed.tip = Math.round(Math.max(24, Math.min(height - 24, cell.top + cell.height / 2 - placed.y)));
        return placed;
      };
      // Höhe erst nach dem Öffnen bekannt: mit der Höhe vom letzten Mal öffnen
      // (meist dieselbe), unsichtbar, bis die echte gemessen und das Fenster
      // dorthin gerückt ist – sonst sprang es sichtbar ein Stück nach oben
      const tipAt = p => {
        if (ghost) {
          panel.setAttribute("mc-tip", p.side == "right" ? "start" : "end");
          panel.style.setProperty("--mc-tip-y", `${p.tip}px`);
        }
      };
      let at = place(panel.__mcHeight || 360);
      panel.__mcPlaced = at;
      tipAt(at);
      panel.style.opacity = "0";
      const reveal = () => panel.style.removeProperty("opacity");
      panel.__mcReplace = () => {
        panel.removeEventListener("popupshown", panel.__mcReplace);
        const height = panel.getOuterScreenRect().height;
        if (height) {
          panel.__mcHeight = height;
        }
        const again = height ? place(height) : at;
        if (again.x != at.x || again.y != at.y) {
          at = again;
          panel.__mcPlaced = at;
          panel.moveTo(at.x, at.y);
        }
        tipAt(again);
        w.requestAnimationFrame(() => w.requestAnimationFrame(reveal));
        w.setTimeout(reveal, 200); // (verdecktes Fenster: ohne Bilder)
      };
      panel.addEventListener("popupshown", panel.__mcReplace);
      panel.openPopupAtScreen(at.x, at.y, false);
    } else if (preset?.at) {
      // an der Mausposition, etwas nach rechts unten versetzt
      const x = Math.max(w.screen.availLeft + 8, Math.min(preset.at.x + 8, screenRight - PANEL_W - 8));
      panel.openPopupAtScreen(x, preset.at.y + 8, false);
    } else if (anchor) {
      const r = anchor.getBoundingClientRect();
      const below = r.top < w.innerHeight / 2;
      const right = Math.min(w.innerWidth, screenRight - w.mozInnerScreenX) - 8;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - PANEL_W / 2, right - PANEL_W));
      panel.openPopup(anchor, below ? "after_start" : "before_start", Math.round(left - r.left), below ? 4 : -4);
    } else {
      panel.openPopup(null, "", Math.round(w.innerWidth / 2 - 190), 80, false, false);
    }
    w.setTimeout(() => f.title.focus(), 50);
  }

  // Terminliste der Today-Pane: vom Starttag bis zum Monatsende (statt einer
  // festen Anzahl Tage) – passt zum Monat im Titel
  hookAgendaMonthRange(w) {
    // (beim Start ist TodayPane.agenda manchmal noch nicht gesetzt – dann
    // blieb die Liste bei Thunderbirds 14 Tagen ab heute)
    const agenda = w.TodayPane?.agenda || w.document.getElementById("agenda");
    if (!agenda || agenda.__mcMonthRange) {
      return;
    }
    agenda.__mcMonthRange = true;
    Object.defineProperty(agenda, "numberOfDays", {
      configurable: true,
      get() {
        try {
          const start = this.startDate || w.TodayPane.start;
          const last = new Date(start.year, start.month + 1, 0).getDate();
          return Math.max(1, last - start.day + 1);
        } catch {
          return 14;
        }
      },
    });
    // gewählter Tag (meist heute) als Zeile ganz oben; die Termine des Monats
    // davor liegen darüber und erscheinen beim Hochscrollen. Solange niemand
    // scrollt, bleibt der Tag oben, auch wenn Netzkalender später Termine
    // darüber einfügen (sonst rutschte die Liste weg)
    const dayKey = dt => `${dt.year}${String(dt.month + 1).padStart(2, "0")}${String(dt.day).padStart(2, "0")}`;
    let pinned = true;
    const anchorRow = () => {
      const key = agenda.__mcAnchor ? dayKey(agenda.__mcAnchor) : "";
      return [...agenda.querySelectorAll(":scope > li.agenda-listitem")].find(li => (li.dateString || "").slice(0, 8) >= key);
    };
    // vergangener Monat (‹): ans Ende, die letzten Termine zuerst sichtbar,
    // Älteres darüber (Entscheidung des Maintainers vom 5.11.2026)
    const scrollToAnchor = () => {
      const row = agenda.__mcAtEnd ? null : anchorRow();
      agenda.scrollTop = row ? agenda.scrollTop + row.getBoundingClientRect().top - agenda.getBoundingClientRect().top : agenda.scrollHeight;
    };
    agenda.__mcScrollToAnchor = () => {
      pinned = true;
      scrollToAnchor();
    };
    const unpin = () => (pinned = false);
    const pinEvents = ["wheel", "pointerdown", "keydown", "touchstart"];
    pinEvents.forEach(type => agenda.addEventListener(type, unpin, { passive: true }));
    // Zeilen wachsen oft erst nach dem Einfügen (Emoji vor dem Titel lässt ihn
    // umbrechen, Zusatz „in 2 hr“ kommt dazu): dann rutschte der Tag um eine
    // Zeile nach unten bzw. die Liste stand nicht mehr am Ende – nach jeder
    // Größenänderung einer Zeile neu ausrichten, solange niemand gescrollt hat
    const pinRo = w.ResizeObserver ? new w.ResizeObserver(() => pinned && scrollToAnchor()) : null;
    const pinMo = new w.MutationObserver(records => {
      if (pinRo) {
        for (const r of records) {
          r.removedNodes.forEach(n => n.nodeType == 1 && pinRo.unobserve(n));
          r.addedNodes.forEach(n => n.nodeType == 1 && pinRo.observe(n));
        }
      }
      if (pinned) {
        scrollToAnchor();
      }
    });
    pinMo.observe(agenda, { childList: true });
    if (pinRo) {
      for (const li of agenda.children) {
        pinRo.observe(li);
      }
    }
    // grauer Kreis im Mini-Kalender folgt beim Scrollen dem obersten
    // sichtbaren Tag der Liste. Nur die Markierung wandert: der gewählte Tag
    // des Mini-Kalenders bleibt, sonst lüde Thunderbird die Liste neu und
    // sie spränge zurück
    const mm = w.document.getElementById("today-minimonth");
    const follow = () => {
      if (pinned || !mm?.getBoxForDate) {
        return;
      }
      const top = agenda.getBoundingClientRect().top + 1;
      const row = [...agenda.querySelectorAll(":scope > li.agenda-listitem")].find(li => li.getBoundingClientRect().bottom > top);
      const s = (row?.dateString || "").slice(0, 8);
      if (!/^\d{8}$/.test(s)) {
        return;
      }
      const box = mm.getBoxForDate(new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
      if (box && box != mm.mSelected) {
        mm.mSelected?.removeAttribute("selected");
        mm.mSelected = box;
        box.toggleAttribute("selected", true);
      }
    };
    agenda.addEventListener("scroll", follow, { passive: true });
    // Klick auf den noch gewählten Tag, während der Kreis woanders steht:
    // Thunderbird meldet keine Änderung – die Liste springt hier selbst zu
    // ihm zurück, der Mini-Kalender stellt den Kreis dabei selbst zurück
    // (Thunderbird setzt bei jedem Klick ein neues Datumsobjekt; meldete es
    // dabei eine Änderung, ist es dasselbe wie beim letzten „change“ – ein
    // bloßer Merker blieb nach setDay() ohne Klick stehen)
    let mmChanged = null;
    const onMmChange = () => (mmChanged = mm.value);
    const onMmSelect = () => {
      if (mm.value !== mmChanged && agenda.__mcScrollToAnchor) {
        delete agenda.__mcAtEnd;
        agenda.__mcScrollToAnchor();
      }
    };
    mm?.addEventListener("change", onMmChange);
    mm?.addEventListener("select", onMmSelect);
    // Pfeile des Mini-Kalenders blättern auch die Liste (eine eigene
    // Monatszeile über der Liste gibt es nicht mehr): zeigt er einen anderen
    // Monat als die Liste, wechselt sie in diesen Monat. Klick auf einen Tag
    // und setDay() stellen Liste und Mini-Kalender selbst auf denselben Monat,
    // dann ist nichts zu tun. (Die Liste reicht nur bis zum Monatsende, beim
    // Scrollen verlässt sie den Monat des Mini-Kalenders also nie)
    const onMmMonth = () => {
      w.setTimeout(() => {
        const y = Number(mm.getAttribute("year"));
        const m = Number(mm.getAttribute("month"));
        const start = w.TodayPane?.start;
        if (!start || !mm.hasAttribute("month") || (start.year == y && start.month == m)) {
          return;
        }
        this.showAgendaMonth(w, y, m);
      }, 0);
    };
    mm?.addEventListener("monthchange", onMmMonth);
    // Thunderbird zeigt für andere Tage als heute nur diesen einen Tag –
    // hier immer den Monat des Tags bis zum Monatsende
    agenda.update = async function (date) {
      // (Thunderbird lädt neu mit startDate – das ist hier der Monatserste.
      // Nur genau dieses Objekt zählt als Neuladen: ein gewählter Monatserster
      // (Klick im Mini-Kalender) kam sonst nie an, die Liste blieb stehen)
      if (date && this.__mcAnchor && date === this.startDate) {
        date = this.__mcAnchor;
      }
      date ||= this.__mcAnchor || w.TodayPane.start;
      if (!date) {
        return;
      }
      this.__mcAnchor = date.clone();
      this.__mcAnchor.isDate = true;
      this.startDate = this.__mcAnchor.clone();
      this.startDate.day = 1;
      this.endDate = this.startDate.clone();
      this.endDate.day += this.numberOfDays;
      this.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
      pinned = true;
      if (this.isActive) {
        await this.refreshItems();
      } else {
        await this.ensureInitialized();
      }
      const row = this.__mcAtEnd ? null : anchorRow();
      this.selectedIndex = row ? Math.max(0, this.rows.indexOf(row)) : this.__mcAtEnd ? Math.max(0, this.rows.length - 1) : 0;
      scrollToAnchor();
    };
    try {
      w.TodayPane.updatePeriod();
    } catch {} // gewollt: Today-Pane noch nicht bereit
    this.restorers.push(() => {
      delete agenda.update;
      delete agenda.__mcAnchor;
      delete agenda.__mcScrollToAnchor;
      delete agenda.__mcAtEnd;
      pinEvents.forEach(type => agenda.removeEventListener(type, unpin));
      agenda.removeEventListener("scroll", follow);
      mm?.removeEventListener("change", onMmChange);
      mm?.removeEventListener("select", onMmSelect);
      mm?.removeEventListener("monthchange", onMmMonth);
      pinMo.disconnect();
      pinRo?.disconnect();
      Object.defineProperty(agenda, "numberOfDays", {
        configurable: true,
        get: () => Services.prefs.getIntPref("calendar.agenda.days", 14),
      });
      delete agenda.__mcMonthRange;
      try {
        w.TodayPane.updatePeriod();
      } catch {} // gewollt: Today-Pane schon entladen
    });
  }

  // Wochenbeginn an den Mini-Kalendern der Today-Pane und der Kalenderleiste:
  // damit färbt das CSS Samstag und Sonntag grau (data-mc-wkst)
  markMinimonthWeekStart(w) {
    const d = w.document;
    const PREF = "calendar.week.start";
    const IDS = ["today-minimonth", "calMinimonth"];
    if (d.documentElement.__mcWkst) {
      return;
    }
    d.documentElement.__mcWkst = true;
    const set = () => {
      const ws = ((Services.prefs.getIntPref(PREF, 0) % 7) + 7) % 7;
      for (const id of IDS) {
        d.getElementById(id)?.setAttribute("data-mc-wkst", String(ws));
      }
    };
    set();
    const obs = { observe: set };
    Services.prefs.addObserver(PREF, obs);
    this.restorers.push(() => {
      Services.prefs.removeObserver(PREF, obs);
      for (const id of IDS) {
        d.getElementById(id)?.removeAttribute("data-mc-wkst");
      }
      delete d.documentElement.__mcWkst;
    });
  }

  // Today-Pane auf heute stellen und die Liste ganz nach oben
  agendaToday(w) {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const now = new Date();
      const dt = cal.dtz.jsDateToDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate()), cal.dtz.defaultTimezone);
      dt.isDate = true;
      w.TodayPane.setDay(dt);
      // heute ganz oben (darüber die vergangenen Termine des Monats), auch
      // nach dem Neuladen der Termine
      const agenda = w.document.getElementById("agenda");
      if (agenda) {
        delete agenda.__mcAtEnd;
      }
      const top = () => (agenda.__mcScrollToAnchor ? agenda.__mcScrollToAnchor() : (agenda.scrollTop = 0));
      if (agenda) {
        top();
        w.setTimeout(top, 150);
      }
    } catch (e) {
      log("agenda today error", String(e).slice(0, 160));
    }
  }

  // Today-Pane auf einen Monat stellen (Pfeile des Mini-Kalenders): im
  // laufenden Monat ab heute, sonst ab dem 1.
  showAgendaMonth(w, year, month) {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const target = new Date(year, month, 1);
      const now = new Date();
      const day = target.getFullYear() == now.getFullYear() && target.getMonth() == now.getMonth()
        ? now : target;
      const dt = cal.dtz.jsDateToDateTime(new Date(day.getFullYear(), day.getMonth(), day.getDate()), cal.dtz.defaultTimezone);
      dt.isDate = true;
      // vergangener Monat: die Liste beginnt am Ende (jüngste Termine zuerst sichtbar)
      const agenda = w.TodayPane?.agenda || w.document.getElementById("agenda");
      if (agenda) {
        agenda.__mcAtEnd = target < new Date(now.getFullYear(), now.getMonth(), 1);
      }
      w.TodayPane.setDay(dt);
    } catch (e) {
      log("agenda month error", String(e).slice(0, 160));
    }
  }

  // Today-Pane weich ein-/ausblenden wie die Seitenleisten: die Breite
  // gleitet zwischen 0 und voller Breite, der Inhalt behält seine Breite und
  // wird nur zugedeckt. Während der Animation liegt sie über dem Mailbereich
  // (position: absolute) – schob sie ihn pro Bild zur Seite, musste
  // Thunderbird Mailliste und geöffnete Mail jedes Mal neu anordnen (20–35 ms
  // pro Bild, sichtbares Ruckeln). So ändert sich der Mailbereich nur einmal:
  // beim Ausblenden am Anfang, beim Einblenden am Ende, jeweils unter der Pane.
  // reverse: Klick während der Animation kehrt sie an der aktuellen Stelle um
  animateTodayPane(w, command, onDone, reverse = false) {
    const d = w.document;
    const panel = d.getElementById("today-pane-panel");
    if (panel?.__mcAnimating && reverse) {
      panel.__mcReverse?.();
      return;
    }
    if (!panel || panel.__mcAnimating) {
      return;
    }
    const showing = !w.TodayPane?.isVisible;
    const startMode = panel.currentMode;
    // Lage und Breite von Suchfeld und Knöpfen rechts davon VOR dem Umschalten
    // messen – danach steht die Toolbar schon am Ende (das Suchfeld sprang
    // sonst gleich zu Beginn auf seine neue Breite und Lage)
    // Alle Knöpfe der Zeile, nicht nur ab dem Suchfeld: klappen Knöpfe weiter
    // links ein (Junk, Mark), rückten die übrigen sonst gleich zu Beginn nach
    const content = d.getElementById("unifiedToolbarContent");
    const kidsAll = content ? [...content.children] : [];
    const place = li => {
      const r = !li.hidden && li.getBoundingClientRect();
      return r?.width ? r.left : null;
    };
    const fromAll = kidsAll.map(place);
    // dazu die Breite des Suchfelds und Lage/Darstellung der übrigen Knöpfe
    // (für die, die gleich einklappen)
    const searchLi = kidsAll.find(li => li.getAttribute("item-id") == "search-bar");
    const fromSearchW = searchLi && fromAll[kidsAll.indexOf(searchLi)] != null ? searchLi.getBoundingClientRect().width : null;
    const fromBox = kidsAll.map((li, i) => (fromAll[i] != null ? { top: li.getBoundingClientRect().top, display: w.getComputedStyle(li).display } : null));
    // Mailliste: spaces.css begrenzt sie auf den Platz neben der Today-Pane
    // (Mail mindestens 480 px). Ändert sich ihre Breite dadurch, gleitet sie
    // wie die Knöpfe darüber (--mt-list-hold pro Bild) statt am Anfang bzw.
    // Ende um bis zu 18 px zu springen; die Trennlinie in der Toolbar-Zeile
    // gleitet mit
    const listEl = (() => {
      const doc = d.getElementById("tabmail")?.currentTabInfo?.chromeBrowser?.contentDocument;
      return doc?.documentURI?.startsWith("about:3pane") && doc.body?.classList.contains("layout-vertical") ? doc.getElementById("threadPane") : null;
    })();
    const listFrom = listEl?.getBoundingClientRect().width || null;
    const lineVars = ["--mc-list-right", "--mc-lh-right"];
    const lineOf = () => lineVars.map(v => parseFloat(barTarget(d).style.getPropertyValue(v)));
    const lineFrom = lineOf();
    let listTo = null, lineTo = null;
    const listToNow = () => {
      listTo = listEl?.isConnected ? listEl.getBoundingClientRect().width || null : null;
      lineTo = lineOf();
    };
    if (showing) {
      command.doCommand();
    }
    const full = panel.getBoundingClientRect().width;
    if (!full) {
      if (!showing) {
        command.doCommand();
      }
      onDone?.();
      return;
    }
    // Verteiler-Hinweis über der geöffneten Mail (#mcListBanner): füllt die Breite des Mailbereichs, der sich nur am
    // Anfang bzw. Ende ändert – Abmelden-Knopf und Kreuz sprangen deshalb am Ende (Einblenden) bzw. Anfang (Ausblenden).
    // Schmale Breite (Pane im Fluss) jetzt messen, breite (Pane darüber) unten; pro Bild dazwischen gleiten
    // (ebenso der Code-Hinweis #mcCodeBanner)
    const bannerEl = (id = "mcListBanner") => {
      const el = d.getElementById("tabmail")?.currentTabInfo?.chromeBrowser?.contentWindow?.messageBrowser?.contentDocument?.getElementById(id);
      return el?.isConnected ? el : null;
    };
    const bannerNarrow = bannerEl()?.getBoundingClientRect().width || null;
    const codeNarrow = bannerEl("mcCodeBanner")?.getBoundingClientRect().width || null;
    // Mehrfachauswahl-Stapel (#mcConversation.mc-stack): liegt mittig mit Rand in Prozent im Mailbereich und rückte
    // deshalb am Ende des Einblendens (Anfang des Ausblendens) mit dessen neuer Breite um ein paar Pixel – wie den
    // Hinweis pro Bild in der Breite mitführen
    const stackEl = () => {
      const el = d.getElementById("tabmail")?.currentTabInfo?.chromeBrowser?.contentDocument?.querySelector("#mcConversation.mc-stack");
      return el?.isConnected ? el : null;
    };
    const stackNarrow = stackEl()?.getBoundingClientRect().width || null;
    // Aufgaben: Liste, Details, „+“ und Aktionen gleich für das Endmaß
    // rechnen (die Rechnung richtet sich nach dem gemessenen „+“ – bis sie
    // still steht, wie sonst über zwei Bilder verteilt); danach ruht sie bis
    // zum Ende der Animation. Beim Einblenden jetzt, solange die Pane noch
    // mit voller Breite im Fluss liegt
    const sideEdgesNow = () => {
      const bar = d.getElementById("unifiedToolbarContainer");
      panel.__mcEdgeNow = true;
      try {
        for (let i = 0, before = null; i < 4; i++) {
          for (const f of this.sideEdgeUpdaters || []) {
            try {
              f();
            } catch {} // Kandidat fürs Protokoll: Aktualisierung einer Seitenkante fehlgeschlagen (Fenster schon geschlossen ist gewollt)
          }
          const now = barTarget(d).style.getPropertyValue("--mc-tab-offset") + "|" + (bar?.style.getPropertyValue("--mc-task-line") || "");
          if (now == before) {
            break;
          }
          before = now;
        }
      } finally {
        delete panel.__mcEdgeNow;
      }
    };
    if (showing) {
      d.getElementById("unifiedToolbarContainer")?.style.setProperty("--mc-tp-room", `${Math.round(full)}px`);
      panel.__mcSliding = "in";
      sideEdgesNow();
      // ebenso die Platzaufteilung der Toolbar (Suchfeld, ausgeblendete
      // Pillen): Die Mailliste hat nur jetzt ihr Endmaß – liegt die Pane erst
      // über dem Inhalt, ist der Mailbereich breiter, die Liste reicht weiter
      // nach rechts und es wichen mehr Pillen als am Ende (ESR: ganze Pille
      // „Archivieren | Löschen | Werbung“ weg und am Ende wieder da, Suchfeld
      // sprang um 120 px)
      w.__mcTodayTopSync?.();
      d.getElementById("unifiedToolbarContainer")?.removeAttribute("data-mc-tp-open");
      for (const f of this.offsetUpdaters || []) {
        try {
          f();
        } catch {} // Kandidat fürs Protokoll: Aktualisierung eines Abstands fehlgeschlagen (Fenster schon geschlossen ist gewollt)
      }
      // Endmaß der Mailliste (die Pane liegt noch im Fluss)
      listToNow();
    }
    panel.__mcAnimating = true;
    panel.setAttribute("data-mc-anim", "true"); // Mindestbreite (CSS) solange aussetzen
    // „+“ beim Ausblenden gleich zu Beginn weg – sonst gleitet der Today-Knopf darüber
    if (!showing) {
      d.getElementById("unifiedToolbarContainer")?.removeAttribute("data-mc-tp-open");
    }
    // Platz für die Today-Pane in der Toolbar beim Einblenden gleich am Anfang
    // (beim Ausblenden erst am Ende, über todayTopSync) – nicht mittendrin
    if (showing) {
      d.getElementById("unifiedToolbarContainer")?.style.setProperty("--mc-tp-room", `${Math.round(full)}px`);
    }
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const PROPS = ["overflow", "min-width", "width", "max-width", "position", "inset-block", "inset-inline-end", "z-index"];
    const saved = PROPS.map(p => [p, panel.style.getPropertyValue(p), panel.style.getPropertyPriority(p)]);
    const box = panel.parentElement;
    const savedBox = box.style.getPropertyValue("position");
    const kids = [...panel.children];
    kids.forEach(k => k.style.setProperty("min-width", `${full}px`));
    box.style.setProperty("position", "relative");
    panel.style.setProperty("position", "absolute", "important");
    panel.style.setProperty("inset-block", "0", "important");
    panel.style.setProperty("inset-inline-end", "0", "important");
    panel.style.setProperty("z-index", "2", "important");
    panel.style.setProperty("overflow", "hidden", "important");
    panel.style.setProperty("min-width", "0px", "important");
    const setW = v => {
      panel.style.setProperty("width", `${v}px`, "important");
      panel.style.setProperty("max-width", `${v}px`, "important");
    };
    const bannerWide = bannerNarrow ? bannerEl()?.getBoundingClientRect().width || null : null;
    const bannerFollow = bannerNarrow && bannerWide && Math.abs(bannerWide - bannerNarrow) >= 1 ? bannerEl() : null;
    const codeWide = codeNarrow ? bannerEl("mcCodeBanner")?.getBoundingClientRect().width || null : null;
    const codeFollow = codeNarrow && codeWide && Math.abs(codeWide - codeNarrow) >= 1 ? bannerEl("mcCodeBanner") : null;
    const stackWide = stackNarrow ? stackEl()?.getBoundingClientRect().width || null : null;
    const stackFollow = stackNarrow && stackWide && Math.abs(stackWide - stackNarrow) >= 1 ? stackEl() : null;
    const moveBanner = value => {
      const share = Math.min(1, Math.max(0, value / full));
      for (const [el, wide, narrow] of [[bannerFollow, bannerWide, bannerNarrow], [codeFollow, codeWide, codeNarrow], [stackFollow, stackWide, stackNarrow]]) {
        if (!el?.isConnected) {
          continue;
        }
        const wNow = wide - (wide - narrow) * share;
        el.style.setProperty("box-sizing", "border-box", "important");
        el.style.setProperty("width", `${wNow.toFixed(2)}px`, "important");
      }
    };
    // Mitgleiten ohne Neuanordnung: Toolbar-Zeile und Inhalt ändern ihr
    // Layout nur einmal (Anfang bzw. Ende). Dazwischen werden Suchfeld und
    // Knöpfe rechts davon sowie „Bearbeiten“ im Adressbuch nur verschoben
    // (transform), die Überschrift oben steht schon an ihrem Endplatz und wird
    // von der Fläche aufgedeckt
    const row = d.getElementById("unifiedToolbarContainer");
    const rtl = w.getComputedStyle(d.documentElement).direction == "rtl" ? -1 : 1;
    const editBlock = d.getElementById("tabmail")?.currentTabInfo?.browser?.contentDocument?.querySelector("#detailsActions .edit-block");
    // Überschrift: Endzustand (Breite, nur Sonne oder ganzer Titel) jetzt
    // messen, solange die Pane ihre volle Breite hat, und dort festhalten
    // (beim Ausblenden gilt er schon; das „+“ erscheint wie bisher erst am Ende)
    // Die Toolbar-Zeile bekommt gleich ihr Endmaß (einmal neu anordnen),
    // Suchfeld und Knöpfe rechts werden dann vom alten an den neuen Platz
    // geschoben – in beide Richtungen gleich
    if (showing) {
      panel.__mcAnimating = false; // (sync misst sonst nicht)
      w.__mcTodayTopSync?.();
      panel.__mcAnimating = true;
      row?.removeAttribute("data-mc-tp-open");
    } else {
      row?.style.setProperty("--mc-tp-room", "0px");
      // Ausblenden: die Pane liegt schon über dem Inhalt – Endmaß ohne sie
      panel.__mcSliding = "out";
      sideEdgesNow();
    }
    // Platzaufteilung der Toolbar (Suchfeldbreite, eingeklappte Knöpfe) gleich
    // für das Endmaß berechnen, nicht erst nach der Animation (beim Einblenden
    // schon oben, solange die Pane im Fluss lag)
    if (!showing) {
      panel.__mcAnimating = false;
      for (const f of this.offsetUpdaters || []) {
        try {
          f();
        } catch {} // Kandidat fürs Protokoll: Aktualisierung eines Abstands fehlgeschlagen (Fenster schon geschlossen ist gewollt)
      }
      panel.__mcAnimating = true;
      // Endmaß der Mailliste (die Pane liegt schon über dem Inhalt)
      listToNow();
    }
    // Liste gleitet nur, wenn sich ihre Breite ändert; solange hält
    // __mcListRide das Nachmessen der Toolbar-Kanten an (oberflaeche.js) –
    // Knöpfe und Trennlinie gleiten hier mit derselben Kurve
    const listRide = listFrom && listTo && Math.abs(listTo - listFrom) >= 0.5;
    if (listRide) {
      panel.__mcListRide = true;
    }
    const lineRide = listRide && lineFrom.every(Number.isFinite) && lineTo.every(Number.isFinite);
    const toAll = kidsAll.map(place);
    // gleiten: vorher und nachher sichtbar; erscheinen: werden eingeblendet
    const riders = kidsAll.filter((_, i) => fromAll[i] != null && toAll[i] != null);
    const from = kidsAll.map((_, i) => fromAll[i]).filter((_, i) => fromAll[i] != null && toAll[i] != null);
    const to = kidsAll.map((_, i) => toAll[i]).filter((_, i) => fromAll[i] != null && toAll[i] != null);
    const appear = kidsAll.filter((_, i) => fromAll[i] == null && toAll[i] != null);
    // einklappende Knöpfe: an ihrer alten Stelle stehen lassen (außerhalb des
    // Flusses, das Endmaß der Zeile bleibt) und ausblenden
    const vanish = kidsAll.filter((li, i) => fromAll[i] != null && toAll[i] == null && li.hasAttribute("mc-squeezed"));
    const vanishShift = vanish.map(li => {
      const i = kidsAll.indexOf(li);
      li.style.setProperty("--mc-vanish-display", fromBox[i].display);
      li.setAttribute("data-mc-vanish", "");
      const r = li.getBoundingClientRect();
      return `translate(${(fromAll[i] - r.left).toFixed(2)}px, ${(fromBox[i].top - r.top).toFixed(2)}px)`;
    });
    vanish.forEach((li, i) => (li.style.transform = vanishShift[i]));
    // Suchfeld: Breite stufenlos vom alten zum neuen Maß (der Rahmen steht
    // schon am Endmaß, das Feld darin reicht weiter bzw. weniger weit)
    const toSearchW = searchLi && fromSearchW != null && toAll[kidsAll.indexOf(searchLi)] != null ? searchLi.getBoundingClientRect().width : null;
    const searchExtra = toSearchW != null ? fromSearchW - toSearchW : 0;
    const topEl = d.getElementById("mcTodayTop");
    const titleEl = d.getElementById("mcTodayTitle");
    if (row && topEl && titleEl) {
      const tr0 = rectOf(topEl), ti = rectOf(titleEl);
      if (tr0?.width && ti?.width) {
        // Versatz im Zustand der Animation selbst messen (Rand, Innenabstand,
        // Bruchteile – sonst rückte der Titel am Ende um 1 px): erst ohne
        // Versatz an den Anfang, dann so weit, bis er am Endplatz steht
        row.style.setProperty("--mc-tt-off", "0px");
        row.setAttribute("data-mc-tp-anim", "");
        const origin = rectOf(titleEl)?.left ?? tr0.left;
        row.style.setProperty("--mc-tt-off", `${(ti.left - origin).toFixed(2)}px`);
      }
    }
    // Anteil der Bewegung p (0 → 1); das Layout steht schon am Ende (to),
    // Suchfeld und Knöpfe gleiten von ihrer alten an die neue Stelle, das
    // Suchfeld ändert dabei stufenlos seine Breite (die Stufe – nur Lupe,
    // „Search“, ganzer Text – folgt ihr; am Ende wird nichts neu bestimmt)
    const ride = value => {
      const p = showing ? value / full : 1 - value / full;
      riders.forEach((li, i) => {
        const shift = (from[i] - to[i]) * (1 - p);
        li.style.transform = Math.abs(shift) >= 0.5 ? `translateX(${shift}px)` : "";
      });
      appear.forEach(li => li.style.setProperty("opacity", p.toFixed(3)));
      // in der ersten Hälfte weg – die Nachbarn gleiten an ihren Platz
      vanish.forEach(li => li.style.setProperty("opacity", Math.max(0, 1 - 2 * p).toFixed(3)));
      if (Math.abs(searchExtra) >= 0.5) {
        searchLi.style.setProperty("--mc-search-extra", `${(searchExtra * (1 - p)).toFixed(2)}px`);
      }
      if (editBlock) {
        editBlock.style.transform = value ? `translateX(${-value * rtl}px)` : "";
      }
      moveBanner(value);
      if (listRide && listEl.isConnected) {
        listEl.style.setProperty("--mt-list-hold", `${(listFrom + (listTo - listFrom) * p).toFixed(2)}px`);
        if (lineRide) {
          lineVars.forEach((v, i) => barTarget(d).style.setProperty(v, `${(lineFrom[i] + (lineTo[i] - lineFrom[i]) * p).toFixed(2)}px`));
        }
      }
    };
    if (showing) {
      setW(0);
      ride(0);
    } else {
      ride(full);
    }
    // Fortschritt k läuft vor (dir 1) oder nach einer Umkehr zurück (dir -1)
    let k = 0, dir = 1, last = null;
    panel.__mcReverse = () => {
      dir = -dir;
    };
    const step = now => {
      k = Math.min(1, Math.max(0, k + (last === null ? 0 : dir * (now - last) / DURATION)));
      last = now;
      const value = full * (showing ? curve(k) : 1 - curve(k));
      setW(value);
      w.__mcTodayTopSync?.(value);
      if (dir > 0 ? k < 1 : k > 0) {
        ride(value);
        w.requestAnimationFrame(step);
        return;
      }
      const shown = showing == (k >= 1);
      delete panel.__mcReverse;
      for (const [prop, value, prio] of saved) {
        if (value) {
          panel.style.setProperty(prop, value, prio);
        } else {
          panel.style.removeProperty(prop);
        }
      }
      kids.forEach(k2 => k2.style.removeProperty("min-width"));
      if (savedBox) {
        box.style.setProperty("position", savedBox);
      } else {
        box.style.removeProperty("position");
      }
      if (!shown && panel.currentMode != startMode && typeof panel.isVisible == "function") {
        // inzwischen Bereich gewechselt: im Ausgangsbereich zuklappen
        // (sonst bliebe die Pane dort offen, das Kommando gilt nur für den aktuellen)
        if (panel.isVisible(startMode)) {
          const modes = (panel.getAttribute("collapsedinmodes") || "").split(",").filter(Boolean);
          panel.setAttribute("collapsedinmodes", [...modes, startMode].join(","));
          Services.xulStore.persist(panel, "collapsedinmodes");
        }
      } else if (!shown && w.TodayPane?.isVisible) {
        command.doCommand();
      }
      panel.__mcAnimating = false;
      delete panel.__mcSliding;
      panel.removeAttribute("data-mc-anim");
      w.__mcTodayTopSync?.();
      // Layout ist jetzt am Endplatz – Verschiebungen weg (im selben Bild)
      riders.forEach(li => (li.style.transform = ""));
      appear.forEach(li => li.style.removeProperty("opacity"));
      vanish.forEach(li => {
        li.removeAttribute("data-mc-vanish");
        li.style.removeProperty("--mc-vanish-display");
        li.style.removeProperty("opacity");
        li.style.transform = "";
      });
      searchLi?.style.removeProperty("--mc-search-extra");
      if (editBlock) {
        editBlock.style.transform = "";
      }
      for (const el of [bannerFollow, codeFollow, stackFollow]) {
        if (el?.isConnected) {
          el.style.removeProperty("width");
          el.style.removeProperty("box-sizing");
        }
      }
      row?.removeAttribute("data-mc-tp-anim");
      row?.style.removeProperty("--mc-tt-off");
      listEl?.style.removeProperty("--mt-list-hold");
      delete panel.__mcListRide;
      // Toolbar einmal neu anordnen (während der Animation ausgesetzt)
      for (const f of [...(this.sideEdgeUpdaters || []), ...(this.offsetUpdaters || [])]) {
        try {
          f();
        } catch {} // Kandidat fürs Protokoll: Neuanordnung der Toolbar fehlgeschlagen (Fenster schon geschlossen ist gewollt)
      }
      d.getElementById("agenda")?.dispatchEvent(new w.Event("scroll"));
      onDone?.();
    };
    w.requestAnimationFrame(() => w.requestAnimationFrame(step));
  }

  // Today-Pane in allen Bereichen außer dem Kalender (der zeigt den Tag selbst):
  // Thunderbird kennt sie nur in Mail, Aufgaben, Chat und Termin-Tabs –
  // Adressbuch, Einstellungen und übrige Tabs (Modus „special“) kommen dazu,
  // auch für ihre Teile (Minimonat, Termine, Aufgaben). Nach der
  // Erstinstallation einmal überall eingeblendet; danach gilt die eigene Wahl
  // Today-Pane überall gleich (wie in der Mail): Thunderbird merkt sich je
  // Bereich, ob Minikalender und Terminliste zu sind – im Chat z. B. aus
  // einem früheren Umschalten „nur Aufgaben“; den Umschalter dafür blendet
  // halo.spaces aus, die Pane blieb dort leer. Jeden Bereich wie Mail
  // (beim Start und bei jedem Wechsel des Bereichs)
  syncTodayModes(w) {
    const d = w.document;
    try {
      const panel = d.getElementById("today-pane-panel");
      const modes = (panel?.getAttribute("mode") || "").split(",").filter(m => m && m != "calendar");
      for (const id of ["agenda-panel", "today-minimonth-box", "mini-day-box", "today-none-box"]) {
        const box = d.getElementById(id);
        if (!box?.hasAttribute("collapsedinmodes") || box.getAttribute("collapsedinmodes") == ",") {
          continue;
        }
        const was = box.getAttribute("collapsedinmodes").split(",").filter(Boolean);
        const set = new Set(was);
        const mailClosed = set.has("mail");
        for (const m of modes) {
          mailClosed ? set.add(m) : set.delete(m);
        }
        const now = [...set].join(",");
        if (now != was.join(",")) {
          box.setAttribute("collapsedinmodes", now || ",");
          Services.xulStore.persist(box, "collapsedinmodes");
          if (typeof box.isVisible == "function") {
            box.collapsed = !box.isVisible();
          }
        }
      }
    } catch (e) {
      log("today pane modes error", String(e).slice(0, 160));
    }
  }

  todayPaneEverywhere(w) {
    const d = w.document;
    const panel = d.getElementById("today-pane-panel");
    if (!panel || panel.__mcEverywhere) {
      return;
    }
    panel.__mcEverywhere = true;
    // (der Aufgabenteil unten bleibt außen vor: die Today-Pane zeigt überall nur
    // Minikalender und Termine, wie in der Mail)
    for (const box of [panel, ...panel.querySelectorAll("[mode]")].filter(b => b.id != "todo-tab-panel")) {
      const modes = box.getAttribute("mode").split(",");
      const widths = (box.getAttribute("modewidths") || "").split(",");
      const pairs = modes.map((m, i) => [m, widths[i] || "200"]).filter(([m]) => !(box == panel && m == "calendar"));
      if (modes.includes("mail") && !modes.includes("special")) {
        pairs.push(["special", widths[modes.indexOf("mail")] || "200"]);
      }
      box.setAttribute("mode", pairs.map(([m]) => m).join(","));
      if (box.hasAttribute("modewidths")) {
        box.setAttribute("modewidths", pairs.map(([, v]) => v).join(","));
      }
    }
    const PREF = "extensions.mailcards.todayPaneEverywhere";
    if (this.firstInstall && !Services.prefs.getBoolPref(PREF, false)) {
      panel.setAttribute("collapsedinmodes", ","); // (Thunderbirds Zeichen für „nirgends zu“)
      Services.xulStore.persist(panel, "collapsedinmodes");
      Services.prefs.setBoolPref(PREF, true);
    }
    // Ansicht für den aktuellen Bereich neu bestimmen (Thunderbird tut das sonst
    // erst beim nächsten Bereichswechsel)
    try {
      panel.setVisible(panel.isVisible(w.gCurrentMode), false, true);
    } catch (e) {
      log("today pane modes error", e);
    }
  }

  // Heute-Leiste (Aufgaben/Termine rechts) gehört nicht in den Chat – wie in
  // Apples Nachrichten-App. Einmalig für den Chat-Bereich ausblenden; danach
  // gilt wieder, was man selbst einstellt.
  hideTodayPaneInChatOnce(w) {
    const PREF = "extensions.mailcards.todayPaneChatHidden";
    if (Services.prefs.getBoolPref(PREF, false)) {
      return;
    }
    // neu installiert: Today-Pane überall außer im Kalender (todayPaneEverywhere)
    if (this.firstInstall) {
      Services.prefs.setBoolPref(PREF, true);
      return;
    }
    const pane = w.document.getElementById("today-pane-panel");
    if (!pane) {
      return;
    }
    const modes = new Set((pane.getAttribute("collapsedinmodes") || "").split(",").filter(Boolean));
    modes.add("chat");
    pane.setAttribute("collapsedinmodes", [...modes].join(","));
    Services.xulStore.persist(pane, "collapsedinmodes");
    if (w.gCurrentMode == "chat") {
      w.TodayPane?.setVisible?.(false);
    }
    Services.prefs.setBoolPref(PREF, true);
  }

  // Termin-Details: an den Inhalt anpassen (mindestens 480 px breit, höchstens
  // so groß wie der Bildschirm) und iClouds Platzhalter-Erinnerung ausblenden
  // (Apple legt für Standard-Erinnerungen eine feste vom 1. April 1976 an)
  tidyEventDialog(dlg, tries = 0) {
    try {
      if (dlg.__mcTidy) {
        return;
      }
      const frame = dlg.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
      if ((!frame || frame.readyState != "complete" || !frame.querySelector("label")) && tries < 20) {
        dlg.setTimeout(() => this.tidyEventDialog(dlg, tries + 1), 250);
        return;
      }
      const strip = text => text.replace(/\s*:\s*$/, "").replace(/:\s+$/, "");
      // Fenstertitel „Neuer Termin:“ → „Neuer Termin“ (auch nach Änderungen)
      const fixTitle = () => {
        const t = dlg.document.title;
        const fixed = t.replace(/:\s*$/, "");
        if (fixed != t) {
          dlg.document.title = fixed;
        }
      };
      fixTitle();
      const titleEl = dlg.document.querySelector("title");
      if (titleEl) {
        new dlg.MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
      const idoc = dlg.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
      if (!idoc) {
        return;
      }
      // Beschriftungen und Reiter ohne Doppelpunkt (Fluent setzt sie neu → beobachten)
      const fixLabels = () => {
        for (const el of idoc.querySelectorAll("label, tab")) {
          const v = el.getAttribute("value");
          if (v && /:\s*$/.test(v)) {
            el.setAttribute("value", strip(v));
          }
          const l = el.getAttribute("label");
          if (l && /:\s*$/.test(l)) {
            el.setAttribute("label", strip(l));
          }
          if (!v && !l && el.childElementCount == 0 && /:\s*$/.test(el.textContent)) {
            el.textContent = strip(el.textContent);
          }
        }
      };
      dlg.__mcTidy = true;
      fixLabels();
      // nach dem Schließen meldet das Formular noch Änderungen (Abbau, Wochenbeginn): das geschlossene Fenster
      // nicht mehr aufrufen – die ESR wirft dann NS_ERROR_NOT_INITIALIZED in die Fehlerkonsole
      const labelObserver = new dlg.MutationObserver(() => {
        if (dlg.closed) {
          labelObserver.disconnect();
          return;
        }
        dlg.setTimeout(fixLabels, 0);
      });
      labelObserver.observe(idoc.documentElement, {
        subtree: true, attributes: true, attributeFilter: ["value", "label"], childList: true, characterData: true,
      });
      dlg.addEventListener("unload", () => labelObserver.disconnect(), { once: true });
    } catch (e) {
      log("event dialog tidy error", String(e).slice(0, 120));
    }
  }

  // Beschreibung im Termin-Fenster: Systemschrift 13 px als Benutzer-
  // Stylesheet im Editor-Dokument – kein <style> und kein Inline-Stil, die
  // landeten sonst im gespeicherten Text der Beschreibung. Ebenso im
  // Lesefenster (Termin → Öffnen), dort mit selector ".item-description"
  styleItemDescription(iw, tries = 0, selector = "#item-description") {
    try {
      if (iw.closed || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
        return;
      }
      const cw = iw.document.querySelector(selector)?.contentWindow;
      const doc = cw?.document;
      // gleich setzen (ab Thunderbird 160 hängt editorContent.css nicht mehr als
      // <link> im Dokument, auf das bisher gewartet wurde); noch 5 s nachsehen,
      // ob der Editor sein Dokument ersetzt hat, dann dort erneut
      if (doc?.body && !doc.__mcDescSheet) {
        cw.windowUtils.loadSheetUsingURIString(`resource://mailcards/event-description.css?v=${extensionVersion}`, cw.windowUtils.USER_SHEET);
        doc.__mcDescSheet = true;
      }
      if (tries < 20) {
        iw.setTimeout(() => this.styleItemDescription(iw, tries + 1, selector), 250);
      }
    } catch (e) {
      log("item description sheet error", String(e).slice(0, 120));
    }
  }

  // Kalendersymbol wie das App-Symbol von Apple Kalender: Monat klein in Rot,
  // darunter groß der Tag des Termins (bzw. der Aufgabe oder Erinnerung)
  alarmDateIcon(dlg, item) {
    try {
      const doc = dlg.document;
      const ev = item.item, alarm = item.alarm;
      if (!ev) {
        return;
      }
      let date = ev.startDate || ev.entryDate || ev.dueDate || alarm?.alarmDate;
      if (!date) {
        return;
      }
      date = date.getInTimezone(dlg.cal?.dtz?.defaultTimezone || date.timezone);
      const X = "http://www.w3.org/1999/xhtml";
      // wie die Mitteilung von Apple Kalender: kleine graue Kopfzeile mit dem
      // Namen des Kalenders über dem Titel, Pfeil rechts oben öffnet den
      // Termin im Kalender (statt des Links „Details…“)
      const block = item.querySelector(".alarm-calendar-event");
      if (!block) {
        return; // Eintrag noch nicht aufgebaut – beim nächsten Messen
      }
      let head = item.querySelector(".mc-alarm-cal");
      if (!head) {
        head = doc.createElementNS(X, "div");
        head.className = "mc-alarm-cal";
        block.prepend(head);
      }
      if (head && head.textContent != (ev.calendar?.name || "")) {
        head.textContent = ev.calendar?.name || "";
      }
      if (!item.querySelector(".mc-alarm-open")) {
        const open = doc.createElementNS(X, "button");
        open.type = "button";
        open.className = "mc-alarm-open";
        open.title = tr("Show in Calendar");
        open.setAttribute("aria-label", tr("Show in Calendar"));
        open.addEventListener("click", event => {
          event.stopPropagation();
          this.showAlarmItem(item.item);
        });
        block.append(open);
      }
      const key = `${date.year}-${date.month}-${date.day}`;
      let box = item.querySelector(".mc-alarm-date");
      if (box?.dataset.key == key) {
        return;
      }
      if (!box) {
        box = doc.createElementNS(X, "div");
        box.className = "mc-alarm-date";
        box.append(doc.createElementNS(X, "span"), doc.createElementNS(X, "span"));
        box.firstChild.className = "mc-alarm-month";
        box.lastChild.className = "mc-alarm-day";
        const img = item.querySelector(".alarm-calendar-image");
        (img?.parentNode || item).insertBefore(box, img || item.firstChild);
      }
      const js = new Date(date.year, date.month, date.day);
      const locale = Services.locale.appLocaleAsBCP47;
      box.dataset.key = key;
      box.firstChild.textContent = new Intl.DateTimeFormat(locale, { month: "short" }).format(js).replace(/\.$/, "");
      box.lastChild.textContent = String(date.day);
    } catch (e) {
      log("alarm icon error", String(e).slice(0, 120));
    }
  }

  // Pfeil der Erinnerung: Kalender-Bereich in der Monatsansicht, Termin
  // gewählt und seine Details offen
  async showAlarmItem(ev) {
    try {
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      if (!w || !ev) {
        return;
      }
      w.focus();
      w.document.getElementById("tabmail")?.openTab("calendar");
      (w.switchCalendarView || w.switchToView)?.("month");
      const start = ev.startDate || ev.entryDate || ev.dueDate;
      if (start) {
        w.goToDate?.(start);
      }
      await new Promise(r => w.setTimeout(r, 300));
      try {
        w.currentView?.().setSelectedItems([ev]);
      } catch {} // gewollt: Ansicht kann das Element nicht wählen, der Dialog öffnet trotzdem
      w.modifyEventWithDialog?.(ev, true);
    } catch (e) {
      log("alarm open error", String(e).slice(0, 120));
    }
  }

  fitAlarmDialog(dlg) {
    const ALARM_WIDTH = 346;
    try {
      const doc = dlg.document;
      const list = doc.getElementById("alarm-richlist");
      if (!list) {
        return;
      }
      const fit = () => {
        if (dlg.closed) {
          return;
        }
        const items = [...list.children].filter(i => i.getBoundingClientRect().height);
        // wie Apple Kalender: „Alle …“-Knöpfe nur bei mehreren Erinnerungen,
        // Datumssymbol (Monat/Tag) des Termins statt des Liniensymbols
        const multi = list.children.length > 1;
        if (doc.documentElement.hasAttribute("mc-alarm-multi") != multi) {
          doc.documentElement.toggleAttribute("mc-alarm-multi", multi);
          // die Knopfzeile erscheint bzw. geht – gleich danach nachmessen (per
          // Zeitgeber: verdeckte Fenster zeichnen kein nächstes Bild)
          dlg.setTimeout(fit, 50);
        }
        for (const item of list.children) {
          this.alarmDateIcon(dlg, item);
        }
        if (!items.length) {
          return;
        }
        // höchstens vier Einträge ohne Scrollen, darüber scrollt die Liste
        const shown = items.slice(0, 4);
        const cs = dlg.getComputedStyle(list);
        let content = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        for (const item of shown) {
          const ics = dlg.getComputedStyle(item);
          content += item.getBoundingClientRect().height + (parseFloat(ics.marginTop) || 0) + (parseFloat(ics.marginBottom) || 0);
        }
        // Fensterinhalt (Körper) statt Fensterhöhe: ohne Titelleiste ragt er sonst unten hinaus
        const rest = Math.max(doc.body.getBoundingClientRect().height, dlg.innerHeight) - list.getBoundingClientRect().height;
        const inner = Math.ceil(rest + content);
        // so breit wie die Mitteilung (346 px)
        const width = dlg.outerWidth - dlg.innerWidth + ALARM_WIDTH;
        if (Math.abs(inner - dlg.innerHeight) >= 2 || Math.abs(dlg.innerWidth - ALARM_WIDTH) >= 2) {
          dlg.resizeTo(width, dlg.outerHeight - dlg.innerHeight + inner);
        }
      };
      // ohne sichtbare Titelleiste wie eine Mitteilung (macOS zeichnet die
      // Fensterknöpfe weiter; die Fläche oben bleibt zum Verschieben)
      if (Services.appinfo.OS == "Darwin") {
        doc.documentElement.setAttribute("customtitlebar", "true");
        doc.documentElement.setAttribute("chromemargin", "0,-1,-1,-1");
        doc.documentElement.setAttribute("mc-alarm-card", "");
      }
      fit();
      // Einträge kommen hinzu oder werden erledigt
      new dlg.MutationObserver(() => dlg.setTimeout(fit, 50)).observe(list, { childList: true });
      // Texte eines Eintrags kommen erst nach dem Einfügen (Höhe wächst) – nachmessen
      const ro = new dlg.ResizeObserver(() => dlg.setTimeout(fit, 0));
      new dlg.MutationObserver(() => [...list.children].forEach(i => ro.observe(i))).observe(list, { childList: true });
      [...list.children].forEach(i => ro.observe(i));
    } catch (e) {
      log("alarm size error", String(e).slice(0, 120));
    }
  }

  // Termin-Details: Ort (keine Webadresse) als Link, der die Karten-App öffnet
  linkSummaryLocation(dlg) {
    try {
      const cell = dlg.document.querySelector(".item-location");
      if (cell && !cell.mcMapWatch) {
        // Thunderbird schreibt den Ort bei Änderungen des Termins neu
        cell.mcMapWatch = new dlg.MutationObserver(() => this.linkSummaryLocation(dlg));
        cell.mcMapWatch.observe(cell, { childList: true });
      }
      const text = cell?.textContent.trim();
      // Webadressen macht Thunderbird selbst zum Link
      if (!text || cell.querySelector("label, a, .mc-map-link") || /https?:\/\//.test(text)) {
        return;
      }
      const url = mapsUrl(text, Services.appinfo.OS);
      if (!url || !mapsAppExists(url)) {
        return;
      }
      // Tests ersetzen dlg.mcOpenMaps, um nichts wirklich zu öffnen
      dlg.mcOpenMaps ??= openMaps;
      const link = dlg.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      link.className = "text-link mc-map-link";
      link.setAttribute("role", "link");
      link.tabIndex = 0;
      link.textContent = cell.textContent;
      const go = () => dlg.mcOpenMaps(url);
      link.addEventListener("click", e => e.button == 0 && go());
      link.addEventListener("keydown", e => {
        if (e.key == "Enter" || e.key == " ") {
          e.preventDefault();
          go();
        }
      });
      cell.replaceChildren(link);
    } catch (e) {
      log("summary location error", String(e).slice(0, 120));
    }
  }

  fitSummaryDialog(dlg) {
    try {
      const doc = dlg.document;
      const cell = doc.querySelector(".reminder-details");
      if (cell) {
        const year = /\b1976\b/;
        for (const node of [...cell.childNodes]) {
          if (node.nodeType == 3 && year.test(node.textContent)) {
            if (node.nextSibling?.localName == "br") {
              node.nextSibling.remove();
            }
            node.remove();
          }
        }
        if (cell.lastChild?.localName == "br") {
          cell.lastChild.remove();
        }
      }
      // Titel steht groß im Inhalt – nicht zusätzlich in der Fensterleiste
      if (doc.querySelector(".item-title")?.textContent.trim()) {
        doc.title = " ";
      }
      // Größe anpassen, mittig auf dem Bildschirm wie bei Thunderbird
      const maxW = dlg.screen.availWidth - 40;
      const maxH = dlg.screen.availHeight - 40;
      // Mindestbreite per CSS, damit sizeToContent die Höhe gleich für die
      // endgültige Breite rechnet (vorher ein zweiter Durchgang nach 50 ms)
      // Bildschirmmitte wie Thunderbird selbst (das eigene Fenster hat hier teils noch keine Größe)
      const sc = dlg.screen;
      const cx = sc.availLeft + sc.availWidth / 2, cy = sc.availTop + sc.availHeight / 2;
      doc.documentElement.style.minWidth = `${Math.min(maxW, 480) - (dlg.outerWidth - dlg.innerWidth)}px`;
      dlg.sizeToContent();
      if (dlg.outerWidth > maxW || dlg.outerHeight > maxH) {
        dlg.resizeTo(Math.min(maxW, dlg.outerWidth), Math.min(maxH, dlg.outerHeight));
      }
      dlg.moveTo(Math.round(cx - dlg.outerWidth / 2), Math.round(cy - dlg.outerHeight / 2));
      // die Beschreibung lädt später, rollt aber in ihrem eigenen Feld – nicht
      // nachführen. Nur wenn das Fenster zu niedrig gemessen wurde (beim ersten
      // Öffnen sind Schrift oder umbrochene Zeilen manchmal noch nicht fertig,
      // „Edit“ stand dann fast am Rand), die Höhe nach dem Zeichnen nachziehen –
      // nie kleiner, Breite und Lage bleiben, sonst springt nichts
      let passes = 0;
      const grow = () => {
        try {
          if (dlg.closed) {
            return;
          }
          const w0 = dlg.outerWidth, h0 = dlg.outerHeight;
          // kein erneutes sizeToContent: unter macOS greift es teils erst nach
          // dem folgenden resizeTo und nähme die Zugabe wieder zurück – die
          // Höhe ergibt sich allein aus dem Abstand unter dem untersten Knopf
          // sizeToContent lässt unter dem untersten Knopf („Edit“) manchmal nur
          // wenige Pixel – so viel Luft wie rechts daneben
          let extra = 0;
          const buttons = [...doc.querySelectorAll("button")].filter(b => b.getBoundingClientRect().height > 0);
          const low = buttons.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
          if (low) {
            const r = low.getBoundingClientRect();
            const want = Math.max(16, Math.round(dlg.innerWidth - r.right));
            extra = Math.max(0, Math.round(want - (dlg.innerHeight - r.bottom)));
          }
          // unter Linux setzt sizeToContent die Größe erst später – dann nicht
          // mit der alten Größe überschreiben und kleine Rundungsreste (1 px)
          // nicht aufsummieren, sondern gleich noch einmal nachmessen
          const shrunk = dlg.outerHeight < h0 - 1;
          if (extra >= 3 || shrunk || dlg.outerWidth != w0) {
            const h = Math.min(maxH, Math.max(h0, dlg.outerHeight) + (extra >= 3 ? extra : 0));
            if (h != dlg.outerHeight || dlg.outerWidth != w0) {
              dlg.resizeTo(w0, h);
            }
          }
          if (extra >= 3 && ++passes < 5) {
            dlg.setTimeout(later, 200);
          }
        } catch {} // gewollt: Dialog schon geschlossen, nichts mehr anzupassen
      };
      let queued = false;
      const later = () => {
        if (!queued) {
          queued = true;
          dlg.requestAnimationFrame(() => {
            queued = false;
            grow();
          });
        }
      };
      later();
      doc.fonts?.ready.then(later);
      dlg.setTimeout(later, 300);
      // Text, der in den ersten Sekunden noch nachkommt (Wiederholung, Ort …)
      const mo = new dlg.MutationObserver(later);
      mo.observe(doc.documentElement, { subtree: true, childList: true, characterData: true });
      dlg.setTimeout(() => mo.disconnect(), 3000);
      // Titel oder Zeilen, die erst später umbrechen (Schrift geladen, Breite
      // knapper als gemessen), werden höher, ohne dass sich Text ändert
      const ro = new dlg.ResizeObserver(later);
      for (const el of doc.querySelectorAll(".item-title, .repeat-details, .reminder-details, td")) {
        ro.observe(el);
      }
    } catch (e) {
      log("summary size error", String(e).slice(0, 120));
    }
  }
}
