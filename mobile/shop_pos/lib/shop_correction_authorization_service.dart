import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:http/http.dart' as http;

import 'shop_correction_receipt.dart';

const shopCorrectionAuthorizationPath =
    '/api/trial/v1/shop/correction-authorizations';
const shopFullSaleReversalCapability = 'shop.sale.reverse';
const shopWalletReconciliationCapability = 'shop.sale.reconcile_wallet';

const _maximumResponseBytes = 16 * 1024;
const _authorizationTtlMillis = 5 * 60 * 1000;
const _authorizationSource = 'managed_membership_receipt_v1';
const _ownerLabel = 'Workspace owner';
const _authorizationHost = 'app.supermega.dev';

final _identifier = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
final _lowerHexDigest = RegExp(r'^[0-9a-f]{64}$');
final _canonicalUuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
final _controlCharacters = RegExp(r'[\x00-\x1f\x7f]');

const _confirmationByCapability = <String, String>{
  shopFullSaleReversalCapability: 'AUTHORIZE FULL SALE REVERSAL',
  shopWalletReconciliationCapability: 'AUTHORIZE WALLET RECONCILIATION',
};

const _envelopeKeys = <String>{
  'authorization',
  'idempotent_replay',
  'local_mutation_performed',
  'money_returned',
  'external_writes_performed',
  'secret_values_exposed',
};

const _receiptKeys = <String>{
  'contract',
  'receiptId',
  'receiptDigest',
  'keyId',
  'signature',
  'workspaceId',
  'actorId',
  'actorLabel',
  'actorRole',
  'capability',
  'source',
  'commandDigest',
  'issuedAtMillis',
  'expiresAtMillis',
};

/// Builds the one permitted correction-authorization endpoint from a clean
/// configured HTTPS origin.
Uri? shopCorrectionAuthorizationEndpoint(String baseUrl) {
  final base = Uri.tryParse(baseUrl);
  if (base == null ||
      !base.isAbsolute ||
      base.scheme != 'https' ||
      base.host.toLowerCase() != _authorizationHost ||
      base.port != 443 ||
      base.userInfo.isNotEmpty ||
      (base.path.isNotEmpty && base.path != '/') ||
      base.hasQuery ||
      base.hasFragment) {
    return null;
  }
  return Uri(
    scheme: 'https',
    host: base.host,
    path: shopCorrectionAuthorizationPath,
  );
}

class ShopCorrectionAuthorizationException implements Exception {
  const ShopCorrectionAuthorizationException(this.code);

  final String code;

  @override
  String toString() => code;
}

class ShopCorrectionAuthorizationResult {
  const ShopCorrectionAuthorizationResult({
    required this.authorization,
    required this.idempotentReplay,
    required this.externalWritesPerformed,
  });

  final ShopCorrectionAuthorization authorization;
  final bool idempotentReplay;
  final bool externalWritesPerformed;
}

/// Narrow seam used by the operator flow.
///
/// Implementations must obtain authorization from the managed capability
/// boundary. A local role label or workspace ID is never sufficient.
abstract interface class ShopCorrectionAuthorizer {
  Future<bool> canRequestAuthorization({
    required String workspaceId,
    required String requiredActorId,
    required String capability,
  });

  Future<ShopCorrectionAuthorizationResult> authorize({
    required String authorizationRequestId,
    required String workspaceId,
    required String capability,
    required String commandDigest,
    required String requestFingerprint,
  });
}

/// Obtains a short-lived, exact-command owner receipt from the managed server.
///
/// The caller owns both the local operation ID inside [requestFingerprint] and
/// [authorizationRequestId]. Retrying an uncertain request must reuse the same
/// authorization request ID until the server reports that it expired.
class ShopCorrectionAuthorizationService implements ShopCorrectionAuthorizer {
  ShopCorrectionAuthorizationService({
    required this.endpoint,
    required this.accessToken,
    required this.currentUserId,
    http.Client? client,
    DateTime Function()? clock,
    ShopCorrectionReceiptVerifier? receiptVerifier,
    this.requestTimeout = const Duration(seconds: 15),
  }) : _client = client ?? http.Client(),
       _ownsClient = client == null,
       _clock = clock ?? DateTime.now,
       _receiptVerifier =
           receiptVerifier ?? ShopCorrectionReceiptVerifier.production();

