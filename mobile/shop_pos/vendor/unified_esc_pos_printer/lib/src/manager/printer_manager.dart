import 'dart:async';

import '../connectors/ble_connector.dart';
import '../connectors/bluetooth_connector.dart';
import '../connectors/network_connector.dart';
import '../connectors/printer_connector.dart';
import '../connectors/usb/usb_connector.dart';
import '../core/commands.dart';
import '../core/enums.dart';
import '../core/ticket.dart';
import '../exceptions/printer_exception.dart';
import '../models/printer_connection_state.dart';
import '../models/printer_device.dart';

/// Unified facade for all ESC/POS printer operations.
///
/// Transparently delegates to the correct [PrinterConnector] based on the
/// runtime type of the [PrinterDevice] selected.
///
/// **Minimal usage:**
/// ```dart
/// final manager = PrinterManager();
/// final printers = await manager.scanPrinters();
/// await manager.connect(printers.first);
/// final ticket = Ticket(PaperSize.mm80, await CapabilityProfile.load());
/// ticket.text('Hello!');
/// ticket.cut();
/// await manager.printTicket(ticket);
/// await manager.openCashDrawer();
/// await manager.disconnect();
/// await manager.dispose();
/// ```
class PrinterManager {
  PrinterManager({
    NetworkConnector? networkConnector,
    BleConnector? bleConnector,
    BluetoothConnector? bluetoothConnector,
    UsbConnector? usbConnector,
  })  : _network = networkConnector ?? NetworkConnector(),
        _ble = bleConnector ?? BleConnector(),
        _bluetooth = bluetoothConnector ?? BluetoothConnector(),
        _usb = usbConnector ?? UsbConnector();

  final NetworkConnector _network;
  final BleConnector _ble;
  final BluetoothConnector _bluetooth;
  final UsbConnector _usb;

  PrinterConnector<PrinterDevice>? _active;
  PrinterDevice? _activeDevice;
  StreamSubscription<PrinterConnectionState>? _activeStateSub;
  final StreamController<PrinterConnectionState> _stateController =
      StreamController<PrinterConnectionState>.broadcast();

  Future<void> _opQueue = Future<void>.value();

  /// Runs [action] after all previously queued operations complete.
  ///
  /// Serializes connect/print/disconnect so concurrent callers cannot
  /// interrupt a print job in progress (issue #21): a `connect()` issued
  /// while another job is printing waits for that job instead of tearing
  /// down its connection.
  Future<T> _enqueue<T>(Future<T> Function() action) {
    final Future<T> run = _opQueue.then((_) => action());
    _opQueue = run.then<void>((_) {}, onError: (_) {});
    return run;
  }

  /// Scan for all printer types simultaneously, returning a merged stream.
  ///
  /// Each emission is the latest accumulated list for each connector type;
  /// the stream closes when all enabled scans have finished or [timeout]
  /// elapses.
  ///
  /// Filter by [types] to limit which connection types are scanned.
  Stream<List<PrinterDevice>> scanAll({
    Duration timeout = const Duration(seconds: 5),
    Set<PrinterConnectionType> types = const {
      PrinterConnectionType.network,
      PrinterConnectionType.ble,
      PrinterConnectionType.bluetooth,
      PrinterConnectionType.usb,
    },
  }) {
    final StreamController<List<PrinterDevice>> controller =
        StreamController<List<PrinterDevice>>.broadcast();

    final Map<PrinterConnectionType, List<PrinterDevice>> buckets = {};

    void emit() {
      final List<PrinterDevice> all = [
        for (final list in buckets.values) ...list,
      ];
      if (!controller.isClosed) controller.add(all);
    }

    int pending = 0;

    void addScan<T extends PrinterDevice>(
      PrinterConnectionType type,
      Stream<List<T>> stream,
    ) {
      pending++;
      stream.listen(
        (devices) {
          buckets[type] = devices;
          emit();
        },
        onError: (_) {},
        onDone: () {
          pending--;
          if (pending == 0 && !controller.isClosed) controller.close();
        },
        cancelOnError: false,
      );
    }

    if (types.contains(PrinterConnectionType.network)) {
      addScan(
        PrinterConnectionType.network,
        _network.scan(timeout: timeout),
      );
    }

    if (types.contains(PrinterConnectionType.ble)) {
      addScan(
        PrinterConnectionType.ble,
        _ble.scan(timeout: timeout),
      );
    }

    if (types.contains(PrinterConnectionType.bluetooth)) {
      addScan(
        PrinterConnectionType.bluetooth,
        _bluetooth.scan(timeout: timeout),
      );
    }

    if (types.contains(PrinterConnectionType.usb)) {
      addScan(
        PrinterConnectionType.usb,
        _usb.scan(timeout: timeout),
      );
    }

    if (pending == 0) controller.close();

    return controller.stream;
  }

  /// Scan all printer types and collect results, returning after [timeout].
  Future<List<PrinterDevice>> scanPrinters({
    Duration timeout = const Duration(seconds: 5),
    Set<PrinterConnectionType> types = const {
      PrinterConnectionType.network,
      PrinterConnectionType.ble,
      PrinterConnectionType.bluetooth,
      PrinterConnectionType.usb,
    },
  }) async {
    List<PrinterDevice> latest = [];

    await for (final batch in scanAll(timeout: timeout, types: types)) {
      latest = batch;
    }

    return latest;
  }

