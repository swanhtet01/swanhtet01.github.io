import 'dart:convert';

import 'shop_connected_site_contracts.dart';

/// Source-only reconciliation contract. Production remains unavailable until
/// a reviewed authority provider, durable repository, and transport are
/// injected by the managed-site runtime.
const shopConnectedSiteReconciliationContract =
    'supermega.shop.connected-site-reconciliation.v1';
const connectedSiteCloudAuthorityResponseContract =
    'supermega.connected-site-authority-response.v1';
const connectedSiteCloudReconcileRequestContract =
    'supermega.connected-site-reconcile-request.v1';
const connectedSiteCloudReconcileResponseContract =
    'supermega.connected-site-reconcile-response.v1';
const connectedSiteCloudMaximumBodyBytes = 1024 * 1024;

class ConnectedSiteScope {
  ConnectedSiteScope({
    required this.workspaceId,
    required this.siteId,
    required this.deviceId,
  }) {
    if (!_isIdentifier(workspaceId) ||
        !_isIdentifier(siteId) ||
        !_isIdentifier(deviceId)) {
      throw const FormatException('connected_site_scope_invalid');
    }
  }

  final String workspaceId;
  final String siteId;
  final String deviceId;
}

class ConnectedSiteAuthorityState {
  ConnectedSiteAuthorityState({
    required this.scope,
    required this.active,
    required this.sessionGeneration,
    required this.authorityGeneration,
    required this.authorityPayloadDigest,
    required this.revocationGeneration,
    required this.observedAt,
    required this.expiresAt,
  }) {
    if (sessionGeneration < 1 ||
        authorityGeneration < 1 ||
        !_isDigest(authorityPayloadDigest) ||
        revocationGeneration < 0) {
      throw const FormatException('connected_site_authority_generation');
    }
    if (!expiresAt.toUtc().isAfter(observedAt.toUtc())) {
      throw const FormatException('connected_site_authority_window');
    }
  }

  final ConnectedSiteScope scope;
  final bool active;
  final int sessionGeneration;
  final int authorityGeneration;
  final String authorityPayloadDigest;
  final int revocationGeneration;
  final DateTime observedAt;
  final DateTime expiresAt;
}

abstract interface class ConnectedSiteAuthorityProvider {
  Future<ConnectedSiteAuthorityState> refresh(ConnectedSiteScope scope);
}

/// Authority refresh that binds the response to the already verified local
/// device enrollment generation before any receipt is retained.
abstract interface class ConnectedSiteSessionBoundAuthorityProvider {
  Future<ConnectedSiteAuthorityState> refreshForSession(
    ConnectedSiteScope scope, {
    required int expectedSessionGeneration,
  });
}

class UnavailableConnectedSiteAuthorityProvider
    implements ConnectedSiteAuthorityProvider {
  const UnavailableConnectedSiteAuthorityProvider();

  @override
  Future<ConnectedSiteAuthorityState> refresh(ConnectedSiteScope scope) =>
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_unavailable',
      );
}

class ConnectedSitePendingEvent {
  factory ConnectedSitePendingEvent({
    required int cursor,
    required String commandId,
    required String commandDigest,
    required Map<String, Object?> event,
    required String eventDigest,
    required ConnectedSiteCloudProofV1 cloudProof,
  }) {
    if (cursor < 1 ||
        !_isIdentifier(commandId) ||
        !_isDigest(commandDigest) ||
        !_isDigest(eventDigest)) {
      throw const FormatException('connected_site_pending_event_invalid');
    }
    final strict = SiteDeltaV1(
      workspaceId: event['workspaceId'] as dynamic,
      siteId: event['siteId'] as dynamic,
      afterCursor: cursor - 1,
      nextCursor: cursor,
      events: [
        {'cursor': cursor, 'event': event, 'eventDigest': eventDigest},
      ],
    );
    final immutableEvent = strict.events.single['event'];
    if (immutableEvent is! Map<String, Object?>) {
      throw const FormatException('connected_site_pending_event_invalid');
    }
    return ConnectedSitePendingEvent._(
      cursor: cursor,
      commandId: commandId,
      commandDigest: commandDigest,
      event: immutableEvent,
      eventDigest: eventDigest,
      cloudProof: cloudProof.requireEventBinding(
        workspaceId: event['workspaceId'] as String,
        siteId: event['siteId'] as String,
        commandId: commandId,
        commandDigest: commandDigest,
      ),
    );
  }

  const ConnectedSitePendingEvent._({
    required this.cursor,
    required this.commandId,
    required this.commandDigest,
    required this.event,
    required this.eventDigest,
    required this.cloudProof,
  });

  final int cursor;
  final String commandId;
  final String commandDigest;
  final Map<String, Object?> event;
  final String eventDigest;
  final ConnectedSiteCloudProofV1 cloudProof;
}

/// Immutable authority bytes retained for independent cloud verification.
///
/// This is deliberately separate from the local ACK and event digest. A cloud
/// service must be able to reparse the exact signed command and lease rather
/// than trusting coordinator-authored columns. Coordinator-derived terminal
/// stock events carry the complete signed source proof plus a deterministic
/// derivation binding; they never masquerade as client-signed commands.
class ConnectedSiteCloudProofV1 {
  ConnectedSiteCloudProofV1.signed({
    required SiteCommandV1 command,
    required OfflineStaffLeaseV1 lease,
    required String clientFingerprint,
    required String enrollmentEvidenceDigest,
    required String coordinatorBindingDigest,
    required String authorityPayloadDigest,
    required Map<String, Object?> eventBinding,
  }) : this._fromStrict({
         'contract': 'supermega.shop.connected-site-cloud-proof.v1',
         'proofKind': 'signedClientCommand',
         'command': command.toJson(),
         'commandBytesDigest': connectedSiteSha256(command.toJson()),
         'lease': lease.toJson(),
         'leaseBytesDigest': connectedSiteSha256(lease.toJson()),
         'clientFingerprint': clientFingerprint,
         'enrollmentEvidenceDigest': enrollmentEvidenceDigest,
         'coordinatorBindingDigest': coordinatorBindingDigest,
         'authorityPayloadDigest': authorityPayloadDigest,
         'eventBinding': eventBinding,
         'eventBindingDigest': connectedSiteSha256(eventBinding),
       });

