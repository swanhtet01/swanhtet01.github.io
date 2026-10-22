import '../../models/printer_connection_state.dart';
import '../../models/printer_device.dart';
import '../printer_connector.dart';

/// Abstract USB connector interface shared by all platform implementations.
abstract class UsbConnectorBase extends PrinterConnector<UsbPrinterDevice> {
  @override
  Stream<PrinterConnectionState> get stateStream;

  @override
  PrinterConnectionState get state;

  @override
  Stream<List<UsbPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  });

  @override
  Future<void> stopScan();

  @override
  Future<void> connect(
    UsbPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  });

  @override
  Future<void> writeBytes(List<int> bytes);

  @override
  Future<void> disconnect();

  @override
  Future<void> dispose();
}
