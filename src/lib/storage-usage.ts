export type StoredBlob = {
  pathname: string;
  size: number;
};

export type BlobStorageSummary = {
  totalBytes: number;
  songBytes: Record<string, number>;
};

export function summarizeBlobStorage(blobs: StoredBlob[]): BlobStorageSummary {
  const songBytes: Record<string, number> = {};
  let totalBytes = 0;

  for (const blob of blobs) {
    totalBytes += blob.size;
    const match = blob.pathname.match(/^stems\/([^/]+)\//);
    if (!match) continue;
    const songId = match[1];
    songBytes[songId] = (songBytes[songId] ?? 0) + blob.size;
  }

  return { totalBytes, songBytes };
}

export function storageCapacity(inventory: BlobStorageSummary, readySongIds: string[], limit: number) {
  const sizes = readySongIds.map(id => inventory.songBytes[id] ?? 0).filter(size => size > 0);
  const average = sizes.length ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length : 0;
  const remaining = Math.max(0, limit - inventory.totalBytes);
  return { remaining, average, estimatedSongs: average > 0 ? Math.floor(remaining / average) : null };
}
