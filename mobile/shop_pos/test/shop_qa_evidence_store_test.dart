import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_backup_export_screen.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_qa_evidence_store.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';

const _password = 'synthetic qa recovery password';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory support;
  late Directory temporary;
  late ShopRuntimeScope scope;
  late ShopQaEvidenceStore store;
  late ShopDatabase database;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    support = await Directory.systemTemp.createTemp(
      'shop-qa-evidence-support-',
    );
    temporary = await Directory.systemTemp.createTemp('shop-qa-evidence-temp-');
    scope = await _qaScope(support, temporary);
    store = ShopQaEvidenceStore.forTest(scope);
    database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'rice-001',
      name: 'Synthetic Rice',
      priceMmk: 75000,
      openingStock: 5,
    );
    await database.recordCashSale(
      operationId: 'synthetic-qa-sale-001',
      lines: const [ShopSaleLineInput(productId: 'rice-001', quantity: 2)],
    );
  });

  tearDown(() async {
    await database.close();
    if (await support.exists()) await support.delete(recursive: true);
    if (await temporary.exists()) await temporary.delete(recursive: true);
  });

  test(
    'QA envelope stages the original encrypted backup and restores once',
    () async {
      final envelope = await store.exportEncryptedBackup(
        database: database,
        password: _password,
        now: DateTime.utc(2026, 10, 26, 1, 2, 3),
      );

      expect(envelope.path, contains('SYNTHETIC-QA'));
      expect(envelope.path, endsWith('.smqa'));
      expect(
        envelope.parent.absolute.path,
        scope.syntheticEvidenceRoot!.absolute.path,
      );
      expect(
        await scope.temporaryRoot
            .list(recursive: true)
            .where((entry) => entry.path.endsWith('.smbak'))
            .toList(),
        isEmpty,
      );

      final staged = await store.stageLatestEncryptedBackup();
      expect(staged, isNotNull);
      expect(staged!.parent.absolute.path, scope.temporaryRoot.absolute.path);
      expect((await staged.readAsBytes()).sublist(0, 4), ascii.encode('SMBK'));

      final restoredFile = File(
        '${scope.documentsRoot.path}${Platform.pathSeparator}restored.sqlite',
      );
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: staged,
        target: restoredFile,
        password: _password,
      );
      final restored = ShopDatabase(NativeDatabase(restoredFile));
      addTearDown(restored.close);
      await restored.verifyReadyForUse();
      expect(await restored.countSales(), 1);
      expect((await restored.readActiveProducts()).single.onHand, 3);
    },
  );

  test(
    'payload tampering fails before an encrypted archive is staged',
    () async {
      final envelope = await store.exportEncryptedBackup(
        database: database,
        password: _password,
      );
      final bytes = await envelope.readAsBytes();
      bytes[bytes.length - 1] ^= 0xff;
      await envelope.writeAsBytes(bytes, flush: true);

      await expectLater(
        store.stageLatestEncryptedBackup(),
        throwsA(isA<FormatException>()),
      );
      expect(
        await scope.temporaryRoot
            .list(recursive: true)
            .where((entry) => entry.path.contains('qa-restore'))
            .toList(),
        isEmpty,
      );
    },
  );

  test('profile or platform mismatch fails before staging', () async {
    final envelope = await store.exportEncryptedBackup(
      database: database,
      password: _password,
    );
    final bytes = await envelope.readAsBytes();
    final headerLength = ByteData.sublistView(bytes, 4, 8).getUint32(0);
    final header = jsonDecode(
      utf8.decode(bytes.sublist(8, 8 + headerLength)),
    ) as Map<String, dynamic>;
    header['platformIdentity'] = 'dev.supermega.supermega_shop.qb';
    final changedHeader = utf8.encode(jsonEncode(header));
    expect(changedHeader.length, headerLength);
    bytes.setRange(8, 8 + headerLength, changedHeader);
    await envelope.writeAsBytes(bytes, flush: true);

    await expectLater(
      store.stageLatestEncryptedBackup(),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          'The QA evidence identity does not match.',
        ),
      ),
    );
  });

  test('renamed or multiple valid envelopes fail closed', () async {
    final first = await store.exportEncryptedBackup(
      database: database,
      password: _password,
      now: DateTime.utc(2026, 10, 26, 1, 2, 3),
    );
    final renamed = File(
      '${first.parent.path}${Platform.pathSeparator}'
      'SuperMega-Shop-SYNTHETIC-QA-20261026-010204-abcdef012345.smqa',
    );
    await first.rename(renamed.path);
    await expectLater(
      store.stageLatestEncryptedBackup(),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          'The QA evidence identity does not match.',
        ),
      ),
    );
    await renamed.delete();

    await store.exportEncryptedBackup(
      database: database,
      password: _password,
      now: DateTime.utc(2026, 10, 26, 1, 2, 3),
    );
    await store.exportEncryptedBackup(
      database: database,
      password: _password,
      now: DateTime.utc(2026, 10, 26, 1, 2, 4),
    );
    await expectLater(
      store.stageLatestEncryptedBackup(),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          'shop_qa_evidence_multiple_files',
        ),
      ),
    );
  });

  test(
    'missing, symlinked, and production evidence roots fail closed',
    () async {
      expect(await store.stageLatestEncryptedBackup(), isNull);

      if (!Platform.isWindows) {
        final outside = await Directory.systemTemp.createTemp(
          'shop-qa-evidence-outside-',
        );
        addTearDown(() async {
          if (await outside.exists()) await outside.delete(recursive: true);
        });
        final root = scope.syntheticEvidenceRoot!;
        await root.delete();
        await Link(root.path).create(outside.path);
        await expectLater(
          store.stageLatestEncryptedBackup(),
          throwsA(isA<StateError>()),
        );
        await Link(root.path).delete();
        await root.create();

        final outsideEvidence = File(
          '${outside.path}${Platform.pathSeparator}outside.smqa',
        );
        await outsideEvidence.writeAsBytes(const [1, 2, 3], flush: true);
        final planted = Link(
          '${root.path}${Platform.pathSeparator}'
          'SuperMega-Shop-SYNTHETIC-QA-20261026-010203-abcdef012345.smqa',
        );
        await planted.create(outsideEvidence.path);
        await expectLater(
          store.stageLatestEncryptedBackup(),
          throwsA(isA<StateError>()),
        );
        expect(await outsideEvidence.readAsBytes(), const [1, 2, 3]);
        await planted.delete();
        final unexpected = File(
          '${root.path}${Platform.pathSeparator}unreviewed.bin',
        );
        await unexpected.writeAsBytes(const [4, 5, 6], flush: true);
        await expectLater(
          store.stageLatestEncryptedBackup(),
          throwsA(isA<StateError>()),
        );
        await unexpected.delete();
      }

      final productionDocuments = await Directory.systemTemp.createTemp(
        'shop-qa-evidence-production-docs-',
      );
      final productionTemporary = await Directory.systemTemp.createTemp(
        'shop-qa-evidence-production-temp-',
      );
      addTearDown(() async {
        await productionDocuments.delete(recursive: true);
        await productionTemporary.delete(recursive: true);
      });
      final production = await ShopRuntimeScope.resolve(
        ShopRuntimeProfile.production,
        configuration: _productionConfiguration(),
        documentsProvider: () async => productionDocuments,
        temporaryProvider: () async => productionTemporary,
      );
      expect(
        () => ShopQaEvidenceStore.forTest(production),
        throwsA(isA<StateError>()),
      );
    },
  );

  test('QA export availability requires the scoped evidence store', () async {
    expect(
      ShopBackupExportScreen(
        database: database,
        myanmar: false,
        runtimeScope: scope,
        qaEvidenceStore: store,
      ).backupSavingAllowed,
      isTrue,
    );
    expect(
      ShopBackupExportScreen(
        database: database,
        myanmar: false,
        runtimeScope: scope,
      ).backupSavingAllowed,
      isFalse,
    );

    final foreignSupport = await Directory.systemTemp.createTemp(
      'shop-qa-evidence-foreign-support-',
    );
    final foreignTemporary = await Directory.systemTemp.createTemp(
      'shop-qa-evidence-foreign-temp-',
    );
    addTearDown(() async {
      await foreignSupport.delete(recursive: true);
      await foreignTemporary.delete(recursive: true);
    });
    final foreignScope = await _qaScope(foreignSupport, foreignTemporary);
    final foreignStore = ShopQaEvidenceStore.forTest(foreignScope);
    expect(() => foreignStore.requireBoundTo(scope), throwsStateError);
    expect(
      ShopBackupExportScreen(
        database: database,
        myanmar: false,
        runtimeScope: scope,
        qaEvidenceStore: foreignStore,
      ).backupSavingAllowed,
      isFalse,
    );
  });
}

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

ShopRuntimeConfiguration _productionConfiguration() =>
    ShopRuntimeConfiguration.resolve(
      runtimeProfile: 'production',
      qaProfile: '',
      buildIdentityProfile: 'production',
      buildIdentityQaProfile: '',
      platformIdentity: 'production-current',
    );
