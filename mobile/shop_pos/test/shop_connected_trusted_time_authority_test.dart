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
}

ConnectedTrustedTimeObservationRequestV1 _request() =>
    ConnectedTrustedTimeObservationRequestV1(
      approvalDigest: '5' * 64,
      challenge: _challenge(),
    );

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
