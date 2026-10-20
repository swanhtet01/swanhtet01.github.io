import 'package:flutter_test/flutter_test.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

/// Regression tests for issue #21: concurrent calls on a PrinterManager must
/// not interrupt a print job in progress.
class _FakeNetworkConnector extends NetworkConnector {
  final List<String> log = [];
  PrinterConnectionState _fakeState = PrinterConnectionState.disconnected;

  Duration writeDelay = const Duration(milliseconds: 40);

  @override
  PrinterConnectionState get state => _fakeState;

  @override
  Stream<PrinterConnectionState> get stateStream =>
      const Stream<PrinterConnectionState>.empty();

  @override
  Future<void> connect(
    NetworkPrinterDevice device, {
    Duration timeout = const Duration(seconds: 5),
  }) async {
    log.add('connect ${device.host}');
    _fakeState = PrinterConnectionState.connected;
  }

  @override
  Future<void> writeBytes(List<int> bytes) async {
    log.add('write start');
    await Future<void>.delayed(writeDelay);
    log.add('write end');
  }

  @override
  Future<void> waitWriteComplete() async {}

  @override
  Future<void> disconnect() async {
    log.add('disconnect');
    _fakeState = PrinterConnectionState.disconnected;
  }

  @override
  Future<void> dispose() async {}
}

void main() {
  const devA = NetworkPrinterDevice(name: 'A', host: '10.0.0.1');
  const devB = NetworkPrinterDevice(name: 'B', host: '10.0.0.2');

  late _FakeNetworkConnector fake;
  late PrinterManager manager;

  setUp(() {
    fake = _FakeNetworkConnector();
    manager = PrinterManager(networkConnector: fake);
  });

  test('connect() issued during a print waits for the job to finish',
      () async {
    await manager.connect(devA);

    final Future<void> job = manager.printBytes([1, 2, 3]);
    final Future<void> reconnect = manager.connect(devB);

    await Future.wait([job, reconnect]);

    expect(fake.log, [
      'connect 10.0.0.1',
      'write start',
      'write end',
      'disconnect',
      'connect 10.0.0.2',
    ]);
  });

  test('concurrent prints run one at a time', () async {
    await manager.connect(devA);

    await Future.wait([
      manager.printBytes([1]),
      manager.printBytes([2]),
    ]);

    expect(fake.log, [
      'connect 10.0.0.1',
      'write start',
      'write end',
      'write start',
      'write end',
    ]);
  });

  test('connect() to the already-connected device is a no-op', () async {
    await manager.connect(devA);
    await manager.connect(devA);

    expect(fake.log, ['connect 10.0.0.1']);
  });

  test('a failing operation does not jam the queue', () async {
    await expectLater(
      manager.printBytes([1]),
      throwsA(isA<PrinterStateException>()),
    );

    await manager.connect(devA);
    expect(fake.log, ['connect 10.0.0.1']);
  });

  test('disconnect() issued during a print waits for the job', () async {
    await manager.connect(devA);

    final Future<void> job = manager.printBytes([1, 2, 3]);
    final Future<void> disconnect = manager.disconnect();

    await Future.wait([job, disconnect]);

    expect(fake.log, [
      'connect 10.0.0.1',
      'write start',
      'write end',
      'disconnect',
    ]);
  });
}
