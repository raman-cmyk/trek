import { useRef, useState } from "react";

/**
 * A guide's 60-second voice note, actually playable (the column existed and the
 * public view exposed it, but nothing ever rendered it). Hearing the person you
 * are about to trust for two weeks is the most Trek-specific thing on the page.
 */
export function VoiceIntro({ src, name }: { src: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border border-line bg-card px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${name}'s introduction` : `Play ${name}'s introduction`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-moss text-white transition-transform hover:bg-pine active:scale-95"
      >
        {playing ? (
          <span aria-hidden className="text-lg leading-none">❚❚</span>
        ) : (
          <span aria-hidden className="ml-0.5 text-lg leading-none">▶</span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          Hear {name.split(" ")[0]} in their own voice
        </p>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-mist">
          <div
            className="h-full bg-moss transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        className="hidden"
      />
    </div>
  );
}
