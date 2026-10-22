import 'dart:async';
import 'dart:typed_data';

import '../core/commands.dart';
import '../exceptions/printer_exception.dart';
import '../models/printer_connection_state.dart';
import '../models/printer_device.dart';
import '../platform/bluetooth_platform_channel.dart';
import 'printer_connector.dart';

/// Connector for BLE (Bluetooth Low Energy) ESC/POS printers.
///
/// **Discovery:** Native BLE scan.
///
/// **Connection:** Finds a writable characteristic (ESC/POS UUID first, then
/// any writable). Sends `ESC @` on connect. Throws
/// [PrinterPermissionException] if Bluetooth permission is denied.
///
/// **Writing:** Paces [chunkSize] slices at ~[bytesPerSecond] to avoid
/// overflowing slow printer modules. Drains write-without-response data
/// before [disconnect].
class BleConnector extends PrinterConnector<BlePrinterDevice> {
  BleConnector({
    this.chunkSize = kDefaultBleChunkSize,
    this.bytesPerSecond = kDefaultBleBytesPerSecond,
    this.interChunkDelay =
        const Duration(milliseconds: kDefaultBleChunkDelayMs),
    this.writeWithoutResponseDrainDelay =
        const Duration(milliseconds: kBleWwrDrainDelayMs),
  });

  /// Bytes per GATT write. `0` uses the negotiated MTU.
  final int chunkSize;

  /// Target write throughput (bytes/second). `0` disables throughput pacing.
  final int bytesPerSecond;

  /// Minimum pause between chunks (combined with [bytesPerSecond] pacing).
  final Duration interChunkDelay;

  /// Drain delay after write-without-response data.
  final Duration writeWithoutResponseDrainDelay;

  final BluetoothPlatformChannel _platform = BluetoothPlatformChannel.instance;

  bool _writeWithoutResponse = false;
  bool _pendingWwrDrain = false;
  StreamSubscription<Map<String, dynamic>>? _connectionSub;

  PrinterConnectionState _state = PrinterConnectionState.disconnected;
  final StreamController<PrinterConnectionState> _stateController =
      StreamController<PrinterConnectionState>.broadcast();

  @override
  Stream<PrinterConnectionState> get stateStream => _stateController.stream;

  @override
  PrinterConnectionState get state => _state;

  @override
  Stream<List<BlePrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    _setState(PrinterConnectionState.scanning);

    // Request permissions first
    final bool granted = await _platform.requestBluetoothPermissions();
    if (!granted) {
      _setState(PrinterConnectionState.disconnected);
      throw const PrinterPermissionException(
        'Bluetooth permissions were denied',
      );
    }

    final List<BlePrinterDevice> found = [];

    // Emit bonded (paired) BLE devices immediately.
    try {
      final List<Map<String, dynamic>> bonded =
          await _platform.getBondedBleDevices();

      for (final Map<String, dynamic> d in bonded) {
        found.add(BlePrinterDevice(
          name: (d['name'] as String?) ?? (d['deviceId'] as String),
          deviceId: d['deviceId'] as String,
        ));
      }

      if (found.isNotEmpty) yield List<BlePrinterDevice>.from(found);
    } catch (_) {
      // Ignore — permissions may be denied; scan below will also fail.
    }

    final Completer<void> scanDone = Completer<void>();
    StreamSubscription<List<Map<String, dynamic>>>? scanSub;

    try {
      await _platform.startBleScan(
        timeoutMs: timeout.inMilliseconds,
      );
    } catch (e) {
      _setState(PrinterConnectionState.disconnected);

      if (found.isNotEmpty) return;

      throw PrinterScanException('Failed to start BLE scan', cause: e);
    }

    scanSub = _platform.bleScanResults.listen(
      (devices) {
        for (final Map<String, dynamic> d in devices) {
          final String id = d['deviceId'] as String;
          final String name = (d['name'] as String?) ?? id;
          final int existing = found.indexWhere((dev) => dev.deviceId == id);
          if (existing == -1) {
            found.add(BlePrinterDevice(name: name, deviceId: id));
          } else if (name != id && found[existing].name == id) {
            // The native side resolved a friendly name after first emitting
            // the device with its address as a placeholder.
            found[existing] = BlePrinterDevice(name: name, deviceId: id);
          }
        }
      },
      onError: (e) {
        if (!scanDone.isCompleted) scanDone.complete();
      },
      onDone: () {
        if (!scanDone.isCompleted) scanDone.complete();
      },
    );

