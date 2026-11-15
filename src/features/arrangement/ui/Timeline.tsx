import type { Track, Note } from "@/shared/types";
import type { QuantizeSnapshot } from "@/features/quantizer";

export function Timeline({
  tracks,
  selected,
  position,
  beats,
  draft,
  quantizer,
  select,
  toggleNote,
}: {
  tracks: readonly Track[];
  selected: string | null;
  position: number;
  beats: number;
  draft: readonly Note[];
  quantizer: QuantizeSnapshot | null;
  select: (id: string) => void;
  toggleNote: (trackId: string, noteId: string) => void;
}) {
  const q = quantizer?.open ? quantizer : null;
  const previewById = q
    ? new Map(q.previews.map((p) => [p.note.id, p]))
    : null;
  return (
    <div className="timeline-scroll">
      <div className="timeline" style={{ minWidth: 500 }}>
        <div className="ruler">
          <span>轨道 / TRACK</span>
          <div>
            {Array.from({ length: beats / 4 }, (_, i) => (
              <b key={i}>{String(i + 1).padStart(2, "0")}</b>
            ))}
          </div>
        </div>
        {tracks.map((track, i) => {
          const isQuantTrack = q?.trackId === track.id;
          return (
            <div
              className={`lane ${selected === track.id ? "selected" : ""}`}
              key={track.id}
            >
              <button className="lane-name" onClick={() => select(track.id)}>
                <span style={{ color: track.color }}>0{i + 1}</span>
                <strong>{track.name}</strong>
                <small>
                  {track.instrument === "drums" ? "DRUM MACHINE" : "POLY SYNTH"}
                </small>
              </button>
              <div
                className="lane-notes"
                style={{ "--bars": beats / 4 } as React.CSSProperties}
              >
                {[...track.notes, ...(selected === track.id ? draft : [])].map(
                  (n) => {
                    const preview = previewById?.get(n.id);
                    const shown = preview ?? {
                      note: n,
                      preview: { beat: n.beat, duration: n.duration },
                      original: { beat: n.beat, duration: n.duration },
                      selected: false,
                      moved: false,
                    };
                    const inDraft = draft.includes(n);
                    return (
                      <span className="note-slot" key={n.id}>
                        {preview && (
                          <i
                            className="note-original"
                            title={`原始位置 ${shown.original.beat.toFixed(2)} 拍`}
                            style={{
                              left: `${(shown.original.beat / beats) * 100}%`,
                            }}
                          />
                        )}
                        <span
                          className={[
                            "note-block",
                            inDraft ? "draft" : "",
                            preview ? "quantizable" : "",
                            preview?.selected ? "in-range" : "",
                            preview && !preview.selected ? "out-range" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={
                            preview
                              ? () => toggleNote(track.id, n.id)
                              : undefined
                          }
                          title={
                            preview
                              ? `原始 ${shown.original.beat.toFixed(2)} → 预览 ${shown.preview.beat.toFixed(2)}（点击${preview.selected ? "移出" : "加入"}选择）`
                              : undefined
                          }
                          style={{
                            left: `${(shown.preview.beat / beats) * 100}%`,
                            width: `${Math.max(0.6, (Math.min(shown.preview.duration, beats - shown.preview.beat) / beats) * 100)}%`,
                            top: `${12 + (track.instrument === "drums" ? n.pitch : (((72 - n.pitch) % 12) + 12) % 12) * 3}%`,
                            background: track.color,
                          }}
                        />
                      </span>
                    );
                  },
                )}
                <i
                  className="playhead"
                  style={{ left: `${(position / beats) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
        {tracks.length === 0 && (
          <div className="empty-arrangement">
            <span>♫</span>
            <h3>第一拍，从你开始</h3>
            <p>添加鼓组或琴键轨道，录下属于你的循环。</p>
          </div>
        )}
        {q && (
          <p className="quantize-legend">
            <i className="dot original-dot" /> 原位置
            <i className="dot preview-dot" /> 预览（试听即此结果）
            <i className="dot range-dot" /> 选中范围
          </p>
        )}
      </div>
    </div>
  );
}
