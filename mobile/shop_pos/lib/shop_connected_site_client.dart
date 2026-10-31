import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import 'shop_connected_site_contracts.dart';
import 'shop_site_coordinator.dart';

abstract interface class ConnectedSiteDeviceSigner {
  String get deviceId;
  String get signingKeyId;
  String get clientFingerprint;
  String get publicKeyBase64Url;

  Future<String> sign(List<int> message);
}

class UnavailableConnectedSiteDeviceSigner
    implements ConnectedSiteDeviceSigner {
  const UnavailableConnectedSiteDeviceSigner();

  Never _unavailable() =>
      throw StateError('connected_site_device_signer_unavailable');

  @override
  String get clientFingerprint => _unavailable();
  @override
  String get deviceId => _unavailable();
  @override
  String get publicKeyBase64Url => _unavailable();
  @override
  String get signingKeyId => _unavailable();
  @override
  Future<String> sign(List<int> message) async => _unavailable();
}

abstract interface class ConnectedSiteCommandAttemptStore {
  Future<bool> bind({required String commandId, required String digest});
}

class UnavailableConnectedSiteCommandAttemptStore
    implements ConnectedSiteCommandAttemptStore {
  const UnavailableConnectedSiteCommandAttemptStore();

  @override
  Future<bool> bind({
    required String commandId,
    required String digest,
  }) async => false;
}

class ConnectedSiteHttpResponse {
  const ConnectedSiteHttpResponse({
    required this.statusCode,
    required this.contentType,
    required this.body,
  });

  final int statusCode;
  final String? contentType;
  final Uint8List body;
}

abstract interface class ConnectedSiteHttpTransport {
  Future<ConnectedSiteHttpResponse> send({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required Uint8List body,
    required String certificateSha256,
  });
}

class ConnectedSiteTransportException implements Exception {
  const ConnectedSiteTransportException(this.code, {this.ambiguous = false});

  final String code;
  final bool ambiguous;

  @override
  String toString() => code;
}

class DartIoConnectedSiteHttpTransport implements ConnectedSiteHttpTransport {
  const DartIoConnectedSiteHttpTransport({
    this.timeout = const Duration(seconds: 8),
    this.maximumResponseBytes = 1024 * 1024,
  });

  final Duration timeout;
  final int maximumResponseBytes;

  @override
  Future<ConnectedSiteHttpResponse> send({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required Uint8List body,
    required String certificateSha256,
  }) async {
    if (uri.scheme != 'https' || uri.userInfo.isNotEmpty || uri.host.isEmpty) {
      throw const ConnectedSiteTransportException('endpoint_rejected');
    }
    final client = HttpClient(
      context: SecurityContext(withTrustedRoots: false),
    );
    client.findProxy = (_) => 'DIRECT';
    client.connectionTimeout = timeout;
    client.idleTimeout = timeout;
    client.maxConnectionsPerHost = 1;
    client.autoUncompress = false;
    client.badCertificateCallback = (certificate, host, port) =>
        host == uri.host &&
        port == uri.port &&
        crypto.sha256.convert(certificate.der).toString() == certificateSha256;
    var transmitted = false;
    try {
      final request = await client.openUrl(method, uri).timeout(timeout);
      request
        ..followRedirects = false
        ..persistentConnection = false;
      headers.forEach(request.headers.set);
      if (body.isNotEmpty) request.add(body);
      transmitted = true;
      final response = await request.close().timeout(timeout);
      if (response.isRedirect) {
        throw ConnectedSiteTransportException(
          'redirect_rejected',
          ambiguous: method == 'POST',
        );
      }
      final certificate = response.certificate;
      if (certificate == null ||
          crypto.sha256.convert(certificate.der).toString() !=
              certificateSha256) {
        throw const ConnectedSiteTransportException('tls_pin_mismatch');
      }
      final bytes = BytesBuilder(copy: false);
      await for (final chunk in response.timeout(timeout)) {
        bytes.add(chunk);
        if (bytes.length > maximumResponseBytes) {
          throw const ConnectedSiteTransportException('response_too_large');
        }
      }
      return ConnectedSiteHttpResponse(
        statusCode: response.statusCode,
        contentType: response.headers.value(HttpHeaders.contentTypeHeader),
        body: bytes.takeBytes(),
      );
    } on ConnectedSiteTransportException catch (error) {
      if (transmitted && method == 'POST' && !error.ambiguous) {
        throw ConnectedSiteTransportException(error.code, ambiguous: true);
      }
      rethrow;
    } on Object {
      throw ConnectedSiteTransportException(
        'transport_failed',
        ambiguous: transmitted,
      );
    } finally {
      client.close(force: true);
    }
  }
}

enum ConnectedSiteCommandOutcome { acknowledged, retryableUnknown }

