import 'dart:async';
import 'dart:typed_data' show Uint8List;

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

import '../core/commands.dart';
import '../exceptions/printer_exception.dart';
import '../models/printer_connection_state.dart';
import '../models/printer_device.dart';
import '../platform/bluetooth_platform_channel.dart';
import '../utils/drain_estimator.dart';
import 'printer_connector.dart';

/// Connector for Bluetooth Classic (SPP) ESC/POS printers.
///
/// **Platform support:** Android and Windows. Calling any method on iOS,
/// macOS, or Linux throws [PrinterConnectionException].
///
/// **Discovery:** Returns paired devices immediately via bonded device query,
/// then streams additional devices found during discovery.
///
/// **Writing:** Each write is handed to the platform as a single job, so
/// concurrent jobs (including ones from other isolates) cannot interleave.
/// [disconnect] waits for the OS RFCOMM buffer to drain so jobs are not
/// truncated.
///
/// **Permissions:** Automatically requests Bluetooth permissions when
/// scanning or connecting. Throws [PrinterPermissionException] if denied.
class BluetoothConnector extends PrinterConnector<BluetoothPrinterDevice> {
  BluetoothConnector({
    this.chunkSize = kDefaultBtChunkSize,
    this.interChunkDelay = const Duration(milliseconds: kDefaultBtChunkDelayMs),
    this.drainBytesPerSecond = kBtDrainBytesPerSecond,
    this.maxDrainWait = const Duration(milliseconds: kMaxDrainWaitMs),
  });

  /// Bytes per chunk within a write job. The job is still delivered to the
  /// platform in a single call (atomic against jobs from other isolates,
  /// issue #21); the native side splits it into chunks to pace the transfer.
  final int chunkSize;

  /// Pause between chunks. Cheap SPP printer modules forward data to the
  /// print MCU over an internal UART without flow control; pushing a large
  /// job at full RFCOMM speed overflows it and corrupts the output. Set to
  /// [Duration.zero] for printers that handle full-speed transfers.
  final Duration interChunkDelay;

  /// Link throughput estimate used to compute drain time.
  final int drainBytesPerSecond;

  /// Upper bound on the drain wait.
  final Duration maxDrainWait;

  late final DrainEstimator _drain = DrainEstimator(
    bytesPerSecond: drainBytesPerSecond,
    assumedBufferBytes: kDrainBufferBytes,
    maxWait: maxDrainWait,
  );

  final BluetoothPlatformChannel _platform = BluetoothPlatformChannel.instance;
  StreamSubscription<Map<String, dynamic>>? _connectionSub;

