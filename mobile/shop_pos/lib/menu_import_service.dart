import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import 'shop_models.dart';
import 'shop_runtime_scope.dart';

const maxMenuPhotoBytes = 2400000;
const _menuImportHost = 'app.supermega.dev';
const _menuImportPath = '/api/shop/menu-import';

/// Only camera captures are temporary picker files. A desktop gallery picker
/// can return the merchant's original file, which must never be deleted.
Future<void> discardCapturedMenuPhoto(
  XFile? photo, {
  required bool createdByCamera,
}) async {
  if (photo == null || !createdByCamera) return;
  try {
    final file = File(photo.path);
    if (await file.exists()) await file.delete();
  } on FileSystemException {
    // Never block local review on temporary-cache cleanup.
  }
}

class MenuImportException implements Exception {
  const MenuImportException(this.code);
  final String code;

  @override
  String toString() => code;
}

class MenuImportService {
  MenuImportService({
    required this.endpoint,
    required this.accessToken,
    http.Client? client,
    ShopRuntimeScope? runtimeScope,
    bool testOnlyAllowMissingRuntimeScope = false,
  }) : _runtimeScope = requireShopRuntimeScopeOrTestSeam(
         runtimeScope,
         testOnlyAllowMissingRuntimeScope:
             testOnlyAllowMissingRuntimeScope || client != null,
       ),
       _client = client ?? _menuImportClient(runtimeScope),
       _ownsClient = client == null;

  final Uri endpoint;
  final Future<String?> Function() accessToken;
  final http.Client _client;
  final bool _ownsClient;
  final ShopRuntimeScope? _runtimeScope;

  Future<List<MenuCandidate>> parsePhoto(
    XFile photo, {
    required bool cloudConsent,
  }) async {
    final scope = _runtimeScope;
    if (scope != null) {
      if (!scope.capabilities.remoteImport) {
        throw StateError('shop_remote_import_unavailable');
      }
    }
    if (!cloudConsent) throw const MenuImportException('consent_required');
    if (endpoint.scheme != 'https' ||
        endpoint.host != _menuImportHost ||
        endpoint.port != 443 ||
        endpoint.path != _menuImportPath ||
        endpoint.userInfo.isNotEmpty ||
        endpoint.query.isNotEmpty ||
        endpoint.fragment.isNotEmpty) {
      throw const MenuImportException('secure_endpoint_required');
    }
    final byteLength = await photo.length();
    if (byteLength < 16 || byteLength > maxMenuPhotoBytes) {
      throw const MenuImportException('photo_size_invalid');
    }
    final token = await accessToken();
    if (token == null || token.trim().isEmpty) {
      throw const MenuImportException('authentication_required');
    }

    final bytes = await photo.readAsBytes();
    if (bytes.length != byteLength ||
        bytes.length < 16 ||
        bytes.length > maxMenuPhotoBytes) {
      throw const MenuImportException('photo_size_invalid');
    }
    final mime = _imageMime(bytes);
    if (mime == null) throw const MenuImportException('photo_type_invalid');
    final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';

    final response = await _postMenuImport(
      token,
      jsonEncode({'cloudConsent': true, 'imageDataUrl': dataUrl}),
    ).timeout(const Duration(seconds: 55));

    if (response.statusCode != 200) {
      String code = 'menu_import_failed';
      try {
        final body = jsonDecode(response.body);
        if (body is Map<String, dynamic> && body['error'] is String) {
          code = body['error'] as String;
        }
      } catch (_) {
        // Keep provider and response details out of the local error surface.
      }
      throw MenuImportException(code);
    }

    try {
      final body = jsonDecode(response.body);
      if (body is! Map<String, dynamic> ||
          body['schemaVersion'] != 1 ||
          body['reviewRequired'] != true ||
          body['items'] is! List) {
        throw const FormatException('Menu response envelope is invalid.');
      }
      final rows = body['items'] as List<dynamic>;
      if (rows.length > 100) {
        throw const FormatException('Menu response item count is invalid.');
      }
      return rows.map(MenuCandidate.fromJson).toList(growable: false);
    } catch (_) {
      throw const MenuImportException('menu_import_invalid_response');
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }

  Future<http.Response> _postMenuImport(String token, String body) async {
    final scope = _runtimeScope;
    if (scope != null) {
      if (!scope.capabilities.remoteImport) {
        throw StateError('shop_remote_import_unavailable');
      }
    }
    return _client.post(
      endpoint,
      headers: {
        'authorization': 'Bearer $token',
        'content-type': 'application/json',
      },
      body: body,
    );
  }
}

http.Client _menuImportClient(ShopRuntimeScope? runtimeScope) {
  final scope = runtimeScope;
  if (scope == null) throw StateError('shop_runtime_scope_required');
  if (!scope.capabilities.remoteImport) {
    throw StateError('shop_remote_import_unavailable');
  }
  return http.Client();
}

String? _imageMime(Uint8List bytes) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length &&
      List<int>.generate(
        png.length,
        (index) => bytes[index],
      ).asMap().entries.every((entry) => entry.value == png[entry.key])) {
    return 'image/png';
  }
  if (bytes.length >= 3 &&
      bytes[0] == 0xff &&
      bytes[1] == 0xd8 &&
      bytes[2] == 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 &&
      String.fromCharCodes(bytes.sublist(0, 4)) == 'RIFF' &&
      String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}
