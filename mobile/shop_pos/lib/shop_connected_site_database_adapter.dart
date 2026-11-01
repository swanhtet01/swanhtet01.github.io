import 'dart:convert';

import 'package:drift/drift.dart';

import 'shop_cafe_order_contract.dart';
import 'shop_cafe_order_store.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_connected_stock_reservation.dart';
import 'shop_database.dart';
import 'shop_site_coordinator.dart';
import 'shop_staff_authorization.dart';

const shopRetailStockReserveCommandType = 'retail.stock.reserve.v1';
const shopRetailStockReleaseCommandType = 'retail.stock.release.v1';
const shopCafeStockReserveCommandType = 'cafe.stock.reserve.v1';
const shopCafeStockReleaseCommandType = 'cafe.stock.release.v1';
const shopCafeOrderPutCommandType = 'cafe.order.put.v1';
const shopCafeOrderStateCommandType = 'cafe.order.state.v1';
const shopCafeOrderCancelCommandType = 'cafe.order.cancel.v1';
const shopCafeKitchenStatusCommandType = 'cafe.kitchen.status.v1';

const _shopCafeOrderPutPayloadContract =
    'supermega.shop.connected-cafe-order-put.v1';
const _shopCafeOrderStatePayloadContract =
    'supermega.shop.connected-cafe-order-state.v1';
const _shopCafeOrderCancelPayloadContract =
    'supermega.shop.connected-cafe-order-cancel.v1';
const _shopCafeKitchenStatusPayloadContract =
    'supermega.shop.connected-cafe-kitchen-status.v1';

/// Strict command vocabulary for the default-off connected stock slice.
class ShopConnectedSiteDatabaseCapabilityResolver
    implements SiteCommandCapabilityResolver {
  const ShopConnectedSiteDatabaseCapabilityResolver();

  @override
  ShopStaffCapability? requiredCapability(SiteCommandV1 command) =>
      switch (command.commandType) {
        shopRetailStockReserveCommandType ||
        shopRetailStockReleaseCommandType => ShopStaffCapability.counterSale,
        shopCafeStockReserveCommandType ||
        shopCafeStockReleaseCommandType ||
        shopCafeOrderPutCommandType ||
        shopCafeOrderStateCommandType ||
        shopCafeOrderCancelCommandType => ShopStaffCapability.cafeOrderWrite,
        shopCafeKitchenStatusCommandType =>
          ShopStaffCapability.cafeKitchenStatus,
        _ => null,
      };
}

/// Converts an already authenticated wire command into the atomic database
/// seam. This adapter does not verify signatures, issue leases, or enable the
/// connected feature; those checks remain mandatory in the coordinator core.
class ShopConnectedSiteDatabaseCommandHandler implements SiteCommandHandler {
  ShopConnectedSiteDatabaseCommandHandler({
    required this.database,
    required this.timeAuthority,
    this.cafeStore,
    Map<String, CafeModifierSnapshot> cafeModifierCatalog = const {},
    this.connectedSiteEnabled = false,
  }) : cafeModifierCatalog = Map.unmodifiable(cafeModifierCatalog);

  final ShopDatabase database;
  final ShopConnectedSiteCoordinatorTimeAuthority timeAuthority;
  final ShopCafeOrderStore? cafeStore;
  final Map<String, CafeModifierSnapshot> cafeModifierCatalog;
  final bool connectedSiteEnabled;

