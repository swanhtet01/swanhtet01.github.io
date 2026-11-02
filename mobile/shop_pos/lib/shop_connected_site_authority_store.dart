import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_database.dart';
import 'shop_staff_authorization.dart';

/// Persists authenticated authority observations without pretending that the
/// digest-only delta contains membership roles or configuration payloads.
class ShopConnectedSiteAuthorityDeltaStore
    implements ConnectedSiteAuthorityDeltaApplier {
  const ShopConnectedSiteAuthorityDeltaStore({
    required this.database,
    required this.nowMillis,
    this.runtimeEnabled = false,
  });

  final ShopDatabase database;
  final int Function() nowMillis;
  final bool runtimeEnabled;

  @override
  Future<void> apply(
    ConnectedSiteScope scope,
    ConnectedSiteAuthorityDelta delta,
  ) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_delta_disabled',
      );
    }
    if (scope.workspaceId != delta.workspaceId ||
        scope.siteId != delta.siteId) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_delta_scope_mismatch',
      );
    }
    await database.verifyConnectedAuthorityEvidence();
    await database.transaction(() async {
      final device = await database
          .customSelect(
            'SELECT 1 FROM shop_site_devices WHERE device_id = ? '
            "AND tenant_id = ? AND site_id = ? AND state = 'active'",
            variables: [
              Variable<String>(scope.deviceId),
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      if (device == null) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_delta_device_unbound',
        );
      }
      final latest = await database
          .customSelect(
            'SELECT * FROM shop_site_authority_deltas '
            'WHERE tenant_id = ? AND site_id = ? '
            'ORDER BY observation_sequence DESC LIMIT 1',
            variables: [
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      final json = shopConnectedAuthorityDeltaJsonV27(
        tenantId: delta.workspaceId,
        siteId: delta.siteId,
        revocationGeneration: delta.revocationGeneration,
        membershipDigest: delta.membershipDigest,
        configurationVersion: delta.configurationVersion,
        configurationDigest: delta.configurationDigest,
      );
      final canonicalJson = canonicalConnectedSiteJson(json);
      final digest = connectedSiteSha256(json);
      if (latest != null) {
        final oldRevocation = latest.read<int>('revocation_generation');
        final oldConfiguration = latest.read<int>('configuration_version');
        if (delta.revocationGeneration < oldRevocation ||
            delta.configurationVersion < oldConfiguration ||
            (delta.revocationGeneration == oldRevocation &&
                delta.membershipDigest !=
                    latest.read<String>('membership_digest')) ||
            (delta.configurationVersion == oldConfiguration &&
                delta.configurationDigest !=
                    latest.read<String>('configuration_digest'))) {
          throw const ConnectedSiteReconciliationException(
            'connected_site_authority_delta_regressed',
          );
        }
        if (delta.revocationGeneration == oldRevocation &&
            delta.configurationVersion == oldConfiguration) {
          if (latest.read<String>('delta_json') != canonicalJson ||
              latest.read<String>('delta_digest') != digest) {
            throw const ConnectedSiteReconciliationException(
              'connected_site_authority_delta_changed_replay',
            );
          }
          return;
        }
      }
      final observedAt = nowMillis();
      if (observedAt < 1 ||
          (latest != null &&
              observedAt <= latest.read<int>('observed_at_millis'))) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_delta_time_invalid',
        );
      }
      final currentRevocation = await database
          .customSelect(
            'SELECT generation FROM shop_site_revocation_observations '
            'WHERE tenant_id = ? AND site_id = ?',
            variables: [
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      if (currentRevocation != null &&
          currentRevocation.read<int>('generation') >
              delta.revocationGeneration) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_delta_revocation_stale',
        );
      }
      final sequence = latest == null
          ? 1
          : latest.read<int>('observation_sequence') + 1;
      await database.customStatement(
        'INSERT INTO shop_site_authority_deltas ('
        'tenant_id, site_id, observation_sequence, revocation_generation, '
        'membership_digest, configuration_version, configuration_digest, '
        'delta_json, delta_digest, observed_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          scope.workspaceId,
          scope.siteId,
          sequence,
          delta.revocationGeneration,
          delta.membershipDigest,
          delta.configurationVersion,
          delta.configurationDigest,
          canonicalJson,
          digest,
          observedAt,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_revocation_observations ('
        'tenant_id, site_id, generation, observed_at_millis, source_digest) '
        'VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, site_id) DO UPDATE SET '
        'generation = excluded.generation, '
        'observed_at_millis = excluded.observed_at_millis, '
        'source_digest = excluded.source_digest',
        [
          scope.workspaceId,
          scope.siteId,
          delta.revocationGeneration,
          observedAt,
          digest,
        ],
      );
      await database.verifyConnectedAuthorityEvidence();
    });
  }
}

abstract interface class ConnectedSiteAuthorityPayloadVerifier {
  Future<void> verify({
    required String canonicalPayloadBytes,
    required String signature,
    required String issuerKeyId,
  });
}

