# Operator Report

Date: 2026-04-08T04:29:27

Runtime:
- Web service: ready
- Worker service: internal_queue_worker
- Scheduler: running
- Cloud Tasks: queue-backed worker active

Recent failures:
- Resend sending still blocked until DNS propagation completes.

Queue state:
- Default queue: active
- Browser queue: provisioned, sidecar use only
- Founder brief queue: active through scheduled runs

Deploy state:
- Last deploy: see 06_release_log.csv
- Smoke result: latest workstation cycle green

Public routes:
- Home: 200
- Products: 200
- Work alias: 200
- Contact: 200

Action items:
- Keep products page and contact flow aligned with the starter-pack ladder.
- Recheck Resend once Squarespace DNS propagation finishes.
- Keep founder/operator sync running locally through workstation cycle.
