export type CatalogSong = {
  id: string;
  title: string;
  artist: string | null;
};

export type ArtistGroup<T extends CatalogSong> = {
  artist: string;
  songs: T[];
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function groupSongsByArtist<T extends CatalogSong>(
  songs: T[],
): ArtistGroup<T>[] {
  const groups = new Map<string, ArtistGroup<T>>();

  for (const song of songs) {
    const artist = song.artist?.trim() || "Artist pending";
    const key = artist.toLocaleLowerCase();
    const group = groups.get(key);
    if (group) group.songs.push(song);
    else groups.set(key, { artist, songs: [song] });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      songs: [...group.songs].sort((left, right) =>
        collator.compare(left.title, right.title),
      ),
    }))
    .sort((left, right) => {
      if (left.artist === "Artist pending") return 1;
      if (right.artist === "Artist pending") return -1;
      return collator.compare(left.artist, right.artist);
    });
}