class ConnectedSiteCommandResult {
  const ConnectedSiteCommandResult._(this.outcome, this.acknowledgement);

  const ConnectedSiteCommandResult.acknowledged(SiteCommandAckV1 ack)
    : this._(ConnectedSiteCommandOutcome.acknowledged, ack);

  const ConnectedSiteCommandResult.retryableUnknown()
    : this._(ConnectedSiteCommandOutcome.retryableUnknown, null);

  final ConnectedSiteCommandOutcome outcome;
  final SiteCommandAckV1? acknowledgement;
}

class SiteCoordinatorClient {
  SiteCoordinatorClient({
    required this.pairing,
    this.signer = const UnavailableConnectedSiteDeviceSigner(),
    this.attempts = const UnavailableConnectedSiteCommandAttemptStore(),
    this.transport = const DartIoConnectedSiteHttpTransport(),
    this.runtimeEnabled = false,
    DateTime Function()? now,
    String Function()? nonce,
  }) : now = now ?? (() => DateTime.now().toUtc()),
       nonce = nonce ?? _secureNonce;

  final CoordinatorPairingV1 pairing;
  final ConnectedSiteDeviceSigner signer;
  final ConnectedSiteCommandAttemptStore attempts;
  final ConnectedSiteHttpTransport transport;
  final bool runtimeEnabled;
  final DateTime Function() now;
  final String Function() nonce;

  Uri get _origin =>
      Uri(scheme: 'https', host: pairing.address, port: pairing.port);

  Future<void> pair() async {
    _requireEnabled();
    _requireSignerIdentity();
    pairing.requireValidAt(now());
    final body = _jsonBody({
      'schema': 'supermega.connected-site.pair-request.v1',
      'protocolVersion': connectedSiteProtocolVersion,
      'nonce': pairing.nonce,
      'clientFingerprint': signer.clientFingerprint,
      'clientPublicKey': signer.publicKeyBase64Url,
      'keyAlgorithm': 'ed25519',
    });
    final response = await _send(
      path: connectedSitePairPath,
      method: 'POST',
      body: body,
      authenticate: false,
    );
    final json = _responseJson(response);
    if (json.keys.toSet().difference({
          'schema',
          'protocolVersion',
          'enrollmentState',
          'clientFingerprint',
          'coordinator',
        }).isNotEmpty ||
        json.length != 5 ||
        json['schema'] != 'supermega.connected-site.pair-ack.v1' ||
        json['protocolVersion'] != connectedSiteProtocolVersion ||
        json['enrollmentState'] != 'pending' ||
        json['clientFingerprint'] != signer.clientFingerprint) {
      throw const ConnectedSiteTransportException('pairing_ack_invalid');
    }
    final coordinator = CoordinatorPairingV1.fromJson(json['coordinator']);
    if (canonicalConnectedSiteJson(coordinator.toJson()) !=
        canonicalConnectedSiteJson(pairing.toJson())) {
      throw const ConnectedSiteTransportException('pairing_ack_substituted');
    }
  }

  Future<ConnectedSiteCommandResult> sendCommand(SiteCommandV1 command) async {
    _requireEnabled();
    _requireSignerIdentity();
    if (command.workspaceId != pairing.workspaceId ||
        command.siteId != pairing.siteId ||
        command.deviceId != signer.deviceId ||
        command.signingKeyId != signer.signingKeyId ||
        !await attempts.bind(
          commandId: command.commandId,
          digest: command.commandDigest,
        )) {
      throw const ConnectedSiteTransportException('command_binding_rejected');
    }
    final body = _jsonBody(command.toJson());
    try {
      final response = await _send(
        path: connectedSiteCommandsPath,
        method: 'POST',
        body: body,
      );
      try {
        final ack = SiteCommandAckV1.fromJson(_responseJson(response));
        if (ack.commandId != command.commandId ||
            ack.commandDigest != command.commandDigest) {
          throw const FormatException('command ack binding');
        }
        return ConnectedSiteCommandResult.acknowledged(ack);
      } on Object {
        return const ConnectedSiteCommandResult.retryableUnknown();
      }
    } on ConnectedSiteTransportException catch (error) {
      if (error.ambiguous) {
        return const ConnectedSiteCommandResult.retryableUnknown();
      }
      rethrow;
    }
  }

  Future<SiteDeltaV1> readDelta(int after) async {
    if (after < 0) {
      throw const ConnectedSiteTransportException('delta_cursor_invalid');
    }
    final delta = SiteDeltaV1.fromJson(
      _responseJson(
        await _send(
          path: '$connectedSiteDeltaPath?after=$after',
          method: 'GET',
          body: Uint8List(0),
        ),
      ),
    );
    if (delta.workspaceId != pairing.workspaceId ||
        delta.siteId != pairing.siteId ||
        delta.afterCursor != after) {
      throw const ConnectedSiteTransportException('delta_scope_substituted');
    }
    return delta;
  }

