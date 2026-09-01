import assert from "node:assert/strict";
import test from "node:test";
import { groupSongsByArtist } from "./song-catalog";

test("groups artists alphabetically and songs by title", () => {
  const groups = groupSongsByArtist([
    { id: "1", title: "Z Song", artist: "Artist B" },
    { id: "2", title: "B Song", artist: "Artist A" },
    { id: "3", title: "A Song", artist: "Artist A" },
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      artist: group.artist,
      songs: group.songs.map((song) => song.title),
    })),
    [
      { artist: "Artist A", songs: ["A Song", "B Song"] },
      { artist: "Artist B", songs: ["Z Song"] },
    ],
  );
});

test("keeps missing artist metadata at the end", () => {
  const groups = groupSongsByArtist([
    { id: "1", title: "Processing...", artist: null },
    { id: "2", title: "Patience", artist: "Guns N' Roses" },
  ]);

  assert.equal(groups[0].artist, "Guns N' Roses");
  assert.equal(groups[1].artist, "Artist pending");
});
