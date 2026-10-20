import 'dart:async';
import 'dart:io';

import 'package:network_info_plus/network_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

import 'shop_database.dart';

const shopReceiptPrinterHostKey = 'shop_receipt_printer_host_v1';

class VerifiedPrinterSession {
  String? _host;
  ({String ip, String mask})? _range;

  bool permits(String host, ({String ip, String mask}) range) =>
      _host == host && _range?.ip == range.ip && _range?.mask == range.mask;

  void trust(String host, ({String ip, String mask}) range) {
    _host = host;
    _range = range;
  }

  void clear() {
    _host = null;
    _range = null;
  }
}

final _printerSession = VerifiedPrinterSession();

class ReceiptPrinterSettings {
  ReceiptPrinterSettings({
    Future<SharedPreferences> Function()? preferences,
    WifiRangeProvider? rangeProvider,
    VerifiedPrinterSession? session,
  }) : _preferences = preferences ?? SharedPreferences.getInstance,
       _rangeProvider = rangeProvider ?? _networkRangeProvider(NetworkInfo()),
       _session = session ?? _printerSession;

  final Future<SharedPreferences> Function() _preferences;
  final WifiRangeProvider _rangeProvider;
  final VerifiedPrinterSession _session;

  Future<String?> readSavedHost() async {
    final host = (await _preferences()).getString(shopReceiptPrinterHostKey);
    if (host == null || !Ipv4Subnet.isPrivateAddress(host)) return null;
    return host;
  }

  Future<String?> readHost() async {
    final host = await readSavedHost();
    if (host == null) {
      _session.clear();
      return null;
    }
    try {
      final range = await _rangeProvider();
      if (_session.permits(host, range) &&
          Ipv4Subnet.fromAddress(range.ip, range.mask).hosts.contains(host)) {
        return host;
      }
    } catch (_) {
      // Network range unavailable: a saved IP cannot authorize printing.
    }
    _session.clear();
    return null;
  }

  Future<void> saveAfterTest(NetworkPrinterCandidate candidate) async {
    _session.clear();
    if (candidate.port != 9100 ||
        !Ipv4Subnet.isPrivateAddress(candidate.host)) {
      throw const FormatException('Choose a printer discovered on this Wi-Fi.');
    }
    final range = await _rangeProvider();
    if (!Ipv4Subnet.fromAddress(range.ip, range.mask).hosts.contains(
      candidate.host,
    )) {
      throw const PrinterNetworkChanged();
    }
    final saved = await (await _preferences()).setString(
      shopReceiptPrinterHostKey,
      candidate.host,
    );
    if (!saved) throw StateError('Printer setup could not be saved.');
    _session.trust(candidate.host, range);
  }
}

class ShopReceiptPrinter {
  ShopReceiptPrinter({WifiRangeProvider? rangeProvider})
    : _rangeProvider = rangeProvider ?? _networkRangeProvider(NetworkInfo());

  final WifiRangeProvider _rangeProvider;

  Future<void> printSale(
    String host,
    ShopSaleReceipt receipt, {
    required bool myanmar,
  }) async {
    if (!Ipv4Subnet.isPrivateAddress(host)) {
      throw const FormatException('Receipt printer must be on private Wi-Fi.');
    }
    final range = await _rangeProvider();
    final subnet = Ipv4Subnet.fromAddress(range.ip, range.mask);
    if (!subnet.hosts.contains(host)) {
      throw const PrinterNetworkChanged();
    }

    final manager = PrinterManager();
    try {
      await manager.connect(
        NetworkPrinterDevice(
          name: 'SuperMega Shop receipt printer',
          host: host,
          port: 9100,
        ),
        timeout: const Duration(seconds: 5),
      );
      final ticket = await Ticket.create(PaperSize.mm80);
      for (final line in shopReceiptTextLines(receipt, myanmar: myanmar)) {
        await ticket.textRaster(line);
      }
      ticket.separator();
      ticket.cut();
      await manager.printTicket(ticket);
    } finally {
      await manager.dispose();
    }
  }
}

typedef ReceiptPrintSender =
    Future<void> Function(String host, ShopSaleReceipt receipt, bool myanmar);

/// A saved address alone never authorizes a reprint after Shop restarts.
/// The cashier must test and confirm that printer in the current session.
class ReceiptReprintService {
  ReceiptReprintService({
    ReceiptPrinterSettings? settings,
    ReceiptPrintSender? send,
  }) : _settings = settings ?? ReceiptPrinterSettings(),
       _send = send ??
           ((host, receipt, myanmar) => ShopReceiptPrinter().printSale(
                 host,
                 receipt,
                 myanmar: myanmar,
               ));

  final ReceiptPrinterSettings _settings;
  final ReceiptPrintSender _send;