  final Uri endpoint;
  final Future<String?> Function() accessToken;
  final Future<String?> Function() currentUserId;
  final Duration requestTimeout;
  final http.Client _client;
  final bool _ownsClient;
  final DateTime Function() _clock;
  final ShopCorrectionReceiptVerifier _receiptVerifier;

  @override
  Future<bool> canRequestAuthorization({
    required String workspaceId,
    required String requiredActorId,
    required String capability,
  }) async {
    if (!_receiptVerifier.hasPinnedKeys ||
        !_validEndpoint(endpoint) ||
        !_identifier.hasMatch(workspaceId) ||
        !_identifier.hasMatch(requiredActorId) ||
        !_confirmationByCapability.containsKey(capability)) {
      return false;
    }
    try {
      final userId = await currentUserId();
      if (userId != requiredActorId) return false;
      final token = (await accessToken())?.trim();
      return userId != null &&
          _identifier.hasMatch(userId) &&
          token != null &&
          token.isNotEmpty &&
          token.length <= 8192 &&
          !_controlCharacters.hasMatch(token);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<ShopCorrectionAuthorizationResult> authorize({
    required String authorizationRequestId,
    required String workspaceId,
    required String capability,
    required String commandDigest,
    required String requestFingerprint,
  }) =>
      _authorize(
        authorizationRequestId: authorizationRequestId,
        workspaceId: workspaceId,
        capability: capability,
        commandDigest: commandDigest,
        requestFingerprint: requestFingerprint,
      ).timeout(
        requestTimeout,
        onTimeout: () => throw const ShopCorrectionAuthorizationException(
          'authorization_unavailable',
        ),
      );

  Future<ShopCorrectionAuthorizationResult> _authorize({
    required String authorizationRequestId,
    required String workspaceId,
    required String capability,
    required String commandDigest,
    required String requestFingerprint,
  }) async {
    if (!_receiptVerifier.hasPinnedKeys) {
      throw const ShopCorrectionAuthorizationException(
        'authorization_unavailable',
      );
    }
    if (!_validEndpoint(endpoint)) {
      throw const ShopCorrectionAuthorizationException('endpoint_unavailable');
    }
    _validateRequest(
      authorizationRequestId: authorizationRequestId,
      workspaceId: workspaceId,
      capability: capability,
      commandDigest: commandDigest,
      requestFingerprint: requestFingerprint,
    );

    late final String initialUserId;
    late final String token;
    try {
      final currentUser = await currentUserId();
      if (currentUser == null || !_identifier.hasMatch(currentUser)) {
        throw const ShopCorrectionAuthorizationException('sign_in_required');
      }
      initialUserId = currentUser;
      final currentToken = (await accessToken())?.trim();
      if (currentToken == null ||
          currentToken.isEmpty ||
          currentToken.length > 8192 ||
          _controlCharacters.hasMatch(currentToken)) {
        throw const ShopCorrectionAuthorizationException('sign_in_required');
      }
      token = currentToken;
      if (await currentUserId() != initialUserId) {
        throw const ShopCorrectionAuthorizationException('session_changed');
      }
    } on ShopCorrectionAuthorizationException {
      rethrow;
    } catch (_) {
      throw const ShopCorrectionAuthorizationException(
        'authorization_unavailable',
      );
    }

    final request = http.Request('POST', endpoint)
      ..followRedirects = false
      ..headers.addAll({
        'authorization': 'Bearer $token',
        'x-supermega-workspace-id': workspaceId,
        'accept': 'application/json',
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'pragma': 'no-cache',
      })
      ..body = jsonEncode(<String, Object>{
        'authorization_request_id': authorizationRequestId,
        'capability': capability,
        'command_digest': commandDigest,
        'request_fingerprint': requestFingerprint,
        'confirmation': _confirmationByCapability[capability]!,
      });

    try {
      final response = await _client.send(request).timeout(requestTimeout);
      if (response.statusCode >= 300 && response.statusCode < 400) {
        throw const ShopCorrectionAuthorizationException('redirect_rejected');
      }
      final responseBytes = await _readBounded(response);
      if (response.statusCode != 200) {
        throw ShopCorrectionAuthorizationException(
          _failureCode(response.statusCode, responseBytes),
        );
      }
      if (!_isJson(response.headers['content-type']) ||
          !_hasDirective(response.headers['cache-control'], 'no-store') ||
          !_hasDirective(response.headers['pragma'], 'no-cache')) {
        throw const ShopCorrectionAuthorizationException('invalid_response');
      }
      if (await currentUserId() != initialUserId) {
        throw const ShopCorrectionAuthorizationException('session_changed');
      }
      return await _parseSuccess(
        responseBytes,
        workspaceId: workspaceId,
        capability: capability,
        commandDigest: commandDigest,
        currentUserId: initialUserId,
      );
    } on ShopCorrectionAuthorizationException {
      rethrow;
    } on TimeoutException {
      throw const ShopCorrectionAuthorizationException(
        'authorization_unavailable',
      );
    } catch (_) {
      throw const ShopCorrectionAuthorizationException(
        'authorization_unavailable',
      );
    }
  }

  Future<Uint8List> _readBounded(http.StreamedResponse response) async {
    final bytes = BytesBuilder(copy: false);
    var length = 0;
    await for (final chunk in response.stream.timeout(requestTimeout)) {
      length += chunk.length;
      if (length > _maximumResponseBytes) {
        throw const ShopCorrectionAuthorizationException('response_too_large');
      }
      bytes.add(chunk);
    }
    return bytes.takeBytes();
  }

  Future<ShopCorrectionAuthorizationResult> _parseSuccess(
    Uint8List responseBytes, {
    required String workspaceId,
    required String capability,
    required String commandDigest,
    required String currentUserId,
  }) async {
    Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(responseBytes));
    } catch (_) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }
    if (decoded is! Map<String, dynamic> ||
        !_hasExactKeys(decoded, _envelopeKeys)) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }
    final replay = decoded['idempotent_replay'];
    final externalWrites = decoded['external_writes_performed'];
    if (replay is! bool ||
        externalWrites is! bool ||
        decoded['local_mutation_performed'] != false ||
        decoded['money_returned'] != false ||
        decoded['secret_values_exposed'] != false ||
        externalWrites == replay) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }
    final receipt = decoded['authorization'];
    if (receipt is! Map<String, dynamic> ||
        !_hasExactKeys(receipt, _receiptKeys)) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }

    final receiptId = receipt['receiptId'];
    final receiptDigest = receipt['receiptDigest'];
    final keyId = receipt['keyId'];
    final signature = receipt['signature'];
    final actorId = receipt['actorId'];
    final actorLabel = receipt['actorLabel'];
    final issuedAtMillis = receipt['issuedAtMillis'];
    final expiresAtMillis = receipt['expiresAtMillis'];
    if (receipt['contract'] != shopCorrectionAuthorizationReceiptContract ||
        receiptId is! String ||
        !_canonicalUuid.hasMatch(receiptId) ||
        receiptDigest is! String ||
        !_lowerHexDigest.hasMatch(receiptDigest) ||
        keyId is! String ||
        signature is! String ||
        receipt['workspaceId'] != workspaceId ||
        actorId is! String ||
        actorId != currentUserId ||
        actorLabel is! String ||
        actorLabel != _ownerLabel ||
        receipt['actorRole'] != 'owner' ||
        receipt['capability'] != capability ||
        receipt['source'] != _authorizationSource ||
        receipt['commandDigest'] != commandDigest ||
        issuedAtMillis is! int ||
        expiresAtMillis is! int ||
        issuedAtMillis <= 0 ||
        expiresAtMillis - issuedAtMillis != _authorizationTtlMillis) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }
    final now = _clock().millisecondsSinceEpoch;
    if (issuedAtMillis > now) {
      throw const ShopCorrectionAuthorizationException('device_clock_invalid');
    }
    if (expiresAtMillis < now) {
      throw const ShopCorrectionAuthorizationException('authorization_expired');
    }
    if (!shopCorrectionAuthorizationReceiptDigestMatches(
      receiptDigest: receiptDigest,
      source: _authorizationSource,
      receiptId: receiptId,
      workspaceId: workspaceId,
      actorId: actorId,
      actorLabel: actorLabel,
      actorRole: 'owner',
      capability: capability,
      commandDigest: commandDigest,
      issuedAtMillis: issuedAtMillis,
      expiresAtMillis: expiresAtMillis,
    )) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }

    final authorization = ShopCorrectionAuthorization(
      receiptId: receiptId,
      receiptDigest: receiptDigest,
      workspaceId: workspaceId,
      actorId: actorId,
      actorLabel: actorLabel,
      actorRole: 'owner',
      capability: capability,
      source: _authorizationSource,
      commandDigest: commandDigest,
      issuedAtMillis: issuedAtMillis,
      expiresAtMillis: expiresAtMillis,
      keyId: keyId,
      signature: signature,
    );
    if (!await _receiptVerifier.verify(authorization)) {
      throw const ShopCorrectionAuthorizationException('invalid_response');
    }

    return ShopCorrectionAuthorizationResult(
      authorization: authorization,
      idempotentReplay: replay,
      externalWritesPerformed: externalWrites,
    );
  }

  void close() {
    if (_ownsClient) _client.close();
  }
}

