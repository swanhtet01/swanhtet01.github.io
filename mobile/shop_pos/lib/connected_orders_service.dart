// Read-only, server-scoped confirmed orders. Local sales never enter this model.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

const connectedOrdersPath = '/api/trial/v1/shop/orders';
const connectedOrdersSchema = 'supermega.shop.orders.snapshot.v1';
const _maxResponseBytes = 2 * 1024 * 1024;

Uri? connectedOrdersEndpoint(String baseUrl) {
  final base = Uri.tryParse(baseUrl);
  if (base == null ||
      base.scheme != 'https' ||
      base.host.isEmpty ||
      base.port != 443 ||
      base.userInfo.isNotEmpty ||
      (base.path.isNotEmpty && base.path != '/') ||
      base.hasQuery ||
      base.hasFragment) {
    return null;
  }
  return base.replace(path: connectedOrdersPath);
}

class ConnectedOrdersException implements Exception {
  const ConnectedOrdersException(this.code);
  final String code;

  @override
  String toString() => code;
}

class ConnectedOrderLine {
  const ConnectedOrderLine({
    required this.sku,
    required this.name,
    required this.nameMy,
    required this.variant,
    required this.quantity,
    required this.unitPriceMmk,
  });

  final String sku;
  final String name;
  final String? nameMy;
  final String? variant;
  final int quantity;
  final int unitPriceMmk;
}

class ConnectedOrder {
  const ConnectedOrder({
    required this.id,
    required this.createdAt,
    required this.status,
    required this.paymentStatus,
    required this.refundStatus,
    required this.paymentDueAt,
    required this.promisedAt,
    required this.quantity,
    required this.totalMmk,
    required this.lineSnapshotsAvailable,
    required this.lines,
  });

  final String id;
  final DateTime createdAt;
  final String status;
  final String paymentStatus;
  final String refundStatus;
  final DateTime? paymentDueAt;
  final DateTime? promisedAt;
  final int quantity;
  final int totalMmk;
  final bool lineSnapshotsAvailable;
  final List<ConnectedOrderLine> lines;
}

class ConnectedOrdersSnapshot {
  const ConnectedOrdersSnapshot({
    required this.workspaceId,
    required this.workspaceVersion,
    required this.workspaceUpdatedAt,
    required this.receivedAt,
    required this.orders,
  });

  final String workspaceId;
  final int workspaceVersion;
  final DateTime? workspaceUpdatedAt;
  final DateTime receivedAt;
  final List<ConnectedOrder> orders;

  static ConnectedOrdersSnapshot parse(Object? source, DateTime receivedAt) {
    if (source is! Map<String, dynamic> ||
        source['schema'] != connectedOrdersSchema ||
        source['scope'] != 'confirmed-orders-only') {
      throw const FormatException('Unexpected order snapshot.');
    }
    final rows = source['orders'];
    if (rows is! List || rows.length > 5000) {
      throw const FormatException('Invalid order count.');
    }
    final orders = <ConnectedOrder>[];
    final ids = <String>{};
    for (final row in rows) {
      if (row is! Map<String, dynamic>) {
        throw const FormatException('Invalid order.');
      }
      final id = _requiredString(row['id']);
      if (!ids.add(id)) throw const FormatException('Duplicate order.');
      final linesRaw = row['lines'];
      final available = row['lineSnapshotsAvailable'];
      if (linesRaw is! List || available is! bool ||
          (available && linesRaw.isEmpty) ||
          (!available && linesRaw.isNotEmpty)) {
        throw const FormatException('Invalid line snapshots.');
      }
      final lines = <ConnectedOrderLine>[];
      for (final line in linesRaw) {
        if (line is! Map<String, dynamic>) {
          throw const FormatException('Invalid order line.');
        }
        lines.add(ConnectedOrderLine(
          sku: _requiredString(line['sku']),
          name: _requiredString(line['name']),
          nameMy: _optionalString(line['nameMy']),
          variant: _optionalString(line['variant']),
          quantity: _positiveInt(line['quantity']),
          unitPriceMmk: _nonNegativeInt(line['unitPriceMmk']),
        ));
      }
      final status = _requiredString(row['status']);
      final paymentStatus = _requiredString(row['paymentStatus']);
      final refundStatus = _requiredString(row['refundStatus']);
      if (!const {'confirmed', 'preparing', 'ready', 'completed', 'cancelled'}
              .contains(status) ||
          !const {'pending', 'reconciled'}.contains(paymentStatus) ||
          !const {'none', 'due', 'settled'}.contains(refundStatus)) {
        throw const FormatException('Unknown order state.');
      }
      orders.add(ConnectedOrder(
        id: id,
        createdAt: _requiredInstant(row['createdAt']),
        status: status,
        paymentStatus: paymentStatus,
        refundStatus: refundStatus,
        paymentDueAt: _optionalInstant(row['paymentDueAt']),
        promisedAt: _optionalInstant(row['promisedAt']),
        quantity: _positiveInt(row['quantity']),
        totalMmk: _nonNegativeInt(row['totalMmk']),
        lineSnapshotsAvailable: available,
        lines: List.unmodifiable(lines),
      ));
    }
    return ConnectedOrdersSnapshot(
      workspaceId: _requiredString(source['workspaceId']),
      workspaceVersion: _nonNegativeInt(source['workspaceVersion']),
      workspaceUpdatedAt: _optionalInstant(source['workspaceUpdatedAt'], allowEmpty: true),
      receivedAt: receivedAt,
      orders: List.unmodifiable(orders),
    );
  }
}

