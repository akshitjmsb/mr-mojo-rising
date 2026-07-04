# UX Work Order — Mr. Mojo Rising
> Generated 2026-04-25. Implement in priority order.

---

## Priority 1 — Quick wins (low effort, high impact)

### 1. Spacebar to play/pause
**File:** `src/app/song/[id]/page.tsx`

Add `" "` (space) to the existing `onKeyDown` handler:

```ts
if (event.key === " ") {
  event.preventDefault();
  togglePlay();
}
```

The handler already listens on `window` — just add the space case alongside ArrowLeft/ArrowRight.

---

### 2. Replace `window.confirm()` with inline confirmation
**File:** `src/app/library/page.tsx`

Remove `window.confirm()` from `handleDeleteSong`. Instead:
- Add state: `const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)`
- First click on "Delete" → set `confirmDeleteId` to the song's id, change button text to "Confirm?" and color to `var(--color-terracotta)`
- Second click → execute the delete
- Clicking anywhere else (or another song row) → reset `confirmDeleteId` to null

---

### 3. Auto-refresh processing songs in the Library
**File:** `src/app/library/page.tsx`

After `fetchSongs()` resolves, check if any songs have `status === "processing"` or `status === "queued"`. If so, start a polling interval (every 4 seconds) that re-fetches `/api/songs` and updates state. Clear the interval when no songs remain in a non-terminal state, or when the component unmounts.

---

### 4. Add "Retry" action for failed songs
**File:** `src/app/library/page.tsx` + `src/app/api/songs/import/route.ts`

On failed songs, show a "Retry" button alongside "Delete". Retry should POST to `/api/songs/import` with the song's original `youtube_url` (make sure this field is stored on the song row — check `database.types.ts`). On success, update the song's status in local state to `"queued"` and let the polling (from item 3 above) take over.

---

## Priority 2 — Player improvements

### 5. Remove duplicate speed control from transport bar
**File:** `src/app/song/[id]/page.tsx`

Remove the `cycleSpeed` button from the transport controls row (the one that shows `"1x"` / `"0.5x"`). The speed preset buttons (50%, 75%, Full) directly below already do the same job more clearly. Removing the cycle button declutters the transport.

---

### 6. Collapse download buttons into a single trigger
**File:** `src/app/song/[id]/page.tsx`

Replace the 5 always-visible download buttons with a single "Download" pill button (same style as the stem toggle pills). Clicking it toggles a small panel open below showing the 5 stem options. This frees up significant vertical space above the waveform.

State: `const [showDownloads, setShowDownloads] = useState(false)`

---

### 7. Add a full-song progress bar
**File:** `src/app/song/[id]/page.tsx`

Above the existing section progress bar, add a thin (2px) non-interactive bar showing overall position in the song:

```
progress = duration > 0 ? currentTime / duration : 0
```

Style it as a muted gold line — subtle, just for orientation. No scrubbing needed on this one.

---

### 8. Show Chords & Lyrics panel open by default
**File:** `src/app/song/[id]/page.tsx`

Change initial state from `const [showPanel, setShowPanel] = useState(false)` to `useState(true)`. Users who don't want it can close it; currently most users never discover it exists.

---

### 9. Fix lyrics offset label copy
**File:** `src/app/song/[id]/page.tsx`

Replace the raw offset display (`+0.5s`, `-1.0s`) with plain-language labels:
- `lyricsOffset === 0` → `"in sync"`
- `lyricsOffset > 0` → `"lyrics early"` (with a tooltip: "click to reset")
- `lyricsOffset < 0` → `"lyrics late"` (with a tooltip: "click to reset")

The `+` / `-` buttons can stay as-is.

---

## Priority 3 — Navigation & structure

### 10. Add a back button to the song player header
**File:** `src/components/Header.tsx` + `src/app/song/[id]/page.tsx`

Pass an optional `backHref` prop to `Header`. When present, render a `←` arrow button at the far left of the header (before the logo) that navigates to `backHref`. From the song player, pass `backHref="/library"`.

```tsx
interface HeaderProps {
  songTitle?: string;
  songArtist?: string;
  backHref?: string;  // new
}
```

---

### 11. Rename or fix the "Practice" tab
**File:** `src/components/TabNav.tsx` + `src/app/practice/page.tsx`

The current behavior silently redirects to the last ready song, which feels broken. Two acceptable fixes — pick one:

**Option A (rename):** Change the tab label from `"Practice"` to `"Last Played"` to match the actual behavior.

**Option B (make it real):** Turn `/practice` into a useful page. Show the most recently played song's sections with a "Quick start" button, plus a BPM/speed picker that persists to localStorage. This is more work but more valuable long-term.

---

### 12. Add URL validation before API call on import
**File:** `src/app/page.tsx`

Before calling `/api/songs/import`, validate that the URL matches a YouTube pattern:

```ts
const isYouTube = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(url.trim());
if (!isYouTube) {
  setError("Please paste a YouTube link (youtube.com/watch or youtu.be/...)");
  return;
}
```

This gives instant feedback instead of waiting for the API to reject it.

---

### 13. Add a cancel button during import
**File:** `src/app/page.tsx`

When `importing === true`, show a "Cancel" link/button below the processing panel. On click:
1. Clear `pollRef.current` and `timeoutRef.current`
2. Set `importing` to false
3. Optionally hit `DELETE /api/songs/{songId}` to clean up the in-progress record

---

## Out of scope / future consideration

- **Waveform from real audio data** — currently generated from a sine wave. Could use the Web Audio API's `AnalyserNode` to render actual frequency data. Non-trivial but high visual impact.
- **Persist speed preference per song** — remember the last speed used for a given song and restore it on next visit.
- **Section reorder / rename** — let users rename auto-detected section labels (e.g. rename "Verse I" to "Intro Riff").
- **Keyboard shortcut cheatsheet** — a small `?` button that shows available shortcuts (←/→ to seek, space to play).
