# Mac Worker Performance Runbook

## Goals
- Reduce per-song latency with no deliberate quality drop.
- Track and protect these targets:
  - `p50 total latency`: at least 30% better vs baseline.
  - `p95 total latency`: at least 20% better vs baseline.
  - Failure rate: no increase.

## Recommended Worker Settings (M4 / 16 GB)
Use these defaults in `mac-server/.env`:

```bash
WORKER_CONCURRENCY=1
QUEUE_POLL_INTERVAL_SECONDS=0.5
DEMUCS_PYTHON=./venv/bin/python
DEMUCS_DEVICE=mps
DEMUCS_JOBS=4
WORKER_WARMUP_ENABLED=true
# Optional memory guard (only if needed):
# DEMUCS_SEGMENT=10
```

## Start Worker (Production-like)
```bash
cd mac-server
./start.sh
```

`start.sh` now runs without `--reload` by default.  
For local development hot reload:

```bash
DEV_RELOAD=1 ./start.sh
```

## Benchmark Workflow
1. Prepare `bench/urls.txt` with one representative YouTube URL per line (10 lines recommended).
2. Use a real `auth.users.id` for `--user-id`.
3. Run benchmark:

```bash
cd mac-server
./venv/bin/python bench/latency_bench.py \
  --urls-file bench/urls.txt \
  --user-id <AUTH_USER_UUID> \
  --supabase-url "$SUPABASE_URL" \
  --supabase-service-key "$SUPABASE_SERVICE_KEY" \
  --worker-log-file /path/to/worker.log \
  --out bench/report.json
```

The report includes:
- queue-claim delay
- total runtime
- per-stage durations (if `pipeline.stage_done` logs are available)
- p50/p95 summary.

## macOS Runtime Hardening
- Keep laptop plugged in during benchmark/production runs.
- Prevent sleep while worker is active:

```bash
caffeinate -dimsu ./start.sh
```

- Close heavy background apps when measuring latency.

## Log Dashboard Query (local JSON logs)
If logs are redirected to a file (`worker.log`), quick p50/p95 by stage:

```bash
jq -r 'select(.event=="pipeline.stage_done") | [.stage, .duration_ms] | @tsv' worker.log \
| awk '{
    stage=$1; ms=$2;
    a[stage]=a[stage] " " ms;
  }
  END {
    for (s in a) {
      n=split(a[s], vals, " ");
      c=0;
      for (i=1;i<=n;i++) if (vals[i] != "") b[++c]=vals[i];
      asort(b);
      p50=b[int((c+1)*0.50)];
      p95=b[int((c+1)*0.95)];
      printf "%s\tp50=%.0fms\tp95=%.0fms\n", s, p50, p95;
      delete b;
    }
  }'
```

## Alert Rule
Trigger alert if either condition holds for last 24h:
- `demucs` stage p95 > baseline p95 * 1.20
- pipeline failure rate > baseline failure rate + 2 percentage points

Recommended implementation:
- Run an hourly cron that computes metrics from logs.
- Send Slack/email alert when threshold is breached.
