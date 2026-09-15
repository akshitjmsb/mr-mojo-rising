# Storage deletion repair

The library had one ready song (45,716,568 bytes), but the Blob inventory also
held 194,735,111 bytes in 28 files under five deleted song IDs. The old estimate
divided all storage by the one ready song, incorrectly showing only three more.

## Changes

- Add Song shows actual free MB, refreshed on return to the app. Capacity math
  uses only current ready songs for the average; all files still count as used.
- Song deletion atomically saves a `blob_cleanup_jobs` tombstone before deleting
  the song. Cleanup lists the exact UUID prefix, validates every result, and
  refuses to touch any song that still exists. Failures remain retryable.
- The Mac worker calls the authenticated cleanup endpoint once a minute.
  Jobs are retained for 24 hours and revisited to catch late worker uploads.
  If the worker is offline, jobs remain stored until it resumes. No detached
  serverless promise or open phone tab is needed for retries.
- Migrate `BLOB_CLEANUP_SCHEMA` before deploying the new DELETE handler.

## Existing orphan recovery

`scripts/cleanup-reviewed-orphans.ts` defaults to dry-run. The explicit five
reviewed IDs were absent from songs/jobs. With `--apply`, each file was backed
up under `.runtime/storage-cleanup-2026-09-15/<song-id>/` with a SHA-256 manifest
before deleting cloud copies. Backups are ignored, not committed. Current
song/audio unchanged. Verified cloud usage afterward: 45,716,568 bytes;
954,283,432 bytes free against the app's configured 1,000,000,000-byte budget.

## Verification

Seven tests cover attribution, empty library, quota overflow, prefix guards,
pagination, restored-song protection, listing/deletion errors, and durable
retry after DELETE (isolated local test DB with no cloud credentials).
Production build, targeted lint and worker syntax checks pass. Browser shows
954 MB free, refreshes on focus, and reports no errors. Cleanup rejects
unauthenticated requests and accepts the existing worker credential.
