export type YouTubeSearchResult = {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number | null;
  durationLabel: string | null;
};

export type ResolvedLink = {
  source: "youtube" | "spotify";
  youtube_url: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string | null;
  durationLabel: string | null;
  // For Spotify: the original Spotify track title we searched for, so the UI
  // can show "matched from Spotify: ..."
  spotifyTitle?: string;
};