bool _validEndpoint(Uri endpoint) =>
    endpoint.isAbsolute &&
    endpoint.scheme == 'https' &&
    endpoint.host.toLowerCase() == _authorizationHost &&
    endpoint.port == 443 &&
    endpoint.userInfo.isEmpty &&
    endpoint.path == shopCorrectionAuthorizationPath &&
    !endpoint.hasQuery &&
    !endpoint.hasFragment;

void _validateRequest({
  required String authorizationRequestId,
  required String workspaceId,
  required String capability,
  required String commandDigest,
  required String requestFingerprint,
}) {
  List<int> fingerprintBytes;
  try {
    fingerprintBytes = utf8.encode(requestFingerprint);
  } catch (_) {
    throw const ShopCorrectionAuthorizationException('request_invalid');
  }
  if (!_canonicalUuid.hasMatch(authorizationRequestId) ||
      !_identifier.hasMatch(workspaceId) ||
      !_confirmationByCapability.containsKey(capability) ||
      !_lowerHexDigest.hasMatch(commandDigest) ||
      fingerprintBytes.length < 2 ||
      fingerprintBytes.length > 4096 ||
      crypto.sha256.convert(fingerprintBytes).toString() != commandDigest) {
    throw const ShopCorrectionAuthorizationException('request_invalid');
  }
}

