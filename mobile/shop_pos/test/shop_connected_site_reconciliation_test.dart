import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';

void main() {
  final now = DateTime.utc(2026, 10, 31, 12);

  group('connected-site reconciliation', () {
    test('is default-off and unavailable transport fails closed', () async {
      final fixture = _Fixture(now: now);
      final disabled = fixture.engine(runtimeEnabled: false);

      await expectLater(
        disabled.reconcile(scope: fixture.scopeA, now: now),
        throwsA(_reconciliationCode('connected_site_reconciliation_disabled')),
      );
      expect(fixture.authority.calls, 0);

      final unavailable = fixture.engine(
        runtimeEnabled: true,
        transport: const UnavailableConnectedSiteCloudTransport(),
      );
      await expectLater(
        unavailable.reconcile(scope: fixture.scopeA, now: now),
        throwsA(_reconciliationCode('connected_site_transport_unavailable')),
      );
      expect(fixture.repository.cursor, 0);
      expect(fixture.repository.persistCalls, 0);
      expect(fixture.repository.events, isNotEmpty);
    });

    test(
      'accepted and replayed acknowledgements persist exactly once',
      () async {
        final fixture = _Fixture(now: now, eventCount: 2);
        final alreadyPersisted = fixture.repository.events[1].commandId;
        fixture.repository.acknowledgedCommandIds.add(alreadyPersisted);
        fixture.transport.handler = (request) async => fixture.response(
          request,
          acknowledgements: [
            _ack(request.events[0], SiteCommandAckState.accepted),
            _ack(request.events[1], SiteCommandAckState.replayed),
          ],
        );

        final result = await fixture
            .engine(runtimeEnabled: true)
            .reconcile(scope: fixture.scopeA, now: now);

        expect(result.uploadedEventCount, 2);
        expect(result.newAcknowledgementCount, 1);
        expect(result.newConflictCount, 0);
        expect(fixture.repository.acknowledgedCommandIds, hasLength(2));
        expect(fixture.repository.cursor, 2);
        expect(fixture.repository.persistCalls, 1);
        expect(fixture.applier.calls, 1);
        expect(fixture.callOrder, ['authority-delta', 'cloud-outcome']);
      },
    );

    test('rejects a response from a second synthetic tenant', () async {
      final fixture = _Fixture(now: now);
      fixture.transport.handler = (request) async => ConnectedSiteCloudResponse(
        scope: fixture.scopeB,
        deviceId: fixture.scopeB.deviceId,
        afterCursor: request.afterCursor,
        nextCursor: request.afterCursor + request.events.length,
        acknowledgements: [
          for (final event in request.events)
            _ack(event, SiteCommandAckState.accepted),
        ],
        conflicts: const [],
        authorityDelta: fixture.delta(scope: fixture.scopeB),
      );

      await expectLater(
        fixture
            .engine(runtimeEnabled: true)
            .reconcile(scope: fixture.scopeA, now: now),
        throwsA(_reconciliationCode('connected_site_scope_mismatch')),
      );
      expect(fixture.repository.cursor, 0);
      expect(fixture.repository.persistCalls, 0);
      expect(fixture.applier.calls, 0);
    });

    test(
      'rejects an acknowledgement with a substituted event digest',
      () async {
        final fixture = _Fixture(now: now);
        fixture.transport.handler = (request) async => fixture.response(
          request,
          acknowledgements: [
            SiteCommandAckV1(
              commandId: request.events.single.commandId,
              commandDigest: request.events.single.commandDigest,
              state: SiteCommandAckState.accepted,
              canonicalVersion: 1,
              eventDigest: 'f' * 64,
            ),
          ],
        );

        await expectLater(
          fixture
              .engine(runtimeEnabled: true)
              .reconcile(scope: fixture.scopeA, now: now),
          throwsA(_reconciliationCode('connected_site_ack_binding_mismatch')),
        );
        expect(fixture.repository.persistCalls, 0);
        expect(fixture.applier.calls, 0);
      },
    );

    test(
      'rejects an acknowledgement for a different aggregate version',
      () async {
        final fixture = _Fixture(now: now);
        fixture.transport.handler = (request) async {
          final event = request.events.single;
          return fixture.response(
            request,
            acknowledgements: [
              SiteCommandAckV1(
                commandId: event.commandId,
                commandDigest: event.commandDigest,
                state: SiteCommandAckState.accepted,
                canonicalVersion: 2,
                eventDigest: event.eventDigest,
              ),
            ],
          );
        };

        await expectLater(
          fixture
              .engine(runtimeEnabled: true)
              .reconcile(scope: fixture.scopeA, now: now),
          throwsA(_reconciliationCode('connected_site_ack_binding_mismatch')),
        );
        expect(fixture.repository.persistCalls, 0);
      },
    );

    test(
      'rejects missing or out-of-order local events before upload',
      () async {
        final missing = _Fixture(now: now);
        missing.repository.events[0] = _event(
          scope: missing.scopeA,
          cursor: 2,
          sequence: 1,
        );

        await expectLater(
          missing
              .engine(runtimeEnabled: true)
              .reconcile(scope: missing.scopeA, now: now),
          throwsA(_reconciliationCode('connected_site_event_chain_invalid')),
        );
        expect(missing.transport.calls, 0);

        final outOfOrder = _Fixture(now: now, eventCount: 2);
        final first = outOfOrder.repository.events[0];
        outOfOrder.repository.events[0] = outOfOrder.repository.events[1];
        outOfOrder.repository.events[1] = first;
        await expectLater(
          outOfOrder
              .engine(runtimeEnabled: true)
              .reconcile(scope: outOfOrder.scopeA, now: now),
          throwsA(_reconciliationCode('connected_site_event_chain_invalid')),
        );
        expect(outOfOrder.transport.calls, 0);
      },
    );

    test('deep-copies and freezes nested event payloads canonically', () {
      final fixture = _Fixture(now: now, eventCount: 0);
      final lines = <Object?>[
        <String, Object?>{'sku': 'sku-1', 'quantity': 1},
      ];
      final details = <String, Object?>{'lines': lines};
      final event = <String, Object?>{
        'eventId': 'event-nested',
        'workspaceId': fixture.scopeA.workspaceId,
        'siteId': fixture.scopeA.siteId,
        'aggregateType': 'sale',
        'aggregateId': 'sale-nested',
        'aggregateVersion': 1,
        'eventType': 'sale.accepted',
        'occurredAt': '2026-10-31T12:00:00.000Z',
        'payload': <String, Object?>{'details': details},
      };
      final pending = ConnectedSitePendingEvent(
        cursor: 1,
        commandId: 'command-nested',
        commandDigest: connectedSiteSha256({'commandId': 'command-nested'}),
        event: event,
        eventDigest: connectedSiteSha256(event),
      );

      (lines.single as Map<String, Object?>)['quantity'] = 99;
      lines.add(<String, Object?>{'sku': 'sku-2', 'quantity': 1});
      details['lateMutation'] = true;

      final storedPayload = pending.event['payload']! as Map<String, Object?>;
      final storedDetails = storedPayload['details']! as Map<String, Object?>;
      final storedLines = storedDetails['lines']! as List<Object?>;
      expect(storedDetails, isNot(contains('lateMutation')));
      expect(storedLines, hasLength(1));
      expect((storedLines.single as Map<String, Object?>)['quantity'], 1);
      expect(() => storedDetails['forbidden'] = true, throwsUnsupportedError);
      expect(() => storedLines.add(null), throwsUnsupportedError);
    });

    test('rejects an incomplete event envelope despite a matching digest', () {
      final fixture = _Fixture(now: now, eventCount: 0);
      final incomplete = <String, Object?>{
        'eventId': 'event-incomplete',
        'workspaceId': fixture.scopeA.workspaceId,
        'siteId': fixture.scopeA.siteId,
        'aggregateType': 'sale',
        'aggregateId': 'sale-incomplete',
        'aggregateVersion': 1,
        // eventType is deliberately absent.
        'occurredAt': '2026-10-31T12:00:00.000Z',
        'payload': <String, Object?>{},
      };

      expect(
        () => ConnectedSitePendingEvent(
          cursor: 1,
          commandId: 'command-incomplete',
          commandDigest: connectedSiteSha256({
            'commandId': 'command-incomplete',
          }),
          event: incomplete,
          eventDigest: connectedSiteSha256(incomplete),
        ),
        throwsA(
          isA<FormatException>().having(
            (error) => error.message,
            'message',
            'connected_site_event_envelope_shape',
          ),
        ),
      );
    });

    test('quarantines a genuine conflict without last-write-wins', () async {
      final fixture = _Fixture(now: now);
      fixture.transport.handler = (request) async => fixture.response(
        request,
        conflicts: [_conflict(fixture.scopeA, request.events.single)],
      );

      final result = await fixture
          .engine(runtimeEnabled: true)
          .reconcile(scope: fixture.scopeA, now: now);

      expect(result.newConflictCount, 1);
      expect(result.newAcknowledgementCount, 0);
      expect(fixture.repository.quarantinedCommandIds, {
        fixture.repository.events.single.commandId,
      });
      expect(fixture.repository.financialRecords, ['sale-original']);
    });

    test('rejects a conflict bound to another aggregate', () async {
      final fixture = _Fixture(now: now);
      fixture.transport.handler = (request) async {
        final event = request.events.single;
        return fixture.response(
          request,
          conflicts: [
            SiteConflictV1(
              workspaceId: fixture.scopeA.workspaceId,
              siteId: fixture.scopeA.siteId,
              conflictId: 'conflict-substituted',
              commandId: event.commandId,
              commandDigest: event.commandDigest,
              aggregateType: 'sale',
              aggregateId: 'sale-substituted',
              expectedVersion: 0,
              actualVersion: 2,
              reason: 'aggregate_version_changed',
              createdAt: '2026-10-31T12:00:01.000Z',
              state: SiteConflictState.quarantined,
            ),
          ],
        );
      };

      await expectLater(
        fixture
            .engine(runtimeEnabled: true)
            .reconcile(scope: fixture.scopeA, now: now),
        throwsA(
          _reconciliationCode('connected_site_conflict_binding_mismatch'),
        ),
      );
      expect(fixture.repository.persistCalls, 0);
    });

    test('rejects a conflict with a substituted expected version', () async {
      final fixture = _Fixture(now: now);
      fixture.transport.handler = (request) async {
        final event = request.events.single;
        return fixture.response(
          request,
          conflicts: [
            SiteConflictV1(
              workspaceId: fixture.scopeA.workspaceId,
              siteId: fixture.scopeA.siteId,
              conflictId: 'conflict-version',
              commandId: event.commandId,
              commandDigest: event.commandDigest,
              aggregateType: 'sale',
              aggregateId: 'sale-1',
              expectedVersion: 1,
              actualVersion: 2,
              reason: 'aggregate_version_changed',
              createdAt: '2026-10-31T12:00:01.000Z',
              state: SiteConflictState.quarantined,
            ),
          ],
        );
      };

      await expectLater(
        fixture
            .engine(runtimeEnabled: true)
            .reconcile(scope: fixture.scopeA, now: now),
        throwsA(
          _reconciliationCode('connected_site_conflict_binding_mismatch'),
        ),
      );
      expect(fixture.repository.persistCalls, 0);
    });

    test(
      'revocation is observed before pending work is read or uploaded',
      () async {
        final fixture = _Fixture(now: now);
        fixture.authority.active = false;

        await expectLater(
          fixture
              .engine(runtimeEnabled: true)
              .reconcile(scope: fixture.scopeA, now: now),
          throwsA(_reconciliationCode('connected_site_authority_inactive')),
        );
        expect(fixture.repository.cursorReads, 0);
        expect(fixture.repository.pendingReads, 0);
        expect(fixture.transport.calls, 0);
      },
    );

    test(
      'rejects an authority delta older than refreshed revocation',
      () async {
        final fixture = _Fixture(now: now);
        fixture.authority.revocationGeneration = 5;
        fixture.transport.handler = (request) async => fixture.response(
          request,
          acknowledgements: [
            _ack(request.events.single, SiteCommandAckState.accepted),
          ],
        );

        await expectLater(
          fixture
              .engine(runtimeEnabled: true)
              .reconcile(scope: fixture.scopeA, now: now),
          throwsA(
            _reconciliationCode('connected_site_response_binding_mismatch'),
          ),
        );
        expect(fixture.applier.calls, 0);
        expect(fixture.repository.persistCalls, 0);
      },
    );

    test('transport failure retains all pending work', () async {
      final fixture = _Fixture(now: now, eventCount: 2);
      fixture.transport.handler = (_) async => throw StateError('offline');

      await expectLater(
        fixture
            .engine(runtimeEnabled: true)
            .reconcile(scope: fixture.scopeA, now: now),
        throwsStateError,
      );
      expect(fixture.repository.cursor, 0);
      expect(fixture.repository.events, hasLength(2));
      expect(fixture.repository.persistCalls, 0);
      expect(fixture.applier.calls, 0);
    });

    test(
      'authoritative download interface cannot rewrite financial records',
      () async {
        final fixture = _Fixture(now: now);
        fixture.transport.handler = (request) async => fixture.response(
          request,
          acknowledgements: [
            _ack(request.events.single, SiteCommandAckState.accepted),
          ],
        );

        await fixture
            .engine(runtimeEnabled: true)
            .reconcile(scope: fixture.scopeA, now: now);

        expect(fixture.applier.lastDelta?.configurationVersion, 7);
        expect(fixture.applier.lastDelta?.revocationGeneration, 4);
        expect(fixture.repository.financialRecords, ['sale-original']);
        expect(fixture.applier.financialRecords, ['sale-original']);
      },
    );

    test(
      'failed authoritative download leaves pending work retryable',
      () async {
        final fixture = _Fixture(now: now);
        fixture.applier.failure = StateError('configuration store unavailable');
        fixture.transport.handler = (request) async => fixture.response(
          request,
          acknowledgements: [
            _ack(request.events.single, SiteCommandAckState.accepted),
          ],
        );

        await expectLater(
          fixture
              .engine(runtimeEnabled: true)
              .reconcile(scope: fixture.scopeA, now: now),
          throwsStateError,
        );
        expect(fixture.repository.cursor, 0);
        expect(fixture.repository.persistCalls, 0);
        expect(fixture.repository.events, hasLength(1));
      },
    );

    test(
      'incomplete cloud disposition fails before any local mutation',
      () async {
        final fixture = _Fixture(now: now);
        fixture.transport.handler = (request) async =>
            fixture.response(request);

        await expectLater(
          fixture
              .engine(runtimeEnabled: true)
              .reconcile(scope: fixture.scopeA, now: now),
          throwsA(
            _reconciliationCode('connected_site_incomplete_cloud_response'),
          ),
        );
        expect(fixture.applier.calls, 0);
        expect(fixture.repository.persistCalls, 0);
      },
    );
  });
}

