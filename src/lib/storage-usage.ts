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
