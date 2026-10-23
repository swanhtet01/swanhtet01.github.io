import 'dart:async';
import 'dart:io';

import 'package:network_info_plus/network_info_plus.dart';

import '../core/commands.dart';
import '../exceptions/printer_exception.dart';
import '../models/printer_connection_state.dart';
import '../models/printer_device.dart';
import 'printer_connector.dart';

typedef NetworkSocketFlush = Future<void> Function(Socket socket);

/// Connector for network (TCP/IP) ESC/POS printers.
///
/// **Discovery:** Scans the local subnet by attempting parallel TCP connections
/// on [scanPort]. Hosts that accept a connection within [kScanSubnetTimeoutMs]
/// are reported as discovered printers.
///
/// **Data flow:** Sends all bytes in a single [Socket.add] call followed by
/// [Socket.flush] to avoid partial writes.
class NetworkConnector extends PrinterConnector<NetworkPrinterDevice> {
  NetworkConnector({
    this.scanPort = kDefaultNetworkPort,
    this.writeTimeout = const Duration(seconds: 5),
    // IO-only deterministic seam for connector tests. Production omits it.
    NetworkSocketFlush? flushOperation,
  }) : _flushOperation = flushOperation ?? _flushSocket;

  /// Port used for both discovery scanning and default connections.
  final int scanPort;

  /// Maximum time allowed for a socket flush before delivery becomes
  /// ambiguous and the connection is destroyed. A timeout never retries.
  final Duration writeTimeout;

  final NetworkSocketFlush _flushOperation;

  Socket? _socket;
  PrinterConnectionState _state = PrinterConnectionState.disconnected;
  final StreamController<PrinterConnectionState> _stateController =
      StreamController<PrinterConnectionState>.broadcast();

  @override
  Stream<PrinterConnectionState> get stateStream => _stateController.stream;

  @override
  PrinterConnectionState get state => _state;

  @override
  Stream<List<NetworkPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    _setState(PrinterConnectionState.scanning);

    final List<NetworkPrinterDevice> found = [];
    String? localIp;

    try {
      localIp = await NetworkInfo().getWifiIP();
    } catch (_) {
      // Ignore — may not be on WiFi; try anyway
    }

    if (localIp == null || localIp.isEmpty) {
      _setState(PrinterConnectionState.disconnected);
      return;
    }

    // Derive subnet prefix (e.g. '192.168.1')
    final List<String> parts = localIp.split('.');
    if (parts.length != 4) {
      _setState(PrinterConnectionState.disconnected);
      return;
    }

    final String subnet = '${parts[0]}.${parts[1]}.${parts[2]}';

    final StreamController<NetworkPrinterDevice> hitController =
        StreamController<NetworkPrinterDevice>();

    // Fan-out 254 parallel TCP probe connections.
    final List<Future<void>> probes = List.generate(254, (i) async {
      final String host = '$subnet.${i + 1}';

      try {
        final Socket s = await Socket.connect(
          host,
          scanPort,
          timeout: Duration(milliseconds: kScanSubnetTimeoutMs),
        );

        await s.close();
        s.destroy();

        if (!hitController.isClosed) {
          hitController.add(
            NetworkPrinterDevice(name: host, host: host, port: scanPort),
          );
        }
      } catch (_) {
        // Host not reachable — ignore
      }
    });

    // Emit accumulated results as devices are discovered.
    final StreamSubscription<NetworkPrinterDevice> sub =
        hitController.stream.listen((device) {
      found.add(device);
    });

    // Race between timeout and all probes finishing.
    await Future.any([
      Future.wait(probes),
      Future.delayed(timeout),
    ]);

    await hitController.close();
    await sub.cancel();

    _setState(PrinterConnectionState.disconnected);

    if (found.isNotEmpty) yield found;
  }

  @override
  Future<void> stopScan() async {
    if (_state == PrinterConnectionState.scanning) {
      _setState(PrinterConnectionState.disconnected);
    }
  }

  @override
  Future<void> connect(
    NetworkPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  }) async {
    _assertState(
      PrinterConnectionState.disconnected,
      'connect',
    );

    _setState(PrinterConnectionState.connecting);

    try {
      _socket = await Socket.connect(
        device.host,
        device.port,
        timeout: timeout,
      );

      // Send ESC @ to initialise the printer on connect.
      _socket!.add(cInit.codeUnits);
      await _flushOperation(_socket!).timeout(timeout);

      _setState(PrinterConnectionState.connected);
    } on SocketException catch (e) {
      _destroySocket();
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'Cannot connect to ${device.host}:${device.port}',
        cause: e,
      );
    } on TimeoutException catch (e) {
      _destroySocket();
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'Connection to ${device.host}:${device.port} timed out',
        cause: e,
      );
    } catch (e) {
      _destroySocket();
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'Cannot initialise ${device.host}:${device.port}',
        cause: e,
      );
    }
  }

  @override
  Future<void> writeBytes(List<int> bytes) async {
    _assertState(PrinterConnectionState.connected, 'writeBytes');

    _setState(PrinterConnectionState.printing);

    try {
      _socket!.add(bytes);
      await _flushOperation(_socket!).timeout(writeTimeout);
      _setState(PrinterConnectionState.connected);
    } catch (e) {
      _destroySocket();
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterWriteException(
        'Receipt delivery could not be confirmed',
        cause: e,
      );
    }
  }

  @override
  Future<void> waitWriteComplete() async {
    final Socket? socket = _socket;
    if (socket == null) return;

    try {
      await _flushOperation(socket).timeout(writeTimeout);
    } catch (error) {
      _destroySocket();
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterWriteException(
        'Receipt delivery could not be confirmed',
        cause: error,
      );
    }
  }

  // ── Disconnection ──────────────────────────────────────────────────────────

  @override
  Future<void> disconnect() async {
    if (_state == PrinterConnectionState.disconnected) return;

    _setState(PrinterConnectionState.disconnecting);

    try {
      final socket = _socket;
      if (socket != null) {
        await _flushOperation(socket).timeout(writeTimeout);
        await socket.close().timeout(writeTimeout);
      }
    } catch (_) {
      // Teardown is best effort. The socket is always destroyed below.
    } finally {
      _destroySocket();
      _setState(PrinterConnectionState.disconnected);
    }
  }

  @override
  Future<void> dispose() async {
    await disconnect();
    await _stateController.close();
  }

  void _setState(PrinterConnectionState next) {
    _state = next;
    if (!_stateController.isClosed) _stateController.add(next);
  }

  void _destroySocket() {
    _socket?.destroy();
    _socket = null;
  }

  void _assertState(PrinterConnectionState required, String operation) {
    if (_state != required) {
      throw PrinterStateException(
        'Cannot $operation: expected $required but was $_state',
        currentState: _state,
        requiredState: required,
      );
    }
  }
}

Future<void> _flushSocket(Socket socket) => socket.flush();
