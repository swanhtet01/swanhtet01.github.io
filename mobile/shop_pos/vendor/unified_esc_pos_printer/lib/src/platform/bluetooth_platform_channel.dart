import 'dart:async';

import 'package:flutter/services.dart';

import '../core/commands.dart';

/// Low-level platform channel wrapper for native Bluetooth operations.
///
/// Singleton — both [BleConnector] and [BluetoothConnector] share this
/// instance since there is only one Bluetooth adapter per device.
class BluetoothPlatformChannel {
  BluetoothPlatformChannel._();

  static final BluetoothPlatformChannel instance = BluetoothPlatformChannel._();

  static const MethodChannel _method = MethodChannel(
    'com.elriztechnology.unified_esc_pos_printer/methods',
  );

  static const EventChannel _bleScanEvent = EventChannel(
    'com.elriztechnology.unified_esc_pos_printer/ble_scan',
  );

  static const EventChannel _btScanEvent = EventChannel(
    'com.elriztechnology.unified_esc_pos_printer/bt_scan',
  );

  static const EventChannel _connectionStateEvent = EventChannel(
    'com.elriztechnology.unified_esc_pos_printer/connection_state',
  );

  /// Request Bluetooth permissions required by the current platform.
  ///
  /// Returns `true` if all required permissions were granted.
  Future<bool> requestBluetoothPermissions() async {
    return await _method.invokeMethod<bool>('requestPermissions') ?? false;
  }

  /// Start a BLE scan. Results arrive via [bleScanResults].
  Future<void> startBleScan({required int timeoutMs}) async {
    await _method.invokeMethod('startBleScan', {'timeoutMs': timeoutMs});
  }

  /// Stop an in-progress BLE scan.
  Future<void> stopBleScan() async {
    await _method.invokeMethod('stopBleScan');
  }

  /// Stream of BLE scan results. Each event is a list of device maps
  /// containing `deviceId` and `name` keys.
  Stream<List<Map<String, dynamic>>> get bleScanResults {
    return _bleScanEvent.receiveBroadcastStream().map((event) {
      return (event as List)
          .cast<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    });
  }

  /// Connect to a BLE device. Native code handles service/characteristic
  /// discovery and MTU negotiation.
  Future<void> bleConnect({
    required String deviceId,
    required int timeoutMs,
    String? serviceUuid,
    String? characteristicUuid,
  }) async {
    await _method.invokeMethod('bleConnect', {
      'deviceId': deviceId,
      'timeoutMs': timeoutMs,
      if (serviceUuid != null) 'serviceUuid': serviceUuid,
      if (characteristicUuid != null) 'characteristicUuid': characteristicUuid,
    });
  }

  /// Returns the negotiated MTU payload size (already minus ATT overhead).
  Future<int> bleGetMtu() async {
    return await _method.invokeMethod<int>('bleGetMtu') ?? 20;
  }

  /// Returns whether the connected characteristic supports write-without-response.
  Future<bool> bleSupportsWriteWithoutResponse() async {
    return await _method
            .invokeMethod<bool>('bleSupportsWriteWithoutResponse') ??
        false;
  }

  /// Write [data] to the connected BLE characteristic.
  Future<void> bleWrite({
    required Uint8List data,
    required bool withoutResponse,
    int chunkSize = kDefaultBleChunkSize,
    int chunkDelayMs = kDefaultBleChunkDelayMs,
    int bytesPerSecond = kDefaultBleBytesPerSecond,
  }) async {
    await _method.invokeMethod('bleWrite', {
      'data': data,
      'withoutResponse': withoutResponse,
      'chunkSize': chunkSize,
      'chunkDelayMs': chunkDelayMs,
      'bytesPerSecond': bytesPerSecond,
    });
  }

  /// Disconnect the current BLE connection.
  Future<void> bleDisconnect() async {
    await _method.invokeMethod('bleDisconnect');
  }

  /// Get paired/bonded BLE devices. Returns list of device maps
  /// containing `deviceId` and `name` keys.
  Future<List<Map<String, dynamic>>> getBondedBleDevices() async {
    final result = await _method.invokeMethod<List>('getBondedBleDevices');
    return result
            ?.cast<Map>()
            .map((m) => Map<String, dynamic>.from(m))
            .toList() ??
        [];
  }

  /// Get paired/bonded Bluetooth devices. Returns list of device maps
  /// containing `name` and `address` keys.
  Future<List<Map<String, dynamic>>> getBondedDevices() async {
    final result = await _method.invokeMethod<List>('getBondedDevices');
    return result
            ?.cast<Map>()
            .map((m) => Map<String, dynamic>.from(m))
            .toList() ??
        [];
  }

  /// Start Bluetooth Classic discovery. Results arrive via [btDiscoveryResults].
  Future<void> startBtDiscovery({required int timeoutMs}) async {
    await _method.invokeMethod('startBtDiscovery', {'timeoutMs': timeoutMs});
  }

  /// Stop Bluetooth Classic discovery.
  Future<void> stopBtDiscovery() async {
    await _method.invokeMethod('stopBtDiscovery');
  }

  /// Stream of Classic BT discovery results. Each event is a list of device
  /// maps containing `name` and `address` keys.
  Stream<List<Map<String, dynamic>>> get btDiscoveryResults {
    return _btScanEvent.receiveBroadcastStream().map((event) {
      return (event as List)
          .cast<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    });
  }

  /// Connect to a Classic Bluetooth device by MAC address.
  Future<void> btConnect({
    required String address,
    required int timeoutMs,
  }) async {
    await _method.invokeMethod('btConnect', {
      'address': address,
      'timeoutMs': timeoutMs,
    });
  }

  /// Write data to the connected Classic Bluetooth device.
  ///
  /// The whole job is sent in one call; the native side splits it into
  /// [chunkSize]-byte chunks, pausing [chunkDelayMs] between them so slow
  /// printer modules are not overflowed.
  Future<void> btWrite({
    required Uint8List data,
    int chunkSize = kDefaultBtChunkSize,
    int chunkDelayMs = 0,
  }) async {
    await _method.invokeMethod('btWrite', {
      'data': data,
      'chunkSize': chunkSize,
      'chunkDelayMs': chunkDelayMs,
    });
  }

  /// Disconnect the current Classic Bluetooth connection.
  Future<void> btDisconnect() async {
    await _method.invokeMethod('btDisconnect');
  }

  // Connection

  /// Stream of connection state events. Each event is a map with:
  /// - `type`: `"ble"` or `"bt"`
  /// - `state`: `"connected"` or `"disconnected"`
  Stream<Map<String, dynamic>> get connectionStateStream {
    return _connectionStateEvent.receiveBroadcastStream().map((event) {
      return Map<String, dynamic>.from(event as Map);
    });
  }
}
