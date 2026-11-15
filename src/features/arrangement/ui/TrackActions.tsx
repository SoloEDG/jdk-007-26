import type { Instrument, Track } from "@/shared/types";
export function TrackActions({
  selected,
  count,
  locked,
  quantizing,
  add,
  remove,
  clear,
  openQuantizer,
}: {
  selected: Track | null;
  count: number;
  locked: boolean;
  quantizing: boolean;
  add: (kind: Instrument) => void;
  remove: () => void;
  clear: () => void;
  openQuantizer: () => void;
}) {
  return (
    <div className="track-actions">
      <button disabled={locked || count >= 8} onClick={() => add("drums")}>
        ＋ 鼓组轨道
      </button>
      <button disabled={locked || count >= 8} onClick={() => add("keys")}>
        ＋ 琴键轨道
      </button>
      <span>{count} / 8 轨道</span>
      <button
        className={quantizing ? "on" : ""}
        disabled={locked || !selected || !selected.notes.length}
        onClick={openQuantizer}
      >
        {quantizing ? "量化预览中" : "量化已有音符"}
      </button>
      <button
        disabled={locked || !selected || !selected.notes.length}
        onClick={clear}
      >
        清空音符
      </button>
      <button
        disabled={locked || !selected}
        onClick={remove}
        aria-label="删除选中轨道"
      >
        删除轨道
      </button>
    </div>
  );
}
