import 'package:flutter/services.dart';

import 'shop_connected_platform_security.dart';
import 'shop_connected_trusted_time_contract.dart';

const _requestSchema =
    'supermega.connected-trusted-time-platform-clock-request.v1';
const _responseSchema = 'supermega.connected-trusted-time-platform-clock.v1';
const _androidSource = 'android_system_clock_elapsed_realtime_boot_count_v1';
const _windowsSource = 'windows_system_boot_identifier_get_tick_count64_v1';
const _platformSources = {_androidSource, _windowsSource};

/// Current-boot platform clock adapter for the default-off connected runtime.
///
/// This adapter intentionally refuses boot changes and monotonic regression
/// within one Dart process. It does not provide anti-rollback authority across
/// reboot, restore, factory reset, or a compromised operating system.
class MethodChannelConnectedTrustedTimePlatformClock
    implements ConnectedTrustedTimePlatformClock {
  MethodChannelConnectedTrustedTimePlatformClock({MethodChannel? channel})
    : _channel =
          channel ?? const MethodChannel(connectedPlatformSecurityChannel);

  final MethodChannel _channel;
  String? _bootSessionId;
  int? _lastMonotonicMillis;

  @override
  Future<String> bootSessionId() async => (await _read()).bootSessionId;

  @override
  Future<int> monotonicMillis() async => (await _read()).monotonicMillis;

  Future<_PlatformClockReading> _read() async {
    Object? response;
    try {
      response = await _channel.invokeMethod<Object?>(
        'readTrustedTimeClock',
        const {'schema': _requestSchema},
      );
    } on MissingPluginException {
      throw StateError('connected_trusted_time_platform_clock_unavailable');
    } on PlatformException {
      throw StateError('connected_trusted_time_platform_clock_unavailable');
    }
    final reading = _PlatformClockReading.parse(response);
    final retainedBoot = _bootSessionId;
    final retainedMonotonic = _lastMonotonicMillis;
    if ((retainedBoot != null && retainedBoot != reading.bootSessionId) ||
        (retainedMonotonic != null &&
            reading.monotonicMillis < retainedMonotonic)) {
      throw StateError('connected_trusted_time_platform_clock_regressed');
    }
    _bootSessionId = reading.bootSessionId;
    _lastMonotonicMillis = reading.monotonicMillis;
    return reading;
  }
}

class _PlatformClockReading {
  const _PlatformClockReading({
    required this.bootSessionId,
    required this.monotonicMillis,
  });

  final String bootSessionId;
  final int monotonicMillis;

  static final _digest = RegExp(r'^[0-9a-f]{64}$');
  static const _keys = {'schema', 'source', 'bootSessionId', 'monotonicMillis'};

  factory _PlatformClockReading.parse(Object? value) {
    if (value is! Map || value.keys.any((key) => key is! String)) {
      throw StateError('connected_trusted_time_platform_clock_invalid');
    }
    final map = value.cast<String, Object?>();
    if (map.keys.toSet().difference(_keys).isNotEmpty ||
        _keys.difference(map.keys.toSet()).isNotEmpty ||
        map['schema'] != _responseSchema ||
        !_platformSources.contains(map['source']) ||
        map['bootSessionId'] is! String ||
        !_digest.hasMatch(map['bootSessionId']! as String) ||
        map['monotonicMillis'] is! int ||
        (map['monotonicMillis']! as int) < 0) {
      throw StateError('connected_trusted_time_platform_clock_invalid');
    }
    return _PlatformClockReading(
      bootSessionId: map['bootSessionId']! as String,
      monotonicMillis: map['monotonicMillis']! as int,
    );
  }
}
