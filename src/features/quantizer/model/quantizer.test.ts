import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuantizer } from "./quantizer";
import type { Arrangement } from "../../arrangement/model/arrangement";
import type { Note, Track } from "../../../shared/types";

function fakeArrangement(initial: Note[]): Arrangement {
  let notes = structuredClone(initial);
  return {
    snapshot() {
      return {
        tracks: [{ id: "t1", name: "T", instrument: "keys", color: "#fff", notes: structuredClone(notes) }] as Track[],
        selected: "t1",
        title: "x",
      };
    },
    selected: (() => null) as Arrangement["selected"],
    select() {},
    add: (() => "t1") as Arrangement["add"],
    remove() {},
    commit(_id: string, next: Note[]) {
      notes = structuredClone(next);
    },
    resizeLoop() {},
    clear() {},
    restore: (() => ({})) as unknown as Arrangement["restore"],
    forPlayback() {
      return structuredClone([
        { id: "t1", name: "T", instrument: "keys", color: "#fff", notes },
      ]) as Track[];
    },
  };
}

const note = (beat: number, duration = 0.4): Note => ({
  id: crypto.randomUUID(),
  pitch: 60,
  beat,
  duration,
  velocity: 0.8,
});

test("应用只写 beat/duration，original 与结果分开保存", () => {
  const n = note(1.13);
  const arr = fakeArrangement([n]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  q.update({ grid: 0.5, strength: 1 });
  q.apply(16);
  const stored = arr.snapshot().tracks[0].notes[0];
  assert.equal(stored.beat, 1);
  assert.deepEqual(stored.original, { beat: 1.13, duration: 0.4 });
});

test("换网格再应用不累计误差：始终从 original 重算", () => {
  const n = note(3.27, 0.62);
  const arr = fakeArrangement([n]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  q.update({ grid: 1 });
  q.apply(16);
  q.refresh();
  q.update({ grid: 0.25 });
  q.apply(16);
  const stored = arr.snapshot().tracks[0].notes[0];
  // 3.27 在 1/16 网格上 -> 3.25；original 始终是 3.27
  assert.ok(Math.abs(stored.beat - 3.25) < 1e-12);
  assert.deepEqual(stored.original, { beat: 3.27, duration: 0.62 });
});

test("恢复原始演奏回到打开时的拍位，且 original 仍保留", () => {
  const n = note(1.13);
  const arr = fakeArrangement([n]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  q.update({ grid: 0.5 });
  q.apply(16);
  q.refresh();
  q.restoreSelected();
  const stored = arr.snapshot().tracks[0].notes[0];
  assert.ok(Math.abs(stored.beat - 1.13) < 1e-12);
  assert.deepEqual(stored.original, { beat: 1.13, duration: 0.4 });
});

test("旧存档无 original：首次应用以现有结果固化为恢复基准", () => {
  const legacy = note(2.4, 0.5);
  delete legacy.original;
  const arr = fakeArrangement([legacy]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  q.update({ grid: 0.5 });
  q.apply(16);
  const stored = arr.snapshot().tracks[0].notes[0];
  assert.equal(stored.beat, 2.5);
  assert.deepEqual(stored.original, { beat: 2.4, duration: 0.5 });
  q.refresh();
  q.restoreSelected();
  const back = arr.snapshot().tracks[0].notes[0];
  assert.ok(Math.abs(back.beat - 2.4) < 1e-12);
});

test("只应用选中的音符，未选中的保持不动", () => {
  const a = note(1.13);
  const b = note(5.29);
  const arr = fakeArrangement([a, b]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  q.setSelected([a.id]);
  q.apply(16);
  const [na, nb] = arr.snapshot().tracks[0].notes;
  assert.equal(na.beat, 1);
  assert.equal(nb.beat, 5.29);
  assert.equal(nb.original, undefined);
});

test("没有选中音符时应用抛错且不改动数据", () => {
  const n = note(1.13);
  const arr = fakeArrangement([n]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  q.selectNone();
  assert.throws(() => q.apply(16), /至少一个/);
  assert.equal(arr.snapshot().tracks[0].notes[0].beat, 1.13);
});

test("refresh 剔除已消失的音符选择，轨道不存在则关闭", () => {
  const a = note(1);
  const b = note(2);
  const arr = fakeArrangement([a, b]);
  const q = createQuantizer(arr);
  q.open("t1", 16);
  assert.equal(q.snapshot(16).selectedCount, 2);
  arr.commit("t1", [a]);
  q.refresh();
  assert.deepEqual(q.snapshot(16).previews.map((p) => p.note.id), [a.id]);
  arr.commit("t1", []);
  q.refresh();
  // 轨道仍在（只是被清空）：工作台保留，选择与预览均为空
  assert.equal(q.isOpen(), true);
  assert.equal(q.snapshot(16).selectedCount, 0);
  assert.deepEqual(q.snapshot(16).previews, []);
});