  ConnectedSiteCloudProofV1.coordinatorDerived({
    required String commandId,
    required String commandDigest,
    required String workspaceId,
    required String siteId,
    required String deviceId,
    required String leaseDigest,
    required ConnectedSiteCloudProofV1 sourceProof,
    required Map<String, Object?> derivation,
  }) : this._fromStrict({
         'contract': 'supermega.shop.connected-site-cloud-proof.v1',
         'proofKind': 'coordinatorDerived',
         'commandId': commandId,
         'commandDigest': commandDigest,
         'workspaceId': workspaceId,
         'siteId': siteId,
         'deviceId': deviceId,
         'leaseDigest': leaseDigest,
         'sourceProof': sourceProof.toJson(),
         'sourceProofDigest': sourceProof.proofDigest,
         'derivation': derivation,
         'derivationDigest': connectedSiteSha256(derivation),
       });

  factory ConnectedSiteCloudProofV1.fromJson(Object? value) {
    if (value is! Map) {
      throw const FormatException('connected_site_cloud_proof_invalid');
    }
    return ConnectedSiteCloudProofV1._fromStrict(
      Map<String, Object?>.from(value),
    );
  }

  ConnectedSiteCloudProofV1._fromStrict(Map<String, Object?> source)
    : _encoded = canonicalConnectedSiteJson(_validate(source));

  final String _encoded;

  Map<String, Object?> get _json =>
      Map<String, Object?>.from(jsonDecode(_encoded) as Map);

  String get proofKind => _json['proofKind']! as String;
  String get commandId => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command']).commandId
      : _json['commandId']! as String;
  String get commandDigest => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command']).commandDigest
      : _json['commandDigest']! as String;
  String get workspaceId => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command']).workspaceId
      : _json['workspaceId']! as String;
  String get siteId => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command']).siteId
      : _json['siteId']! as String;
  String get deviceId => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command']).deviceId
      : _json['deviceId']! as String;
  String get leaseDigest => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command']).leaseDigest
      : _json['leaseDigest']! as String;
  SiteCommandV1? get signedCommand => proofKind == 'signedClientCommand'
      ? SiteCommandV1.fromJson(_json['command'])
      : null;
  String get proofDigest => connectedSiteSha256(_json);

  /// Returns a detached copy so callers cannot mutate the validated proof.
  Map<String, Object?> toJson() => _json;

  ConnectedSiteCloudProofV1 requireEventBinding({
    required String workspaceId,
    required String siteId,
    required String commandId,
    required String commandDigest,
  }) {
    if (this.workspaceId != workspaceId ||
        this.siteId != siteId ||
        this.commandId != commandId ||
        this.commandDigest != commandDigest) {
      throw const FormatException('connected_site_cloud_proof_binding');
    }
    return this;
  }

  /// Revalidates the complete event bytes immediately before cloud upload.
  /// Historical proof integrity and current authority are distinct: this
  /// method binds the retained proof to the emitted event, while the store
  /// separately requires that the retained authority is still current.
  ConnectedSiteCloudProofV1 requireUploadEventBinding({
    required Map<String, Object?> event,
    required String eventDigest,
    required String capability,
    required String auditAction,
  }) {
    if (connectedSiteSha256(event) != eventDigest) {
      throw const FormatException('connected_site_cloud_event_binding');
    }
    final json = _json;
    if (proofKind == 'signedClientCommand') {
      final command = signedCommand!;
      final binding = json['eventBinding'];
      final exactBinding =
          binding is Map &&
          binding.length == 6 &&
          const {
            'eventId',
            'eventType',
            'eventDigest',
            'capability',
            'auditAction',
            'commandType',
          }.every(binding.containsKey);
      if (!exactBinding ||
          binding['eventId'] != event['eventId'] ||
          binding['eventType'] != event['eventType'] ||
          binding['eventDigest'] != eventDigest ||
          binding['capability'] != capability ||
          binding['auditAction'] != auditAction ||
          binding['commandType'] != command.commandType ||
          event['workspaceId'] != command.workspaceId ||
          event['siteId'] != command.siteId ||
          event['aggregateType'] != command.aggregateType ||
          event['aggregateId'] != command.aggregateId ||
          event['aggregateVersion'] != command.expectedVersion + 1 ||
          event['occurredAt'] != command.issuedAt ||
          canonicalConnectedSiteJson(event['payload']) !=
              canonicalConnectedSiteJson(command.payload)) {
        throw const FormatException('connected_site_cloud_event_binding');
      }
    } else {
      final derivation = json['derivation'];
      final payload = event['payload'];
      if (derivation is! Map ||
          payload is! Map ||
          derivation['eventDigest'] != eventDigest ||
          payload['operationId'] != derivation['operationId'] ||
          payload['reservationId'] != derivation['reservationId'] ||
          payload['transitionDigest'] != derivation['transitionDigest'] ||
          payload['state'] != derivation['state']) {
        throw const FormatException('connected_site_cloud_event_binding');
      }
    }
    return this;
  }

