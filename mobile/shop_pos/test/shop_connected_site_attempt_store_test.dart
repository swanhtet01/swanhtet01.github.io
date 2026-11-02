import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_reservation_session.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_database_adapter.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  late ShopDatabase database;
  late ShopConnectedSiteAttemptStore store;
  final clock = DateTime.utc(2026, 10, 31, 12);

  setUp(() {
    database = ShopDatabase(NativeDatabase.memory());
    store = ShopConnectedSiteAttemptStore(
      database: database,
      approvalVerifier: const _ApprovalVerifier(),
      runtimeEnabled: true,
      now: () => clock,
    );
  });

  tearDown(() => database.close());

  test(
    'store is default-off and QR discovery alone grants no authority',
    () async {
      final disabled = ShopConnectedSiteAttemptStore(database: database);
      await expectLater(
        disabled.importApproval(_approval(clock)),
        throwsStateError,
      );
      await expectLater(
        store.prepare(
          command: _command(),
          bindingDigest: 'a' * 64,
          clientFingerprint: 'b' * 64,
        ),
        throwsStateError,
      );
    },
  );

  test(
    'exact attempt, transmission and terminal ACK survive restart semantics',
    () async {
      final approval = await _seedEnrollment(database, clock);
      final binding = await store.importApproval(approval);
      final command = _command();
      final prepared = await store.prepare(
        command: command,
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      );
      expect(
        prepared.commandJson,
        canonicalConnectedSiteJson(command.toJson()),
      );
      expect(
        await store.recoverUnresolved(bindingDigest: binding),
        hasLength(1),
      );

      final proof = CoordinatorRequestProof(
        workspaceId: command.workspaceId,
        siteId: command.siteId,
        coordinatorDeviceId: approval.coordinatorDeviceId,
        clientFingerprint: approval.clientFingerprint,
        claimedDeviceId: command.deviceId,
        issuedAt: clock,
        nonce: 'request_nonce_abcdefghijklmnop',
        method: 'POST',
        canonicalTarget: '/v1/commands',
        bodySha256: prepared.bodySha256,
        signature: 'R' * 86,
      );
      for (final invalid in <(CoordinatorRequestProof, String)>[
        (
          _proof(
            command,
            approval,
            prepared.bodySha256,
            clock,
            issuedAt: clock.subtract(const Duration(minutes: 3)),
          ),
          'R' * 86,
        ),
        (
          _proof(
            command,
            approval,
            prepared.bodySha256,
            clock,
            issuedAt: clock.add(const Duration(minutes: 3)),
          ),
          'R' * 86,
        ),
        (
          _proof(command, approval, prepared.bodySha256, clock, nonce: 'short'),
          'R' * 86,
        ),
        (
          _proof(
            command,
            approval,
            prepared.bodySha256,
            clock,
            signature: '!' * 86,
          ),
          '!' * 86,
        ),
        (proof, 'S' * 86),
      ]) {
        await expectLater(
          store.beginTransmission(
            commandId: command.commandId,
            proof: invalid.$1,
            requestSignature: invalid.$2,
          ),
          throwsStateError,
        );
      }
      await expectLater(
        store.beginTransmission(
          commandId: command.commandId,
          proof: CoordinatorRequestProof(
            workspaceId: proof.workspaceId,
            siteId: proof.siteId,
            coordinatorDeviceId: 'substituted-coordinator',
            clientFingerprint: proof.clientFingerprint,
            claimedDeviceId: proof.claimedDeviceId,
            issuedAt: proof.issuedAt,
            nonce: proof.nonce,
            method: proof.method,
            canonicalTarget: proof.canonicalTarget,
            bodySha256: proof.bodySha256,
            signature: proof.signature,
          ),
          requestSignature: 'R' * 86,
        ),
        throwsStateError,
      );
      final transmission = await store.beginTransmission(
        commandId: command.commandId,
        proof: proof,
        requestSignature: 'R' * 86,
      );
      expect(transmission.transmissionSequence, 1);
      expect(
        transmission.uri,
        Uri.parse('https://192.168.1.2:9443/v1/commands'),
      );
      expect(
        utf8.decode(transmission.body),
        canonicalConnectedSiteJson(command.toJson()),
      );
      expect(transmission.headers.keys.toSet(), {
        'accept',
        'content-type',
        'x-supermega-client-fingerprint',
        'x-supermega-device-id',
        'x-supermega-issued-at',
        'x-supermega-request-nonce',
        'x-supermega-request-signature',
      });
      expect(transmission.certificateSha256, approval.certificateSha256);
      final ack = SiteCommandAckV1(
        commandId: command.commandId,
        commandDigest: command.commandDigest,
        state: SiteCommandAckState.accepted,
        canonicalVersion: 1,
        eventDigest: 'e' * 64,
      );
      await store.recordTerminal(
        commandId: command.commandId,
        transmissionSequence: 1,
        acknowledgement: ack,
      );
      await expectLater(
        store.recordTerminal(
          commandId: command.commandId,
          transmissionSequence: 2,
          acknowledgement: ack,
        ),
        throwsStateError,
      );
      await expectLater(
        store.beginTransmission(
          commandId: command.commandId,
          proof: CoordinatorRequestProof(
            workspaceId: proof.workspaceId,
            siteId: proof.siteId,
            coordinatorDeviceId: proof.coordinatorDeviceId,
            clientFingerprint: proof.clientFingerprint,
            claimedDeviceId: proof.claimedDeviceId,
            issuedAt: proof.issuedAt.add(const Duration(seconds: 1)),
            nonce: 'request_nonce_second_abcdefghijk',
            method: proof.method,
            canonicalTarget: proof.canonicalTarget,
            bodySha256: proof.bodySha256,
            signature: proof.signature,
          ),
          requestSignature: 'R' * 86,
        ),
        throwsStateError,
      );
      expect(await store.recoverUnresolved(bindingDigest: binding), isEmpty);
      final replay = await store.prepare(
        command: command,
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      );
      expect(
        replay.terminalAcknowledgement?.state,
        SiteCommandAckState.accepted,
      );
      await database.verifyReadyForUse();
    },
  );

  test(
    'concurrent reserve preparation atomically binds one exact subject',
    () async {
      final approval = await _seedEnrollment(database, clock);
      final binding = await store.importApproval(approval);
      final first = _reservationCommand(
        commandId: 'reserve-race-a',
        reservationId: 'reservation-race-a',
        subjectId: 'race-cart',
      );
      final second = _reservationCommand(
        commandId: 'reserve-race-b',
        reservationId: 'reservation-race-b',
        subjectId: 'race-cart',
      );
      final outcomes = await Future.wait(
        [first, second].map(
          (command) => store
              .prepare(
                command: command,
                bindingDigest: binding,
                clientFingerprint: approval.clientFingerprint,
              )
              .then((_) => 'accepted')
              .catchError((Object _) => 'rejected'),
        ),
      );
      expect(outcomes.where((value) => value == 'accepted'), hasLength(1));
      expect(outcomes.where((value) => value == 'rejected'), hasLength(1));
      final attempts = await database
          .customSelect(
            'SELECT command_id FROM shop_site_command_attempts ORDER BY command_id',
          )
          .get();
      final bindings = await database
          .customSelect(
            'SELECT reserve_command_id FROM '
            'shop_connected_reservation_session_bindings',
          )
          .get();
      expect(attempts, hasLength(1));
      expect(bindings, hasLength(1));
      expect(
        bindings.single.read<String>('reserve_command_id'),
        attempts.single.read<String>('command_id'),
      );
      await database.verifyConnectedAttemptEvidence();
    },
  );

  test(
    'approval rejects public endpoints, excess lifetime and future issue',
    () async {
      final valid = await _seedEnrollment(database, clock);
      for (final invalid in [
        _approval(
          clock,
          enrollmentEvidenceDigest: valid.enrollmentEvidenceDigest,
          clientFingerprint: valid.clientFingerprint,
          address: '8.8.8.8',
        ),
        _approval(
          clock,
          enrollmentEvidenceDigest: valid.enrollmentEvidenceDigest,
          clientFingerprint: valid.clientFingerprint,
          expiresAtMillis: clock
              .add(const Duration(days: 8))
              .millisecondsSinceEpoch,
        ),
        _approval(
          clock,
          enrollmentEvidenceDigest: valid.enrollmentEvidenceDigest,
          clientFingerprint: valid.clientFingerprint,
          issuedAtMillis: clock
              .add(const Duration(minutes: 1))
              .millisecondsSinceEpoch,
        ),
      ]) {
        await expectLater(store.importApproval(invalid), throwsStateError);
      }
    },
  );

  test('same command id with altered canonical bytes fails closed', () async {
    final approval = await _seedEnrollment(database, clock);
    final binding = await store.importApproval(approval);
    await store.prepare(
      command: _command(),
      bindingDigest: binding,
      clientFingerprint: approval.clientFingerprint,
    );
    await expectLater(
      store.prepare(
        command: _command(signature: 'S' * 86),
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      ),
      throwsStateError,
    );
  });

  test(
    'signed revocation is append-only and prevents stale reactivation',
    () async {
      final approval = await _seedEnrollment(database, clock);
      final binding = await store.importApproval(approval);
      final command = _command();
      final prepared = await store.prepare(
        command: command,
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      );
      final revocation = ConnectedCoordinatorRevocationV1(
        targetBindingDigest: binding,
        workspaceId: approval.workspaceId,
        siteId: approval.siteId,
        clientDeviceId: approval.clientDeviceId,
        approvalGeneration: 2,
        issuedAtMillis: clock.millisecondsSinceEpoch,
        authorityKeyId: 'authority-1',
        authoritySignature: 'A' * 86,
      );
      final digest = await store.revoke(revocation);
      expect(await store.revoke(revocation), digest);
      await expectLater(
        store.beginTransmission(
          commandId: command.commandId,
          proof: _proof(command, approval, prepared.bodySha256, clock),
          requestSignature: 'R' * 86,
        ),
        throwsStateError,
      );
      await expectLater(
        store.prepare(
          command: _command(),
          bindingDigest: binding,
          clientFingerprint: approval.clientFingerprint,
        ),
        throwsStateError,
      );
      await expectLater(store.importApproval(approval), completion(binding));
      await expectLater(
        store.revoke(
          ConnectedCoordinatorRevocationV1(
            targetBindingDigest: binding,
            workspaceId: approval.workspaceId,
            siteId: approval.siteId,
            clientDeviceId: approval.clientDeviceId,
            approvalGeneration: 1,
            issuedAtMillis: clock.millisecondsSinceEpoch,
            authorityKeyId: 'authority-1',
            authoritySignature: 'A' * 86,
          ),
        ),
        throwsStateError,
      );
      final rotated = ConnectedCoordinatorApprovalV1(
        workspaceId: approval.workspaceId,
        siteId: approval.siteId,
        coordinatorDeviceId: approval.coordinatorDeviceId,
        pairingDigest: '9' * 64,
        enrollmentEvidenceDigest: approval.enrollmentEvidenceDigest,
        clientDeviceId: approval.clientDeviceId,
        clientFingerprint: approval.clientFingerprint,
        clientSigningKeyId: approval.clientSigningKeyId,
        address: '192.168.1.3',
        port: 9443,
        certificateSha256: '8' * 64,
        approvalGeneration: 3,
        issuedAtMillis: clock.millisecondsSinceEpoch,
        expiresAtMillis: clock
            .add(const Duration(days: 6))
            .millisecondsSinceEpoch,
        authorityKeyId: 'authority-1',
        authoritySignature: 'A' * 86,
      );
      final rotatedBinding = await store.importApproval(rotated);
      final rotatedCommand = _command(
        commandId: 'command-2',
        signature: 'T' * 86,
      );
      expect(
        (await store.prepare(
          command: rotatedCommand,
          bindingDigest: rotatedBinding,
          clientFingerprint: rotated.clientFingerprint,
        )).commandId,
        rotatedCommand.commandId,
      );
      await database.verifyReadyForUse();
    },
  );

  test('enrollment revocation immediately blocks binding resolution', () async {
    final approval = await _seedEnrollment(database, clock);
    final binding = await store.importApproval(approval);
    final resolved = await store.resolveActiveBinding(
      bindingDigest: binding,
      workspaceId: approval.workspaceId,
      siteId: approval.siteId,
      clientDeviceId: approval.clientDeviceId,
      clientFingerprint: approval.clientFingerprint,
      clientSigningKeyId: approval.clientSigningKeyId,
    );
    expect(resolved.bindingDigest, binding);
    expect(resolved.approvalGeneration, approval.approvalGeneration);
    expect(resolved.sessionGeneration, 1);
    await database.customStatement(
      'UPDATE shop_site_devices SET session_generation = 2 WHERE device_id = ?',
      [approval.clientDeviceId],
    );
    await expectLater(
      store.resolveActiveBinding(
        bindingDigest: binding,
        workspaceId: approval.workspaceId,
        siteId: approval.siteId,
        clientDeviceId: approval.clientDeviceId,
        clientFingerprint: approval.clientFingerprint,
        clientSigningKeyId: approval.clientSigningKeyId,
      ),
      throwsStateError,
    );
    await _revokeEnrollment(
      database,
      approval,
      clock.add(const Duration(minutes: 1)),
    );
    await expectLater(
      store.resolveActiveBinding(
        bindingDigest: binding,
        workspaceId: approval.workspaceId,
        siteId: approval.siteId,
        clientDeviceId: approval.clientDeviceId,
        clientFingerprint: approval.clientFingerprint,
        clientSigningKeyId: approval.clientSigningKeyId,
      ),
      throwsStateError,
    );
  });

  test(
    'recomputed envelope endpoint substitution fails verification',
    () async {
      final approval = await _seedEnrollment(database, clock);
      final binding = await store.importApproval(approval);
      final command = _command();
      final prepared = await store.prepare(
        command: command,
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      );
      await store.beginTransmission(
        commandId: command.commandId,
        proof: _proof(command, approval, prepared.bodySha256, clock),
        requestSignature: 'R' * 86,
      );
      final retained = await database
          .customSelect(
            'SELECT * FROM shop_site_request_envelopes WHERE command_id = ?',
            variables: [Variable.withString(command.commandId)],
          )
          .getSingle();
      const substituted = 'https://192.168.1.99:9443/v1/commands';
      final headers = jsonDecode(retained.read<String>('headers_json')) as Map;
      final body = retained.read<String>('body_json');
      await database.customStatement(
        'DROP TRIGGER shop_site_request_envelopes_no_update',
      );
      await database.customStatement(
        'UPDATE shop_site_request_envelopes SET endpoint = ?, '
        'envelope_digest = ? WHERE command_id = ?',
        [
          substituted,
          connectedSiteSha256({
            'commandId': command.commandId,
            'transmissionSequence': 1,
            'endpoint': substituted,
            'certificateSha256': approval.certificateSha256,
            'headers': headers,
            'body': body,
          }),
          command.commandId,
        ],
      );
      await expectLater(
        database.verifyConnectedAttemptEvidence(),
        throwsStateError,
      );
    },
  );

  test('v31 snapshot verification shares immutable attempt checks', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v31-');
    final file = File('${directory.path}/shop.sqlite');
    final persisted = ShopDatabase(NativeDatabase(file));
    try {
      final approval = await _seedEnrollment(persisted, clock);
      final persistedStore = ShopConnectedSiteAttemptStore(
        database: persisted,
        approvalVerifier: const _ApprovalVerifier(),
        runtimeEnabled: true,
        now: () => clock,
      );
      final binding = await persistedStore.importApproval(approval);
      await persistedStore.prepare(
        command: _reservationCommand(),
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      );
      await persisted.close();
      expect(() => ShopBackup.verifySnapshot(file), returnsNormally);
      final raw = sqlite.sqlite3.open(file.path);
      try {
        raw.execute(
          'DROP TRIGGER '
          'shop_connected_reservation_session_bindings_no_update',
        );
        raw.execute(
          'UPDATE shop_connected_reservation_session_bindings '
          "SET reservation_digest = '${List.filled(64, 'f').join()}'",
        );
        raw.execute(
          shopConnectedReservationSessionSchemaDefinitionsV31()['shop_connected_reservation_session_bindings_no_update']!,
        );
      } finally {
        raw.close();
      }
      expect(() => ShopBackup.verifySnapshot(file), throwsFormatException);
      final altered = ShopDatabase(NativeDatabase(file));
      try {
        await expectLater(altered.verifyReadyForUse(), throwsStateError);
      } finally {
        await altered.close();
      }
    } finally {
      if (file.existsSync()) file.deleteSync();
      directory.deleteSync(recursive: true);
    }
  });

  test('populated v30 migrates exact reservation subject binding to v31', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-v30-binding-',
    );
    final file = File('${directory.path}/shop.sqlite');
    var persisted = ShopDatabase(NativeDatabase(file));
    try {
      final approval = await _seedEnrollment(persisted, clock);
      final persistedStore = ShopConnectedSiteAttemptStore(
        database: persisted,
        approvalVerifier: const _ApprovalVerifier(),
        runtimeEnabled: true,
        now: () => clock,
      );
      final binding = await persistedStore.importApproval(approval);
      final command = _reservationCommand();
      await persistedStore.prepare(
        command: command,
        bindingDigest: binding,
        clientFingerprint: approval.clientFingerprint,
      );
      await persisted.close();

      final raw = sqlite.sqlite3.open(file.path);
      try {
        dropHistoricalShopSchemaDefinitionGroup(
          raw,
          shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
        );
        raw.execute(
          'DROP TRIGGER shop_connected_reservation_session_bindings_no_update',
        );
        raw.execute(
          'DROP TRIGGER shop_connected_reservation_session_bindings_no_delete',
        );
        raw.execute('DROP TABLE shop_connected_reservation_session_bindings');
        raw.execute('PRAGMA user_version = 30');
      } finally {
        raw.close();
      }

      persisted = ShopDatabase(NativeDatabase(file));
      await persisted.verifyReadyForUse();
      expect(persisted.schemaVersion, 38);
      final retained = await persisted
          .customSelect(
            'SELECT reserve_command_id, reserve_command_digest FROM '
            'shop_connected_reservation_session_bindings',
          )
          .getSingle();
      expect(retained.read<String>('reserve_command_id'), command.commandId);
      expect(
        retained.read<String>('reserve_command_digest'),
        command.commandDigest,
      );
    } finally {
      await persisted.close();
      if (file.existsSync()) file.deleteSync();
      directory.deleteSync(recursive: true);
    }
  });

  test(
    'populated v28 preview fails closed instead of inventing envelopes',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v28-filled-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var persisted = ShopDatabase(NativeDatabase(file));
      try {
        final approval = await _seedEnrollment(persisted, clock);
        final persistedStore = ShopConnectedSiteAttemptStore(
          database: persisted,
          approvalVerifier: const _ApprovalVerifier(),
          runtimeEnabled: true,
          now: () => clock,
        );
        final binding = await persistedStore.importApproval(approval);
        final command = _command();
        final prepared = await persistedStore.prepare(
          command: command,
          bindingDigest: binding,
          clientFingerprint: approval.clientFingerprint,
        );
        await persistedStore.beginTransmission(
          commandId: command.commandId,
          proof: _proof(command, approval, prepared.bodySha256, clock),
          requestSignature: 'R' * 86,
        );
        await persisted.close();

        final raw = sqlite.sqlite3.open(file.path);
        try {
          dropHistoricalShopSchemaDefinitionGroup(
            raw,
            shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
          );
          raw.execute('DROP TABLE shop_site_request_envelopes');
          raw.execute('PRAGMA user_version = 28');
        } finally {
          raw.close();
        }

        persisted = ShopDatabase(NativeDatabase(file));
        await expectLater(
          persisted.verifyReadyForUse(),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('cannot migrate to v29'),
            ),
          ),
        );
      } finally {
        await persisted.close();
        if (file.existsSync()) file.deleteSync();
        directory.deleteSync(recursive: true);
      }
    },
  );

  test(
    'populated attempt chain survives encrypted fresh-target restore',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-v29-restore-');
      final source = File('${root.path}/source.sqlite');
      final archive = File('${root.path}/attempts.smbak');
      final restored = File('${root.path}/restored.sqlite');
      var persisted = ShopDatabase(NativeDatabase(source));
      try {
        final approval = await _seedEnrollment(persisted, clock);
        final persistedStore = ShopConnectedSiteAttemptStore(
          database: persisted,
          approvalVerifier: const _ApprovalVerifier(),
          runtimeEnabled: true,
          now: () => clock,
        );
        final binding = await persistedStore.importApproval(approval);
        final command = _reservationCommand();
        final prepared = await persistedStore.prepare(
          command: command,
          bindingDigest: binding,
          clientFingerprint: approval.clientFingerprint,
        );
        await persistedStore.beginTransmission(
          commandId: command.commandId,
          proof: _proof(command, approval, prepared.bodySha256, clock),
          requestSignature: 'R' * 86,
        );
        await _revokeEnrollment(
          persisted,
          approval,
          clock.add(const Duration(minutes: 1)),
        );
        await ShopBackup.exportEncrypted(
          database: persisted,
          archive: archive,
          password: 'Correct Horse Battery Staple 123!',
          scratchRoot: root,
        );
        await persisted.close();
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: 'Correct Horse Battery Staple 123!',
        );
        persisted = ShopDatabase(NativeDatabase(restored));
        await persisted.verifyReadyForUse();
        final count = await persisted
            .customSelect(
              'SELECT COUNT(*) AS count FROM shop_site_command_transmissions',
            )
            .getSingle();
        expect(count.read<int>('count'), 1);
        final session =
            await ShopConnectedReservationSessionRepository(persisted).load(
              workspaceId: 'workspace-1',
              siteId: 'site-1',
              actorId: 'actor-1',
              deviceId: 'device-1',
              workflowType: ConnectedStockWorkflowType.retailCart,
              subjectId: 'restore-cart',
            );
        expect(session?.state, ConnectedReservationSessionState.unknown);
        expect(session?.reserveCommand.commandDigest, command.commandDigest);
        final restoredStore = ShopConnectedSiteAttemptStore(
          database: persisted,
          approvalVerifier: const _ApprovalVerifier(),
          runtimeEnabled: true,
          now: () => clock.add(const Duration(minutes: 1)),
        );
        await expectLater(
          restoredStore.prepare(
            command: _command(commandId: 'command-after-revocation'),
            bindingDigest: binding,
            clientFingerprint: approval.clientFingerprint,
          ),
          throwsStateError,
        );
        await expectLater(
          restoredStore.beginTransmission(
            commandId: command.commandId,
            proof: _proof(
              command,
              approval,
              prepared.bodySha256,
              clock.add(const Duration(minutes: 1)),
              nonce: 'request_nonce_restore_abcdefghij',
            ),
            requestSignature: 'R' * 86,
          ),
          throwsStateError,
        );
      } finally {
        await persisted.close();
        await root.delete(recursive: true);
      }
    },
  );
}