  Future<SiteSnapshotV1> readSnapshot() async {
    final snapshot = SiteSnapshotV1.fromJson(
      _responseJson(
        await _send(
          path: connectedSiteSnapshotPath,
          method: 'GET',
          body: Uint8List(0),
        ),
      ),
    );
    if (snapshot.workspaceId != pairing.workspaceId ||
        snapshot.siteId != pairing.siteId) {
      throw const ConnectedSiteTransportException('snapshot_scope_substituted');
    }
    return snapshot;
  }

  Future<Map<String, Object?>> readHealth() async {
    final health = _responseJson(
      await _send(
        path: connectedSiteHealthPath,
        method: 'GET',
        body: Uint8List(0),
      ),
    );
    if (health.length != 3 ||
        health['schema'] != 'supermega.connected-site.health.v1' ||
        health['protocolVersion'] != connectedSiteProtocolVersion ||
        health['status'] != 'alive') {
      throw const ConnectedSiteTransportException('health_invalid');
    }
    return health;
  }

  Future<ConnectedSiteHttpResponse> _send({
    required String path,
    required String method,
    required Uint8List body,
    bool authenticate = true,
  }) async {
    _requireEnabled();
    final headers = <String, String>{
      HttpHeaders.acceptHeader: ContentType.json.mimeType,
      if (body.isNotEmpty)
        HttpHeaders.contentTypeHeader: ContentType.json.mimeType,
    };
    if (authenticate) {
      _requireSignerIdentity();
      final issuedAt = now().toUtc();
      final requestNonce = nonce();
      if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{21,127}$')
          .hasMatch(requestNonce)) {
        throw const ConnectedSiteTransportException('request_nonce_invalid');
      }
      final proof = CoordinatorRequestProof(
        workspaceId: pairing.workspaceId,
        siteId: pairing.siteId,
        coordinatorDeviceId: pairing.coordinatorDeviceId,
        clientFingerprint: signer.clientFingerprint,
        claimedDeviceId: signer.deviceId,
        issuedAt: issuedAt,
        nonce: requestNonce,
        method: method,
        canonicalTarget: path,
        bodySha256: crypto.sha256.convert(body).toString(),
        signature: '',
      );
      final signature = await signer.sign(proof.signingBytes);
      headers.addAll({
        'x-supermega-client-fingerprint': signer.clientFingerprint,
        'x-supermega-device-id': signer.deviceId,
        'x-supermega-issued-at': issuedAt.toIso8601String(),
        'x-supermega-request-nonce': requestNonce,
        'x-supermega-request-signature': signature,
      });
    }
    final response = await transport.send(
      uri: _origin.resolve(path),
      method: method,
      headers: headers,
      body: body,
      certificateSha256: pairing.certificateSha256,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ConnectedSiteTransportException(
        'coordinator_http_${response.statusCode}',
        ambiguous: method == 'POST' && response.statusCode >= 500,
      );
    }
    return response;
  }

  Map<String, Object?> _responseJson(ConnectedSiteHttpResponse response) {
    if (response.contentType?.split(';').first.trim().toLowerCase() !=
            ContentType.json.mimeType ||
        response.body.isEmpty) {
      throw const ConnectedSiteTransportException('response_invalid');
    }
    try {
      final value = jsonDecode(
        utf8.decode(response.body, allowMalformed: false),
      );
      if (value is! Map) throw const FormatException('object');
      return value.cast<String, Object?>();
    } on FormatException {
      throw const ConnectedSiteTransportException('response_invalid');
    }
  }

  void _requireEnabled() {
    if (!runtimeEnabled) {
      throw StateError('connected_site_client_disabled');
    }
  }

  void _requireSignerIdentity() {
    try {
      final encoded = signer.publicKeyBase64Url;
      final padded = encoded.padRight((encoded.length + 3) ~/ 4 * 4, '=');
      final bytes = base64Url.decode(padded);
      if (bytes.length != 32 ||
          crypto.sha256.convert(bytes).toString() != signer.clientFingerprint ||
          signer.signingKeyId != signer.clientFingerprint) {
        throw const FormatException('device identity');
      }
    } on Object {
      throw const ConnectedSiteTransportException(
        'device_identity_unavailable',
      );
    }
  }

  static Uint8List _jsonBody(Object value) =>
      Uint8List.fromList(utf8.encode(canonicalConnectedSiteJson(value)));

  static String _secureNonce() {
    final random = Random.secure();
    return base64Url
        .encode(List<int>.generate(24, (_) => random.nextInt(256)))
        .replaceAll('=', '');
  }
}