  static Map<String, Object?> _validate(Map<String, Object?> source) {
    bool exact(Set<String> keys) =>
        source.length == keys.length && source.keys.every(keys.contains);
    if (source['contract'] != 'supermega.shop.connected-site-cloud-proof.v1') {
      throw const FormatException('connected_site_cloud_proof_contract');
    }
    if (source['proofKind'] == 'signedClientCommand') {
      if (!exact(const {
        'contract',
        'proofKind',
        'command',
        'commandBytesDigest',
        'lease',
        'leaseBytesDigest',
        'clientFingerprint',
        'enrollmentEvidenceDigest',
        'coordinatorBindingDigest',
        'authorityPayloadDigest',
        'eventBinding',
        'eventBindingDigest',
      })) {
        throw const FormatException('connected_site_cloud_proof_shape');
      }
      final command = SiteCommandV1.fromJson(source['command']);
      final lease = OfflineStaffLeaseV1.fromJson(source['lease']);
      if (source['commandBytesDigest'] !=
              connectedSiteSha256(command.toJson()) ||
          source['leaseBytesDigest'] != connectedSiteSha256(lease.toJson()) ||
          command.workspaceId != lease.workspaceId ||
          command.siteId != lease.siteId ||
          command.actorId != lease.actorId ||
          command.deviceId != lease.deviceId ||
          command.leaseDigest != lease.payloadDigest ||
          source['clientFingerprint'] is! String ||
          !_isDigest(source['clientFingerprint']! as String) ||
          source['enrollmentEvidenceDigest'] is! String ||
          !_isDigest(source['enrollmentEvidenceDigest']! as String) ||
          source['coordinatorBindingDigest'] is! String ||
          !_isDigest(source['coordinatorBindingDigest']! as String) ||
          source['authorityPayloadDigest'] is! String ||
          !_isDigest(source['authorityPayloadDigest']! as String) ||
          source['eventBinding'] is! Map ||
          source['eventBindingDigest'] !=
              connectedSiteSha256(source['eventBinding'])) {
        throw const FormatException('connected_site_cloud_proof_binding');
      }
    } else if (source['proofKind'] == 'coordinatorDerived') {
      if (!exact(const {
        'contract',
        'proofKind',
        'commandId',
        'commandDigest',
        'workspaceId',
        'siteId',
        'deviceId',
        'leaseDigest',
        'sourceProof',
        'sourceProofDigest',
        'derivation',
        'derivationDigest',
      })) {
        throw const FormatException('connected_site_cloud_proof_shape');
      }
      final sourceProof = ConnectedSiteCloudProofV1.fromJson(
        source['sourceProof'],
      );
      final derivation = source['derivation'];
      final exactDerivation =
          derivation is Map &&
          derivation.length == 6 &&
          const {
            'contract',
            'operationId',
            'reservationId',
            'transitionDigest',
            'state',
            'eventDigest',
          }.every(derivation.containsKey);
      if (sourceProof.proofKind != 'signedClientCommand' ||
          source['sourceProofDigest'] != sourceProof.proofDigest ||
          source['workspaceId'] != sourceProof.workspaceId ||
          source['siteId'] != sourceProof.siteId ||
          source['deviceId'] != sourceProof.deviceId ||
          source['leaseDigest'] != sourceProof.leaseDigest ||
          source['commandId'] is! String ||
          !_isIdentifier(source['commandId']! as String) ||
          source['commandDigest'] is! String ||
          !_isDigest(source['commandDigest']! as String) ||
          !exactDerivation ||
          derivation['contract'] !=
              'supermega.shop.connected-stock-terminal-derivation.v1' ||
          derivation['operationId'] is! String ||
          !_isIdentifier(derivation['operationId']! as String) ||
          derivation['reservationId'] is! String ||
          !_isIdentifier(derivation['reservationId']! as String) ||
          derivation['transitionDigest'] is! String ||
          !_isDigest(derivation['transitionDigest']! as String) ||
          !const {
            'released',
            'expired',
            'committed',
          }.contains(derivation['state']) ||
          derivation['eventDigest'] is! String ||
          !_isDigest(derivation['eventDigest']! as String) ||
          source['derivationDigest'] != connectedSiteSha256(derivation)) {
        throw const FormatException('connected_site_cloud_proof_binding');
      }
    } else {
      throw const FormatException('connected_site_cloud_proof_kind');
    }
    return Map.unmodifiable(source);
  }
}

abstract interface class ConnectedSiteEventRepository {
  Future<int> uploadCursor(ConnectedSiteScope scope);

  Future<List<ConnectedSitePendingEvent>> pendingEvents(
    ConnectedSiteScope scope, {
    required int afterCursor,
    required int limit,
  });

  /// Must atomically and idempotently persist all acknowledgements, conflict
  /// quarantines, and the resulting upload cursor. It must never rewrite or
  /// delete an original financial record.
  Future<ConnectedSitePersistResult> persistCloudOutcome(
    ConnectedSiteScope scope,
    ConnectedSiteCloudOutcome outcome,
  );
}

class ConnectedSitePersistResult {
  const ConnectedSitePersistResult({
    required this.newAcknowledgementCount,
    required this.newConflictCount,
  });

  final int newAcknowledgementCount;
  final int newConflictCount;
}

class ConnectedSiteUploadRequest {
  ConnectedSiteUploadRequest({
    required this.scope,
    required this.sessionGeneration,
    required this.authorityGeneration,
    required this.authorityPayloadDigest,
    required this.revocationGeneration,
    required this.afterCursor,
    required List<ConnectedSitePendingEvent> events,
  }) : events = List.unmodifiable(events) {
    if (sessionGeneration < 1 ||
        authorityGeneration < 1 ||
        !_isDigest(authorityPayloadDigest) ||
        revocationGeneration < 0 ||
        afterCursor < 0 ||
        events.length > 256) {
      throw const FormatException('connected_site_upload_invalid');
    }
    _requireOrderedEvents(scope, afterCursor, this.events);
  }

  final ConnectedSiteScope scope;
  final int sessionGeneration;
  final int authorityGeneration;
  final String authorityPayloadDigest;
  final int revocationGeneration;
  final int afterCursor;
  final List<ConnectedSitePendingEvent> events;
}

class ConnectedSiteCloudResponse {
  ConnectedSiteCloudResponse({
    required this.scope,
    required this.deviceId,
    required this.authorityGeneration,
    required this.authorityPayloadDigest,
    required this.afterCursor,
    required this.nextCursor,
    required List<SiteCommandAckV1> acknowledgements,
    required List<SiteConflictV1> conflicts,
    required this.authorityDelta,
  }) : acknowledgements = List.unmodifiable(acknowledgements),
       conflicts = List.unmodifiable(conflicts) {
    if (!_isIdentifier(deviceId) ||
        authorityGeneration < 1 ||
        !_isDigest(authorityPayloadDigest) ||
        afterCursor < 0 ||
        nextCursor < afterCursor) {
      throw const FormatException('connected_site_response_cursor');
    }
  }

  final ConnectedSiteScope scope;
  final String deviceId;
  final int authorityGeneration;
  final String authorityPayloadDigest;
  final int afterCursor;
  final int nextCursor;
  final List<SiteCommandAckV1> acknowledgements;
  final List<SiteConflictV1> conflicts;
  final ConnectedSiteAuthorityDelta authorityDelta;
}

abstract interface class ConnectedSiteCloudTransport {
  Future<ConnectedSiteCloudResponse> reconcile(
    ConnectedSiteUploadRequest request,
  );
}

