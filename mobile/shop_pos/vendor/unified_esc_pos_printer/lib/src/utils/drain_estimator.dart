/// Estimates when bytes accepted by an OS/stack buffer finish transmitting.
///
/// Models the link as a fixed-rate pipe: a write of `n` bytes finishes at
/// `max(writeStart, previous deadline) + n / bytesPerSecond`. If the write
/// call took longer than that, the link was flow-controlled; the real rate
/// is then measured from the call duration and up to [assumedBufferBytes]
/// are assumed to still be queued locally.
class DrainEstimator {
  DrainEstimator({
    required this.bytesPerSecond,
    this.assumedBufferBytes = 16 * 1024,
    this.maxWait = const Duration(seconds: 10),
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  /// Conservative link throughput estimate, in bytes per second.
  final int bytesPerSecond;

  /// Assumed size of the local OS/stack buffer.
  final int assumedBufferBytes;

  /// Upper bound on any single drain wait.
  final Duration maxWait;

  final DateTime Function() _now;

  DateTime? _deadline;

  /// Record a completed write of [byteCount] bytes.
  void onWrite(int byteCount, DateTime writeStart, DateTime writeEnd) {
    if (byteCount <= 0) return;

    final Duration expected = _transmitTime(byteCount, bytesPerSecond);
    final Duration elapsed = writeEnd.difference(writeStart);

    if (elapsed > expected && elapsed > Duration.zero) {
      // Flow-controlled write: measure the real rate and assume a buffered tail.
      final double actualBps =
          byteCount * Duration.microsecondsPerSecond / elapsed.inMicroseconds;
      final int tailBytes =
          byteCount < assumedBufferBytes ? byteCount : assumedBufferBytes;
      _deadline = writeEnd.add(_transmitTime(tailBytes, actualBps));
    } else {
      final DateTime prev = _deadline ?? writeStart;
      final DateTime base = prev.isAfter(writeStart) ? prev : writeStart;
      _deadline = base.add(expected);
    }
  }

  /// Time still needed for buffered bytes to drain, clamped to [maxWait].
  Duration get remaining {
    final DateTime? deadline = _deadline;
    if (deadline == null) return Duration.zero;

    final Duration left = deadline.difference(_now());
    if (left <= Duration.zero) return Duration.zero;
    return left > maxWait ? maxWait : left;
  }

  /// Wait until the estimated drain deadline passes, then clear it.
  Future<void> wait() async {
    final Duration left = remaining;
    if (left > Duration.zero) {
      await Future<void>.delayed(left);
    }
    _deadline = null;
  }

  /// Discard any pending deadline.
  void reset() {
    _deadline = null;
  }

  Duration _transmitTime(int bytes, num bps) {
    if (bps <= 0) return Duration.zero;
    return Duration(
      microseconds: (bytes * Duration.microsecondsPerSecond / bps).ceil(),
    );
  }
}
