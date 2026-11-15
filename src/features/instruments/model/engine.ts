import type { Instrument, ScheduledNote } from "@/shared/types";
import { synthesize, type Voice } from "../lib/voices";

type Entry = {
  voice: Voice;
  noteId?: string;
  trackId: string;
  start: number;
};

export function createEngine() {
  let context: AudioContext | null = null;
  let destination: ((id: string) => AudioNode) | null = null;
  /** 已排期（可能尚未发声）与正在发声的全部事件，按内部 id 存放。 */
  const scheduled = new Map<string, Entry>();
  const held = new Map<string, string>();

  const prune = () => {
    if (!context) return;
    const now = context.currentTime;
    for (const [id, entry] of scheduled)
      if (entry.voice.end < now) scheduled.delete(id);
  };

  return {
    get context() {
      return context;
    },
    async unlock() {
      context ??= new AudioContext();
      if (context.state === "suspended") await context.resume();
      return context;
    },
    route(resolve: (id: string) => AudioNode) {
      destination = resolve;
    },
    play(note: ScheduledNote, key?: string) {
      if (!context || !destination) return;
      prune();
      const id = crypto.randomUUID();
      scheduled.set(id, {
        voice: synthesize(context, destination(note.trackId), note),
        noteId: note.noteId,
        trackId: note.trackId,
        start: note.when,
      });
      if (key && note.instrument === "keys") held.set(key, id);
    },
    release(key: string) {
      const id = held.get(key);
      if (id) {
        scheduled.get(id)?.voice.stop();
        scheduled.delete(id);
        held.delete(key);
      }
    },
    releaseHeld() {
      for (const id of held.values()) {
        scheduled.get(id)?.voice.stop();
        scheduled.delete(id);
      }
      held.clear();
    },
    /**
     * 播放中编排发生变化时撤销旧事件：
     * - 尚未发声（起点在当前时间之后）的事件直接取消，不会响；
     * - 已经发声的长音立即释放，避免失效音符继续响。
     * 可按轨道 / 音符 id 限定范围。
     */
    revokeNotes(filter: { trackId?: string; noteIds?: ReadonlySet<string> }) {
      if (!context) return;
      const now = context.currentTime;
      for (const [id, entry] of scheduled) {
        if (filter.trackId !== undefined && entry.trackId !== filter.trackId)
          continue;
        if (
          filter.noteIds !== undefined &&
          (!entry.noteId || !filter.noteIds.has(entry.noteId))
        )
          continue;
        entry.voice.stop();
        scheduled.delete(id);
        for (const [key, heldId] of held)
          if (heldId === id) held.delete(key);
      }
    },
    cancel() {
      for (const entry of scheduled.values()) entry.voice.stop();
      scheduled.clear();
      held.clear();
    },
    releaseInstrument(_instrument: Instrument) {
      this.cancel();
    },
    dispose() {
      this.cancel();
      void context?.close();
      context = null;
      destination = null;
    },
  };
}
export type Engine = ReturnType<typeof createEngine>;