class UnavailableConnectedSiteCloudTransport
    implements ConnectedSiteCloudTransport {
  const UnavailableConnectedSiteCloudTransport();

  @override
  Future<ConnectedSiteCloudResponse> reconcile(
    ConnectedSiteUploadRequest request,
  ) => throw const ConnectedSiteReconciliationException(
    'connected_site_transport_unavailable',
  );
}

/// Deliberately excludes sale, tender, receipt, stock, and correction payloads.
/// Those local financial records remain immutable and are reconciled through
/// command acknowledgements/conflicts, never overwritten by a download.
class ConnectedSiteAuthorityDelta {
  ConnectedSiteAuthorityDelta({
    required this.workspaceId,
    required this.siteId,
    required this.revocationGeneration,
    required this.membershipDigest,
    required this.configurationVersion,
    required this.configurationDigest,
  }) {
    if (!_isIdentifier(workspaceId) ||
        !_isIdentifier(siteId) ||
        revocationGeneration < 0 ||
        configurationVersion < 0 ||
        !_isDigest(membershipDigest) ||
        !_isDigest(configurationDigest)) {
      throw const FormatException('connected_site_authority_delta_invalid');
    }
  }

  final String workspaceId;
  final String siteId;
  final int revocationGeneration;
  final String membershipDigest;
  final int configurationVersion;
  final String configurationDigest;
}

abstract interface class ConnectedSiteAuthorityDeltaApplier {
  /// Applies only membership, revocation, and configuration metadata.
  Future<void> apply(
    ConnectedSiteScope scope,
    ConnectedSiteAuthorityDelta delta,
  );
}

class UnavailableConnectedSiteAuthorityDeltaApplier
    implements ConnectedSiteAuthorityDeltaApplier {
  const UnavailableConnectedSiteAuthorityDeltaApplier();

  @override
  Future<void> apply(
    ConnectedSiteScope scope,
    ConnectedSiteAuthorityDelta delta,
  ) => throw const ConnectedSiteReconciliationException(
    'connected_site_authority_delta_unavailable',
  );
}

class ConnectedSiteAuthenticatedHttpResponse {
  const ConnectedSiteAuthenticatedHttpResponse({
    required this.statusCode,
    required this.contentType,
    required this.body,
    required this.effectiveUri,
  });

  final int statusCode;
  final String? contentType;
  final List<int> body;
  final Uri effectiveUri;
}

/// Authentication is deliberately outside this adapter. Implementations must
/// add the reviewed device/service credential without exposing it here or in
/// request JSON. The adapter itself never constructs a bearer or Supabase key.
abstract interface class ConnectedSiteAuthenticatedRequestExecutor {
  Future<ConnectedSiteAuthenticatedHttpResponse> execute({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required List<int> body,
    required int maxResponseBytes,
  });
}

class UnavailableConnectedSiteAuthenticatedRequestExecutor
    implements ConnectedSiteAuthenticatedRequestExecutor {
  const UnavailableConnectedSiteAuthenticatedRequestExecutor();

  @override
  Future<ConnectedSiteAuthenticatedHttpResponse> execute({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required List<int> body,
    required int maxResponseBytes,
  }) => throw const ConnectedSiteReconciliationException(
    'connected_site_authenticated_executor_unavailable',
  );
}

/// Verifies authority bytes against a separately reviewed issuer registry.
/// Issuer keys returned by the HTTP service are intentionally never trusted.
class ConnectedSiteVerifiedAuthorityReceipt {
  const ConnectedSiteVerifiedAuthorityReceipt({
    required this.workspaceId,
    required this.siteId,
    required this.authoritySequence,
    required this.previousAuthorityDigest,
    required this.payloadDigest,
    required this.issuerKeyId,
    required this.revocationGeneration,
    required this.membershipDigest,
    required this.configurationVersion,
    required this.configurationDigest,
  });

  final String workspaceId;
  final String siteId;
  final int authoritySequence;
  final String? previousAuthorityDigest;
  final String payloadDigest;
  final String issuerKeyId;
  final int revocationGeneration;
  final String membershipDigest;
  final int configurationVersion;
  final String configurationDigest;
}

abstract interface class ConnectedSiteCloudAuthorityVerifier {
  Future<ConnectedSiteVerifiedAuthorityReceipt> parseAndVerify({
    required String canonicalPayloadBytes,
    required String signature,
    required ConnectedSiteScope expectedScope,
  });
}

class UnavailableConnectedSiteCloudAuthorityVerifier
    implements ConnectedSiteCloudAuthorityVerifier {
  const UnavailableConnectedSiteCloudAuthorityVerifier();

  @override
  Future<ConnectedSiteVerifiedAuthorityReceipt> parseAndVerify({
    required String canonicalPayloadBytes,
    required String signature,
    required ConnectedSiteScope expectedScope,
  }) => throw const ConnectedSiteReconciliationException(
    'connected_site_cloud_authority_verifier_unavailable',
  );
}

abstract interface class ConnectedSiteVerifiedAuthorityReceiptStore {
  Future<ConnectedSiteVerifiedAuthorityReceipt?> latest(
    ConnectedSiteScope scope,
  );

  Future<void> retain(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String signature,
  });

  Future<void> retainCheckpoint(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String payloadSignature,
    required String canonicalCheckpointBytes,
    required String checkpointSignature,
  });
}

class UnavailableConnectedSiteVerifiedAuthorityReceiptStore
    implements ConnectedSiteVerifiedAuthorityReceiptStore {
  const UnavailableConnectedSiteVerifiedAuthorityReceiptStore();

  @override
  Future<ConnectedSiteVerifiedAuthorityReceipt?> latest(
    ConnectedSiteScope scope,
  ) => throw const ConnectedSiteReconciliationException(
    'connected_site_cloud_authority_store_unavailable',
  );

  @override
  Future<void> retain(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String signature,
  }) => throw const ConnectedSiteReconciliationException(
    'connected_site_cloud_authority_store_unavailable',
  );

  @override
  Future<void> retainCheckpoint(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String payloadSignature,
    required String canonicalCheckpointBytes,
    required String checkpointSignature,
  }) => throw const ConnectedSiteReconciliationException(
    'connected_site_cloud_authority_store_unavailable',
  );
}

