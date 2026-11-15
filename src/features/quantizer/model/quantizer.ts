import type { Note } from "@/shared/types";
import type { Arrangement } from "@/features/arrangement/model/arrangement";
import {
  DEFAULT_QUANTIZE,
  QUANT_GRIDS,
  originalOf,
  quantizeTiming,
  type QuantBoundary,
  type QuantScope,
  type QuantizeSettings,
} from "../lib/quantize";

export type QuantizePreview = {
  note: Note;
  original: { beat: number; duration: number };
  preview: { beat: number; duration: number };
  selected: boolean;
  moved: boolean;
};

export type QuantizeSnapshot = {
  open: boolean;
  trackId: string | null;
  trackName: string;
  settings: QuantizeSettings;
  selectedCount: number;
  totalCount: number;
  previews: QuantizePreview[];
};

/**
 * 非破坏性量化工作台。
 *
 * 原始拍位（Note.original，缺失时以当前结果代替）与应用结果分开保存：
 * 预览永远从原始拍位重新计算，应用只写入 beat/duration，从不覆盖 original，
 * 因此换网格 / 换强度不会累计取整误差，且随时可以恢复原始演奏。
 */
export function createQuantizer(arrangement: Arrangement) {
  let trackId: string | null = null;
  let loopLength = 16;
  let settings: QuantizeSettings = { ...DEFAULT_QUANTIZE };
  let selection = new Set<string>();

  const track = () =>
    arrangement.snapshot().tracks.find((t) => t.id === trackId) ?? null;

  const buildPreviews = (): QuantizePreview[] => {
    const t = track();
    if (!t) return [];
    return t.notes.map((note) => {
      const original = originalOf(note);
      const preview = quantizeTiming(original, loopLength, settings);
      return {
        note,
        original,
        preview,
        selected: selection.has(note.id),
        moved:
          Math.abs(preview.beat - note.beat) > 1e-9 ||
          Math.abs(preview.duration - note.duration) > 1e-9,
      };
    });
  };

  return {
    get openId() {
      return trackId;
    },
    isOpen() {
      return trackId !== null;
    },
    /**
     * 打开工作台：以目标轨道为对象，默认选中全部音符。
     * 重复打开会重置参数与选择，保证每次都是干净的预览。
     */
    open(id: string, length: number) {
      const t = arrangement
        .snapshot()
        .tracks.find((candidate) => candidate.id === id);
      if (!t) throw new Error("量化目标轨道不存在");
      trackId = id;
      loopLength = length;
      settings = { ...DEFAULT_QUANTIZE };
      selection = new Set(t.notes.map((n) => n.id));
    },
    close() {
      trackId = null;
      selection.clear();
    },
    setLoopLength(length: number) {
      loopLength = length;
    },
    /** 轨道内容被外部替换后（如恢复 / 清空）刷新工作副本，剔除已消失的音符。 */
    refresh() {
      const t = track();
      if (!t) {
        this.close();
        return;
      }
      selection = new Set(
        t.notes.filter((n) => selection.has(n.id)).map((n) => n.id),
      );
    },
    update(patch: Partial<QuantizeSettings>) {
      if (!trackId) return;
      if (
        patch.grid !== undefined &&
        QUANT_GRIDS.includes(patch.grid as (typeof QUANT_GRIDS)[number])
      )
        settings.grid = patch.grid;
      if (patch.strength !== undefined)
        settings.strength = Math.min(1, Math.max(0, patch.strength));
      if (patch.scope === "start" || patch.scope === "both")
        settings.scope = patch.scope;
      if (patch.boundary === "next" || patch.boundary === "stay")
        settings.boundary = patch.boundary;
    },
    selectAll() {
      const t = track();
      if (t) selection = new Set(t.notes.map((n) => n.id));
    },
    selectNone() {
      selection.clear();
    },
    toggleNote(id: string) {
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
    },
    setSelected(ids: readonly string[]) {
      const valid = new Set(track()?.notes.map((n) => n.id) ?? []);
      selection = new Set(ids.filter((id) => valid.has(id)));
    },
    snapshot(length: number): QuantizeSnapshot {
      loopLength = length;
      const t = track();
      if (!t || !trackId)
        return {
          open: false,
          trackId: null,
          trackName: "",
          settings: { ...settings },
          selectedCount: 0,
          totalCount: 0,
          previews: [],
        };
      const previews = buildPreviews();
      return {
        open: true,
        trackId,
        trackName: t.name,
        settings: { ...settings },
        selectedCount: previews.filter((p) => p.selected).length,
        totalCount: previews.length,
        previews,
      };
    },
    /** 应用到选中的音符：只改 beat/duration，原始演奏保持不动。 */
    apply(length: number) {
      const t = track();
      if (!t || !trackId) throw new Error("量化工作台未打开");
      loopLength = length;
      if (selection.size === 0) throw new Error("请先选择至少一个音符");
      const chosen = new Set(selection);
      const next = t.notes.map((note) => {
        if (!chosen.has(note.id)) return note;
        const preview = quantizeTiming(originalOf(note), loopLength, settings);
        return {
          ...note,
          beat: preview.beat,
          duration: preview.duration,
          // 首次应用时固化恢复基准；之后不再覆盖，杜绝累计误差。
          original: note.original ?? { beat: note.beat, duration: note.duration },
        };
      });
      arrangement.commit(trackId, next);
    },
    /** 把选中音符恢复成原始演奏；旧存档无 original 时恢复到打开时的结果。 */
    restoreSelected() {
      const t = track();
      if (!t || !trackId) throw new Error("量化工作台未打开");
      if (selection.size === 0) throw new Error("请先选择至少一个音符");
      const chosen = new Set(selection);
      const next = t.notes.map((note) => {
        if (!chosen.has(note.id)) return note;
        const original = originalOf(note);
        return { ...note, beat: original.beat, duration: original.duration };
      });
      arrangement.commit(trackId, next);
    },
  };
}

export type Quantizer = ReturnType<typeof createQuantizer>;
export type { QuantizeSettings, QuantScope, QuantBoundary };
