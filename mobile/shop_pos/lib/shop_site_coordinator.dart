import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';

import 'shop_connected_site_contracts.dart';
import 'shop_offline_staff_lease.dart';
import 'shop_staff_authorization.dart';

const connectedSitePairPath = '/v1/pair';
const connectedSiteCommandsPath = '/v1/commands';
const connectedSiteDeltaPath = '/v1/delta';
const connectedSiteSnapshotPath = '/v1/snapshot';
const connectedSiteHealthPath = '/v1/health';

const _pairRequestSchema = 'supermega.connected-site.pair-request.v1';
const _pairAckSchema = 'supermega.connected-site.pair-ack.v1';
const _healthSchema = 'supermega.connected-site.health.v1';
const _errorSchema = 'supermega.connected-site.error.v1';

/// A deliberately narrow request value used by the secure HTTP adapter and by
/// deterministic protocol tests. It contains no socket or TLS state.
class SiteCoordinatorRequest {
  SiteCoordinatorRequest({
    required String method,
    required this.path,
    Map<String, String> headers = const {},
    Uint8List? body,
  }) : method = method.toUpperCase(),
       headers = Map.unmodifiable({
         for (final entry in headers.entries)
           entry.key.toLowerCase(): entry.value,
       }),
       body = body ?? Uint8List(0);

  final String method;
  final String path;
  final Map<String, String> headers;
  final Uint8List body;
}

class SiteCoordinatorResponse {
  const SiteCoordinatorResponse({required this.statusCode, required this.body});

  final int statusCode;
  final Map<String, Object?> body;
}

class PairingNonceClaim {
  const PairingNonceClaim({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.nonce,
    required this.clientFingerprint,
    required this.clientPublicKey,
    required this.keyAlgorithm,
    required this.observedAt,
    required this.expiresAt,
  });

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String nonce;
  final String clientFingerprint;
  final String clientPublicKey;
  final String keyAlgorithm;
  final DateTime observedAt;
  final DateTime expiresAt;
}

/// Consumes a short-lived nonce exactly once and creates only a pending device
/// enrollment. Owner approval is a separate authority transition.
/// Production implementations must make nonce consumption and pending-record
/// creation atomic and must never approve the device from this call.
abstract interface class PairingNonceStore {
  Future<bool> consumeAndCreatePending(PairingNonceClaim claim);
}

enum CoordinatorDeviceEnrollmentState { pending, approved, revoked }

abstract interface class CoordinatorDeviceEnrollmentAuthorizer {
  /// Returns [CoordinatorDeviceEnrollmentState.approved] only for a retained,
  /// owner-approved enrollment bound to every supplied identity field.
  Future<CoordinatorDeviceEnrollmentState> stateFor({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String clientFingerprint,
  });
}

class CoordinatorDeviceEnrollmentUnavailable
    implements CoordinatorDeviceEnrollmentAuthorizer {
  const CoordinatorDeviceEnrollmentUnavailable();

  @override
  Future<CoordinatorDeviceEnrollmentState> stateFor({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String clientFingerprint,
  }) async => CoordinatorDeviceEnrollmentState.pending;
}

enum CoordinatorSiteOperation { deltaRead, snapshotRead, command }

class CoordinatorSiteAuthorizationRequest {
  const CoordinatorSiteAuthorizationRequest({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.deviceId,
    required this.clientFingerprint,
    required this.operation,
    required this.requiredCapability,
    this.actorId,
    this.leaseDigest,
  });

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String deviceId;
  final String clientFingerprint;
  final CoordinatorSiteOperation operation;
  final ShopStaffCapability requiredCapability;
  final String? actorId;
  final String? leaseDigest;
}

abstract interface class CoordinatorSiteAuthorizer {
  Future<bool> authorize(CoordinatorSiteAuthorizationRequest request);
}

class CoordinatorSiteAuthorizationUnavailable
    implements CoordinatorSiteAuthorizer {
  const CoordinatorSiteAuthorizationUnavailable();

  @override
  Future<bool> authorize(CoordinatorSiteAuthorizationRequest request) async =>
      false;
}

class CoordinatorLeaseMaterial {
  const CoordinatorLeaseMaterial({
    required this.lease,
    required this.sessionGeneration,
    required this.revocationGeneration,
  });

  final OfflineStaffLeaseV1 lease;
  final int sessionGeneration;
  final int revocationGeneration;
}

abstract interface class CoordinatorLeaseSource {
  Future<CoordinatorLeaseMaterial?> find({
    required String workspaceId,
    required String siteId,
    required String deviceId,
    String? leaseDigest,
  });
}

abstract interface class CoordinatorStationReadPolicy {
  Future<bool> allows(CoordinatorSiteAuthorizationRequest request);
}

