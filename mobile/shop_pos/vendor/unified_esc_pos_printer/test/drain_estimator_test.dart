import 'package:flutter_test/flutter_test.dart';
import 'package:unified_esc_pos_printer/src/utils/drain_estimator.dart';

/// Tests for the drain estimation behind waitWriteComplete() (issue #17).
void main() {
  final DateTime t0 = DateTime(2026, 1, 1, 12, 0, 0);

  group('DrainEstimator', () {
    test('remaining is zero before any write', () {
      final estimator = DrainEstimator(bytesPerSecond: 8192, now: () => t0);
      expect(estimator.remaining, Duration.zero);
    });

    test('non-blocking write schedules a deadline of bytes / rate', () {
      // 8192 bytes at 8192 B/s: 1 second still pending.
      final estimator = DrainEstimator(bytesPerSecond: 8192, now: () => t0);
      estimator.onWrite(8192, t0, t0);

      expect(estimator.remaining, const Duration(seconds: 1));
    });

    test('remaining shrinks as time passes and bottoms out at zero', () {
      DateTime now = t0;
      final estimator = DrainEstimator(bytesPerSecond: 8192, now: () => now);
      estimator.onWrite(8192, t0, t0);

      now = t0.add(const Duration(milliseconds: 600));
      expect(estimator.remaining, const Duration(milliseconds: 400));

      now = t0.add(const Duration(seconds: 2));
      expect(estimator.remaining, Duration.zero);
    });

    test('sequential writes queue behind the previous deadline', () {
      final estimator = DrainEstimator(bytesPerSecond: 8192, now: () => t0);
      estimator.onWrite(8192, t0, t0);

      // Second write starts while the first is still draining.
      final DateTime secondStart = t0.add(const Duration(milliseconds: 100));
      estimator.onWrite(4096, secondStart, secondStart);

      expect(
        estimator.remaining,
        const Duration(seconds: 1, milliseconds: 500),
      );
    });

    test('flow-controlled write assumes a buffered tail at the measured rate',
        () {
      // Write took 4s (measured rate 4096 B/s); 4096-byte tail needs 1 more second.
      final DateTime writeEnd = t0.add(const Duration(seconds: 4));
      final estimator = DrainEstimator(
        bytesPerSecond: 8192,
        assumedBufferBytes: 4096,
        now: () => writeEnd,
      );
      estimator.onWrite(16384, t0, writeEnd);

      expect(estimator.remaining, const Duration(seconds: 1));
    });

    test('buffered tail is capped at the byte count of the write', () {
      final DateTime writeEnd = t0.add(const Duration(seconds: 1));
      final estimator = DrainEstimator(
        bytesPerSecond: 8192,
        assumedBufferBytes: 16 * 1024,
        now: () => writeEnd,
      );
      estimator.onWrite(1024, t0, writeEnd);

      // Tail is 1024 bytes at the measured 1024 B/s, not the full buffer.
      expect(estimator.remaining, const Duration(seconds: 1));
    });

    test('remaining is clamped to maxWait', () {
      final estimator = DrainEstimator(
        bytesPerSecond: 1,
        maxWait: const Duration(seconds: 2),
        now: () => t0,
      );
      estimator.onWrite(1024, t0, t0);

      expect(estimator.remaining, const Duration(seconds: 2));
    });

    test('wait() completes and clears the deadline', () async {
      final estimator = DrainEstimator(bytesPerSecond: 1024 * 1024);
      final DateTime start = DateTime.now();
      estimator.onWrite(1024, start, start);

      await estimator.wait();
      expect(estimator.remaining, Duration.zero);
    });

    test('reset() discards the pending deadline', () {
      final estimator = DrainEstimator(bytesPerSecond: 8192, now: () => t0);
      estimator.onWrite(8192, t0, t0);
      expect(estimator.remaining, isNot(Duration.zero));

      estimator.reset();
      expect(estimator.remaining, Duration.zero);
    });

    test('zero-byte writes are ignored', () {
      final estimator = DrainEstimator(bytesPerSecond: 8192, now: () => t0);
      estimator.onWrite(0, t0, t0);
      expect(estimator.remaining, Duration.zero);
    });
  });
}