ConnectedCoordinatorApprovalV1 _approval(
  DateTime now, {
  String enrollmentEvidenceDigest = '',
  String clientFingerprint = '',
  String address = '192.168.1.2',
  int? issuedAtMillis,
  int? expiresAtMillis,
}) => ConnectedCoordinatorApprovalV1(
  workspaceId: 'workspace-1',
  siteId: 'site-1',
  coordinatorDeviceId: 'coordinator-1',
  pairingDigest: '1' * 64,
  enrollmentEvidenceDigest: enrollmentEvidenceDigest.isEmpty
      ? '2' * 64
      : enrollmentEvidenceDigest,
  clientDeviceId: 'device-1',
  clientFingerprint: clientFingerprint.isEmpty ? '3' * 64 : clientFingerprint,
  clientSigningKeyId: 'key-1',
  address: address,
  port: 9443,
  certificateSha256: '4' * 64,
  approvalGeneration: 1,
  issuedAtMillis:
      issuedAtMillis ??
      now.subtract(const Duration(minutes: 1)).millisecondsSinceEpoch,
  expiresAtMillis:
      expiresAtMillis ??
      now.add(const Duration(days: 6)).millisecondsSinceEpoch,
  authorityKeyId: 'authority-1',
  authoritySignature: 'A' * 86,
);

