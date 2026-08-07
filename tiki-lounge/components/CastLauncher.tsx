"use client";

import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import {
  CAST_RECEIVER_APP_ID,
  HAS_CUSTOM_CAST_RECEIVER,
  type SceneTheme
} from "@/lib/cast-config";
import styles from "./CastLauncher.module.css";

const CAST_SDK_ID = "google-cast-web-sender-sdk";
const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const MAX_QUEUE_LENGTH = 65;
const QUEUE_INSERT_CHUNK_SIZE = 8;
const MEDIA_SESSION_WAIT_ATTEMPTS = 100;
const MEDIA_SESSION_WAIT_MS = 100;

let castApiPromise: Promise<void> | null = null;
let configuredReceiverAppId: string | null = null;

export type CastRepeatMode = "off" | "all" | "one";
export type CastReceiverMode = "custom" | "compatibility";

export type CastTrack = {
  id: string;
  streamUrl?: string;
  streamContentType?: string;
  castContentId?: string;
  castUrl?: string;
  castDayUrl?: string;
  castLegacyUrl?: string;
  castContentType?: string;
  castHlsUrl?: string;
  castHlsContentType?: string;
  duration?: number;
};

type CastableTrack = CastTrack &
  (
    | { streamUrl: string }
    | { castUrl: string }
  );

export type CastRemoteState = {
  connected: boolean;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  ownsLoungeMedia: boolean;
  trackId: string | null;
  volume: number;
};

export type CastQueueOptions = {
  autoplay?: boolean;
  currentIndex?: number;
  currentTime?: number;
  preserveQueueOrder?: boolean;
  repeatMode?: CastRepeatMode;
  shuffle?: boolean;
};

export type CastLauncherHandle = {
  disconnect: (stopReceiver?: boolean) => boolean;
  loadQueue: (options?: CastQueueOptions) => Promise<boolean>;
  next: () => boolean;
  pause: () => boolean;
  play: () => boolean;
  previous: () => boolean;
  requestSession: () => Promise<boolean>;
  seekTo: (seconds: number) => boolean;
  setPlaybackMode: (
    repeatMode: CastRepeatMode,
    shuffle: boolean
  ) => Promise<boolean>;
  setTheme: (theme: SceneTheme) => boolean;
  setVolume: (volume: number) => boolean;
  togglePlayback: () => boolean;
};

type CastLauncherProps = {
  artworkUrl?: string;
  className?: string;
  currentIndex?: number;
  currentTime?: number;
  onAvailabilityChange?: (available: boolean) => void;
  onCastActiveChange?: (active: boolean) => void;
  onError?: (message: string) => void;
  onRemoteStateChange?: (state: CastRemoteState) => void;
  onUnavailableClick?: () => void;
  repeatMode?: CastRepeatMode;
  sceneTheme: SceneTheme;
  shuffle?: boolean;
  tracks: readonly CastTrack[];
};

type LiveCastSettings = Required<
  Pick<
    CastLauncherProps,
    "currentIndex" | "currentTime" | "repeatMode" | "shuffle"
  >
> & {
  tracks: readonly CastTrack[];
};

function castFrameworkIsReady() {
  return (
    typeof window !== "undefined" &&
    typeof cast !== "undefined" &&
    Boolean(cast.framework?.CastContext)
  );
}

function ensureCastApi() {
  if (castFrameworkIsReady()) return Promise.resolve();
  if (castApiPromise) return castApiPromise;

  castApiPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (result: "resolve" | "reject", message?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (result === "resolve") {
        resolve();
      } else {
        castApiPromise = null;
        reject(new Error(message || "Google Cast is unavailable."));
      }
    };

    const timeout = window.setTimeout(
      () => finish("reject", "Google Cast took too long to become available."),
      15000
    );
    const previousCallback = window.__onGCastApiAvailable;

    window.__onGCastApiAvailable = (isAvailable, errorInfo) => {
      previousCallback?.(isAvailable, errorInfo);
      if (isAvailable) {
        finish("resolve");
      } else {
        finish("reject", errorInfo || "Google Cast is unavailable.");
      }
    };

    const existingScript = document.getElementById(
      CAST_SDK_ID
    ) as HTMLScriptElement | null;
    if (existingScript) {
      if (castFrameworkIsReady()) finish("resolve");
      return;
    }

    const script = document.createElement("script");
    script.id = CAST_SDK_ID;
    script.src = CAST_SDK_URL;
    script.async = true;
    script.onerror = () =>
      finish("reject", "The Google Cast sender could not be loaded.");
    document.head.appendChild(script);
  });

  return castApiPromise;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toAbsoluteUrl(url: string) {
  return new URL(url, window.location.origin).toString();
}