class ConnectedSiteAuthorityPayloadVerificationUnavailable
    implements ConnectedSiteAuthorityPayloadVerifier {
  const ConnectedSiteAuthorityPayloadVerificationUnavailable();

  @override
  Future<void> verify({
    required String canonicalPayloadBytes,
    required String signature,
    required String issuerKeyId,
  }) => Future.error(
    const ConnectedSiteReconciliationException(
      'connected_site_authority_payload_verifier_unavailable',
    ),
  );
}

class ConnectedSiteAuthorityMemberV1 {
  const ConnectedSiteAuthorityMemberV1({
    required this.actorId,
    required this.role,
    required this.capabilities,
    required this.sessionGeneration,
  });

  final String actorId;
  final ShopStaffRole role;
  final List<ShopStaffCapability> capabilities;
  final int sessionGeneration;
}

class ConnectedSiteAuthorityPayloadV1 {
  ConnectedSiteAuthorityPayloadV1._({
    required this.canonicalBytes,
    required this.signature,
    required this.payloadDigest,
    required this.authorityEventId,
    required this.authoritySequence,
    required this.previousAuthorityDigest,
    required this.workspaceId,
    required this.siteId,
    required this.issuedAtMillis,
    required this.issuerKeyId,
    required this.revocationGeneration,
    required this.members,
    required this.membershipJson,
    required this.membershipDigest,
    required this.configurationVersion,
    required this.businessProfileJson,
    required this.catalogReferenceJson,
    required this.configurationJson,
    required this.configurationDigest,
  });

  final String canonicalBytes;
  final String signature;
  final String payloadDigest;
  final String authorityEventId;
  final int authoritySequence;
  final String? previousAuthorityDigest;
  final String workspaceId;
  final String siteId;
  final int issuedAtMillis;
  final String issuerKeyId;
  final int revocationGeneration;
  final List<ConnectedSiteAuthorityMemberV1> members;
  final String membershipJson;
  final String membershipDigest;
  final int configurationVersion;
  final String businessProfileJson;
  final String catalogReferenceJson;
  final String configurationJson;
  final String configurationDigest;

  static ConnectedSiteAuthorityPayloadV1 parse({
    required String canonicalBytes,
    required String signature,
  }) {
    Never invalid(String code) => throw ConnectedSiteReconciliationException(
      'connected_site_authority_payload_$code',
    );
    if (signature.length < 32 || signature.length > 4096) invalid('signature');
    final decoded = jsonDecode(canonicalBytes);
    if (decoded is! Map<String, dynamic> ||
        canonicalConnectedSiteJson(decoded) != canonicalBytes) {
      invalid('noncanonical');
    }
    const keys = {
      'schemaId',
      'protocolVersion',
      'authorityEventId',
      'authoritySequence',
      'previousAuthorityDigest',
      'workspaceId',
      'siteId',
      'issuedAtMillis',
      'issuerKeyId',
      'membershipSnapshot',
      'configurationSnapshot',
      'payloadDigest',
    };
    if (decoded.keys.toSet().difference(keys).isNotEmpty ||
        !decoded.keys.toSet().containsAll(keys) ||
        decoded['schemaId'] != 'ConnectedSiteAuthorityPayloadV1' ||
        decoded['protocolVersion'] != connectedSiteProtocolVersion) {
      invalid('shape');
    }
    String identifier(Object? value, String field) {
      if (value is! String ||
          value.isEmpty ||
          value.trim() != value ||
          value.length > 128 ||
          !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]*$').hasMatch(value)) {
        invalid(field);
      }
      return value;
    }

    String digest(Object? value, String field, {bool nullable = false}) {
      if (nullable && value == null) return '';
      if (value is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(value)) {
        invalid(field);
      }
      return value;
    }

    int integer(Object? value, String field, {int min = 0}) {
      if (value is! int || value < min) invalid(field);
      return value;
    }

    Map<String, dynamic> object(
      Object? value,
      String field,
      Set<String> exactKeys,
    ) {
      if (value is! Map<String, dynamic> ||
          value.keys.toSet().difference(exactKeys).isNotEmpty ||
          !value.keys.toSet().containsAll(exactKeys)) {
        invalid(field);
      }
      return value;
    }

