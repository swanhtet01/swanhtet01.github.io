import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_cloud_http.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

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
        authorityGeneration: request.authorityGeneration,
        authorityPayloadDigest: request.authorityPayloadDigest,
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
      final proof = _proof(fixture.scopeA, 'command-nested');
      final pending = ConnectedSitePendingEvent(
        cursor: 1,
        commandId: 'command-nested',
        commandDigest: proof.commandDigest,
        event: event,
        eventDigest: connectedSiteSha256(event),
        cloudProof: proof,
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
        () {
          final proof = _proof(fixture.scopeA, 'command-incomplete');
          return ConnectedSitePendingEvent(
            cursor: 1,
            commandId: 'command-incomplete',
            commandDigest: proof.commandDigest,
            event: incomplete,
            eventDigest: connectedSiteSha256(incomplete),
            cloudProof: proof,
          );
        },
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

  group('connected-site cloud wire', () {
    final scope = ConnectedSiteScope(
      workspaceId: 'tenant-a',
      siteId: 'site-a',
      deviceId: 'device-a',
    );

    test('cross-runtime golden drives accepted upload byte-exactly', () async {
      final text = File('test/fixtures/connected_site_cloud_wire_v1.json')
          .readAsStringSync()
          .trim();
      final golden = jsonDecode(text) as Map<String, dynamic>;
      expect(canonicalConnectedSiteJson(golden), text);
      expect(golden['contract'], 'supermega.connected-site-wire-golden.v1');
      final authority = golden['authorityResponse'] as Map<String, dynamic>;
      final payload = ConnectedSiteAuthorityPayloadV1.parse(
        canonicalBytes: authority['authorityPayloadBytes'] as String,
        signature: authority['authoritySignature'] as String,
      );
      expect(payload.workspaceId, 'workspace-a');
      expect(payload.members.single.role, ShopStaffRole.cashierCounter);
      expect(payload.payloadDigest, authority['authorityPayloadDigest']);
      final request = golden['reconcileRequest'] as Map<String, dynamic>;
      final response = golden['reconcileResponse'] as Map<String, dynamic>;
      expect(request['authorityPayloadDigest'], payload.payloadDigest);
      expect(response['authorityPayloadDigest'], payload.payloadDigest);
      final eventJson = (request['events'] as List).single as Map;
      final pending = ConnectedSitePendingEvent(
        cursor: eventJson['cursor'] as int,
        commandId: eventJson['commandId'] as String,
        commandDigest: eventJson['commandDigest'] as String,
        event: Map<String, Object?>.from(eventJson['event'] as Map),
        eventDigest: eventJson['eventDigest'] as String,
        cloudProof: ConnectedSiteCloudProofV1.fromJson(eventJson['cloudProof']),
      );
      final executor = _CloudExecutor()
        ..handler =
            ({
              required uri,
              required method,
              required headers,
              required body,
              required maxResponseBytes,
            }) async {
              if (method == 'GET') {
                return _cloudHttpJson(authority, effectiveUri: uri);
              }
              expect(utf8.decode(body), canonicalConnectedSiteJson(request));
              return _cloudHttpJson(response, effectiveUri: uri);
            };
      final client = ConnectedSiteCloudWireClient(
        baseUri: Uri.parse('https://cloud.example.invalid'),
        executor: executor,
        authorityVerifier: ShopConnectedSiteCloudAuthorityVerifier(
          verifier: _AcceptingSignatureVerifier(),
        ),
        authorityReceiptStore: _CloudAuthorityReceiptStore(),
        runtimeEnabled: true,
        now: () => now,
      );
      final refreshed = await client.refresh(
        ConnectedSiteScope(
          workspaceId: request['workspaceId'] as String,
          siteId: request['siteId'] as String,
          deviceId: request['deviceId'] as String,
        ),
      );
      final parsed = await client.reconcile(
        ConnectedSiteUploadRequest(
          scope: refreshed.scope,
          sessionGeneration: request['sessionGeneration'] as int,
          authorityGeneration: request['authorityGeneration'] as int,
          authorityPayloadDigest: request['authorityPayloadDigest'] as String,
          revocationGeneration: request['revocationGeneration'] as int,
          afterCursor: request['afterCursor'] as int,
          events: [pending],
        ),
      );
      expect(parsed.nextCursor, 1);
      expect(parsed.acknowledgements.single.commandId, 'command-1');
      expect(
        parsed.acknowledgements.single.state,
        SiteCommandAckState.accepted,
      );
    });

    test('remains default-off before authenticated execution', () async {
      final executor = _CloudExecutor();
      final client = ConnectedSiteCloudWireClient(
        baseUri: Uri.parse('https://cloud.example.invalid'),
        executor: executor,
        authorityVerifier: _CloudAuthorityVerifier(),
        authorityReceiptStore: _CloudAuthorityReceiptStore(),
      );

      await expectLater(
        client.refresh(scope),
        throwsA(_reconciliationCode('connected_site_cloud_wire_disabled')),
      );
      expect(executor.calls, 0);
    });

    test('requires a retained verified authority before upload', () async {
      final executor = _CloudExecutor();
      final client = ConnectedSiteCloudWireClient(
        baseUri: Uri.parse('https://cloud.example.invalid'),
        executor: executor,
        authorityVerifier: _CloudAuthorityVerifier(),
        authorityReceiptStore: _CloudAuthorityReceiptStore(),
        runtimeEnabled: true,
      );
      await expectLater(
        client.reconcile(
          ConnectedSiteUploadRequest(
            scope: scope,
            sessionGeneration: 1,
            authorityGeneration: 1,
            authorityPayloadDigest: 'a' * 64,
            revocationGeneration: 0,
            afterCursor: 0,
            events: const [],
          ),
        ),
        throwsA(
          _reconciliationCode(
            'connected_site_cloud_verified_authority_required',
          ),
        ),
      );
      expect(executor.calls, 0);
    });

    test(
      'verifies signed authority before canonical reconciliation upload',
      () async {
        final verifier = _CloudAuthorityVerifier();
        final event = _event(scope: scope, cursor: 1, sequence: 1);
        late final Map<String, Object?> authorityResponse;
        final executor = _CloudExecutor()
          ..handler =
              ({
                required uri,
                required method,
                required headers,
                required body,
                required maxResponseBytes,
              }) async {
                expect(maxResponseBytes, connectedSiteCloudMaximumBodyBytes);
                expect(headers, isNot(contains('authorization')));
                expect(headers, isNot(contains('cookie')));
                if (method == 'GET') {
                  authorityResponse = _cloudAuthorityResponse(scope);
                  return _cloudHttpJson(authorityResponse, effectiveUri: uri);
                }
                expect(uri.path, '/api/connected-site/v1/reconcile');
                final request = jsonDecode(utf8.decode(body)) as Map;
                expect(canonicalConnectedSiteJson(request), utf8.decode(body));
                expect(request['authorityGeneration'], 4);
                expect(request['events'], hasLength(1));
                expect(
                  (request['events'] as List).single,
                  isNot(contains('authorization')),
                );
                final response = <String, Object?>{
                  'contract': connectedSiteCloudReconcileResponseContract,
                  'protocolVersion': connectedSiteProtocolVersion,
                  'workspaceId': scope.workspaceId,
                  'siteId': scope.siteId,
                  'deviceId': scope.deviceId,
                  'authorityGeneration': 4,
                  'authorityPayloadDigest':
                      authorityResponse['authorityPayloadDigest'],
                  'afterCursor': 0,
                  'nextCursor': 1,
                  'acknowledgements': [
                    SiteCommandAckV1(
                      commandId: event.commandId,
                      commandDigest: event.commandDigest,
                      state: SiteCommandAckState.accepted,
                      canonicalVersion: 1,
                      eventDigest: event.eventDigest,
                    ).toJson(),
                  ],
                  'conflicts': <Object?>[],
                  'authorityDelta': <String, Object?>{
                    'workspaceId': scope.workspaceId,
                    'siteId': scope.siteId,
                    'revocationGeneration': 3,
                    'membershipDigest': connectedSiteSha256({
                      'revocationGeneration': 3,
                      'members': <Object?>[
                        <String, Object?>{
                          'actorId': 'actor-test',
                          'role': 'cashierCounter',
                          'capabilities': <Object?>['counterSale'],
                          'sessionGeneration': 3,
                        },
                      ],
                    }),
                    'configurationVersion': 6,
                    'configurationDigest': connectedSiteSha256({
                      'configurationVersion': 6,
                      'businessProfile': {
                        'schemaId': 'business-profile-v1',
                        'templateId': 'retail',
                        'templateVersion': 1,
                      },
                      'catalogReference': {
                        'catalogVersion': 1,
                        'catalogDigest': 'c' * 64,
                      },
                    }),
                  },
                };
                return _cloudHttpJson(response, effectiveUri: uri);
              };
        final client = ConnectedSiteCloudWireClient(
          baseUri: Uri.parse('https://cloud.example.invalid'),
          executor: executor,
          authorityVerifier: verifier,
          authorityReceiptStore: _CloudAuthorityReceiptStore(),
          runtimeEnabled: true,
          now: () => now,
        );

        final authority = await client.refresh(scope);
        expect(authority.authorityGeneration, 4);
        expect(authority.revocationGeneration, 3);
        expect(authority.observedAt, now);
        expect(authority.expiresAt, now.add(const Duration(minutes: 5)));
        expect(verifier.calls, 1);
        final response = await client.reconcile(
          ConnectedSiteUploadRequest(
            scope: scope,
            sessionGeneration: authority.sessionGeneration,
            authorityGeneration: authority.authorityGeneration,
            authorityPayloadDigest: authority.authorityPayloadDigest,
            revocationGeneration: authority.revocationGeneration,
            afterCursor: 0,
            events: [event],
          ),
        );

        expect(response.acknowledgements.single.commandId, event.commandId);
        expect(response.conflicts, isEmpty);
        expect(response.authorityDelta.revocationGeneration, 3);
        expect(executor.calls, 2);
      },
    );

    test(
      'rejects noncanonical, oversized and authority-substituted replies',
      () async {
        final cases = <ConnectedSiteAuthenticatedHttpResponse>[
          ConnectedSiteAuthenticatedHttpResponse(
            statusCode: 200,
            contentType: 'application/json',
            body: <int>[123, 34, 97, 34, 58, 49, 44, 34, 97, 34, 58, 50, 125],
            effectiveUri: _cloudAuthorityUri,
          ),
          ConnectedSiteAuthenticatedHttpResponse(
            statusCode: 200,
            contentType: 'application/json',
            body: List<int>.filled(2048, 120),
            effectiveUri: _cloudAuthorityUri,
          ),
          _cloudHttpJson(
            _cloudAuthorityResponse(scope, workspaceId: 'tenant-b'),
            effectiveUri: _cloudAuthorityUri,
          ),
          _cloudHttpJson(
            _cloudAuthorityResponse(scope),
            effectiveUri: Uri.parse(
              'https://redirect.example.invalid/authority',
            ),
          ),
        ];
        for (final response in cases) {
          final executor = _CloudExecutor()..response = response;
          final client = ConnectedSiteCloudWireClient(
            baseUri: Uri.parse('https://cloud.example.invalid'),
            executor: executor,
            authorityVerifier: _CloudAuthorityVerifier(),
            authorityReceiptStore: _CloudAuthorityReceiptStore(),
            runtimeEnabled: true,
            maximumBodyBytes: 1024,
            now: () => now,
          );
          await expectLater(
            client.refresh(scope),
            throwsA(isA<ConnectedSiteReconciliationException>()),
          );
        }
      },
    );

    test(
      'maps authentication and server failures without trusting bodies',
      () async {
        for (final entry in <int, String>{
          401: 'connected_site_cloud_authority_rejected',
          403: 'connected_site_cloud_authority_rejected',
          409: 'connected_site_cloud_conflict',
          413: 'connected_site_cloud_request_too_large',
          422: 'connected_site_cloud_request_invalid',
          429: 'connected_site_cloud_rate_limited',
          500: 'connected_site_cloud_unavailable',
        }.entries) {
          final executor = _CloudExecutor()
            ..response = ConnectedSiteAuthenticatedHttpResponse(
              statusCode: entry.key,
              contentType: 'text/plain',
              body: utf8.encode('untrusted server body'),
              effectiveUri: _cloudAuthorityUri,
            );
          final client = ConnectedSiteCloudWireClient(
            baseUri: Uri.parse('https://cloud.example.invalid'),
            executor: executor,
            authorityVerifier: _CloudAuthorityVerifier(),
            authorityReceiptStore: _CloudAuthorityReceiptStore(),
            runtimeEnabled: true,
          );
          await expectLater(
            client.refresh(scope),
            throwsA(_reconciliationCode(entry.value)),
          );
        }
      },
    );
  });

  group('connected-site authenticated cloud executor', () {
    test('is independently default-off before authentication or I/O', () async {
      final authenticator = _CloudRequestAuthenticator();
      final executor = DartIoConnectedSiteAuthenticatedRequestExecutor(
        allowedOrigin: Uri.parse('https://cloud.example.invalid'),
        authenticator: authenticator,
      );
      await expectLater(
        executor.execute(
          uri: Uri.parse('https://cloud.example.invalid/status'),
          method: 'GET',
          headers: const {'accept': 'application/json'},
          body: const [],
          maxResponseBytes: 1024,
        ),
        throwsA(
          _reconciliationCode('connected_site_authenticated_executor_disabled'),
        ),
      );
      expect(authenticator.calls, 0);
    });

    test('injects authentication only after origin validation', () async {
      String? receivedAuthorization;
      String? receivedBody;
      final fixture = await _CloudTlsServer.start((request) async {
        receivedAuthorization = request.headers.value('authorization');
        receivedBody = await utf8.decoder.bind(request).join();
        request.response.headers.contentType = ContentType.json;
        request.response.write('{"accepted":true}');
        await request.response.close();
      });
      try {
        final authenticator = _CloudRequestAuthenticator();
        final executor = fixture.executor(authenticator: authenticator);
        final uri = fixture.origin.resolve('/reconcile');
        final response = await executor.execute(
          uri: uri,
          method: 'POST',
          headers: const {
            'accept': 'application/json',
            'content-type': 'application/json',
          },
          body: utf8.encode('{"ok":true}'),
          maxResponseBytes: 1024,
        );
        expect(response.statusCode, 200);
        expect(response.effectiveUri, uri);
        expect(utf8.decode(response.body), '{"accepted":true}');
        expect(receivedAuthorization, 'Device synthetic');
        expect(receivedBody, '{"ok":true}');
        expect(authenticator.calls, 1);
        expect(authenticator.lastBodySha256, connectedSiteSha256({'ok': true}));

        await expectLater(
          executor.execute(
            uri: Uri.parse('https://other.example.invalid/reconcile'),
            method: 'POST',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(_reconciliationCode('connected_site_cloud_request_rejected')),
        );
        expect(authenticator.calls, 1);
      } finally {
        await fixture.close();
      }
    });

    test('rejects redirects and aborts streaming at the caller cap', () async {
      var requests = 0;
      final fixture = await _CloudTlsServer.start((request) async {
        requests += 1;
        if (request.uri.path == '/redirect') {
          request.response
            ..statusCode = HttpStatus.found
            ..headers.set(HttpHeaders.locationHeader, '/final');
        } else {
          request.response.headers.contentType = ContentType.json;
          request.response.add(List<int>.filled(2048, 120));
        }
        await request.response.close();
      });
      try {
        final executor = fixture.executor(
          authenticator: _CloudRequestAuthenticator(),
        );
        await expectLater(
          executor.execute(
            uri: fixture.origin.resolve('/redirect'),
            method: 'GET',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode('connected_site_cloud_redirect_rejected'),
          ),
        );
        expect(requests, 1);
        await expectLater(
          executor.execute(
            uri: fixture.origin.resolve('/large'),
            method: 'GET',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode('connected_site_cloud_response_too_large'),
          ),
        );
        expect(requests, 2);
      } finally {
        await fixture.close();
      }
    });

    test('rejects credential header injection before network I/O', () async {
      final authenticator = _CloudRequestAuthenticator(
        headers: const {'cookie': 'forbidden=value'},
      );
      final executor = DartIoConnectedSiteAuthenticatedRequestExecutor(
        allowedOrigin: Uri.parse('https://cloud.example.invalid'),
        authenticator: authenticator,
        runtimeEnabled: true,
      );
      await expectLater(
        executor.execute(
          uri: Uri.parse('https://cloud.example.invalid/status'),
          method: 'GET',
          headers: const {'accept': 'application/json'},
          body: const [],
          maxResponseBytes: 1024,
        ),
        throwsA(
          _reconciliationCode('connected_site_cloud_authentication_rejected'),
        ),
      );
      expect(authenticator.calls, 1);
    });

    test('rejects partial or mixed authentication envelopes', () async {
      for (final headers in <Map<String, String>>[
        const {'x-supermega-device-id': 'device-a'},
        const {
          'x-supermega-device-id': 'device-a',
          'x-supermega-key-id': 'key-a',
          'x-supermega-request-signature': 'signature-a',
        },
        const {
          'authorization': 'Device synthetic',
          'x-supermega-device-id': 'device-a',
          'x-supermega-key-id': 'key-a',
          'x-supermega-request-signature': 'signature-a',
          'x-supermega-request-timestamp': '2026-11-01T00:00:00Z',
        },
      ]) {
        final executor = DartIoConnectedSiteAuthenticatedRequestExecutor(
          allowedOrigin: Uri.parse('https://cloud.example.invalid'),
          authenticator: _CloudRequestAuthenticator(headers: headers),
          runtimeEnabled: true,
        );
        await expectLater(
          executor.execute(
            uri: Uri.parse('https://cloud.example.invalid/status'),
            method: 'GET',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode('connected_site_cloud_authentication_rejected'),
          ),
        );
      }
    });

    test('rejects control characters before network I/O', () async {
      for (final value in <String>['value\u0000suffix', 'value\tsuffix']) {
        final executor = DartIoConnectedSiteAuthenticatedRequestExecutor(
          allowedOrigin: Uri.parse('https://cloud.example.invalid'),
          authenticator: _CloudRequestAuthenticator(),
          runtimeEnabled: true,
        );
        await expectLater(
          executor.execute(
            uri: Uri.parse('https://cloud.example.invalid/status'),
            method: 'GET',
            headers: {'x-test-value': value},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode(
              'connected_site_cloud_request_headers_rejected',
            ),
          ),
        );
      }
    });

    test('rejects ambient HTTP overrides before authentication', () async {
      final authenticator = _CloudRequestAuthenticator();
      await HttpOverrides.runZoned(() async {
        final executor = DartIoConnectedSiteAuthenticatedRequestExecutor(
          allowedOrigin: Uri.parse('https://cloud.example.invalid'),
          authenticator: authenticator,
          runtimeEnabled: true,
        );
        await expectLater(
          executor.execute(
            uri: Uri.parse('https://cloud.example.invalid/status'),
            method: 'GET',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode('connected_site_cloud_http_override_rejected'),
          ),
        );
      }, createHttpClient: (_) => throw StateError('must not create a client'));
      expect(authenticator.calls, 0);
    });

    test('rechecks HTTP overrides after asynchronous authentication', () async {
      final authenticator = _OverrideInstallingCloudAuthenticator();
      try {
        final executor = DartIoConnectedSiteAuthenticatedRequestExecutor(
          allowedOrigin: Uri.parse('https://cloud.example.invalid'),
          authenticator: authenticator,
          runtimeEnabled: true,
        );
        await expectLater(
          executor.execute(
            uri: Uri.parse('https://cloud.example.invalid/status'),
            method: 'GET',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode('connected_site_cloud_http_override_rejected'),
          ),
        );
        expect(authenticator.calls, 1);
        expect(authenticator.clientCreations, 0);
      } finally {
        HttpOverrides.global = null;
      }
    });

    test('enforces one end-to-end deadline against slow drip bodies', () async {
      var requests = 0;
      final fixture = await _CloudTlsServer.start((request) async {
        requests += 1;
        request.response.headers.contentType = ContentType.json;
        for (var index = 0; index < 8; index += 1) {
          request.response.add(const [120]);
          await request.response.flush();
          await Future<void>.delayed(const Duration(milliseconds: 40));
        }
        await request.response.close();
      });
      final elapsed = Stopwatch()..start();
      try {
        final executor = fixture.executor(
          authenticator: _CloudRequestAuthenticator(),
          timeout: const Duration(milliseconds: 140),
        );
        await expectLater(
          executor.execute(
            uri: fixture.origin.resolve('/slow'),
            method: 'GET',
            headers: const {'accept': 'application/json'},
            body: const [],
            maxResponseBytes: 1024,
          ),
          throwsA(
            _reconciliationCode('connected_site_cloud_transport_timeout'),
          ),
        );
        expect(requests, 1);
        expect(elapsed.elapsed, lessThan(const Duration(seconds: 1)));
      } finally {
        await fixture.close();
      }
    });
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
    authorityGeneration: request.authorityGeneration,
    authorityPayloadDigest: request.authorityPayloadDigest,
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
      authorityGeneration: 2,
      authorityPayloadDigest: connectedSiteSha256({'authority': 'current'}),
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
  final proof = _proof(scope, commandId);
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
    commandDigest: proof.commandDigest,
    event: event,
    eventDigest: connectedSiteSha256(event),
    cloudProof: proof,
  );
}

ConnectedSiteCloudProofV1 _proof(ConnectedSiteScope scope, String commandId) {
  final leaseUnsigned = <String, Object>{
    'protocolVersion': connectedSiteProtocolVersion,
    'leaseId': 'lease-$commandId',
    'workspaceId': scope.workspaceId,
    'siteId': scope.siteId,
    'actorId': 'actor-test',
    'role': 'cashierCounter',
    'capabilities': const ['counterSale'],
    'deviceId': scope.deviceId,
    'sessionGeneration': 1,
    'revocationGeneration': 0,
    'issuedAt': '2026-10-31T11:00:00.000Z',
    'expiresAt': '2026-11-01T11:00:00.000Z',
    'issuerKeyId': 'issuer-test',
  };
  final lease = OfflineStaffLeaseV1(
    leaseId: 'lease-$commandId',
    workspaceId: scope.workspaceId,
    siteId: scope.siteId,
    actorId: 'actor-test',
    role: 'cashierCounter',
    capabilities: const ['counterSale'],
    deviceId: scope.deviceId,
    sessionGeneration: 1,
    revocationGeneration: 0,
    issuedAt: '2026-10-31T11:00:00.000Z',
    expiresAt: '2026-11-01T11:00:00.000Z',
    issuerKeyId: 'issuer-test',
    payloadDigest: connectedSiteSha256(leaseUnsigned),
    signature: List.filled(64, 's').join(),
  );
  final payload = <String, Object?>{'totalMmk': 1000};
  final command = SiteCommandV1(
    commandId: commandId,
    workspaceId: scope.workspaceId,
    siteId: scope.siteId,
    actorId: 'actor-test',
    deviceId: scope.deviceId,
    aggregateType: 'sale',
    aggregateId: 'sale-$commandId',
    expectedVersion: 0,
    commandType: 'sale.accept.v1',
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: lease.payloadDigest,
    issuedAt: '2026-10-31T12:00:00.000Z',
    signingKeyId: 'device-key',
    signatureAlgorithm: 'ed25519',
    signature: List.filled(64, 's').join(),
  );
  return ConnectedSiteCloudProofV1.signed(
    command: command,
    lease: lease,
    clientFingerprint: connectedSiteSha256({'device': scope.deviceId}),
    enrollmentEvidenceDigest: connectedSiteSha256({'enrollment': commandId}),
    coordinatorBindingDigest: connectedSiteSha256({'binding': commandId}),
    authorityPayloadDigest: connectedSiteSha256({'authority': commandId}),
    eventBinding: {
      'eventId': 'event-$commandId',
      'eventType': 'sale.accepted.v1',
      'eventDigest': connectedSiteSha256({'event': commandId}),
      'capability': 'counterSale',
      'auditAction': 'sale.accept',
      'commandType': command.commandType,
    },
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

typedef _CloudHandler =
    Future<ConnectedSiteAuthenticatedHttpResponse> Function({
      required Uri uri,
      required String method,
      required Map<String, String> headers,
      required List<int> body,
      required int maxResponseBytes,
    });

class _CloudExecutor implements ConnectedSiteAuthenticatedRequestExecutor {
  _CloudHandler? handler;
  ConnectedSiteAuthenticatedHttpResponse? response;
  int calls = 0;

  @override
  Future<ConnectedSiteAuthenticatedHttpResponse> execute({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required List<int> body,
    required int maxResponseBytes,
  }) async {
    calls += 1;
    final active = handler;
    if (active != null) {
      return active(
        uri: uri,
        method: method,
        headers: headers,
        body: body,
        maxResponseBytes: maxResponseBytes,
      );
    }
    final fixed = response;
    if (fixed != null) return fixed;
    throw StateError('cloud executor response missing');
  }
}

class _CloudAuthorityVerifier extends ShopConnectedSiteCloudAuthorityVerifier {
  factory _CloudAuthorityVerifier() {
    final verifier = _SignatureVerifier();
    return _CloudAuthorityVerifier._(verifier);
  }

  _CloudAuthorityVerifier._(this.signatureVerifier)
    : super(verifier: signatureVerifier);

  final _SignatureVerifier signatureVerifier;
  int get calls => signatureVerifier.calls;
}

class _CloudAuthorityReceiptStore
    implements ConnectedSiteVerifiedAuthorityReceiptStore {
  ConnectedSiteVerifiedAuthorityReceipt? receipt;

  @override
  Future<ConnectedSiteVerifiedAuthorityReceipt?> latest(
    ConnectedSiteScope scope,
  ) async => receipt;

  @override
  Future<void> retain(
    ConnectedSiteScope scope, {
    required ConnectedSiteVerifiedAuthorityReceipt receipt,
    required String canonicalPayloadBytes,
    required String signature,
  }) async {
    this.receipt = receipt;
  }
}

class _SignatureVerifier implements ConnectedSiteAuthorityPayloadVerifier {
  int calls = 0;

  @override
  Future<void> verify({
    required String canonicalPayloadBytes,
    required String signature,
    required String issuerKeyId,
  }) async {
    calls += 1;
    expect(
      canonicalConnectedSiteJson(jsonDecode(canonicalPayloadBytes)),
      canonicalPayloadBytes,
    );
    expect(signature, 's' * 64);
    expect(issuerKeyId, 'authority-key-1');
  }
}

class _AcceptingSignatureVerifier
    implements ConnectedSiteAuthorityPayloadVerifier {
  @override
  Future<void> verify({
    required String canonicalPayloadBytes,
    required String signature,
    required String issuerKeyId,
  }) async {}
}

final _cloudAuthorityUri = Uri(
  scheme: 'https',
  host: 'cloud.example.invalid',
  path: '/api/connected-site/v1/workspaces/tenant-a/sites/site-a/authority',
);

ConnectedSiteAuthenticatedHttpResponse _cloudHttpJson(
  Object value, {
  Uri? effectiveUri,
}) {
  final body = utf8.encode(canonicalConnectedSiteJson(value));
  return ConnectedSiteAuthenticatedHttpResponse(
    statusCode: 200,
    contentType: 'application/json',
    body: body,
    effectiveUri: effectiveUri ?? _cloudAuthorityUri,
  );
}

Map<String, Object?> _cloudAuthorityResponse(
  ConnectedSiteScope scope, {
  String? workspaceId,
}) {
  final membership = <String, Object?>{
    'revocationGeneration': 3,
    'members': <Object?>[
      <String, Object?>{
        'actorId': 'actor-test',
        'role': 'cashierCounter',
        'capabilities': <Object?>['counterSale'],
        'sessionGeneration': 3,
      },
    ],
  };
  final configuration = <String, Object?>{
    'configurationVersion': 6,
    'businessProfile': <String, Object?>{
      'schemaId': 'business-profile-v1',
      'templateId': 'retail',
      'templateVersion': 1,
    },
    'catalogReference': <String, Object?>{
      'catalogVersion': 1,
      'catalogDigest': 'c' * 64,
    },
  };
  final unsigned = <String, Object?>{
    'schemaId': 'ConnectedSiteAuthorityPayloadV1',
    'protocolVersion': connectedSiteProtocolVersion,
    'authorityEventId': 'authority-event-4',
    'authoritySequence': 4,
    'previousAuthorityDigest': 'd' * 64,
    'workspaceId': scope.workspaceId,
    'siteId': scope.siteId,
    'issuedAtMillis': DateTime.utc(2026, 10, 31, 11).millisecondsSinceEpoch,
    'issuerKeyId': 'authority-key-1',
    'membershipSnapshot': membership,
    'configurationSnapshot': configuration,
  };
  final payload = <String, Object?>{
    ...unsigned,
    'payloadDigest': connectedSiteSha256(unsigned),
  };
  return <String, Object?>{
    'contract': connectedSiteCloudAuthorityResponseContract,
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId ?? scope.workspaceId,
    'siteId': scope.siteId,
    'deviceId': scope.deviceId,
    'active': true,
    'sessionGeneration': 2,
    'authorityGeneration': 4,
    'configurationGeneration': 6,
    'revocationGeneration': 3,
    'authorityPayloadBytes': canonicalConnectedSiteJson(payload),
    'authorityPayloadDigest': connectedSiteSha256(payload),
    'authoritySignature': 's' * 64,
    'issuerKeyId': 'authority-key-1',
  };
}

class _CloudRequestAuthenticator
    implements ConnectedSiteCloudRequestAuthenticator {
  _CloudRequestAuthenticator({
    this.headers = const {'authorization': 'Device synthetic'},
  });

  final Map<String, String> headers;
  int calls = 0;
  String? lastBodySha256;

  @override
  Future<Map<String, String>> authenticationHeaders({
    required Uri uri,
    required String method,
    required String bodySha256,
  }) async {
    calls += 1;
    lastBodySha256 = bodySha256;
    return headers;
  }
}

class _OverrideInstallingCloudAuthenticator
    implements ConnectedSiteCloudRequestAuthenticator {
  int calls = 0;
  int clientCreations = 0;

  @override
  Future<Map<String, String>> authenticationHeaders({
    required Uri uri,
    required String method,
    required String bodySha256,
  }) async {
    calls += 1;
    await Future<void>.delayed(Duration.zero);
    HttpOverrides.global = _RejectingHttpOverrides(
      onCreate: () => clientCreations += 1,
    );
    return const {'authorization': 'Device synthetic'};
  }
}

class _RejectingHttpOverrides extends HttpOverrides {
  _RejectingHttpOverrides({required this.onCreate});

  final void Function() onCreate;

  @override
  HttpClient createHttpClient(SecurityContext? context) {
    onCreate();
    throw StateError('overridden client must not be created');
  }
}

class _CloudTlsServer {
  _CloudTlsServer._({
    required this.server,
    required this.directory,
    required this.clientContext,
  });

  final HttpServer server;
  final Directory directory;
  final SecurityContext clientContext;

  Uri get origin => Uri(scheme: 'https', host: 'localhost', port: server.port);

  DartIoConnectedSiteAuthenticatedRequestExecutor executor({
    required ConnectedSiteCloudRequestAuthenticator authenticator,
    Duration timeout = const Duration(seconds: 12),
  }) => DartIoConnectedSiteAuthenticatedRequestExecutor(
    allowedOrigin: origin,
    authenticator: authenticator,
    trustedContext: clientContext,
    runtimeEnabled: true,
    timeout: timeout,
  );

  static Future<_CloudTlsServer> start(
    Future<void> Function(HttpRequest request) handler,
  ) async {
    final directory = await Directory.systemTemp.createTemp(
      'supermega-cloud-http-test-',
    );
    final certificate = File('${directory.path}/certificate.pem');
    final privateKey = File('${directory.path}/private-key.pem');
    final result = await Process.run('openssl', <String>[
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      privateKey.path,
      '-out',
      certificate.path,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-days',
      '1',
    ]);
    if (result.exitCode != 0) {
      await directory.delete(recursive: true);
      throw StateError('openssl_cloud_test_identity_failed:${result.exitCode}');
    }
    final serverContext = SecurityContext(withTrustedRoots: false)
      ..useCertificateChain(certificate.path)
      ..usePrivateKey(privateKey.path);
    final server = await HttpServer.bindSecure(
      InternetAddress.loopbackIPv4,
      0,
      serverContext,
    );
    server.listen((request) async {
      try {
        await handler(request);
      } on Object {
        try {
          await request.response.close();
        } on Object {
          // The size-cap test deliberately closes the client mid-response.
        }
      }
    });
    final clientContext = SecurityContext(withTrustedRoots: false)
      ..setTrustedCertificates(certificate.path);
    return _CloudTlsServer._(
      server: server,
      directory: directory,
      clientContext: clientContext,
    );
  }

  Future<void> close() async {
    await server.close(force: true);
    await directory.delete(recursive: true);
  }
}
