"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  beachNoirLibrary,
  type Library,
  type Track
} from "@/lib/library";
import {
  CastLauncher,
  type CastLauncherHandle,
  type CastRemoteState
} from "@/components/CastLauncher";
import { AmbientCanvas } from "@/components/AmbientCanvas";
import type { SceneTheme } from "@/lib/cast-config";

type LoungeExperienceProps = {
  tvMode?: boolean;
};

type RepeatMode = "off" | "all" | "one";
type VisualMode = "atmosphere" | "resonance" | "still";
type ThemeTransitionPhase =
  | "idle"
  | "covering"
  | "covered"
  | "revealing";

const NIGHT_SCENE_VIDEO = "/video/midnight-lagoon-loop.mp4";
const DAY_SCENE_VIDEO = "/video/midnight-lagoon-day-loop.mp4";
const THEME_COVER_MS = 850;
const THEME_LOAD_TIMEOUT_MS = 12000;
const THEME_FRAME_WAIT_MS = 1200;
const THEME_REVEAL_MS = 1150;

type LoungeAudioElement = HTMLAudioElement & {
  webkitShowPlaybackTargetPicker?: () => void;
};

type WakeLockControl = {
  release: () => Promise<void>;
  released: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function trackStart(track: Track) {
  return track.startAt || 0;
}

function trackEnd(track: Track, mediaDuration: number) {
  if (track.endAt) return track.endAt;
  if (track.duration) return trackStart(track) + track.duration;
  return mediaDuration;
}

function usableDuration(track: Track, mediaDuration: number) {
  const configured = track.endAt
    ? track.endAt - trackStart(track)
    : track.duration;
  return configured || Math.max(0, mediaDuration - trackStart(track));
}

function scenePoster(theme: SceneTheme) {
  return theme === "day"
    ? "/images/midnight-lagoon-day.webp"
    : "/images/midnight-lagoon.webp";
}

function sceneVideoSource(theme: SceneTheme) {
  return theme === "day" ? DAY_SCENE_VIDEO : NIGHT_SCENE_VIDEO;
}

export function LoungeExperience({ tvMode = false }: LoungeExperienceProps) {
  const [library, setLibrary] = useState<Library>(beachNoirLibrary);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all");
  const [visualMode, setVisualMode] = useState<VisualMode>("resonance");
  const [sceneTheme, setSceneTheme] = useState<SceneTheme>("night");
  const [displayedTheme, setDisplayedTheme] =
    useState<SceneTheme>("night");
  const [themeTransitionPhase, setThemeTransitionPhase] =
    useState<ThemeTransitionPhase>("idle");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [screenGuideOpen, setScreenGuideOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [castActive, setCastActive] = useState(false);
  const [airplaySupported, setAirplaySupported] = useState(false);
  const [notice, setNotice] = useState("");
  const [audioError, setAudioError] = useState("");

  const audioRef = useRef<LoungeAudioElement>(null);
  const sceneVideoRef = useRef<HTMLVideoElement>(null);
  const castLauncherRef = useRef<CastLauncherHandle>(null);
  const castActiveRef = useRef(false);
  const playIntentRef = useRef(false);
  const playingRef = useRef(false);
  const transitionGuardRef = useRef("");
  const preferencesLoadedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockControl | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedThemeRef = useRef<SceneTheme>("night");
  const sceneVideoThemeRef = useRef<SceneTheme | null>(null);
  const themeTransitionSequenceRef = useRef(0);
  const themeMediaCleanupRef = useRef<(() => void) | null>(null);
  const visualModeRef = useRef<VisualMode>("resonance");
  const themeCoverTimerRef = useRef<number | null>(null);
  const themeLoadTimerRef = useRef<number | null>(null);
  const themeRevealTimerRef = useRef<number | null>(null);

  const currentTrack = library.tracks[currentIndex] || beachNoirLibrary.tracks[0];
  const duration = usableDuration(currentTrack, mediaDuration);
  const progress = duration > 0 ? clamp(elapsed / duration, 0, 1) : 0;

  const currentModeLabel = useMemo(() => {
    if (visualMode === "still") return "Still scene";
    if (visualMode === "atmosphere") return "Atmosphere";
    return "Resonance";
  }, [visualMode]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(""), 3200);
  }, []);

  const syncRemoteState = useCallback(
    (state: CastRemoteState) => {
      if (!state.ownsLoungeMedia) return;

      const remoteIsPlaying = !state.isPaused;
      playingRef.current = remoteIsPlaying;
      setIsPlaying(remoteIsPlaying);
      setElapsed(Math.max(0, state.currentTime));
      setMediaDuration(Math.max(0, state.duration));
      setVolume(clamp(state.volume, 0, 1));
      setEntered(true);

      if (state.trackId) {
        const nextIndex = library.tracks.findIndex(
          (track) => track.id === state.trackId
        );
        if (nextIndex >= 0) setCurrentIndex(nextIndex);
      }
    },
    [library.tracks]
  );

  const handleCastActiveChange = useCallback(
    (active: boolean) => {
      castActiveRef.current = active;
      setCastActive(active);
      setControlsVisible(true);

      if (active) {
        playIntentRef.current = false;
        playingRef.current = false;
        audioRef.current?.pause();
        setEntered(true);
        showNotice("The television is streaming Lagoon Lounge.");
        return;
      }

      playingRef.current = false;
      setIsPlaying(false);
    },
    [showNotice]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/library?v=${encodeURIComponent(beachNoirLibrary.version)}`,
      { cache: "no-store" }
    )
      .then((response) => {
        if (!response.ok) throw new Error("Library request failed");
        return response.json() as Promise<Library>;
      })
      .then((nextLibrary) => {
        if (cancelled || !nextLibrary.tracks?.length) return;
        setLibrary(nextLibrary);
        setCurrentIndex(0);
      })
      .catch(() => {
        if (!cancelled) {
          setLibrary(beachNoirLibrary);
          showNotice("The library is taking a moment. Try play once more.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showNotice]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const savedVolume = Number(window.localStorage.getItem("lagoon-volume"));
        if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
          setVolume(savedVolume);
        }
        setShuffle(window.localStorage.getItem("lagoon-shuffle") === "true");
        const savedRepeat = window.localStorage.getItem("lagoon-repeat");
        if (savedRepeat === "off" || savedRepeat === "one" || savedRepeat === "all") {
          setRepeatMode(savedRepeat);
        }
        const savedVisual = window.localStorage.getItem("lagoon-visual-mode-v2");
        if (
          savedVisual === "still" ||
          savedVisual === "atmosphere" ||
          savedVisual === "resonance"
        ) {
          setVisualMode(savedVisual);
        }
        const savedTheme = window.localStorage.getItem("lagoon-scene-theme");
        if (savedTheme === "night" || savedTheme === "day") {
          setSceneTheme(savedTheme);
        }
      } catch {
        // Preferences remain at their calm defaults when storage is unavailable.
      } finally {
        preferencesLoadedRef.current = true;
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoadedRef.current) return;
    try {
      window.localStorage.setItem("lagoon-volume", String(volume));
      window.localStorage.setItem("lagoon-shuffle", String(shuffle));
      window.localStorage.setItem("lagoon-repeat", repeatMode);
      window.localStorage.setItem("lagoon-visual-mode-v2", visualMode);
      window.localStorage.setItem("lagoon-scene-theme", sceneTheme);
    } catch {
      // The listening room does not require local storage.
    }
  }, [repeatMode, sceneTheme, shuffle, visualMode, volume]);

  const selectSceneTheme = useCallback((theme: SceneTheme) => {
    setSceneTheme(theme);
  }, []);

  const clearThemeTimers = useCallback(() => {
    themeMediaCleanupRef.current?.();
    themeMediaCleanupRef.current = null;
    if (themeCoverTimerRef.current) {
      window.clearTimeout(themeCoverTimerRef.current);
      themeCoverTimerRef.current = null;
    }
    if (themeLoadTimerRef.current) {
      window.clearTimeout(themeLoadTimerRef.current);
      themeLoadTimerRef.current = null;
    }
    if (themeRevealTimerRef.current) {
      window.clearTimeout(themeRevealTimerRef.current);
      themeRevealTimerRef.current = null;
    }
  }, []);

  const revealSceneTheme = useCallback((sequence: number) => {
    if (sequence !== themeTransitionSequenceRef.current) return;
    if (themeLoadTimerRef.current) {
      window.clearTimeout(themeLoadTimerRef.current);
      themeLoadTimerRef.current = null;
    }
    setThemeTransitionPhase("revealing");
    themeRevealTimerRef.current = window.setTimeout(() => {
      if (sequence !== themeTransitionSequenceRef.current) return;
      setThemeTransitionPhase("idle");
      themeRevealTimerRef.current = null;
    }, THEME_REVEAL_MS);
  }, []);

  useEffect(() => {
    const video = sceneVideoRef.current;
    if (!video) return;

    sceneVideoThemeRef.current = "night";
    video.poster = scenePoster("night");
    video.src = sceneVideoSource("night");
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.load();
    video.play().catch(() => {
      // The first frame remains available until the next user gesture.
    });

    return () => {
      video.pause();
    };
  }, []);

  useEffect(() => {
    const video = sceneVideoRef.current;
    if (!video) return;
    const activeVideo: HTMLVideoElement = video;

    const targetTheme = sceneTheme;
    const sequence = themeTransitionSequenceRef.current + 1;
    themeTransitionSequenceRef.current = sequence;
    clearThemeTimers();

    if (castActive) {
      activeVideo.pause();
      activeVideo.poster = scenePoster(targetTheme);
      activeVideo.removeAttribute("src");
      activeVideo.load();
      sceneVideoThemeRef.current = null;
      displayedThemeRef.current = targetTheme;
      window.queueMicrotask(() => {
        if (
          sequence !== themeTransitionSequenceRef.current ||
          !castActiveRef.current
        ) {
          return;
        }
        setDisplayedTheme(targetTheme);
        setThemeTransitionPhase("idle");
      });
      return;
    }

    if (
      targetTheme === displayedThemeRef.current &&
      targetTheme === sceneVideoThemeRef.current
    ) {
      setThemeTransitionPhase("idle");
      return;
    }

    let settled = false;
    let frameCallbackId: number | null = null;
    let frameTimer: number | null = null;
    let firstAnimationFrame: number | null = null;
    let secondAnimationFrame: number | null = null;

    const removeMediaListeners = () => {
      activeVideo.removeEventListener("loadeddata", handleLoadedData);
      activeVideo.removeEventListener("error", handleLoadError);
      if (
        frameCallbackId !== null &&
        typeof activeVideo.cancelVideoFrameCallback === "function"
      ) {
        activeVideo.cancelVideoFrameCallback(frameCallbackId);
      }
      if (frameTimer !== null) window.clearTimeout(frameTimer);
      if (firstAnimationFrame !== null) {
        window.cancelAnimationFrame(firstAnimationFrame);
      }
      if (secondAnimationFrame !== null) {
        window.cancelAnimationFrame(secondAnimationFrame);
      }
      frameCallbackId = null;
      frameTimer = null;
      firstAnimationFrame = null;
      secondAnimationFrame = null;
    };

    const commitTheme = () => {
      if (
        settled ||
        sequence !== themeTransitionSequenceRef.current ||
        sceneVideoThemeRef.current !== targetTheme
      ) {
        return;
      }

      settled = true;
      removeMediaListeners();
      themeMediaCleanupRef.current = null;
      if (themeLoadTimerRef.current) {
        window.clearTimeout(themeLoadTimerRef.current);
        themeLoadTimerRef.current = null;
      }
      displayedThemeRef.current = targetTheme;
      setDisplayedTheme(targetTheme);
      revealSceneTheme(sequence);
    };

    const commitAfterDecodedFrame = () => {
      if (
        settled ||
        sequence !== themeTransitionSequenceRef.current
      ) {
        return;
      }

      frameTimer = window.setTimeout(
        commitTheme,
        THEME_FRAME_WAIT_MS
      );

      if (typeof activeVideo.requestVideoFrameCallback === "function") {
        frameCallbackId = activeVideo.requestVideoFrameCallback(() => {
          if (frameTimer !== null) window.clearTimeout(frameTimer);
          frameTimer = null;
          commitTheme();
        });
        return;
      }

      firstAnimationFrame = window.requestAnimationFrame(() => {
        secondAnimationFrame = window.requestAnimationFrame(commitTheme);
      });
    };

    function handleLoadedData() {
      if (
        settled ||
        sequence !== themeTransitionSequenceRef.current ||
        sceneVideoThemeRef.current !== targetTheme
      ) {
        return;
      }

      activeVideo.removeEventListener("loadeddata", handleLoadedData);
      activeVideo.playbackRate =
        visualModeRef.current === "atmosphere" ? 0.72 : 1;

      if (visualModeRef.current === "still") {
        activeVideo.pause();
        activeVideo.currentTime = 0;
        commitAfterDecodedFrame();
        return;
      }

      activeVideo.play().then(commitAfterDecodedFrame).catch(() => {
        // A decoded still is preferable to revealing an empty video layer.
        commitAfterDecodedFrame();
      });
    }

    function handleLoadError() {
      if (
        settled ||
        sequence !== themeTransitionSequenceRef.current
      ) {
        return;
      }
      showNotice(
        targetTheme === "day"
          ? "Daylight is taking a moment. Showing the still scene."
          : "Nightfall is taking a moment. Showing the still scene."
      );
      commitTheme();
    }

    themeMediaCleanupRef.current = () => {
      settled = true;
      removeMediaListeners();
    };

    setThemeTransitionPhase("covering");
    const coverDuration = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
      ? 30
      : THEME_COVER_MS;

    themeCoverTimerRef.current = window.setTimeout(() => {
      if (sequence !== themeTransitionSequenceRef.current) return;

      setThemeTransitionPhase("covered");
      themeCoverTimerRef.current = null;
      activeVideo.pause();
      activeVideo.poster = scenePoster(targetTheme);
      sceneVideoThemeRef.current = targetTheme;
      activeVideo.src = sceneVideoSource(targetTheme);
      activeVideo.defaultMuted = true;
      activeVideo.muted = true;
      activeVideo.playsInline = true;
      activeVideo.addEventListener("loadeddata", handleLoadedData);
      activeVideo.addEventListener("error", handleLoadError);
      activeVideo.load();

      if (
        activeVideo.readyState >=
        HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        queueMicrotask(handleLoadedData);
      }

      themeLoadTimerRef.current = window.setTimeout(() => {
        if (
          activeVideo.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          handleLoadedData();
          return;
        }
        handleLoadError();
      }, THEME_LOAD_TIMEOUT_MS);
    }, coverDuration);

    return () => {
      clearThemeTimers();
    };
  }, [
    castActive,
    clearThemeTimers,
    revealSceneTheme,
    sceneTheme,
    showNotice
  ]);

  const startPlayback = useCallback(async () => {
    if (castActiveRef.current) {
      setEntered(true);
      setAudioError("");
      castLauncherRef.current?.play();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const start = trackStart(currentTrack);
    const end = trackEnd(currentTrack, audio.duration);
    if (
      !Number.isFinite(audio.currentTime) ||
      audio.currentTime < start ||
      (Number.isFinite(end) && audio.currentTime >= end - 0.1)
    ) {
      audio.currentTime = start;
    }

    playIntentRef.current = true;
    setEntered(true);
    setAudioError("");

    try {
      await audio.play();
      playingRef.current = true;
      setIsPlaying(true);
    } catch {
      playIntentRef.current = false;
      playingRef.current = false;
      setIsPlaying(false);
      setAudioError("Your browser held the sound. Tap play once more.");
    }
  }, [currentTrack]);

  const pausePlayback = useCallback(() => {
    if (castActiveRef.current) {
      castLauncherRef.current?.pause();
      setControlsVisible(true);
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    playIntentRef.current = false;
    playingRef.current = false;
    audio.pause();
    setIsPlaying(false);
    setControlsVisible(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (castActive) {
      audio.pause();
      return;
    }

    let cancelled = false;
    transitionGuardRef.current = "";
    queueMicrotask(() => {
      if (cancelled) return;
      setElapsed(0);
      setMediaDuration(0);
      setAudioError("");
    });
    audio.crossOrigin = "anonymous";
    audio.setAttribute("x-webkit-airplay", "allow");
    audio.src = currentTrack.streamUrl;
    audio.load();

    const prepareTrack = () => {
      const start = trackStart(currentTrack);
      if (Math.abs(audio.currentTime - start) > 0.08) {
        audio.currentTime = start;
      }
      setMediaDuration(audio.duration || currentTrack.duration || 0);
      setElapsed(0);

      if (playIntentRef.current && !castActiveRef.current) {
        audio
          .play()
          .then(() => {
            playingRef.current = true;
            setIsPlaying(true);
          })
          .catch(() => {
            playingRef.current = false;
            setIsPlaying(false);
            setAudioError("This selection could not begin. Try play once more.");
          });
      }
    };

    audio.addEventListener("loadedmetadata", prepareTrack);
    if (audio.readyState >= 1) prepareTrack();

    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", prepareTrack);
    };
  }, [castActive, currentTrack]);

  useEffect(() => {
    const video = sceneVideoRef.current;
    if (!video) return;

    visualModeRef.current = castActive ? "still" : visualMode;
    const syncSceneMotion = () => {
      if (castActive) {
        video.pause();
        return;
      }

      if (visualMode === "still") {
        video.pause();
        video.currentTime = 0;
        return;
      }

      video.playbackRate = visualMode === "atmosphere" ? 0.72 : 1;
      video.play().catch(() => {
        // The poster remains visible if this browser blocks decorative autoplay.
      });
    };

    syncSceneMotion();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncSceneMotion();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
  }, [castActive, visualMode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !castActive) audio.volume = volume;
  }, [castActive, volume]);

  const changeVolume = useCallback((nextVolume: number) => {
    const safeVolume = clamp(nextVolume, 0, 1);
    setVolume(safeVolume);
    if (castActiveRef.current) {
      castLauncherRef.current?.setVolume(safeVolume);
      return;
    }
    if (audioRef.current) audioRef.current.volume = safeVolume;
  }, []);

  useEffect(() => {
    if (!castActive) return;
    void castLauncherRef.current?.setPlaybackMode(repeatMode, shuffle);
  }, [castActive, repeatMode, shuffle]);

  useEffect(() => {
    if (!castActive) return;
    castLauncherRef.current?.setTheme(sceneTheme);
  }, [castActive, sceneTheme]);

  const selectTrack = useCallback(
    (index: number, shouldPlay = playingRef.current || playIntentRef.current) => {
      const nextIndex = clamp(index, 0, library.tracks.length - 1);

      if (castActiveRef.current) {
        setCurrentIndex(nextIndex);
        setElapsed(0);
        if (nextIndex === currentIndex) {
          castLauncherRef.current?.seekTo(0);
          if (shouldPlay) castLauncherRef.current?.play();
          return;
        }
        void castLauncherRef.current?.loadQueue({
          currentIndex: nextIndex,
          currentTime: 0,
          repeatMode,
          shuffle
        });
        return;
      }

      playIntentRef.current = shouldPlay;
      if (nextIndex === currentIndex) {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = trackStart(library.tracks[nextIndex]);
          setElapsed(0);
          if (shouldPlay) startPlayback();
        }
        return;
      }
      setCurrentIndex(nextIndex);
    },
    [currentIndex, library.tracks, repeatMode, shuffle, startPlayback]
  );

  const nextTrack = useCallback(
    (automatic = false) => {
      if (castActiveRef.current) {
        castLauncherRef.current?.next();
        return;
      }

      const audio = audioRef.current;
      if (!library.tracks.length) return;

      if (automatic && repeatMode === "one") {
        if (audio) {
          audio.currentTime = trackStart(currentTrack);
          transitionGuardRef.current = "";
          startPlayback();
        }
        return;
      }

      let nextIndex: number;
      if (shuffle && library.tracks.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * library.tracks.length);
        } while (nextIndex === currentIndex);
      } else {
        nextIndex = currentIndex + 1;
      }

      if (nextIndex >= library.tracks.length) {
        if (repeatMode === "all") {
          nextIndex = 0;
        } else {
          pausePlayback();
          if (audio) {
            audio.currentTime = trackEnd(currentTrack, audio.duration);
          }
          return;
        }
      }
      selectTrack(nextIndex, true);
    },
    [
      currentIndex,
      currentTrack,
      library.tracks,
      pausePlayback,
      repeatMode,
      selectTrack,
      shuffle,
      startPlayback
    ]
  );

  const previousTrack = useCallback(() => {
    if (castActiveRef.current) {
      castLauncherRef.current?.previous();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (elapsed > 5) {
      audio.currentTime = trackStart(currentTrack);
      setElapsed(0);
      return;
    }
    const previous = currentIndex === 0 ? library.tracks.length - 1 : currentIndex - 1;
    selectTrack(previous, playingRef.current || playIntentRef.current);
  }, [currentIndex, currentTrack, elapsed, library.tracks.length, selectTrack]);

  const seekTo = useCallback(
    (relativeSeconds: number) => {
      if (castActiveRef.current) {
        const nextElapsed = clamp(relativeSeconds, 0, duration || 0);
        castLauncherRef.current?.seekTo(nextElapsed);
        setElapsed(nextElapsed);
        return;
      }

      const audio = audioRef.current;
      if (!audio) return;
      const nextElapsed = clamp(relativeSeconds, 0, duration || 0);
      audio.currentTime = trackStart(currentTrack) + nextElapsed;
      setElapsed(nextElapsed);
    },
    [currentTrack, duration]
  );

  const seekBy = useCallback(
    (seconds: number) => seekTo(elapsed + seconds),
    [elapsed, seekTo]
  );

  const togglePlayback = useCallback(() => {
    if (castActiveRef.current) {
      castLauncherRef.current?.togglePlayback();
      return;
    }

    if (playingRef.current) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }, [pausePlayback, startPlayback]);

  const handleTimeUpdate = useCallback(() => {
    if (castActiveRef.current) return;

    const audio = audioRef.current;
    if (!audio) return;
    const start = trackStart(currentTrack);
    const end = trackEnd(currentTrack, audio.duration);
    const nextElapsed = Math.max(0, audio.currentTime - start);
    setElapsed(nextElapsed);
    setMediaDuration(audio.duration || currentTrack.duration || 0);

    if (
      Number.isFinite(end) &&
      audio.currentTime >= end - 0.08 &&
      transitionGuardRef.current !== currentTrack.id
    ) {
      transitionGuardRef.current = currentTrack.id;
      nextTrack(true);
    }
  }, [currentTrack, nextTrack]);

  const handleTrackEnded = useCallback(() => {
    if (castActiveRef.current) return;
    if (transitionGuardRef.current === currentTrack.id) return;
    transitionGuardRef.current = currentTrack.id;
    nextTrack(true);
  }, [currentTrack.id, nextTrack]);

  const signalActivity = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (playingRef.current && !queueOpen && !screenGuideOpen) {
      idleTimerRef.current = setTimeout(() => setControlsVisible(false), tvMode ? 5200 : 6200);
    }
  }, [queueOpen, screenGuideOpen, tvMode]);

  useEffect(() => {
    const activityTimer = window.setTimeout(signalActivity, 0);
    return () => {
      window.clearTimeout(activityTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isPlaying, queueOpen, screenGuideOpen, signalActivity]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setAirplaySupported(Boolean(audio.webkitShowPlaybackTargetPicker));
  }, []);

  const launchAirPlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.webkitShowPlaybackTargetPicker) {
        audio.webkitShowPlaybackTargetPicker();
        return;
      }
      showNotice("AirPlay is unavailable in this browser.");
    } catch {
      showNotice("No screen was selected.");
    }
  };

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      showNotice("Full screen is unavailable in this browser.");
    }
  }, [showNotice]);

  const toggleWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeLockActive(false);
        return;
      }
      const wakeLockApi = (
        navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockControl> };
        }
      ).wakeLock;
      if (!wakeLockApi) {
        showNotice("This screen manages its own sleep settings.");
        return;
      }
      wakeLockRef.current = await wakeLockApi.request("screen");
      setWakeLockActive(true);
    } catch {
      setWakeLockActive(false);
      showNotice("The screen could not be kept awake.");
    }
  }, [showNotice]);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    return () => {
      wakeLockRef.current?.release().catch(() => undefined);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const shareTvLink = async () => {
    const tvUrl = `${window.location.origin}/tv`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Lagoon Lounge",
          text: "Open the Magnanimis listening room on this screen.",
          url: tvUrl
        });
      } else {
        await navigator.clipboard.writeText(tvUrl);
        showNotice("TV link copied.");
      }
    } catch {
      // Closing the share sheet is not an error worth surfacing.
    }
  };

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Lagoon Lounge",
      artist: "A Magnanimis Listening Room",
      album: "The room is in resonance",
      artwork: [
        {
          src: "/lagoon-lounge-icon-192.png",
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: "/lagoon-lounge-icon-512.png",
          sizes: "512x512",
          type: "image/png"
        }
      ]
    });

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", startPlayback],
      ["pause", pausePlayback],
      ["previoustrack", previousTrack],
      ["nexttrack", () => nextTrack(false)],
      [
        "seekbackward",
        (details) => seekBy(-(details.seekOffset || 10))
      ],
      [
        "seekforward",
        (details) => seekBy(details.seekOffset || 10)
      ],
      [
        "seekto",
        (details) => {
          if (details.seekTime !== undefined) seekTo(details.seekTime);
        }
      ]
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some television browsers expose Media Session incompletely.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // No cleanup is required for an unsupported action.
        }
      }
    };
  }, [
    currentTrack,
    library.title,
    nextTrack,
    pausePlayback,
    previousTrack,
    seekBy,
    seekTo,
    startPlayback
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0.1, duration),
        playbackRate: audioRef.current?.playbackRate || 1,
        position: clamp(elapsed, 0, Math.max(0, duration - 0.01))
      });
    } catch {
      // Position state is optional.
    }
  }, [duration, elapsed]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const interactive =
        target?.tagName === "INPUT" ||
        target?.tagName === "BUTTON" ||
        target?.tagName === "A";
      signalActivity();

      if (event.key === "Escape") {
        setQueueOpen(false);
        setScreenGuideOpen(false);
        return;
      }
      if ((event.key === " " || event.key === "Enter") && !interactive) {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.key === "ArrowLeft" && !interactive) {
        event.preventDefault();
        seekBy(-10);
        return;
      }
      if (event.key === "ArrowRight" && !interactive) {
        event.preventDefault();
        seekBy(10);
        return;
      }
      if (event.key.toLowerCase() === "f" && !interactive) {
        toggleFullscreen();
        return;
      }
      if (event.key.toLowerCase() === "q" && !interactive) {
        setQueueOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [seekBy, signalActivity, toggleFullscreen, togglePlayback]);

  return (
    <main
      className={[
        "lounge",
        tvMode ? "tvMode" : "",
        entered ? "enteredRoom" : "atThreshold",
        controlsVisible || !entered || !isPlaying ? "controlsAwake" : "controlsAsleep",
        castActive ? "castingRemote" : "",
        visualMode === "still" ? "stillScene" : "",
        displayedTheme === "day" ? "themeDay" : "themeNight"
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerMove={signalActivity}
      onPointerDown={signalActivity}
    >
      <div className="scene" aria-hidden="true">
        <div className="sceneMedia">
          <div
            className="sceneStill"
            style={{
              backgroundImage: `url("${scenePoster(displayedTheme)}")`
            }}
          />
          <video
            ref={sceneVideoRef}
            className="sceneVideo"
            poster="/images/midnight-lagoon.webp"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden="true"
          />
        </div>
        <AmbientCanvas
          active={
            !castActive &&
            entered &&
            isPlaying &&
            visualMode === "resonance"
          }
          still={castActive || visualMode === "still"}
          theme={displayedTheme}
        />
        <div className="sceneGrade" />
        <div
          className={[
            "sceneThemeVeil",
            `sceneThemeVeil${themeTransitionPhase[0].toUpperCase()}${themeTransitionPhase.slice(1)}`,
            sceneTheme === "day"
              ? "sceneThemeVeilToDay"
              : "sceneThemeVeilToNight"
          ].join(" ")}
        />
      </div>

      {!tvMode && (
        <CastLauncher
          ref={castLauncherRef}
          tracks={library.tracks}
          currentIndex={currentIndex}
          currentTime={elapsed}
          repeatMode={repeatMode}
          sceneTheme={sceneTheme}
          shuffle={shuffle}
          onAvailabilityChange={setCastAvailable}
          onCastActiveChange={handleCastActiveChange}
          onRemoteStateChange={syncRemoteState}
          onError={showNotice}
          onUnavailableClick={() => setScreenGuideOpen(true)}
        />
      )}

      <header className="minimalHeader loungeChrome">
        <span className="minimalMonogram" aria-label="Lagoon Lounge">
          L
        </span>
        <button
          type="button"
          className="edgeSettings"
          onClick={() => setQueueOpen(true)}
          aria-label="Open room settings"
        >
          <span className="settingsDots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </header>

      {!entered && (
        <section className="entryVeil minimalEntry" aria-labelledby="lounge-title">
          <div className="entryMinimal">
            <span className="entryMonogram" aria-hidden="true">
              L
            </span>
            <p className="entryEyebrow">A Magnanimis listening room</p>
            <h1 id="lounge-title">
              <span>Lagoon</span> <span>Lounge</span>
            </h1>
            <span className="entryRule" aria-hidden="true">
              <i />
              <b />
              <i />
            </span>
            <button
              type="button"
              className="entryPlay"
              onClick={startPlayback}
              autoFocus={tvMode}
              aria-label="Enter Lagoon Lounge with sound"
            >
              <span className="playGlyph playGlyphLarge" aria-hidden="true" />
            </button>
            <span className="entryLabel">Enter with sound</span>
          </div>
        </section>
      )}

      {entered && (
        <>
          <section
            className="minimalTransport loungeChrome"
            aria-label="Playback controls"
            onFocusCapture={() => setControlsVisible(true)}
          >
            <button
              type="button"
              className="minimalSkip"
              onClick={previousTrack}
              aria-label="Previous selection"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="minimalPlay"
              onClick={togglePlayback}
              aria-label={isPlaying ? "Pause" : "Play"}
              aria-pressed={isPlaying}
              style={
                { "--ring-progress": `${progress * 360}deg` } as React.CSSProperties
              }
            >
              {isPlaying ? (
                <span className="pauseGlyph" aria-hidden="true">
                  <i />
                  <i />
                </span>
              ) : (
                <span className="playGlyph playGlyphLarge" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="minimalSkip"
              onClick={() => nextTrack(false)}
              aria-label="Next selection"
            >
              <span aria-hidden="true">›</span>
            </button>
          </section>
          <div
            className="minimalProgress loungeChrome"
            style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
          >
            <input
              type="range"
              min="0"
              max={Math.max(0.1, duration)}
              step="0.1"
              value={Math.min(elapsed, Math.max(0.1, duration))}
              onChange={(event) => seekTo(Number(event.target.value))}
              aria-label="Playback position"
            />
          </div>
          {audioError && <p className="audioError minimalError">{audioError}</p>}
        </>
      )}

      <aside
        className={queueOpen ? "queueDrawer settingsDrawer isOpen" : "queueDrawer settingsDrawer"}
        aria-hidden={!queueOpen}
        inert={!queueOpen}
      >
        <div className="drawerHeader">
          <div>
            <p className="eyebrow">Lagoon Lounge</p>
            <h2>Room settings</h2>
          </div>
          <button
            type="button"
            className="quietButton iconButton"
            onClick={() => setQueueOpen(false)}
            aria-label="Close room settings"
          >
            ×
          </button>
        </div>
        <div className="settingsStack">
          <fieldset className="settingBlock">
            <legend>Sequence</legend>
            <div className="segmentedControl">
              <button
                type="button"
                className={!shuffle ? "isSelected" : ""}
                onClick={() => setShuffle(false)}
                aria-pressed={!shuffle}
              >
                Classic
              </button>
              <button
                type="button"
                className={shuffle ? "isSelected" : ""}
                onClick={() => setShuffle(true)}
                aria-pressed={shuffle}
              >
                Shuffle
              </button>
            </div>
          </fieldset>

          <fieldset className="settingBlock">
            <legend>Repeat</legend>
            <div className="segmentedControl threeWay">
              {(["off", "all", "one"] as RepeatMode[]).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={repeatMode === mode ? "isSelected" : ""}
                  onClick={() => setRepeatMode(mode)}
                  aria-pressed={repeatMode === mode}
                >
                  {mode === "off" ? "Off" : mode === "all" ? "All" : "One"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="settingBlock">
            <legend>Scene</legend>
            <div className="segmentedControl threeWay">
              <button
                type="button"
                className={visualMode === "resonance" ? "isSelected" : ""}
                onClick={() => setVisualMode("resonance")}
                aria-pressed={visualMode === "resonance"}
              >
                Full
              </button>
              <button
                type="button"
                className={visualMode === "atmosphere" ? "isSelected" : ""}
                onClick={() => setVisualMode("atmosphere")}
                aria-pressed={visualMode === "atmosphere"}
              >
                Soft
              </button>
              <button
                type="button"
                className={visualMode === "still" ? "isSelected" : ""}
                onClick={() => setVisualMode("still")}
                aria-pressed={visualMode === "still"}
              >
                Still
              </button>
            </div>
          </fieldset>

          <fieldset className="settingBlock sceneThemeSetting">
            <legend>Light</legend>
            <div className="segmentedControl themeControl">
              {(["night", "day"] as SceneTheme[]).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  className={sceneTheme === theme ? "isSelected" : ""}
                  onClick={() => selectSceneTheme(theme)}
                  aria-pressed={sceneTheme === theme}
                >
                  {theme === "night" ? "Night" : "Day"}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="settingBlock volumeSetting">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </label>

          <div className="settingActions">
            <button
              type="button"
              onClick={() => {
                setQueueOpen(false);
                setScreenGuideOpen(true);
              }}
            >
              <span>Send to TV</span>
              <i aria-hidden="true">↗</i>
            </button>
            <button type="button" onClick={toggleFullscreen}>
              <span>{isFullscreen ? "Exit full screen" : "Full screen"}</span>
              <i aria-hidden="true">⛶</i>
            </button>
            {tvMode && (
              <button type="button" onClick={toggleWakeLock}>
                <span>{wakeLockActive ? "Allow screen sleep" : "Keep screen awake"}</span>
                <i aria-hidden="true">☼</i>
              </button>
            )}
          </div>
        </div>
        <div className="drawerFooter minimalDrawerFooter">
          <span>
            Selection {String(currentIndex + 1).padStart(2, "0")} of{" "}
            {String(library.tracks.length).padStart(2, "0")}
          </span>
          <span>{currentModeLabel}</span>
        </div>
      </aside>

      {queueOpen && (
        <button
          type="button"
          className="drawerScrim"
          onClick={() => setQueueOpen(false)}
          aria-label="Close room settings"
        />
      )}

      {screenGuideOpen && (
        <div className="modalScrim" role="presentation">
          <section className="screenGuide" role="dialog" aria-modal="true" aria-labelledby="screen-guide-title">
            <button
              type="button"
              className="modalClose"
              onClick={() => setScreenGuideOpen(false)}
              aria-label="Close television guide"
            >
              ×
            </button>
            <p className="eyebrow">A larger horizon</p>
            <h2 id="screen-guide-title">Play on your TV</h2>
            <p className="guideIntro">
              {castActive
                ? "Your television is streaming the moving room and music directly."
                : castAvailable
                  ? "Lagoon Lounge is ready. Choose your television to begin."
                  : "We’ll try the cinematic receiver first, then automatically check the wider TV-compatible Cast path."}
            </p>
            <div className="screenOptions">
              {!castActive && (
                <button
                  type="button"
                  onClick={() => {
                    void castLauncherRef.current
                      ?.requestSession()
                      .then((started) => {
                        if (started) setScreenGuideOpen(false);
                      });
                  }}
                >
                  <span aria-hidden="true">◔</span>
                  <strong>
                    {castAvailable
                      ? "Choose a television"
                      : "Try Cast again"}
                  </strong>
                  <small>
                    Uses the best receiver your television supports
                  </small>
                </button>
              )}
              {airplaySupported && (
                <button type="button" onClick={launchAirPlay}>
                  <span aria-hidden="true">◉</span>
                  <strong>Choose an AirPlay screen</strong>
                  <small>Audio only; native Cast carries the full moving room</small>
                </button>
              )}
              <button type="button" onClick={shareTvLink}>
                <span aria-hidden="true">↗</span>
                <strong>Share the TV address</strong>
                <small>Open /tv in a smart-TV browser or another device</small>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreenGuideOpen(false);
                  toggleFullscreen();
                }}
              >
                <span aria-hidden="true">⛶</span>
                <strong>Use this screen</strong>
                <small>Enter full screen and keep the lounge here</small>
              </button>
            </div>
            <details className="guideFootnote">
              <summary>Still not seeing your television?</summary>
              <p>
                Keep both devices on the same Wi-Fi and disable any VPN or
                guest-network isolation. If Cast is unavailable, open{" "}
                <strong>/tv</strong> in the television browser.
              </p>
            </details>
          </section>
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleTrackEnded}
        onPlay={() => {
          if (castActiveRef.current) return;
          playingRef.current = true;
          setIsPlaying(true);
        }}
        onPause={() => {
          if (castActiveRef.current) return;
          playingRef.current = false;
          setIsPlaying(false);
        }}
        onError={() => {
          if (castActiveRef.current) return;
          playingRef.current = false;
          setIsPlaying(false);
          setAudioError("This selection could not be reached.");
        }}
      />
    </main>
  );
}