    final unsigned = Map<String, Object?>.from(decoded)
      ..remove('payloadDigest');
    final innerDigest = digest(decoded['payloadDigest'], 'digest');
    if (connectedSiteSha256(unsigned) != innerDigest) invalid('digest');
    final sequence = integer(decoded['authoritySequence'], 'sequence', min: 1);
    final previous = decoded['previousAuthorityDigest'];
    if ((sequence == 1 && previous != null) ||
        (sequence > 1 && digest(previous, 'previous').isEmpty)) {
      invalid('previous');
    }
    final membership = object(decoded['membershipSnapshot'], 'membership', {
      'revocationGeneration',
      'members',
    });
    final rawMembers = membership['members'];
    if (rawMembers is! List || rawMembers.isEmpty || rawMembers.length > 128) {
      invalid('members');
    }
    final members = <ConnectedSiteAuthorityMemberV1>[];
    var previousActor = '';
    for (final raw in rawMembers) {
      final member = object(raw, 'member', {
        'actorId',
        'role',
        'capabilities',
        'sessionGeneration',
      });
      final actor = identifier(member['actorId'], 'actor');
      if (actor.compareTo(previousActor) <= 0) invalid('member_order');
      previousActor = actor;
      final roleName = member['role'];
      final role = ShopStaffRole.values
          .where((value) => value.name == roleName)
          .firstOrNull;
      if (role == null) invalid('role');
      final rawCapabilities = member['capabilities'];
      if (rawCapabilities is! List || rawCapabilities.isEmpty) {
        invalid('capabilities');
      }
      final capabilities = <ShopStaffCapability>[];
      var previousCapability = '';
      for (final rawCapability in rawCapabilities) {
        final capability = ShopStaffCapability.values
            .where((value) => value.name == rawCapability)
            .firstOrNull;
        if (capability == null ||
            capability.name.compareTo(previousCapability) <= 0 ||
            !ShopStaffRolePolicy.allows(role, capability)) {
          invalid('capability');
        }
        previousCapability = capability.name;
        capabilities.add(capability);
      }
      members.add(
        ConnectedSiteAuthorityMemberV1(
          actorId: actor,
          role: role,
          capabilities: List.unmodifiable(capabilities),
          sessionGeneration: integer(
            member['sessionGeneration'],
            'session_generation',
            min: 1,
          ),
        ),
      );
    }
    final configuration = object(
      decoded['configurationSnapshot'],
      'configuration',
      {'configurationVersion', 'businessProfile', 'catalogReference'},
    );
    final business = object(configuration['businessProfile'], 'business', {
      'schemaId',
      'templateId',
      'templateVersion',
    });
    identifier(business['schemaId'], 'business_schema');
    identifier(business['templateId'], 'business_template');
    integer(business['templateVersion'], 'business_template_version', min: 1);
    final catalog = object(configuration['catalogReference'], 'catalog', {
      'catalogVersion',
      'catalogDigest',
    });
    integer(catalog['catalogVersion'], 'catalog_version', min: 1);
    digest(catalog['catalogDigest'], 'catalog_digest');
    final membershipJson = canonicalConnectedSiteJson(membership);
    final configurationJson = canonicalConnectedSiteJson(configuration);
    return ConnectedSiteAuthorityPayloadV1._(
      canonicalBytes: canonicalBytes,
      signature: signature,
      payloadDigest: crypto.sha256
          .convert(utf8.encode(canonicalBytes))
          .toString(),
      authorityEventId: identifier(decoded['authorityEventId'], 'event'),
      authoritySequence: sequence,
      previousAuthorityDigest: previous as String?,
      workspaceId: identifier(decoded['workspaceId'], 'workspace'),
      siteId: identifier(decoded['siteId'], 'site'),
      issuedAtMillis: integer(decoded['issuedAtMillis'], 'issued_at', min: 1),
      issuerKeyId: identifier(decoded['issuerKeyId'], 'issuer'),
      revocationGeneration: integer(
        membership['revocationGeneration'],
        'revocation',
      ),
      members: List.unmodifiable(members),
      membershipJson: membershipJson,
      membershipDigest: connectedSiteSha256(membership),
      configurationVersion: integer(
        configuration['configurationVersion'],
        'configuration_version',
      ),
      businessProfileJson: canonicalConnectedSiteJson(business),
      catalogReferenceJson: canonicalConnectedSiteJson(catalog),
      configurationJson: configurationJson,
      configurationDigest: connectedSiteSha256(configuration),
    );
  }
}

class ConnectedSiteAuthorityCheckpointV1 {
  ConnectedSiteAuthorityCheckpointV1._({
    required this.canonicalBytes,
    required this.signature,
    required this.checkpointDigest,
    required this.workspaceId,
    required this.siteId,
    required this.deviceId,
    required this.issuedAtMillis,
    required this.issuerKeyId,
    required this.chainDigest,
    required this.payloads,
  });

  static const schemaId = 'ConnectedSiteAuthorityCheckpointV1';
  static const maximumPayloadCount = 256;
  static const maximumCanonicalBytes = 1024 * 1024;

  final String canonicalBytes;
  final String signature;
  final String checkpointDigest;
  final String workspaceId;
  final String siteId;
  final String deviceId;
  final int issuedAtMillis;
  final String issuerKeyId;
  final String chainDigest;
  final List<ConnectedSiteAuthorityPayloadV1> payloads;

  static ConnectedSiteAuthorityCheckpointV1 parse({
    required String canonicalBytes,
    required String signature,
  }) {
    Never invalid(String code) => throw ConnectedSiteReconciliationException(
      'connected_site_authority_checkpoint_$code',
    );
    if (canonicalBytes.isEmpty ||
        utf8.encode(canonicalBytes).length > maximumCanonicalBytes ||
        signature.length < 32 ||
        signature.length > 4096) {
      invalid('size');
    }
    final decoded = jsonDecode(canonicalBytes);
    if (decoded is! Map<String, dynamic> ||
        canonicalConnectedSiteJson(decoded) != canonicalBytes) {
      invalid('noncanonical');
    }
    const keys = {
      'schemaId',
      'protocolVersion',
      'workspaceId',
      'siteId',
      'deviceId',
      'issuedAtMillis',
      'issuerKeyId',
      'firstAuthoritySequence',
      'lastAuthoritySequence',
      'payloads',
      'chainDigest',
      'checkpointDigest',
    };
    if (decoded.keys.length != keys.length ||
        decoded.keys.toSet().difference(keys).isNotEmpty ||
        decoded['schemaId'] != schemaId ||
        decoded['protocolVersion'] != connectedSiteProtocolVersion) {
      invalid('shape');
    }
    String identifier(Object? value, String field) {
      if (value is! String ||
          value.isEmpty ||
          value.trim() != value ||
          value.length > 128 ||
          !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]*$').hasMatch(value)) {
        invalid(field);
      }
      return value;
    }