Future<ConnectedCoordinatorApprovalV1> _seedEnrollment(
  ShopDatabase database,
  DateTime now,
) async {
  final publicKey = List<int>.generate(32, (index) => index + 1);
  final fingerprint = crypto.sha256.convert(publicKey).toString();
  final observed = now
      .subtract(const Duration(minutes: 2))
      .millisecondsSinceEpoch;
  final payload = <String, Object>{
    'schema': 'supermega.shop.owner-enrollment-evidence.v1',
    'action': 'approve',
    'tenantId': 'workspace-1',
    'siteId': 'site-1',
    'coordinatorDeviceId': 'coordinator-1',
    'deviceId': 'device-1',
    'clientFingerprint': fingerprint,
    'sessionGeneration': 1,
    'observedAtMillis': observed,
    'authorityKeyId': 'owner-authority-1',
  };
  final evidenceDigest = connectedSiteSha256(payload);
  final evidence = {
    ...payload,
    'signature': 'E' * 86,
    'evidenceDigest': evidenceDigest,
  };
  await database.transaction(() async {
    await database.customStatement(
      'INSERT INTO shop_site_pairing_nonces (nonce, tenant_id, site_id, '
      'coordinator_device_id, issued_at_millis, expires_at_millis, '
      'consumed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        'pairing_nonce_abcdefghijklmnop',
        'workspace-1',
        'site-1',
        'coordinator-1',
        observed - 1000,
        observed + 60000,
        observed,
      ],
    );
    await database.customStatement(
      'INSERT INTO shop_site_pending_enrollments (client_fingerprint, nonce, '
      'tenant_id, site_id, coordinator_device_id, public_key, key_algorithm, '
      'observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        fingerprint,
        'pairing_nonce_abcdefghijklmnop',
        'workspace-1',
        'site-1',
        'coordinator-1',
        publicKey,
        'ed25519',
        observed,
      ],
    );
    await database.customStatement(
      'INSERT INTO shop_site_devices (device_id, tenant_id, site_id, '
      'public_key_fingerprint, session_generation, state, enrolled_at_millis) '
      "VALUES (?, ?, ?, ?, ?, 'active', ?)",
      ['device-1', 'workspace-1', 'site-1', fingerprint, 1, observed],
    );
    await database.customStatement(
      'INSERT INTO shop_site_enrollment_evidence (evidence_digest, action, '
      'tenant_id, site_id, coordinator_device_id, device_id, '
      'client_fingerprint, session_generation, observed_at_millis, '
      'authority_key_id, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        evidenceDigest,
        'approve',
        'workspace-1',
        'site-1',
        'coordinator-1',
        'device-1',
        fingerprint,
        1,
        observed,
        'owner-authority-1',
        canonicalConnectedSiteJson(evidence),
      ],
    );
  });
  await database.verifyReadyForUse();
  return _approval(
    now,
    enrollmentEvidenceDigest: evidenceDigest,
    clientFingerprint: fingerprint,
  );
}