  @override
  Future<SiteCommandAckV1> handle(
    String clientFingerprint,
    SiteCommandV1 command,
  ) async {
    if (!connectedSiteEnabled) {
      throw StateError('Connected-site database commands are disabled.');
    }
    await _requireActiveClient(clientFingerprint, command);
    final mapping = await _mapping(command);
    final issuedAtMillis = DateTime.parse(command.issuedAt)
        .toUtc()
        .millisecondsSinceEpoch;
    final eventId =
        'event:${connectedSiteSha256({'commandId': command.commandId})}';
    final event = <String, Object?>{
      'eventId': eventId,
      'workspaceId': command.workspaceId,
      'siteId': command.siteId,
      'aggregateType': command.aggregateType,
      'aggregateId': command.aggregateId,
      'aggregateVersion': command.expectedVersion + 1,
      'eventType': mapping.eventType,
      'occurredAt': DateTime.fromMillisecondsSinceEpoch(
        issuedAtMillis,
        isUtc: true,
      ).toIso8601String(),
      'payload': command.payload,
    };
    final eventBinding = <String, Object?>{
      'eventId': eventId,
      'eventType': mapping.eventType,
      'eventDigest': connectedSiteSha256(event),
      'capability': mapping.capability.name,
      'auditAction': mapping.auditAction,
      'commandType': command.commandType,
    };
    final cloudProof = await _cloudProofFor(
      clientFingerprint,
      command,
      eventBinding,
    );
    final result = await database.applyConnectedSiteCommand(
      ShopConnectedSiteCommandInput(
        commandId: command.commandId,
        tenantId: command.workspaceId,
        siteId: command.siteId,
        actorId: command.actorId,
        deviceId: command.deviceId,
        aggregateType: command.aggregateType,
        aggregateId: command.aggregateId,
        capability: mapping.capability.name,
        expectedVersion: command.expectedVersion,
        payloadDigest: command.payloadDigest,
        leaseDigest: command.leaseDigest,
        commandDigest: command.commandDigest,
        cloudProofJson: canonicalConnectedSiteJson(cloudProof.toJson()),
        cloudProofDigest: cloudProof.proofDigest,
        eventId: eventId,
        eventType: mapping.eventType,
        eventPayloadJson: canonicalConnectedSiteJson(command.payload),
        eventDigest: connectedSiteSha256(event),
        ackDigest: connectedSiteSha256({
          'contract': 'supermega.shop.connected-site-local-ack.v1',
          'commandDigest': command.commandDigest,
        }),
        auditAction: mapping.auditAction,
        auditMetadataDigest: connectedSiteSha256({
          'contract': 'supermega.shop.connected-site-audit-metadata.v1',
          'commandDigest': command.commandDigest,
          'commandType': command.commandType,
          'aggregateType': command.aggregateType,
          'aggregateId': command.aggregateId,
        }),
        createdAtMillis: issuedAtMillis,
        stockReservation: mapping.reservation,
        stockReservationLifecycle: mapping.lifecycle,
        stockReservationRequirement: mapping.reservationRequirement,
        acceptedProjection: mapping.acceptedProjection,
      ),
      connectedSiteEnabled: true,
      timeAuthority: timeAuthority,
    );
    return SiteCommandAckV1(
      commandId: command.commandId,
      commandDigest: command.commandDigest,
      state: switch (result.status) {
        ShopConnectedSiteCommandStatus.accepted => SiteCommandAckState.accepted,
        ShopConnectedSiteCommandStatus.replayed => SiteCommandAckState.replayed,
        ShopConnectedSiteCommandStatus.conflict => SiteCommandAckState.conflict,
      },
      canonicalVersion: result.canonicalVersion,
      eventDigest: result.eventDigest,
      reason: result.conflictCode,
    );
  }