    String digest(Object? value, String field) {
      if (value is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(value)) {
        invalid(field);
      }
      return value;
    }

    final rawPayloads = decoded['payloads'];
    if (rawPayloads is! List ||
        rawPayloads.isEmpty ||
        rawPayloads.length > maximumPayloadCount ||
        decoded['firstAuthoritySequence'] != 1 ||
        decoded['lastAuthoritySequence'] != rawPayloads.length) {
      invalid('range');
    }
    final workspaceId = identifier(decoded['workspaceId'], 'workspace');
    final siteId = identifier(decoded['siteId'], 'site');
    final payloads = <ConnectedSiteAuthorityPayloadV1>[];
    final chainBindings = <Map<String, Object?>>[];
    String? previousDigest;
    for (var index = 0; index < rawPayloads.length; index += 1) {
      final raw = rawPayloads[index];
      const payloadKeys = {'canonicalPayloadBytes', 'signature'};
      if (raw is! Map<String, dynamic> ||
          raw.keys.length != payloadKeys.length ||
          raw.keys.toSet().difference(payloadKeys).isNotEmpty ||
          raw['canonicalPayloadBytes'] is! String ||
          raw['signature'] is! String) {
        invalid('payload_shape');
      }
      final payload = ConnectedSiteAuthorityPayloadV1.parse(
        canonicalBytes: raw['canonicalPayloadBytes']! as String,
        signature: raw['signature']! as String,
      );
      if (payload.workspaceId != workspaceId ||
          payload.siteId != siteId ||
          payload.authoritySequence != index + 1 ||
          payload.previousAuthorityDigest != previousDigest) {
        invalid('payload_chain');
      }
      previousDigest = payload.payloadDigest;
      payloads.add(payload);
      chainBindings.add({
        'authoritySequence': payload.authoritySequence,
        'payloadDigest': payload.payloadDigest,
        'signatureDigest': crypto.sha256
            .convert(utf8.encode(payload.signature))
            .toString(),
      });
    }
    final chainDigest = digest(decoded['chainDigest'], 'chain_digest');
    if (connectedSiteSha256(chainBindings) != chainDigest) {
      invalid('chain_digest');
    }
    final unsigned = Map<String, Object?>.from(decoded)
      ..remove('checkpointDigest');
    final checkpointDigest = digest(
      decoded['checkpointDigest'],
      'checkpoint_digest',
    );
    if (connectedSiteSha256(unsigned) != checkpointDigest) {
      invalid('checkpoint_digest');
    }
    final issuedAt = decoded['issuedAtMillis'];
    if (issuedAt is! int || issuedAt < 1) invalid('issued_at');
    return ConnectedSiteAuthorityCheckpointV1._(
      canonicalBytes: canonicalBytes,
      signature: signature,
      checkpointDigest: checkpointDigest,
      workspaceId: workspaceId,
      siteId: siteId,
      deviceId: identifier(decoded['deviceId'], 'device'),
      issuedAtMillis: issuedAt,
      issuerKeyId: identifier(decoded['issuerKeyId'], 'issuer'),
      chainDigest: chainDigest,
      payloads: List.unmodifiable(payloads),
    );
  }
}

/// Reuses the retained-authority parser and the independently supplied
/// signature verifier for cloud observations. This keeps one exact authority
/// grammar across online refresh, restart recovery, and offline lease checks.
class ShopConnectedSiteCloudAuthorityVerifier
    implements ConnectedSiteCloudAuthorityVerifier {
  const ShopConnectedSiteCloudAuthorityVerifier({required this.verifier});

  final ConnectedSiteAuthorityPayloadVerifier verifier;

  @override
  Future<ConnectedSiteVerifiedAuthorityReceipt> parseAndVerify({
    required String canonicalPayloadBytes,
    required String signature,
    required ConnectedSiteScope expectedScope,
  }) async {
    final payload = ConnectedSiteAuthorityPayloadV1.parse(
      canonicalBytes: canonicalPayloadBytes,
      signature: signature,
    );
    if (payload.workspaceId != expectedScope.workspaceId ||
        payload.siteId != expectedScope.siteId) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_scope_mismatch',
      );
    }
    await verifier.verify(
      canonicalPayloadBytes: payload.canonicalBytes,
      signature: payload.signature,
      issuerKeyId: payload.issuerKeyId,
    );
    return ConnectedSiteVerifiedAuthorityReceipt(
      workspaceId: payload.workspaceId,
      siteId: payload.siteId,
      authoritySequence: payload.authoritySequence,
      previousAuthorityDigest: payload.previousAuthorityDigest,
      payloadDigest: payload.payloadDigest,
      issuerKeyId: payload.issuerKeyId,
      revocationGeneration: payload.revocationGeneration,
      membershipDigest: payload.membershipDigest,
      configurationVersion: payload.configurationVersion,
      configurationDigest: payload.configurationDigest,
    );
  }
}

