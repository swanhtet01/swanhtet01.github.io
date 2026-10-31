import 'dart:io';
import 'dart:typed_data';
import 'dart:convert';

import 'package:file_saver/file_saver.dart';

import 'shop_runtime_scope.dart';

typedef SaveShopOperationalCsv = Future<String?> Function(
  Uint8List bytes,
  String suggestedName,
);

enum ShopOperationalExportSaveResult { saved, cancelled }

final class ShopOperationalExportDeliveryUncertain implements Exception {
  const ShopOperationalExportDeliveryUncertain();

  @override
  String toString() => 'shop_operational_export_delivery_uncertain';
}

/// Saves a merchant-readable closed-shift CSV without weakening the runtime
/// profile boundary. Production delegates to the platform Save As dialog;
/// synthetic QA deliberately disables CSV file writing because Dart's
/// path-based file API cannot provide the required no-follow write boundary.
abstract final class ShopOperationalExportSaver {
  static bool _active = false;

  static Future<ShopOperationalExportSaveResult> save({
    required ShopRuntimeScope runtimeScope,
    required Uint8List bytes,
    required String shiftId,
    SaveShopOperationalCsv? saveAs,
    DateTime? now,
  }) async {
    if (_active) {
      throw StateError('shop_operational_export_already_in_progress');
    }
    if (bytes.isEmpty) {
      throw ArgumentError.value(bytes, 'bytes', 'CSV cannot be empty.');
    }
    _active = true;
    try {
      final suggestedName = _suggestedName(
        shiftId: shiftId,
        instant: now ?? DateTime.now(),
      );
      if (runtimeScope.configuration.isSyntheticQa) {
        // Dart's path-based File API cannot provide the handle-relative,
        // no-follow create/write primitive needed to resist a local symlink or
        // parent replacement race. Keep QA encoding and preview available, but
        // fail before any filesystem lookup or write.
        throw StateError('shop_synthetic_operational_export_write_disabled');
      }
      if (!runtimeScope.capabilities.externalFileSaving) {
        throw StateError('shop_external_file_access_unavailable');
      }
      final saver =
          saveAs ??
          (bytes, suggestedName) =>
              _platformSaveAs(runtimeScope, bytes, suggestedName);
      final String? savedLocation;
      try {
        savedLocation = await saver(bytes, suggestedName);
      } catch (_) {
        throw const ShopOperationalExportDeliveryUncertain();
      }
      return savedLocation == null
          ? ShopOperationalExportSaveResult.cancelled
          : ShopOperationalExportSaveResult.saved;
    } finally {
      _active = false;
    }
  }

  static Future<String?> _platformSaveAs(
    ShopRuntimeScope runtimeScope,
    Uint8List bytes,
    String suggestedName,
  ) {
    if (!runtimeScope.capabilities.externalFileSaving) {
      throw StateError('shop_external_file_access_unavailable');
    }
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isWindows) {
      throw UnsupportedError('Shop CSV export is unavailable here.');
    }
    return FileSaver.instance.saveAs(
      name: suggestedName,
      bytes: bytes,
      fileExtension: 'csv',
      mimeType: MimeType.custom,
      customMimeType: 'text/csv;charset=utf-8',
    );
  }

  static String _suggestedName({
    required String shiftId,
    required DateTime instant,
  }) {
    final cleanShiftId = shiftId.trim();
    if (cleanShiftId.isEmpty ||
        cleanShiftId.length > 120 ||
        RegExp(r'[\u0000-\u001F\u007F]').hasMatch(cleanShiftId)) {
      throw ArgumentError.value(shiftId, 'shiftId', 'Invalid shift ID.');
    }
    final filenameShiftId = _filenameShiftToken(cleanShiftId);
    String two(int value) => value.toString().padLeft(2, '0');
    String three(int value) => value.toString().padLeft(3, '0');
    return 'SuperMega-Shop-shift-$filenameShiftId-'
        '${instant.year}${two(instant.month)}${two(instant.day)}-'
        '${two(instant.hour)}${two(instant.minute)}${two(instant.second)}-'
        '${three(instant.millisecond)}';
  }

  static String _filenameShiftToken(String shiftId) {
    var safe = shiftId.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '-');
    safe = safe.replaceAll(RegExp(r'\.{2,}'), '-');
    safe = safe.replaceFirst(RegExp(r'^\.+'), '-');
    safe = safe.replaceFirst(RegExp(r'\.+$'), '-');
    if (safe == shiftId && safe.length <= 48) return safe;
    final prefix = safe.substring(0, safe.length.clamp(0, 48));
    final forward = _fnv32(utf8.encode(shiftId));
    final reverse = _fnv32(utf8.encode(shiftId).reversed);
    return '$prefix-${forward.toRadixString(16).padLeft(8, '0')}'
        '${reverse.toRadixString(16).padLeft(8, '0')}';
  }

  static int _fnv32(Iterable<int> bytes) {
    var value = 0x811c9dc5;
    for (final byte in bytes) {
      value = ((value ^ byte) * 0x01000193) & 0xffffffff;
    }
    return value;
  }
}
