import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supermega_shop/connected_orders_service.dart';

Map<String, Object?> _snapshot({String workspace = 'shop-a'}) => {
  'schema': connectedOrdersSchema,
  'scope': 'confirmed-orders-only',
  'workspaceId': workspace,
  'workspaceVersion': 7,
  'workspaceUpdatedAt': '2026-10-22T02:01:00Z',
  'orders': [
    {
      'id': 'ORD-1042',
      'createdAt': '2026-10-22T02:00:00Z',
      'status': 'preparing',
      'paymentStatus': 'pending',
      'refundStatus': 'none',
      'paymentDueAt': null,
      'promisedAt': '2026-10-23T02:00:00Z',
      'quantity': 2,
      'totalMmk': 24000,
      'lineSnapshotsAvailable': true,
      'lines': [
        {
          'sku': 'RICE-01',
          'name': 'Rice',
          'nameMy': 'ဆန်',
          'quantity': 2,
          'unitPriceMmk': 12000,
        },
      ],
      'customer': 'Private customer',
      'paymentEvidenceReference': 'Private receipt',
    },
  ],
};

void main() {
  test('missing runtime scope cannot open the production orders client', () {
    expect(
      () => ConnectedOrdersService(
        endpoint: connectedOrdersEndpoint('https://app.supermega.dev')!,
        accessToken: () async => 'session',
      ),
      throwsStateError,
    );
  });

  test('endpoint is fixed under a secure configured origin', () {
    final endpoint = connectedOrdersEndpoint('https://app.supermega.dev');
    expect(
      endpoint.toString(),
      'https://app.supermega.dev$connectedOrdersPath',
    );
    expect(endpoint?.query, isEmpty);
    expect(connectedOrdersEndpoint('http://app.supermega.dev'), isNull);
    expect(connectedOrdersEndpoint('https://app.supermega.dev/other'), isNull);
    expect(connectedOrdersEndpoint('https://name@app.supermega.dev'), isNull);
  });

  test(
    'signed-in GET sends no workspace selector and reads allowlisted fields',
    () async {
      final fixture = jsonEncode(_snapshot());
      final parsed = ConnectedOrdersSnapshot.parse(
        jsonDecode(fixture),
        DateTime.utc(2026, 10, 22),
      );
      expect(parsed.orders.single.id, 'ORD-1042');
      var calls = 0;
      http.Request? sent;
      final service = ConnectedOrdersService(
        endpoint: connectedOrdersEndpoint('https://app.supermega.dev')!,
        accessToken: () async => 'short-lived-session',
        clock: () => DateTime.utc(2026, 10, 22, 2, 2),
        client: MockClient((request) async {
          calls++;
          sent = request;
          return http.Response.bytes(
            utf8.encode(fixture),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      final result = await service.fetch();
      expect(calls, 1);
      expect(sent, isNotNull);
      expect(sent!.method, 'GET');
      expect(sent!.url.path, connectedOrdersPath);
      expect(sent!.url.queryParameters, isEmpty);
      expect(sent!.followRedirects, isFalse);
      expect(sent!.headers['authorization'], 'Bearer short-lived-session');
      expect(sent!.headers['cache-control'], 'no-store');
      expect(result.workspaceId, 'shop-a');
      expect(result.workspaceVersion, 7);
      expect(result.receivedAt, DateTime.utc(2026, 10, 22, 2, 2));
      expect(result.orders.single.id, 'ORD-1042');
      expect(result.orders.single.lines.single.nameMy, 'ဆန်');
      expect(result.orders.single.paymentDueAt, isNull);
      expect(result.orders.single.totalMmk, 24000);
      service.close();
    },
  );

  test('no session and denied entitlement cannot yield orders', () async {
    var calls = 0;
    final endpoint = connectedOrdersEndpoint('https://app.supermega.dev')!;
    final client = MockClient((_) async {
      calls++;
      return http.Response('{}', 403);
    });
    final unsigned = ConnectedOrdersService(
      endpoint: endpoint,
      accessToken: () async => null,
      client: client,
    );
    await expectLater(
      unsigned.fetch(),
      throwsA(
        isA<ConnectedOrdersException>().having(
          (e) => e.code,
          'code',
          'sign_in_required',
        ),
      ),
    );
    expect(calls, 0);
    final denied = ConnectedOrdersService(
      endpoint: endpoint,
      accessToken: () async => 'session',
      client: client,
    );
    await expectLater(
      denied.fetch(),
      throwsA(
        isA<ConnectedOrdersException>().having(
          (e) => e.code,
          'code',
          'access_denied',
        ),
      ),
    );
    expect(calls, 1);
  });

  test('malformed and duplicate snapshots fail closed', () async {
    final receivedAt = DateTime.utc(2026, 10, 22);
    final wrongScope = _snapshot()..['scope'] = 'all-requests';
    expect(
      () => ConnectedOrdersSnapshot.parse(wrongScope, receivedAt),
      throwsFormatException,
    );
    final duplicate = _snapshot();
    (duplicate['orders'] as List).add((duplicate['orders'] as List).first);
    expect(
      () => ConnectedOrdersSnapshot.parse(duplicate, receivedAt),
      throwsFormatException,
    );
    final malformed = _snapshot();
    ((malformed['orders'] as List).first as Map)['status'] = 'unknown';
    expect(
      () => ConnectedOrdersSnapshot.parse(malformed, receivedAt),
      throwsFormatException,
    );
  });

  test('first-run empty server snapshot is distinct from local sales', () {
    final empty = _snapshot()
      ..['workspaceVersion'] = 0
      ..['workspaceUpdatedAt'] = ''
      ..['orders'] = [];
    final result = ConnectedOrdersSnapshot.parse(
      empty,
      DateTime.utc(2026, 10, 22),
    );
    expect(result.orders, isEmpty);
    expect(result.workspaceUpdatedAt, isNull);
  });
}
