# Reliability rollout status

The additive `reliable_jobs.sql` migration was applied to production on
2026-09-08. Supabase returned `Success. No rows returned`. Existing app_state
data was not changed. The new table has RLS enabled and is not available to
anonymous or authenticated client roles.

Do not enable DURABLE_JOBS yet. The queue implementation is experimental and
disabled unless this environment variable explicitly equals true.

Additional local work (not production-enabled):

- RELIABLE_DELIVERY adds per-trigger/per-step reservations in outgoing_deliveries.
  Apply outgoing_deliveries.sql before enabling it. Unknown outcomes are held,
  never retried automatically. Provider-history reconciliation is still pending.
- STATE_VERSION_CHECKS uses conditional updated_at writes to reject stale
  snapshots. Conflict handling currently fails closed; transaction-level retry
  and operational review integration must precede activation.
- Auto-send rechecks manual takeover and newer incoming messages immediately
  before transmission, including after delays and delivery reservation.
- test-delivery-ledger.js, test-state-concurrency.js, and test-send-guards.js
  exercise these paths with isolated fixtures. No prospect messages were sent.

Remaining release gates:

- Incoming and reply stages are now separate; apply job_phases.sql before
  activating. The independent-stage test passes. Real webhook burst and
  restart verification remains required before activation.
- Add concurrency protection to app_state reads/writes and regression tests
  for simultaneous conversation and settings updates.
- Surface needs_review queue jobs in the authenticated operations UI.
- Verify interrupted-send reconciliation and burst messages end to end using
  provider fixtures before enabling the worker.
- Separate prospect-reported bookings from authenticated calendar events.
- Verify the production deployment and a real incoming message after rollout.

Local validation: server syntax, 22 setter regression scenarios, KPI tests,
and durable-job unit tests passed. These do not establish live delivery.

Supabase also displays a usage-limit warning with potential restrictions from
2026-09-28. No paid plan or billing changes have been made.

Deployment security gate: an unauthenticated production request to
/api/conversations returned HTTP 200 JSON on 2026-09-08. The new dashboard
guard requires DASHBOARD_PASSWORD in production/Supabase mode, with optional
DASHBOARD_USER (default admin). User must enter the password directly in DO.
Do not deploy the guard without configuring this login. No credentials have
been written to this repository. Provider webhook authentication is separate.
