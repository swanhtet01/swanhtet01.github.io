import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_client.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

const _now = '2026-10-31T12:00:00.000Z';
const _certificate =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

void main() {
  late _Signer signer;
  late _Transport transport;
  late _Attempts attempts;
  late CoordinatorPairingV1 pairing;

  setUp(() async {
    signer = await _Signer.create();
    transport = _Transport();
    attempts = _Attempts();
    pairing = CoordinatorPairingV1(
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      coordinatorDeviceId: 'counter-1',
      certificateSha256: _certificate,
      address: '192.168.10.4',
      port: 9443,
      nonce: 'pairing_nonce_abcdefghijklmnop',
      issuedAt: _now,
      expiresAt: '2026-10-31T12:05:00.000Z',
    );
  });

  test(
    'client is default-off and unavailable key custody fails closed',
    () async {
      final disabled = SiteCoordinatorClient(pairing: pairing);
      await expectLater(disabled.readHealth(), throwsStateError);

      final enabled = SiteCoordinatorClient(
        pairing: pairing,
        runtimeEnabled: true,
        transport: transport,
        now: () => DateTime.parse('2026-10-31T12:01:00.000Z'),
      );
      await expectLater(
        enabled.readHealth(),
        throwsA(isA<ConnectedSiteTransportException>()),
      );
    },
  );

  test(
    'pairing binds exact pending acknowledgement and certificate pin',
    () async {
      transport.handler = (request) async {
        expect(request.uri, Uri.parse('https://192.168.10.4:9443/v1/pair'));
        expect(request.certificateSha256, _certificate);
        expect(request.headers, isNot(contains('authorization')));
        final body = jsonDecode(utf8.decode(request.body)) as Map;
        expect(body['nonce'], pairing.nonce);
        expect(body['clientFingerprint'], signer.clientFingerprint);
        expect(body['clientPublicKey'], signer.publicKeyBase64Url);
        return _jsonResponse({
          'schema': 'supermega.connected-site.pair-ack.v1',
          'protocolVersion': connectedSiteProtocolVersion,
          'enrollmentState': 'pending',
          'clientFingerprint': signer.clientFingerprint,
          'coordinator': pairing.toJson(),
        });
      };
      await _client(
        pairing: pairing,
        signer: signer,
        attempts: attempts,
        transport: transport,
      ).pair();
      expect(transport.requests, hasLength(1));
    },
  );

  test(
    'signed command has canonical proof and exact acknowledgement',
    () async {
      final command = await _command(signer);
      transport.handler = (request) async {
        expect(request.uri.path, '/v1/commands');
        expect(request.method, 'POST');
        await _expectValidProof(request, pairing, signer);
        return _jsonResponse(
          SiteCommandAckV1(
            commandId: command.commandId,
            commandDigest: command.commandDigest,
            state: SiteCommandAckState.accepted,
            canonicalVersion: 1,
            eventDigest: connectedSiteSha256({'event': 1}),
          ).toJson(),
        );
      };
      final result = await _client(
        pairing: pairing,
        signer: signer,
        attempts: attempts,
        transport: transport,
      ).sendCommand(command);
      expect(result.outcome, ConnectedSiteCommandOutcome.acknowledged);
      expect(result.acknowledgement?.commandId, command.commandId);
    },
  );

  test('lost reply is unknown; exact retry changes outer nonce only', () async {
    final command = await _command(signer);
    var calls = 0;
    transport.handler = (request) async {
      calls += 1;
      if (calls == 1) {
        throw const ConnectedSiteTransportException(
          'response_lost',
          ambiguous: true,
        );
      }
      return _jsonResponse(
        SiteCommandAckV1(
          commandId: command.commandId,
          commandDigest: command.commandDigest,
          state: SiteCommandAckState.replayed,
          canonicalVersion: 1,
          eventDigest: connectedSiteSha256({'event': 1}),
        ).toJson(),
      );
    };
    var nonce = 0;
    final client = _client(
      pairing: pairing,
      signer: signer,
      attempts: attempts,
      transport: transport,
      nonce: () => 'request_nonce_${++nonce}_abcdefghijk',
    );
    expect(
      (await client.sendCommand(command)).outcome,
      ConnectedSiteCommandOutcome.retryableUnknown,
    );
    expect(
      (await client.sendCommand(command)).outcome,
      ConnectedSiteCommandOutcome.acknowledged,
    );
    expect(transport.requests[0].body, transport.requests[1].body);
    expect(
      transport.requests[0].headers['x-supermega-request-nonce'],
      isNot(transport.requests[1].headers['x-supermega-request-nonce']),
    );

    final changed = await _command(signer, quantity: 2);
    await expectLater(
      client.sendCommand(changed),
      throwsA(isA<ConnectedSiteTransportException>()),
    );
    expect(transport.requests, hasLength(2));
  });

  test(
    'ambiguous command responses remain retryable and 4xx is final',
    () async {
      final command = await _command(signer);
      var response = 0;
      transport.handler = (_) async {
        response += 1;
        return switch (response) {
          1 => ConnectedSiteHttpResponse(
            statusCode: 200,
            contentType: 'application/json',
            body: Uint8List(0),
          ),
          2 => _jsonResponse(
            SiteCommandAckV1(
              commandId: 'command-substituted',
              commandDigest: command.commandDigest,
              state: SiteCommandAckState.accepted,
              canonicalVersion: 1,
              eventDigest: connectedSiteSha256({'event': 1}),
            ).toJson(),
          ),
          3 => throw const ConnectedSiteTransportException(
            'response_too_large',
            ambiguous: true,
          ),
          4 => ConnectedSiteHttpResponse(
            statusCode: 503,
            contentType: 'application/json',
            body: Uint8List(0),
          ),
          _ => ConnectedSiteHttpResponse(
            statusCode: 403,
            contentType: 'application/json',
            body: Uint8List(0),
          ),
        };
      };
      final client = _client(
        pairing: pairing,
        signer: signer,
        attempts: attempts,
        transport: transport,
      );
      for (var index = 0; index < 4; index += 1) {
        expect(
          (await client.sendCommand(command)).outcome,
          ConnectedSiteCommandOutcome.retryableUnknown,
        );
      }
      await expectLater(
        client.sendCommand(command),
        throwsA(
          isA<ConnectedSiteTransportException>().having(
            (error) => error.ambiguous,
            'ambiguous',
            isFalse,
          ),
        ),
      );
    },
  );

  test('delta and snapshot reject coordinator scope substitution', () async {
    transport.handler = (request) async {
      if (request.uri.path == '/v1/delta') {
        return _jsonResponse(
          SiteDeltaV1(
            workspaceId: 'workspace-other',
            siteId: pairing.siteId,
            afterCursor: 4,
            nextCursor: 4,
            events: const [],
          ).toJson(),
        );
      }
      final unsigned = <String, Object?>{
        'protocolVersion': connectedSiteProtocolVersion,
        'workspaceId': pairing.workspaceId,
        'siteId': 'site-other',
        'version': 1,
        'continuationCursor': 4,
        'projections': <String, Object?>{},
      };
      return _jsonResponse({
        ...unsigned,
        'checkpointDigest': connectedSiteSha256(unsigned),
      });
    };
    final client = _client(
      pairing: pairing,
      signer: signer,
      attempts: attempts,
      transport: transport,
    );
    await expectLater(
      client.readDelta(4),
      throwsA(isA<ConnectedSiteTransportException>()),
    );
    await expectLater(
      client.readSnapshot(),
      throwsA(isA<ConnectedSiteTransportException>()),
    );
  });

  test('delta, snapshot and health retain exact signed targets', () async {
    transport.handler = (request) async {
      await _expectValidProof(request, pairing, signer);
      if (request.uri.path == '/v1/delta') {
        return _jsonResponse(
          SiteDeltaV1(
            workspaceId: pairing.workspaceId,
            siteId: pairing.siteId,
            afterCursor: 4,
            nextCursor: 4,
            events: const [],
          ).toJson(),
        );
      }
      if (request.uri.path == '/v1/snapshot') {
        final unsigned = <String, Object?>{
          'protocolVersion': connectedSiteProtocolVersion,
          'workspaceId': pairing.workspaceId,
          'siteId': pairing.siteId,
          'version': 1,
          'continuationCursor': 4,
          'projections': <String, Object?>{},
        };
        return _jsonResponse({
          ...unsigned,
          'checkpointDigest': connectedSiteSha256(unsigned),
        });
      }
      return _jsonResponse({
        'schema': 'supermega.connected-site.health.v1',
        'protocolVersion': connectedSiteProtocolVersion,
        'status': 'alive',
      });
    };
    final client = _client(
      pairing: pairing,
      signer: signer,
      attempts: attempts,
      transport: transport,
    );
    expect((await client.readDelta(4)).nextCursor, 4);
    expect((await client.readSnapshot()).continuationCursor, 4);
    expect((await client.readHealth())['status'], 'alive');
    expect(transport.requests.map((request) => request.uri.toString()), [
      'https://192.168.10.4:9443/v1/delta?after=4',
      'https://192.168.10.4:9443/v1/snapshot',
      'https://192.168.10.4:9443/v1/health',
    ]);
  });
}