  Future<void> _requireActiveClient(
    String clientFingerprint,
    SiteCommandV1 command,
  ) async {
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(clientFingerprint)) {
      throw StateError('Connected-site client fingerprint is invalid.');
    }
    final row = await database
        .customSelect(
          'SELECT 1 FROM shop_site_devices WHERE device_id = ? '
          'AND tenant_id = ? AND site_id = ? AND public_key_fingerprint = ? '
          "AND state = 'active'",
          variables: [
            Variable<String>(command.deviceId),
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(clientFingerprint),
          ],
        )
        .getSingleOrNull();
    if (row == null) {
      throw StateError('Connected-site client is not enrolled and active.');
    }
  }

  Future<ConnectedSiteCloudProofV1> _cloudProofFor(
    String clientFingerprint,
    SiteCommandV1 command,
    Map<String, Object?> eventBinding,
  ) async {
    final leaseRow = await database
        .customSelect(
          'SELECT retained.lease_json, retained.issuer_evidence_digest '
          'FROM shop_site_offline_lease_payloads retained '
          'JOIN shop_site_offline_leases lease '
          'ON lease.payload_digest = retained.payload_digest '
          'WHERE retained.payload_digest = ? AND lease.tenant_id = ? '
          'AND lease.site_id = ? AND lease.actor_id = ? AND lease.device_id = ?',
          variables: [
            Variable<String>(command.leaseDigest),
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(command.actorId),
            Variable<String>(command.deviceId),
          ],
        )
        .getSingleOrNull();
    final enrollmentRows = await database
        .customSelect(
          'SELECT evidence.evidence_digest, evidence.evidence_json, '
          'evidence.coordinator_device_id, evidence.session_generation '
          'FROM shop_site_enrollment_evidence evidence '
          'JOIN shop_site_devices device ON device.device_id = evidence.device_id '
          "WHERE evidence.action = 'approve' AND evidence.tenant_id = ? "
          'AND evidence.site_id = ? AND evidence.device_id = ? '
          'AND evidence.client_fingerprint = ? '
          'AND device.tenant_id = evidence.tenant_id '
          'AND device.site_id = evidence.site_id '
          'AND device.public_key_fingerprint = evidence.client_fingerprint '
          'AND device.session_generation = evidence.session_generation '
          "AND device.state = 'active' AND NOT EXISTS ("
          'SELECT 1 FROM shop_site_enrollment_evidence revoked '
          "WHERE revoked.action = 'revoke' "
          'AND revoked.tenant_id = evidence.tenant_id '
          'AND revoked.site_id = evidence.site_id '
          'AND revoked.device_id = evidence.device_id '
          'AND revoked.client_fingerprint = evidence.client_fingerprint '
          'AND revoked.session_generation >= evidence.session_generation)',
          variables: [
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(command.deviceId),
            Variable<String>(clientFingerprint),
          ],
        )
        .get();
    if (leaseRow == null || enrollmentRows.length != 1) {
      throw StateError('connected_site_cloud_authority_evidence_unavailable');
    }
    final enrollment = enrollmentRows.single;
    final enrollmentDigest = enrollment.read<String>('evidence_digest');
    _requireCanonicalEnrollmentEvidence(
      enrollment.read<String>('evidence_json'),
      enrollmentDigest: enrollmentDigest,
      command: command,
      clientFingerprint: clientFingerprint,
    );
    final commandIssuedAt = DateTime.parse(command.issuedAt)
        .toUtc()
        .millisecondsSinceEpoch;
    final bindingRows = await database
        .customSelect(
          'SELECT binding_digest, evidence_json FROM '
          'shop_site_coordinator_bindings binding '
          'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ? '
          'AND client_fingerprint = ? AND client_signing_key_id = ? '
          'AND enrollment_evidence_digest = ? AND issued_at_millis <= ? '
          'AND expires_at_millis > ? AND NOT EXISTS ('
          'SELECT 1 FROM shop_site_coordinator_binding_revocations revoked '
          'WHERE revoked.target_binding_digest = binding.binding_digest) '
          "AND 'approve:' || binding.binding_digest = (SELECT latest.action || ':' || latest.binding_digest FROM ("
          'SELECT binding_digest, action, approval_generation FROM '
          'shop_site_coordinator_bindings WHERE workspace_id = ? AND site_id = ? '
          'AND client_device_id = ? UNION ALL SELECT target_binding_digest, '
          'action, approval_generation FROM shop_site_coordinator_binding_revocations '
          'WHERE workspace_id = ? AND site_id = ? AND client_device_id = ?) latest '
          'ORDER BY latest.approval_generation DESC LIMIT 1)',
          variables: [
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(command.deviceId),
            Variable<String>(clientFingerprint),
            Variable<String>(command.signingKeyId),
            Variable<String>(enrollmentDigest),
            Variable<int>(commandIssuedAt),
            Variable<int>(commandIssuedAt),
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(command.deviceId),
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(command.deviceId),
          ],
        )
        .get();
    if (bindingRows.length != 1) {
      throw StateError('connected_site_cloud_binding_evidence_unavailable');
    }
    final binding = bindingRows.single;
    final bindingDigest = binding.read<String>('binding_digest');
    _requireCanonicalCoordinatorBinding(
      binding.read<String>('evidence_json'),
      bindingDigest: bindingDigest,
      enrollmentEvidenceDigest: enrollmentDigest,
      command: command,
      clientFingerprint: clientFingerprint,
    );
    final lease = OfflineStaffLeaseV1.fromJson(
      jsonDecode(leaseRow.read<String>('lease_json')),
    );
    return ConnectedSiteCloudProofV1.signed(
      command: command,
      lease: lease,
      clientFingerprint: clientFingerprint,
      enrollmentEvidenceDigest: enrollmentDigest,
      coordinatorBindingDigest: bindingDigest,
      authorityPayloadDigest: leaseRow.read<String>('issuer_evidence_digest'),
      eventBinding: eventBinding,
    );
  }

  void _requireCanonicalEnrollmentEvidence(
    String encoded, {
    required String enrollmentDigest,
    required SiteCommandV1 command,
    required String clientFingerprint,
  }) {
    final decoded = jsonDecode(encoded);
    if (decoded is! Map || canonicalConnectedSiteJson(decoded) != encoded) {
      throw StateError('connected_site_enrollment_evidence_invalid');
    }
    final evidence = Map<String, Object?>.from(decoded);
    final signingPayload = Map<String, Object?>.from(evidence)
      ..remove('signature')
      ..remove('evidenceDigest');
    if (evidence['schema'] != 'supermega.shop.owner-enrollment-evidence.v1' ||
        evidence['action'] != 'approve' ||
        evidence['evidenceDigest'] != enrollmentDigest ||
        connectedSiteSha256(signingPayload) != enrollmentDigest ||
        evidence['tenantId'] != command.workspaceId ||
        evidence['siteId'] != command.siteId ||
        evidence['deviceId'] != command.deviceId ||
        evidence['clientFingerprint'] != clientFingerprint) {
      throw StateError('connected_site_enrollment_evidence_invalid');
    }
  }

  void _requireCanonicalCoordinatorBinding(
    String encoded, {
    required String bindingDigest,
    required String enrollmentEvidenceDigest,
    required SiteCommandV1 command,
    required String clientFingerprint,
  }) {
    final decoded = jsonDecode(encoded);
    if (decoded is! Map ||
        canonicalConnectedSiteJson(decoded) != encoded ||
        connectedSiteSha256(decoded) != bindingDigest ||
        decoded['schema'] !=
            'supermega.connected-site.coordinator-approval.v1' ||
        decoded['action'] != 'approve' ||
        decoded['workspaceId'] != command.workspaceId ||
        decoded['siteId'] != command.siteId ||
        decoded['enrollmentEvidenceDigest'] != enrollmentEvidenceDigest ||
        decoded['clientDeviceId'] != command.deviceId ||
        decoded['clientFingerprint'] != clientFingerprint ||
        decoded['clientSigningKeyId'] != command.signingKeyId) {
      throw StateError('connected_site_coordinator_binding_invalid');
    }
  }

  Future<_CommandMapping> _mapping(SiteCommandV1 command) async {
    if ({
      shopCafeOrderPutCommandType,
      shopCafeOrderStateCommandType,
      shopCafeOrderCancelCommandType,
      shopCafeKitchenStatusCommandType,
    }.contains(command.commandType)) {
      return _cafeMapping(command);
    }
    final isReserve = switch (command.commandType) {
      shopRetailStockReserveCommandType ||
      shopCafeStockReserveCommandType => true,
      shopRetailStockReleaseCommandType ||
      shopCafeStockReleaseCommandType => false,
      _ => throw StateError('Connected-site command type is unsupported.'),
    };
    final workflow = switch (command.commandType) {
      shopRetailStockReserveCommandType || shopRetailStockReleaseCommandType =>
        ConnectedStockWorkflowType.retailCart,
      shopCafeStockReserveCommandType ||
      shopCafeStockReleaseCommandType => ConnectedStockWorkflowType.cafeOrder,
      _ => throw StateError('Connected-site command type is unsupported.'),
    };
    final capability = workflow == ConnectedStockWorkflowType.retailCart
        ? ShopStaffCapability.counterSale
        : ShopStaffCapability.cafeOrderWrite;
    if (command.aggregateType != workflow.name) {
      throw StateError('Connected-site command workflow is invalid.');
    }
    if (isReserve) {
      final reservation = ConnectedStockReservationV1.fromJson(
        command.payload['reservation'],
      );
      if (command.payload['contract'] !=
              'supermega.shop.connected-stock-reserve.v1' ||
          command.payload.length != 2 ||
          reservation.workspaceId != command.workspaceId ||
          reservation.siteId != command.siteId ||
          reservation.actorId != command.actorId ||
          reservation.deviceId != command.deviceId ||
          reservation.workflowType != workflow ||
          reservation.capability != capability ||
          reservation.subjectId != command.aggregateId) {
        throw StateError('Connected-site reserve payload is invalid.');
      }
      return _CommandMapping(
        capability: capability,
        eventType: shopConnectedStockReservedEventType,
        auditAction: 'shop.connected_stock.reserve',
        reservation: reservation,
      );
    }
    if (command.payload['contract'] !=
            'supermega.shop.connected-stock-release.v1' ||
        command.payload.length != 5 ||
        command.payload['reservationId'] is! String ||
        command.payload['expectedReservationDigest'] is! String ||
        command.payload['targetState'] != 'released' ||
        command.payload['reason'] is! String) {
      throw StateError('Connected-site release payload is invalid.');
    }
    final reservationId = command.payload['reservationId']! as String;
    final expectedDigest =
        command.payload['expectedReservationDigest']! as String;
    final stored = await database
        .customSelect(
          'SELECT reservation_json FROM '
          'shop_connected_stock_reservation_headers '
          'WHERE reservation_id = ? AND tenant_id = ? AND site_id = ? '
          'AND actor_id = ? AND device_id = ? AND workflow_type = ? '
          'AND subject_id = ? AND capability = ?',
          variables: [
            Variable<String>(reservationId),
            Variable<String>(command.workspaceId),
            Variable<String>(command.siteId),
            Variable<String>(command.actorId),
            Variable<String>(command.deviceId),
            Variable<String>(workflow.name),
            Variable<String>(command.aggregateId),
            Variable<String>(capability.name),
          ],
        )
        .getSingleOrNull();
    if (stored == null) {
      throw StateError('Connected-site release scope is invalid.');
    }
    final reservation = ConnectedStockReservationV1.fromJson(
      jsonDecode(stored.read<String>('reservation_json')),
    );
    if (reservation.workspaceId != command.workspaceId ||
        reservation.siteId != command.siteId ||
        reservation.actorId != command.actorId ||
        reservation.deviceId != command.deviceId ||
        reservation.workflowType != workflow ||
        reservation.subjectId != command.aggregateId ||
        reservation.capability != capability ||
        reservation.reservationDigest != expectedDigest) {
      throw StateError('Connected-site release scope is invalid.');
    }
    return _CommandMapping(
      capability: capability,
      eventType: shopConnectedStockReleasedEventType,
      auditAction: 'shop.connected_stock.release',
      lifecycle: ShopConnectedStockReservationLifecycleInput.release(
        reservationId: reservationId,
        expectedReservationDigest: expectedDigest,
        reason: command.payload['reason']! as String,
      ),
    );
  }

  _CommandMapping _cafeMapping(SiteCommandV1 command) {
    final store = cafeStore;
    if (store == null) {
      throw StateError('Connected café projection is unavailable.');
    }
    if (command.aggregateType != 'cafeOrder') {
      throw StateError('Connected café aggregate type is invalid.');
    }
    final capability = command.commandType == shopCafeKitchenStatusCommandType
        ? ShopStaffCapability.cafeKitchenStatus
        : ShopStaffCapability.cafeOrderWrite;
    switch (command.commandType) {
      case shopCafeOrderPutCommandType:
        _requireExactPayload(command.payload, {
          'contract',
          'command',
          'reservationBinding',
        }, _shopCafeOrderPutPayloadContract);
        final cafeCommand = CafeOrderCommand.fromJson(
          command.payload['command'],
        );
        if (cafeCommand.id != command.commandId ||
            cafeCommand.ticketId != command.aggregateId) {
          throw StateError('Connected café order payload is invalid.');
        }
        final reservationRequirement = _cafeReservationRequirement(
          command.payload['reservationBinding'],
          cafeCommand: cafeCommand,
        );
        const eventType = 'shop.cafe_order.put.v1';
        const auditAction = 'shop.cafe_order.put';
        final context = _cafeContext(
          command,
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
        );
        return _CommandMapping(
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
          reservationRequirement: reservationRequirement,
          acceptedProjection: () => _projectCafe(
            () => store.applyConnectedCommandProjection(
              cafeCommand,
              cafeModifierCatalog,
              context,
            ),
          ),
        );
      case shopCafeOrderStateCommandType:
        _requireExactPayload(command.payload, {
          'contract',
          'orderId',
          'operationId',
          'expectedStateRevision',
          'fromState',
          'toState',
        }, _shopCafeOrderStatePayloadContract);
        final orderId = command.payload['orderId'];
        final operationId = command.payload['operationId'];
        final revision = command.payload['expectedStateRevision'];
        final from = command.payload['fromState'];
        final to = command.payload['toState'];
        if (orderId != command.aggregateId ||
            operationId != command.commandId ||
            revision is! int ||
            revision < 0 ||
            !((from == 'open' && to == 'held') ||
                (from == 'held' && to == 'open'))) {
          throw StateError('Connected café state payload is invalid.');
        }
        const eventType = 'shop.cafe_order.state.v1';
        const auditAction = 'shop.cafe_order.state';
        final context = _cafeContext(
          command,
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
        );
        return _CommandMapping(
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
          acceptedProjection: () => _projectCafe(
            () => store.transitionConnected(
              orderId: orderId as String,
              operationId: operationId as String,
              expectedStateRevision: revision,
              fromState: from as String,
              toState: to as String,
              context: context,
            ),
          ),
        );
      case shopCafeOrderCancelCommandType:
        _requireExactPayload(command.payload, {
          'contract',
          'orderId',
          'operationId',
          'expectedStateRevision',
          'reservationBinding',
        }, _shopCafeOrderCancelPayloadContract);
        final orderId = command.payload['orderId'];
        final operationId = command.payload['operationId'];
        final revision = command.payload['expectedStateRevision'];
        if (orderId != command.aggregateId ||
            operationId != command.commandId ||
            revision is! int ||
            revision < 0) {
          throw StateError('Connected café cancellation payload is invalid.');
        }
        final reservationRequirement = _cafeReservationRequirement(
          command.payload['reservationBinding'],
          releaseOnAccepted: true,
          requiredPriorEventType: 'shop.cafe_order.put.v1',
        );
        const eventType = 'shop.cafe_order.cancel.v1';
        const auditAction = 'shop.cafe_order.cancel';
        final context = _cafeContext(
          command,
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
        );
        return _CommandMapping(
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
          reservationRequirement: reservationRequirement,
          acceptedProjection: () => _projectCafe(
            () => store.cancelConnected(
              orderId: orderId as String,
              operationId: operationId as String,
              expectedStateRevision: revision,
              context: context,
            ),
          ),
        );
      case shopCafeKitchenStatusCommandType:
        _requireExactPayload(command.payload, {
          'contract',
          'orderId',
          'lineId',
          'operationId',
          'expectedTicketVersion',
          'expectedStatus',
        }, _shopCafeKitchenStatusPayloadContract);
        final orderId = command.payload['orderId'];
        final lineId = command.payload['lineId'];
        final operationId = command.payload['operationId'];
        final version = command.payload['expectedTicketVersion'];
        final status = command.payload['expectedStatus'];
        if (orderId != command.aggregateId ||
            operationId != command.commandId ||
            lineId is! String ||
            version is! int ||
            version < 1 ||
            status is! String) {
          throw StateError('Connected café kitchen payload is invalid.');
        }
        const eventType = 'shop.cafe_kitchen.status.v1';
        const auditAction = 'shop.cafe_kitchen.status';
        final context = _cafeContext(
          command,
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
        );
        return _CommandMapping(
          capability: capability,
          eventType: eventType,
          auditAction: auditAction,
          acceptedProjection: () => _projectCafe(
            () => store.advanceKitchenStatusConnected(
              orderId: orderId as String,
              lineId: lineId,
              operationId: operationId as String,
              expectedTicketVersion: version,
              expectedStatus: status,
              context: context,
            ),
          ),
        );
      default:
        throw StateError('Connected café command type is unsupported.');
    }
  }

  ShopConnectedCafeProjectionContext _cafeContext(
    SiteCommandV1 command, {
    required ShopStaffCapability capability,
    required String eventType,
    required String auditAction,
  }) => ShopConnectedCafeProjectionContext(
    commandId: command.commandId,
    tenantId: command.workspaceId,
    siteId: command.siteId,
    actorId: command.actorId,
    deviceId: command.deviceId,
    aggregateId: command.aggregateId,
    capability: capability,
    commandType: command.commandType,
    eventType: eventType,
    auditAction: auditAction,
    commandDigest: command.commandDigest,
  );

  ShopConnectedStockReservationRequirement _cafeReservationRequirement(
    Object? value, {
    CafeOrderCommand? cafeCommand,
    bool releaseOnAccepted = false,
    String? requiredPriorEventType,
  }) {
    if (value is! Map ||
        value.length != 5 ||
        value.keys.toSet().difference({
          'reservationId',
          'reservationDigest',
          'reservationCommandId',
          'reservationAckDigest',
          'basketDigest',
        }).isNotEmpty) {
      throw StateError('Connected café reservation binding is invalid.');
    }
    final json = Map<String, Object?>.from(value);
    final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$');
    final digest = RegExp(r'^[0-9a-f]{64}$');
    final reservationId = json['reservationId'];
    final reservationDigest = json['reservationDigest'];
    final reservationCommandId = json['reservationCommandId'];
    final reservationAckDigest = json['reservationAckDigest'];
    final basketDigest = json['basketDigest'];
    if (reservationId is! String ||
        !id.hasMatch(reservationId) ||
        reservationCommandId is! String ||
        !id.hasMatch(reservationCommandId) ||
        reservationDigest is! String ||
        !digest.hasMatch(reservationDigest) ||
        reservationAckDigest is! String ||
        !digest.hasMatch(reservationAckDigest) ||
        basketDigest is! String ||
        !digest.hasMatch(basketDigest)) {
      throw StateError('Connected café reservation binding is invalid.');
    }
    if (cafeCommand != null) {
      final quantities = <String, int>{};
      for (final line in cafeCommand.lines) {
        quantities.update(
          line.productId,
          (quantity) => quantity + line.quantity,
          ifAbsent: () => line.quantity,
        );
      }
      final productIds = quantities.keys.toList()..sort();
      final expectedBasketDigest = connectedSiteSha256({
        'schemaVersion': connectedStockReservationSchemaVersion,
        'lines': [
          for (final productId in productIds)
            {'productId': productId, 'quantity': quantities[productId]!},
        ],
      });
      if (basketDigest != expectedBasketDigest) {
        throw StateError('Connected café reservation basket is invalid.');
      }
    }
    return ShopConnectedStockReservationRequirement(
      reservationId: reservationId,
      reservationDigest: reservationDigest,
      reservationCommandId: reservationCommandId,
      reservationAckDigest: reservationAckDigest,
      requiredBasketDigest: basketDigest,
      releaseOnAccepted: releaseOnAccepted,
      requiredPriorEventType: requiredPriorEventType,
    );
  }

  Future<void> _projectCafe(Future<Object?> Function() projection) async {
    try {
      await projection();
    } on ShopCafeConnectedConflictException catch (conflict) {
      throw ShopConnectedProjectionConflict(conflict.code);
    }
  }

  void _requireExactPayload(
    Map<String, Object?> payload,
    Set<String> keys,
    String contract,
  ) {
    if (payload.length != keys.length ||
        !payload.keys.toSet().containsAll(keys) ||
        payload.keys.toSet().difference(keys).isNotEmpty ||
        payload['contract'] != contract) {
      throw StateError('Connected café payload shape is invalid.');
    }
  }
}