  /// Returns false when setup/retest is required; it never sends to a saved,
  /// unverified host. A true result means the print request was sent, not that
  /// paper output or payment status was confirmed.
  Future<bool> printIfTrusted(
    ShopSaleReceipt receipt, {
    required bool myanmar,
  }) async {
    final host = await _settings.readHost();
    if (host == null) return false;
    await _send(host, receipt, myanmar);
    return true;
  }
}

List<String> shopReceiptTextLines(
  ShopSaleReceipt receipt, {
  required bool myanmar,
}) => [
  'SUPERMEGA SHOP',
  myanmar ? 'အရောင်းပြေစာ' : 'SALE RECEIPT',
  'Sale ${receipt.id}',
  DateTime.fromMillisecondsSinceEpoch(receipt.createdAtMillis)
      .toLocal()
      .toString(),
  '',
  for (final line in receipt.lines) ...[
    '${line.productName} x${line.quantity}',
    '${_formatMmk(line.unitPriceMmk)} MMK x ${line.quantity} = ${_formatMmk(line.lineTotalMmk)} MMK',
  ],
  '',
  '${myanmar ? 'စုစုပေါင်း' : 'TOTAL'}: ${_formatMmk(receipt.totalMmk)} MMK',
  '${myanmar ? 'ငွေပေးချေမှု' : 'Payment'}: ${receipt.paymentMethod.toUpperCase()}',
];

String _formatMmk(int value) {
  final digits = value.toString();
  final output = StringBuffer();
  for (var index = 0; index < digits.length; index++) {
    if (index > 0 && (digits.length - index) % 3 == 0) output.write(',');
    output.write(digits[index]);
  }
  return output.toString();
}

class Ipv4Subnet {
  const Ipv4Subnet({
    required this.network,
    required this.broadcast,
    required this.prefixLength,
    required this.localAddress,
  });

  final int network;
  final int broadcast;
  final int prefixLength;
  final int localAddress;

  factory Ipv4Subnet.fromAddress(String ip, String mask) {
    final local = _parseIpv4(ip);
    final subnetMask = _parseIpv4(mask);
    if (local == null || subnetMask == null || !_isPrivate(local)) {
      throw const FormatException('Connect to a private Wi-Fi network first.');
    }
    final bits = subnetMask.toRadixString(2).padLeft(32, '0');
    if (!RegExp(r'^1*0*$').hasMatch(bits)) {
      throw const FormatException('This Wi-Fi subnet mask is not supported.');
    }
    final prefix = !bits.contains('0') ? 32 : bits.indexOf('0');
    // Cap a user-initiated scan at 510 hosts; larger ranges need narrower scoping.
    if (prefix < 23 || prefix > 30) {
      throw const FormatException(
        'Printer search is limited to this Wi-Fi network (up to 510 devices).',
      );
    }
    final network = local & subnetMask;
    final broadcast = network | (~subnetMask & 0xffffffff);
    return Ipv4Subnet(
      network: network,
      broadcast: broadcast,
      prefixLength: prefix,
      localAddress: local,
    );
  }

  List<String> get hosts {
    final result = <String>[];
    for (var address = network + 1; address < broadcast; address++) {
      if (address != localAddress) result.add(_formatIpv4(address));
    }
    return result;
  }

  static bool isPrivateAddress(String value) {
    final address = _parseIpv4(value);
    return address != null && _isPrivate(address);
  }
}

class NetworkPrinterCandidate {
  NetworkPrinterCandidate._({
    required this.host,
    required this.port,
    required this._scanToken,
  });

  final String host;
  final int port;
  final Object _scanToken;
  String get label => 'Network printer at $host';
}

typedef PrinterPortProbe = Future<bool> Function(String host, int port);
typedef WifiRangeProvider = Future<({String ip, String mask})> Function();

class PrinterScanResult {
  const PrinterScanResult({
    required this.localIp,
    required this.subnetMask,
    required this.printers,
    required this.cancelled,
  });

  final String localIp;
  final String subnetMask;
  final List<NetworkPrinterCandidate> printers;
  final bool cancelled;
}

class PrinterNetworkChanged implements Exception {
  const PrinterNetworkChanged();
}

class PrinterDiscoveryService {
  PrinterDiscoveryService({
    NetworkInfo? networkInfo,
    PrinterPortProbe? probe,
    WifiRangeProvider? rangeProvider,
  }) : _rangeProvider =
           rangeProvider ?? _networkRangeProvider(networkInfo ?? NetworkInfo()),
       _probe = probe ?? _tcpProbe;

  final WifiRangeProvider _rangeProvider;
  final PrinterPortProbe _probe;
  Object? _activeScanToken;
  ({String ip, String mask})? _activeScanRange;
  Set<String> _activePrinterHosts = const {};

  Future<({String ip, String mask})> currentWifiRange() async {
    final range = await _rangeProvider();
    Ipv4Subnet.fromAddress(range.ip, range.mask);
    return range;
  }

