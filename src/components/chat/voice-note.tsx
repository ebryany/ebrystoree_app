import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, SendHorizontal, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

const MAX_VN_SECONDS = 300;
const BAR_COUNT = 28;

// Koordinator global agar hanya 1 voice note yang diputar dalam satu waktu.
let activeAudioEl: HTMLAudioElement | null = null;
const activeListeners = new Set<(el: HTMLAudioElement | null) => void>();

function claimActiveAudio(el: HTMLAudioElement | null) {
  if (activeAudioEl && activeAudioEl !== el) {
    activeAudioEl.pause();
  }
  activeAudioEl = el;
  activeListeners.forEach((fn) => fn(el));
}

export function formatAudioClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/aac",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

function downsampleBars(samples: number[], target = BAR_COUNT): number[] {
  if (!samples.length) {
    return Array.from({ length: target }, (_, i) => 22 + ((i * 19) % 58));
  }
  const out: number[] = [];
  const step = samples.length / target;
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end && j < samples.length; j++) sum += samples[j];
    const avg = sum / Math.max(1, end - start);
    out.push(Math.max(12, Math.min(100, Math.round(avg))));
  }
  return out;
}

export type RecordedVoiceNote = {
  file: File;
  durationSec: number;
  waveform: number[];
};

/**
 * Panel rekam Voice Note (VN) gaya WhatsApp di dalam Composer:
 * - Timer real-time, visualisasi gelombang suara live (AnalyserNode), jeda/lanjut,
 *   batal (hapus), dan tombol kirim.
 * - Otomatis menghentikan seluruh track mikrofon saat unmount/batal/kirim.
 */
