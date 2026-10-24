import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supermega_shop/shop_correction_authorization_service.dart';
import 'package:supermega_shop/shop_correction_receipt.dart';

const _requestId = '11ecf4e2-f7ac-4e1d-8d5f-6edb796550dc';
const _receiptId = '784900b0-0293-4e0a-82e9-419e7dd543da';
const _workspaceId = 'workspace-shop-a';
const _ownerId = '2f8d24d8-308c-4dc8-a352-7b61df756728';
const _capability = 'shop.sale.reverse';
const _testKeyId = 'test-2026-10-23';
const _goldenPublicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
const _testSeed = <int>[
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
];
const _fingerprint =
    '{"operationId":"reversal-1","saleId":"sale-1",'
    '"saleSnapshotDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",'
    '"restockItems":true,"reason":"Customer returned the complete sale",'
    '"cashReturnConfirmed":true,"expectedCashShiftId":"shift-1",'
    '"paymentResolution":"cash_returned_now"}';
final _commandDigest = crypto.sha256
    .convert(utf8.encode(_fingerprint))
    .toString();
final _now = DateTime.utc(2026, 10, 22, 12);
late final SimpleKeyPair _testKeyPair;
late final ShopCorrectionReceiptVerifier _testReceiptVerifier;

String _repeat(String value, int count) => List.filled(count, value).join();
String _base64UrlNoPadding(List<int> value) =>
    base64Url.encode(value).replaceAll('=', '');

Future<Map<String, Object?>> _receipt({
  String contract = shopCorrectionAuthorizationReceiptContract,
  String receiptId = _receiptId,
  String workspaceId = _workspaceId,
  String actorId = _ownerId,
  String actorLabel = 'Workspace owner',
  String capability = _capability,
  String? commandDigest,
  String finalizationRequestId = _requestId,
  int? finalizedAtMillis,
  int? issuedAtMillis,
  int? expiresAtMillis,
  String keyId = _testKeyId,
  String? signature,
}) async {
  final issued = issuedAtMillis ?? _now.millisecondsSinceEpoch - 1000;
  final finalized = finalizedAtMillis ?? issued;
  final expires = expiresAtMillis ?? issued + 300000;
  final digest = commandDigest ?? _commandDigest;
  const source = 'managed_membership_receipt_v1';
  const role = 'owner';
  final receiptDigest = shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: role,
    capability: capability,
    commandDigest: digest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: finalized,
    issuedAtMillis: issued,
    expiresAtMillis: expires,
  );
  final signed = await Ed25519().sign(
    utf8.encode(
      shopCorrectionAuthorizationSignatureMessage(
        keyId: keyId,
        receiptDigest: receiptDigest,
      ),
    ),
    keyPair: _testKeyPair,
  );
  return {
    'contract': contract,
    'receiptId': receiptId,
    'receiptDigest': receiptDigest,
    'finalizationRequestId': finalizationRequestId,
    'keyId': keyId,
    'signature': signature ?? _base64UrlNoPadding(signed.bytes),
    'workspaceId': workspaceId,
    'actorId': actorId,
    'actorLabel': actorLabel,
    'actorRole': role,
    'capability': capability,
    'source': source,
    'commandDigest': digest,
    'finalizedAtMillis': finalized,
    'issuedAtMillis': issued,
    'expiresAtMillis': expires,
  };
}

Future<Map<String, Object?>> _envelope({
  Map<String, Object?>? receipt,
  bool replay = false,
}) async => {
  'authorization': receipt ?? await _receipt(),
  'idempotent_replay': replay,
  'local_mutation_performed': false,
  'money_returned': false,
  'external_writes_performed': !replay,
  'secret_values_exposed': false,
};

http.Response _jsonResponse(Object? body, int status) => http.Response(
  jsonEncode(body),
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'pragma': 'no-cache',
  },
);

Matcher _throwsCode(String code) => throwsA(
  isA<ShopCorrectionAuthorizationException>().having(
    (error) => error.code,
    'code',
    code,
  ),
);

ShopCorrectionAuthorizationService _service(
  http.Client client, {
  Future<String?> Function()? accessToken,
  Future<String?> Function()? currentUserId,
  Uri? endpoint,
  ShopCorrectionReceiptVerifier? receiptVerifier,
  Duration requestTimeout = const Duration(seconds: 15),
}) => ShopCorrectionAuthorizationService(
  endpoint:
      endpoint ??
      shopCorrectionAuthorizationEndpoint('https://app.supermega.dev')!,
  accessToken: accessToken ?? () async => 'short-lived-session',
  currentUserId: currentUserId ?? () async => _ownerId,
  client: client,
  receiptVerifier: receiptVerifier ?? _testReceiptVerifier,
  requestTimeout: requestTimeout,
);

