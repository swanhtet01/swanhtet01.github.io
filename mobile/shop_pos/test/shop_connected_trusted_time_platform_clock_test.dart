import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_trusted_time_platform_clock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(connectedPlatformSecurityChannel);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  tearDown(() async {
    messenger.setMockMethodCallHandler(channel, null);
  });

  test('reads exact current-boot and monotonic response', () async {
    messenger.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'readTrustedTimeClock');
      expect(call.arguments, const {
        'schema': 'supermega.connected-trusted-time-platform-clock-request.v1',
      });
      return _reading(monotonic: 42);
    });
    final clock = MethodChannelConnectedTrustedTimePlatformClock();
    expect(await clock.bootSessionId(), 'a' * 64);
    expect(await clock.monotonicMillis(), 42);
  });

  test('rejects extra missing malformed and negative fields', () async {
    for (final response in <Object?>[
      {..._reading(), 'extra': true},
      Map<String, Object?>.from(_reading())..remove('source'),
      {..._reading(), 'schema': 'wrong'},
      {..._reading(), 'source': 'windows_unreviewed'},
      {..._reading(), 'bootSessionId': 'A' * 64},
      {..._reading(), 'monotonicMillis': -1},
      {..._reading(), 'monotonicMillis': 1.0},
      {1: 'non-string-key'},
      null,
    ]) {
      messenger.setMockMethodCallHandler(channel, (_) async => response);
      await expectLater(
        MethodChannelConnectedTrustedTimePlatformClock().bootSessionId(),
        throwsA(_state('connected_trusted_time_platform_clock_invalid')),
      );
    }
  });

  test('rejects boot substitution and monotonic regression', () async {
    var calls = 0;
    messenger.setMockMethodCallHandler(channel, (_) async {
      calls += 1;
      return _reading(boot: calls == 1 ? 'a' * 64 : 'b' * 64);
    });
    var clock = MethodChannelConnectedTrustedTimePlatformClock();
    expect(await clock.bootSessionId(), 'a' * 64);
    await expectLater(
      clock.monotonicMillis(),
      throwsA(_state('connected_trusted_time_platform_clock_regressed')),
    );

    calls = 0;
    messenger.setMockMethodCallHandler(channel, (_) async {
      calls += 1;
      return _reading(monotonic: calls == 1 ? 10 : 9);
    });
    clock = MethodChannelConnectedTrustedTimePlatformClock();
    expect(await clock.monotonicMillis(), 10);
    await expectLater(
      clock.monotonicMillis(),
      throwsA(_state('connected_trusted_time_platform_clock_regressed')),
    );
  });

  test('missing plugin and platform failures remain unavailable', () async {
    final clock = MethodChannelConnectedTrustedTimePlatformClock();
    await expectLater(
      clock.bootSessionId(),
      throwsA(_state('connected_trusted_time_platform_clock_unavailable')),
    );
    messenger.setMockMethodCallHandler(
      channel,
      (_) async => throw PlatformException(code: 'unavailable'),
    );
    await expectLater(
      clock.monotonicMillis(),
      throwsA(_state('connected_trusted_time_platform_clock_unavailable')),
    );
  });
}

Map<String, Object?> _reading({String? boot, int monotonic = 1}) =>
    <String, Object?>{
      'schema': 'supermega.connected-trusted-time-platform-clock.v1',
      'source': 'android_system_clock_elapsed_realtime_boot_count_v1',
      'bootSessionId': boot ?? 'a' * 64,
      'monotonicMillis': monotonic,
    };

Matcher _state(String message) =>
    isA<StateError>().having((error) => error.message, 'message', message);