class CoordinatorStationReadPolicyUnavailable
    implements CoordinatorStationReadPolicy {
  const CoordinatorStationReadPolicyUnavailable();

  @override
  Future<bool> allows(CoordinatorSiteAuthorizationRequest request) async =>
      false;
}

class OfflineLeaseCoordinatorSiteAuthorizer
    implements CoordinatorSiteAuthorizer {
  const OfflineLeaseCoordinatorSiteAuthorizer({
    required this.leases,
    required this.verifier,
    this.stationReadPolicy = const CoordinatorStationReadPolicyUnavailable(),
    required this.nowMillis,
  });

  final CoordinatorLeaseSource leases;
  final ShopOfflineStaffLeaseVerifier verifier;
  final CoordinatorStationReadPolicy stationReadPolicy;
  final int Function() nowMillis;

  @override
  Future<bool> authorize(CoordinatorSiteAuthorizationRequest request) async {
    final isRead = request.operation != CoordinatorSiteOperation.command;
    final material = await leases.find(
      workspaceId: request.workspaceId,
      siteId: request.siteId,
      deviceId: request.deviceId,
      leaseDigest: request.leaseDigest,
    );
    if (material == null) {
      return isRead && await stationReadPolicy.allows(request);
    }
    try {
      final verified = await verifier.verify(
        lease: material.lease,
        expected: ShopOfflineStaffLeaseExpectedBinding(
          tenantId: request.workspaceId,
          siteId: request.siteId,
          deviceId: request.deviceId,
          sessionGeneration: material.sessionGeneration,
          revocationGeneration: material.revocationGeneration,
          requiredCapability: request.requiredCapability,
        ),
        nowMillis: nowMillis(),
      );
      if (request.actorId != null && verified.actorId != request.actorId) {
        return false;
      }
      return true;
    } on ShopOfflineStaffLeaseException {
      return false;
    } on FormatException {
      return false;
    }
  }
}

abstract interface class SiteCommandCapabilityResolver {
  ShopStaffCapability? requiredCapability(SiteCommandV1 command);
}

class SiteCommandCapabilityResolverUnavailable
    implements SiteCommandCapabilityResolver {
  const SiteCommandCapabilityResolverUnavailable();

  @override
  ShopStaffCapability? requiredCapability(SiteCommandV1 command) => null;
}

class CoordinatorRequestProof {
  const CoordinatorRequestProof({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.clientFingerprint,
    required this.claimedDeviceId,
    required this.issuedAt,
    required this.nonce,
    required this.method,
    required this.canonicalTarget,
    required this.bodySha256,
    required this.signature,
  });

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String clientFingerprint;
  final String claimedDeviceId;
  final DateTime issuedAt;
  final String nonce;
  final String method;
  final String canonicalTarget;
  final String bodySha256;
  final String signature;

  Map<String, Object> get signingPayload => {
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': siteId,
    'coordinatorDeviceId': coordinatorDeviceId,
    'clientFingerprint': clientFingerprint,
    'claimedDeviceId': claimedDeviceId,
    'issuedAt': issuedAt.toUtc().toIso8601String(),
    'nonce': nonce,
    'method': method,
    'canonicalTarget': canonicalTarget,
    'bodySha256': bodySha256,
  };

  List<int> get signingBytes =>
      utf8.encode(canonicalConnectedSiteJson(signingPayload));
}

class EnrolledCoordinatorClientV1 {
  const EnrolledCoordinatorClientV1({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.deviceId,
    required this.fingerprint,
    required this.signingKeyId,
    required this.publicKey,
    required this.active,
  });

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String deviceId;
  final String fingerprint;
  final String signingKeyId;
  final SimplePublicKey publicKey;
  final bool active;
}

abstract interface class CoordinatorClientKeyStore {
  Future<EnrolledCoordinatorClientV1?> find({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String fingerprint,
  });
}

/// The implementation must atomically reject a previously consumed nonce.
abstract interface class CoordinatorRequestNonceStore {
  Future<bool> consume({
    required String clientFingerprint,
    required String nonce,
    required DateTime expiresAt,
  });
}

abstract interface class CoordinatorRequestAuthenticator {
  Future<bool> verifyAndConsume(CoordinatorRequestProof proof);
}

abstract interface class SiteCommandSignatureVerifier {
  Future<bool> verify(String clientFingerprint, SiteCommandV1 command);
}