  Future<PrinterScanResult> scan({
    bool Function()? cancelled,
    int port = 9100,
    int maxConcurrent = 24,
  }) async {
    if (port != 9100 || maxConcurrent < 1 || maxConcurrent > 32) {
      throw ArgumentError('Only bounded ESC/POS port 9100 scans are allowed.');
    }
    _activeScanToken = null;
    _activeScanRange = null;
    _activePrinterHosts = const {};
    final range = await currentWifiRange();
    final hosts = Ipv4Subnet.fromAddress(range.ip, range.mask).hosts;
    final found = <NetworkPrinterCandidate>[];
    final scanToken = Object();
    for (var start = 0; start < hosts.length; start += maxConcurrent) {
      if (cancelled?.call() ?? false) break;
      await _ensureSameWifiRange(range);
      final end = start + maxConcurrent < hosts.length
          ? start + maxConcurrent
          : hosts.length;
      final batch = hosts.sublist(start, end);
      final probes = await Future.wait(
        batch.map((host) async {
          if (cancelled?.call() ?? false) return null;
          try {
            return await _probe(
              host,
              port,
            ).timeout(const Duration(milliseconds: 450));
          } catch (_) {
            return false;
          }
        }),
      );
      for (var index = 0; index < probes.length; index++) {
        if (probes[index] == true) {
          found.add(
            NetworkPrinterCandidate._(
              host: batch[index],
              port: port,
              scanToken: scanToken,
            ),
          );
        }
      }
      await _ensureSameWifiRange(range);
    }
    _activeScanToken = scanToken;
    _activeScanRange = range;
    _activePrinterHosts = found.map((printer) => printer.host).toSet();
    return PrinterScanResult(
      localIp: range.ip,
      subnetMask: range.mask,
      printers: List.unmodifiable(found),
      cancelled: cancelled?.call() ?? false,
    );
  }

  Future<void> sendTestReceipt(NetworkPrinterCandidate printer) async {
    if (!Ipv4Subnet.isPrivateAddress(printer.host) || printer.port != 9100) {
      throw const FormatException('Select a printer found on this Wi-Fi.');
    }
    if (!identical(printer._scanToken, _activeScanToken) ||
        !_activePrinterHosts.contains(printer.host)) {
      throw const FormatException(
        'Scan again and select a discovered printer.',
      );
    }
    final range = await currentWifiRange();
    final scannedRange = _activeScanRange;
    if (scannedRange == null ||
        range.ip != scannedRange.ip ||
        range.mask != scannedRange.mask) {
      throw const PrinterNetworkChanged();
    }
    final currentHosts = Ipv4Subnet.fromAddress(range.ip, range.mask).hosts;
    if (!currentHosts.contains(printer.host)) {
      throw const FormatException(
        'Printer is no longer on the current Wi-Fi network.',
      );
    }
    final manager = PrinterManager();
    try {
      await manager.connect(
        NetworkPrinterDevice(
          name: 'SuperMega Shop test',
          host: printer.host,
          port: printer.port,
        ),
        timeout: const Duration(seconds: 5),
      );
      final ticket = await Ticket.create(PaperSize.mm80);
      await ticket.textRaster('SuperMega Shop');
      await ticket.textRaster('Printer test');
      await ticket.textRaster('ပရင်တာ စမ်းသပ်မှု');
      ticket.separator();
      ticket.cut();
      await manager.printTicket(ticket);
      await manager.disconnect();
    } finally {
      manager.dispose();
    }
  }

  Future<void> _ensureSameWifiRange(({String ip, String mask}) expected) async {
    final current = await currentWifiRange();
    if (current.ip != expected.ip || current.mask != expected.mask) {
      throw const PrinterNetworkChanged();
    }
  }
}

WifiRangeProvider _networkRangeProvider(NetworkInfo networkInfo) {
  return () async {
    final ip = await networkInfo.getWifiIP();
    final mask = await networkInfo.getWifiSubmask();
    if (ip == null || mask == null) {
      throw const FormatException(
        'Wi-Fi details are unavailable. Connect to the same Wi-Fi as the printer.',
      );
    }
    return (ip: ip, mask: mask);
  };
}

Future<bool> _tcpProbe(String host, int port) async {
  Socket? socket;
  try {
    socket = await Socket.connect(
      host,
      port,
      timeout: const Duration(milliseconds: 450),
    );
    return true;
  } on SocketException {
    return false;
  } on TimeoutException {
    return false;
  } finally {
    socket?.destroy();
  }
}

int? _parseIpv4(String value) {
  final parts = value.split('.');
  if (parts.length != 4) return null;
  var result = 0;
  for (final part in parts) {
    final octet = int.tryParse(part);
    if (octet == null || octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result;
}

String _formatIpv4(int value) {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ].join('.');
}

bool _isPrivate(int value) {
  final first = (value >> 24) & 0xff;
  final second = (value >> 16) & 0xff;
  return first == 10 ||
      (first == 172 && second >= 16 && second <= 31) ||
      (first == 192 && second == 168);
}