Future<void> _revokeEnrollment(
  ShopDatabase database,
  ConnectedCoordinatorApprovalV1 approval,
  DateTime observedAt,
) async {
  final observed = observedAt.millisecondsSinceEpoch;
  final payload = <String, Object>{
    'schema': 'supermega.shop.owner-enrollment-evidence.v1',
    'action': 'revoke',
    'tenantId': approval.workspaceId,
    'siteId': approval.siteId,
    'coordinatorDeviceId': approval.coordinatorDeviceId,
    'deviceId': approval.clientDeviceId,
    'clientFingerprint': approval.clientFingerprint,
    'sessionGeneration': 2,
    'observedAtMillis': observed,
    'authorityKeyId': 'owner-authority-1',
  };
  final digest = connectedSiteSha256(payload);
  final evidence = {
    ...payload,
    'signature': 'E' * 86,
    'evidenceDigest': digest,
  };
  await database.transaction(() async {
    await database.customStatement(
      "UPDATE shop_site_devices SET state = 'revoked', revoked_at_millis = ?, "
      'session_generation = 2 WHERE device_id = ?',
      [observed, approval.clientDeviceId],
    );
    await database.customStatement(
      'INSERT INTO shop_site_enrollment_evidence (evidence_digest, action, '
      'tenant_id, site_id, coordinator_device_id, device_id, '
      'client_fingerprint, session_generation, observed_at_millis, '
      'authority_key_id, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        digest,
        'revoke',
        approval.workspaceId,
        approval.siteId,
        approval.coordinatorDeviceId,
        approval.clientDeviceId,
        approval.clientFingerprint,
        2,
        observed,
        'owner-authority-1',
        canonicalConnectedSiteJson(evidence),
      ],
    );
  });
  await database.verifyReadyForUse();
}