Matcher _reconciliationCode(String code) =>
    isA<ConnectedSiteReconciliationException>().having(
      (error) => error.code,
      'code',
      code,
    );

class _Fixture {
  _Fixture({required this.now, int eventCount = 1}) {
    authority = _Authority(now: now, scope: scopeA);
    repository = _Repository(callOrder: callOrder);
    repository.events.addAll([
      for (var index = 1; index <= eventCount; index += 1)
        _event(scope: scopeA, cursor: index, sequence: index),
    ]);
    transport = _Transport();
    applier = _DeltaApplier(callOrder: callOrder);
  }

  final DateTime now;
  final List<String> callOrder = [];
  final ConnectedSiteScope scopeA = ConnectedSiteScope(
    workspaceId: 'tenant-a',
    siteId: 'site-a',
    deviceId: 'device-a',
  );
  final ConnectedSiteScope scopeB = ConnectedSiteScope(
    workspaceId: 'tenant-b',
    siteId: 'site-b',
    deviceId: 'device-b',
  );
  late final _Authority authority;
  late final _Repository repository;
  late final _Transport transport;
  late final _DeltaApplier applier;

  ConnectedSiteReconciliationEngine engine({
    required bool runtimeEnabled,
    ConnectedSiteCloudTransport? transport,
  }) => ConnectedSiteReconciliationEngine(
    authority: authority,
    repository: repository,
    transport: transport ?? this.transport,
    authorityDeltaApplier: applier,
    runtimeEnabled: runtimeEnabled,
  );

