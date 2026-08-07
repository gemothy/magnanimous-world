(function startLagoonLoungeReceiver() {
  "use strict";

  const BUILD_VERSION = "20260724-ts1";
  const THEME_NAMESPACE =
    "urn:x-cast:com.magnanimis.midnight-lagoon";
  const SCENE_POSTER = Object.freeze({
    night: "/images/midnight-lagoon.webp",
    day: "/images/midnight-lagoon-day.webp"
  });
  const VEIL_COVER_MS = 1500;
  const VEIL_REVEAL_MS = 2100;
  const PLAYBACK_REVEAL_FALLBACK_MS = 30000;
  const body = document.body;
  const castMedia = document.getElementById("castMedia");
  let currentTheme = "night";
  let hasLoadedMedia = false;
  let transitionSequence = 0;
  let revealTimer = null;
  let transitionFallbackTimer = null;

  function requestedTheme(value) {
    return value === "night" || value === "day"
      ? value
      : null;
  }

  function parseMessage(value) {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      void error;
      return null;
    }
  }

  function themeFromLoadRequest(request) {
    const requestCustomData = request && request.customData;
    const mediaCustomData =
      request && request.media && request.media.customData;
    return (
      requestedTheme(
        requestCustomData && requestCustomData.sceneTheme
      ) ||
      requestedTheme(
        mediaCustomData && mediaCustomData.sceneTheme
      )
    );
  }

  function clearTimer(timer) {
    if (timer !== null) window.clearTimeout(timer);
  }

  function clearTransitionTimers() {
    clearTimer(revealTimer);
    clearTimer(transitionFallbackTimer);
    revealTimer = null;
    transitionFallbackTimer = null;
  }

  function setThemeAppearance(theme) {
    currentTheme = theme;
    body.setAttribute("data-theme", theme);
    castMedia.dataset.theme = theme;
    castMedia.poster = SCENE_POSTER[theme];
  }

  function finishTransition(sequence) {
    if (sequence !== transitionSequence) return;
    body.removeAttribute("data-transition");
    body.removeAttribute("data-transition-phase");
    clearTransitionTimers();
  }

  function revealPlayingMedia() {
    if (body.getAttribute("data-transition-phase") !== "covered") {
      return;
    }

    const sequence = transitionSequence;
    clearTimer(transitionFallbackTimer);
    transitionFallbackTimer = null;
    body.setAttribute("data-transition-phase", "revealing");
    revealTimer = window.setTimeout(
      () => finishTransition(sequence),
      VEIL_REVEAL_MS
    );
  }

  function revealPosterAfterGenuineFailure(sequence) {
    clearTimer(transitionFallbackTimer);
    transitionFallbackTimer = window.setTimeout(() => {
      if (
        sequence !== transitionSequence ||
        body.getAttribute("data-transition-phase") !== "covered"
      ) {
        return;
      }
      body.setAttribute("data-receiver-warning", "playback-timeout");
      revealPlayingMedia();
    }, PLAYBACK_REVEAL_FALLBACK_MS);
  }

  async function prepareThemeLoad(theme) {
    const visibleTheme =
      requestedTheme(body.getAttribute("data-theme")) || currentTheme;
    if (!hasLoadedMedia || theme === visibleTheme) {
      transitionSequence += 1;
      clearTransitionTimers();
      body.removeAttribute("data-transition");
      body.removeAttribute("data-transition-phase");
      setThemeAppearance(theme);
      return;
    }

    transitionSequence += 1;
    clearTransitionTimers();
    const sequence = transitionSequence;
    body.removeAttribute("data-receiver-warning");
    body.setAttribute(
      "data-transition",
      `${visibleTheme}-to-${theme}`
    );
    body.setAttribute("data-transition-phase", "covering");

    await new Promise((resolve) => {
      window.setTimeout(resolve, VEIL_COVER_MS);
    });
    if (sequence !== transitionSequence) return;

    body.setAttribute("data-transition-phase", "covered");
    setThemeAppearance(theme);
    revealPosterAfterGenuineFailure(sequence);
  }

  const query = new URLSearchParams(window.location.search);
  const preview = query.has("preview");

  if (preview) {
    body.setAttribute("data-preview", "true");
    body.setAttribute("data-receiver-build", BUILD_VERSION);
    setThemeAppearance(
      requestedTheme(query.get("theme")) || "night"
    );
    return;
  }

  if (
    typeof cast === "undefined" ||
    !cast.framework ||
    !cast.framework.CastReceiverContext
  ) {
    body.setAttribute("data-receiver-error", "unavailable");
    return;
  }

  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();

  body.setAttribute("data-receiver-build", BUILD_VERSION);

  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.LOAD,
    async (request) => {
      const requestedLoadTheme =
        themeFromLoadRequest(request) || currentTheme;
      const requestCustomData = request.customData;
      const isExplicitQueueLoad = Boolean(
        requestCustomData &&
          requestCustomData.loungeQueueLoad === true
      );
      const targetTheme =
        !hasLoadedMedia || isExplicitQueueLoad
          ? requestedLoadTheme
          : currentTheme;

      await prepareThemeLoad(targetTheme);

      if (request.media) {
        request.media.contentType = "application/x-mpegurl";
        request.media.hlsSegmentFormat =
          cast.framework.messages.HlsSegmentFormat.FMP4;
        request.media.hlsVideoSegmentFormat =
          cast.framework.messages.HlsVideoSegmentFormat.MPEG2_TS;
      }

      if (request.media && request.media.metadata) {
        request.media.metadata.images = [];
      }

      hasLoadedMedia = true;
      return request;
    }
  );

  castMedia.addEventListener("playing", revealPlayingMedia);
  castMedia.addEventListener("timeupdate", revealPlayingMedia);
  castMedia.addEventListener("error", () => {
    body.setAttribute("data-receiver-error", "media");
    revealPlayingMedia();
  });

  context.addCustomMessageListener(THEME_NAMESPACE, (event) => {
    const message = parseMessage(event.data);
    if (!message) return;

    if (message.type === "PING") {
      context.sendCustomMessage(
        THEME_NAMESPACE,
        event.senderId,
        {
          type: "READY",
          build: BUILD_VERSION,
          theme: currentTheme
        }
      );
    }
  });

  const receiverOptions = new cast.framework.CastReceiverOptions();
  receiverOptions.mediaElement = castMedia;
  receiverOptions.versionCode = 2026072403;
  context.start(receiverOptions);
})();
