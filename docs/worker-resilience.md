# Worker resilience

Run `npm run worker:install` from the canonical project. The macOS registration
points directly to this checkout, never a copied runtime. Old registration files
are backed up in `.runtime/backups`. No songs are deleted by installation.

The worker uses Python module invocation rather than relocated virtualenv console
scripts. Audio-separator likewise uses its project interpreter and CLI entrypoint.
Models, download output, temporary files and caches live in `.runtime`.

`curl -f http://127.0.0.1:8000/health` must return HTTP 200 and all readiness checks
true. Missing or timed-out dependencies return HTTP 503. Jobs are not claimed when
dependency checks fail, and an idle worker publishes degraded status. Checks repeat
with the heartbeat so restored dependencies can recover without new job failures.
A process lock prevents duplicate workers for this project. Launchd restarts a
crashed worker and throttles repeated startup failures.

Logs: `.runtime/logs/worker.err.log` and `worker.out.log`.
Run `python -m unittest discover -s mac-server -p test_worker_runtime.py` with the
project interpreter, plus `test_youtube_download.py` and `test_main_quality_helpers.py`.

These checks validate executable availability, not perfect separation quality or
YouTube availability. A successful real song-processing run remains the end-to-end
quality gate. External outages, disk exhaustion and model errors can still occur;
do not describe this system as infallible.
