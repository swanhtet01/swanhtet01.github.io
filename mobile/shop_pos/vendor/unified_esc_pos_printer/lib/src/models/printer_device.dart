/// Connection transport types supported by this package.
enum PrinterConnectionType { usb, bluetooth, ble, network }

/// USB platform variants.
enum UsbPlatform { android, desktop }

/// Abstract base for all discovered printer devices.
///
/// Concrete subtypes carry transport-specific fields:
/// - [NetworkPrinterDevice] — host + port
/// - [BlePrinterDevice] — BLE device ID + optional service/characteristic UUIDs
/// - [BluetoothPrinterDevice] — Classic BT MAC address
/// - [UsbPrinterDevice] — platform-specific identifier
abstract class PrinterDevice {
  final String name;
  final PrinterConnectionType connectionType;

  const PrinterDevice({
    required this.name,
    required this.connectionType,
  });

  @override
  String toString() => 'PrinterDevice(name: $name, type: $connectionType)';
}

/// A network (TCP/IP) printer.
class NetworkPrinterDevice extends PrinterDevice {
  final String host;
  final int port;

  const NetworkPrinterDevice({
    required super.name,
    required this.host,
    this.port = 9100,
  }) : super(connectionType: PrinterConnectionType.network);

  @override
  String toString() =>
      'NetworkPrinterDevice(name: $name, host: $host, port: $port)';
}

/// A BLE (Bluetooth Low Energy) printer.
class BlePrinterDevice extends PrinterDevice {
  /// Platform remote ID (MAC address on Android/Windows, UUID on iOS).
  final String deviceId;

  /// Optional known ESC/POS service UUID to target directly.
  final String? serviceUuid;

  /// Optional known write characteristic UUID.
  final String? txCharacteristicUuid;

  const BlePrinterDevice({
    required super.name,
    required this.deviceId,
    this.serviceUuid,
    this.txCharacteristicUuid,
  }) : super(connectionType: PrinterConnectionType.ble);

  @override
  String toString() => 'BlePrinterDevice(name: $name, deviceId: $deviceId)';
}

/// A Bluetooth Classic (SPP) printer.
///
/// Only supported on Android at runtime. Other platforms will receive a
/// [PrinterConnectionException] when attempting to connect.
class BluetoothPrinterDevice extends PrinterDevice {
  const BluetoothPrinterDevice({
    required super.name,
    required this.address,
  }) : super(connectionType: PrinterConnectionType.bluetooth);

  /// Bluetooth MAC address (e.g. 'AA:BB:CC:DD:EE:FF').
  final String address;

  @override
  String toString() => 'BluetoothPrinterDevice(name: $name, address: $address)';
}

/// A USB serial printer.
class UsbPrinterDevice extends PrinterDevice {
  const UsbPrinterDevice({
    required super.name,
    required this.identifier,
    required this.usbPlatform,
  }) : super(connectionType: PrinterConnectionType.usb);

  /// Platform-specific identifier:
  /// - Android: `'<vendorId>:<productId>'` string
  /// - Desktop: serial port path (e.g. 'COM3', '/dev/ttyUSB0')
  final String identifier;

  final UsbPlatform usbPlatform;

  @override
  String toString() =>
      'UsbPrinterDevice(name: $name, id: $identifier, platform: $usbPlatform)';
}