export function VoiceNoteRecorder({
  onCancel,
  onSend,
  onRecordingPulse,
  onError,
}: {
  onCancel: () => void;
  onSend: (vn: RecordedVoiceNote) => void;
  onRecordingPulse?: (active: boolean) => void;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<"starting" | "recording" | "paused">("starting");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>(() => Array(20).fill(18));

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const samplesRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const intentRef = useRef<"cancel" | "send">("cancel");
  const mimeRef = useRef("audio/webm");

  const cleanupMedia = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    onRecordingPulse?.(false);
  };

  useEffect(() => {
    let mounted = true;

    async function start() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        onError("Browser ini belum mendukung rekaman pesan suara.");
        onCancel();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const chosenMime = pickSupportedAudioMime();
        const recorder = chosenMime
          ? new MediaRecorder(stream, { mimeType: chosenMime })
          : new MediaRecorder(stream);
        mimeRef.current = recorder.mimeType || chosenMime || "audio/webm";
        recorderRef.current = recorder;
        chunksRef.current = [];
        samplesRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };

        recorder.onstop = () => {
          const action = intentRef.current;
          const duration = Math.max(1, elapsedRef.current);
          const rawMime = mimeRef.current;
          const baseMime = rawMime.split(";")[0]?.trim() || "audio/webm";
          const ext = baseMime.includes("mp4")
            ? "m4a"
            : baseMime.includes("ogg")
              ? "ogg"
              : baseMime.includes("mpeg")
                ? "mp3"
                : "webm";
          const blob = new Blob(chunksRef.current, { type: baseMime });
          const waveform = downsampleBars(samplesRef.current, BAR_COUNT);
          cleanupMedia();

          if (action === "send" && blob.size > 0) {
            const file = new File([blob], `pesan-suara-${Date.now()}.${ext}`, { type: baseMime });
            onSend({ file, durationSec: duration, waveform });
          } else {
            onCancel();
          }
        };

        // Visualisasi gelombang suara live
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            src.connect(analyser);
            const dataArr = new Uint8Array(analyser.frequencyBinCount);
            let lastPush = 0;
            const tick = (ts: number) => {
              if (!mounted) return;
              if (recorderRef.current?.state === "recording" && ts - lastPush > 90) {
                lastPush = ts;
                analyser.getByteFrequencyData(dataArr);
                let sum = 0;
                for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
                const level = Math.max(14, Math.min(100, Math.round((sum / dataArr.length / 255) * 145)));
                samplesRef.current.push(level);
                setLiveBars((prev) => [...prev.slice(1), level]);
              }
              rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
          }
        } catch {
          /* visualisasi opsional; rekaman tetap jalan */
        }

        recorder.start(250);
        setStatus("recording");
        onRecordingPulse?.(true);

        timerRef.current = setInterval(() => {
          if (recorderRef.current?.state === "recording") {
            elapsedRef.current += 1;
            setElapsedSec(elapsedRef.current);
            onRecordingPulse?.(true);
            if (elapsedRef.current >= MAX_VN_SECONDS) {
              intentRef.current = "send";
              recorderRef.current?.stop();
            }
          }
        }, 1000);
      } catch (err: any) {
        cleanupMedia();
        const name = String(err?.name ?? "");
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          onError("Izin mikrofon ditolak. Aktifkan mikrofon di pengaturan browser untuk mengirim VN.");
        } else if (name === "NotFoundError") {
          onError("Mikrofon tidak ditemukan di perangkat ini.");
        } else {
          onError("Tidak dapat memulai rekaman suara. Pastikan halaman dibuka lewat HTTPS atau localhost.");
        }
        onCancel();
      }
    }

    void start();
    return () => {
      mounted = false;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        intentRef.current = "cancel";
        try {
          recorderRef.current.stop();
        } catch {
          cleanupMedia();
        }
      } else {
        cleanupMedia();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCancel() {
    intentRef.current = "cancel";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      cleanupMedia();
      onCancel();
    }
  }

  function handleSend() {
    if (status === "starting") return;
    intentRef.current = "send";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  function handleTogglePause() {
    const rec = recorderRef.current;
    if (!rec || typeof rec.pause !== "function" || typeof rec.resume !== "function") return;
    if (rec.state === "recording") {
      rec.pause();
      setStatus("paused");
      onRecordingPulse?.(false);
    } else if (rec.state === "paused") {
      rec.resume();
      setStatus("recording");
      onRecordingPulse?.(true);
    }
  }

  const canPause =
    typeof recorderRef.current?.pause === "function" &&
    typeof recorderRef.current?.resume === "function";

  return (
    <div
      role="region"
      aria-label="Merekam pesan suara"
      className="pb-safe flex items-center gap-1.5 border-t border-border/60 bg-card/95 px-2 py-2 backdrop-blur-xl sm:gap-2 sm:px-3"
    >
      <button
        type="button"
        onClick={handleCancel}
        aria-label="Batalkan pesan suara"
        className="grid size-11 shrink-0 place-items-center rounded-full text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </button>

      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-background px-3">
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2.5 rounded-full bg-destructive",
              status === "recording" && "motion-safe:animate-pulse",
            )}
          />
          <span className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
            {formatAudioClock(elapsedSec)}
          </span>
        </span>

        {/* Gelombang suara live */}
        <div
          aria-hidden="true"
          className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden"
        >
          {liveBars.map((level, i) => (
            <span
              key={i}
              className="w-[3px] shrink-0 rounded-full bg-primary/70 transition-[height] duration-100 motion-reduce:transition-none"
              style={{ height: `${Math.max(20, level)}%` }}
            />
          ))}
        </div>

        <span className="sr-only" aria-live="polite">
          {status === "paused" ? "Rekaman dijeda" : "Sedang merekam pesan suara"}
        </span>
      </div>

      {canPause && status !== "starting" ? (
        <button
          type="button"
          onClick={handleTogglePause}
          aria-label={status === "paused" ? "Lanjutkan rekaman" : "Jeda rekaman"}
          className="grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {status === "paused" ? (
            <Mic className="size-5 text-destructive" aria-hidden="true" />
          ) : (
            <Pause className="size-5" aria-hidden="true" />
          )}
        </button>
      ) : null}

      <button
        type="button"
        onClick={handleSend}
        disabled={status === "starting"}
        aria-label="Kirim pesan suara"
        className="press-scale grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
          {status === "starting" ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <SendHorizontal className="size-[18px]" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
}

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Bubble pemutar Voice Note (VN) ala WhatsApp:
 * - Tombol Play/Pause 44px, 28 bar waveform interaktif yang bisa di-seek,
 *   durasi berjalan, tombol kecepatan 1x/1.5x/2x, serta auto-refresh URL saat error.
 */
