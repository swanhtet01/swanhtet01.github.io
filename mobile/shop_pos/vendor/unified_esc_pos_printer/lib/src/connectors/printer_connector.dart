import '../models/printer_connection_state.dart';
import '../models/printer_device.dart';

/// Abstract base for all connection-type-specific connectors.
///
/// [T] is the [PrinterDevice] subtype this connector handles.
///
/// Typical usage is through [PrinterManager], which selects the correct
/// connector automatically. Connectors can also be used directly for
/// advanced scenarios.
abstract class PrinterConnector<T extends PrinterDevice> {
  /// Stream of state changes. Broadcast so multiple listeners are supported.
  Stream<PrinterConnectionState> get stateStream;

  /// Current connection state.
  PrinterConnectionState get state;

  /// Scan for available devices of this connector's type.
  ///
  /// Returns a [Stream] that emits the growing list of discovered devices until
  /// [timeout] elapses or [stopScan] is called.
  Stream<List<T>> scan({Duration timeout = const Duration(seconds: 5)});

  /// Stop an in-progress scan.
  Future<void> stopScan();

  /// Connect to [device].
  ///
  /// Throws [PrinterConnectionException] if the connection fails or times out.
  /// Throws [PrinterStateException] if not in [PrinterConnectionState.disconnected].
  Future<void> connect(
    T device, {
    Duration timeout = const Duration(seconds: 5),
  });

  /// Write raw ESC/POS [bytes] to the connected printer.
  ///
  /// Throws [PrinterStateException] if not connected.
  /// Throws [PrinterWriteException] if the write fails.
  Future<void> writeBytes(List<int> bytes);

  /// Wait until bytes from previous [writeBytes] calls have finished
  /// transmitting. [disconnect] calls this internally; the default
  /// implementation completes immediately.
  Future<void> waitWriteComplete() async {}

  /// Disconnect from the current printer, draining buffered write data first.
  Future<void> disconnect();

  /// Release all resources held by this connector (streams, subscriptions).
  Future<void> dispose();
}