  /// Connect to [device].
  ///
  /// Connecting to the device that is already connected is a no-op.
  /// If connected to a different device, disconnects from it first.
  ///
  /// Operations are serialized: a `connect()` issued while another job is
  /// printing on this manager waits for that job to finish instead of
  /// interrupting it (issue #21).
  Future<void> connect(
    PrinterDevice device, {
    Duration timeout = const Duration(seconds: 10),
  }) {
    return _enqueue(() async {
      if (_active != null &&
          isConnected &&
          _activeDevice != null &&
          _isSameDevice(_activeDevice!, device)) {
        return;
      }

      if (_active != null) await _disconnectInternal();

      final PrinterConnector<PrinterDevice> connector = _connectorFor(device);

      _active = connector;
      _activeDevice = device;

      // Forward state changes from the active connector.
      _activeStateSub = connector.stateStream.listen((s) {
        if (!_stateController.isClosed) _stateController.add(s);
      });

      await connector.connect(device, timeout: timeout);
    });
  }

  /// Disconnect from the currently connected printer, draining buffered
  /// write data first so a job printed just before is not truncated.
  ///
  /// Waits for queued operations (e.g. a print in progress) to finish first.
  Future<void> disconnect() {
    return _enqueue(_disconnectInternal);
  }

  Future<void> _disconnectInternal() async {
    await _activeStateSub?.cancel();
    _activeStateSub = null;

    await _active?.disconnect();
    _active = null;
    _activeDevice = null;

    if (!_stateController.isClosed) {
      _stateController.add(PrinterConnectionState.disconnected);
    }
  }

  /// Send the bytes from [ticket] to the connected printer.
  Future<void> printTicket(Ticket ticket) {
    return _enqueue(() async {
      _assertConnected('printTicket');
      await _active!.writeBytes(ticket.bytes);
    });
  }

  /// Send raw [bytes] to the connected printer.
  Future<void> printBytes(List<int> bytes) {
    return _enqueue(() async {
      _assertConnected('printBytes');
      await _active!.writeBytes(bytes);
    });
  }

  /// Wait until data from previous print calls has finished transmitting.
  ///
  /// [disconnect] performs this wait internally; call it directly when you
  /// need the barrier without disconnecting.
  Future<void> waitWriteComplete() {
    return _enqueue(() async {
      await _active?.waitWriteComplete();
    });
  }

  /// Open the cash drawer connected to [pin] (default: pin 2).
  Future<void> openCashDrawer({CashDrawer pin = CashDrawer.pin2}) {
    return _enqueue(() async {
      _assertConnected('openCashDrawer');

      final List<int> bytes = pin == CashDrawer.pin2
          ? cCashDrawerPin2.codeUnits
          : cCashDrawerPin5.codeUnits;

      await _active!.writeBytes(bytes);
    });
  }

  /// Current connection state of the active connector.
  PrinterConnectionState get state =>
      _active?.state ?? PrinterConnectionState.disconnected;

  /// Stream of state changes. Stays alive across connect/disconnect cycles,
  /// forwarding events from whichever connector is currently active.
  Stream<PrinterConnectionState> get stateStream => _stateController.stream;

  /// Whether a printer is currently connected.
  bool get isConnected => state == PrinterConnectionState.connected;

  /// The device currently connected to, or null if not connected.
  PrinterDevice? get connectedDevice => _activeDevice;

  /// Disconnect and release all connector resources.
  ///
  /// Waits for queued operations (e.g. a print in progress) to finish first.
  Future<void> dispose() {
    return _enqueue(() async {
      await _disconnectInternal();
      await _stateController.close();
      await _network.dispose();
      await _ble.dispose();
      await _bluetooth.dispose();
      await _usb.dispose();
    });
  }

  // Helpers
  bool _isSameDevice(PrinterDevice a, PrinterDevice b) {
    return switch ((a, b)) {
      (NetworkPrinterDevice x, NetworkPrinterDevice y) =>
        x.host == y.host && x.port == y.port,
      (BlePrinterDevice x, BlePrinterDevice y) => x.deviceId == y.deviceId,
      (BluetoothPrinterDevice x, BluetoothPrinterDevice y) =>
        x.address == y.address,
      (UsbPrinterDevice x, UsbPrinterDevice y) => x.identifier == y.identifier,
      _ => false,
    };
  }

  PrinterConnector<PrinterDevice> _connectorFor(PrinterDevice device) {
    return switch (device) {
      NetworkPrinterDevice() => _network as PrinterConnector<PrinterDevice>,
      BlePrinterDevice() => _ble as PrinterConnector<PrinterDevice>,
      BluetoothPrinterDevice() => _bluetooth as PrinterConnector<PrinterDevice>,
      UsbPrinterDevice() => _usb as PrinterConnector<PrinterDevice>,
      _ => throw PrinterConnectionException(
          'No connector available for device type ${device.runtimeType}',
        ),
    };
  }

  void _assertConnected(String operation) {
    if (!isConnected) {
      throw PrinterStateException(
        'Cannot $operation: not connected to a printer',
        currentState: state,
        requiredState: PrinterConnectionState.connected,
      );
    }
  }
}