/// Strict default-off adapter for the unmounted server reconciliation router.
/// It accepts only canonical JSON so duplicate keys, alternate encodings and
/// response-shape ambiguity fail before durable cursors can advance.
class ConnectedSiteCloudWireClient
    implements
        ConnectedSiteAuthorityProvider,
        ConnectedSiteSessionBoundAuthorityProvider,
        ConnectedSiteCloudTransport {
  ConnectedSiteCloudWireClient({
    required Uri baseUri,
    this.executor =
        const UnavailableConnectedSiteAuthenticatedRequestExecutor(),
    this.authorityVerifier =
        const UnavailableConnectedSiteCloudAuthorityVerifier(),
    this.authorityReceiptStore =
        const UnavailableConnectedSiteVerifiedAuthorityReceiptStore(),
    this.runtimeEnabled = false,
    this.maximumBodyBytes = connectedSiteCloudMaximumBodyBytes,
    DateTime Function()? now,
    this.authorityFreshness = const Duration(minutes: 5),
  }) : baseUri = _validatedCloudBaseUri(baseUri),
       now = now ?? (() => DateTime.now().toUtc()) {
    if (maximumBodyBytes < 1024 ||
        maximumBodyBytes > connectedSiteCloudMaximumBodyBytes ||
        authorityFreshness <= Duration.zero ||
        authorityFreshness > const Duration(minutes: 5)) {
      throw const FormatException('connected_site_cloud_body_limit');
    }
  }

  final Uri baseUri;
  final ConnectedSiteAuthenticatedRequestExecutor executor;
  final ConnectedSiteCloudAuthorityVerifier authorityVerifier;
  final ConnectedSiteVerifiedAuthorityReceiptStore authorityReceiptStore;
  final bool runtimeEnabled;
  final int maximumBodyBytes;
  final DateTime Function() now;
  final Duration authorityFreshness;
  final Map<String, ConnectedSiteVerifiedAuthorityReceipt>
  _verifiedAuthorityByScope = {};

  @override
  Future<ConnectedSiteAuthorityState> refresh(ConnectedSiteScope scope) =>
      _refresh(scope);

  @override
  Future<ConnectedSiteAuthorityState> refreshForSession(
    ConnectedSiteScope scope, {
    required int expectedSessionGeneration,
  }) {
    if (expectedSessionGeneration < 1) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_session_generation_invalid',
      );
    }
    return _refresh(
      scope,
      expectedSessionGeneration: expectedSessionGeneration,
    );
  }

  Future<ConnectedSiteAuthorityState> _refresh(
    ConnectedSiteScope scope, {
    int? expectedSessionGeneration,
  }) async {
    _requireEnabled();
    final response = await _execute(
      uri: baseUri.resolve(
        '/api/connected-site/v1/workspaces/'
        '${Uri.encodeComponent(scope.workspaceId)}/sites/'
        '${Uri.encodeComponent(scope.siteId)}/authority',
      ),
      method: 'GET',
      body: const <int>[],
    );
    final json = _canonicalResponseObject(response);
    _requireExactShape(json, const {
      'contract',
      'protocolVersion',
      'workspaceId',
      'siteId',
      'deviceId',
      'active',
      'sessionGeneration',
      'authorityGeneration',
      'configurationGeneration',
      'revocationGeneration',
      'authorityPayloadBytes',
      'authorityPayloadDigest',
      'authoritySignature',
      'issuerKeyId',
      'authorityCheckpointBytes',
      'authorityCheckpointDigest',
      'authorityCheckpointSignature',
    });
    if (json['contract'] != connectedSiteCloudAuthorityResponseContract ||
        json['protocolVersion'] != connectedSiteProtocolVersion ||
        json['workspaceId'] != scope.workspaceId ||
        json['siteId'] != scope.siteId ||
        json['deviceId'] != scope.deviceId ||
        json['active'] is! bool ||
        json['sessionGeneration'] is! int ||
        (json['sessionGeneration']! as int) < 1 ||
        json['authorityGeneration'] is! int ||
        (json['authorityGeneration']! as int) < 1 ||
        json['configurationGeneration'] is! int ||
        (json['configurationGeneration']! as int) < 1 ||
        json['revocationGeneration'] is! int ||
        (json['revocationGeneration']! as int) < 0 ||
        json['authorityPayloadBytes'] is! String ||
        json['authorityPayloadDigest'] is! String ||
        !_isDigest(json['authorityPayloadDigest']! as String) ||
        json['authoritySignature'] is! String ||
        (json['authoritySignature']! as String).isEmpty ||
        json['issuerKeyId'] is! String ||
        !_isIdentifier(json['issuerKeyId']! as String) ||
        (json['authorityCheckpointBytes'] != null &&
            json['authorityCheckpointBytes'] is! String) ||
        (json['authorityCheckpointDigest'] != null &&
            (json['authorityCheckpointDigest'] is! String ||
                !_isDigest(json['authorityCheckpointDigest']! as String))) ||
        (json['authorityCheckpointSignature'] != null &&
            json['authorityCheckpointSignature'] is! String)) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_authority_response_invalid',
      );
    }
    if (expectedSessionGeneration != null &&
        json['sessionGeneration'] != expectedSessionGeneration) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_session_generation_mismatch',
      );
    }
    final canonicalPayload = json['authorityPayloadBytes']! as String;
    final payloadDigest = connectedSiteSha256(
      _canonicalObjectText(canonicalPayload),
    );
    if (payloadDigest != json['authorityPayloadDigest']) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_authority_digest_mismatch',
      );
    }
    final receipt = await authorityVerifier.parseAndVerify(
      canonicalPayloadBytes: canonicalPayload,
      signature: json['authoritySignature']! as String,
      expectedScope: scope,
    );
    if (receipt.payloadDigest != payloadDigest ||
        receipt.issuerKeyId != json['issuerKeyId'] ||
        receipt.authoritySequence != json['authorityGeneration'] ||
        receipt.revocationGeneration != json['revocationGeneration'] ||
        receipt.configurationVersion != json['configurationGeneration']) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_authority_binding_mismatch',
      );
    }
    final key = _authorityScopeKey(scope);
    final previous =
        _verifiedAuthorityByScope[key] ??
        await authorityReceiptStore.latest(scope);
    if (previous != null) {
      if (receipt.authoritySequence < previous.authoritySequence ||
          (receipt.authoritySequence == previous.authoritySequence &&
              receipt.payloadDigest != previous.payloadDigest) ||
          (receipt.authoritySequence > previous.authoritySequence &&
              (receipt.authoritySequence != previous.authoritySequence + 1 ||
                  receipt.previousAuthorityDigest != previous.payloadDigest))) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_authority_sequence_invalid',
        );
      }
    }
    if (previous == null) {
      final checkpointBytes = json['authorityCheckpointBytes'];
      final checkpointDigest = json['authorityCheckpointDigest'];
      final checkpointSignature = json['authorityCheckpointSignature'];
      if (checkpointBytes is! String ||
          checkpointDigest is! String ||
          checkpointSignature is! String ||
          checkpointSignature.isEmpty) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_authority_checkpoint_required',
        );
      }
      final checkpoint = _canonicalObjectText(checkpointBytes);
      if (checkpoint['checkpointDigest'] != checkpointDigest ||
          checkpoint['workspaceId'] != scope.workspaceId ||
          checkpoint['siteId'] != scope.siteId ||
          checkpoint['deviceId'] != scope.deviceId ||
          checkpoint['lastAuthoritySequence'] != receipt.authoritySequence) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_authority_checkpoint_mismatch',
        );
      }
      await authorityReceiptStore.retainCheckpoint(
        scope,
        receipt: receipt,
        canonicalPayloadBytes: canonicalPayload,
        payloadSignature: json['authoritySignature']! as String,
        canonicalCheckpointBytes: checkpointBytes,
        checkpointSignature: checkpointSignature,
      );
    } else {
      await authorityReceiptStore.retain(
        scope,
        receipt: receipt,
        canonicalPayloadBytes: canonicalPayload,
        signature: json['authoritySignature']! as String,
      );
    }
    _verifiedAuthorityByScope[key] = receipt;
    final observedAt = now().toUtc();
    final expiresAt = observedAt.add(authorityFreshness);
    return ConnectedSiteAuthorityState(
      scope: scope,
      active: json['active']! as bool,
      sessionGeneration: json['sessionGeneration']! as int,
      authorityGeneration: json['authorityGeneration']! as int,
      authorityPayloadDigest: json['authorityPayloadDigest']! as String,
      revocationGeneration: json['revocationGeneration']! as int,
      observedAt: observedAt,
      expiresAt: expiresAt,
    );
  }

  @override
  Future<ConnectedSiteCloudResponse> reconcile(
    ConnectedSiteUploadRequest request,
  ) async {
    _requireEnabled();
    final key = _authorityScopeKey(request.scope);
    final receipt =
        _verifiedAuthorityByScope[key] ??
        await authorityReceiptStore.latest(request.scope);
    if (receipt != null) _verifiedAuthorityByScope[key] = receipt;
    if (receipt == null ||
        receipt.authoritySequence != request.authorityGeneration ||
        receipt.payloadDigest != request.authorityPayloadDigest ||
        receipt.revocationGeneration != request.revocationGeneration) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_verified_authority_required',
      );
    }
    final bodyJson = <String, Object?>{
      'contract': connectedSiteCloudReconcileRequestContract,
      'workspaceId': request.scope.workspaceId,
      'siteId': request.scope.siteId,
      'deviceId': request.scope.deviceId,
      'sessionGeneration': request.sessionGeneration,
      'authorityGeneration': request.authorityGeneration,
      'authorityPayloadDigest': request.authorityPayloadDigest,
      'revocationGeneration': request.revocationGeneration,
      'afterCursor': request.afterCursor,
      'events': [
        for (final event in request.events)
          <String, Object?>{
            'cursor': event.cursor,
            'commandId': event.commandId,
            'commandDigest': event.commandDigest,
            'event': event.event,
            'eventDigest': event.eventDigest,
            'cloudProof': event.cloudProof.toJson(),
          },
      ],
    };
    final body = utf8.encode(canonicalConnectedSiteJson(bodyJson));
    if (body.length > maximumBodyBytes) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_request_too_large',
      );
    }
    final response = await _execute(
      uri: baseUri.resolve('/api/connected-site/v1/reconcile'),
      method: 'POST',
      body: body,
    );
    final json = _canonicalResponseObject(response);
    _requireExactShape(json, const {
      'contract',
      'protocolVersion',
      'workspaceId',
      'siteId',
      'deviceId',
      'authorityGeneration',
      'authorityPayloadDigest',
      'afterCursor',
      'nextCursor',
      'acknowledgements',
      'conflicts',
      'authorityDelta',
    });
    if (json['contract'] != connectedSiteCloudReconcileResponseContract ||
        json['protocolVersion'] != connectedSiteProtocolVersion ||
        json['authorityGeneration'] != request.authorityGeneration ||
        json['authorityPayloadDigest'] != request.authorityPayloadDigest ||
        json['acknowledgements'] is! List ||
        json['conflicts'] is! List ||
        json['authorityDelta'] is! Map) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_response_invalid',
      );
    }
    try {
      final deltaJson = Map<String, Object?>.from(
        json['authorityDelta']! as Map,
      );
      _requireExactShape(deltaJson, const {
        'workspaceId',
        'siteId',
        'revocationGeneration',
        'membershipDigest',
        'configurationVersion',
        'configurationDigest',
      });
      if (deltaJson['workspaceId'] != receipt.workspaceId ||
          deltaJson['siteId'] != receipt.siteId ||
          deltaJson['revocationGeneration'] != receipt.revocationGeneration ||
          deltaJson['membershipDigest'] != receipt.membershipDigest ||
          deltaJson['configurationVersion'] != receipt.configurationVersion ||
          deltaJson['configurationDigest'] != receipt.configurationDigest) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_authority_delta_mismatch',
        );
      }
      return ConnectedSiteCloudResponse(
        scope: ConnectedSiteScope(
          workspaceId: json['workspaceId'] as dynamic,
          siteId: json['siteId'] as dynamic,
          deviceId: json['deviceId'] as dynamic,
        ),
        deviceId: json['deviceId'] as dynamic,
        authorityGeneration: json['authorityGeneration'] as dynamic,
        authorityPayloadDigest: json['authorityPayloadDigest'] as dynamic,
        afterCursor: json['afterCursor'] as dynamic,
        nextCursor: json['nextCursor'] as dynamic,
        acknowledgements: (json['acknowledgements']! as List)
            .map(SiteCommandAckV1.fromJson)
            .toList(),
        conflicts: (json['conflicts']! as List)
            .map(SiteConflictV1.fromJson)
            .toList(),
        authorityDelta: ConnectedSiteAuthorityDelta(
          workspaceId: deltaJson['workspaceId'] as dynamic,
          siteId: deltaJson['siteId'] as dynamic,
          revocationGeneration: deltaJson['revocationGeneration'] as dynamic,
          membershipDigest: deltaJson['membershipDigest'] as dynamic,
          configurationVersion: deltaJson['configurationVersion'] as dynamic,
          configurationDigest: deltaJson['configurationDigest'] as dynamic,
        ),
      );
    } on FormatException {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_response_invalid',
      );
    }
  }

  Future<ConnectedSiteAuthenticatedHttpResponse> _execute({
    required Uri uri,
    required String method,
    required List<int> body,
  }) async {
    late final ConnectedSiteAuthenticatedHttpResponse response;
    try {
      response = await executor.execute(
        uri: uri,
        method: method,
        headers: <String, String>{
          'accept': 'application/json',
          if (body.isNotEmpty) 'content-type': 'application/json',
        },
        body: List<int>.unmodifiable(body),
        maxResponseBytes: maximumBodyBytes,
      );
    } on ConnectedSiteReconciliationException {
      rethrow;
    } on Object {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_transport_failed',
      );
    }
    if (response.effectiveUri != uri) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_redirect_rejected',
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final code = switch (response.statusCode) {
        401 || 403 => 'connected_site_cloud_authority_rejected',
        409 => 'connected_site_cloud_conflict',
        413 => 'connected_site_cloud_request_too_large',
        422 => 'connected_site_cloud_request_invalid',
        429 => 'connected_site_cloud_rate_limited',
        >= 500 => 'connected_site_cloud_unavailable',
        _ => 'connected_site_cloud_http_rejected',
      };
      throw ConnectedSiteReconciliationException(code);
    }
    return response;
  }

  Map<String, Object?> _canonicalResponseObject(
    ConnectedSiteAuthenticatedHttpResponse response,
  ) {
    if (response.contentType?.split(';').first.trim().toLowerCase() !=
            'application/json' ||
        response.body.isEmpty ||
        response.body.length > maximumBodyBytes) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_response_invalid',
      );
    }
    try {
      return _canonicalObjectText(
        utf8.decode(response.body, allowMalformed: false),
      );
    } on FormatException {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_response_invalid',
      );
    }
  }

  void _requireEnabled() {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_wire_disabled',
      );
    }
  }

  String _authorityScopeKey(ConnectedSiteScope scope) =>
      '${scope.workspaceId}\u0000${scope.siteId}\u0000${scope.deviceId}';
}

