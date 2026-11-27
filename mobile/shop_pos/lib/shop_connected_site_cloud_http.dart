import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import 'shop_connected_site_reconciliation.dart';

const _allowedAuthenticationHeaders = <String>{
  HttpHeaders.authorizationHeader,
  'x-supermega-device-id',
  'x-supermega-key-id',
  'x-supermega-request-signature',
  'x-supermega-request-timestamp',
};

/// Supplies a short-lived cloud authentication envelope without placing
/// credentials in request JSON or retaining them in the wire client.
abstract interface class ConnectedSiteCloudRequestAuthenticator {
  Future<Map<String, String>> authenticationHeaders({
    required Uri uri,
    required String method,
    required String bodySha256,
  });
}

class UnavailableConnectedSiteCloudRequestAuthenticator
    implements ConnectedSiteCloudRequestAuthenticator {
  const UnavailableConnectedSiteCloudRequestAuthenticator();

  @override
  Future<Map<String, String>> authenticationHeaders({
    required Uri uri,
    required String method,
    required String bodySha256,
  }) => throw const ConnectedSiteReconciliationException(
    'connected_site_cloud_authenticator_unavailable',
  );
}

/// HTTPS-only cloud executor. It never follows redirects, never uses ambient
/// proxy configuration, and stops reading as soon as the caller's byte cap is
/// exceeded. [trustedContext] is injectable for a reviewed platform trust
/// composition and deterministic local TLS tests; null uses OS trusted roots.
class DartIoConnectedSiteAuthenticatedRequestExecutor
    implements ConnectedSiteAuthenticatedRequestExecutor {
  DartIoConnectedSiteAuthenticatedRequestExecutor({
    required Uri allowedOrigin,
    this.authenticator =
        const UnavailableConnectedSiteCloudRequestAuthenticator(),
    this.runtimeEnabled = false,
    this.timeout = const Duration(seconds: 12),
    this.trustedContext,
  }) : allowedOrigin = _validateOrigin(allowedOrigin) {
    if (timeout <= Duration.zero || timeout > const Duration(seconds: 30)) {
      throw const FormatException('connected_site_cloud_timeout_invalid');
    }
  }

  final Uri allowedOrigin;
  final ConnectedSiteCloudRequestAuthenticator authenticator;
  final bool runtimeEnabled;
  final Duration timeout;
  final SecurityContext? trustedContext;

  @override
  Future<ConnectedSiteAuthenticatedHttpResponse> execute({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required List<int> body,
    required int maxResponseBytes,
  }) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_authenticated_executor_disabled',
      );
    }
    final retainedHeaders = Map<String, String>.unmodifiable(headers);
    final retainedBody = List<int>.unmodifiable(body);
    _requireRequest(
      uri,
      method,
      retainedHeaders,
      retainedBody,
      maxResponseBytes,
    );
    _requireNoHttpOverrides();
    final deadline = Stopwatch()..start();
    HttpClient? client;
    final deadlineTimer = Timer(timeout, () => client?.close(force: true));
    late final Map<String, String> authentication;
    try {
      authentication = Map<String, String>.unmodifiable(
        await authenticator
            .authenticationHeaders(
              uri: uri,
              method: method,
              bodySha256: crypto.sha256.convert(retainedBody).toString(),
            )
            .timeout(_remaining(deadline)),
      );
      _requireAuthenticationHeaders(authentication, retainedHeaders);
      // Authentication is asynchronous. Recheck immediately before the
      // synchronous factory call so an authenticator cannot install an
      // ambient override across the await boundary.
      _requireNoHttpOverrides();
      client = HttpClient(context: trustedContext);
      client.findProxy = (_) => 'DIRECT';
      client.connectionTimeout = _remaining(deadline);
      client.idleTimeout = _remaining(deadline);
      client.maxConnectionsPerHost = 1;
      client.autoUncompress = false;
      final request =
          await client.openUrl(method, uri).timeout(_remaining(deadline))
            ..followRedirects = false
            ..persistentConnection = false;
      retainedHeaders.forEach(request.headers.set);
      authentication.forEach(request.headers.set);
      if (retainedBody.isNotEmpty) request.add(retainedBody);
      final response = await request.close().timeout(_remaining(deadline));
      if (response.isRedirect) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_redirect_rejected',
        );
      }
      if (response.contentLength > maxResponseBytes) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_response_too_large',
        );
      }
      final bytes = await response
          .fold<List<int>>(<int>[], (bytes, chunk) {
            if (bytes.length + chunk.length > maxResponseBytes) {
              throw const ConnectedSiteReconciliationException(
                'connected_site_cloud_response_too_large',
              );
            }
            bytes.addAll(chunk);
            return bytes;
          })
          .timeout(_remaining(deadline));
      return ConnectedSiteAuthenticatedHttpResponse(
        statusCode: response.statusCode,
        contentType: response.headers.value(HttpHeaders.contentTypeHeader),
        body: List<int>.unmodifiable(bytes),
        effectiveUri: uri,
      );
    } on ConnectedSiteReconciliationException {
      rethrow;
    } on TimeoutException {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_transport_timeout',
      );
    } on Object {
      if (deadline.elapsed >= timeout) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_transport_timeout',
        );
      }
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_transport_failed',
      );
    } finally {
      deadlineTimer.cancel();
      client?.close(force: true);
    }
  }

  Duration _remaining(Stopwatch deadline) {
    final remaining = timeout - deadline.elapsed;
    if (remaining <= Duration.zero) throw TimeoutException('deadline');
    return remaining;
  }

  void _requireNoHttpOverrides() {
    if (HttpOverrides.current != null) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_http_override_rejected',
      );
    }
  }

  void _requireRequest(
    Uri uri,
    String method,
    Map<String, String> headers,
    List<int> body,
    int maxResponseBytes,
  ) {
    if (_origin(uri) != allowedOrigin ||
        uri.userInfo.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        !const {'GET', 'POST'}.contains(method) ||
        (method == 'GET' && body.isNotEmpty) ||
        body.length > connectedSiteCloudMaximumBodyBytes ||
        headers.length > 16 ||
        maxResponseBytes < 1 ||
        maxResponseBytes > connectedSiteCloudMaximumBodyBytes) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_request_rejected',
      );
    }
    for (final entry in headers.entries) {
      final name = entry.key.toLowerCase();
      if (name != entry.key ||
          !_validHeader(name, entry.value) ||
          _allowedAuthenticationHeaders.contains(name) ||
          const {
            HttpHeaders.hostHeader,
            HttpHeaders.cookieHeader,
            HttpHeaders.contentLengthHeader,
            HttpHeaders.transferEncodingHeader,
            HttpHeaders.connectionHeader,
            HttpHeaders.proxyAuthorizationHeader,
          }.contains(name)) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_request_headers_rejected',
        );
      }
    }
  }

  void _requireAuthenticationHeaders(
    Map<String, String> authentication,
    Map<String, String> requestHeaders,
  ) {
    final names = authentication.keys.toSet();
    final bearer = names.contains(HttpHeaders.authorizationHeader);
    const signedNames = {
      'x-supermega-device-id',
      'x-supermega-key-id',
      'x-supermega-request-signature',
      'x-supermega-request-timestamp',
    };
    final bearerEnvelope = bearer && names.length == 1;
    final signedEnvelope =
        names.length == signedNames.length && names.containsAll(signedNames);
    if (!bearerEnvelope && !signedEnvelope) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_authentication_rejected',
      );
    }
    for (final entry in authentication.entries) {
      final name = entry.key.toLowerCase();
      if (name != entry.key ||
          !_allowedAuthenticationHeaders.contains(name) ||
          requestHeaders.containsKey(name) ||
          !_validHeader(name, entry.value)) {
        throw const ConnectedSiteReconciliationException(
          'connected_site_cloud_authentication_rejected',
        );
      }
    }
  }
}

Uri _validateOrigin(Uri value) {
  final origin = _origin(value);
  if (value != origin) {
    throw const FormatException('connected_site_cloud_origin_invalid');
  }
  return origin;
}

Uri _origin(Uri value) {
  if (value.scheme != 'https' ||
      value.userInfo.isNotEmpty ||
      value.host.isEmpty ||
      value.fragment.isNotEmpty ||
      value.query.isNotEmpty) {
    throw const FormatException('connected_site_cloud_origin_invalid');
  }
  return Uri(
    scheme: 'https',
    host: value.host,
    port: value.hasPort ? value.port : null,
  );
}

bool _validHeader(String name, String value) =>
    name.isNotEmpty &&
    name.length <= 64 &&
    RegExp(r'^[a-z0-9-]+$').hasMatch(name) &&
    value.isNotEmpty &&
    value.length <= 4096 &&
    !value.codeUnits.any((unit) => unit < 32 || unit > 126);
