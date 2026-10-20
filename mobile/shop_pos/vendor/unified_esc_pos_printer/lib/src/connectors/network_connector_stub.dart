import 'dart:async';

import '../core/commands.dart';
import '../exceptions/printer_exception.dart';
import '../models/printer_connection_state.dart';
import '../models/printer_device.dart';
import 'printer_connector.dart';

/// Web stub for the network (TCP/IP) connector.
///
/// Raw TCP sockets are unavailable in the browser, so `scan()` yields no
/// devices (a combined scan should not fail, see issue #14) while `connect()`
/// and `writeBytes()` throw, since explicitly using a network printer on the
/// web is a genuine error.
class NetworkConnector extends PrinterConnector<NetworkPrinterDevice> {
  NetworkConnector({this.scanPort = kDefaultNetworkPort});

  /// Port used for both discovery scanning and default connections.
  final int scanPort;

  final StreamController<PrinterConnectionState> _stateController =
      StreamController<PrinterConnectionState>.broadcast();

  @override
  Stream<PrinterConnectionState> get stateStream => _stateController.stream;

  @override
  PrinterConnectionState get state => PrinterConnectionState.disconnected;

  @override
  Stream<List<NetworkPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) {
    return const Stream<List<NetworkPrinterDevice>>.empty();
  }

  @override
  Future<void> stopScan() async {}

  @override
  Future<void> connect(
    NetworkPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  }) {
    throw const PrinterConnectionException(
      'Network printing is not supported on this platform',
    );
  }

  @override
  Future<void> writeBytes(List<int> bytes) {
    throw const PrinterConnectionException(
      'Network printing is not supported on this platform',
    );
  }

  @override
  Future<void> disconnect() async {}

  @override
  Future<void> dispose() async {
    await _stateController.close();
  }
}
