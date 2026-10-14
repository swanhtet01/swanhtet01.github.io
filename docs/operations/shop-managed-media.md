# Managed Shop photos: dormant candidate and reconciliation

The Shop media browser and server flags remain **off**. The candidate SQL lives
at `supabase/candidate-migrations/20261014164000_shop_product_media.sql`, outside
`supabase/migrations`, so an unfiltered migration push cannot apply it. A source
build and disposable PostgreSQL tests do not establish a deployed private bucket,
schema, provider behavior, or customer readiness.

The server reserves a unique `attempt_id` and private `object_key` before each
upload. Every original photo POST has `x-upsert:false`; an unknown response is
never retried at the same key. Pending and ambiguous attempts keep their full
payload bytes and object slot charged. After an expired pending reservation is
retired, or a newer attempt supersedes it, `ShopMediaStore.collect()` runs a
bounded abandoned-attempt pass. It requires the same active human Shop write
authority used by the media API and selects only that workspace's unbound
attempts. It never exposes an object URL or accepts a client-supplied key.

For one attempt, the collector inspects the exact private key. It accepts an
absent object, the expected photo digest, or an existing fence. Unexpected
bytes, an unknown status, or a public/missing bucket stop reconciliation. It
then upserts a fixed 52-byte private WebP fence to **that key only** and reads
back its exact bytes. Supabase's documented no-upsert behavior means a delayed
original POST cannot overwrite the fence. A timed-out fence response, failed
readback, lost database transaction, or changed authority leaves the attempt
fully charged and retryable. The immutable event records attempt/key and fence
digest only after the ledger enters `fenced`.

`fenced` releases the original payload byte charge and normal photo slot; the
fence remains one physical private object. The ledger counts its 52 bytes and
enforces a separate 1,000-fence ceiling per workspace. The fence must **not** be
deleted by a generic object collector: without a provider-backed guarantee that
all original POSTs have terminated, removing it reopens the late-write race.
Reached ceiling blocks new uploads for operator review. An inactive workspace
still needs a scheduled, bounded caller; ordinary photo mutations perform a
best-effort pass only. No hosted provider write or scheduler is part of this
candidate.

Before any enablement, review the exact production Storage no-upsert/upsert
contract and private bucket policy, rehearse both upload/fence orderings and
timeout acknowledgements against a disposable managed project, verify two
workspace isolation and the fence ceiling, arrange a scheduled collector and
monitoring, then obtain independent release review. Do not migrate this SQL or
enable either flag solely because the local tests pass.
