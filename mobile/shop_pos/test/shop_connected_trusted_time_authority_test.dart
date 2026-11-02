import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_authority.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';

void main() {
  test('observation request round-trips exact canonical bytes', () {
    final request = _request();
    final decoded = ConnectedTrustedTimeObservationRequestV1.fromCanonicalBytes(
      request.canonicalBytes,
    );

    expect(decoded.approvalDigest, request.approvalDigest);
    expect(decoded.challenge.requestDigest, request.challenge.requestDigest);
    expect(decoded.observationRequestDigest, request.observationRequestDigest);
    expect(utf8.decode(decoded.canonicalBytes), request.canonicalJson);
    expect(request.toJson()['challenge'], request.challenge.toJson());
  });

  test('approval, challenge, and request substitutions fail closed', () {
    final request = _request();
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromJson({
        ...request.toJson(),
        'approvalDigest': '9' * 64,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromJson({
        ...request.toJson(),
        'challenge': _challenge(sessionGeneration: 4).toJson(),
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromJson({
        ...request.toJson(),
        'observationRequestDigest': '0' * 64,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationRequestV1(
        approvalDigest: 'not-a-digest',
        challenge: _challenge(),
      ),
      throwsFormatException,
    );
  });

  test('extra fields and noncanonical or malformed bytes fail closed', () {
    final request = _request();
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromJson({
        ...request.toJson(),
        'extra': true,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromJson({
        ...request.toJson(),
        'schema': 'supermega.connected-trusted-time-observation-request.v2',
      }),
      throwsFormatException,
    );
    final missingProtocol = Map<String, Object>.from(request.toJson())
      ..remove('protocolVersion');
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromJson(missingProtocol),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromCanonicalBytes(
        utf8.encode('${request.canonicalJson}\n'),
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationRequestV1.fromCanonicalBytes(const [
        0xff,
      ]),
      throwsFormatException,
    );
  });

  test('default coordinator authority remains unavailable', () async {
    const authority = UnavailableConnectedTrustedTimeCoordinatorAuthority();
    await expectLater(
      authority.observe(_request()),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          'connected_trusted_time_coordinator_authority_unavailable',
        ),
      ),
    );
  });

  test('v2 wire request and response round-trip exact canonical bytes', () {
    final wireRequest = _wireRequest();
    final decodedRequest = ConnectedTrustedTimeWireRequestV2.fromCanonicalBytes(
      wireRequest.canonicalBytes,
    );
    expect(decodedRequest.wireRequestDigest, wireRequest.wireRequestDigest);
    expect(
      decodedRequest.request.observationRequestDigest,
      wireRequest.request.observationRequestDigest,
    );

    final response = ConnectedTrustedTimeWireResponseV2(
      request: wireRequest,
      observation: _observation(wireRequest.request.challenge),
    );
    final decodedResponse =
        ConnectedTrustedTimeWireResponseV2.fromCanonicalBytes(
          response.canonicalBytes,
          request: wireRequest,
        );
    expect(decodedResponse.wireRequestDigest, wireRequest.wireRequestDigest);
    expect(
      decodedResponse.observation.observationDigest,
      response.observation.observationDigest,
    );
    expect(utf8.decode(decodedResponse.canonicalBytes), response.canonicalJson);
  });

  test('v2 request rejects substitution, shape, encoding, and oversize', () {
    final wireRequest = _wireRequest();
    final missingRequest = Map<String, Object>.from(wireRequest.toJson())
      ..remove('request');
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromJson(missingRequest),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromJson({
        ...wireRequest.toJson(),
        'protocolVersion': 1,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromJson({
        ...wireRequest.toJson(),
        'request': ConnectedTrustedTimeObservationRequestV1(
          approvalDigest: '9' * 64,
          challenge: _challenge(),
        ).toJson(),
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromJson({
        ...wireRequest.toJson(),
        'extra': true,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromCanonicalBytes(
        utf8.encode('${wireRequest.canonicalJson}\n'),
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromCanonicalBytes(const [0xff]),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireRequestV2.fromCanonicalBytes(
        List<int>.filled(connectedTrustedTimeWireMaximumBytes + 1, 0x20),
      ),
      throwsFormatException,
    );
  });

  test('v2 response rejects request echo and observation substitution', () {
    final wireRequest = _wireRequest();
    final response = ConnectedTrustedTimeWireResponseV2(
      request: wireRequest,
      observation: _observation(wireRequest.request.challenge),
    );
    expect(
      () => ConnectedTrustedTimeWireResponseV2.fromJson({
        ...response.toJson(),
        'wireRequestDigest': '0' * 64,
      }, request: wireRequest),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireResponseV2.fromJson({
        ...response.toJson(),
        'extra': true,
      }, request: wireRequest),
      throwsFormatException,
    );
    final substitutedObservation = _observation(
      _challenge(sessionGeneration: 4),
    );
    expect(
      () => ConnectedTrustedTimeWireResponseV2(
        request: wireRequest,
        observation: substitutedObservation,
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireResponseV2.fromJson({
        ...response.toJson(),
        'observation': substitutedObservation.toJson(),
      }, request: wireRequest),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireResponseV2.fromCanonicalBytes(
        utf8.encode('${response.canonicalJson} '),
        request: wireRequest,
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeWireResponseV2.fromCanonicalBytes(
        List<int>.filled(connectedTrustedTimeWireMaximumBytes + 1, 0x20),
        request: wireRequest,
      ),
      throwsFormatException,
    );
  });
}

ConnectedTrustedTimeObservationRequestV1 _request() =>
    ConnectedTrustedTimeObservationRequestV1(
      approvalDigest: '5' * 64,
      challenge: _challenge(),
    );

ConnectedTrustedTimeWireRequestV2 _wireRequest() =>
    ConnectedTrustedTimeWireRequestV2(request: _request());

ConnectedTrustedTimeChallengeV1 _challenge({int sessionGeneration = 3}) =>
    ConnectedTrustedTimeChallengeV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      coordinatorDeviceId: 'coordinator_1',
      clientDeviceId: 'device_1',
      clientFingerprint: '1' * 64,
      sessionGeneration: sessionGeneration,
      coordinatorBindingDigest: '2' * 64,
      coordinatorBindingGeneration: 7,
      nonce: 'trusted_time_authority_nonce_1',
      bootSessionId: '3' * 64,
      startedMonotonicMillis: 5000,
    );

ConnectedTrustedTimeObservationV1 _observation(
  ConnectedTrustedTimeChallengeV1 challenge,
) => ConnectedTrustedTimeObservationV1(
  challenge: challenge,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: 2,
  authorityEpoch: 5,
  authoritySequence: 9,
  observedAtMillis: 1800000000000,
  validUntilMillis: 1800000060000,
  authoritySignature: base64UrlEncode(List<int>.filled(64, 7))
      .replaceAll('=', ''),
);
