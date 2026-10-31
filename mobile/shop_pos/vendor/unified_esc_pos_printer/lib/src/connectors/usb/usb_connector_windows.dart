import 'dart:async';

import 'package:flutter/services.dart';

import '../../core/commands.dart';
import '../../exceptions/printer_exception.dart';
import '../../models/printer_connection_state.dart';
import '../../models/printer_device.dart';
import 'usb_connector_interface.dart';

/// USB connector for Windows using the native Print Spooler API.
///
/// Unlike the serial-port approach used on Linux/macOS, this talks to the
/// Windows Print Spooler via [OpenPrinter] / [WritePrinter] with RAW datatype,
/// which is the standard way to send ESC/POS bytes to an installed printer on
/// Windows (whether connected via USB, network, or virtual PDF printer).
class UsbConnectorImpl extends UsbConnectorBase {
  static const MethodChannel _method = MethodChannel(
    'com.elriztechnology.unified_esc_pos_printer/methods',
  );

  PrinterConnectionState _state = PrinterConnectionState.disconnected;
  final StreamController<PrinterConnectionState> _stateController =
      StreamController<PrinterConnectionState>.broadcast();

  @override
  Stream<PrinterConnectionState> get stateStream => _stateController.stream;

  @override
  PrinterConnectionState get state => _state;

  @override
  Stream<List<UsbPrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    _setState(PrinterConnectionState.scanning);

    try {
      final List<dynamic>? results =
          await _method.invokeMethod<List>('usbGetList');
      _setState(PrinterConnectionState.disconnected);

      if (results != null && results.isNotEmpty) {
        yield results.map((dynamic r) {
          final Map<String, dynamic> m = Map<String, dynamic>.from(r as Map);
          return UsbPrinterDevice(
            name: (m['name'] as String?) ?? 'Unknown Printer',
            identifier: m['name'] as String? ?? '',
            usbPlatform: UsbPlatform.desktop,
          );
        }).toList();
      }
    } catch (e) {
      _setState(PrinterConnectionState.disconnected);
      throw PrinterScanException('Failed to list printers', cause: e);
    }
  }

  @override
  Future<void> stopScan() async {
    if (_state == PrinterConnectionState.scanning) {
      _setState(PrinterConnectionState.disconnected);
    }
  }

  @override
  Future<void> connect(
    UsbPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  }) async {
    _assertState(PrinterConnectionState.disconnected, 'connect');
    _setState(PrinterConnectionState.connecting);

    try {
      await _method.invokeMethod('usbConnect', {'name': device.identifier});

      // Send ESC @ to initialise the printer.
      await _method.invokeMethod('usbWrite', {
        'data': Uint8List.fromList(cInit.codeUnits),
      });

      _setState(PrinterConnectionState.connected);
    } catch (e) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterConnectionException(
        'Failed to open printer ${device.identifier}',
        cause: e,
      );
    }
  }

  @override
  Future<void> writeBytes(List<int> bytes) async {
    _assertState(PrinterConnectionState.connected, 'writeBytes');
    _setState(PrinterConnectionState.printing);
    try {
      await _method.invokeMethod('usbWrite', {
        'data': Uint8List.fromList(bytes),
      });
      _setState(PrinterConnectionState.connected);
    } catch (e) {
      _setState(PrinterConnectionState.error);
      _setState(PrinterConnectionState.disconnected);
      throw PrinterWriteException('USB spooler write failed', cause: e);
    }
  }

  @override
  Future<void> disconnect() async {
    if (_state == PrinterConnectionState.disconnected) return;
    _setState(PrinterConnectionState.disconnecting);
    try {
      await _method.invokeMethod('usbDisconnect');
    } finally {
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
