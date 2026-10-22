import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

import '../../models/printer_connection_state.dart';
import '../../models/printer_device.dart';
import '../printer_connector.dart';
import 'usb_connector_stub.dart'
    if (dart.library.io) 'usb_connector_android.dart' as android_impl;
import 'usb_connector_stub.dart'
    if (dart.library.io) 'usb_connector_desktop.dart' as desktop_impl;
import 'usb_connector_interface.dart';
import 'usb_connector_stub.dart' as stub_impl;
import 'usb_connector_stub.dart'
    if (dart.library.io) 'usb_connector_windows.dart' as windows_impl;

/// Platform-routing USB connector.
///
/// Delegates to:
/// - [usb_connector_android.dart] on Android
/// - [usb_connector_windows.dart] on Windows (Print Spooler API)
/// - [usb_connector_desktop.dart] on Linux, macOS (serial port)
/// - [usb_connector_stub.dart] on unsupported platforms
class UsbConnector extends PrinterConnector<UsbPrinterDevice> {
  UsbConnector() : _impl = _createImpl();

  final UsbConnectorBase _impl;

  static UsbConnectorBase _createImpl() {
    if (kIsWeb) return stub_impl.UsbConnectorImpl();
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => android_impl.UsbConnectorImpl(),
      TargetPlatform.windows => windows_impl.UsbConnectorImpl(),
      TargetPlatform.linux ||
      TargetPlatform.macOS =>
        desktop_impl.UsbConnectorImpl(),
      _ => stub_impl.UsbConnectorImpl(),
    };
  }

  @override
  Stream<PrinterConnectionState> get stateStream => _impl.stateStream;

  @override
  PrinterConnectionState get state => _impl.state;

  @override
  Stream<List<UsbPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) {
    return _impl.scan(timeout: timeout);
  }

  @override
  Future<void> stopScan() => _impl.stopScan();

  @override
  Future<void> connect(
    UsbPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  }) {
    return _impl.connect(device, timeout: timeout);
  }

  @override
  Future<void> writeBytes(List<int> bytes) => _impl.writeBytes(bytes);

  @override
  Future<void> waitWriteComplete() => _impl.waitWriteComplete();

  @override
  Future<void> disconnect() => _impl.disconnect();

  @override
  Future<void> dispose() => _impl.dispose();
}