SiteCoordinatorClient _client({
  required CoordinatorPairingV1 pairing,
  required _Signer signer,
  required _Attempts attempts,
  required _Transport transport,
  String Function()? nonce,
}) => SiteCoordinatorClient(
  pairing: pairing,
  signer: signer,
  attempts: attempts,
  transport: transport,
  runtimeEnabled: true,
  now: () => DateTime.parse('2026-10-31T12:01:00.000Z'),
  nonce: nonce ?? () => 'request_nonce_abcdefghijklmnop',
);

Future<SiteCommandV1> _command(_Signer signer, {int quantity = 1}) async {
  final payload = <String, Object?>{
    'productId': 'product-1',
    'quantity': quantity,
  };
  final unsigned = SiteCommandV1(
    commandId: 'command-1',
    workspaceId: 'workspace-1',
    siteId: 'site-1',
    actorId: 'actor-1',
    deviceId: signer.deviceId,
    aggregateType: 'stock',
    aggregateId: 'product-1',
    expectedVersion: 0,
    commandType: 'reserve_stock',
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: 'b' * 64,
    issuedAt: _now,
    signingKeyId: signer.signingKeyId,
    signatureAlgorithm: 'ed25519',
    signature: 'A' * 86,
  );
  final signature = await signer.sign(
    utf8.encode(canonicalConnectedSiteJson(unsigned.signingPayload)),
  );
  return SiteCommandV1(
    commandId: unsigned.commandId,
    workspaceId: unsigned.workspaceId,
    siteId: unsigned.siteId,
    actorId: unsigned.actorId,
    deviceId: unsigned.deviceId,
    aggregateType: unsigned.aggregateType,
    aggregateId: unsigned.aggregateId,
    expectedVersion: unsigned.expectedVersion,
    commandType: unsigned.commandType,
    payload: unsigned.payload,
    payloadDigest: unsigned.payloadDigest,
    leaseDigest: unsigned.leaseDigest,
    issuedAt: unsigned.issuedAt,
    signingKeyId: unsigned.signingKeyId,
    signatureAlgorithm: unsigned.signatureAlgorithm,
    signature: signature,
  );
}