function randomize<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function repeatModeForCast(repeatMode: CastRepeatMode) {
  if (repeatMode === "one") return chrome.cast.media.RepeatMode.SINGLE;
  if (repeatMode === "all") {
    return chrome.cast.media.RepeatMode.ALL;
  }
  return chrome.cast.media.RepeatMode.OFF;
}

function castErrorCode(error: chrome.cast.Error | string | unknown) {
  if (typeof error === "string" && error.length > 0) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "";
}

function errorDescription(error: chrome.cast.Error | string | unknown) {
  const code = castErrorCode(error);
  if (
    typeof error === "object" &&
    error !== null &&
    "description" in error &&
    typeof error.description === "string"
  ) {
    return code ? `${error.description} (${code})` : error.description;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (code) {
    const normalizedCode = code.toLowerCase();
    const friendlyMessages: Record<string, string> = {
      cancel: "Casting was cancelled.",
      channel_error: "The connection to the television was interrupted.",
      invalid_parameter: "The television rejected the Cast request.",
      load_media_failed: "The television rejected the lounge stream.",
      receiver_unavailable: "That television is no longer available.",
      session_error: "The television could not start a Cast session.",
      timeout: "The television took too long to respond."
    };
    return `${friendlyMessages[normalizedCode] || "Google Cast could not continue."} (${code})`;
  }
  return "The television could not start the lounge.";
}

function validCastTracks(
  tracks: readonly CastTrack[],
  _receiverMode: CastReceiverMode
) {
  void _receiverMode;
  return tracks
    .filter(
      (track): track is CastableTrack =>
        typeof track.castUrl === "string" &&
        track.castUrl.length > 0
    )
    .slice(0, MAX_QUEUE_LENGTH);
}

function castSourceForTrack(
  track: CastableTrack,
  _receiverMode: CastReceiverMode,
  theme: SceneTheme
) {
  const url =
    theme === "day"
      ? track.castDayUrl
      : track.castUrl;
  if (!url) {
    throw new Error(
      `No ${theme} Cast source is configured for ${track.id}.`
    );
  }

  return {
    contentId: toAbsoluteUrl(url),
    contentType: track.castContentType || "application/x-mpegurl",
    contentUrl: toAbsoluteUrl(url),
    protocol: url.endsWith(".m3u8")
      ? "hls"
      : url.endsWith(".mpd")
        ? "dash"
        : "progressive"
  };
}

function castContentId(
  track: CastableTrack,
  receiverMode: CastReceiverMode,
  theme: SceneTheme
) {
  return castSourceForTrack(track, receiverMode, theme).contentId;
}

function castTrackMatchesContentId(
  track: CastableTrack,
  contentId: string,
  _receiverMode: CastReceiverMode
) {
  void _receiverMode;
  const urls = [
    track.castUrl,
    track.castDayUrl,
    track.castLegacyUrl
  ].filter((url): url is string => Boolean(url));
  return urls.some((url) => toAbsoluteUrl(url) === contentId);
}

function castTrackForMediaInfo(
  mediaInfo: chrome.cast.media.MediaInfo | null | undefined,
  castTracks: readonly CastableTrack[],
  receiverMode: CastReceiverMode
) {
  if (!mediaInfo) return undefined;

  const customData = mediaInfo.customData;
  const customTrackId =
    customData &&
    typeof customData === "object" &&
    "loungeTrackId" in customData &&
    typeof customData.loungeTrackId === "string"
      ? customData.loungeTrackId
      : null;
  if (customTrackId) {
    const customTrack = castTracks.find(
      (track) => track.id === customTrackId
    );
    if (customTrack) return customTrack;
  }

  return castTracks.find((track) =>
    castTrackMatchesContentId(
      track,
      mediaInfo.contentId,
      receiverMode
    )
  );
}

function queueTrackOrder(
  media: chrome.cast.media.Media,
  castTracks: readonly CastableTrack[],
  receiverMode: CastReceiverMode
) {
  if (!media.items?.length) return [];

  const trackIds = media.items.map((item) => {
    const contentId = item.media?.contentId;
    const customTrackId =
      item.customData &&
      "loungeTrackId" in item.customData &&
      typeof item.customData.loungeTrackId === "string"
        ? item.customData.loungeTrackId
        : null;
    const customTrack = customTrackId
      ? castTracks.find((track) => track.id === customTrackId)
      : undefined;

    if (
      customTrack &&
      (!contentId ||
        castTrackMatchesContentId(
          customTrack,
          contentId,
          receiverMode
        ))
    ) {
      return customTrack.id;
    }

    if (!contentId) return null;
    return (
      castTracks.find((track) =>
        castTrackMatchesContentId(
          track,
          contentId,
          receiverMode
        )
      )?.id || null
    );
  });

  return trackIds.every((trackId): trackId is string => Boolean(trackId))
    ? trackIds
    : [];
}

function createQueueItem(
  track: CastableTrack,
  theme: SceneTheme,
  receiverMode: CastReceiverMode,
  options: {
    autoplay?: boolean;
  } = {}
) {
  const source = castSourceForTrack(track, receiverMode, theme);
  const mediaInfo = new chrome.cast.media.MediaInfo(
    source.contentId,
    source.contentType
  );
  mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
  if (receiverMode === "custom") {
    mediaInfo.contentUrl = source.contentUrl;
    mediaInfo.customData = {
      loungeTrackId: track.id,
      sceneTheme: theme,
      sourceProtocol: source.protocol
    };
  }
  if (
    typeof track.duration === "number" &&
    Number.isFinite(track.duration) &&
    track.duration > 0
  ) {
    mediaInfo.duration = track.duration;
  }

  const metadata = new chrome.cast.media.GenericMediaMetadata();
  metadata.title = "Lagoon Lounge";
  metadata.subtitle = "A Magnanimis Listening Room";
  metadata.images = [];
  mediaInfo.metadata = metadata;

  const item = new chrome.cast.media.QueueItem(mediaInfo);
  item.autoplay = options.autoplay ?? true;
  if (
    typeof track.duration === "number" &&
    Number.isFinite(track.duration) &&
    track.duration > 0
  ) {
    item.playbackDuration = track.duration;
  }
  item.customData = {
    loungeTrackId: track.id,
    sceneTheme: theme
  };
  item.startTime = 0;
  return item;
}

function createInitialLoadRequest(
  track: CastableTrack,
  startTime: number,
  theme: SceneTheme,
  receiverMode: CastReceiverMode,
  autoplay = true
) {
  const item = createQueueItem(track, theme, receiverMode, {
    autoplay
  });
  const queueData = new chrome.cast.media.QueueData();
  queueData.name = "Lagoon Lounge";
  queueData.description = "A Magnanimis Listening Room";
  queueData.items = [item];
  queueData.queueType = chrome.cast.media.QueueType.VIDEO_PLAYLIST;
  queueData.repeatMode = chrome.cast.media.RepeatMode.OFF;
  queueData.startIndex = 0;
  queueData.startTime = startTime;

  const request = new chrome.cast.media.LoadRequest(item.media);
  request.autoplay = autoplay;
  request.currentTime = startTime;
  (
    request as chrome.cast.media.LoadRequest & {
      customData: {
        loungeQueueLoad: boolean;
        sceneTheme: SceneTheme;
      };
    }
  ).customData = {
    loungeQueueLoad: true,
    sceneTheme: theme
  };
  request.queueData = queueData;
  return request;
}

async function waitForMediaSession(
  session: cast.framework.CastSession,
  expectedContentId: string
) {
  for (
    let attempt = 0;
    attempt < MEDIA_SESSION_WAIT_ATTEMPTS;
    attempt += 1
  ) {
    const media = session.getMediaSession();
    if (media?.media?.contentId === expectedContentId) return media;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, MEDIA_SESSION_WAIT_MS);
    });
  }
  return null;
}

