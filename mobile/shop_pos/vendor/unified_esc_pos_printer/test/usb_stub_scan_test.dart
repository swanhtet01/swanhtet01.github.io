import 'package:flutter_test/flutter_test.dart';
import 'package:unified_esc_pos_printer/src/connectors/usb/usb_connector_stub.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

/// Regression test for issue #14: on platforms without USB support (iOS, web,
/// etc.) the stub connector's scan() must NOT throw. A combined scan that
/// includes USB should simply find no USB devices instead of failing.
void main() {
  group('UsbConnectorImpl (stub)', () {
    test('scan() does not throw and yields no devices', () async {
      final stub = UsbConnectorImpl();

      // Must not throw synchronously when scan() is invoked.
      final stream = stub.scan(timeout: const Duration(seconds: 1));

      // Collecting the stream must complete without error and be empty.
      final batches = await stream.toList();
      final devices = batches.expand((b) => b).toList();
      expect(devices, isEmpty);
    });

    test('connect() still throws on unsupported platform', () async {
      final stub = UsbConnectorImpl();
      expect(
        () => stub.connect(
          const UsbPrinterDevice(
            name: 'x',
            identifier: '1:2',
            usbPlatform: UsbPlatform.android,
          ),
        ),
        throwsA(isA<PrinterConnectionException>()),
      );
    });
  });
}
