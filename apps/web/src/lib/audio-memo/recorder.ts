import { DateTime, Effect } from "effect";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/plugins/record";
import type { AudioMemoRepo } from "./repo";
import { AudioMemoFiles } from "./files";

export type Handle = {
  stop: () => void;
  cancel: () => void;
};

export type RecordingMetadata = Pick<AudioMemoRepo.Record, "path" | "recordedAt" | "mimeType"> & {
  durationMs: number;
};

export async function start(
  element: HTMLElement,
  onStopped: (blob: Blob, recording: RecordingMetadata) => void,
  onProgress: (durationMs: number) => void,
): Promise<Handle> {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );

  if (!mimeType) throw new Error("Audio recording is not supported in this browser.");

  // Waveform settings adapted from klapacz/eaten@f57abd360e024abefaef6ea463ef7f559a4afd0e,
  // src/components/meal/voice-recorder.tsx (WaveSurfer ^7.11.0). Reuse its scrolling
  // bars with WaveSurfer 8.0.1 and the row's primary theme color.
  const color = getComputedStyle(element).color;

  const waveform = WaveSurfer.create({
    container: element,
    waveColor: color,
    progressColor: color,
    height: 56,
    barGap: 2,
    barWidth: 3,
    cursorWidth: 0,
    interact: false,
  });

  const recorder = waveform.registerPlugin(
    RecordPlugin.create({
      mimeType,
      audioBitsPerSecond: 64_000,
      mediaRecorderTimeslice: 1000,
      scrollingWaveform: true,
    }),
  );

  let cancelled = false;
  let size = 0;
  const stop = () => recorder.stopRecording();

  recorder.on("record-progress", onProgress);
  recorder.on("record-data-available", (blob) => {
    size += blob.size;

    if (size >= AudioMemoFiles.MAX_BYTES - 1_000_000) stop();
  });
  recorder.once("record-start", () => {
    const recordedAt = Effect.runSync(DateTime.now);
    const timeout = setTimeout(stop, AudioMemoFiles.MAX_DURATION_MS);

    recorder.once("record-end", (blob) => {
      clearTimeout(timeout);

      if (!cancelled)
        onStopped(blob, {
          path: AudioMemoFiles.newPath(blob.type),
          recordedAt,
          mimeType: blob.type,
          durationMs: Math.floor(recorder.getDuration()),
        });
    });
  });

  try {
    await recorder.startRecording();

    return {
      stop,
      cancel() {
        cancelled = true;
        stop();
        waveform.destroy();
      },
    };
  } catch (error) {
    waveform.destroy();
    throw error;
  }
}

export * as AudioMemoRecorder from "./recorder";