export function VoiceNotePlayer({
  url,
  durationSec,
  waveform,
  mine,
  onUrlError,
}: {
  url?: string;
  durationSec?: number;
  waveform?: number[];
  mine: boolean;
  onUrlError?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(durationSec ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const retriedRef = useRef(false);

  const bars =
    waveform && waveform.length >= 8
      ? downsampleBars(waveform, BAR_COUNT)
      : downsampleBars([], BAR_COUNT);

  useEffect(() => {
    const listener = (active: HTMLAudioElement | null) => {
      if (audioRef.current && active !== audioRef.current) {
        setPlaying(false);
      }
    };
    activeListeners.add(listener);
    return () => {
      activeListeners.delete(listener);
      if (audioRef.current && activeAudioEl === audioRef.current) {
        audioRef.current.pause();
        claimActiveAudio(null);
      }
    };
  }, []);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    claimActiveAudio(audio);
    audio.playbackRate = SPEEDS[speedIndex];
    void audio.play().catch(() => setPlaying(false));
  }

  function cycleSpeed() {
    const nextIdx = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIdx);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[nextIdx];
  }

  function seekToFraction(frac: number) {
    const audio = audioRef.current;
    const dur = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalSec;
    if (!audio || !dur) return;
    const clamped = Math.max(0, Math.min(1, frac));
    audio.currentTime = clamped * dur;
    setCurrentSec(clamped * dur);
  }

  const progress = totalSec > 0 ? Math.min(1, currentSec / totalSec) : 0;

  return (
    <div className="flex min-w-[220px] max-w-full items-center gap-2.5 py-0.5 sm:min-w-[256px]">
      {url ? (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentSec(0);
          }}
          onTimeUpdate={(e) => setCurrentSec(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setTotalSec(Math.round(d));
          }}
          onError={() => {
            if (!retriedRef.current && onUrlError) {
              retriedRef.current = true;
              onUrlError();
            } else {
              setFailed(true);
            }
          }}
        />
      ) : null}

      <button
        type="button"
        disabled={!url || failed}
        onClick={togglePlay}
        aria-label={playing ? "Jeda pesan suara" : "Putar pesan suara"}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          mine
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-surface-selected text-primary hover:bg-primary/15",
        )}
      >
        {!url ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : playing ? (
          <Pause className="size-4 fill-current" aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Waveform interaktif yang bisa diklik/seek */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Posisi pemutaran pesan suara"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(totalSec))}
          aria-valuenow={Math.round(currentSec)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekToFraction((e.clientX - rect.left) / Math.max(1, rect.width));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seekToFraction(progress + 0.1);
            else if (e.key === "ArrowLeft") seekToFraction(progress - 0.1);
          }}
          className="flex h-7 cursor-pointer items-center gap-[2px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {bars.map((val, i) => {
            const filled = i / bars.length <= progress && (playing || currentSec > 0);
            return (
              <span
                key={i}
                aria-hidden="true"
                className={cn(
                  "flex-1 rounded-full transition-colors",
                  filled
                    ? "bg-primary"
                    : mine
                      ? "bg-chat-out-foreground/30"
                      : "bg-muted-foreground/35",
                )}
                style={{ height: `${Math.max(22, val)}%` }}
              />
            );
          })}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] tabular-nums">
          <span className={mine ? "text-chat-out-foreground/75" : "text-muted-foreground"}>
            {failed
              ? "Audio tidak tersedia"
              : playing || currentSec > 0
                ? `${formatAudioClock(currentSec)} / ${formatAudioClock(totalSec)}`
                : formatAudioClock(totalSec)}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Kecepatan putar ${SPEEDS[speedIndex]}x`}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mine
                ? "bg-chat-out-foreground/15 text-chat-out-foreground hover:bg-chat-out-foreground/25"
                : "bg-muted text-foreground hover:bg-muted/80",
            )}
          >
            {SPEEDS[speedIndex]}x
          </button>
        </div>
      </div>
    </div>
  );
}