  static bool get _isSupportedPlatform =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.windows);

  PrinterConnectionState _state = PrinterConnectionState.disconnected;
  final StreamController<PrinterConnectionState> _stateController =
      StreamController<PrinterConnectionState>.broadcast();

  @override
  Stream<PrinterConnectionState> get stateStream => _stateController.stream;

  @override
  PrinterConnectionState get state => _state;

  @override
  Stream<List<BluetoothPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    _setState(PrinterConnectionState.scanning);

    if (!_isSupportedPlatform) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw const PrinterConnectionException(
        'Classic Bluetooth (SPP) is only supported on Android and Windows. '
        'Use BleConnector for other platforms.',
      );
    }

    // Request permissions (no-op on Windows)
    final bool granted = await _platform.requestBluetoothPermissions();
    if (!granted) {
      _setState(PrinterConnectionState.disconnected);
      throw const PrinterPermissionException(
        'Bluetooth permissions were denied',
      );
    }

    final List<BluetoothPrinterDevice> found = [];

    // Emit bonded (paired) devices immediately.
    try {
      final List<Map<String, dynamic>> bonded =
          await _platform.getBondedDevices();

      for (final Map<String, dynamic> d in bonded) {
        found.add(BluetoothPrinterDevice(
          name: (d['name'] as String?) ?? (d['address'] as String),
          address: d['address'] as String,
        ));
      }

      if (found.isNotEmpty) yield List<BluetoothPrinterDevice>.from(found);
    } catch (_) {
      // Ignore — permissions may be denied; discovery below will also fail.
    }

    // Stream newly discovered devices until timeout or discovery finishes.
    final Completer<void> discoveryDone = Completer<void>();
    StreamSubscription<List<Map<String, dynamic>>>? discoverySub;

    try {
      await _platform.startBtDiscovery(
        timeoutMs: timeout.inMilliseconds,
      );
    } catch (e) {
      _setState(PrinterConnectionState.disconnected);

      if (found.isNotEmpty) return;

      throw PrinterScanException('Failed to start BT discovery', cause: e);
    }

    discoverySub = _platform.btDiscoveryResults.listen(
      (devices) {
        for (final Map<String, dynamic> d in devices) {
          final String addr = d['address'] as String;
          if (!found.any((dev) => dev.address == addr)) {
            found.add(BluetoothPrinterDevice(
              name: (d['name'] as String?) ?? addr,
              address: addr,
            ));
          }
        }
      },
      onDone: () {
        if (!discoveryDone.isCompleted) discoveryDone.complete();
      },
      onError: (_) {
        if (!discoveryDone.isCompleted) discoveryDone.complete();
      },
    );

    // Race between discovery completing and timeout.
    await Future.any([
      discoveryDone.future,
      Future.delayed(timeout),
    ]);

    await discoverySub.cancel();

    _setState(PrinterConnectionState.disconnected);

    if (found.isNotEmpty) yield List<BluetoothPrinterDevice>.from(found);
  }

  @override
  Future<void> stopScan() async {
    if (!_isSupportedPlatform) return;

    try {
      await _platform.stopBtDiscovery();
    } catch (_) {
      // Ignore — discovery may have already finished or permissions may be denied.
    }

    if (_state == PrinterConnectionState.scanning) {
      _setState(PrinterConnectionState.disconnected);
    }
  }

  @override
  Future<void> connect(
    BluetoothPrinterDevice device, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    _assertState(PrinterConnectionState.disconnected, 'connect');
    _setState(PrinterConnectionState.connecting);

    if (!_isSupportedPlatform) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw const PrinterConnectionException(
        'Classic Bluetooth (SPP) is only supported on Android and Windows. '
        'Use BleConnector for other platforms.',
      );
    }

    // Request permissions (no-op on Windows)
    final bool granted = await _platform.requestBluetoothPermissions();
    if (!granted) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw const PrinterPermissionException(
        'Bluetooth permissions were denied',
      );
    }

    try {
      await _platform.btConnect(
        address: device.address,
        timeoutMs: timeout.inMilliseconds,
      );

      // Send ESC @ to initialise the printer.
      await _platform.btWrite(
        data: Uint8List.fromList(cInit.codeUnits),
      );

      // Monitor for remote disconnection.
      _connectionSub = _platform.connectionStateStream
          .where((event) => event['type'] == 'bt')
          .listen((event) {
        if (event['state'] == 'disconnected' &&
            _state != PrinterConnectionState.disconnected) {
          _connectionSub?.cancel();
          _connectionSub = null;
          _setState(PrinterConnectionState.error);
          _setState(PrinterConnectionState.disconnected);
        }
      });

      _setState(PrinterConnectionState.connected);
    } on TimeoutException catch (e) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'Bluetooth connection to ${device.address} timed out',
        cause: e,
      );
    } catch (e) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'Bluetooth connection to ${device.address} failed',
        cause: e,
      );
    }
  }

  @override
  Future<void> writeBytes(List<int> bytes) async {
    _assertState(PrinterConnectionState.connected, 'writeBytes');
    _setState(PrinterConnectionState.printing);

    final DateTime writeStart = DateTime.now();

    try {
      // The full job is handed to the platform in a single call so that
      // concurrent jobs from other isolates cannot interleave with it
      // (issue #21); the native side serializes whole write calls and
      // paces the transfer chunk by chunk.
      await _platform.btWrite(
        data: Uint8List.fromList(bytes),
        chunkSize: chunkSize,
        chunkDelayMs: interChunkDelay.inMilliseconds,
      );

      _drain.onWrite(bytes.length, writeStart, DateTime.now());
      _setState(PrinterConnectionState.connected);
    } catch (e) {
      _drain.reset();
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterWriteException('Bluetooth write failed', cause: e);
    }
  }

  @override
  Future<void> waitWriteComplete() => _drain.wait();

  // ── Disconnection ──────────────────────────────────────────────────────────

  @override
  Future<void> disconnect() async {
    if (_state == PrinterConnectionState.disconnected) return;

    // Closing the socket discards data still queued in the RFCOMM buffer.
    if (_state == PrinterConnectionState.connected) {
      await waitWriteComplete();
    }

    _setState(PrinterConnectionState.disconnecting);

    await _connectionSub?.cancel();
    _connectionSub = null;

    try {
      await _platform.btDisconnect();
    } finally {
      _drain.reset();
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