class _CommandMapping {
  const _CommandMapping({
    required this.capability,
    required this.eventType,
    required this.auditAction,
    this.reservation,
    this.lifecycle,
    this.reservationRequirement,
    this.acceptedProjection,
  });

  final ShopStaffCapability capability;
  final String eventType;
  final String auditAction;
  final ConnectedStockReservationV1? reservation;
  final ShopConnectedStockReservationLifecycleInput? lifecycle;
  final ShopConnectedStockReservationRequirement? reservationRequirement;
  final Future<void> Function()? acceptedProjection;
}

/// Site-scoped, enrolled-client replication reader over immutable event rows.
class ShopConnectedSiteDatabaseReplicationReader
    implements SiteReplicationReader {
  const ShopConnectedSiteDatabaseReplicationReader({
    required this.database,
    required this.workspaceId,
    required this.siteId,
    this.pageSize = 100,
  });

  final ShopDatabase database;
  final String workspaceId;
  final String siteId;
  final int pageSize;

  @override
  Future<SiteDeltaV1> readDelta(
    String clientFingerprint,
    int afterCursor,
  ) async {
    await _requireActiveClient(clientFingerprint);
    final rows = await database
        .customSelect(
          'SELECT replica_sequence, event_json, event_digest '
          'FROM shop_site_replica_event_envelopes '
          'WHERE tenant_id = ? AND site_id = ? AND replica_sequence > ? '
          'ORDER BY replica_sequence LIMIT ?',
          variables: [
            Variable(workspaceId),
            Variable(siteId),
            Variable(afterCursor),
            Variable(pageSize),
          ],
        )
        .get();
    final replicaEvents = <Map<String, Object?>>[];
    for (final row in rows) {
      final envelope = (jsonDecode(row.read<String>('event_json')) as Map)
          .cast<String, Object?>();
      if (envelope['cursor'] != row.read<int>('replica_sequence')) {
        throw StateError('Connected replica cursor evidence is invalid.');
      }
      replicaEvents.add(envelope);
    }
    return SiteDeltaV1(
      workspaceId: workspaceId,
      siteId: siteId,
      afterCursor: afterCursor,
      nextCursor: rows.isEmpty
          ? afterCursor
          : rows.last.read<int>('replica_sequence'),
      events: replicaEvents,
    );
  }

  @override
  Future<SiteSnapshotV1> readSnapshot(String clientFingerprint) async {
    await _requireActiveClient(clientFingerprint);
    final projections = await database.readConnectedReplicaProjectionV2(
      tenantId: workspaceId,
      siteId: siteId,
    );
    final cursorRow = await database
        .customSelect(
          'SELECT COALESCE(MAX(replica_sequence), 0) AS cursor '
          'FROM shop_site_replica_event_envelopes '
          'WHERE tenant_id = ? AND site_id = ?',
          variables: [Variable<String>(workspaceId), Variable<String>(siteId)],
        )
        .getSingle();
    final cursor = cursorRow.read<int>('cursor');
    final unsigned = <String, Object?>{
      'protocolVersion': connectedSiteProtocolVersion,
      'workspaceId': workspaceId,
      'siteId': siteId,
      'version': 2,
      'continuationCursor': cursor,
      'projections': projections,
    };
    return SiteSnapshotV1(
      workspaceId: workspaceId,
      siteId: siteId,
      version: 2,
      continuationCursor: cursor,
      projections: projections,
      checkpointDigest: connectedSiteSha256(unsigned),
    );
  }

  Future<void> _requireActiveClient(String clientFingerprint) async {
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(clientFingerprint)) {
      throw StateError('Connected-site client fingerprint is invalid.');
    }
    final row = await database
        .customSelect(
          'SELECT 1 FROM shop_site_devices WHERE tenant_id = ? AND site_id = ? '
          "AND public_key_fingerprint = ? AND state = 'active'",
          variables: [
            Variable<String>(workspaceId),
            Variable<String>(siteId),
            Variable<String>(clientFingerprint),
          ],
        )
        .getSingleOrNull();
    if (row == null) {
      throw StateError('Connected-site replication client is not active.');
    }
  }
}