  ConnectedSiteAuthorityDelta delta({ConnectedSiteScope? scope}) {
    final target = scope ?? scopeA;
    return ConnectedSiteAuthorityDelta(
      workspaceId: target.workspaceId,
      siteId: target.siteId,
      revocationGeneration: 4,
      membershipDigest: 'a' * 64,
      configurationVersion: 7,
      configurationDigest: 'b' * 64,
    );
  }

  ConnectedSiteCloudResponse response(
    ConnectedSiteUploadRequest request, {
    List<SiteCommandAckV1> acknowledgements = const [],
    List<SiteConflictV1> conflicts = const [],
  }) => ConnectedSiteCloudResponse(
    scope: request.scope,
    deviceId: request.scope.deviceId,
    afterCursor: request.afterCursor,
    nextCursor: request.afterCursor + request.events.length,
    acknowledgements: acknowledgements,
    conflicts: conflicts,
    authorityDelta: delta(),
  );
}

class _Authority implements ConnectedSiteAuthorityProvider {
  _Authority({required this.now, required this.scope});

  final DateTime now;
  final ConnectedSiteScope scope;
  bool active = true;
  int revocationGeneration = 4;
  int calls = 0;

  @override
  Future<ConnectedSiteAuthorityState> refresh(ConnectedSiteScope scope) async {
    calls += 1;
    return ConnectedSiteAuthorityState(
      scope: this.scope,
      active: active,
      sessionGeneration: 3,
      revocationGeneration: revocationGeneration,
      observedAt: now.subtract(const Duration(minutes: 1)),
      expiresAt: now.add(const Duration(days: 7)),
    );
  }
}

