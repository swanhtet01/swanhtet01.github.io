import 'dart:convert';

import 'shop_connected_cloud_feed_proof.dart';
import 'shop_connected_site_cloud_feed_contract.dart';
import 'shop_connected_site_contracts.dart';

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
    request_nonce TEXT NOT NULL UNIQUE CHECK (length(request_nonce) = 64),
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

/// Empty production pins keep nonempty data closed. Test-only pins can verify
/// retained signatures and ordered source pages; this does not renew a lease,
/// clear a restore barrier, or grant permission to make a shared write.
bool shopConnectedCloudFeedRowsValidV40({
  required Iterable<Map<String, Object?>> streams,
  required Iterable<Map<String, Object?>> pages,
  required Iterable<Map<String, Object?>> heads,
  required Iterable<Map<String, Object?>> restoreBarriers,
  Map<String, List<int>> trustedIssuerKeys = const {},
}) {
  try {
    final streamRows = streams.toList(growable: false);
    final pageRows = pages.toList(growable: false);
    final headRows = heads.toList(growable: false);
    final barrierRows = restoreBarriers.toList(growable: false);
    if (streamRows.isEmpty) {
      return pageRows.isEmpty && headRows.isEmpty && barrierRows.isEmpty;
    }
    if (trustedIssuerKeys.isEmpty ||
        streamRows.length > 32 ||
        pageRows.isEmpty ||
        pageRows.length > 2048 ||
        headRows.length != streamRows.length ||
        barrierRows.length > streamRows.length) {
      return false;
    }
    final verifier = ConnectedCloudFeedPinnedIssuerVerifier(trustedIssuerKeys);
    final headsByStream = <String, Map<String, Object?>>{};
    final barriersByStream = <String, Map<String, Object?>>{};
    final pagesByStream = <String, List<Map<String, Object?>>>{};
    for (final head in headRows) {
      final digest = head['stream_digest'];
      if (digest is! String || headsByStream.containsKey(digest)) return false;
      headsByStream[digest] = head;
    }
    for (final page in pageRows) {
      final digest = page['stream_digest'];
      if (digest is! String) return false;
      pagesByStream.putIfAbsent(digest, () => []).add(page);
    }
    for (final barrier in barrierRows) {
      final digest = barrier['stream_digest'];
      if (digest is! String || barriersByStream.containsKey(digest)) {
        return false;
      }
      barriersByStream[digest] = barrier;
    }
    if (pagesByStream.length != streamRows.length) return false;
    final seenStreams = <String>{};
    final seenPages = <String>{};
    for (final stream in streamRows) {
      final streamDigest = stream['stream_digest'];
      if (streamDigest is! String || !seenStreams.add(streamDigest)) {
        return false;
      }
      final workspace = stream['workspace_id'];
      final site = stream['site_id'];
      final actor = stream['actor_id'];
      final role = stream['actor_role'];
      final device = stream['device_id'];
      final authority = stream['authority_generation'];
      final revocation = stream['revocation_generation'];
      final authorityDigest = stream['authority_payload_digest'];
      final leaseDigest = stream['lease_digest'];
      if (workspace is! String ||
          site is! String ||
          actor is! String ||
          !const {'owner', 'manager'}.contains(role) ||
          device is! String ||
          authority is! int ||
          authority < 0 ||
          revocation is! int ||
          revocation < 0 ||
          authorityDigest is! String ||
          leaseDigest is! String ||
          streamDigest !=
              connectedSiteSha256({
                'contract': 'supermega.connected-cloud-feed-stream.v1',
                'workspaceId': workspace,
                'siteId': site,
                'actorId': actor,
                'actorRole': role,
                'deviceId': device,
                'authorityGeneration': authority,
                'revocationGeneration': revocation,
                'authorityPayloadDigest': authorityDigest,
                'leaseDigest': leaseDigest,
              })) {
        return false;
      }
      final head = headsByStream[streamDigest];
      final retainedPages = pagesByStream[streamDigest];
      if (head == null || retainedPages == null || retainedPages.isEmpty) {
        return false;
      }
      retainedPages.sort(
        (a, b) =>
            (a['after_sequence'] as int).compareTo(b['after_sequence'] as int),
      );
      var sequence = 0;
      String? priorDigest;
      String? lastPageDigest;
      for (final row in retainedPages) {
        final pageBytes = row['page_json'];
        final proofBytes = row['authenticated_proof_json'];
        if (pageBytes is! String ||
            proofBytes is! String ||
            pageBytes.length > 262144 ||
            proofBytes.length > 4096 ||
            row['after_sequence'] != sequence ||
            row['prior_event_digest'] != priorDigest) {
          return false;
        }
        final pageJson = jsonDecode(pageBytes);
        final proofJson = jsonDecode(proofBytes);
        if (pageJson is! Map || proofJson is! Map) return false;
        final expected = ConnectedSiteRetailFeedExpectation(
          workspaceId: workspace,
          siteId: site,
          actorId: actor,
          deviceId: device,
          authorityGeneration: authority,
          revocationGeneration: revocation,
          authorityPayloadDigest: authorityDigest,
          leaseDigest: leaseDigest,
          requestDigest: pageJson['requestDigest'] as String,
          afterSequence: sequence,
          priorEventDigest: priorDigest,
          limit: 64,
        );
        final page = ConnectedSiteRetailFeedPageV1.parse(
          canonicalBytes: pageBytes,
          expected: expected,
        );
        final proof = ConnectedCloudFeedProofV1.parseRetained(
          canonicalBytes: proofBytes,
          page: page,
          expected: expected,
          requestNonce: proofJson['requestNonce'] as String,
          actorRole: role as String,
        );
        verifier.verifySync(proof);
        if (row['page_digest'] != page.pageDigest ||
            row['request_nonce'] != proofJson['requestNonce'] ||
            !seenPages.add(page.pageDigest) ||
            row['authenticated_proof_digest'] != proof.proofDigest ||
            row['next_sequence'] != page.nextSequence ||
            row['next_event_digest'] != page.nextEventDigest ||
            page.nextSequence <= sequence) {
          return false;
        }
        sequence = page.nextSequence;
        priorDigest = page.nextEventDigest;
        lastPageDigest = page.pageDigest;
      }
      if (head['next_sequence'] != sequence ||
          head['next_event_digest'] != priorDigest ||
          head['last_page_digest'] != lastPageDigest ||
          !const {0, 1}.contains(head['restore_paused'])) {
        return false;
      }
      final barrier = barriersByStream[streamDigest];
      if (barrier != null) {
        final barrierBytes = barrier['barrier_json'];
        if (head['restore_paused'] != 1 ||
            barrier['next_sequence'] != sequence ||
            barrier['next_event_digest'] != priorDigest ||
            barrier['last_page_digest'] != lastPageDigest ||
            barrierBytes is! String ||
            barrierBytes.length > 4096) {
          return false;
        }
        final decoded = jsonDecode(barrierBytes);
        if (canonicalConnectedSiteJson(decoded) != barrierBytes ||
            decoded is! Map ||
            decoded.length != 5 ||
            decoded['contract'] !=
                'supermega.connected-cloud-feed-restore-barrier.v1' ||
            decoded['streamDigest'] != streamDigest ||
            decoded['nextSequence'] != sequence ||
            decoded['nextEventDigest'] != priorDigest ||
            decoded['lastPageDigest'] != lastPageDigest ||
            connectedSiteSha256(decoded) != barrier['barrier_digest']) {
          return false;
        }
      }
    }
    return seenStreams.length == streamRows.length &&
        barriersByStream.keys.every(seenStreams.contains);
  } on Object {
    return false;
  }
}