class ConnectedSiteCloudOutcome {
  ConnectedSiteCloudOutcome({
    required this.afterCursor,
    required this.nextCursor,
    required List<SiteCommandAckV1> acknowledgements,
    required List<SiteConflictV1> conflicts,
  }) : acknowledgements = List.unmodifiable(acknowledgements),
       conflicts = List.unmodifiable(conflicts);

  final int afterCursor;
  final int nextCursor;
  final List<SiteCommandAckV1> acknowledgements;
  final List<SiteConflictV1> conflicts;
}

class ConnectedSiteReconciliationResult {
  const ConnectedSiteReconciliationResult({
    required this.uploadedEventCount,
    required this.newAcknowledgementCount,
    required this.newConflictCount,
    required this.nextCursor,
  });

  final int uploadedEventCount;
  final int newAcknowledgementCount;
  final int newConflictCount;
  final int nextCursor;
}

class ConnectedSiteReconciliationEngine {
  const ConnectedSiteReconciliationEngine({
    required this.authority,
    required this.repository,
    required this.transport,
    required this.authorityDeltaApplier,
    this.runtimeEnabled = false,
    this.batchLimit = 128,
  });

  final ConnectedSiteAuthorityProvider authority;
  final ConnectedSiteEventRepository repository;
  final ConnectedSiteCloudTransport transport;
  final ConnectedSiteAuthorityDeltaApplier authorityDeltaApplier;
  final bool runtimeEnabled;
  final int batchLimit;