    // Wait for scan timeout
    await Future.any([
      scanDone.future,
      Future.delayed(timeout),
    ]);

    await scanSub.cancel();
    _setState(PrinterConnectionState.disconnected);

    if (found.isNotEmpty) yield found;
  }

  @override
  Future<void> stopScan() async {
    try {
      await _platform.stopBleScan();
    } catch (_) {
      // Ignore errors from stopBleScan, as it may be called after a failed startBleScan
    }

    if (_state == PrinterConnectionState.scanning) {
      _setState(PrinterConnectionState.disconnected);
    }
  }

  @override
  Future<void> connect(
    BlePrinterDevice device, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    _assertState(PrinterConnectionState.disconnected, 'connect');
    _setState(PrinterConnectionState.connecting);

    // Request permissions
    final bool granted = await _platform.requestBluetoothPermissions();
    if (!granted) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw const PrinterPermissionException(
        'Bluetooth permissions were denied',
      );
    }

    try {
      await _platform.bleConnect(
        deviceId: device.deviceId,
        timeoutMs: timeout.inMilliseconds,
        serviceUuid: device.serviceUuid,
        characteristicUuid: device.txCharacteristicUuid,
      );
    } catch (e) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'BLE connection to ${device.name} failed',
        cause: e,
      );
    }

    try {
      _writeWithoutResponse = await _platform.bleSupportsWriteWithoutResponse();
    } catch (_) {
      _writeWithoutResponse = false;
    }

    _connectionSub = _platform.connectionStateStream
        .where((event) => event['type'] == 'ble')
        .listen((event) {
      if (event['state'] == 'disconnected' &&
          _state != PrinterConnectionState.disconnected) {
        _setState(PrinterConnectionState.error);
        _setState(PrinterConnectionState.disconnected);
      }
    });

    _setState(PrinterConnectionState.connected);

    try {
      await writeBytes(cInit.codeUnits);
    } catch (e) {
      await disconnect();
      throw PrinterConnectionException(
        'BLE init (ESC @) to ${device.name} failed',
        cause: e,
      );
    }
  }

  @override
  Future<void> writeBytes(List<int> bytes) async {
    _assertState(PrinterConnectionState.connected, 'writeBytes');

    _setState(PrinterConnectionState.printing);

    try {
      final Uint8List data =
          bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
      final int step = chunkSize > 0 ? chunkSize : 128;
      var offset = 0;

      while (offset < data.length) {
        final int end =
            offset + step < data.length ? offset + step : data.length;
        final Uint8List slice = Uint8List.sublistView(data, offset, end);

        await _platform.bleWrite(
          data: slice,
          withoutResponse: _writeWithoutResponse,
          chunkSize: step,
          chunkDelayMs: 0,
          bytesPerSecond: 0,
        );

        offset = end;
        if (offset >= data.length) break;

        final int throughputMs = bytesPerSecond > 0
            ? (slice.length * 1000 + bytesPerSecond - 1) ~/ bytesPerSecond
            : 0;
        final int waitMs = throughputMs > interChunkDelay.inMilliseconds
            ? throughputMs
            : interChunkDelay.inMilliseconds;
        if (waitMs > 0) {
          await Future<void>.delayed(Duration(milliseconds: waitMs));
        }
      }

      if (_writeWithoutResponse) _pendingWwrDrain = true;
      _setState(PrinterConnectionState.connected);
    } catch (e) {
      _pendingWwrDrain = false;
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterWriteException('BLE write failed', cause: e);
    }
  }

  @override
  Future<void> waitWriteComplete() async {
    if (!_pendingWwrDrain) return;
    await Future<void>.delayed(writeWithoutResponseDrainDelay);
    _pendingWwrDrain = false;
  }

  @override
  Future<void> disconnect() async {
    if (_state == PrinterConnectionState.disconnected) return;

    // Cancelling the connection drops chunks still queued in the BLE stack.
    if (_state == PrinterConnectionState.connected) {
      await waitWriteComplete();
    }

    _pendingWwrDrain = false;
    _setState(PrinterConnectionState.disconnecting);

    await _connectionSub?.cancel();
    _connectionSub = null;

    try {
      await _platform.bleDisconnect();
    } finally {
      _setState(PrinterConnectionState.disconnected);
    }
  }

  @override
  Future<void> dispose() async {
    await stopScan();
    await disconnect();
    await _stateController.close();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

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
