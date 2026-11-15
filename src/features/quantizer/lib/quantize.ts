import type { Note } from "@/shared/types";
import { clamp, wrap } from "@/shared/math";

/** 可选吸附网格（拍）。 */
export const QUANT_GRIDS = [0.25, 0.5, 1] as const;
export type QuantGrid = (typeof QUANT_GRIDS)[number];
/** 只吸附起点，或起点与结束点都吸附。 */
export type QuantScope = "start" | "both";
/** 起点吸附后越过循环末尾时的归属策略。 */
export type QuantBoundary = "next" | "stay";

export type QuantizeSettings = {
  grid: number;
  /** 0~1，0 为保持原拍位，1 为完全吸附。 */
  strength: number;
  scope: QuantScope;
  boundary: QuantBoundary;
};

export const MIN_NOTE_DURATION = 0.05;

export const DEFAULT_QUANTIZE: QuantizeSettings = {
  grid: 0.5,
  strength: 1,
  scope: "start",
  boundary: "next",
};

const nearestGrid = (value: number, grid: number) =>
  Math.round(value / grid) * grid;

const clampDuration = (duration: number, room: number) =>
  clamp(duration, MIN_NOTE_DURATION, Math.max(MIN_NOTE_DURATION, room));

/**
 * 纯函数：始终基于原始拍位计算量化结果，不读取也不修改输入音符，
 * 因此反复更换网格 / 强度不会累计取整误差。
 *
 * - 长音缩短后通过 MIN_NOTE_DURATION 保留最短有效时长；
 * - boundary="next" 时起点越过末尾会被明确归到下一圈（拍位回绕），
 *   "stay" 时钉在末尾，不发生回绕；
 * - scope="both" 时结束点独立吸附，时长按新的起止点重算，同样保留最短时长。
 */
export function quantizeTiming(
  original: { beat: number; duration: number },
  length: number,
  settings: QuantizeSettings,
): { beat: number; duration: number } {
  const { grid, strength, scope, boundary } = settings;
  const rawEnd = original.beat + original.duration;
  const targetStart = nearestGrid(original.beat, grid);

  if (boundary === "next") {
    // 先在不回绕的绝对拍线上计算，再把起点绕回当前循环。
    const start =
      original.beat + (targetStart - original.beat) * strength;
    const lap = Math.floor(start / length);
    const beat = wrap(start, length);
    let duration = original.duration;
    if (scope === "both") {
      const end = rawEnd + (nearestGrid(rawEnd, grid) - rawEnd) * strength;
      duration = end - start;
    }
    // 回绕后音符落在下一圈开头，循环内可用空间即整圈长度。
    duration = clampDuration(duration, lap > 0 ? length : length - beat);
    return { beat, duration };
  }

  // stay：不允许越过末尾。吸附目标先钉在循环内（最大可用网格线），
  // 再做强度插值，保证结果既不回绕、也不会落在循环终点上。
  const stayTarget = Math.min(nearestGrid(original.beat, grid), length - grid);
  const start = clamp(
    original.beat + (stayTarget - original.beat) * strength,
    0,
    length - grid,
  );
  let duration = original.duration;
  if (scope === "both") {
    const endTarget = Math.min(nearestGrid(rawEnd, grid), length - grid);
    const end = clamp(
      rawEnd + (endTarget - rawEnd) * strength,
      0,
      length - grid,
    );
    duration = end - start;
  }
  duration = clampDuration(duration, length - start);
  return { beat: start, duration };
}

/** 旧存档没有 original 时，以现有结果作为恢复基准。 */
export const originalOf = (note: Note) =>
  note.original ?? { beat: note.beat, duration: note.duration };