  Future<ConnectedSiteReconciliationResult> reconcile({
    required ConnectedSiteScope scope,
    required DateTime now,
  }) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_reconciliation_disabled',
      );
    }
    if (batchLimit < 1 || batchLimit > 256) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_batch_policy_invalid',
      );
    }

    final refreshed = await authority.refresh(scope);
    _requireSameScope(scope, refreshed.scope);
    final instant = now.toUtc();
    if (!refreshed.active ||
        instant.isBefore(refreshed.observedAt.toUtc()) ||
        !instant.isBefore(refreshed.expiresAt.toUtc())) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authority_inactive',
      );
    }

    final afterCursor = await repository.uploadCursor(scope);
    if (afterCursor < 0) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_local_cursor_invalid',
      );
    }
    final pending = await repository.pendingEvents(
      scope,
      afterCursor: afterCursor,
      limit: batchLimit,
    );
    _requireOrderedEvents(scope, afterCursor, pending);

    final response = await transport.reconcile(
      ConnectedSiteUploadRequest(
        scope: scope,
        sessionGeneration: refreshed.sessionGeneration,
        authorityGeneration: refreshed.authorityGeneration,
        authorityPayloadDigest: refreshed.authorityPayloadDigest,
        revocationGeneration: refreshed.revocationGeneration,
        afterCursor: afterCursor,
        events: pending,
      ),
    );
    _validateResponse(
      scope,
      afterCursor,
      pending,
      response,
      expectedAuthorityGeneration: refreshed.authorityGeneration,
      expectedAuthorityPayloadDigest: refreshed.authorityPayloadDigest,
      minimumRevocationGeneration: refreshed.revocationGeneration,
    );

    final outcome = ConnectedSiteCloudOutcome(
      afterCursor: response.afterCursor,
      nextCursor: response.nextCursor,
      acknowledgements: response.acknowledgements,
      conflicts: response.conflicts,
    );
    _requireAuthorityDeltaScope(scope, response.authorityDelta);
    // This delta is idempotent and deliberately carries no financial data.
    // Apply it before advancing the durable upload cursor, so a failed
    // download application leaves all pending financial work retryable.
    await authorityDeltaApplier.apply(scope, response.authorityDelta);

    final persisted = await repository.persistCloudOutcome(scope, outcome);
    if (persisted.newAcknowledgementCount < 0 ||
        persisted.newConflictCount < 0) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_persist_result_invalid',
      );
    }

    return ConnectedSiteReconciliationResult(
      uploadedEventCount: pending.length,
      newAcknowledgementCount: persisted.newAcknowledgementCount,
      newConflictCount: persisted.newConflictCount,
      nextCursor: response.nextCursor,
    );
  }
}

