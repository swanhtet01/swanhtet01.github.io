import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_qa_metrics_evidence.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';

const _session = '11111111111111111111111111111111';
const _target =
    '2222222222222222222222222222222222222222222222222222222222222222';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory support;
  late Directory temporary;
  late ShopRuntimeScope scope;
  late ShopDatabase database;
  late ShopQaMetricsEvidenceStore store;
  late _TestMetricsAuthority authority;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    support = await Directory.systemTemp.createTemp('shop-qa-metrics-');
    temporary = await Directory.systemTemp.createTemp('shop-qa-metrics-tmp-');
    scope = await _qaScope(support, temporary);
    database = ShopDatabase(NativeDatabase.memory());
    authority = await _TestMetricsAuthority.create();
    store = ShopQaMetricsEvidenceStore.forRuntime(scope, authority: authority);
  });

  tearDown(() async {
    await database.close();
    if (await support.exists()) await support.delete(recursive: true);
    if (await temporary.exists()) await temporary.delete(recursive: true);
  });

  test(
    'records empty, stocked, and sold snapshots without database side effects',
    () async {
      final before = await database.readQaMetricsSnapshot();
      expect(before.counts, <String, int>{
        'sales': 0,
        'stockMovements': 0,
        'receipts': 0,
        'outbox': 0,
        'onHand': 0,
        'shifts': 0,
      });
      final initial = await _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '5',
      );
      final afterInitial = await database.readQaMetricsSnapshot();
      expect(initial.counts, before.counts);
      expect(initial.snapshotSha256, before.snapshotSha256);
      expect(afterInitial.snapshotSha256, before.snapshotSha256);
      expect(await store.read(), hasLength(1));

      await _addFictionalProduct(database);
      final beforePre = await database.readQaMetricsSnapshot();
      expect(beforePre.counts, <String, int>{
        'sales': 0,
        'stockMovements': 1,
        'receipts': 0,
        'outbox': 1,
        'onHand': 3,
        'shifts': 0,
      });
      final pre = await _observe(
        store,
        database,
        step: 'observe_pre_sale',
        sequence: 7,
        requestDigit: '7',
      );
      final afterPre = await database.readQaMetricsSnapshot();
      expect(pre.counts, beforePre.counts);
      expect(pre.snapshotSha256, beforePre.snapshotSha256);
      expect(afterPre.snapshotSha256, beforePre.snapshotSha256);
      expect(await store.read(), hasLength(2));

      await database.recordCashSale(
        operationId: 'private-sale-operation',
        lines: const [
          ShopSaleLineInput(
            productId: 'private-product-row-value',
            quantity: 1,
          ),
        ],
      );
      final beforePost = await database.readQaMetricsSnapshot();
      expect(beforePost.counts, <String, int>{
        'sales': 1,
        'stockMovements': 2,
        'receipts': 1,
        'outbox': 2,
        'onHand': 2,
        'shifts': 0,
      });
      final post = await _observe(
        store,
        database,
        step: 'observe_post_sale',
        sequence: 9,
        requestDigit: '9',
      );
      final afterPost = await database.readQaMetricsSnapshot();

      expect(post.counts, beforePost.counts);
      expect(afterPost.snapshotSha256, beforePost.snapshotSha256);
      expect(post.counts['sales'], 1);
      // Opening stock and the sale are both immutable stock movements.
      expect(post.counts['stockMovements'], 2);
      expect(post.counts['receipts'], 1);
      expect(post.counts['onHand'], 2);
      expect(post.storeIdentitySha256, before.storeIdentitySha256);
      final readback = await store.read();
      expect(readback.map((record) => record.step).toList(), <String>[
        'observe_pre_product',
        'observe_pre_sale',
        'observe_post_sale',
      ]);
      expect(readback.map((record) => record.sequence).toList(), <int>[
        5,
        7,
        9,
      ]);
      expect(readback.map((record) => record.protocolVersion).toList(), <int>[
        2,
        2,
        2,
      ]);
      expect(readback.map((record) => record.snapshotSha256).toList(), <String>[
        before.snapshotSha256,
        beforePre.snapshotSha256,
        beforePost.snapshotSha256,
      ]);

      final encoded = await store.evidenceFile.readAsString();
      for (final forbidden in <String>[
        'private-product-row-value',
        'PRIVATE CUSTOMER PAYMENT RECEIPT CONTENT',
        'private-sale-operation',
        'productName',
        'customer',
        'paymentMethod',
        'receiptText',
      ]) {
        expect(encoded, isNot(contains(forbidden)));
      }
    },
  );

  test(
    'restart preserves evidence and rejects replay and substitution',
    () async {
      await _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '5',
      );
      final restarted = ShopQaMetricsEvidenceStore.forRuntime(
        scope,
        authority: authority,
      );
      expect(await restarted.read(), hasLength(1));
      await expectLater(
        _observe(
          restarted,
          database,
          step: 'observe_pre_sale',
          sequence: 7,
          requestDigit: '5',
        ),
        throwsStateError,
      );
      await expectLater(
        restarted.observe(
          database: database,
          protocolVersion: 2,
          sessionNonce: '99999999999999999999999999999999',
          requestDigest: '6' * 64,
          targetId: _target,
          authorityDigest: store.authorityDigest,
          sequence: 7,
          step: 'observe_pre_sale',
        ),
        throwsStateError,
      );
      await expectLater(
        restarted.observe(
          database: database,
          protocolVersion: 2,
          sessionNonce: _session,
          requestDigest: '7' * 64,
          targetId: '9' * 64,
          authorityDigest: store.authorityDigest,
          sequence: 7,
          step: 'observe_pre_sale',
        ),
        throwsStateError,
      );
      await expectLater(
        restarted.observe(
          database: database,
          protocolVersion: 2,
          sessionNonce: _session,
          requestDigest: '8' * 64,
          targetId: _target,
          authorityDigest: '7' * 64,
          sequence: 7,
          step: 'observe_pre_sale',
        ),
        throwsStateError,
      );
    },
  );

  test('invalid first and skipped protocol checkpoints fail closed', () async {
    await expectLater(
      _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 4,
        requestDigit: '4',
      ),
      throwsStateError,
    );
    await expectLater(
      _observe(
        store,
        database,
        step: 'observe_post_sale',
        sequence: 9,
        requestDigit: '9',
      ),
      throwsStateError,
    );
    await expectLater(
      _observe(
        store,
        database,
        step: 'observe_pre_sale',
        sequence: 7,
        requestDigit: '7',
      ),
      throwsStateError,
    );
    await _observe(
      store,
      database,
      step: 'observe_pre_product',
      sequence: 5,
      requestDigit: '5',
    );
    await expectLater(
      _observe(
        store,
        database,
        step: 'observe_post_sale',
        sequence: 9,
        requestDigit: '9',
      ),
      throwsStateError,
    );
    await expectLater(
      _observe(
        store,
        database,
        step: 'observe_restored_state',
        sequence: 24,
        requestDigit: '8',
      ),
      throwsStateError,
    );
    expect(await store.read(), hasLength(1));
  });

  test(
    'signed observations cannot be spliced into an invalid sequence',
    () async {
      await _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '5',
      );
      final preRoot = jsonDecode(
        await store.evidenceFile.readAsString(),
      ) as Map<String, dynamic>;
      final pre = (preRoot['observations'] as List<dynamic>).single;
      await store.evidenceFile.delete();
      await _observe(
        store,
        database,
        step: 'observe_restored_state',
        sequence: 24,
        requestDigit: '8',
      );
      final restoredRoot = jsonDecode(
        await store.evidenceFile.readAsString(),
      ) as Map<String, dynamic>;
      final restored = (restoredRoot['observations'] as List<dynamic>).single;
      final spliced = <Object?>[pre, restored];
      restoredRoot['observations'] = spliced;
      restoredRoot['inventorySha256'] = _sha256Json(spliced);
      await store.evidenceFile.writeAsString(
        jsonEncode(restoredRoot),
        flush: true,
      );
      await expectLater(store.read(), throwsStateError);
    },
  );

  test('concurrent duplicate requests are consumed exactly once', () async {
    final outcomes = await Future.wait(<Future<bool>>[
      for (var index = 0; index < 2; index += 1)
        _observe(
          store,
          database,
          step: 'observe_pre_product',
          sequence: 5,
          requestDigit: '5',
        ).then((_) => true).catchError((Object _) => false),
    ]);
    expect(outcomes.where((accepted) => accepted), hasLength(1));
    expect(await store.read(), hasLength(1));
    expect((await database.readQaMetricsSnapshot()).counts['sales'], 0);
  });

  test(
    'tampered content and privacy-shaped extra fields fail closed',
    () async {
      await _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '5',
      );
      final decoded = jsonDecode(
        await store.evidenceFile.readAsString(),
      ) as Map<String, dynamic>;
      final observations = decoded['observations'] as List<dynamic>;
      (observations.single as Map<String, dynamic>)['customer'] = 'forbidden';
      await store.evidenceFile.writeAsString(jsonEncode(decoded), flush: true);
      await expectLater(store.read(), throwsStateError);

      await store.evidenceFile.delete();
      await _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '6',
      );
      final digestTamper = jsonDecode(
        await store.evidenceFile.readAsString(),
      ) as Map<String, dynamic>;
      final record =
          (digestTamper['observations'] as List<dynamic>).single
              as Map<String, dynamic>;
      (record['counts'] as Map<String, dynamic>)['sales'] = 99;
      final unsigned = Map<String, dynamic>.from(record)
        ..remove('observationSha256')
        ..remove('authoritySignature');
      record['observationSha256'] = _sha256Json(<String, Object>{
        'contract': ShopQaMetricsEvidenceStore.contract,
        'profileId': scope.configuration.profileId,
        'platformIdentity': scope.configuration.platformIdentity,
        'observation': unsigned,
      });
      digestTamper['inventorySha256'] = _sha256Json(
        digestTamper['observations']!,
      );
      await store.evidenceFile.writeAsString(
        jsonEncode(digestTamper),
        flush: true,
      );
      await expectLater(store.read(), throwsStateError);
    },
  );

  test(
    'backup restores the same database snapshot but not metrics sidecar',
    () async {
      await _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '5',
      );
      await _addFictionalProduct(database);
      await _observe(
        store,
        database,
        step: 'observe_pre_sale',
        sequence: 7,
        requestDigit: '7',
      );
      await database.recordCashSale(
        operationId: 'restore-sale',
        lines: const [
          ShopSaleLineInput(
            productId: 'private-product-row-value',
            quantity: 1,
          ),
        ],
      );
      final source = await database.readQaMetricsSnapshot();
      await _observe(
        store,
        database,
        step: 'observe_post_sale',
        sequence: 9,
        requestDigit: '9',
      );
      expect(await store.read(), hasLength(3));
      final archive = File('${temporary.path}/qa-metrics.smbak');
      await ShopBackup.exportEncrypted(
        database: database,
        archive: archive,
        password: 'synthetic metrics backup password',
        scratchRoot: scope.documentsRoot,
      );
      final restoredFile = File('${temporary.path}/restored.sqlite');
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: restoredFile,
        password: 'synthetic metrics backup password',
      );
      final restored = ShopDatabase(NativeDatabase(restoredFile));
      addTearDown(restored.close);
      await restored.verifyReadyForUse();
      final restoredSnapshot = await restored.readQaMetricsSnapshot();
      expect(restoredSnapshot.snapshotSha256, source.snapshotSha256);
      expect(restoredSnapshot.counts, source.counts);

      // A fresh installed target has a fresh evidence sidecar and may start at
      // the restored-state protocol checkpoint.
      await store.evidenceFile.delete();
      final restoredObservation = await _observe(
        store,
        restored,
        step: 'observe_restored_state',
        sequence: 24,
        requestDigit: '8',
      );
      expect(restoredObservation.snapshotSha256, source.snapshotSha256);
      final restoredReadback = await store.read();
      expect(restoredReadback, hasLength(1));
      expect(restoredReadback.single.step, 'observe_restored_state');
    },
  );

  test('production and legacy protocol bindings fail closed', () async {
    final production = await ShopRuntimeScope.resolve(
      ShopRuntimeProfile.production,
      configuration: ShopRuntimeConfiguration.resolve(
        runtimeProfile: 'production',
        qaProfile: '',
        buildIdentityProfile: 'production',
        buildIdentityQaProfile: '',
        platformIdentity: 'production-current',
      ),
      documentsProvider: () async => support,
      temporaryProvider: () async => temporary,
    );
    expect(
      () => ShopQaMetricsEvidenceStore.forRuntime(
        production,
        authority: authority,
      ),
      throwsStateError,
    );
    await expectLater(
      store.observe(
        database: database,
        protocolVersion: 1,
        sessionNonce: _session,
        requestDigest: '4' * 64,
        targetId: _target,
        authorityDigest: store.authorityDigest,
        sequence: 5,
        step: 'observe_pre_product',
      ),
      throwsStateError,
    );
  });

  test('legacy v1 contract tag is rejected in a v2 inventory', () async {
    await _observe(
      store,
      database,
      step: 'observe_pre_product',
      sequence: 5,
      requestDigit: '5',
    );
    final oldInventory = jsonDecode(
      await store.evidenceFile.readAsString(),
    ) as Map<String, dynamic>;
    oldInventory['contract'] = 'supermega.shop.synthetic-qa-metrics.v1';
    await store.evidenceFile.writeAsString(
      jsonEncode(oldInventory),
      flush: true,
    );
    await expectLater(store.read(), throwsStateError);
  });

  test('legacy v1 sidecar is not imported or deleted by v2', () async {
    final legacyFile = File(
      '${scope.syntheticEvidenceRoot!.path}${Platform.pathSeparator}'
      'SuperMega-Shop-SYNTHETIC-QA-METRICS-v1.json',
    );
    final legacyContents = jsonEncode(<String, Object>{
      'contract': 'supermega.shop.synthetic-qa-metrics.v1',
      'profileId': scope.configuration.profileId,
      'platformIdentity': scope.configuration.platformIdentity,
      'observations': const <Object?>[],
      'inventorySha256': _sha256Json(const <Object?>[]),
    });
    await legacyFile.writeAsString(legacyContents, flush: true);
    expect(await store.read(), isEmpty);
    await _observe(
      store,
      database,
      step: 'observe_pre_product',
      sequence: 5,
      requestDigit: '5',
    );
    expect(await store.read(), hasLength(1));
    expect(await legacyFile.readAsString(), legacyContents);
  });

  test('symlinked evidence destination fails closed', () async {
    final outside = File('${temporary.path}/outside.json');
    await outside.writeAsString('{}');
    await Link(store.evidenceFile.path).create(outside.path);
    await expectLater(
      _observe(
        store,
        database,
        step: 'observe_pre_product',
        sequence: 5,
        requestDigit: '5',
      ),
      throwsStateError,
    );
    expect(await outside.readAsString(), '{}');
  });
}