bool _hasExactKeys(Map<String, dynamic> value, Set<String> expected) =>
    value.length == expected.length && value.keys.toSet().containsAll(expected);

bool _isJson(String? value) =>
    value?.split(';').first.trim().toLowerCase() == 'application/json';

bool _hasDirective(String? value, String directive) =>
    value
        ?.split(',')
        .map((item) => item.trim().toLowerCase())
        .contains(directive) ??
    false;

String? _safeServerCode(Uint8List responseBytes) {
  try {
    final decoded = jsonDecode(utf8.decode(responseBytes));
    if (decoded is! Map<String, dynamic>) return null;
    final detail = decoded['detail'];
    if (detail is! Map<String, dynamic>) return null;
    final code = detail['code'];
    return code is String ? code : null;
  } catch (_) {
    return null;
  }
}

String _failureCode(int statusCode, Uint8List responseBytes) {
  final serverCode = _safeServerCode(responseBytes);
  return switch (statusCode) {
    401 => 'sign_in_required',
    403 => 'owner_authorization_required',
    409 when serverCode == 'shop_correction_authorization_expired' =>
      'authorization_expired',
    409 => 'authorization_conflict',
    400 || 413 || 415 || 422 => 'request_invalid',
    503 when serverCode == 'shop_correction_authorization_window_closed' =>
      'authorization_window_closed',
    503 => 'authorization_unavailable',
    _ => 'authorization_unavailable',
  };
}