Future<void> _expectValidProof(
  _Request request,
  CoordinatorPairingV1 pairing,
  _Signer signer,
) async {
  final issuedAt = DateTime.parse(request.headers['x-supermega-issued-at']!);
  final target = request.uri.hasQuery
      ? '${request.uri.path}?${request.uri.query}'
      : request.uri.path;
  final proof = CoordinatorRequestProof(
    workspaceId: pairing.workspaceId,
    siteId: pairing.siteId,
    coordinatorDeviceId: pairing.coordinatorDeviceId,
    clientFingerprint: signer.clientFingerprint,
    claimedDeviceId: signer.deviceId,
    issuedAt: issuedAt,
    nonce: request.headers['x-supermega-request-nonce']!,
    method: request.method,
    canonicalTarget: target,
    bodySha256: crypto.sha256.convert(request.body).toString(),
    signature: request.headers['x-supermega-request-signature']!,
  );
  expect(
    await Ed25519().verify(
      proof.signingBytes,
      signature: Signature(
        base64Url.decode('${proof.signature}=='),
        publicKey: signer.publicKey,
      ),
    ),
    isTrue,
  );
}

ConnectedSiteHttpResponse _jsonResponse(Object value) =>
    ConnectedSiteHttpResponse(
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body: Uint8List.fromList(utf8.encode(canonicalConnectedSiteJson(value))),
    );

class _Request {
  const _Request({
    required this.uri,
    required this.method,
    required this.headers,
    required this.body,
    required this.certificateSha256,
  });
  final Uri uri;
  final String method;
  final Map<String, String> headers;
  final Uint8List body;
  final String certificateSha256;
}

class _Transport implements ConnectedSiteHttpTransport {
  final requests = <_Request>[];
  late Future<ConnectedSiteHttpResponse> Function(_Request request) handler;

  @override
  Future<ConnectedSiteHttpResponse> send({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required Uint8List body,
    required String certificateSha256,
  }) {
    final request = _Request(
      uri: uri,
      method: method,
      headers: Map.unmodifiable(headers),
      body: Uint8List.fromList(body),
      certificateSha256: certificateSha256,
    );
    requests.add(request);
    return handler(request);
  }
}

class _Attempts implements ConnectedSiteCommandAttemptStore {
  final bindings = <String, String>{};

  @override
  Future<bool> bind({required String commandId, required String digest}) async {
    final existing = bindings[commandId];
    if (existing != null) return existing == digest;
    bindings[commandId] = digest;
    return true;
  }
}

class _Signer implements ConnectedSiteDeviceSigner {
  _Signer._(this.keyPair, this.publicKey);

  static Future<_Signer> create() async {
    final pair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => index + 1),
    );
    return _Signer._(pair, await pair.extractPublicKey());
  }

  final SimpleKeyPair keyPair;
  final SimplePublicKey publicKey;

  @override
  String get clientFingerprint =>
      crypto.sha256.convert(publicKey.bytes).toString();
  @override
  String get deviceId => 'device-1';
  @override
  String get publicKeyBase64Url =>
      base64Url.encode(publicKey.bytes).replaceAll('=', '');
  @override
  String get signingKeyId => clientFingerprint;

  @override
  Future<String> sign(List<int> message) async => base64Url
      .encode((await Ed25519().sign(message, keyPair: keyPair)).bytes)
      .replaceAll('=', '');
}