class _Repository implements ConnectedSiteEventRepository {
  _Repository({required this.callOrder});

  final List<String> callOrder;
  final List<ConnectedSitePendingEvent> events = [];
  final Set<String> acknowledgedCommandIds = {};
  final Set<String> quarantinedCommandIds = {};
  final List<String> financialRecords = ['sale-original'];
  int cursor = 0;
  int cursorReads = 0;
  int pendingReads = 0;
  int persistCalls = 0;

  @override
  Future<int> uploadCursor(ConnectedSiteScope scope) async {
    cursorReads += 1;
    return cursor;
  }

  @override
  Future<List<ConnectedSitePendingEvent>> pendingEvents(
    ConnectedSiteScope scope, {
    required int afterCursor,
    required int limit,
  }) async {
    pendingReads += 1;
    return events
        .where((event) => event.cursor > afterCursor)
        .take(limit)
        .toList();
  }

  @override
  Future<ConnectedSitePersistResult> persistCloudOutcome(
    ConnectedSiteScope scope,
    ConnectedSiteCloudOutcome outcome,
  ) async {
    persistCalls += 1;
    callOrder.add('cloud-outcome');
    if (outcome.afterCursor != cursor) {
      throw StateError('cursor changed');
    }
    var newAcks = 0;
    for (final ack in outcome.acknowledgements) {
      if (acknowledgedCommandIds.add(ack.commandId)) newAcks += 1;
    }
    var newConflicts = 0;
    for (final conflict in outcome.conflicts) {
      if (quarantinedCommandIds.add(conflict.commandId)) newConflicts += 1;
    }
    cursor = outcome.nextCursor;
    return ConnectedSitePersistResult(
      newAcknowledgementCount: newAcks,
      newConflictCount: newConflicts,
    );
  }
}