Future<ShopCorrectionAuthorizationResult> _authorize(
  ShopCorrectionAuthorizationService service, {
  String workspaceId = _workspaceId,
  String capability = _capability,
  String? commandDigest,
  String requestFingerprint = _fingerprint,
}) => service.authorize(
  authorizationRequestId: _requestId,
  workspaceId: workspaceId,
  capability: capability,
  commandDigest: commandDigest ?? _commandDigest,
  requestFingerprint: requestFingerprint,
);

void main() {
  setUpAll(() async {
    final algorithm = Ed25519();
    _testKeyPair = await algorithm.newKeyPairFromSeed(_testSeed);
    final publicKey = await _testKeyPair.extractPublicKey();
    _testReceiptVerifier = ShopCorrectionReceiptVerifier({
      _testKeyId: _base64UrlNoPadding(publicKey.bytes),
    });
  });

  test('endpoint is fixed under a clean HTTPS origin', () {
    expect(
      shopCorrectionAuthorizationEndpoint('https://app.supermega.dev')
          .toString(),
      'https://app.supermega.dev$shopCorrectionAuthorizationPath',
    );
    expect(
      shopCorrectionAuthorizationEndpoint('https://app.supermega.dev:443/')
          .toString(),
      'https://app.supermega.dev$shopCorrectionAuthorizationPath',
    );
    for (final value in [
      'http://app.supermega.dev',
      'https://app.supermega.dev:444',
      'https://user@app.supermega.dev',
      'https://evil.invalid',
      'https://app.supermega.dev/other',
      'https://app.supermega.dev?workspace=other',
      'https://app.supermega.dev/#fragment',
      'not a url',
    ]) {
      expect(shopCorrectionAuthorizationEndpoint(value), isNull, reason: value);
    }
  });

  test(
    'v3 digest and Ed25519 proof match the cross-runtime contract',
    () async {
      final publicKey = await _testKeyPair.extractPublicKey();
      final receipt = await _receipt();

      expect(_base64UrlNoPadding(publicKey.bytes), _goldenPublicKey);
      expect(
        shopCorrectionAuthorizationReceiptDigest(
          source: 'managed_membership_receipt_v1',
          receiptId: '11111111-1111-4111-8111-111111111111',
          finalizationRequestId: '22222222-2222-4222-8222-222222222222',
          workspaceId: 'workspace-1',
          actorId: 'actor-1',
          actorLabel: 'Workspace owner',
          actorRole: 'owner',
          capability: 'shop.sale.reverse',
          commandDigest: _repeat('0', 64),
          finalizedAtMillis: 1000,
          issuedAtMillis: 1000,
          expiresAtMillis: 301000,
        ),
        '5bd47b28aba9fda0f821113cad67d159c0ad94c38f052ff1a3efb42a6ce54c7a',
      );
      expect(receipt['signature'], hasLength(86));
    },
  );

  test(
    'a directly supplied insecure endpoint fails before network use',
    () async {
      var calls = 0;
      final service = _service(
        MockClient((_) async {
          calls++;
          return _jsonResponse(await _envelope(), 200);
        }),
        endpoint: Uri.parse(
          'http://app.supermega.dev$shopCorrectionAuthorizationPath',
        ),
      );
      await expectLater(
        _authorize(service),
        _throwsCode('endpoint_unavailable'),
      );
      expect(calls, 0);
    },
  );

  test(
    'a directly supplied foreign HTTPS endpoint fails before token use',
    () async {
      var tokenReads = 0;
      var calls = 0;
      final service = _service(
        MockClient((_) async {
          calls++;
          return _jsonResponse(await _envelope(), 200);
        }),
        accessToken: () async {
          tokenReads++;
          return 'must-not-leave-device';
        },
        endpoint: Uri.parse(
          'https://evil.invalid$shopCorrectionAuthorizationPath',
        ),
      );
      await expectLater(
        _authorize(service),
        _throwsCode('endpoint_unavailable'),
      );
      expect(tokenReads, 0);
      expect(calls, 0);
    },
  );

  test('the end-to-end deadline bounds a stalled session lookup', () async {
    var calls = 0;
    final stalledUser = Completer<String?>();
    final service = _service(
      MockClient((_) async {
        calls++;
        return _jsonResponse(await _envelope(), 200);
      }),
      currentUserId: () => stalledUser.future,
      requestTimeout: const Duration(milliseconds: 10),
    );
    await expectLater(
      _authorize(service),
      _throwsCode('authorization_unavailable'),
    );
    expect(calls, 0);
  });

  test('success sends exact command and returns a bound receipt', () async {
    var calls = 0;
    late http.Request sent;
    final service = _service(
      MockClient((request) async {
        calls++;
        sent = request;
        return _jsonResponse(await _envelope(), 200);
      }),
    );

    final result = await _authorize(service);

    expect(calls, 1);
    expect(sent.method, 'POST');
    expect(sent.url.path, shopCorrectionAuthorizationPath);
    expect(sent.followRedirects, isFalse);
    expect(sent.headers['authorization'], 'Bearer short-lived-session');
    expect(sent.headers['x-supermega-workspace-id'], _workspaceId);
    expect(sent.headers['cache-control'], 'no-store');
    expect(sent.headers['pragma'], 'no-cache');
    expect(jsonDecode(sent.body), {
      'authorization_request_id': _requestId,
      'capability': _capability,
      'command_digest': _commandDigest,
      'request_fingerprint': _fingerprint,
      'confirmation': 'AUTHORIZE FULL SALE REVERSAL',
    });
    expect(result.idempotentReplay, isFalse);
    expect(result.externalWritesPerformed, isTrue);
    expect(result.authorization.receiptId, _receiptId);
    expect(result.authorization.workspaceId, _workspaceId);
    expect(result.authorization.actorId, _ownerId);
    expect(result.authorization.commandDigest, _commandDigest);
    expect(result.authorization.finalizationRequestId, _requestId);
    expect(
      result.authorization.finalizedAtMillis,
      result.authorization.issuedAtMillis,
    );
    expect(result.authorization.keyId, _testKeyId);
    expect(result.authorization.signature, hasLength(86));
  });

  test(
    'an empty production-style keyring fails before authority reads',
    () async {
      expect(ShopCorrectionReceiptVerifier.production().hasPinnedKeys, isFalse);
      expect(
        ShopCorrectionReceiptVerifier({_testKeyId: 'not-a-public-key'})
            .hasPinnedKeys,
        isFalse,
      );
      var userReads = 0;
      var tokenReads = 0;
      var calls = 0;
      final service = _service(
        MockClient((_) async {
          calls++;
          return _jsonResponse(await _envelope(), 200);
        }),
        currentUserId: () async {
          userReads++;
          return _ownerId;
        },
        accessToken: () async {
          tokenReads++;
          return 'must-not-be-read';
        },
        receiptVerifier: ShopCorrectionReceiptVerifier(
          const <String, String>{},
        ),
      );

      expect(
        await service.canRequestAuthorization(
          workspaceId: _workspaceId,
          requiredActorId: _ownerId,
          capability: _capability,
        ),
        isFalse,
      );
      await expectLater(
        _authorize(service),
        _throwsCode('authorization_unavailable'),
      );
      expect(userReads, 0);
      expect(tokenReads, 0);
      expect(calls, 0);
    },
  );

  test(
    'availability rejects a different bound actor before token access',
    () async {
      var tokenReads = 0;
      final service = _service(
        MockClient((_) async => throw StateError('network must not be called')),
        accessToken: () async {
          tokenReads++;
          return 'must-not-be-read';
        },
      );

      expect(
        await service.canRequestAuthorization(
          workspaceId: _workspaceId,
          requiredActorId: 'different-workspace-owner',
          capability: _capability,
        ),
        isFalse,
      );
      expect(tokenReads, 0);
    },
  );

  test('exact replay preserves the receipt and reports no new write', () async {
    final service = _service(
      MockClient(
        (_) async => _jsonResponse(await _envelope(replay: true), 200),
      ),
    );
    final result = await _authorize(service);
    expect(result.idempotentReplay, isTrue);
    expect(result.externalWritesPerformed, isFalse);
    expect(result.authorization.receiptId, _receiptId);
  });

  test(
    'wallet reconciliation uses its narrow capability and confirmation',
    () async {
      const fingerprint =
          '{"operationId":"wallet-reconciliation-1",'
          '"reversalId":"reversal-1","originalPaymentMethod":"kbzpay",'
          '"originalTotalMmk":15000,"outcome":"money_returned",'
          '"evidenceReference":"Provider case 123"}';
      final digest = crypto.sha256.convert(utf8.encode(fingerprint)).toString();
      late http.Request sent;
      final service = _service(
        MockClient((request) async {
          sent = request;
          return _jsonResponse(
            await _envelope(
              receipt: await _receipt(
                capability: 'shop.sale.reconcile_wallet',
                commandDigest: digest,
              ),
            ),
            200,
          );
        }),
      );

      final result = await _authorize(
        service,
        capability: 'shop.sale.reconcile_wallet',
        commandDigest: digest,
        requestFingerprint: fingerprint,
      );

      final body = jsonDecode(sent.body) as Map<String, dynamic>;
      expect(body['confirmation'], 'AUTHORIZE WALLET RECONCILIATION');
      expect(result.authorization.capability, 'shop.sale.reconcile_wallet');
    },
  );

  test('missing session fails before a request is sent', () async {
    var calls = 0;
    final client = MockClient((_) async {
      calls++;
      return _jsonResponse(await _envelope(), 200);
    });
    await expectLater(
      _authorize(_service(client, currentUserId: () async => null)),
      _throwsCode('sign_in_required'),
    );
    await expectLater(
      _authorize(_service(client, accessToken: () async => null)),
      _throwsCode('sign_in_required'),
    );
    expect(calls, 0);
  });

  test('session change before or after the request fails closed', () async {
    Future<String?> changingUser(List<String> values) async =>
        values.removeAt(0);

    final beforeSend = <String>[_ownerId, 'different-user'];
    var calls = 0;
    await expectLater(
      _authorize(
        _service(
          MockClient((_) async {
            calls++;
            return _jsonResponse(await _envelope(), 200);
          }),
          currentUserId: () => changingUser(beforeSend),
        ),
      ),
      _throwsCode('session_changed'),
    );
    expect(calls, 0);

    final afterSend = <String>[_ownerId, _ownerId, 'different-user'];
    await expectLater(
      _authorize(
        _service(
          MockClient((_) async {
            calls++;
            return _jsonResponse(await _envelope(), 200);
          }),
          currentUserId: () => changingUser(afterSend),
        ),
      ),
      _throwsCode('session_changed'),
    );
    expect(calls, 1);
  });

  test('redirect is never followed', () async {
    late http.Request sent;
    final service = _service(
      MockClient((request) async {
        sent = request;
        return http.Response(
          '',
          302,
          headers: {'location': 'https://evil.invalid'},
        );
      }),
    );
    await expectLater(_authorize(service), _throwsCode('redirect_rejected'));
    expect(sent.followRedirects, isFalse);
  });

  test('oversized and malformed responses fail without body leakage', () async {
    final oversized = _service(
      MockClient(
        (_) async => http.Response(
          _repeat('x', 17000),
          200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'private, no-store',
            'pragma': 'no-cache',
          },
        ),
      ),
    );
    await expectLater(_authorize(oversized), _throwsCode('response_too_large'));

    final malformed = _service(
      MockClient(
        (_) async => http.Response(
          '{"private":"do-not-surface"',
          200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'private, no-store',
            'pragma': 'no-cache',
          },
        ),
      ),
    );
    try {
      await _authorize(malformed);
      fail('Expected an invalid response.');
    } on ShopCorrectionAuthorizationException catch (error) {
      expect(error.code, 'invalid_response');
      expect(error.toString(), isNot(contains('do-not-surface')));
    }
  });

  test('extra envelope or receipt keys fail closed', () async {
    final extraEnvelope = (await _envelope())..['unexpected'] = true;
    await expectLater(
      _authorize(
        _service(MockClient((_) async => _jsonResponse(extraEnvelope, 200))),
      ),
      _throwsCode('invalid_response'),
    );

    final extraReceipt = (await _receipt())..['unexpected'] = true;
    await expectLater(
      _authorize(
        _service(
          MockClient(
            (_) async =>
                _jsonResponse(await _envelope(receipt: extraReceipt), 200),
          ),
        ),
      ),
      _throwsCode('invalid_response'),
    );
  });

  test(
    'unsigned, locally hashed, invalid, and unknown-key proofs fail',
    () async {
      final missingSignature = (await _receipt())..remove('signature');
      final locallyHashed = await _receipt(signature: _repeat('A', 86));
      final unknownKey = await _receipt(keyId: 'unknown-test-key');
      final badSignature = await _receipt();
      final originalSignature = badSignature['signature']! as String;
      badSignature['signature'] =
          '${originalSignature.substring(0, originalSignature.length - 1)}'
          '${originalSignature.endsWith('A') ? 'Q' : 'A'}';
      final paddedSignature = await _receipt();
      paddedSignature['signature'] = '${paddedSignature['signature']}=';

      final cases = <String, Map<String, Object?>>{
        'missing signature': missingSignature,
        'locally hashed without server signature': locallyHashed,
        'unknown key': unknownKey,
        'invalid signature': badSignature,
        'non-canonical signature': paddedSignature,
      };
      for (final entry in cases.entries) {
        await expectLater(
          _authorize(
            _service(
              MockClient(
                (_) async =>
                    _jsonResponse(await _envelope(receipt: entry.value), 200),
              ),
            ),
          ),
          _throwsCode('invalid_response'),
          reason: entry.key,
        );
      }
    },
  );

  test(
    'wrong contract, digest, TTL, capability, actor, or workspace fails',
    () async {
      final cases = <String, Map<String, Object?>>{
        'contract': await _receipt(contract: 'wrong.contract'),
        'digest': {...(await _receipt()), 'receiptDigest': _repeat('0', 64)},
        'command': await _receipt(commandDigest: _repeat('0', 64)),
        'finalization request': await _receipt(
          finalizationRequestId: '55555555-5555-4555-8555-555555555555',
        ),
        'ttl': await _receipt(
          issuedAtMillis: _now.millisecondsSinceEpoch - 1000,
          expiresAtMillis: _now.millisecondsSinceEpoch + 300001,
        ),
        'capability': await _receipt(capability: 'shop.sale.reconcile_wallet'),
        'actor': await _receipt(actorId: 'different-owner'),
        'workspace': await _receipt(workspaceId: 'workspace-shop-b'),
      };
      for (final entry in cases.entries) {
        await expectLater(
          _authorize(
            _service(
              MockClient((_) async {
                return _jsonResponse(
                  await _envelope(receipt: entry.value),
                  200,
                );
              }),
            ),
          ),
          _throwsCode('invalid_response'),
          reason: entry.key,
        );
      }
    },
  );

  test('invalid server finalization times fail closed', () async {
    final issued = _now.millisecondsSinceEpoch - 1000;
    await expectLater(
      _authorize(
        _service(
          MockClient(
            (_) async => _jsonResponse(
              await _envelope(
                receipt: await _receipt(
                  issuedAtMillis: issued,
                  finalizedAtMillis: issued - 1,
                ),
              ),
              200,
            ),
          ),
        ),
      ),
      _throwsCode('invalid_response'),
    );

    await expectLater(
      _authorize(
        _service(
          MockClient(
            (_) async => _jsonResponse(
              await _envelope(
                receipt: await _receipt(
                  issuedAtMillis: issued,
                  finalizedAtMillis: issued + 300001,
                ),
              ),
              200,
            ),
          ),
        ),
      ),
      _throwsCode('invalid_response'),
    );
  });

  test('safe status mapping never exposes a server response', () async {
    final scenarios = <(int, String, String?)>[
      (401, 'sign_in_required', null),
      (403, 'owner_authorization_required', null),
      (409, 'authorization_conflict', null),
      (409, 'authorization_expired', 'shop_correction_authorization_expired'),
      (422, 'request_invalid', null),
      (503, 'authorization_unavailable', null),
      (
        503,
        'authorization_window_closed',
        'shop_correction_authorization_window_closed',
      ),
    ];
    for (final (status, expected, serverCode) in scenarios) {
      final body = {
        'detail': {
          'code': serverCode ?? 'private-server-detail',
          'message': 'private-do-not-surface',
        },
      };
      final service = _service(
        MockClient((_) async => _jsonResponse(body, status)),
      );
      try {
        await _authorize(service);
        fail('Expected status $status to fail.');
      } on ShopCorrectionAuthorizationException catch (error) {
        expect(error.code, expected, reason: '$status/$serverCode');
        expect(error.toString(), isNot(contains('private-do-not-surface')));
      }
    }
  });

  test('invalid caller input fails before the network', () async {
    var calls = 0;
    final service = _service(
      MockClient((_) async {
        calls++;
        return _jsonResponse(await _envelope(), 200);
      }),
    );
    await expectLater(
      service.authorize(
        authorizationRequestId: 'not-a-uuid',
        workspaceId: _workspaceId,
        capability: _capability,
        commandDigest: _commandDigest,
        requestFingerprint: _fingerprint,
      ),
      _throwsCode('request_invalid'),
    );
    await expectLater(
      _authorize(service, commandDigest: _repeat('0', 64)),
      _throwsCode('request_invalid'),
    );
    expect(calls, 0);
  });
}
