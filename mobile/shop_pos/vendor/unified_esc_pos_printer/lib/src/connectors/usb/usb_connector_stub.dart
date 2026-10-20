import 'dart:async';

import '../../exceptions/printer_exception.dart';
import '../../models/printer_connection_state.dart';
import '../../models/printer_device.dart';
import 'usb_connector_interface.dart';

/// Stub USB connector for platforms without USB support (iOS, web, Fuchsia,
/// etc.).
///
/// [scan] is a graceful no-op that yields no devices, so a multi-type scan
/// (such as `PrinterManager.scanPrinters`) that includes USB does not fail on
/// these platforms. The active operations ([connect], [writeBytes]) still
/// throw [PrinterConnectionException], since explicitly using a USB printer
/// here is a genuine error.
class UsbConnectorImpl extends UsbConnectorBase {
  @override
  Stream<PrinterConnectionState> get stateStream =>
      const Stream<PrinterConnectionState>.empty();

  @override
  PrinterConnectionState get state => PrinterConnectionState.disconnected;

  @override
  Stream<List<UsbPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) {
    // USB is unavailable on this platform. Scanning is a discovery operation,
    // so yield nothing instead of throwing (issue #14). Otherwise a combined
    // scan that includes USB would fail on iOS even when the caller only wants
    // network/BLE/Bluetooth printers.
    return const Stream<List<UsbPrinterDevice>>.empty();
  }

  @override
  Future<void> stopScan() async {}

  @override
  Future<void> connect(
    UsbPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  }) {
    return throw const PrinterConnectionException(
      'USB printing is not supported on this platform',
    );
  }

  @override
  Future<void> writeBytes(List<int> bytes) {
    return throw const PrinterConnectionException(
      'USB printing is not supported on this platform',
    );
  }

  @override
  Future<void> disconnect() async {}

  @override
  Future<void> dispose() async {}
}
