export function isChunkLoadError(error: { name?: string; message?: string }): boolean {
  return error.name === "ChunkLoadError" || /Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message ?? "");
}

/** Persist before navigating; refuse automatic reload if storage is unavailable. */
export function claimChunkReload(storage: Pick<Storage, "getItem" | "setItem">, now = Date.now()): boolean {
  try {
    const previous = Number(storage.getItem("mojo:chunk-recovery"));
    if (previous > 0 && now - previous < 300_000) return false;
    storage.setItem("mojo:chunk-recovery", String(now));
    return true;
  } catch { return false; }
}