function insertQueueItems(
  media: chrome.cast.media.Media,
  items: chrome.cast.media.QueueItem[]
) {
  return new Promise<void>((resolve, reject) => {
    const request = new chrome.cast.media.QueueInsertItemsRequest(items);
    media.queueInsertItems(request, resolve, reject);
  });
}

function setQueueRepeatMode(
  media: chrome.cast.media.Media,
  repeatMode: CastRepeatMode
) {
  return new Promise<void>((resolve, reject) => {
    media.queueSetRepeatMode(
      repeatModeForCast(repeatMode),
      resolve,
      reject
    );
  });
}

function configureCastContext(receiverMode: CastReceiverMode) {
  const context = cast.framework.CastContext.getInstance();
  const receiverApplicationId =
    receiverMode === "custom" && CAST_RECEIVER_APP_ID
      ? CAST_RECEIVER_APP_ID
      : chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID;
  if (configuredReceiverAppId !== receiverApplicationId) {
    context.setOptions({
      receiverApplicationId,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
    configuredReceiverAppId = receiverApplicationId;
  }
  return context;
}

export const CastLauncher = forwardRef<
  CastLauncherHandle,
  CastLauncherProps
>(function CastLauncher(
  {
    className = "",
    currentIndex = 0,
    currentTime = 0,
    onAvailabilityChange,
    onCastActiveChange,
    onError,
    onRemoteStateChange,
    onUnavailableClick,
    repeatMode = "all",
    sceneTheme,
    shuffle = false,
    tracks
  },
  ref
) {
  const initialReceiverMode: CastReceiverMode =
    HAS_CUSTOM_CAST_RECEIVER ? "custom" : "compatibility";
  const [apiReady, setApiReady] = useState(false);
  const [receiverAvailable, setReceiverAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const receiverMode = initialReceiverMode;

  const remotePlayerRef = useRef<cast.framework.RemotePlayer | null>(null);
  const remoteControllerRef =
    useRef<cast.framework.RemotePlayerController | null>(null);
  const connectedRef = useRef(false);
  const receiverModeRef =
    useRef<CastReceiverMode>(initialReceiverMode);
  const ownsLoungeMediaRef = useRef(false);
  const lastShuffleRef = useRef(shuffle);
  const loadGenerationRef = useRef(0);
  const pendingCompatibilityThemeRef =
    useRef<SceneTheme | null>(null);
  const queueOrderRef = useRef<string[]>([]);
  const queueReadyRef = useRef(false);
  const themeRef = useRef<SceneTheme>(sceneTheme);
  themeRef.current = sceneTheme;
  const callbackRef = useRef({
    onAvailabilityChange,
    onCastActiveChange,
    onError,
    onRemoteStateChange
  });
  const settingsRef = useRef<LiveCastSettings>({
    currentIndex,
    currentTime,
    repeatMode,
    shuffle,
    tracks
  });

  useEffect(() => {
    callbackRef.current = {
      onAvailabilityChange,
      onCastActiveChange,
      onError,
      onRemoteStateChange
    };
    settingsRef.current = {
      currentIndex,
      currentTime,
      repeatMode,
      shuffle,
      tracks
    };
  }, [
    currentIndex,
    currentTime,
    onAvailabilityChange,
    onCastActiveChange,
    onError,
    onRemoteStateChange,
    repeatMode,
    shuffle,
    tracks
  ]);

  const reportError = useCallback(
    (error: chrome.cast.Error | string | unknown) => {
      callbackRef.current.onError?.(errorDescription(error));
    },
    []
  );

  const updateConnection = useCallback((active: boolean) => {
    if (connectedRef.current === active) return;
    connectedRef.current = active;
    setConnected(active);
  }, []);

  const updateOwnership = useCallback((active: boolean) => {
    if (ownsLoungeMediaRef.current === active) return;
    ownsLoungeMediaRef.current = active;
    callbackRef.current.onCastActiveChange?.(active);
  }, []);

  const notifyRemoteState = useCallback(() => {
    const player = remotePlayerRef.current;
    if (!player) return;

    const activeReceiverMode = receiverModeRef.current;
    const castTracks = validCastTracks(
      settingsRef.current.tracks,
      activeReceiverMode
    );
    const activeTrack = castTrackForMediaInfo(
      player.mediaInfo,
      castTracks,
      activeReceiverMode
    );

    callbackRef.current.onRemoteStateChange?.({
      connected: player.isConnected,
      currentTime: Number.isFinite(player.currentTime)
        ? player.currentTime
        : 0,
      duration: Number.isFinite(player.duration) ? player.duration : 0,
      isPaused: player.isPaused,
      ownsLoungeMedia: Boolean(activeTrack),
      trackId: activeTrack?.id || null,
      volume: Number.isFinite(player.volumeLevel)
        ? player.volumeLevel
        : 1
    });
  }, []);

  const loadQueue = useCallback(
    async (overrides: CastQueueOptions = {}) => {
      if (!castFrameworkIsReady()) {
        reportError(new Error("Google Cast is not ready."));
        return false;
      }

      const activeReceiverMode = receiverModeRef.current;
      const context = configureCastContext(activeReceiverMode);
      const session = context.getCurrentSession();
      if (!session) {
        reportError(new Error("Choose a television first."));
        return false;
      }
      const loadGeneration = loadGenerationRef.current + 1;
      loadGenerationRef.current = loadGeneration;
      queueReadyRef.current = false;
      const isCurrentLoad = () =>
        loadGenerationRef.current === loadGeneration &&
        receiverModeRef.current === activeReceiverMode &&
        configureCastContext(activeReceiverMode).getCurrentSession() ===
          session;

      const live = settingsRef.current;
      const sceneTheme = themeRef.current;
      const castTracks = validCastTracks(
        live.tracks,
        activeReceiverMode
      );
      if (!castTracks.length) {
        reportError(
          new Error("The television versions of the lounge are not ready.")
        );
        return false;
      }
      const missingThemeTrack =
        sceneTheme === "day"
          ? castTracks.find((track) => !track.castDayUrl)
          : undefined;
      if (missingThemeTrack) {
        reportError(
          new Error(
            "The daytime television version of the full lounge is not ready."
          )
        );
        return false;
      }

      const requestedIndex = clamp(
        overrides.currentIndex ?? live.currentIndex,
        0,
        Math.max(0, live.tracks.length - 1)
      );
      const requestedTrack = live.tracks[requestedIndex];
      const currentCastIndex = Math.max(
        0,
        castTracks.findIndex((track) => track.id === requestedTrack?.id)
      );
      const nextShuffle = overrides.shuffle ?? live.shuffle;
      const nextRepeatMode = overrides.repeatMode ?? live.repeatMode;
      const requestedCastTrack = castTracks[currentCastIndex];

      let orderedTracks: CastableTrack[];
      const preservedTracks = overrides.preserveQueueOrder
        ? queueOrderRef.current
            .map((trackId) =>
              castTracks.find((track) => track.id === trackId)
            )
            .filter(
              (track): track is CastableTrack => Boolean(track)
            )
        : [];
      const preservedCurrentIndex = preservedTracks.findIndex(
        (track) => track.id === requestedCastTrack.id
      );

      if (preservedCurrentIndex >= 0) {
        orderedTracks =
          nextRepeatMode === "off"
            ? preservedTracks.slice(preservedCurrentIndex)
            : [
                ...preservedTracks.slice(preservedCurrentIndex),
                ...preservedTracks.slice(0, preservedCurrentIndex)
              ];
      } else if (nextShuffle) {
        orderedTracks = [
          requestedCastTrack,
          ...randomize(
            castTracks.filter((track) => track.id !== requestedCastTrack.id)
          )
        ];
      } else if (nextRepeatMode === "off") {
        orderedTracks = castTracks.slice(currentCastIndex);
      } else {
        orderedTracks = [
          ...castTracks.slice(currentCastIndex),
          ...castTracks.slice(0, currentCastIndex)
        ];
      }
      queueOrderRef.current = orderedTracks.map((track) => track.id);

      const startTime = Math.max(
        0,
        overrides.currentTime ?? live.currentTime
      );
      const shouldAutoplay = overrides.autoplay ?? true;

      try {
        await session.loadMedia(
          createInitialLoadRequest(
            orderedTracks[0],
            startTime,
            sceneTheme,
            activeReceiverMode,
            shouldAutoplay
          )
        );
        if (!isCurrentLoad()) return false;
      } catch (loadError) {
        if (!isCurrentLoad()) return false;
        reportError(loadError);
        return false;
      }

      lastShuffleRef.current = nextShuffle;
      updateConnection(true);
      updateOwnership(true);
      notifyRemoteState();

      const activeMedia = await waitForMediaSession(
        session,
        castContentId(
          orderedTracks[0],
          activeReceiverMode,
          sceneTheme
        )
      );
      if (!isCurrentLoad()) return false;
      if (!activeMedia) {
        updateOwnership(false);
        reportError(
          new Error(
            "The television did not confirm that the lounge had loaded."
          )
        );
        return false;
      }

      try {
        const remainingItems = orderedTracks
          .slice(1)
          .map((track) =>
            createQueueItem(
              track,
              sceneTheme,
              activeReceiverMode
            )
          );
        for (
          let offset = 0;
          offset < remainingItems.length;
          offset += QUEUE_INSERT_CHUNK_SIZE
        ) {
          if (!isCurrentLoad()) return false;
          await insertQueueItems(
            activeMedia,
            remainingItems.slice(
              offset,
              offset + QUEUE_INSERT_CHUNK_SIZE
            )
          );
          if (offset === 0) {
            queueReadyRef.current = true;
          }
        }
        if (!isCurrentLoad()) return false;
        await setQueueRepeatMode(activeMedia, nextRepeatMode);
        queueReadyRef.current = true;
        lastShuffleRef.current = nextShuffle;
        notifyRemoteState();
      } catch (queueError) {
        if (!isCurrentLoad()) return false;
        queueReadyRef.current = true;
        reportError(
          new Error(
            `The television started, but the full playlist could not be added. ${errorDescription(queueError)}`
          )
        );
      }
      return true;
    },
    [notifyRemoteState, reportError, updateConnection, updateOwnership]
  );

  const getRemoteMedia = useCallback(() => {
    if (!castFrameworkIsReady()) return null;
    return (
      configureCastContext(receiverModeRef.current)
        .getCurrentSession()
        ?.getMediaSession() || null
    );
  }, []);

  const runQueueAction = useCallback(
    (
      action: (
        media: chrome.cast.media.Media,
        success: () => void,
        failure: (error: chrome.cast.Error) => void
      ) => void
    ) => {
      if (!queueReadyRef.current) return false;
      const media = getRemoteMedia();
      if (!media) return false;
      action(media, notifyRemoteState, reportError);
      return true;
    },
    [getRemoteMedia, notifyRemoteState, reportError]
  );

  const play = useCallback(() => {
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (
      !ownsLoungeMediaRef.current ||
      !player?.isConnected ||
      !player.mediaInfo
    ) {
      if (
        castFrameworkIsReady() &&
        configureCastContext(receiverModeRef.current).getCurrentSession()
      ) {
        void loadQueue();
        return true;
      }
      return false;
    }
    if (!controller) return false;
    if (player.isPaused) controller.playOrPause();
    return true;
  }, [loadQueue]);

  const pause = useCallback(() => {
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (!player?.isConnected || !controller) return false;
    if (!player.isPaused) controller.playOrPause();
    return true;
  }, []);

  const togglePlayback = useCallback(() => {
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (
      !ownsLoungeMediaRef.current ||
      !player?.isConnected ||
      !player.mediaInfo
    ) {
      if (
        castFrameworkIsReady() &&
        configureCastContext(receiverModeRef.current).getCurrentSession()
      ) {
        void loadQueue();
        return true;
      }
      return false;
    }
    if (!controller) return false;
    controller.playOrPause();
    return true;
  }, [loadQueue]);

  const seekTo = useCallback((seconds: number) => {
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (!player?.isConnected || !controller || !player.canSeek) return false;
    player.currentTime = clamp(seconds, 0, Math.max(0, player.duration));
    controller.seek();
    return true;
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (
      !player?.isConnected ||
      !controller ||
      !player.canControlVolume
    ) {
      return false;
    }
    player.volumeLevel = clamp(nextVolume, 0, 1);
    controller.setVolumeLevel();
    return true;
  }, []);

  const setPlaybackMode = useCallback(
    async (nextRepeatMode: CastRepeatMode, nextShuffle: boolean) => {
      if (!queueReadyRef.current) return true;
      if (nextShuffle !== lastShuffleRef.current) {
        const player = remotePlayerRef.current;
        const activeReceiverMode = receiverModeRef.current;
        const castTracks = validCastTracks(
          settingsRef.current.tracks,
          activeReceiverMode
        );
        const activeTrack = castTrackForMediaInfo(
          player?.mediaInfo,
          castTracks,
          activeReceiverMode
        );
        const sourceIndex = activeTrack
          ? settingsRef.current.tracks.findIndex(
              (track) => track.id === activeTrack.id
            )
          : settingsRef.current.currentIndex;
        return loadQueue({
          currentIndex: Math.max(0, sourceIndex),
          currentTime: player?.currentTime || 0,
          repeatMode: nextRepeatMode,
          shuffle: nextShuffle
        });
      }

      return new Promise<boolean>((resolve) => {
        const media = getRemoteMedia();
        if (!media) {
          resolve(false);
          return;
        }
        media.queueSetRepeatMode(
          repeatModeForCast(nextRepeatMode),
          () => resolve(true),
          (error) => {
            reportError(error);
            resolve(false);
          }
        );
      });
    },
    [getRemoteMedia, loadQueue, reportError]
  );

  const setTheme = useCallback(
    (theme: SceneTheme) => {
      themeRef.current = theme;
      if (!castFrameworkIsReady()) {
        return false;
      }

      const activeReceiverMode = receiverModeRef.current;
      const session = configureCastContext(
        activeReceiverMode
      ).getCurrentSession();
      if (!session) return false;

      if (pendingCompatibilityThemeRef.current === theme) {
        return true;
      }

      const media = session.getMediaSession();
      const contentId = media?.media?.contentId;
      if (!media || !contentId) return false;

      const castTracks = validCastTracks(
        settingsRef.current.tracks,
        activeReceiverMode
      );
      if (
        theme === "day" &&
        castTracks.some((track) => !track.castDayUrl)
      ) {
        reportError(
          new Error(
            "The daytime television version of the full lounge is not ready."
          )
        );
        return false;
      }
      const activeTrack = castTracks.find((track) =>
        castTrackMatchesContentId(
          track,
          contentId,
          activeReceiverMode
        )
      );
      if (!activeTrack) return false;

      const desiredContentId = castContentId(
        activeTrack,
        activeReceiverMode,
        theme
      );
      if (
        desiredContentId === contentId &&
        pendingCompatibilityThemeRef.current === null
      ) {
        pendingCompatibilityThemeRef.current = null;
        return true;
      }

      const sourceIndex = settingsRef.current.tracks.findIndex(
        (track) => track.id === activeTrack.id
      );
      const estimatedTime = media.getEstimatedTime();
      const remotePlayer = remotePlayerRef.current;
      pendingCompatibilityThemeRef.current = theme;
      void loadQueue({
        autoplay: !(remotePlayer?.isPaused ?? false),
        currentIndex: Math.max(0, sourceIndex),
        currentTime: Number.isFinite(estimatedTime)
          ? estimatedTime
          : remotePlayer?.currentTime || 0,
        preserveQueueOrder: true,
        repeatMode: settingsRef.current.repeatMode,
        shuffle: settingsRef.current.shuffle
      }).finally(() => {
        if (pendingCompatibilityThemeRef.current === theme) {
          pendingCompatibilityThemeRef.current = null;
        }
      });
      return true;
    },
    [loadQueue, reportError]
  );

  const requestSession = useCallback(async () => {
    if (!castFrameworkIsReady()) {
      return false;
    }

    const context = configureCastContext(receiverModeRef.current);

    try {
      await context.requestSession();
      return true;
    } catch (error) {
      const code = castErrorCode(error);
      if (code !== chrome.cast.ErrorCode.CANCEL) {
        reportError(error);
      }
      return false;
    }
  }, [reportError]);

  const disconnect = useCallback((stopReceiver = true) => {
    if (!castFrameworkIsReady()) return false;
    const session = configureCastContext(
      receiverModeRef.current
    ).getCurrentSession();
    if (!session) return false;
    loadGenerationRef.current += 1;
    queueReadyRef.current = false;
    session.endSession(stopReceiver);
    return true;
  }, []);

  const previous = useCallback(() => {
    const player = remotePlayerRef.current;
    if (!ownsLoungeMediaRef.current || !player?.isConnected) return false;
    if (player.currentTime > 5) return seekTo(0);
    return runQueueAction((media, success, failure) =>
      media.queuePrev(success, failure)
    );
  }, [runQueueAction, seekTo]);

  useImperativeHandle(
    ref,
    () => ({
      disconnect,
      loadQueue,
      next: () =>
        runQueueAction((media, success, failure) =>
          media.queueNext(success, failure)
        ),
      pause,
      play,
      previous,
      requestSession,
      seekTo,
      setPlaybackMode,
      setTheme,
      setVolume,
      togglePlayback
    }),
    [
      disconnect,
      loadQueue,
      pause,
      play,
      previous,
      requestSession,
      runQueueAction,
      seekTo,
      setPlaybackMode,
      setTheme,
      setVolume,
      togglePlayback
    ]
  );

  useEffect(() => {
    let cancelled = false;
    let context: cast.framework.CastContext | null = null;
    let remoteController: cast.framework.RemotePlayerController | null = null;

    const updateAvailability = (castState: string) => {
      const available =
        castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
      setReceiverAvailable(available);
      callbackRef.current.onAvailabilityChange?.(available);
    };

    const onCastStateChanged = (
      event: cast.framework.CastStateEventData
    ) => updateAvailability(event.castState);

    const startOrSyncSession = (
      session: cast.framework.CastSession | null
    ) => {
      if (!session) return;
      updateConnection(true);
      const activeMedia = session.getMediaSession();
      const activeReceiverMode = receiverModeRef.current;
      const castTracks = validCastTracks(
        settingsRef.current.tracks,
        activeReceiverMode
      );
      const activeMediaInfo = activeMedia?.media;
      const activeTrack = castTrackForMediaInfo(
        activeMediaInfo,
        castTracks,
        activeReceiverMode
      );
      if (
        !activeMediaInfo ||
        !activeTrack
      ) {
        if (activeMediaInfo) updateOwnership(false);
        void loadQueue();
      } else {
        const restoredQueueOrder = activeMedia
          ? queueTrackOrder(
              activeMedia,
              castTracks,
              activeReceiverMode
            )
          : [];
        if (restoredQueueOrder.length) {
          queueOrderRef.current = restoredQueueOrder;
        }
        queueReadyRef.current = true;
        updateOwnership(true);
        notifyRemoteState();
        if (activeReceiverMode === "custom") {
          setTheme(themeRef.current);
        }
      }
    };

    const onSessionStateChanged = (
      event: cast.framework.SessionStateEventData
    ) => {
      if (
        event.sessionState ===
          cast.framework.SessionState.SESSION_STARTED ||
        event.sessionState ===
          cast.framework.SessionState.SESSION_RESUMED
      ) {
        startOrSyncSession(
          event.session || context?.getCurrentSession() || null
        );
        return;
      }

      if (
        event.sessionState ===
          cast.framework.SessionState.SESSION_ENDED ||
        event.sessionState ===
          cast.framework.SessionState.SESSION_START_FAILED
      ) {
        loadGenerationRef.current += 1;
        queueReadyRef.current = false;
        if (
          event.sessionState ===
            cast.framework.SessionState.SESSION_START_FAILED &&
          event.errorCode
        ) {
          reportError(event.errorCode);
        }
        updateConnection(false);
        updateOwnership(false);
      }
    };

    const onRemoteChange = () => {
      const player = remotePlayerRef.current;
      const isConnected = Boolean(player?.isConnected);
      updateConnection(isConnected);
      if (!isConnected) {
        queueReadyRef.current = false;
        updateOwnership(false);
      } else if (player?.mediaInfo) {
        const activeReceiverMode = receiverModeRef.current;
        const activeTrack = castTrackForMediaInfo(
          player.mediaInfo,
          validCastTracks(
          settingsRef.current.tracks,
          activeReceiverMode
          ),
          activeReceiverMode
        );
        updateOwnership(Boolean(activeTrack));
      } else if (queueReadyRef.current) {
        queueReadyRef.current = false;
        updateOwnership(false);
      }
      notifyRemoteState();
    };

    const resyncAfterResume = () => {
      if (
        !context ||
        document.visibilityState === "hidden"
      ) {
        return;
      }
      updateAvailability(context.getCastState());
      const currentSession = context.getCurrentSession();
      if (currentSession) startOrSyncSession(currentSession);
      onRemoteChange();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resyncAfterResume();
    };

    window.addEventListener("pageshow", resyncAfterResume);
    window.addEventListener("online", resyncAfterResume);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    ensureCastApi()
      .then(() => {
        if (cancelled) return;
        context = configureCastContext(receiverModeRef.current);
        const remotePlayer = new cast.framework.RemotePlayer();
        remoteController =
          new cast.framework.RemotePlayerController(remotePlayer);
        remotePlayerRef.current = remotePlayer;
        remoteControllerRef.current = remoteController;

        context.addEventListener<cast.framework.CastStateEventData>(
          cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          onCastStateChanged
        );
        context.addEventListener<cast.framework.SessionStateEventData>(
          cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          onSessionStateChanged
        );
        remoteController.addEventListener(
          cast.framework.RemotePlayerEventType.ANY_CHANGE,
          onRemoteChange
        );

        setApiReady(true);
        updateAvailability(context.getCastState());

        const currentSession = context.getCurrentSession();
        if (currentSession) {
          startOrSyncSession(currentSession);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setApiReady(false);
        setReceiverAvailable(false);
        callbackRef.current.onAvailabilityChange?.(false);
      });

    return () => {
      cancelled = true;
      loadGenerationRef.current += 1;
      queueReadyRef.current = false;
      if (context) {
        context.removeEventListener<cast.framework.CastStateEventData>(
          cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          onCastStateChanged
        );
        context.removeEventListener<cast.framework.SessionStateEventData>(
          cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          onSessionStateChanged
        );
      }
      remoteController?.removeEventListener(
        cast.framework.RemotePlayerEventType.ANY_CHANGE,
        onRemoteChange
      );
      window.removeEventListener("pageshow", resyncAfterResume);
      window.removeEventListener("online", resyncAfterResume);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      remotePlayerRef.current = null;
      remoteControllerRef.current = null;
    };
  }, [
    loadQueue,
    notifyRemoteState,
    reportError,
    setTheme,
    updateConnection,
    updateOwnership
  ]);

  const hasCastMedia = useMemo(
    () => validCastTracks(tracks, receiverMode).length > 0,
    [receiverMode, tracks]
  );

  if (!hasCastMedia) {
    return null;
  }

  if (!apiReady || (!receiverAvailable && !connected)) {
    return (
      <button
        type="button"
        aria-label="TV playback help"
        className={[
          styles.launcher,
          styles.fallbackLauncher,
          className
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          void requestSession().then((started) => {
            if (!started) onUnavailableClick?.();
          });
        }}
        title="Set up TV playback"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          focusable="false"
        >
          <path d="M3.2 18.6h2.4a2.4 2.4 0 0 0-2.4-2.4v2.4Zm0-4.4a4.4 4.4 0 0 1 4.4 4.4H9.5a6.3 6.3 0 0 0-6.3-6.3v1.9Zm0-4.1a8.5 8.5 0 0 1 8.5 8.5h1.9A10.4 10.4 0 0 0 3.2 8.2v1.9ZM5 4.7h14a1.8 1.8 0 0 1 1.8 1.8v10.1a1.8 1.8 0 0 1-1.8 1.8h-3.2v-1.9H19V6.6H5v1.5H3.1V6.5A1.9 1.9 0 0 1 5 4.7Z" />
        </svg>
      </button>
    );
  }

  return createElement("google-cast-launcher", {
    "aria-label": connected
      ? "Manage television playback"
      : "Play Lagoon Lounge on a television",
    className: [styles.launcher, className].filter(Boolean).join(" "),
    title: connected ? "Playing on television" : "Play on television"
  });
});