class _Transport implements ConnectedSiteCloudTransport {
  Future<ConnectedSiteCloudResponse> Function(ConnectedSiteUploadRequest)?
  handler;
  int calls = 0;

  @override
  Future<ConnectedSiteCloudResponse> reconcile(
    ConnectedSiteUploadRequest request,
  ) async {
    calls += 1;
    final active = handler;
    if (active == null) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_transport_unconfigured',
      );
    }
    return active(request);
  }
}

class _DeltaApplier implements ConnectedSiteAuthorityDeltaApplier {
  _DeltaApplier({required this.callOrder});

  final List<String> callOrder;
  final List<String> financialRecords = ['sale-original'];
  int calls = 0;
  ConnectedSiteAuthorityDelta? lastDelta;
  Object? failure;

  @override
  Future<void> apply(
    ConnectedSiteScope scope,
    ConnectedSiteAuthorityDelta delta,
  ) async {
    calls += 1;
    callOrder.add('authority-delta');
    lastDelta = delta;
    final currentFailure = failure;
    if (currentFailure != null) throw currentFailure;
  }
}

ConnectedSitePendingEvent _event({
  required ConnectedSiteScope scope,
  required int cursor,
  required int sequence,
}) {
  final commandId = 'command-$sequence';
  final event = <String, Object?>{
    'eventId': 'event-$sequence',
    'workspaceId': scope.workspaceId,
    'siteId': scope.siteId,
    'aggregateType': 'sale',
    'aggregateId': 'sale-$sequence',
    'aggregateVersion': sequence,
    'eventType': 'sale.accepted',
    'occurredAt': '2026-10-31T12:00:00.000Z',
    'payload': <String, Object?>{'totalMmk': sequence * 1000},
  };
  return ConnectedSitePendingEvent(
    cursor: cursor,
    commandId: commandId,
    commandDigest: connectedSiteSha256({'commandId': commandId}),
    event: event,
    eventDigest: connectedSiteSha256(event),
  );
}

SiteCommandAckV1 _ack(
  ConnectedSitePendingEvent event,
  SiteCommandAckState state,
) => SiteCommandAckV1(
  commandId: event.commandId,
  commandDigest: event.commandDigest,
  state: state,
  canonicalVersion: event.cursor,
  eventDigest: event.eventDigest,
);

SiteConflictV1 _conflict(
  ConnectedSiteScope scope,
  ConnectedSitePendingEvent event,
) => SiteConflictV1(
  workspaceId: scope.workspaceId,
  siteId: scope.siteId,
  conflictId: 'conflict-${event.cursor}',
  commandId: event.commandId,
  commandDigest: event.commandDigest,
  aggregateType: 'sale',
  aggregateId: 'sale-${event.cursor}',
  expectedVersion: (event.event['aggregateVersion']! as int) - 1,
  actualVersion: event.cursor + 1,
  reason: 'aggregate_version_changed',
  createdAt: '2026-10-31T12:00:01.000Z',
  state: SiteConflictState.quarantined,
);
