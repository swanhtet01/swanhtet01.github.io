import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_database.dart';

const _workspace = 'workspace-authority-store';
const _site = 'site-authority-store';
const _device = 'device-authority-store';
const _now = 2000000000000;
const _password = 'authority backup password';

void main() {
  test('authority observation store is default-off and device-bound', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedDeviceAndRevocation(database);
      final scope = _scope();
      final delta = _delta();
      await expectLater(
        ShopConnectedSiteAuthorityDeltaStore(
          database: database,
          nowMillis: () => _now,
        ).apply(scope, delta),
        _throwsCode('connected_site_authority_delta_disabled'),
      );
      await database.customUpdate(
        "UPDATE shop_site_devices SET state = 'revoked', "
        'revoked_at_millis = ? WHERE device_id = ?',
        variables: const [Variable<int>(_now - 500), Variable<String>(_device)],
      );
      await expectLater(
        ShopConnectedSiteAuthorityDeltaStore(
          database: database,
          nowMillis: () => _now,
          runtimeEnabled: true,
        ).apply(scope, delta),
        _throwsCode('connected_site_authority_delta_device_unbound'),
      );
    } finally {
      await database.close();
    }
  });

  test('authority history is monotonic, immutable and replay-safe', () async {
    var clock = _now;
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedDeviceAndRevocation(database);
      final store = ShopConnectedSiteAuthorityDeltaStore(
        database: database,
        nowMillis: () => clock++,
        runtimeEnabled: true,
      );
      await store.apply(_scope(), _delta());
      await store.apply(_scope(), _delta());
      expect(await _count(database, 'shop_site_authority_deltas'), 1);

      await store.apply(
        _scope(),
        _delta(configurationVersion: 2, configurationSeed: 'config-two'),
      );
      await store.apply(
        _scope(),
        _delta(
          revocationGeneration: 2,
          membershipSeed: 'membership-two',
          configurationVersion: 2,
          configurationSeed: 'config-two',
        ),
      );
      expect(await _count(database, 'shop_site_authority_deltas'), 3);
      final revocation = await database
          .customSelect(
            'SELECT generation, source_digest FROM '
            'shop_site_revocation_observations WHERE tenant_id = ? AND site_id = ?',
            variables: const [
              Variable<String>(_workspace),
              Variable<String>(_site),
            ],
          )
          .getSingle();
      expect(revocation.read<int>('generation'), 2);
      expect(
        revocation.read<String>('source_digest'),
        (await database
                .customSelect(
                  'SELECT delta_digest FROM shop_site_authority_deltas '
                  'ORDER BY observation_sequence DESC LIMIT 1',
                )
                .getSingle())
            .read<String>('delta_digest'),
      );
      await database.verifyConnectedAuthorityEvidence();

      for (final statement in [
        "UPDATE shop_site_authority_deltas SET membership_digest = '${_digest('substituted')}' WHERE observation_sequence = 1",
        'DELETE FROM shop_site_authority_deltas WHERE observation_sequence = 1',
      ]) {
        await expectLater(
          database.customStatement(statement),
          throwsA(anything),
        );
      }
      expect(await _count(database, 'shop_site_authority_deltas'), 3);
    } finally {
      await database.close();
    }
  });

  test(
    'regression and substitution attempts fail without partial writes',
    () async {
      var clock = _now;
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedDeviceAndRevocation(database);
        final store = ShopConnectedSiteAuthorityDeltaStore(
          database: database,
          nowMillis: () => clock++,
          runtimeEnabled: true,
        );
        await store.apply(
          _scope(),
          _delta(
            revocationGeneration: 2,
            membershipSeed: 'membership-two',
            configurationVersion: 2,
            configurationSeed: 'config-two',
          ),
        );
        final attempts = [
          _delta(configurationVersion: 2, configurationSeed: 'config-two'),
          _delta(
            revocationGeneration: 2,
            membershipSeed: 'changed-at-same-generation',
            configurationVersion: 3,
            configurationSeed: 'config-three',
          ),
          _delta(
            revocationGeneration: 3,
            membershipSeed: 'membership-three',
            configurationVersion: 2,
            configurationSeed: 'changed-at-same-version',
          ),
        ];
        for (final attempt in attempts) {
          await expectLater(
            store.apply(_scope(), attempt),
            _throwsCode('connected_site_authority_delta_regressed'),
          );
        }
        await expectLater(
          store.apply(
            _scope(),
            ConnectedSiteAuthorityDelta(
              workspaceId: 'other-workspace',
              siteId: _site,
              revocationGeneration: 3,
              membershipDigest: _digest('membership-three'),
              configurationVersion: 3,
              configurationDigest: _digest('config-three'),
            ),
          ),
          _throwsCode('connected_site_authority_delta_scope_mismatch'),
        );
        expect(await _count(database, 'shop_site_authority_deltas'), 1);
        expect(
          (await database
                  .customSelect(
                    'SELECT generation FROM shop_site_revocation_observations',
                  )
                  .getSingle())
              .read<int>('generation'),
          2,
        );
        await database.verifyConnectedAuthorityEvidence();
      } finally {
        await database.close();
      }
    },
  );

  test(
    'late revocation write failure rolls back authority observation',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedDeviceAndRevocation(database);
        await database.customStatement('''
        CREATE TRIGGER test_authority_revocation_abort
        BEFORE UPDATE ON shop_site_revocation_observations
        BEGIN
          SELECT RAISE(ABORT, 'test_authority_revocation_abort');
        END
      ''');
        await expectLater(
          ShopConnectedSiteAuthorityDeltaStore(
            database: database,
            nowMillis: () => _now,
            runtimeEnabled: true,
          ).apply(_scope(), _delta()),
          throwsA(anything),
        );
        expect(await _count(database, 'shop_site_authority_deltas'), 0);
        final revocation = await database
            .customSelect(
              'SELECT generation, source_digest FROM '
              'shop_site_revocation_observations',
            )
            .getSingle();
        expect(revocation.read<int>('generation'), 1);
        expect(
          revocation.read<String>('source_digest'),
          _digest('bootstrap-revocation'),
        );
      } finally {
        await database.close();
      }
    },
  );

  test(
    'restart and encrypted restore retain semantic authority evidence',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-authority-v27-');
      final source = File('${root.path}/source.sqlite');
      final archive = File('${root.path}/authority.smbak');
      final restored = File('${root.path}/restored.sqlite');
      var database = ShopDatabase(NativeDatabase(source));
      try {
        await _seedDeviceAndRevocation(database);
        await ShopConnectedSiteAuthorityDeltaStore(
          database: database,
          nowMillis: () => _now,
          runtimeEnabled: true,
        ).apply(_scope(), _delta());
        await database.close();

        database = ShopDatabase(NativeDatabase(source));
        await database.verifyReadyForUse();
        expect(await _count(database, 'shop_site_authority_deltas'), 1);
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: _password,
          scratchRoot: root,
        );
        await database.close();

        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: _password,
        );
        ShopBackup.verifySnapshot(restored);
        database = ShopDatabase(NativeDatabase(restored));
        await database.verifyReadyForUse();
        expect(await _count(database, 'shop_site_authority_deltas'), 1);
        expect(
          (await database
                  .customSelect(
                    'SELECT generation FROM shop_site_revocation_observations',
                  )
                  .getSingle())
              .read<int>('generation'),
          1,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('authority observation cannot mutate financial state', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'authority-product',
        name: 'Authority Product',
        priceMmk: 1500,
        openingStock: 4,
      );
      await database.recordCashSale(
        operationId: 'authority-sale',
        lines: const [
          ShopSaleLineInput(productId: 'authority-product', quantity: 1),
        ],
      );
      await _seedDeviceAndRevocation(database);
      final before = await _financialFingerprint(database);
      await ShopConnectedSiteAuthorityDeltaStore(
        database: database,
        nowMillis: () => _now,
        runtimeEnabled: true,
      ).apply(_scope(), _delta());
      expect(await _financialFingerprint(database), before);
    } finally {
      await database.close();
    }
  });

  test('non-canonical retained delta bytes fail live and backup verification', () async {
    final root = await Directory.systemTemp.createTemp('shop-authority-bytes-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedDeviceAndRevocation(database);
      await ShopConnectedSiteAuthorityDeltaStore(
        database: database,
        nowMillis: () => _now,
        runtimeEnabled: true,
      ).apply(_scope(), _delta());
      await database.close();

      final raw = sqlite3.open(file.path);
      try {
        final canonical =
            raw
                    .select('SELECT delta_json FROM shop_site_authority_deltas')
                    .single['delta_json']!
                as String;
        raw.execute('DROP TRIGGER shop_site_authority_deltas_no_update');
        raw.execute('UPDATE shop_site_authority_deltas SET delta_json = ?', [
          ' $canonical',
        ]);
        raw.execute(
          shopConnectedAuthoritySchemaDefinitionsV27()['shop_site_authority_deltas_no_update']!,
        );
      } finally {
        raw.close();
      }

      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
      expect(() => ShopBackup.verifySnapshot(file), throwsFormatException);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v26 migration preserves evidence and invents no authority delta', () async {
    final root = await Directory.systemTemp.createTemp('shop-authority-v26-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedDeviceAndRevocation(database);
      final oldSourceDigest =
          (await database
                  .customSelect(
                    'SELECT source_digest FROM shop_site_revocation_observations',
                  )
                  .getSingle())
              .read<String>('source_digest');
      for (final entry
          in shopConnectedAttemptSchemaDefinitionsV28().entries
              .toList()
              .reversed) {
        final type =
            canonicalShopSchemaSql(entry.value).startsWith('create table')
            ? 'TABLE'
            : 'TRIGGER';
        await database.customStatement('DROP $type IF EXISTS ${entry.key}');
      }
      for (final name
          in shopConnectedAuthoritySchemaDefinitionsV27().keys
              .toList()
              .reversed) {
        final type = name == 'shop_site_authority_deltas' ? 'TABLE' : 'TRIGGER';
        await database.customStatement('DROP $type IF EXISTS $name');
      }
      await database.customStatement('PRAGMA user_version = 26');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(await _count(database, 'shop_site_authority_deltas'), 0);
      expect(await _count(database, 'shop_site_devices'), 1);
      expect(
        (await database
                .customSelect(
                  'SELECT source_digest FROM shop_site_revocation_observations',
                )
                .getSingle())
            .read<String>('source_digest'),
        oldSourceDigest,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'v30 authority payload is default-off and verifier fail-closed',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedDeviceAndRevocation(database);
        final bytes = _authorityPayload();
        await expectLater(
          ShopConnectedSiteAuthorityPayloadStore(
            database: database,
            nowMillis: () => _now,
          ).apply(
            _scope(),
            canonicalPayloadBytes: bytes,
            signature: _signature,
          ),
          _throwsCode('connected_site_authority_payload_disabled'),
        );
        await expectLater(
          ShopConnectedSiteAuthorityPayloadStore(
            database: database,
            nowMillis: () => _now,
            runtimeEnabled: true,
          ).apply(
            _scope(),
            canonicalPayloadBytes: bytes,
            signature: _signature,
          ),
          _throwsCode('connected_site_authority_payload_verifier_unavailable'),
        );
        expect(await _count(database, 'shop_site_authority_payloads'), 0);
      } finally {
        await database.close();
      }
    },
  );

  test('v30 payload atomically links projections and rejects replay, gaps, scope and escalation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    var clock = _now;
    try {
      await _seedDeviceAndRevocation(database);
      final store = ShopConnectedSiteAuthorityPayloadStore(
        database: database,
        nowMillis: () => clock++,
        verifier: const _AllowAuthorityVerifier(),
        runtimeEnabled: true,
      );
      final first = _authorityPayload();
      await store.apply(
        _scope(),
        canonicalPayloadBytes: first,
        signature: _signature,
      );
      await expectLater(
        database.customStatement(
          'INSERT INTO shop_site_authority_payloads '
          '(tenant_id, site_id, authority_sequence, authority_event_id, '
          'previous_authority_digest, issuer_key_id, issued_at_millis, '
          'payload_bytes, payload_digest, signature, membership_digest, '
          'configuration_digest, revocation_generation, configuration_version, '
          'observation_sequence, observed_at_millis) '
          "SELECT tenant_id, site_id, 2, 'duplicate-observation', "
          'payload_digest, issuer_key_id, issued_at_millis, payload_bytes, ?, '
          'signature, membership_digest, configuration_digest, '
          'revocation_generation, configuration_version, observation_sequence, '
          'observed_at_millis + 1 FROM shop_site_authority_payloads '
          'WHERE tenant_id = ? AND site_id = ?',
          [_digest('distinct-payload'), _workspace, _site],
        ),
        throwsA(anything),
      );
      await store.apply(
        _scope(),
        canonicalPayloadBytes: first,
        signature: _signature,
      );
      expect(await _count(database, 'shop_site_authority_payloads'), 1);
      expect(await _count(database, 'shop_site_authority_members'), 1);
      expect(await _count(database, 'shop_site_configuration_snapshots'), 1);
      expect(await _count(database, 'shop_site_authority_deltas'), 1);
      final leaseIssuedAt = DateTime.fromMillisecondsSinceEpoch(
        _now - 1000,
        isUtc: true,
      ).toIso8601String();
      final leaseExpiresAt = DateTime.fromMillisecondsSinceEpoch(
        _now + 1000,
        isUtc: true,
      ).toIso8601String();
      final leaseUnsigned = <String, Object>{
        'protocolVersion': 1,
        'leaseId': 'lease-one',
        'workspaceId': _workspace,
        'siteId': _site,
        'actorId': 'actor-one',
        'role': 'cashierCounter',
        'capabilities': const ['counterSale'],
        'deviceId': _device,
        'sessionGeneration': 1,
        'revocationGeneration': 1,
        'issuedAt': leaseIssuedAt,
        'expiresAt': leaseExpiresAt,
        'issuerKeyId': 'issuer-test-key',
      };
      final lease = OfflineStaffLeaseV1(
        leaseId: 'lease-one',
        workspaceId: _workspace,
        siteId: _site,
        actorId: 'actor-one',
        role: 'cashierCounter',
        capabilities: const ['counterSale'],
        deviceId: _device,
        sessionGeneration: 1,
        revocationGeneration: 1,
        issuedAt: leaseIssuedAt,
        expiresAt: leaseExpiresAt,
        issuerKeyId: 'issuer-test-key',
        payloadDigest: connectedSiteSha256(leaseUnsigned),
        signature: _signature,
      );
      await store.requireLeaseCurrent(lease);

      await expectLater(
        store.apply(
          _scope(),
          canonicalPayloadBytes: _authorityPayload(actor: 'actor-changed'),
          signature: _signature,
        ),
        _throwsCode('connected_site_authority_payload_changed_replay'),
      );
      await expectLater(
        store.apply(
          _scope(),
          canonicalPayloadBytes: _authorityPayload(
            sequence: 2,
            previousDigest: _digest(first),
            actor: 'actor-changed',
          ),
          signature: _signature,
        ),
        _throwsCode('connected_site_authority_payload_regressed'),
      );
      await expectLater(
        store.apply(
          _scope(),
          canonicalPayloadBytes: _authorityPayload(
            sequence: 2,
            previousDigest: _digest(first),
            issuedAtMillis: _now - const Duration(days: 8).inMilliseconds,
          ),
          signature: _signature,
        ),
        _throwsCode('connected_site_authority_payload_stale'),
      );

      await expectLater(
        store.apply(
          _scope(),
          canonicalPayloadBytes: _authorityPayload(
            sequence: 3,
            previousDigest: _digest(first),
          ),
          signature: _signature,
        ),
        _throwsCode('connected_site_authority_payload_sequence'),
      );
      await expectLater(
        store.apply(
          ConnectedSiteScope(
            workspaceId: 'other-tenant',
            siteId: _site,
            deviceId: _device,
          ),
          canonicalPayloadBytes: _authorityPayload(
            sequence: 2,
            previousDigest: _digest(first),
          ),
          signature: _signature,
        ),
        _throwsCode('connected_site_authority_payload_scope_mismatch'),
      );
      expect(
        () => ConnectedSiteAuthorityPayloadV1.parse(
          canonicalBytes: _authorityPayload(
            role: 'stockStaff',
            capabilities: const ['counterSale'],
          ),
          signature: _signature,
        ),
        _throwsCode('connected_site_authority_payload_capability'),
      );
      expect(await _count(database, 'shop_site_authority_payloads'), 1);
      await store.apply(
        _scope(),
        canonicalPayloadBytes: _authorityPayload(
          sequence: 2,
          previousDigest: _digest(first),
          revocationGeneration: 2,
          configurationVersion: 2,
        ),
        signature: _signature,
      );
      expect(await _count(database, 'shop_site_authority_payloads'), 2);
      await expectLater(
        store.requireLeaseCurrent(lease),
        _throwsCode('connected_site_authority_payload_lease_stale'),
      );
      await database.verifyConnectedAuthorityEvidence();
    } finally {
      await database.close();
    }
  });

  test('v30 authority scopes isolate two tenants', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedDeviceAndRevocation(database);
      await _seedDeviceAndRevocation(
        database,
        workspace: 'workspace-two',
        site: _site,
        device: 'device-two',
        seed: 'two',
      );
      final store = ShopConnectedSiteAuthorityPayloadStore(
        database: database,
        nowMillis: () => _now,
        verifier: const _AllowAuthorityVerifier(),
        runtimeEnabled: true,
      );
      await store.apply(
        _scope(),
        canonicalPayloadBytes: _authorityPayload(),
        signature: _signature,
      );
      await store.apply(
        ConnectedSiteScope(
          workspaceId: 'workspace-two',
          siteId: _site,
          deviceId: 'device-two',
        ),
        canonicalPayloadBytes: _authorityPayload(
          workspace: 'workspace-two',
          site: _site,
        ),
        signature: _signature,
      );
      expect(await _count(database, 'shop_site_authority_payloads'), 2);
      final eventIds = await database
          .customSelect(
            'SELECT authority_event_id FROM shop_site_authority_payloads '
            'ORDER BY tenant_id',
          )
          .get();
      expect(
        eventIds.map((row) => row.read<String>('authority_event_id')),
        everyElement('authority-event-1'),
      );
      await database.verifyConnectedAuthorityEvidence();
    } finally {
      await database.close();
    }
  });

  test(
    'v30 payload survives encrypted backup and tampering fails closed',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-authority-v30-');
      final source = File('${root.path}/source.sqlite');
      final archive = File('${root.path}/authority.smbak');
      final restored = File('${root.path}/restored.sqlite');
      var database = ShopDatabase(NativeDatabase(source));
      try {
        await _seedDeviceAndRevocation(database);
        await ShopConnectedSiteAuthorityPayloadStore(
          database: database,
          nowMillis: () => _now,
          verifier: const _AllowAuthorityVerifier(),
          runtimeEnabled: true,
        ).apply(
          _scope(),
          canonicalPayloadBytes: _authorityPayload(),
          signature: _signature,
        );
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: _password,
          scratchRoot: root,
        );
        await database.close();
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: _password,
        );
        ShopBackup.verifySnapshot(restored);
        database = ShopDatabase(NativeDatabase(restored));
        await database.verifyReadyForUse();
        expect(await _count(database, 'shop_site_authority_payloads'), 1);
        await expectLater(
          ShopConnectedSiteAuthorityPayloadStore(
            database: database,
            nowMillis: () => _now,
          ).reverifyRetainedPayloads(),
          _throwsCode('connected_site_authority_payload_verifier_unavailable'),
        );
        await ShopConnectedSiteAuthorityPayloadStore(
          database: database,
          nowMillis: () => _now,
          verifier: const _AllowAuthorityVerifier(),
        ).reverifyRetainedPayloads();
        await database.close();

        final raw = sqlite3.open(restored.path);
        try {
          raw.execute('DROP TRIGGER shop_site_authority_members_no_update');
          raw.execute(
            "UPDATE shop_site_authority_members SET actor_role = 'manager'",
          );
        } finally {
          raw.close();
        }
        expect(
          () => ShopBackup.verifySnapshot(restored),
          throwsFormatException,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('restore reverify rejects contract-invalid canonical bytes before signature verifier', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-authority-v30-contract-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedDeviceAndRevocation(database);
      await ShopConnectedSiteAuthorityPayloadStore(
        database: database,
        nowMillis: () => _now,
        verifier: const _AllowAuthorityVerifier(),
        runtimeEnabled: true,
      ).apply(
        _scope(),
        canonicalPayloadBytes: _authorityPayload(),
        signature: _signature,
      );
      await database.close();

      final raw = sqlite3.open(file.path);
      try {
        final original = jsonDecode(
          raw
                  .select(
                    'SELECT payload_bytes FROM shop_site_authority_payloads',
                  )
                  .single['payload_bytes']
              as String,
        ) as Map<String, dynamic>;
        final unsigned = Map<String, Object?>.from(original)
          ..remove('payloadDigest')
          ..['unexpectedAuthority'] = true;
        final invalidBytes = canonicalConnectedSiteJson({
          ...unsigned,
          'payloadDigest': connectedSiteSha256(unsigned),
        });
        raw.execute('DROP TRIGGER shop_site_authority_payloads_no_update');
        raw.execute(
          'UPDATE shop_site_authority_payloads '
          'SET payload_bytes = ?, payload_digest = ?',
          [invalidBytes, _digest(invalidBytes)],
        );
        raw.execute(
          shopConnectedAuthorityPayloadSchemaDefinitionsV30()['shop_site_authority_payloads_no_update']!,
        );
      } finally {
        raw.close();
      }
      ShopBackup.verifySnapshot(file);
      database = ShopDatabase(NativeDatabase(file));
      final verifier = _RecordingAuthorityVerifier();
      await expectLater(
        ShopConnectedSiteAuthorityPayloadStore(
          database: database,
          nowMillis: () => _now,
          verifier: verifier,
        ).reverifyRetainedPayloads(),
        _throwsCode('connected_site_authority_payload_shape'),
      );
      expect(verifier.calls, 0);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v29 migration creates empty v30 authority payload evidence', () async {
    final root = await Directory.systemTemp.createTemp('shop-authority-v29-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      for (final entry
          in shopConnectedAuthorityPayloadSchemaDefinitionsV30().entries
              .toList()
              .reversed) {
        final type =
            canonicalShopSchemaSql(entry.value).startsWith('create table')
            ? 'TABLE'
            : 'TRIGGER';
        await database.customStatement('DROP $type IF EXISTS ${entry.key}');
      }
      await database.customStatement('PRAGMA user_version = 29');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 30);
      expect(await _count(database, 'shop_site_authority_payloads'), 0);
      expect(await _count(database, 'shop_site_authority_members'), 0);
      expect(await _count(database, 'shop_site_configuration_snapshots'), 0);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });
}