class ShopConnectedSiteVerifiedAuthorityReceiptStore
    implements ConnectedSiteVerifiedAuthorityReceiptStore {
  const ShopConnectedSiteVerifiedAuthorityReceiptStore({
    required this.payloadStore,
  });

  final ShopConnectedSiteAuthorityPayloadStore payloadStore;

  @override
  Future<ConnectedSiteVerifiedAuthorityReceipt?> latest(
    ConnectedSiteScope scope,
  ) => payloadStore.latestVerifiedReceipt(scope);

  @override
  Future<void> retain(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String signature,
  }) => payloadStore.apply(
    scope,
    canonicalPayloadBytes: canonicalPayloadBytes,
    signature: signature,
  );

  @override
  Future<void> retainCheckpoint(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String payloadSignature,
    required String canonicalCheckpointBytes,
    required String checkpointSignature,
  }) async {
    final checkpoint = ConnectedSiteAuthorityCheckpointV1.parse(
      canonicalBytes: canonicalCheckpointBytes,
      signature: checkpointSignature,
    );
    final current = checkpoint.payloads.last;
    if (current.canonicalBytes != canonicalPayloadBytes ||
        current.signature != payloadSignature ||
        current.workspaceId != receipt.workspaceId ||
        current.siteId != receipt.siteId ||
        current.authoritySequence != receipt.authoritySequence ||
        current.payloadDigest != receipt.payloadDigest ||
        current.issuerKeyId != receipt.issuerKeyId ||
        current.revocationGeneration != receipt.revocationGeneration ||
        current.membershipDigest != receipt.membershipDigest ||
        current.configurationVersion != receipt.configurationVersion ||
        current.configurationDigest != receipt.configurationDigest) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_checkpoint_current_mismatch',
      );
    }
    await payloadStore.applyCheckpoint(
      scope,
      canonicalCheckpointBytes: canonicalCheckpointBytes,
      signature: checkpointSignature,
    );
  }
}

class ShopConnectedSiteAuthorityPayloadStore {
  ShopConnectedSiteAuthorityPayloadStore({
    required this.database,
    required this.nowMillis,
    this.verifier =
        const ConnectedSiteAuthorityPayloadVerificationUnavailable(),
    this.runtimeEnabled = false,
  });

  final ShopDatabase database;
  final int Function() nowMillis;
  final ConnectedSiteAuthorityPayloadVerifier verifier;
  final bool runtimeEnabled;
  bool _retainedPayloadsVerified = false;