CoordinatorRequestProof _proof(
  SiteCommandV1 command,
  ConnectedCoordinatorApprovalV1 approval,
  String bodySha256,
  DateTime now, {
  DateTime? issuedAt,
  String nonce = 'request_nonce_abcdefghijklmnop',
  String signature = '',
}) => CoordinatorRequestProof(
  workspaceId: command.workspaceId,
  siteId: command.siteId,
  coordinatorDeviceId: approval.coordinatorDeviceId,
  clientFingerprint: approval.clientFingerprint,
  claimedDeviceId: command.deviceId,
  issuedAt: issuedAt ?? now,
  nonce: nonce,
  method: 'POST',
  canonicalTarget: '/v1/commands',
  bodySha256: bodySha256,
  signature: signature.isEmpty ? 'R' * 86 : signature,
);

SiteCommandV1 _command({
  String commandId = 'command-1',
  String signature = '',
}) {
  final payload = <String, Object?>{'productId': 'product-1', 'quantity': 1};
  return SiteCommandV1(
    commandId: commandId,
    workspaceId: 'workspace-1',
    siteId: 'site-1',
    actorId: 'actor-1',
    deviceId: 'device-1',
    aggregateType: 'stock',
    aggregateId: 'product-1',
    expectedVersion: 0,
    commandType: 'reserve_stock',
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: '5' * 64,
    issuedAt: '2026-10-31T12:00:00.000Z',
    signingKeyId: 'key-1',
    signatureAlgorithm: 'ed25519',
    signature: signature.isEmpty ? 'A' * 86 : signature,
  );
}

