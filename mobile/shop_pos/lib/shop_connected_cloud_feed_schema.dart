/// Separate, default-off cloud-feed evidence. LAN replica rows and cursors
/// cannot be reused as authenticated cloud-delivery authority.
const shopConnectedCloudFeedStreamsV40Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_cloud_feed_streams (
    stream_digest TEXT PRIMARY KEY CHECK (length(stream_digest) = 64),
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 128),
    actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'manager')),
    lease_digest TEXT NOT NULL CHECK (length(lease_digest) = 64),
    authority_payload_digest TEXT NOT NULL CHECK (length(authority_payload_digest) = 64),
    authority_generation INTEGER NOT NULL CHECK (authority_generation >= 0),
    revocation_generation INTEGER NOT NULL CHECK (revocation_generation >= 0)
  )
''';

const shopConnectedCloudFeedPagesV40Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_cloud_feed_pages (
    page_digest TEXT PRIMARY KEY CHECK (length(page_digest) = 64),
    stream_digest TEXT NOT NULL REFERENCES shop_connected_cloud_feed_streams(stream_digest),
    after_sequence INTEGER NOT NULL CHECK (after_sequence >= 0),
    prior_event_digest TEXT CHECK (prior_event_digest IS NULL OR length(prior_event_digest) = 64),
    next_sequence INTEGER NOT NULL CHECK (next_sequence > after_sequence),
    next_event_digest TEXT NOT NULL CHECK (length(next_event_digest) = 64),
    page_json TEXT NOT NULL CHECK (json_valid(page_json)),
    authenticated_proof_json TEXT NOT NULL CHECK (json_valid(authenticated_proof_json)),
    authenticated_proof_digest TEXT NOT NULL CHECK (length(authenticated_proof_digest) = 64),
    UNIQUE (stream_digest, after_sequence),
    UNIQUE (stream_digest, next_sequence),
    CHECK ((after_sequence = 0) = (prior_event_digest IS NULL))
  )
''';

const shopConnectedCloudFeedHeadsV40Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_cloud_feed_heads (
    stream_digest TEXT PRIMARY KEY REFERENCES shop_connected_cloud_feed_streams(stream_digest),
    next_sequence INTEGER NOT NULL CHECK (next_sequence >= 0),
    next_event_digest TEXT CHECK (next_event_digest IS NULL OR length(next_event_digest) = 64),
    last_page_digest TEXT REFERENCES shop_connected_cloud_feed_pages(page_digest),
    restore_paused INTEGER NOT NULL DEFAULT 1 CHECK (restore_paused IN (0, 1)),
    CHECK ((next_sequence = 0) = (next_event_digest IS NULL)),
    CHECK ((next_sequence = 0) = (last_page_digest IS NULL))
  )
''';

const shopConnectedCloudFeedRestoreBarriersV40Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_cloud_feed_restore_barriers (
    stream_digest TEXT PRIMARY KEY REFERENCES shop_connected_cloud_feed_streams(stream_digest),
    barrier_digest TEXT NOT NULL UNIQUE CHECK (length(barrier_digest) = 64),
    next_sequence INTEGER NOT NULL CHECK (next_sequence >= 0),
    next_event_digest TEXT CHECK (next_event_digest IS NULL OR length(next_event_digest) = 64),
    last_page_digest TEXT REFERENCES shop_connected_cloud_feed_pages(page_digest),
    barrier_json TEXT NOT NULL CHECK (json_valid(barrier_json))
  )
''';

String _immutableCloudFeedTrigger(String table, String operation) =>
    '''
  CREATE TRIGGER IF NOT EXISTS ${table}_no_$operation
  BEFORE ${operation.toUpperCase()} ON $table
  BEGIN SELECT RAISE(ABORT, 'Connected cloud-feed evidence is immutable'); END
''';

Map<String, String> shopConnectedCloudFeedSchemaDefinitionsV40() => {
  'shop_connected_cloud_feed_streams': shopConnectedCloudFeedStreamsV40Sql,
  'shop_connected_cloud_feed_pages': shopConnectedCloudFeedPagesV40Sql,
  'shop_connected_cloud_feed_heads': shopConnectedCloudFeedHeadsV40Sql,
  'shop_connected_cloud_feed_restore_barriers':
      shopConnectedCloudFeedRestoreBarriersV40Sql,
  for (final table in const [
    'shop_connected_cloud_feed_streams',
    'shop_connected_cloud_feed_pages',
    'shop_connected_cloud_feed_restore_barriers',
  ]) ...{
    '${table}_no_update': _immutableCloudFeedTrigger(table, 'update'),
    '${table}_no_delete': _immutableCloudFeedTrigger(table, 'delete'),
  },
  'shop_connected_cloud_feed_heads_no_delete': _immutableCloudFeedTrigger(
    'shop_connected_cloud_feed_heads',
    'delete',
  ),
};

/// Until the authenticated apply path is installed, no v40 data is accepted.
/// This prevents a backup or open from laundering unverified cloud rows.
bool shopConnectedCloudFeedRowsValidV40({
  required Iterable<Map<String, Object?>> streams,
  required Iterable<Map<String, Object?>> pages,
  required Iterable<Map<String, Object?>> heads,
  required Iterable<Map<String, Object?>> restoreBarriers,
}) =>
    streams.isEmpty &&
    pages.isEmpty &&
    heads.isEmpty &&
    restoreBarriers.isEmpty;