class Ed25519SiteCommandSignatureVerifier
    implements SiteCommandSignatureVerifier {
  Ed25519SiteCommandSignatureVerifier({
    required this.clients,
    required this.coordinatorDeviceId,
  });

  final CoordinatorClientKeyStore clients;
  final String coordinatorDeviceId;
  final Ed25519 _algorithm = Ed25519();

  @override
  Future<bool> verify(String clientFingerprint, SiteCommandV1 command) async {
    try {
      final client = await clients.find(
        workspaceId: command.workspaceId,
        siteId: command.siteId,
        coordinatorDeviceId: coordinatorDeviceId,
        deviceId: command.deviceId,
        fingerprint: clientFingerprint,
      );
      if (client == null ||
          !client.active ||
          client.workspaceId != command.workspaceId ||
          client.siteId != command.siteId ||
          client.coordinatorDeviceId != coordinatorDeviceId ||
          client.deviceId != command.deviceId ||
          client.fingerprint != clientFingerprint ||
          client.signingKeyId != command.signingKeyId ||
          command.signatureAlgorithm != 'ed25519' ||
          crypto.sha256.convert(client.publicKey.bytes).toString() !=
              clientFingerprint) {
        return false;
      }
      return await _algorithm.verify(
        utf8.encode(canonicalConnectedSiteJson(command.signingPayload)),
        signature: Signature(
          _decodeBase64UrlNoPadding(command.signature),
          publicKey: client.publicKey,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}

class CoordinatorTlsIdentity {
  CoordinatorTlsIdentity._({
    required this.securityContext,
    required this.leafCertificateSha256,
  });

  factory CoordinatorTlsIdentity.fromPem({
    required Uint8List certificateChainPem,
    required Uint8List privateKeyPem,
    String? privateKeyPassword,
  }) {
    final digest = leafCertificateSha256FromPem(certificateChainPem);
    final context = SecurityContext(withTrustedRoots: false)
      ..useCertificateChainBytes(certificateChainPem)
      ..usePrivateKeyBytes(privateKeyPem, password: privateKeyPassword);
    return CoordinatorTlsIdentity._(
      securityContext: context,
      leafCertificateSha256: digest,
    );
  }

  final SecurityContext securityContext;
  final String leafCertificateSha256;

  static String leafCertificateSha256FromPem(Uint8List certificateChainPem) {
    final source = ascii.decode(certificateChainPem, allowInvalid: false);
    final match = RegExp(
      r'-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END CERTIFICATE-----',
    ).firstMatch(source);
    if (match == null) throw const FormatException('tls_leaf_missing');
    final encoded = match.group(1)!.replaceAll(RegExp(r'\s'), '');
    final der = base64.decode(encoded);
    if (der.isEmpty) throw const FormatException('tls_leaf_empty');
    return crypto.sha256.convert(der).toString();
  }
}

/// Ed25519 request authentication for already paired clients. The nonce is
/// consumed only after the signature and every enrollment binding pass.
class Ed25519CoordinatorRequestAuthenticator
    implements CoordinatorRequestAuthenticator {
  Ed25519CoordinatorRequestAuthenticator({
    required this.clients,
    required this.nonces,
    DateTime Function()? now,
    this.maxClockSkew = const Duration(minutes: 2),
  }) : now = now ?? (() => DateTime.now().toUtc());

  final CoordinatorClientKeyStore clients;
  final CoordinatorRequestNonceStore nonces;
  final DateTime Function() now;
  final Duration maxClockSkew;
  final Ed25519 _algorithm = Ed25519();

  @override
  Future<bool> verifyAndConsume(CoordinatorRequestProof proof) async {
    try {
      final observedAt = now().toUtc();
      final issuedAt = proof.issuedAt.toUtc();
      if (maxClockSkew <= Duration.zero ||
          issuedAt.isBefore(observedAt.subtract(maxClockSkew)) ||
          issuedAt.isAfter(observedAt.add(maxClockSkew)) ||
          !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{21,127}$')
              .hasMatch(proof.nonce) ||
          !RegExp(r'^[0-9a-f]{64}$').hasMatch(proof.bodySha256) ||
          !RegExp(r'^[0-9a-f]{64}$').hasMatch(proof.clientFingerprint)) {
        return false;
      }
      final client = await clients.find(
        workspaceId: proof.workspaceId,
        siteId: proof.siteId,
        coordinatorDeviceId: proof.coordinatorDeviceId,
        deviceId: proof.claimedDeviceId,
        fingerprint: proof.clientFingerprint,
      );
      if (client == null ||
          !client.active ||
          client.workspaceId != proof.workspaceId ||
          client.siteId != proof.siteId ||
          client.coordinatorDeviceId != proof.coordinatorDeviceId ||
          client.deviceId != proof.claimedDeviceId ||
          client.fingerprint != proof.clientFingerprint ||
          crypto.sha256.convert(client.publicKey.bytes).toString() !=
              proof.clientFingerprint) {
        return false;
      }
      final signatureBytes = _decodeBase64UrlNoPadding(proof.signature);
      final valid = await _algorithm.verify(
        proof.signingBytes,
        signature: Signature(signatureBytes, publicKey: client.publicKey),
      );
      if (!valid) return false;
      return await nonces.consume(
        clientFingerprint: proof.clientFingerprint,
        nonce: proof.nonce,
        expiresAt: issuedAt.add(maxClockSkew),
      );
    } catch (_) {
      return false;
    }
  }
}

abstract interface class SiteCommandHandler {
  Future<SiteCommandAckV1> handle(
    String clientFingerprint,
    SiteCommandV1 command,
  );
}

abstract interface class SiteReplicationReader {
  Future<SiteDeltaV1> readDelta(String clientFingerprint, int afterCursor);

  Future<SiteSnapshotV1> readSnapshot(String clientFingerprint);
}

class CoordinatorHealthV1 {
  const CoordinatorHealthV1({
    required this.sharedWritesAvailable,
    required this.internetAvailable,
    required this.cloudSyncHealthy,
    required this.backupCurrent,
    required this.pendingConflictCount,
    this.leaseExpiresAt,
  });

  final bool sharedWritesAvailable;
  final bool internetAvailable;
  final bool cloudSyncHealthy;
  final bool backupCurrent;
  final int pendingConflictCount;
  final DateTime? leaseExpiresAt;

  Map<String, Object?> toJson() => {
    'schema': _healthSchema,
    'protocolVersion': connectedSiteProtocolVersion,
    'sharedWritesAvailable': sharedWritesAvailable,
    'internetAvailable': internetAvailable,
    'cloudSyncHealthy': cloudSyncHealthy,
    'backupCurrent': backupCurrent,
    'pendingConflictCount': pendingConflictCount,
    if (leaseExpiresAt != null)
      'leaseExpiresAt': leaseExpiresAt!.toUtc().toIso8601String(),
  };
}

abstract interface class CoordinatorHealthProvider {
  Future<CoordinatorHealthV1> readHealth();
}

/// Default-off, TLS-only coordinator core shared by the Android and Windows
/// adapters. This class deliberately does not discover peers, elect leaders,
/// issue staff authority, or store private keys.
class SiteCoordinatorServer {
  SiteCoordinatorServer({
    required this.pairing,
    required this.requestAuthenticator,
    required this.commands,
    required this.replication,
    required this.health,
    required this.pairingResponse,
    this.commandSignatureVerifier,
    this.deviceEnrollment = const CoordinatorDeviceEnrollmentUnavailable(),
    this.siteAuthorization = const CoordinatorSiteAuthorizationUnavailable(),
    this.commandCapabilities = const SiteCommandCapabilityResolverUnavailable(),
    DateTime Function()? now,
    this.runtimeEnabled = false,
    this.maxBodyBytes = 256 * 1024,
    this.requestTimeout = const Duration(seconds: 5),
    this.maxConcurrentRequests = 32,
  }) : now = now ?? (() => DateTime.now().toUtc()),
       assert(maxBodyBytes > 0),
       assert(maxConcurrentRequests > 0);

  final PairingNonceStore pairing;
  final CoordinatorRequestAuthenticator requestAuthenticator;
  final SiteCommandHandler commands;
  final SiteCommandSignatureVerifier? commandSignatureVerifier;
  final CoordinatorDeviceEnrollmentAuthorizer deviceEnrollment;
  final CoordinatorSiteAuthorizer siteAuthorization;
  final SiteCommandCapabilityResolver commandCapabilities;
  final SiteReplicationReader replication;
  final CoordinatorHealthProvider health;
  final CoordinatorPairingV1 pairingResponse;
  final DateTime Function() now;
  final bool runtimeEnabled;
  final int maxBodyBytes;
  final Duration requestTimeout;
  final int maxConcurrentRequests;

  HttpServer? _server;
  int _activeRequests = 0;

  bool get isRunning => _server != null;
  int? get boundPort => _server?.port;

  /// Starts the only production transport. A caller must explicitly enable the
  /// feature and provide a TLS context whose certificate fingerprint matches
  /// [pairingResponse]. Wildcard/public binds fail closed.
  Future<void> start({
    required InternetAddress address,
    required int port,
    required CoordinatorTlsIdentity tlsIdentity,
    bool allowLoopbackForSimulation = false,
  }) async {
    if (!runtimeEnabled) {
      throw StateError('connected_site_disabled');
    }
    if (_server != null) throw StateError('connected_site_already_running');
    if (!isPermittedCoordinatorBindAddress(
      address,
      allowLoopbackForSimulation: allowLoopbackForSimulation,
    )) {
      throw StateError('connected_site_bind_rejected');
    }
    if (port < 0 || port > 65535) {
      throw ArgumentError.value(port, 'port', 'invalid coordinator port');
    }
    if (!allowLoopbackForSimulation &&
        (address.address != pairingResponse.address ||
            port != pairingResponse.port)) {
      throw StateError('connected_site_endpoint_mismatch');
    }
    if (tlsIdentity.leafCertificateSha256 !=
        pairingResponse.certificateSha256) {
      throw StateError('connected_site_tls_identity_mismatch');
    }
    final server = await HttpServer.bindSecure(
      address,
      port,
      tlsIdentity.securityContext,
      shared: false,
    );
    server.autoCompress = false;
    server.idleTimeout = const Duration(seconds: 10);
    _server = server;
    server.listen(_serve, onError: (_) {}, cancelOnError: false);
  }

  Future<void> stop() async {
    final server = _server;
    _server = null;
    await server?.close(force: false);
  }

  Future<void> _serve(HttpRequest request) async {
    if (_activeRequests >= maxConcurrentRequests) {
      await _write(
        request.response,
        _error(HttpStatus.serviceUnavailable, 'coordinator_busy'),
      );
      return;
    }
    _activeRequests += 1;
    try {
      final body = await _readBody(request);
      final response = await dispatch(
        SiteCoordinatorRequest(
          method: request.method,
          path: request.uri.toString(),
          headers: _copyHeaders(request.headers),
          body: body,
        ),
      ).timeout(requestTimeout);
      await _write(request.response, response);
    } on TimeoutException {
      await _write(
        request.response,
        _error(HttpStatus.gatewayTimeout, 'coordinator_timeout'),
      );
    } on _RequestTooLarge {
      await _write(
        request.response,
        _error(HttpStatus.requestEntityTooLarge, 'request_too_large'),
      );
    } catch (_) {
      await _write(
        request.response,
        _error(HttpStatus.internalServerError, 'coordinator_failure'),
      );
    } finally {
      _activeRequests -= 1;
    }
  }

  Future<Uint8List> _readBody(HttpRequest request) async {
    final declared = request.contentLength;
    if (declared > maxBodyBytes) throw const _RequestTooLarge();
    final builder = BytesBuilder(copy: false);
    var length = 0;
    await for (final chunk in request) {
      length += chunk.length;
      if (length > maxBodyBytes) throw const _RequestTooLarge();
      builder.add(chunk);
    }
    return builder.takeBytes();
  }

  Future<void> _write(
    HttpResponse target,
    SiteCoordinatorResponse source,
  ) async {
    target.statusCode = source.statusCode;
    target.headers.contentType = ContentType.json;
    target.headers.set(HttpHeaders.cacheControlHeader, 'no-store');
    target.headers.set('x-content-type-options', 'nosniff');
    target.write(jsonEncode(source.body));
    await target.close();
  }

  /// Pure protocol dispatcher. Tests may call this with synthetic requests;
  /// doing so is not evidence of TLS, installation, LAN, or device behavior.
  Future<SiteCoordinatorResponse> dispatch(
    SiteCoordinatorRequest request,
  ) async {
    if (!runtimeEnabled) {
      return _error(HttpStatus.serviceUnavailable, 'connected_site_disabled');
    }
    if (request.body.length > maxBodyBytes) {
      return _error(HttpStatus.requestEntityTooLarge, 'request_too_large');
    }
    if (_hasForbiddenAuthority(request.headers)) {
      return _error(HttpStatus.badRequest, 'ambient_authority_rejected');
    }

    final uri = Uri.tryParse(request.path);
    if (uri == null ||
        uri.hasScheme ||
        uri.hasAuthority ||
        uri.hasFragment ||
        !uri.path.startsWith('/')) {
      return _error(HttpStatus.badRequest, 'invalid_request_target');
    }

    try {
      switch ((request.method, uri.path)) {
        case ('POST', connectedSitePairPath):
          if (uri.hasQuery) return _notFound();
          return await _pair(request);
        case ('POST', connectedSiteCommandsPath):
          if (uri.hasQuery) return _notFound();
          return await _command(request, uri);
        case ('GET', connectedSiteDeltaPath):
          return await _delta(request, uri);
        case ('GET', connectedSiteSnapshotPath):
          if (uri.hasQuery) return _notFound();
          return await _snapshot(request, uri);
        case ('GET', connectedSiteHealthPath):
          if (uri.hasQuery) return _notFound();
          return await _readHealth(request);
        default:
          return _notFound();
      }
    } on FormatException {
      return _error(HttpStatus.badRequest, 'invalid_payload');
    } on TimeoutException {
      return _error(HttpStatus.gatewayTimeout, 'coordinator_timeout');
    } catch (_) {
      return _error(HttpStatus.internalServerError, 'coordinator_failure');
    }
  }

  Future<SiteCoordinatorResponse> _pair(SiteCoordinatorRequest request) async {
    final json = _decodeJsonRequest(request);
    _requireExactKeys(json, const {
      'schema',
      'protocolVersion',
      'nonce',
      'clientFingerprint',
      'clientPublicKey',
      'keyAlgorithm',
    });
    if (json['schema'] != _pairRequestSchema ||
        json['protocolVersion'] != connectedSiteProtocolVersion) {
      throw const FormatException('pairing schema');
    }
    final observedAt = now().toUtc();
    pairingResponse.requireValidAt(observedAt);
    final nonce = _identifier(json['nonce'], min: 22, max: 128);
    if (nonce != pairingResponse.nonce || json['keyAlgorithm'] != 'ed25519') {
      throw const FormatException('pairing binding');
    }
    final fingerprint = _fingerprint(json['clientFingerprint']);
    final publicKey = _base64Url(json['clientPublicKey'], min: 43, max: 512);
    if (_decodeBase64UrlNoPadding(publicKey).length != 32 ||
        _publicKeyFingerprint(publicKey) != fingerprint) {
      throw const FormatException('client key fingerprint');
    }
    final accepted = await pairing
        .consumeAndCreatePending(
          PairingNonceClaim(
            workspaceId: pairingResponse.workspaceId,
            siteId: pairingResponse.siteId,
            coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
            nonce: nonce,
            clientFingerprint: fingerprint,
            clientPublicKey: publicKey,
            keyAlgorithm: 'ed25519',
            observedAt: observedAt,
            expiresAt: DateTime.parse(pairingResponse.expiresAt),
          ),
        )
        .timeout(requestTimeout);
    if (!accepted) {
      return _error(HttpStatus.forbidden, 'pairing_denied');
    }
    return SiteCoordinatorResponse(
      statusCode: HttpStatus.ok,
      body: {
        'schema': _pairAckSchema,
        'protocolVersion': connectedSiteProtocolVersion,
        'enrollmentState': CoordinatorDeviceEnrollmentState.pending.name,
        'clientFingerprint': fingerprint,
        'coordinator': pairingResponse.toJson(),
      },
    );
  }

  Future<SiteCoordinatorResponse> _command(
    SiteCoordinatorRequest request,
    Uri uri,
  ) async {
    final command = SiteCommandV1.fromJson(_decodeJsonRequest(request));
    if (command.workspaceId != pairingResponse.workspaceId ||
        command.siteId != pairingResponse.siteId) {
      return _error(HttpStatus.forbidden, 'command_scope_mismatch');
    }
    final authenticated = await _authenticatedClient(
      request,
      uri,
      claimedDeviceId: command.deviceId,
    );
    if (authenticated == null) {
      return _error(HttpStatus.forbidden, 'client_not_authorized');
    }
    final verifier = commandSignatureVerifier;
    if (verifier == null) {
      return _error(
        HttpStatus.serviceUnavailable,
        'command_signature_verifier_unavailable',
      );
    }
    if (!await verifier
        .verify(authenticated.fingerprint, command)
        .timeout(requestTimeout)) {
      return _error(HttpStatus.forbidden, 'command_signature_invalid');
    }
    final capability = commandCapabilities.requiredCapability(command);
    if (capability == null ||
        !await siteAuthorization
            .authorize(
              CoordinatorSiteAuthorizationRequest(
                workspaceId: pairingResponse.workspaceId,
                siteId: pairingResponse.siteId,
                coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
                deviceId: authenticated.deviceId,
                clientFingerprint: authenticated.fingerprint,
                operation: CoordinatorSiteOperation.command,
                requiredCapability: capability,
                actorId: command.actorId,
                leaseDigest: command.leaseDigest,
              ),
            )
            .timeout(requestTimeout)) {
      return _error(HttpStatus.forbidden, 'site_authorization_denied');
    }
    final ack = await commands
        .handle(authenticated.fingerprint, command)
        .timeout(requestTimeout);
    if (ack.commandId != command.commandId ||
        ack.commandDigest != command.commandDigest) {
      return _error(
        HttpStatus.internalServerError,
        'command_ack_binding_failed',
      );
    }
    return SiteCoordinatorResponse(
      statusCode: HttpStatus.ok,
      body: ack.toJson(),
    );
  }

  Future<SiteCoordinatorResponse> _delta(
    SiteCoordinatorRequest request,
    Uri uri,
  ) async {
    if (request.body.isNotEmpty ||
        uri.queryParametersAll.length != 1 ||
        uri.queryParametersAll['after']?.length != 1) {
      throw const FormatException('delta query');
    }
    final authenticated = await _authenticatedClient(request, uri);
    if (authenticated == null) {
      return _error(HttpStatus.forbidden, 'client_not_authorized');
    }
    if (!await _authorizeRead(
      authenticated,
      CoordinatorSiteOperation.deltaRead,
    )) {
      return _error(HttpStatus.forbidden, 'site_authorization_denied');
    }
    final source = uri.queryParameters['after'];
    final after = int.tryParse(source ?? '');
    if (after == null ||
        after < 0 ||
        source != after.toString() ||
        uri.query != 'after=$after') {
      throw const FormatException('delta cursor');
    }
    final delta = await replication
        .readDelta(authenticated.fingerprint, after)
        .timeout(requestTimeout);
    if (delta.afterCursor != after) {
      return _error(
        HttpStatus.internalServerError,
        'delta_cursor_binding_failed',
      );
    }
    return SiteCoordinatorResponse(
      statusCode: HttpStatus.ok,
      body: delta.toJson(),
    );
  }

  Future<SiteCoordinatorResponse> _snapshot(
    SiteCoordinatorRequest request,
    Uri uri,
  ) async {
    if (request.body.isNotEmpty) throw const FormatException('snapshot body');
    final authenticated = await _authenticatedClient(request, uri);
    if (authenticated == null) {
      return _error(HttpStatus.forbidden, 'client_not_authorized');
    }
    if (!await _authorizeRead(
      authenticated,
      CoordinatorSiteOperation.snapshotRead,
    )) {
      return _error(HttpStatus.forbidden, 'site_authorization_denied');
    }
    final snapshot = await replication
        .readSnapshot(authenticated.fingerprint)
        .timeout(requestTimeout);
    return SiteCoordinatorResponse(
      statusCode: HttpStatus.ok,
      body: snapshot.toJson(),
    );
  }

  Future<SiteCoordinatorResponse> _readHealth(
    SiteCoordinatorRequest request,
  ) async {
    if (request.body.isNotEmpty) throw const FormatException('health body');
    return SiteCoordinatorResponse(
      statusCode: HttpStatus.ok,
      body: const {
        'schema': _healthSchema,
        'protocolVersion': connectedSiteProtocolVersion,
        'status': 'alive',
      },
    );
  }

  /// Detailed status is local UI state only and is never serialized by the
  /// unauthenticated HTTP health endpoint.
  Future<CoordinatorHealthV1> readLocalHealth() =>
      health.readHealth().timeout(requestTimeout);

  Map<String, Object?> _decodeJsonRequest(SiteCoordinatorRequest request) {
    final contentType = request.headers[HttpHeaders.contentTypeHeader];
    if (contentType == null ||
        contentType.split(';').first.trim().toLowerCase() !=
            ContentType.json.mimeType ||
        request.body.isEmpty) {
      throw const FormatException('content type');
    }
    final decoded = jsonDecode(
      utf8.decode(request.body, allowMalformed: false),
    );
    if (decoded is! Map) throw const FormatException('json object');
    return decoded.cast<String, Object?>();
  }

  Future<_AuthenticatedCoordinatorClient?> _authenticatedClient(
    SiteCoordinatorRequest request,
    Uri uri, {
    String? claimedDeviceId,
  }) async {
    try {
      final fingerprint = _fingerprint(
        request.headers['x-supermega-client-fingerprint'],
      );
      final deviceId = _identifier(
        claimedDeviceId ?? request.headers['x-supermega-device-id'],
        max: 128,
      );
      final issuedAt = _strictInstant(request.headers['x-supermega-issued-at']);
      final nonce = _identifier(
        request.headers['x-supermega-request-nonce'],
        min: 22,
        max: 128,
      );
      final signature = _base64Url(
        request.headers['x-supermega-request-signature'],
        min: 86,
        max: 128,
      );
      final proof = CoordinatorRequestProof(
        workspaceId: pairingResponse.workspaceId,
        siteId: pairingResponse.siteId,
        coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
        clientFingerprint: fingerprint,
        claimedDeviceId: deviceId,
        issuedAt: issuedAt,
        nonce: nonce,
        method: request.method,
        canonicalTarget: uri.hasQuery ? '${uri.path}?${uri.query}' : uri.path,
        bodySha256: crypto.sha256.convert(request.body).toString(),
        signature: signature,
      );
      final proofValid = await requestAuthenticator
          .verifyAndConsume(proof)
          .timeout(requestTimeout);
      if (!proofValid) return null;
      final enrollment = await deviceEnrollment
          .stateFor(
            workspaceId: pairingResponse.workspaceId,
            siteId: pairingResponse.siteId,
            coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
            deviceId: deviceId,
            clientFingerprint: fingerprint,
          )
          .timeout(requestTimeout);
      return enrollment == CoordinatorDeviceEnrollmentState.approved
          ? _AuthenticatedCoordinatorClient(
              fingerprint: fingerprint,
              deviceId: deviceId,
            )
          : null;
    } on FormatException {
      return null;
    }
  }

  Future<bool> _authorizeRead(
    _AuthenticatedCoordinatorClient client,
    CoordinatorSiteOperation operation,
  ) => siteAuthorization
      .authorize(
        CoordinatorSiteAuthorizationRequest(
          workspaceId: pairingResponse.workspaceId,
          siteId: pairingResponse.siteId,
          coordinatorDeviceId: pairingResponse.coordinatorDeviceId,
          deviceId: client.deviceId,
          clientFingerprint: client.fingerprint,
          operation: operation,
          requiredCapability: ShopStaffCapability.managementRead,
        ),
      )
      .timeout(requestTimeout);

  bool _hasForbiddenAuthority(Map<String, String> headers) =>
      headers.containsKey(HttpHeaders.authorizationHeader) ||
      headers.containsKey(HttpHeaders.cookieHeader) ||
      headers.containsKey('x-api-key') ||
      headers.containsKey('apikey');

  SiteCoordinatorResponse _notFound() =>
      _error(HttpStatus.notFound, 'route_not_found');

  SiteCoordinatorResponse _error(int status, String code) =>
      SiteCoordinatorResponse(
        statusCode: status,
        body: {
          'schema': _errorSchema,
          'protocolVersion': connectedSiteProtocolVersion,
          'error': code,
        },
      );
}

Map<String, String> _copyHeaders(HttpHeaders source) {
  final result = <String, String>{};
  source.forEach((name, values) {
    result[name] = values.join(',');
  });
  return result;
}

bool isPermittedCoordinatorBindAddress(
  InternetAddress address, {
  bool allowLoopbackForSimulation = false,
}) {
  if (address.isLoopback) return allowLoopbackForSimulation;
  if (address.isMulticast || address.isLinkLocal) return false;
  final bytes = address.rawAddress;
  if (address.type == InternetAddressType.IPv4) {
    if (bytes.length != 4 || bytes.every((value) => value == 0)) return false;
    return bytes[0] == 10 ||
        (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
        (bytes[0] == 192 && bytes[1] == 168);
  }
  if (address.type == InternetAddressType.IPv6) {
    if (bytes.length != 16 || bytes.every((value) => value == 0)) return false;
    return bytes[0] & 0xfe == 0xfc;
  }
  return false;
}

void _requireExactKeys(Map<String, Object?> source, Set<String> expected) {
  if (source.keys.toSet().difference(expected).isNotEmpty ||
      expected.difference(source.keys.toSet()).isNotEmpty) {
    throw const FormatException('unexpected fields');
  }
}

String _identifier(Object? source, {int min = 1, int max = 128}) {
  if (source is! String ||
      source.length < min ||
      source.length > max ||
      !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]*$').hasMatch(source)) {
    throw const FormatException('invalid identifier');
  }
  return source;
}

String _fingerprint(Object? source) {
  if (source is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(source)) {
    throw const FormatException('invalid fingerprint');
  }
  return source;
}

String _base64Url(Object? source, {required int min, required int max}) {
  if (source is! String ||
      source.length < min ||
      source.length > max ||
      !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(source)) {
    throw const FormatException('invalid public key');
  }
  return source;
}

DateTime _strictInstant(Object? source) {
  if (source is! String ||
      !RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,6})?Z$')
          .hasMatch(source)) {
    throw const FormatException('invalid request timestamp');
  }
  final value = DateTime.tryParse(source);
  if (value == null || !value.isUtc) {
    throw const FormatException('invalid request timestamp');
  }
  return value;
}

List<int> _decodeBase64UrlNoPadding(String source) {
  if (!RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(source)) {
    throw const FormatException('invalid base64url');
  }
  final padded = source.padRight((source.length + 3) ~/ 4 * 4, '=');
  return base64Url.decode(padded);
}

String _publicKeyFingerprint(String publicKey) {
  try {
    final padded = publicKey.padRight((publicKey.length + 3) ~/ 4 * 4, '=');
    final bytes = base64Url.decode(padded);
    if (bytes.length != 32) {
      throw const FormatException('invalid public key length');
    }
    return crypto.sha256.convert(bytes).toString();
  } on FormatException {
    rethrow;
  } catch (_) {
    throw const FormatException('invalid public key encoding');
  }
}

class _RequestTooLarge implements Exception {
  const _RequestTooLarge();
}

class _AuthenticatedCoordinatorClient {
  const _AuthenticatedCoordinatorClient({
    required this.fingerprint,
    required this.deviceId,
  });

  final String fingerprint;
  final String deviceId;
}
