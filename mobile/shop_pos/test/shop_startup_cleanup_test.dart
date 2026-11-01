import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_startup.dart';

void main() {
  test('coordinator cleanup completes before database close', () async {
    final calls = <String>[];

    await closeShopResourcesInOrder(
      beforeCloseDatabase: () async => calls.add('coordinator'),
      closeDatabase: () async => calls.add('database'),
      onFailure: (error, stackTrace) => calls.add('failure'),
    );

    expect(calls, ['coordinator', 'database']);
  });

  test('one cleanup failure is retried before database close', () async {
    final calls = <String>[];
    var attempts = 0;

    await closeShopResourcesInOrder(
      beforeCloseDatabase: () async {
        attempts += 1;
        calls.add('coordinator-$attempts');
        if (attempts == 1) throw StateError('transient-stop-failure');
      },
      closeDatabase: () async => calls.add('database'),
      onFailure: (error, stackTrace) => calls.add('failure'),
    );

    expect(calls, ['coordinator-1', 'coordinator-2', 'database']);
  });

  test('uncertain cleanup is observed and keeps database open', () async {
    final failures = <Object>[];
    var closeCalls = 0;

    await closeShopResourcesInOrder(
      beforeCloseDatabase: () async => throw StateError('stop-unconfirmed'),
      closeDatabase: () async => closeCalls += 1,
      onFailure: (error, stackTrace) => failures.add(error),
    );

    expect(failures, hasLength(1));
    expect(failures.single, isA<StateError>());
    expect(closeCalls, 0);
  });

  test(
    'database close failure is observed without an unhandled future',
    () async {
      final failures = <Object>[];

      await closeShopResourcesInOrder(
        beforeCloseDatabase: null,
        closeDatabase: () async => throw StateError('database-close-failed'),
        onFailure: (error, stackTrace) => failures.add(error),
      );

      expect(failures, hasLength(1));
      expect(failures.single, isA<StateError>());
    },
  );
}