SiteCommandV1 _reservationCommand({
  String commandId = 'command-restore-cart',
  String reservationId = 'reservation-restore-cart',
  String subjectId = 'restore-cart',
}) {
  final reservation = ConnectedStockReservationV1.held(
    reservationId: reservationId,
    workspaceId: 'workspace-1',
    siteId: 'site-1',
    actorId: 'actor-1',
    deviceId: 'device-1',
    workflowType: ConnectedStockWorkflowType.retailCart,
    subjectId: subjectId,
    capability: ShopStaffCapability.counterSale,
    lines: [
      ConnectedStockReservationLineV1(productId: 'product-1', quantity: 1),
    ],
    issuedAt: '2026-10-31T12:00:00.000Z',
    expiresAt: '2026-10-31T12:30:00.000Z',
  );
  final payload = <String, Object?>{
    'contract': 'supermega.shop.connected-stock-reserve.v1',
    'reservation': reservation.toJson(),
  };
  return SiteCommandV1(
    commandId: commandId,
    workspaceId: 'workspace-1',
    siteId: 'site-1',
    actorId: 'actor-1',
    deviceId: 'device-1',
    aggregateType: ConnectedStockWorkflowType.retailCart.name,
    aggregateId: reservation.subjectId,
    expectedVersion: 0,
    commandType: shopRetailStockReserveCommandType,
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: '5' * 64,
    issuedAt: '2026-10-31T12:00:00.000Z',
    signingKeyId: 'key-1',
    signatureAlgorithm: 'ed25519',
    signature: 'A' * 86,
  );
}

class _ApprovalVerifier implements ConnectedCoordinatorApprovalVerifier {
  const _ApprovalVerifier();
  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async =>
      authorityKeyId == 'authority-1' &&
      signature == 'A' * 86 &&
      crypto.sha256.convert(utf8.encode(canonicalEvidence)).bytes.isNotEmpty;
}
