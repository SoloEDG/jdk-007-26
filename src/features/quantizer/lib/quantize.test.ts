import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quantizeTiming,
  originalOf,
  MIN_NOTE_DURATION,
  DEFAULT_QUANTIZE,
} from "./quantize";
import type { Note } from "../../../shared/types";

const L = 16;
const base = { ...DEFAULT_QUANTIZE };

test("完全吸附把起点对齐到最近网格", () => {
  const r = quantizeTiming({ beat: 1.13, duration: 0.4 }, L, {
    ...base,
    grid: 0.5,
    strength: 1,
  });
  assert.equal(r.beat, 1);
});

test("强度 0 保持原拍位", () => {
  const r = quantizeTiming({ beat: 1.13, duration: 0.4 }, L, {
    ...base,
    grid: 0.5,
    strength: 0,
  });
  assert.ok(Math.abs(r.beat - 1.13) < 1e-12);
  assert.ok(Math.abs(r.duration - 0.4) < 1e-12);
});

test("强度按比例插值", () => {
  const r = quantizeTiming({ beat: 1.1, duration: 0.4 }, L, {
    ...base,
    grid: 0.5,
    strength: 0.5,
  });
  // 目标 1.0，起点 1.1 -> 1.05
  assert.ok(Math.abs(r.beat - 1.05) < 1e-12);
});

test("反复更换网格不累计误差：始终从原始拍位重算", () => {
  const original = { beat: 3.27, duration: 0.62 };
  const first = quantizeTiming(original, L, { ...base, grid: 1, strength: 1 });
  // 第二次输入仍是原始位置，而不是 first 的结果
  const second = quantizeTiming(original, L, { ...base, grid: 0.25, strength: 1 });
  const direct = quantizeTiming(original, L, {
    ...base,
    grid: 0.25,
    strength: 1,
  });
  assert.deepEqual(second, direct);
  assert.ok(Math.abs(second.beat - 3.25) < 1e-12);
  assert.notDeepEqual(first, second);
});

test("next：起点越过循环末尾归到下一圈（拍位回绕）", () => {
  const r = quantizeTiming({ beat: 15.9, duration: 0.2 }, L, {
    ...base,
    grid: 0.5,
    boundary: "next",
    strength: 1,
  });
  assert.equal(r.beat, 0); // 16 回绕到下一圈起点
  assert.ok(r.duration >= MIN_NOTE_DURATION);
});

test("stay：起点钉在本圈末尾，不回绕", () => {
  const r = quantizeTiming({ beat: 15.9, duration: 0.2 }, L, {
    ...base,
    grid: 0.5,
    boundary: "stay",
    strength: 1,
  });
  assert.equal(r.beat, 15.5);
  assert.ok(r.beat + r.duration <= L + 1e-9);
});

test("长音缩短后仍保留最短有效时长", () => {
  const r = quantizeTiming({ beat: 15.99, duration: 4 }, L, {
    ...base,
    grid: 0.25,
    scope: "both",
    boundary: "stay",
    strength: 1,
  });
  assert.ok(r.duration >= MIN_NOTE_DURATION);
});

test("next 下回绕音符的时长不会被错误截断", () => {
  const r = quantizeTiming({ beat: 15.8, duration: 2 }, L, {
    ...base,
    grid: 0.5,
    boundary: "next",
    strength: 1,
  });
  assert.equal(r.beat, 0);
  // 回绕后位于下一圈开头，时长保留（最多整圈）
  assert.ok(Math.abs(r.duration - 2) < 1e-9);
});

test("scope=both 时结束点独立吸附，时长按新起止重算", () => {
  const r = quantizeTiming({ beat: 1.1, duration: 0.7 }, L, {
    ...base,
    grid: 0.5,
    scope: "both",
    strength: 1,
  });
  // 起点 -> 1.0，结束 1.8 -> 2.0，时长 1.0
  assert.equal(r.beat, 1);
  assert.ok(Math.abs(r.duration - 1) < 1e-12);
});

test("scope=start 不动时长（仅在越界时夹紧）", () => {
  const r = quantizeTiming({ beat: 1.1, duration: 0.37 }, L, {
    ...base,
    grid: 0.5,
    scope: "start",
    strength: 1,
  });
  assert.equal(r.beat, 1);
  assert.ok(Math.abs(r.duration - 0.37) < 1e-12);
});

test("所有结果保持在循环范围内且时长合法", () => {
  for (const boundary of ["next", "stay"] as const)
    for (const scope of ["start", "both"] as const)
      for (const grid of [0.25, 0.5, 1])
        for (let b = 0; b <= 15.9; b += 0.137) {
          const r = quantizeTiming(
            { beat: b, duration: 0.3 },
            L,
            { ...base, grid, scope, boundary, strength: 1 },
          );
          assert.ok(r.beat >= 0 && r.beat < L, `beat ${r.beat}`);
          assert.ok(r.duration >= MIN_NOTE_DURATION);
          assert.ok(r.beat + r.duration <= L + 1e-9);
        }
});

test("旧存档无 original 时以现有结果作为恢复基准", () => {
  const legacy: Note = {
    id: "x",
    pitch: 1,
    beat: 2.4,
    duration: 0.5,
    velocity: 0.8,
  };
  assert.deepEqual(originalOf(legacy), { beat: 2.4, duration: 0.5 });
  const withOriginal: Note = { ...legacy, original: { beat: 2.1, duration: 0.9 } };
  assert.deepEqual(originalOf(withOriginal), { beat: 2.1, duration: 0.9 });
});
