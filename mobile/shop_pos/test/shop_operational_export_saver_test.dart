import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/shop_operational_export_saver.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'synthetic QA export fails before filesystem access or Save As',
    () async {
      final fixture = await _qaScopeFixture();
      addTearDown(fixture.dispose);
      var saveAsCalled = false;

      await expectLater(
        ShopOperationalExportSaver.save(
          runtimeScope: fixture.scope,
          bytes: Uint8List.fromList([0xef, 0xbb, 0xbf, 0x61]),
          shiftId: 'shift-001',
          now: DateTime.utc(2026, 10, 24, 12, 34, 56),
          saveAs: (_, _) async {
            saveAsCalled = true;
            return 'unexpected';
          },
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'shop_synthetic_operational_export_write_disabled',
          ),
        ),
      );
      expect(saveAsCalled, isFalse);
      expect(
        await fixture.scope.syntheticEvidenceRoot!
            .list(followLinks: false)
            .toList(),
        isEmpty,
      );
    },
  );

  test(
    'Windows-invalid and traversal-like shift IDs become confined filenames',
    () async {
      final fixture = await _qaScopeFixture();
      addTearDown(fixture.dispose);

      await expectLater(
        ShopOperationalExportSaver.save(
          runtimeScope: fixture.scope,
          bytes: Uint8List.fromList([1]),
          shiftId: '../outside:shift',
          now: DateTime.utc(2026, 10, 24),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'shop_synthetic_operational_export_write_disabled',
          ),
        ),
      );
      final files = await fixture.scope.syntheticEvidenceRoot!
          .list(followLinks: false)
          .toList();
      expect(files, isEmpty);
    },
  );

  test('empty and control-bearing shift IDs fail before any write', () async {
    final fixture = await _qaScopeFixture();
    addTearDown(fixture.dispose);
    for (final shiftId in ['', 'shift\u0000bad']) {
      await expectLater(
        ShopOperationalExportSaver.save(
          runtimeScope: fixture.scope,
          bytes: Uint8List.fromList([1]),
          shiftId: shiftId,
        ),
        throwsArgumentError,
      );
    }
    expect(
      await fixture.scope.syntheticEvidenceRoot!
          .list(followLinks: false)
          .toList(),
      isEmpty,
    );
  });

  test(
    'synthetic QA leaves a pre-planted evidence symlink untouched',
    () async {
      if (Platform.isWindows) return;
      final fixture = await _qaScopeFixture();
      final outside = await Directory.systemTemp.createTemp(
        'shop-export-outside-',
      );
      addTearDown(() async {
        await fixture.dispose();
        await outside.delete(recursive: true);
      });
      final evidence = fixture.scope.syntheticEvidenceRoot!;
      await evidence.delete();
      await Link(evidence.path).create(outside.path);

      final planted = File(
        '${outside.path}${Platform.pathSeparator}outside-canary.txt',
      );
      await expectLater(
        ShopOperationalExportSaver.save(
          runtimeScope: fixture.scope,
          bytes: Uint8List.fromList([1]),
          shiftId: 'shift-001',
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'shop_synthetic_operational_export_write_disabled',
          ),
        ),
      );
      expect(await Link(evidence.path).exists(), isTrue);
      expect(await planted.exists(), isFalse);
      expect(await outside.list().toList(), isEmpty);
    },
  );

  test(
    'concurrent production save is rejected before a duplicate write',
    () async {
      final documents = await Directory.systemTemp.createTemp(
        'shop-export-prod-docs-',
      );
      final temporary = await Directory.systemTemp.createTemp(
        'shop-export-prod-temp-',
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
      final firstWrite = Completer<String?>();
      var calls = 0;
      final first = ShopOperationalExportSaver.save(
        runtimeScope: scope,
        bytes: Uint8List.fromList([1]),
        shiftId: 'shift-001',
        saveAs: (_, _) {
          calls += 1;
          return firstWrite.future;
        },
      );
      await Future<void>.delayed(Duration.zero);

      await expectLater(
        ShopOperationalExportSaver.save(
          runtimeScope: scope,
          bytes: Uint8List.fromList([2]),
          shiftId: 'shift-001',
          saveAs: (_, _) async {
            calls += 1;
            return 'unexpected';
          },
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'shop_operational_export_already_in_progress',
          ),
        ),
      );
      expect(calls, 1);
      firstWrite.complete(null);
      expect(await first, ShopOperationalExportSaveResult.cancelled);
    },
  );
}

final class _QaScopeFixture {
  const _QaScopeFixture(this.scope, this.support, this.temporary);

  final ShopRuntimeScope scope;
  final Directory support;
  final Directory temporary;

  Future<void> dispose() async {
    final evidencePath = scope.syntheticEvidenceRoot!.path;
    if (await Link(evidencePath).exists()) await Link(evidencePath).delete();
    if (await support.exists()) await support.delete(recursive: true);
    if (await temporary.exists()) await temporary.delete(recursive: true);
  }
}

Future<_QaScopeFixture> _qaScopeFixture() async {
  final support = await Directory.systemTemp.createTemp(
    'shop-export-qa-support-',
  );
  final temporary = await Directory.systemTemp.createTemp(
    'shop-export-qa-temp-',
  );
  final scope = await ShopRuntimeScope.resolve(
    ShopRuntimeProfile.syntheticQa,
    configuration: _qaProfile(),
    supportProvider: () async => support,
    temporaryProvider: () async => temporary,
  );
  return _QaScopeFixture(scope, support, temporary);
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
