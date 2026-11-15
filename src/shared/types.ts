export type Instrument = "drums" | "keys";
export type Note = {
  id: string;
  pitch: number;
  beat: number;
  duration: number;
  velocity: number;
  /**
   * 原始演奏位置，独立于量化结果保存。每次量化都从它重新计算，
   * 因此反复更换网格或强度不会累计取整误差。旧存档没有该字段时，
   * 以当前 beat/duration 作为恢复基准（见 quantizer.ensureOriginal）。
   */
  original?: { beat: number; duration: number };
};
export type Track = {
  id: string;
  name: string;
  instrument: Instrument;
  color: string;
  notes: Note[];
};
export type Channel = { volume: number; muted: boolean };
export type Session = {
  version: 1;
  title: string;
  bpm: number;
  beats: number;
  tracks: Track[];
  channels: Record<string, Channel>;
  master: number;
};
export type NoteInput = {
  pitch: number;
  velocity: number;
  instrument: Instrument;
};
export type ScheduledNote = NoteInput & {
  duration: number;
  when: number;
  trackId: string;
  /** 关联编排音符 id，用于播放中撤销尚未发声或仍在响的事件。 */
  noteId?: string;
};
export type Listener = () => void;