ConnectedSiteScope _scope() => ConnectedSiteScope(
  workspaceId: _workspace,
  siteId: _site,
  deviceId: _device,
);

ConnectedSiteAuthorityDelta _delta({
  int revocationGeneration = 1,
  String membershipSeed = 'membership-one',
  int configurationVersion = 1,
  String configurationSeed = 'config-one',
}) => ConnectedSiteAuthorityDelta(
  workspaceId: _workspace,
  siteId: _site,
  revocationGeneration: revocationGeneration,
  membershipDigest: _digest(membershipSeed),
  configurationVersion: configurationVersion,
  configurationDigest: _digest(configurationSeed),
);

Matcher _throwsCode(String code) => throwsA(
  isA<ConnectedSiteReconciliationException>().having(
    (error) => error.code,
    'code',
    code,
  ),
);

Future<void> _seedDeviceAndRevocation(
  ShopDatabase database, {
  String workspace = _workspace,
  String site = _site,
  String device = _device,
  String seed = 'device-key',
}) async {
  await database.customInsert(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', ?)",
    variables: [
      Variable<String>(device),
      Variable<String>(workspace),
      Variable<String>(site),
      Variable<String>(_digest(seed)),
      const Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_revocation_observations '
    '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
    'VALUES (?, ?, 1, ?, ?)',
    variables: [
      Variable<String>(workspace),
      Variable<String>(site),
      const Variable<int>(_now - 1000),
      Variable<String>(_digest('bootstrap-revocation')),
    ],
  );
}

Future<int> _count(ShopDatabase database, String table) async =>
    (await database
            .customSelect('SELECT COUNT(*) AS total FROM $table')
            .getSingle())
        .read<int>('total');

Future<Map<String, List<Object?>>> _financialFingerprint(
  ShopDatabase database,
) async {
  final result = <String, List<Object?>>{};
  for (final table in const [
    'shop_products',
    'shop_sales',
    'shop_sale_lines',
    'shop_stock_movements',
    'shop_sync_outbox',
  ]) {
    result[table] =
        (await database
                .customSelect('SELECT * FROM $table ORDER BY rowid')
                .get())
            .map((row) => row.data.values)
            .expand((values) => values)
            .toList();
  }
  return result;
}

String _digest(String value) => sha256.convert(value.codeUnits).toString();

const _signature = '0123456789abcdef0123456789abcdef';

class _AllowAuthorityVerifier implements ConnectedSiteAuthorityPayloadVerifier {
  const _AllowAuthorityVerifier();

  @override
  Future<void> verify({
    required String canonicalPayloadBytes,
    required String signature,
    required String issuerKeyId,
  }) async {}
}

class _RecordingAuthorityVerifier
    implements ConnectedSiteAuthorityPayloadVerifier {
  int calls = 0;

  @override
  Future<void> verify({
    required String canonicalPayloadBytes,
    required String signature,
    required String issuerKeyId,
  }) async {
    calls++;
  }
}

String _authorityPayload({
  String workspace = _workspace,
  String site = _site,
  String actor = 'actor-one',
  String role = 'cashierCounter',
  List<String> capabilities = const ['counterSale'],
  int sequence = 1,
  String? previousDigest,
  int revocationGeneration = 1,
  int configurationVersion = 1,
  int issuedAtMillis = _now - 100,
}) {
  final unsigned = <String, Object?>{
    'authorityEventId': 'authority-event-$sequence',
    'authoritySequence': sequence,
    'configurationSnapshot': {
      'businessProfile': {
        'schemaId': 'supermega-business-profile',
        'templateId': 'retail',
        'templateVersion': 1,
      },
      'catalogReference': {
        'catalogDigest': _digest('catalog-$workspace-$configurationVersion'),
        'catalogVersion': configurationVersion,
      },
      'configurationVersion': configurationVersion,
    },
    'issuedAtMillis': issuedAtMillis,
    'issuerKeyId': 'issuer-test-key',
    'membershipSnapshot': {
      'members': [
        {
          'actorId': actor,
          'capabilities': [...capabilities]..sort(),
          'role': role,
          'sessionGeneration': 1,
        },
      ],
      'revocationGeneration': revocationGeneration,
    },
    'previousAuthorityDigest': previousDigest,
    'protocolVersion': 1,
    'schemaId': 'ConnectedSiteAuthorityPayloadV1',
    'siteId': site,
    'workspaceId': workspace,
  };
  return canonicalConnectedSiteJson({
    ...unsigned,
    'payloadDigest': connectedSiteSha256(unsigned),
  });
}
