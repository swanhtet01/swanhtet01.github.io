import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'shop_runtime_profile.dart';

typedef ShopDirectoryProvider = Future<Directory> Function();

Future<SharedPreferences> _openShopPreferences() =>
    SharedPreferences.getInstance();

Future<Directory> _openShopTemporaryDirectory() => getTemporaryDirectory();

class ShopPreferenceKeys {
  const ShopPreferenceKeys._(this._prefix);

  final String _prefix;

  String _key(String productionKey) => '$_prefix$productionKey';

  String get localeMyanmar => _key('shop_locale_myanmar');
  String get pendingPickerIntent => _key('shop_pending_picker_intent');
  String get receiptPrinterHost => _key('shop_receipt_printer_host_v1');
  String get receiptPaperWidth => _key('shop_receipt_paper_width_v1');

  static const production = ShopPreferenceKeys._('');
  static const syntheticQa =
      ShopPreferenceKeys._('qa.synthetic-qa-v1.');
}

class ShopScopedPreferences {
  const ShopScopedPreferences(this.instance, this.keys);

  final SharedPreferences instance;
  final ShopPreferenceKeys keys;
}

Future<ShopScopedPreferences> openProductionShopPreferences() async =>
    ShopScopedPreferences(
      await _openShopPreferences(),
      ShopPreferenceKeys.production,
    );

class ShopRuntimeScope {
  const ShopRuntimeScope._({
    required this.configuration,
    required this.documentsRoot,
    required this.temporaryRoot,
    required this.syntheticEvidenceRoot,
    required this.preferences,
  });

  static const isolationContractVersion = 1;
  static const _sentinelName = '.supermega-shop-runtime-scope.json';

  final ShopRuntimeConfiguration configuration;
  final Directory documentsRoot;
  final Directory temporaryRoot;
  final Directory? syntheticEvidenceRoot;
  final ShopScopedPreferences preferences;
  ShopRuntimeCapabilities get capabilities => configuration.capabilities;

  static Future<ShopRuntimeScope> resolve(
    ShopRuntimeProfile runtimeProfile, {
    ShopRuntimeConfiguration? configuration,
    ShopDirectoryProvider? documentsProvider,
    ShopDirectoryProvider? supportProvider,
    ShopDirectoryProvider? temporaryProvider,
    Future<SharedPreferences> Function()? preferencesProvider,
  }) async {
    final resolvedConfiguration =
        configuration ?? ShopRuntimeConfiguration.fromEnvironment();
    if (resolvedConfiguration.profile != runtimeProfile) {
      throw StateError('shop_runtime_profile_changed');
    }
    if (!resolvedConfiguration.isSyntheticQa) {
      final documents = await (documentsProvider ??
          getApplicationDocumentsDirectory)();
      final temporary = await (temporaryProvider ??
          _openShopTemporaryDirectory)();
      final preferences = await (preferencesProvider ??
          _openShopPreferences)();
      return ShopRuntimeScope._(
        configuration: resolvedConfiguration,
        documentsRoot: documents,
        temporaryRoot: temporary,
        syntheticEvidenceRoot: null,
        preferences: ShopScopedPreferences(
          preferences,
          ShopPreferenceKeys.production,
        ),
      );
    }

    final support = await (supportProvider ??
        getApplicationSupportDirectory)();
    final temporaryParent = await (temporaryProvider ??
        _openShopTemporaryDirectory)();
    await _requireRealDirectory(support, 'shop_qa_support_root_invalid');
    await _requireRealDirectory(
      temporaryParent,
      'shop_qa_temporary_root_invalid',
    );
    final documents = Directory(
      '${support.path}${Platform.pathSeparator}'
      '${ShopRuntimeConfiguration.qaProfileId}',
    );
    final temporary = Directory(
      '${temporaryParent.path}${Platform.pathSeparator}'
      '${ShopRuntimeConfiguration.qaProfileId}',
    );
    await _bootstrapQaRoot(documents, resolvedConfiguration);
    await _bootstrapQaRoot(temporary, resolvedConfiguration);
    final evidence = Directory(
      '${documents.path}${Platform.pathSeparator}synthetic-evidence',
    );
    await _ensureConfinedChild(documents, evidence);
    await evidence.create();
    final preferences = await (preferencesProvider ??
        _openShopPreferences)();
    return ShopRuntimeScope._(
      configuration: resolvedConfiguration,
      documentsRoot: documents,
      temporaryRoot: temporary,
      syntheticEvidenceRoot: evidence,
      preferences: ShopScopedPreferences(
        preferences,
        ShopPreferenceKeys.syntheticQa,
      ),
    );
  }

  static Future<void> _requireRealDirectory(
    Directory directory,
    String error,
  ) async {
    final type = await FileSystemEntity.type(
      directory.path,
      followLinks: false,
    );
    if (type != FileSystemEntityType.directory) throw StateError(error);
  }

  static Future<void> _bootstrapQaRoot(
    Directory root,
    ShopRuntimeConfiguration configuration,
  ) async {
    final originalType = await FileSystemEntity.type(
      root.path,
      followLinks: false,
    );
    final createdHere = originalType == FileSystemEntityType.notFound;
    if (!createdHere && originalType != FileSystemEntityType.directory) {
      throw StateError('shop_qa_scope_root_invalid');
    }
    if (createdHere) await root.create();
    final sentinel = File(
      '${root.path}${Platform.pathSeparator}$_sentinelName',
    );
    final expected = jsonEncode({
      'contract': 'supermega.shop.qa-isolation.v1',
      'formatVersion': isolationContractVersion,
      'profileId': configuration.profileId,
      'platformIdentity': configuration.platformIdentity,
    });
    if (createdHere) {
      final entries = await root.list(followLinks: false).toList();
      if (entries.isNotEmpty) {
        throw StateError('shop_qa_scope_root_not_empty');
      }
      await sentinel.create(exclusive: true);
      await sentinel.writeAsString(expected, flush: true);
      return;
    }
    if (await FileSystemEntity.type(
          sentinel.path,
          followLinks: false,
        ) !=
        FileSystemEntityType.file) {
      throw StateError('shop_qa_scope_sentinel_missing');
    }
    if (await sentinel.readAsString() != expected) {
      throw StateError('shop_qa_scope_sentinel_mismatch');
    }
  }

  static Future<void> _ensureConfinedChild(
    Directory root,
    Directory child,
  ) async {
    final rootPath = root.absolute.path;
    final childPath = child.absolute.path;
    if (!childPath.startsWith('$rootPath${Platform.pathSeparator}')) {
      throw StateError('shop_qa_scope_path_escape');
    }
    final type = await FileSystemEntity.type(
      child.path,
      followLinks: false,
    );
    if (type != FileSystemEntityType.notFound &&
        type != FileSystemEntityType.directory) {
      throw StateError('shop_qa_scope_child_invalid');
    }
  }
}
