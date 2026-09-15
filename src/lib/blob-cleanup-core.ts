export function songBlobPrefix(id: string): string {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid song ID");
  return `stems/${id}/`;
}

type BlobItem = { pathname: string; url: string };
type CleanupIO = {
  songExists: () => Promise<boolean>;
  list: (prefix: string, cursor?: string) => Promise<{ blobs: BlobItem[]; hasMore: boolean; cursor?: string }>;
  remove: (urls: string[]) => Promise<void>;
};

/** Only an explicitly queued, absent song may be cleaned. Never delete a broad prefix. */
export async function cleanDeletedSong(id: string, io: CleanupIO): Promise<number> {
  const prefix = songBlobPrefix(id);
  if (await io.songExists()) throw new Error("Song still exists; refusing cleanup");
  let cursor: string | undefined;
  const urls: string[] = [];
  for (let page = 0; page < 100; page++) {
    const result = await io.list(prefix, cursor);
    for (const blob of result.blobs) {
      if (!blob.pathname.startsWith(prefix)) throw new Error("Unexpected blob outside song prefix");
      urls.push(blob.url);
    }
    if (!result.hasMore) {
      if (await io.songExists()) throw new Error("Song restored; refusing cleanup");
      for (let i = 0; i < urls.length; i += 100) await io.remove(urls.slice(i, i + 100));
      return urls.length;
    }
    if (!result.cursor || result.cursor === cursor) throw new Error("Incomplete blob inventory");
    cursor = result.cursor;
  }
  throw new Error("Blob inventory exceeded safety limit");
}
