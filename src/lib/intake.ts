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
  source: "youtube";
  youtube_url: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string | null;
  durationLabel: string | null;
};