Future<void> _addFictionalProduct(ShopDatabase database) => database.addProduct(
  id: 'private-product-row-value',
  name: 'PRIVATE CUSTOMER PAYMENT RECEIPT CONTENT',
  priceMmk: 1200,
  openingStock: 3,
);

Future<ShopQaMetricsObservation> _observe(
  ShopQaMetricsEvidenceStore store,
  ShopDatabase database, {
  required String step,
  required int sequence,
  required String requestDigit,
}) => store.observe(
  database: database,
  protocolVersion: 2,
  sessionNonce: _session,
  requestDigest: requestDigit * 64,
  targetId: _target,
  authorityDigest: store.authorityDigest,
  sequence: sequence,
  step: step,
  now: DateTime.utc(2026, 11, 3, 1, sequence),
);

Future<ShopRuntimeScope> _qaScope(Directory support, Directory temporary) =>
    ShopRuntimeScope.resolve(
      ShopRuntimeProfile.syntheticQa,
      configuration: ShopRuntimeConfiguration.resolve(
        runtimeProfile: ShopRuntimeConfiguration.qaRuntimeToken,
        qaProfile: ShopRuntimeConfiguration.qaProfileId,
        buildIdentityProfile: ShopRuntimeConfiguration.qaRuntimeToken,
        buildIdentityQaProfile: ShopRuntimeConfiguration.qaProfileId,
        platformIdentity: 'dev.supermega.supermega_shop.qa',
      ),
      supportProvider: () async => support,
      temporaryProvider: () async => temporary,
    );

String _sha256Json(Object value) =>
    crypto.sha256.convert(utf8.encode(jsonEncode(value))).toString();

final class _TestMetricsAuthority implements ShopQaMetricsEvidenceAuthority {
  _TestMetricsAuthority._(this._keyPair, this._publicKey);

  final SimpleKeyPair _keyPair;
  final SimplePublicKey _publicKey;
  final Ed25519 _algorithm = Ed25519();

  static Future<_TestMetricsAuthority> create() async {
    final algorithm = Ed25519();
    final keyPair = await algorithm.newKeyPairFromSeed(List<int>.filled(32, 7));
    return _TestMetricsAuthority._(keyPair, await keyPair.extractPublicKey());
  }

  @override
  String get authorityDigest =>
      crypto.sha256.convert(_publicKey.bytes).toString();

  @override
  Future<String> sign(List<int> message) async =>
      base64Encode((await _algorithm.sign(message, keyPair: _keyPair)).bytes);

  @override
  Future<bool> verify(List<int> message, String signature) => _algorithm.verify(
    message,
    signature: Signature(base64Decode(signature), publicKey: _publicKey),
  );
}