  Future<ConnectedSiteVerifiedAuthorityReceipt?> latestVerifiedReceipt(
    ConnectedSiteScope scope,
  ) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_disabled',
      );
    }
    await reverifyRetainedPayloads();
    final row = await database
        .customSelect(
          'SELECT payload_bytes, signature FROM shop_site_authority_payloads '
          'WHERE tenant_id = ? AND site_id = ? '
          'ORDER BY authority_sequence DESC LIMIT 1',
          variables: [Variable(scope.workspaceId), Variable(scope.siteId)],
        )
        .getSingleOrNull();
    if (row == null) return null;
    await _requireBootstrapProvenance(scope);
    final payload = ConnectedSiteAuthorityPayloadV1.parse(
      canonicalBytes: row.read<String>('payload_bytes'),
      signature: row.read<String>('signature'),
    );
    return ConnectedSiteVerifiedAuthorityReceipt(
      workspaceId: payload.workspaceId,
      siteId: payload.siteId,
      authoritySequence: payload.authoritySequence,
      previousAuthorityDigest: payload.previousAuthorityDigest,
      payloadDigest: payload.payloadDigest,
      issuerKeyId: payload.issuerKeyId,
      revocationGeneration: payload.revocationGeneration,
      membershipDigest: payload.membershipDigest,
      configurationVersion: payload.configurationVersion,
      configurationDigest: payload.configurationDigest,
    );
  }

  /// Re-authenticates every retained payload before restored authority is used.
  /// Backup structure validation deliberately cannot substitute for this.
  Future<void> reverifyRetainedPayloads() async {
    await database.verifyConnectedAuthorityEvidence();
    final rows = await database
        .customSelect(
          'SELECT payload_bytes, signature, issuer_key_id '
          'FROM shop_site_authority_payloads ORDER BY tenant_id, site_id, authority_sequence',
        )
        .get();
    for (final row in rows) {
      final payload = ConnectedSiteAuthorityPayloadV1.parse(
        canonicalBytes: row.read<String>('payload_bytes'),
        signature: row.read<String>('signature'),
      );
      if (payload.issuerKeyId != row.read<String>('issuer_key_id')) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_issuer_mismatch',
        );
      }
      await verifier.verify(
        canonicalPayloadBytes: payload.canonicalBytes,
        signature: payload.signature,
        issuerKeyId: payload.issuerKeyId,
      );
    }
    final checkpoints = await database
        .customSelect(
          'SELECT checkpoint_bytes, signature, issuer_key_id '
          'FROM shop_site_authority_checkpoints ORDER BY tenant_id, site_id, device_id',
        )
        .get();
    for (final row in checkpoints) {
      final checkpoint = ConnectedSiteAuthorityCheckpointV1.parse(
        canonicalBytes: row.read<String>('checkpoint_bytes'),
        signature: row.read<String>('signature'),
      );
      if (checkpoint.issuerKeyId != row.read<String>('issuer_key_id')) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_checkpoint_issuer_mismatch',
        );
      }
      await verifier.verify(
        canonicalPayloadBytes: checkpoint.canonicalBytes,
        signature: checkpoint.signature,
        issuerKeyId: checkpoint.issuerKeyId,
      );
    }
    _retainedPayloadsVerified = true;
  }

  /// Binds a previously signature-verified offline lease to the latest
  /// authenticated membership snapshot. It does not verify the lease itself.
  Future<void> requireLeaseCurrent(OfflineStaffLeaseV1 lease) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_disabled',
      );
    }
    if (!_retainedPayloadsVerified) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_reverification_required',
      );
    }
    await database.verifyConnectedAuthorityEvidence();
    await _requireBootstrapProvenance(
      ConnectedSiteScope(
        workspaceId: lease.workspaceId,
        siteId: lease.siteId,
        deviceId: lease.deviceId,
      ),
    );
    final latest = await database
        .customSelect(
          'SELECT authority_sequence, revocation_generation FROM '
          'shop_site_authority_payloads WHERE tenant_id = ? AND site_id = ? '
          'ORDER BY authority_sequence DESC LIMIT 1',
          variables: [Variable(lease.workspaceId), Variable(lease.siteId)],
        )
        .getSingleOrNull();
    if (latest == null ||
        latest.read<int>('revocation_generation') !=
            lease.revocationGeneration) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_lease_stale',
      );
    }
    final member = await database
        .customSelect(
          'SELECT actor_role, capabilities_json, session_generation FROM '
          'shop_site_authority_members WHERE tenant_id = ? AND site_id = ? '
          'AND authority_sequence = ? AND actor_id = ?',
          variables: [
            Variable(lease.workspaceId),
            Variable(lease.siteId),
            Variable(latest.read<int>('authority_sequence')),
            Variable(lease.actorId),
          ],
        )
        .getSingleOrNull();
    final capabilities = member == null
        ? const <Object?>[]
        : jsonDecode(member.read<String>('capabilities_json')) as List;
    if (member == null ||
        member.read<String>('actor_role') != lease.role ||
        member.read<int>('session_generation') != lease.sessionGeneration ||
        !lease.capabilities.every(capabilities.contains)) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_lease_mismatch',
      );
    }
  }

  /// Imports a complete, freshly signed authority chain for an enrolled
  /// joining device. The store deliberately retains the sequence-one origin;
  /// a checkpoint cannot replace or splice an existing local chain.
  Future<void> applyCheckpoint(
    ConnectedSiteScope scope, {
    required String canonicalCheckpointBytes,
    required String signature,
  }) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_disabled',
      );
    }
    final checkpoint = ConnectedSiteAuthorityCheckpointV1.parse(
      canonicalBytes: canonicalCheckpointBytes,
      signature: signature,
    );
    if (checkpoint.workspaceId != scope.workspaceId ||
        checkpoint.siteId != scope.siteId ||
        checkpoint.deviceId != scope.deviceId) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_checkpoint_scope_mismatch',
      );
    }
    final observedAt = nowMillis();
    if (observedAt < checkpoint.issuedAtMillis ||
        observedAt - checkpoint.issuedAtMillis >
            const Duration(minutes: 15).inMilliseconds ||
        checkpoint.payloads.any(
          (payload) => payload.issuedAtMillis > checkpoint.issuedAtMillis,
        )) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_checkpoint_stale',
      );
    }
    final firstObservedAt = observedAt - checkpoint.payloads.length + 1;
    if (firstObservedAt < 1) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_checkpoint_time_invalid',
      );
    }
    await reverifyRetainedPayloads();
    await verifier.verify(
      canonicalPayloadBytes: checkpoint.canonicalBytes,
      signature: checkpoint.signature,
      issuerKeyId: checkpoint.issuerKeyId,
    );
    for (final payload in checkpoint.payloads) {
      await verifier.verify(
        canonicalPayloadBytes: payload.canonicalBytes,
        signature: payload.signature,
        issuerKeyId: payload.issuerKeyId,
      );
    }
    await database.verifyConnectedAuthorityEvidence();
    await database.transaction(() async {
      final existing = await database
          .customSelect(
            'SELECT COUNT(*) AS count FROM shop_site_authority_payloads '
            'WHERE tenant_id = ? AND site_id = ?',
            variables: [
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingle();
      if (existing.read<int>('count') != 0) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_checkpoint_existing_chain',
        );
      }
      for (var index = 0; index < checkpoint.payloads.length; index += 1) {
        await _retainPayload(
          scope,
          checkpoint.payloads[index],
          firstObservedAt + index,
          transactionOwned: true,
          bootstrapProvenanceOwned: true,
        );
      }
      await database.customStatement(
        'INSERT INTO shop_site_authority_checkpoints ('
        'checkpoint_digest, tenant_id, site_id, device_id, issued_at_millis, '
        'issuer_key_id, first_authority_sequence, last_authority_sequence, '
        'chain_digest, checkpoint_bytes, signature, observed_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)',
        [
          checkpoint.checkpointDigest,
          checkpoint.workspaceId,
          checkpoint.siteId,
          checkpoint.deviceId,
          checkpoint.issuedAtMillis,
          checkpoint.issuerKeyId,
          checkpoint.payloads.length,
          checkpoint.chainDigest,
          checkpoint.canonicalBytes,
          checkpoint.signature,
          observedAt,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_authority_bootstrap_provenance ('
        'tenant_id, site_id, device_id, bootstrap_mode, checkpoint_digest, recorded_at_millis) '
        "VALUES (?, ?, ?, 'checkpoint_joined', ?, ?)",
        [
          checkpoint.workspaceId,
          checkpoint.siteId,
          checkpoint.deviceId,
          checkpoint.checkpointDigest,
          observedAt,
        ],
      );
      await database.verifyConnectedAuthorityEvidence();
    });
    _retainedPayloadsVerified = true;
  }

  Future<void> apply(
    ConnectedSiteScope scope, {
    required String canonicalPayloadBytes,
    required String signature,
  }) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_disabled',
      );
    }
    final payload = ConnectedSiteAuthorityPayloadV1.parse(
      canonicalBytes: canonicalPayloadBytes,
      signature: signature,
    );
    if (payload.workspaceId != scope.workspaceId ||
        payload.siteId != scope.siteId) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_scope_mismatch',
      );
    }
    final observedAt = nowMillis();
    if (observedAt < payload.issuedAtMillis ||
        observedAt - payload.issuedAtMillis >
            const Duration(days: 7).inMilliseconds) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_payload_stale',
      );
    }
    await reverifyRetainedPayloads();
    await verifier.verify(
      canonicalPayloadBytes: canonicalPayloadBytes,
      signature: signature,
      issuerKeyId: payload.issuerKeyId,
    );
    await _retainPayload(scope, payload, observedAt);
  }

  Future<void> _retainPayload(
    ConnectedSiteScope scope,
    ConnectedSiteAuthorityPayloadV1 payload,
    int observedAt, {
    bool transactionOwned = false,
    bool bootstrapProvenanceOwned = false,
  }) async {
    await database.verifyConnectedAuthorityEvidence();
    Future<void> retain() async {
      final device = await database
          .customSelect(
            "SELECT 1 FROM shop_site_devices WHERE device_id = ? AND tenant_id = ? AND site_id = ? AND state = 'active'",
            variables: [
              Variable<String>(scope.deviceId),
              Variable<String>(scope.workspaceId),
              Variable<String>(scope.siteId),
            ],
          )
          .getSingleOrNull();
      if (device == null) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_device_unbound',
        );
      }
      final latest = await database
          .customSelect(
            'SELECT * FROM shop_site_authority_payloads WHERE tenant_id = ? AND site_id = ? ORDER BY authority_sequence DESC LIMIT 1',
            variables: [Variable(scope.workspaceId), Variable(scope.siteId)],
          )
          .getSingleOrNull();
      if (!bootstrapProvenanceOwned) {
        final provenance = await database
            .customSelect(
              'SELECT 1 FROM shop_site_authority_bootstrap_provenance '
              'WHERE tenant_id = ? AND site_id = ? AND device_id = ?',
              variables: [
                Variable<String>(scope.workspaceId),
                Variable<String>(scope.siteId),
                Variable<String>(scope.deviceId),
              ],
            )
            .getSingleOrNull();
        if (provenance == null) {
          throw const ConnectedSiteReconciliationException(
            'connected_site_authority_checkpoint_required',
          );
        }
      }
      if (latest != null &&
          latest.read<int>('authority_sequence') == payload.authoritySequence &&
          latest.read<String>('payload_digest') == payload.payloadDigest &&
          latest.read<String>('signature') == payload.signature) {
        return;
      }
      if (latest != null &&
          latest.read<int>('authority_sequence') == payload.authoritySequence) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_changed_replay',
        );
      }
      final expectedSequence = latest == null
          ? 1
          : latest.read<int>('authority_sequence') + 1;
      final expectedPrevious = latest?.read<String>('payload_digest');
      if (payload.authoritySequence != expectedSequence ||
          payload.previousAuthorityDigest != expectedPrevious) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_sequence',
        );
      }
      if (latest != null &&
          observedAt <= latest.read<int>('observed_at_millis')) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_time_invalid',
        );
      }
      if (latest != null &&
          (payload.revocationGeneration <
                  latest.read<int>('revocation_generation') ||
              payload.configurationVersion <
                  latest.read<int>('configuration_version') ||
              (payload.revocationGeneration ==
                      latest.read<int>('revocation_generation') &&
                  payload.membershipDigest !=
                      latest.read<String>('membership_digest')) ||
              (payload.configurationVersion ==
                      latest.read<int>('configuration_version') &&
                  payload.configurationDigest !=
                      latest.read<String>('configuration_digest')))) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_regressed',
        );
      }
      final currentRevocation = await database
          .customSelect(
            'SELECT generation FROM shop_site_revocation_observations WHERE tenant_id = ? AND site_id = ?',
            variables: [Variable(scope.workspaceId), Variable(scope.siteId)],
          )
          .getSingleOrNull();
      if (currentRevocation != null &&
          currentRevocation.read<int>('generation') >
              payload.revocationGeneration) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_authority_payload_revocation_stale',
        );
      }
      final observation = await database
          .customSelect(
            'SELECT COALESCE(MAX(observation_sequence), 0) + 1 AS next FROM shop_site_authority_deltas WHERE tenant_id = ? AND site_id = ?',
            variables: [Variable(scope.workspaceId), Variable(scope.siteId)],
          )
          .getSingle();
      final observationSequence = observation.read<int>('next');
      final deltaJson = canonicalConnectedSiteJson(
        shopConnectedAuthorityDeltaJsonV27(
          tenantId: payload.workspaceId,
          siteId: payload.siteId,
          revocationGeneration: payload.revocationGeneration,
          membershipDigest: payload.membershipDigest,
          configurationVersion: payload.configurationVersion,
          configurationDigest: payload.configurationDigest,
        ),
      );
      final deltaDigest = crypto.sha256
          .convert(utf8.encode(deltaJson))
          .toString();
      await database.customStatement(
        'INSERT INTO shop_site_authority_deltas (tenant_id, site_id, observation_sequence, revocation_generation, membership_digest, configuration_version, configuration_digest, delta_json, delta_digest, observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          payload.workspaceId,
          payload.siteId,
          observationSequence,
          payload.revocationGeneration,
          payload.membershipDigest,
          payload.configurationVersion,
          payload.configurationDigest,
          deltaJson,
          deltaDigest,
          observedAt,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_authority_payloads (tenant_id, site_id, authority_sequence, authority_event_id, previous_authority_digest, issuer_key_id, issued_at_millis, payload_bytes, payload_digest, signature, membership_digest, configuration_digest, revocation_generation, configuration_version, observation_sequence, observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          payload.workspaceId,
          payload.siteId,
          payload.authoritySequence,
          payload.authorityEventId,
          payload.previousAuthorityDigest,
          payload.issuerKeyId,
          payload.issuedAtMillis,
          payload.canonicalBytes,
          payload.payloadDigest,
          payload.signature,
          payload.membershipDigest,
          payload.configurationDigest,
          payload.revocationGeneration,
          payload.configurationVersion,
          observationSequence,
          observedAt,
        ],
      );
      for (final member in payload.members) {
        await database.customStatement(
          'INSERT INTO shop_site_authority_members (tenant_id, site_id, authority_sequence, actor_id, actor_role, capabilities_json, session_generation) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            payload.workspaceId,
            payload.siteId,
            payload.authoritySequence,
            member.actorId,
            member.role.name,
            canonicalConnectedSiteJson(
              member.capabilities.map((value) => value.name).toList(),
            ),
            member.sessionGeneration,
          ],
        );
      }
      await database.customStatement(
        'INSERT INTO shop_site_configuration_snapshots (tenant_id, site_id, authority_sequence, configuration_version, business_profile_json, catalog_reference_json, configuration_digest) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          payload.workspaceId,
          payload.siteId,
          payload.authoritySequence,
          payload.configurationVersion,
          payload.businessProfileJson,
          payload.catalogReferenceJson,
          payload.configurationDigest,
        ],
      );
      await database.customStatement(
        'INSERT INTO shop_site_revocation_observations (tenant_id, site_id, generation, observed_at_millis, source_digest) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id,site_id) DO UPDATE SET generation=excluded.generation, observed_at_millis=excluded.observed_at_millis, source_digest=excluded.source_digest',
        [
          payload.workspaceId,
          payload.siteId,
          payload.revocationGeneration,
          observedAt,
          deltaDigest,
        ],
      );
      await database.verifyConnectedAuthorityEvidence();
    }

    if (transactionOwned) {
      await retain();
    } else {
      await database.transaction(retain);
    }
  }

  Future<void> _requireBootstrapProvenance(ConnectedSiteScope scope) async {
    final row = await database
        .customSelect(
          'SELECT bootstrap_mode, checkpoint_digest FROM '
          'shop_site_authority_bootstrap_provenance WHERE tenant_id = ? '
          'AND site_id = ? AND device_id = ?',
          variables: [
            Variable<String>(scope.workspaceId),
            Variable<String>(scope.siteId),
            Variable<String>(scope.deviceId),
          ],
        )
        .getSingleOrNull();
    if (row == null) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_bootstrap_provenance_missing',
      );
    }
    final checkpoint = await database
        .customSelect(
          'SELECT 1 FROM shop_site_authority_checkpoints WHERE tenant_id = ? '
          'AND site_id = ? AND device_id = ? AND checkpoint_digest = ?',
          variables: [
            Variable<String>(scope.workspaceId),
            Variable<String>(scope.siteId),
            Variable<String>(scope.deviceId),
            Variable<String>(row.read<String>('checkpoint_digest')),
          ],
        )
        .getSingleOrNull();
    if (checkpoint == null) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_checkpoint_required',
      );
    }
  }
}
