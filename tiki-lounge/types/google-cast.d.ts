export {};

declare global {
  interface Window {
    __onGCastApiAvailable?: (
      isAvailable: boolean,
      errorInfo?: string
    ) => void;
  }

  namespace chrome {
    namespace cast {
      const AutoJoinPolicy: {
        readonly ORIGIN_SCOPED: string;
      };

      const ErrorCode: {
        readonly API_NOT_INITIALIZED: string;
        readonly CANCEL: string;
        readonly CHANNEL_ERROR: string;
        readonly EXTENSION_MISSING: string;
        readonly EXTENSION_NOT_COMPATIBLE: string;
        readonly INVALID_PARAMETER: string;
        readonly LOAD_MEDIA_FAILED: string;
        readonly RECEIVER_UNAVAILABLE: string;
        readonly SESSION_ERROR: string;
        readonly TIMEOUT: string;
      };

      class Image {
        constructor(url: string);
        url: string;
        height?: number;
        width?: number;
      }

      interface Error {
        code: string;
        description?: string;
        details?: object;
      }

      namespace media {
        const DEFAULT_MEDIA_RECEIVER_APP_ID: string;

        const QueueType: {
          readonly PLAYLIST: string;
          readonly VIDEO_PLAYLIST: string;
        };

        const RepeatMode: {
          readonly OFF: string;
          readonly ALL: string;
          readonly SINGLE: string;
          readonly ALL_AND_SHUFFLE: string;
        };

        const StreamType: {
          readonly BUFFERED: string;
        };

        class GenericMediaMetadata {
          title?: string;
          subtitle?: string;
          images?: chrome.cast.Image[];
        }

        class MediaInfo {
          constructor(contentId: string, contentType: string);
          contentId: string;
          contentType: string;
          contentUrl?: string;
          customData?: object;
          duration?: number;
          metadata?: GenericMediaMetadata;
          streamType?: string;
        }

        class QueueItem {
          constructor(mediaInfo: MediaInfo);
          autoplay: boolean;
          customData: object | null;
          itemId: number | null;
          media: MediaInfo;
          playbackDuration: number | null;
          preloadTime: number;
          startTime: number;
        }

        class QueueData {
          constructor(
            id?: string,
            name?: string,
            description?: string,
            repeatMode?: string,
            items?: QueueItem[],
            startIndex?: number,
            startTime?: number
          );
          description?: string;
          id?: string;
          items?: QueueItem[];
          name?: string;
          queueType?: string;
          repeatMode?: string;
          shuffle?: boolean;
          startIndex?: number;
          startTime?: number;
        }

        class QueueInsertItemsRequest {
          constructor(itemsToInsert: QueueItem[]);
          customData: object | null;
          insertBefore: number | null;
          items: QueueItem[];
        }

        class LoadRequest {
          constructor(mediaInfo: MediaInfo);
          autoplay: boolean;
          currentTime: number | null;
          media: MediaInfo;
          queueData?: QueueData;
        }

        class Media {
          currentItemId: number | null;
          items: QueueItem[] | null;
          media: MediaInfo | null;
          queueData?: QueueData;
          repeatMode: string;
          getEstimatedTime(): number;
          queueNext(
            successCallback: () => void,
            errorCallback: (error: chrome.cast.Error) => void
          ): void;
          queuePrev(
            successCallback: () => void,
            errorCallback: (error: chrome.cast.Error) => void
          ): void;
          queueInsertItems(
            request: QueueInsertItemsRequest,
            successCallback: () => void,
            errorCallback: (error: chrome.cast.Error) => void
          ): void;
          queueSetRepeatMode(
            repeatMode: string,
            successCallback: () => void,
            errorCallback: (error: chrome.cast.Error) => void
          ): void;
        }
      }
    }
  }

  namespace cast {
    namespace framework {
      const CastContextEventType: {
        readonly CAST_STATE_CHANGED: string;
        readonly SESSION_STATE_CHANGED: string;
      };

      const CastState: {
        readonly NO_DEVICES_AVAILABLE: string;
        readonly NOT_CONNECTED: string;
        readonly CONNECTING: string;
        readonly CONNECTED: string;
      };

      const SessionState: {
        readonly NO_SESSION: string;
        readonly SESSION_STARTING: string;
        readonly SESSION_STARTED: string;
        readonly SESSION_START_FAILED: string;
        readonly SESSION_ENDING: string;
        readonly SESSION_ENDED: string;
        readonly SESSION_RESUMED: string;
      };

      const RemotePlayerEventType: {
        readonly ANY_CHANGE: string;
      };

      interface CastStateEventData {
        castState: string;
      }

      interface SessionStateEventData {
        errorCode?: string;
        session: CastSession | null;
        sessionState: string;
      }

      class CastSession {
        endSession(stopCasting: boolean): void;
        getMediaSession(): chrome.cast.media.Media | null;
        loadMedia(
          request: chrome.cast.media.LoadRequest
        ): Promise<void>;
        sendMessage(
          namespace: string,
          message: object | string
        ): Promise<void>;
      }

      class CastContext {
        static getInstance(): CastContext;
        addEventListener<TEvent>(
          type: string,
          handler: (event: TEvent) => void
        ): void;
        getCastState(): string;
        getCurrentSession(): CastSession | null;
        requestSession(): Promise<string | null>;
        removeEventListener<TEvent>(
          type: string,
          handler: (event: TEvent) => void
        ): void;
        setOptions(options: {
          autoJoinPolicy?: string;
          receiverApplicationId: string;
        }): void;
      }

      class RemotePlayer {
        canControlVolume: boolean;
        canPause: boolean;
        canSeek: boolean;
        currentTime: number;
        duration: number;
        isConnected: boolean;
        isMuted: boolean;
        isPaused: boolean;
        mediaInfo: chrome.cast.media.MediaInfo | null;
        playerState: string;
        volumeLevel: number;
      }

      class RemotePlayerController {
        constructor(player: RemotePlayer);
        addEventListener<TEvent>(
          type: string,
          handler: (event: TEvent) => void
        ): void;
        playOrPause(): void;
        removeEventListener<TEvent>(
          type: string,
          handler: (event: TEvent) => void
        ): void;
        seek(): void;
        setVolumeLevel(): void;
        stop(): void;
      }
    }
  }
}
