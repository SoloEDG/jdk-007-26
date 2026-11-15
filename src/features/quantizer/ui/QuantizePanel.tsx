import type { Quantizer, QuantizeSnapshot } from "../model/quantizer";
import { MIN_NOTE_DURATION } from "../lib/quantize";
import { beatLabel } from "@/shared/math";

type Settings = QuantizeSnapshot["settings"];

const rangeLabel = (values: number[]) => {
  if (!values.length) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? beatLabel(min) : `${beatLabel(min)} – ${beatLabel(max)}`;
};

export function QuantizePanel({
  state,
  busy,
  update,
  apply,
  restore,
  selectAll,
  selectNone,
  close,
}: {
  state: QuantizeSnapshot;
  /** 该轨道正在录音：录音中的轨道拒绝应用，只允许关闭工作台。 */
  busy: boolean;
  update: (patch: Partial<Settings>) => void;
  apply: () => void;
  restore: () => void;
  selectAll: () => void;
  selectNone: () => void;
  close: () => void;
}) {
  const s = state.settings;
  const none = state.selectedCount === 0;
  const chosen = state.previews.filter((p) => p.selected);
  return (
    <div className="quantize-panel" aria-label="量化工作台">
      <div className="quantize-head">
        <strong>量化工作台 · {state.trackName}</strong>
        <button className="quantize-close" onClick={close} aria-label="退出量化预览">
          ×
        </button>
      </div>
      <p className="quantize-note">
        预览只用于试听，不会改动正式内容；原始拍位单独保存，反复更换网格不会累计误差。
      </p>
      <div className="quantize-controls">
        <label>
          网格
          <select
            aria-label="量化网格"
            value={s.grid}
            disabled={busy}
            onChange={(e) => update({ grid: Number(e.target.value) })}
          >
            <option value="0.25">1/16 音符</option>
            <option value="0.5">1/8 音符</option>
            <option value="1">1/4 音符</option>
          </select>
        </label>
        <label className="quantize-strength">
          强度
          <input
            aria-label="量化强度"
            type="range"
            min={0}
            max={100}
            value={Math.round(s.strength * 100)}
            disabled={busy}
            onChange={(e) => update({ strength: Number(e.target.value) / 100 })}
          />
          <b>{Math.round(s.strength * 100)}%</b>
        </label>
        <label>
          范围
          <select
            aria-label="量化范围"
            value={s.scope}
            disabled={busy}
            onChange={(e) => update({ scope: e.target.value as Settings["scope"] })}
          >
            <option value="start">只处理起点</option>
            <option value="both">起点 + 结束点</option>
          </select>
        </label>
        <label>
          末尾归属
          <select
            aria-label="循环末尾归属"
            value={s.boundary}
            disabled={busy}
            onChange={(e) =>
              update({ boundary: e.target.value as Settings["boundary"] })
            }
          >
            <option value="next">越过末尾归到下一圈</option>
            <option value="stay">留在本圈末尾</option>
          </select>
        </label>
      </div>
      <div className="quantize-actions">
        <button onClick={selectAll} disabled={busy}>
          全选 {state.totalCount}
        </button>
        <button onClick={selectNone} disabled={busy || none}>
          清空选择
        </button>
        <span className="quantize-count">
          已选 {state.selectedCount} / {state.totalCount} 个音符
        </span>
        <button className="quantize-restore" onClick={restore} disabled={busy || none}>
          ↺ 恢复原始演奏
        </button>
        <button className="quantize-apply" onClick={apply} disabled={busy || none}>
          {busy ? "录音进行中，拒绝应用" : "应用到选中音符"}
        </button>
      </div>
      <div className="quantize-readout" aria-live="polite">
        <span>
          原始位置 <b>{rangeLabel(chosen.map((p) => p.original.beat))}</b>
        </span>
        <span>
          预览位置 <b>{rangeLabel(chosen.map((p) => p.preview.beat))}</b>
        </span>
        <span>
          当前结果 <b>{rangeLabel(chosen.map((p) => p.note.beat))}</b>
        </span>
      </div>
      <p className="quantize-note">
        长音缩短后保留最短有效时长 {MIN_NOTE_DURATION} 拍；点击时间线上的音符可增减选择。
      </p>
    </div>
  );
}

export type QuantizePanelProps = Parameters<typeof QuantizePanel>[0];
export type { Quantizer };