class ConnectedOrdersService {
  ConnectedOrdersService({
    required this.endpoint,
    required this.accessToken,
    http.Client? client,
    DateTime Function()? clock,
  }) : _client = client ?? http.Client(),
       _ownsClient = client == null,
       _clock = clock ?? DateTime.now;

  final Uri endpoint;
  final Future<String?> Function() accessToken;
  final http.Client _client;
  final bool _ownsClient;
  final DateTime Function() _clock;

  Future<ConnectedOrdersSnapshot> fetch() async {
    if (endpoint.scheme != 'https' ||
        endpoint.port != 443 ||
        endpoint.path != connectedOrdersPath ||
        endpoint.userInfo.isNotEmpty ||
        endpoint.hasQuery ||
        endpoint.hasFragment) {
      throw const ConnectedOrdersException('endpoint_unavailable');
    }
    try {
      final token = await accessToken();
      if (token == null || token.trim().isEmpty) {
        throw const ConnectedOrdersException('sign_in_required');
      }
      final request = http.Request('GET', endpoint)
        ..followRedirects = false
        ..headers.addAll({
          'authorization': 'Bearer $token',
          'accept': 'application/json',
          'cache-control': 'no-store',
        });
      final response = await _client.send(request).timeout(const Duration(seconds: 15));
      if (response.statusCode != 200) {
        throw ConnectedOrdersException(switch (response.statusCode) {
          401 => 'sign_in_required',
          403 => 'access_denied',
          404 => 'endpoint_unavailable',
          _ => 'refresh_unavailable',
        });
      }
      final bytes = BytesBuilder(copy: false);
      var length = 0;
      await for (final chunk in response.stream.timeout(const Duration(seconds: 15))) {
        length += chunk.length;
        if (length > _maxResponseBytes) {
          throw const ConnectedOrdersException('snapshot_too_large');
        }
        bytes.add(chunk);
      }
      return ConnectedOrdersSnapshot.parse(
        jsonDecode(utf8.decode(bytes.takeBytes())),
        _clock(),
      );
    } on ConnectedOrdersException {
      rethrow;
    } on FormatException {
      throw const ConnectedOrdersException('invalid_snapshot');
    } catch (_) {
      throw const ConnectedOrdersException('refresh_unavailable');
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }
}

String _requiredString(Object? value) {
  if (value is! String || value.trim().isEmpty) {
    throw const FormatException('Missing string.');
  }
  return value.trim();
}

String? _optionalString(Object? value) {
  if (value == null) return null;
  return _requiredString(value);
}

int _nonNegativeInt(Object? value) {
  if (value is! int || value < 0) {
    throw const FormatException('Invalid amount.');
  }
  return value;
}

int _positiveInt(Object? value) {
  final result = _nonNegativeInt(value);
  if (result == 0) throw const FormatException('Invalid quantity.');
  return result;
}

DateTime _requiredInstant(Object? value) {
  if (value is! String) throw const FormatException('Invalid time.');
  final instant = DateTime.tryParse(value);
  if (instant == null) throw const FormatException('Invalid time.');
  return instant;
}

DateTime? _optionalInstant(Object? value, {bool allowEmpty = false}) {
  if (value == null || (allowEmpty && value == '')) return null;
  return _requiredInstant(value);
}
