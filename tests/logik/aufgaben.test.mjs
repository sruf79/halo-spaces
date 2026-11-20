// Aufgaben: Zustand statt Prozent und Ende der Tabellenansicht (Umbau der Ansichten 1/5)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

// Nachbau von Thunderbirds CalTodo, soweit es um Status und Prozent geht
// (isCompleted wie in CalTodo.sys.mjs: lesen über Datum, 100 % oder COMPLETED;
// false entfernt STATUS, PERCENT-COMPLETE und COMPLETED)
function aufgabe({ status = null, percentComplete = 0, completedDate = null } = {}) {
  return {
    status, percentComplete, completedDate,
    get isCompleted() {
      return this.completedDate != null || this.percentComplete == 100 || this.status == "COMPLETED";
    },
    set isCompleted(v) {
      if (v) {
        this.completedDate ??= "jetzt";
        this.status = "COMPLETED";
        this.percentComplete = 100;
      } else {
        this.completedDate = null;
        this.status = null;
        this.percentComplete = 0;
      }
    },
  };
}

test("Aufgaben: Zustand aus Status, Prozentwerte anderer Programme zählen mit", () => {
  const { taskStage } = lade();
  assert.equal(taskStage(aufgabe()), 0);
  assert.equal(taskStage(aufgabe({ status: "NEEDS-ACTION" })), 0);
  assert.equal(taskStage(aufgabe({ status: "CANCELLED" })), 0);
  assert.equal(taskStage(aufgabe({ status: "IN-PROCESS" })), 1); // ohne Prozent (Thunderbirds Filter sähe 0 %)
  assert.equal(taskStage(aufgabe({ percentComplete: 25 })), 1); // alter Wert ohne Status
  assert.equal(taskStage(aufgabe({ status: "IN-PROCESS", percentComplete: 75 })), 1);
  assert.equal(taskStage(aufgabe({ percentComplete: 100 })), 2);
  assert.equal(taskStage(aufgabe({ status: "COMPLETED" })), 2);
  assert.equal(taskStage(aufgabe({ completedDate: "gestern" })), 2);
  assert.equal(taskStage(null), 0);
});

test("Aufgaben: Zustand setzen schreibt nur Standard-Status, Prozent unter 100 bleibt bei In Arbeit", () => {
  const { taskStage, setTaskStage } = lade();
  const a = aufgabe({ percentComplete: 40 });
  setTaskStage(a, 1);
  assert.deepEqual([a.status, a.percentComplete, a.completedDate, taskStage(a)], ["IN-PROCESS", 40, null, 1]);
  setTaskStage(a, 2);
  assert.deepEqual([a.status, a.percentComplete, taskStage(a)], ["COMPLETED", 100, 2]);
  setTaskStage(a, 1); // aus Erledigt zurück: kein 100 % mehr
  assert.deepEqual([a.status, a.percentComplete, a.completedDate, taskStage(a)], ["IN-PROCESS", 0, null, 1]);
  setTaskStage(a, 0);
  assert.deepEqual([a.status, a.percentComplete, taskStage(a)], ["NEEDS-ACTION", 0, 0]);
  const b = aufgabe({ status: "COMPLETED", percentComplete: 100, completedDate: "gestern" });
  setTaskStage(b, 0);
  assert.deepEqual([b.status, b.percentComplete, b.completedDate, taskStage(b)], ["NEEDS-ACTION", 0, null, 0]);
});

test("Aufgaben: drei Zustände mit den Texten der Seitenleiste", () => {
  const { TASK_STAGES } = lade();
  // (Array.from: Werte aus dem vm-Kontext in diesen holen)
  assert.deepEqual(Array.from(TASK_STAGES, ([k]) => k), ["open", "progress", "done"]);
  assert.deepEqual(Array.from(TASK_STAGES, ([, t]) => t), ["Open|tasks", "In Progress", "Completed"]);
});

test("Aufgaben: Tabellenansicht gestrichen, gespeichertes „table“ wird zur Kartenansicht und entfernt", () => {
  const P = "extensions.mailcards.taskView";
  const x = lade({ prefs: { [P]: "table" } });
  assert.equal(x.taskView(), "list");
  x.migrateTaskView();
  assert.equal(x.prefs.has(P), false);
  const y = lade({ prefs: { [P]: "board" } });
  y.migrateTaskView();
  assert.equal(y.taskView(), "board");
  assert.equal(y.prefs.get(P), "board");
  assert.equal(lade().taskView(), "list");
});
