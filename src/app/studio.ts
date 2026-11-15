import { createEngine, bindPerformanceInput } from "@/features/instruments";
import { createTransport, scheduleWindow } from "@/features/transport";
import { createRecorder } from "@/features/recorder";
import {
  createArrangement,
  demoSession,
  saveSession,
  loadSession,
} from "@/features/arrangement";
import { createMixer } from "@/features/mixer";
import {
  createQuantizer,
  type QuantizeSnapshot,
  type Quantizer,
} from "@/features/quantizer";
import type { NoteInput, Instrument, Session, Track } from "@/shared/types";
export function createStudio(notify: () => void) {
  const engine = createEngine(),
    transport = createTransport(),
    recorder = createRecorder(),
    arrangement = createArrangement(),
    quantizer = createQuantizer(arrangement),
    mixer = createMixer();
  const active = new Set<string>();
  let message = "欢迎来到夜航。戴上耳机，试着敲下第一拍。",
    epoch = 0,
    disposed = false;
  const now = () => engine.context?.currentTime ?? 0;
  const feedback = (text: string) => {
    message = text;
    notify();
  };
  const guard = (fn: () => void) => {
    try {
      fn();
      notify();
    } catch (error) {
      feedback(
        error instanceof Error ? error.message : "操作失败，现有作品已保留",
      );
    }
  };
  const syncMixer = () =>
    mixer.ensure(arrangement.snapshot().tracks.map((t) => t.id));
  const cancelVoices = () => {
    engine.cancel();
    active.clear();
  };
  const stop = () => {
    epoch++;
    transport.stop();
    recorder.cancel();
    quantizer.close();
    cancelVoices();
    notify();
  };
  const pause = () => {
    epoch++;
    transport.pause(now());
    recorder.cancel();
    cancelVoices();
    feedback("播放已暂停；未完成录音已取消，原片段保留。");
  };
  const unlock = async () => {
    const context = await engine.unlock();
    if (disposed) return false;
    mixer.attach(context);
    syncMixer();
    engine.route(mixer.channel);
    return true;
  };
  const play = async () => {
    const token = ++epoch;
    try {
      if (!(await unlock()) || token !== epoch) return;
      transport.start(now() + 0.02);
      tick();
      notify();
    } catch {
      feedback("声音启动失败，请再次点击播放");
    }
  };
  /**
   * 试听阶段不改正式内容：把量化预览覆盖到工作台轨道的播放副本上，
   * 预览与播放使用同一份选择与同一份结果。
   */
  const playbackTracks = (): Track[] => {
    const tracks = arrangement.forPlayback();
    const q = quantizer.openId;
    if (!q) return tracks;
    const length = transport.view(now()).beats;
    const snap = quantizer.snapshot(length);
    const preview = new Map(snap.previews.map((p) => [p.note.id, p.preview]));
    return tracks.map((t) =>
      t.id !== q
        ? t
        : {
            ...t,
            notes: t.notes.map((n) => {
              const p = preview.get(n.id);
              return p ? { ...n, beat: p.beat, duration: p.duration } : n;
            }),
          },
    );
  };
  /**
   * 撤销旧事件：播放中预览变化或应用 / 恢复 / 取消时调用，
   * 尚未发声的旧事件不再响，已经发声的失效长音立即释放。
   */
  const revokeTrack = (trackId: string, noteIds?: ReadonlySet<string>) => {
    engine.revokeNotes({ trackId, noteIds });
  };
  const tick = () => {
    const time = now(),
      view = transport.view(time);
    const take = recorder.advance(view.absolute);
    if (take)
      guard(() => {
        arrangement.commit(take.trackId, take.notes);
        message = `录制完成 · ${take.notes.length} 个音符`;
      });
    const capture = recorder.snapshot();
    const ceiling =
      capture.status === "idle" ? Infinity : capture.start + capture.length;
    const window = transport.window(time, ceiling);
    if (window)
      scheduleWindow(
        playbackTracks(),
        window.from,
        window.to,
        view.beats,
        view.bpm,
        window.timeAt,
        (n) => engine.play(n),
      );
  };
  const down = async (id: string, note: NoteInput) => {
    if (active.has(id)) return;
    active.add(id);
    notify();
    try {
      if (!(await unlock()) || !active.has(id)) return;
      const target = arrangement.selected();
      if (!target || target.instrument !== note.instrument) {
        active.delete(id);
        feedback("请先选择对应乐器的轨道");
        return;
      }
      const abs = transport.view(now()).absolute;
      const take = recorder.advance(abs);
      if (take) arrangement.commit(take.trackId, take.notes);
      recorder.down(id, note, abs);
      engine.play(
        {
          ...note,
          trackId: target.id,
          duration: note.instrument === "keys" ? 6 : 0.3,
          when: now(),
        },
        id,
      );
    } catch {
      active.delete(id);
      feedback("请点击播放以启用声音");
    }
  };
  const up = (id: string) => {
    if (!active.delete(id)) return;
    recorder.up(id, transport.view(now()).absolute);
    engine.release(id);
    notify();
  };
  const install = (session: Session) => {
    stop();
    const valid = arrangement.restore(session);
    transport.configure(valid.bpm, valid.beats);
    mixer.restore(valid.channels, valid.master);
    quantizer.close();
    notify();
  };
  const timer = window.setInterval(() => {
    tick();
    notify();
  }, 20);
  const unbind = bindPerformanceInput((id, note) => void down(id, note), up);
  const shortcut = (e: KeyboardEvent) => {
    if (
      e.code === "Space" &&
      !e.repeat &&
      !/INPUT|TEXTAREA|SELECT|BUTTON/.test((e.target as HTMLElement).tagName)
    ) {
      e.preventDefault();
      if (transport.view(now()).running) pause();
      else void play();
    }
  };
  const blur = () => {
    for (const id of [...active]) up(id);
  };
  window.addEventListener("keydown", shortcut);
  window.addEventListener("blur", blur);
  return {
    view() {
      const beats = transport.view(now()).beats;
      const qSnap: QuantizeSnapshot | null = quantizer.isOpen()
        ? quantizer.snapshot(beats)
        : null;
      return {
        transport: transport.view(now()),
        arrangement: arrangement.snapshot(),
        selected: arrangement.selected(),
        recorder: recorder.snapshot(),
        quantizer: qSnap,
        /** 录音正在进行的轨道拒绝应用量化。 */
        quantizerBusy:
          qSnap !== null &&
          recorder.snapshot().status !== "idle" &&
          recorder.snapshot().trackId === qSnap.trackId,
        mixer: mixer.snapshot(),
        active: new Set(active),
        message,
      };
    },
    play,
    pause,
    stop,
    down: (id: string, n: NoteInput) => void down(id, n),
    up,
    configure(bpm: number, beats: number) {
      stop();
      transport.configure(bpm, beats);
      const next = transport.view(now()).beats;
      arrangement.resizeLoop(next);
      quantizer.setLoopLength(next);
      quantizer.refresh();
      feedback("速度或长度变更：播放回到起点；缩短时移除范围外音符。");
    },
    add(kind: Instrument) {
      guard(() => {
        arrangement.add(kind);
        syncMixer();
      });
    },
    select(id: string) {
      if (recorder.snapshot().status !== "idle") return;
      if (quantizer.isOpen() && quantizer.openId !== id) {
        feedback("请先关闭量化工作台，再切换到其他轨道。");
        return;
      }
      engine.releaseHeld();
      active.clear();
      arrangement.select(id);
      notify();
    },
    remove() {
      guard(() => {
        const selected = arrangement.selected();
        if (selected) {
          stop();
          arrangement.remove(selected.id);
          quantizer.close();
          syncMixer();
        }
      });
    },
    clear() {
      guard(() => {
        const t = arrangement.selected();
        if (t) {
          stop();
          arrangement.clear(t.id);
          quantizer.close();
        }
      });
    },
    async record() {
      const selected = arrangement.selected();
      if (!selected) return;
      if (quantizer.isOpen()) {
        feedback("该轨道正在量化预览，请先关闭量化工作台再录音。");
        return;
      }
      const token = ++epoch;
      try {
        if (!(await unlock()) || token !== epoch) return;
        const state = transport.view(now());
        if (!state.running) transport.start(now() + 0.02);
        recorder.arm(
          selected.id,
          selected.instrument,
          transport.view(now()).absolute,
          state.beats,
        );
        tick();
        notify();
      } catch {
        feedback("录音启动失败，请重试");
      }
    },
    cancel() {
      recorder.cancel();
      feedback("本次录音已取消，之前的片段仍然保留。");
    },
    grid(n: number) {
      recorder.grid(n);
      notify();
    },
    openQuantizer() {
      guard(() => {
        const t = arrangement.selected();
        if (!t) throw new Error("请先选择一条轨道");
        if (!t.notes.length) throw new Error("该轨道还没有音符可量化");
        if (recorder.snapshot().status !== "idle")
          throw new Error("录音进行中，无法打开量化工作台");
        quantizer.open(t.id, transport.view(now()).beats);
        message = "量化工作台已打开：调整参数只生成预览，应用前不会改动音符。";
      });
    },
    closeQuantizer() {
      const trackId = quantizer.openId;
      quantizer.close();
      // 取消预览：撤销该轨道尚未发声的旧事件并释放失效长音，下一节拍恢复正式内容。
      if (trackId) revokeTrack(trackId);
      feedback("已退出量化预览，正式内容未做任何改动。");
    },
    updateQuantizer(patch: Parameters<Quantizer["update"]>[0]) {
      const trackId = quantizer.openId;
      if (!trackId) return;
      quantizer.update(patch);
      // 预览变了：播放中立刻撤销旧排期，下一窗口按新预览重新发声，不能靠暂停回避。
      revokeTrack(trackId);
      notify();
    },
    selectQuantizerNote(noteId: string) {
      if (!quantizer.isOpen()) return;
      const trackId = quantizer.openId!;
      quantizer.toggleNote(noteId);
      revokeTrack(trackId);
      notify();
    },
    quantizerSelectAll() {
      const trackId = quantizer.openId;
      if (!trackId) return;
      quantizer.selectAll();
      revokeTrack(trackId);
      notify();
    },
    quantizerSelectNone() {
      const trackId = quantizer.openId;
      if (!trackId) return;
      quantizer.selectNone();
      revokeTrack(trackId);
      notify();
    },
    applyQuantizer() {
      guard(() => {
        const snap = recorder.snapshot();
        const trackId = quantizer.openId;
        if (!trackId) throw new Error("量化工作台未打开");
        // 录音正在进行的轨道拒绝应用。
        if (snap.status !== "idle" && snap.trackId === trackId)
          throw new Error("该轨道正在录音，拒绝应用量化");
        const before = new Map(
          arrangement
            .snapshot()
            .tracks.find((t) => t.id === trackId)!
            .notes.map((n) => [n.id, n]),
        );
        quantizer.apply(transport.view(now()).beats);
        // 播放中确认：撤销尚未发声的旧事件、释放已失效的长音，随后按新结果排期。
        revokeTrack(trackId);
        quantizer.refresh();
        const moved = quantizer
          .snapshot(transport.view(now()).beats)
          .previews.filter((p) => {
            const old = before.get(p.note.id);
            return (
              old &&
              (Math.abs(old.beat - p.note.beat) > 1e-9 ||
                Math.abs(old.duration - p.note.duration) > 1e-9)
            );
          }).length;
        message = `已应用到选中音符 · ${moved} 个音符位置更新，原始演奏已保留可随时恢复。`;
      });
    },
    restoreQuantizer() {
      guard(() => {
        const trackId = quantizer.openId;
        if (!trackId) throw new Error("量化工作台未打开");
        quantizer.restoreSelected();
        revokeTrack(trackId);
        quantizer.refresh();
        feedback("选中音符已恢复为原始演奏；原始基准仍保留，可继续预览其他网格。");
      });
    },
    volume(id: string, n: number) {
      mixer.volume(id, n);
      notify();
    },
    mute(id: string) {
      mixer.mute(id);
      notify();
    },
    master(n: number) {
      mixer.master(n);
      notify();
    },
    demo() {
      guard(() => {
        install(demoSession());
        message = "示范已载入 · 点击播放，听听凌晨两点。";
      });
    },
    save() {
      guard(() => {
        if (recorder.snapshot().status !== "idle")
          throw new Error("请完成或取消录音后再保存");
        const a = arrangement.snapshot(),
          t = transport.view(now()),
          m = mixer.snapshot();
        saveSession({
          version: 1,
          title: a.title,
          bpm: t.bpm,
          beats: t.beats,
          tracks: a.tracks,
          channels: m.channels,
          master: m.master,
        });
        message = "作品已保存到本机浏览器";
      });
    },
    load() {
      guard(() => {
        const session = loadSession();
        install(session);
        message = "本地作品已恢复";
      });
    },
    dispose() {
      disposed = true;
      epoch++;
      clearInterval(timer);
      unbind();
      window.removeEventListener("keydown", shortcut);
      window.removeEventListener("blur", blur);
      mixer.dispose();
      engine.dispose();
    },
  };
}
export type Studio = ReturnType<typeof createStudio>;