void _validateResponse(
  ConnectedSiteScope scope,
  int afterCursor,
  List<ConnectedSitePendingEvent> pending,
  ConnectedSiteCloudResponse response, {
  required int expectedAuthorityGeneration,
  required String expectedAuthorityPayloadDigest,
  required int minimumRevocationGeneration,
}) {
  _requireSameScope(scope, response.scope);
  if (response.deviceId != scope.deviceId ||
      response.authorityGeneration != expectedAuthorityGeneration ||
      response.authorityPayloadDigest != expectedAuthorityPayloadDigest ||
      response.afterCursor != afterCursor ||
      response.nextCursor != afterCursor + pending.length ||
      response.authorityDelta.revocationGeneration <
          minimumRevocationGeneration) {
    throw const ConnectedSiteReconciliationException(
      'connected_site_response_binding_mismatch',
    );
  }

  final pendingByCommand = {
    for (final event in pending) event.commandId: event,
  };
  if (pendingByCommand.length != pending.length) {
    throw const ConnectedSiteReconciliationException(
      'connected_site_duplicate_local_command',
    );
  }
  final dispositions = <String>{};
  for (final ack in response.acknowledgements) {
    final local = pendingByCommand[ack.commandId];
    if (local == null ||
        local.commandDigest != ack.commandDigest ||
        local.eventDigest != ack.eventDigest ||
        ack.canonicalVersion != local.event['aggregateVersion'] ||
        (ack.state != SiteCommandAckState.accepted &&
            ack.state != SiteCommandAckState.replayed) ||
        !dispositions.add(ack.commandId)) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_ack_binding_mismatch',
      );
    }
  }
  for (final conflict in response.conflicts) {
    final local = pendingByCommand[conflict.commandId];
    if (conflict.workspaceId != scope.workspaceId ||
        conflict.siteId != scope.siteId ||
        local == null ||
        local.commandDigest != conflict.commandDigest ||
        conflict.aggregateType != local.event['aggregateType'] ||
        conflict.aggregateId != local.event['aggregateId'] ||
        conflict.expectedVersion !=
            (local.event['aggregateVersion'] as int) - 1 ||
        conflict.state != SiteConflictState.quarantined ||
        !dispositions.add(conflict.commandId)) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_conflict_binding_mismatch',
      );
    }
  }
  if (dispositions.length != pending.length) {
    throw const ConnectedSiteReconciliationException(
      'connected_site_incomplete_cloud_response',
    );
  }
}

void _requireOrderedEvents(
  ConnectedSiteScope scope,
  int afterCursor,
  List<ConnectedSitePendingEvent> events,
) {
  // Re-run the canonical contract at the upload boundary. This is deliberate
  // defense in depth for repository implementations and keeps this core tied
  // to the same exact event-envelope schema used by SiteDeltaV1.
  try {
    SiteDeltaV1(
      workspaceId: scope.workspaceId,
      siteId: scope.siteId,
      afterCursor: afterCursor,
      nextCursor: afterCursor + events.length,
      events: [
        for (final pending in events)
          {
            'cursor': pending.cursor,
            'event': pending.event,
            'eventDigest': pending.eventDigest,
          },
      ],
    );
  } on FormatException {
    throw const ConnectedSiteReconciliationException(
      'connected_site_event_chain_invalid',
    );
  }
  var cursor = afterCursor;
  for (final pending in events) {
    cursor += 1;
    if (pending.cursor != cursor ||
        pending.event['workspaceId'] != scope.workspaceId ||
        pending.event['siteId'] != scope.siteId ||
        connectedSiteSha256(pending.event) != pending.eventDigest) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_event_chain_invalid',
      );
    }
  }
}

void _requireSameScope(ConnectedSiteScope expected, ConnectedSiteScope actual) {
  if (actual.workspaceId != expected.workspaceId ||
      actual.siteId != expected.siteId ||
      actual.deviceId != expected.deviceId) {
    throw const ConnectedSiteReconciliationException(
      'connected_site_scope_mismatch',
    );
  }
}

void _requireAuthorityDeltaScope(
  ConnectedSiteScope scope,
  ConnectedSiteAuthorityDelta delta,
) {
  if (delta.workspaceId != scope.workspaceId || delta.siteId != scope.siteId) {
    throw const ConnectedSiteReconciliationException(
      'connected_site_authority_delta_scope_mismatch',
    );
  }
}

bool _isIdentifier(String value) =>
    RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$').hasMatch(value);

bool _isDigest(String value) => RegExp(r'^[0-9a-f]{64}$').hasMatch(value);

Uri _validatedCloudBaseUri(Uri value) {
  if (value.scheme != 'https' ||
      value.host.isEmpty ||
      value.userInfo.isNotEmpty ||
      value.hasQuery ||
      value.hasFragment ||
      (value.path.isNotEmpty && value.path != '/')) {
    throw const FormatException('connected_site_cloud_origin_invalid');
  }
  return Uri(
    scheme: 'https',
    host: value.host,
    port: value.hasPort ? value.port : null,
  );
}

Map<String, Object?> _canonicalObjectText(String encoded) {
  final decoded = jsonDecode(encoded);
  if (decoded is! Map || canonicalConnectedSiteJson(decoded) != encoded) {
    throw const FormatException('connected_site_cloud_json_noncanonical');
  }
  return Map<String, Object?>.from(decoded);
}

void _requireExactShape(Map<String, Object?> value, Set<String> keys) {
  if (value.length != keys.length || !value.keys.every(keys.contains)) {
    throw const ConnectedSiteReconciliationException(
      'connected_site_cloud_response_invalid',
    );
  }
}

class ConnectedSiteReconciliationException implements Exception {
  const ConnectedSiteReconciliationException(this.code);

  final String code;

  @override
  String toString() => code;
}
