import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'startup accepts only exact generated production or QA tuples',
    () async {
      final productionDocuments = await Directory.systemTemp.createTemp(
        'shop-startup-prod-docs-',
      );
      final productionTemporary = await Directory.systemTemp.createTemp(
        'shop-startup-prod-temp-',
      );
      final qaSupport = await Directory.systemTemp.createTemp(
        'shop-startup-qa-support-',
      );
      final qaTemporary = await Directory.systemTemp.createTemp(
        'shop-startup-qa-temp-',
      );
      addTearDown(() async {
        await productionDocuments.delete(recursive: true);
        await productionTemporary.delete(recursive: true);
        await qaSupport.delete(recursive: true);
        await qaTemporary.delete(recursive: true);
      });

      final production = await resolveShopRuntimeScopeForStartup(
        documentsProvider: () async => productionDocuments,
        temporaryProvider: () async => productionTemporary,
      );
      expect(production.configuration.profile, ShopRuntimeProfile.production);
      expect(production.documentsRoot.path, productionDocuments.path);

      final qa = await resolveShopRuntimeScopeForStartup(
        configurationProvider: _qaProfile,
        supportProvider: () async => qaSupport,
        temporaryProvider: () async => qaTemporary,
      );
      expect(qa.configuration.profile, ShopRuntimeProfile.syntheticQa);
      expect(qa.documentsRoot.path, contains('synthetic-qa-v1'));
    },
  );

  test(
    'invalid startup tuples fail before preferences or paths open',
    () async {
      for (final invalidConfiguration in <ShopRuntimeConfiguration Function()>[
        () => ShopRuntimeConfiguration.resolve(
          runtimeProfile: '',
          qaProfile: '',
          buildIdentityProfile: '',
          buildIdentityQaProfile: '',
          platformIdentity: '',
        ),
        () => ShopRuntimeConfiguration.resolve(
          runtimeProfile: ShopRuntimeConfiguration.qaRuntimeToken,
          qaProfile: '',
          buildIdentityProfile: ShopRuntimeConfiguration.qaRuntimeToken,
          buildIdentityQaProfile: ShopRuntimeConfiguration.qaProfileId,
          platformIdentity: 'dev.supermega.supermega_shop.qa',
        ),
        () => ShopRuntimeConfiguration.resolve(
          runtimeProfile: 'production',
          qaProfile: '',
          buildIdentityProfile: 'production',
          buildIdentityQaProfile: '',
          platformIdentity: 'dev.example.unknown',
        ),
      ]) {
        var pathOpened = false;
        var preferencesOpened = false;
        await expectLater(
          resolveShopRuntimeScopeForStartup(
            configurationProvider: invalidConfiguration,
            documentsProvider: () async {
              pathOpened = true;
              return Directory.systemTemp;
            },
            supportProvider: () async {
              pathOpened = true;
              return Directory.systemTemp;
            },
            temporaryProvider: () async {
              pathOpened = true;
              return Directory.systemTemp;
            },
            preferencesProvider: () async {
              preferencesOpened = true;
              return SharedPreferences.getInstance();
            },
          ),
          throwsStateError,
        );
        expect(pathOpened, isFalse);
        expect(preferencesOpened, isFalse);
      }
    },
  );

  test(
    'production paths and preference keys remain byte-for-byte unchanged',
    () async {
      final documents = await Directory.systemTemp.createTemp(
        'shop-prod-docs-',
      );
      final temporary = await Directory.systemTemp.createTemp(
        'shop-prod-temp-',
      );
      addTearDown(() async {
        await documents.delete(recursive: true);
        await temporary.delete(recursive: true);
      });
      final scope = await ShopRuntimeScope.resolve(
        ShopRuntimeProfile.production,
        configuration: _productionProfile(),
        documentsProvider: () async => documents,
        temporaryProvider: () async => temporary,
      );

      expect(scope.documentsRoot.path, documents.path);
      expect(scope.temporaryRoot.path, temporary.path);
      expect(scope.syntheticEvidenceRoot, isNull);
      expect(scope.preferences.keys.localeMyanmar, 'shop_locale_myanmar');
      expect(
        scope.preferences.keys.pendingPickerIntent,
        'shop_pending_picker_intent',
      );
      expect(
        scope.preferences.keys.receiptPrinterHost,
        'shop_receipt_printer_host_v1',
      );
      expect(
        scope.preferences.keys.receiptPaperWidth,
        'shop_receipt_paper_width_v1',
      );
    },
  );

  test('QA creates disjoint roots and exact scoped preference keys', () async {
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    addTearDown(() async {
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
    });

    final scope = await ShopRuntimeScope.resolve(
      ShopRuntimeProfile.syntheticQa,
      configuration: _qaProfile(),
      supportProvider: () async => support,
      temporaryProvider: () async => temporary,
    );

    expect(scope.documentsRoot.path, contains('synthetic-qa-v1'));
    expect(scope.temporaryRoot.path, contains('synthetic-qa-v1'));
    expect(scope.documentsRoot.path, isNot(support.path));
    expect(scope.temporaryRoot.path, isNot(temporary.path));
    expect(
      scope.syntheticEvidenceRoot?.path,
      startsWith('${scope.documentsRoot.path}${Platform.pathSeparator}'),
    );
    expect(
      scope.preferences.keys.localeMyanmar,
      'qa.synthetic-qa-v1.shop_locale_myanmar',
    );

    final reopened = await ShopRuntimeScope.resolve(
      ShopRuntimeProfile.syntheticQa,
      configuration: _qaProfile(),
      supportProvider: () async => support,
      temporaryProvider: () async => temporary,
    );
    expect(reopened.documentsRoot.path, scope.documentsRoot.path);
  });

  test('pre-existing empty root without sentinel fails closed', () async {
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    addTearDown(() async {
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
    });
    await Directory('${support.path}${Platform.pathSeparator}synthetic-qa-v1')
        .create();

    await expectLater(
      ShopRuntimeScope.resolve(
        ShopRuntimeProfile.syntheticQa,
        configuration: _qaProfile(),
        supportProvider: () async => support,
        temporaryProvider: () async => temporary,
      ),
      throwsStateError,
    );
  });

  test('mismatched sentinel fails before preferences are opened', () async {
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    addTearDown(() async {
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
    });
    final qaRoot = Directory(
      '${support.path}${Platform.pathSeparator}synthetic-qa-v1',
    );
    await qaRoot.create();
    await File(
      '${qaRoot.path}${Platform.pathSeparator}'
      '.supermega-shop-runtime-scope.json',
    ).writeAsString(jsonEncode({'profileId': 'wrong'}));
    var preferencesOpened = false;

    await expectLater(
      ShopRuntimeScope.resolve(
        ShopRuntimeProfile.syntheticQa,
        configuration: _qaProfile(),
        supportProvider: () async => support,
        temporaryProvider: () async => temporary,
        preferencesProvider: () async {
          preferencesOpened = true;
          return SharedPreferences.getInstance();
        },
      ),
      throwsStateError,
    );
    expect(preferencesOpened, isFalse);
  });

  test('symlinked QA root is rejected without touching its target', () async {
    if (Platform.isWindows) return;
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    final outside = await Directory.systemTemp.createTemp('shop-qa-outside-');
    addTearDown(() async {
      await Link('${support.path}${Platform.pathSeparator}synthetic-qa-v1')
          .delete();
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
      await outside.delete(recursive: true);
    });
    await Link('${support.path}${Platform.pathSeparator}synthetic-qa-v1')
        .create(outside.path);

    await expectLater(
      ShopRuntimeScope.resolve(
        ShopRuntimeProfile.syntheticQa,
        configuration: _qaProfile(),
        supportProvider: () async => support,
        temporaryProvider: () async => temporary,
      ),
      throwsStateError,
    );
    expect(await outside.list().toList(), isEmpty);
  });

  test('database path with an unexpected directory fails closed', () async {
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    addTearDown(() async {
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
    });
    final first = await ShopRuntimeScope.resolve(
      ShopRuntimeProfile.syntheticQa,
      configuration: _qaProfile(),
      supportProvider: () async => support,
      temporaryProvider: () async => temporary,
    );
    final databaseName = const ['supermega', 'shop.sqlite'].join('_');
    await Directory(
      '${first.documentsRoot.path}${Platform.pathSeparator}$databaseName',
    ).create();

    await expectLater(
      ShopRuntimeScope.resolve(
        ShopRuntimeProfile.syntheticQa,
        configuration: _qaProfile(),
        supportProvider: () async => support,
        temporaryProvider: () async => temporary,
      ),
      throwsStateError,
    );
  });

  test('symlinked database and sidecar paths fail closed on reopen', () async {
    if (Platform.isWindows) return;
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    final outside = await Directory.systemTemp.createTemp('shop-qa-outside-');
    addTearDown(() async {
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
      await outside.delete(recursive: true);
    });
    final first = await ShopRuntimeScope.resolve(
      ShopRuntimeProfile.syntheticQa,
      configuration: _qaProfile(),
      supportProvider: () async => support,
      temporaryProvider: () async => temporary,
    );
    final databaseName = const ['supermega', 'shop.sqlite'].join('_');
    for (final name in [databaseName, '$databaseName-wal']) {
      final link = Link(
        '${first.documentsRoot.path}${Platform.pathSeparator}$name',
      );
      await link.create('${outside.path}${Platform.pathSeparator}$name');
      await expectLater(
        ShopRuntimeScope.resolve(
          ShopRuntimeProfile.syntheticQa,
          configuration: _qaProfile(),
          supportProvider: () async => support,
          temporaryProvider: () async => temporary,
        ),
        throwsStateError,
      );
      await link.delete();
    }
    expect(await outside.list().toList(), isEmpty);
  });

  test('symlinked synthetic evidence path fails closed on reopen', () async {
    if (Platform.isWindows) return;
    final support = await Directory.systemTemp.createTemp('shop-qa-support-');
    final temporary = await Directory.systemTemp.createTemp('shop-qa-temp-');
    final outside = await Directory.systemTemp.createTemp('shop-qa-outside-');
    addTearDown(() async {
      await support.delete(recursive: true);
      await temporary.delete(recursive: true);
      await outside.delete(recursive: true);
    });
    final first = await ShopRuntimeScope.resolve(
      ShopRuntimeProfile.syntheticQa,
      configuration: _qaProfile(),
      supportProvider: () async => support,
      temporaryProvider: () async => temporary,
    );
    await first.syntheticEvidenceRoot!.delete();
    await Link(first.syntheticEvidenceRoot!.path).create(outside.path);

    await expectLater(
      ShopRuntimeScope.resolve(
        ShopRuntimeProfile.syntheticQa,
        configuration: _qaProfile(),
        supportProvider: () async => support,
        temporaryProvider: () async => temporary,
      ),
      throwsStateError,
    );
    expect(await outside.list().toList(), isEmpty);
  });
}

ShopRuntimeConfiguration _productionProfile() =>
    ShopRuntimeConfiguration.resolve(
      runtimeProfile: 'production',
      qaProfile: '',
      buildIdentityProfile: 'production',
      buildIdentityQaProfile: '',
      platformIdentity: 'production-current',
    );

ShopRuntimeConfiguration _qaProfile() => ShopRuntimeConfiguration.resolve(
  runtimeProfile: ShopRuntimeConfiguration.qaRuntimeToken,
  qaProfile: ShopRuntimeConfiguration.qaProfileId,
  buildIdentityProfile: ShopRuntimeConfiguration.qaRuntimeToken,
  buildIdentityQaProfile: ShopRuntimeConfiguration.qaProfileId,
  platformIdentity: 'dev.supermega.supermega_shop.qa',
);
