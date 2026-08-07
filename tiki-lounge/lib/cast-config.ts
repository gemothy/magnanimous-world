export type SceneTheme = "night" | "day";

export const CAST_THEME_NAMESPACE =
  "urn:x-cast:com.magnanimis.midnight-lagoon";

const configuredReceiverAppId =
  process.env.NEXT_PUBLIC_CAST_RECEIVER_APP_ID?.trim();

export const CAST_RECEIVER_APP_ID =
  configuredReceiverAppId || "92441E47";
export const HAS_CUSTOM_CAST_RECEIVER = Boolean(CAST_RECEIVER_APP_ID);

export type CastThemeMessage = {
  type: "SET_THEME";
  theme: SceneTheme;
};

export function castContentIdForTrack(trackId: string) {
  return `urn:magnanimis:midnight-lagoon:track:${encodeURIComponent(trackId)}`;
}
