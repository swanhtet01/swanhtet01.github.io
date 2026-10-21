import 'package:flutter/material.dart';

import 'printer_services.dart';
import 'shop_copy.dart';

class PrinterSetupScreen extends StatefulWidget {
  const PrinterSetupScreen({required this.myanmar, super.key});
  final bool myanmar;

  @override
  State<PrinterSetupScreen> createState() => _PrinterSetupScreenState();
}

class _PrinterSetupScreenState extends State<PrinterSetupScreen> {
  final _service = PrinterDiscoveryService();
  final _settings = ReceiptPrinterSettings();
  bool _loadingSettings = true;
  bool _busy = false;
  bool _cancelled = false;
  String? _message;
  String? _testedHost;
  ReceiptPaperWidth? _testedWidth;
  ReceiptPaperWidth _paperWidth = ReceiptPaperWidth.mm80;
  String? _savedHost;
  String? _previousHost;
  List<NetworkPrinterCandidate> _printers = [];
  String? _scannedIp;
  String? _scannedMask;

  @override
  void initState() {
    super.initState();
    _loadSavedPrinter();
  }

  Future<void> _loadSavedPrinter() async {
    try {
      final previous = await _settings.readSavedHost();
      final active = await _settings.readHost();
      final paperWidth = await _settings.readPaperWidth();
      if (mounted) {
        setState(() {
          _previousHost = previous;
          _savedHost = active;
          _paperWidth = paperWidth;
        });
      }
    } catch (_) {
      // Printer discovery remains available if the local preference is unreadable.
    } finally {
      if (mounted) setState(() => _loadingSettings = false);
    }
  }

  Future<void> _findPrinters() async {
    if (_busy || _loadingSettings) return;
    setState(() {
      _busy = true;
      _cancelled = false;
      _message = null;
      _testedHost = null;
      _testedWidth = null;
      _printers = [];
    });
    try {
      final active = await _settings.readHost();
      final result = await _service.scan(cancelled: () => _cancelled);
      if (!mounted) return;
      setState(() {
        _savedHost = active;
        _scannedIp = result.localIp;
        _scannedMask = result.subnetMask;
        _printers = result.printers;
        _message = result.cancelled
            ? shopCopy(
                widget.myanmar,
                'Search cancelled.',
                'ရှာဖွေမှုကို ရပ်လိုက်ပါပြီ။',
              )
            : result.printers.isEmpty
            ? shopCopy(
                widget.myanmar,
                'No printer candidate answered on port 9100. Check the printer is on this Wi-Fi and network printing is enabled.',
                '9100 port တွင် ပရင်တာမတွေ့ပါ။ ပရင်တာနှင့် ဤစက်သည် Wi-Fi တစ်ခုတည်းတွင်ရှိပြီး network printing ဖွင့်ထားကြောင်း စစ်ဆေးပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Found ${result.printers.length} candidate(s). A port match is not proof the device can print.',
                'ပရင်တာဖြစ်နိုင်သော စက် ${result.printers.length} ခု တွေ့ပါသည်။ Port ဖွင့်နေခြင်းက ပရင့်ထုတ်နိုင်ကြောင်း သက်သေမဟုတ်ပါ။',
              );
      });
    } on PrinterNetworkChanged {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Wi-Fi changed during the search. Start again on the printer network.',
            'ရှာဖွေနေစဉ် Wi-Fi ပြောင်းသွားသည်။ ပရင်တာရှိသော network တွင် ထပ်ရှာပါ။',
          ),
        );
      }
    } on FormatException {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Connect to a private Wi-Fi network with a supported subnet, then try again.',
            'ထောက်ပံ့ထားသော subnet ရှိ သီးသန့် Wi-Fi သို့ ချိတ်ဆက်ပြီး ထပ်ကြိုးစားပါ။',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Could not search this Wi-Fi. Check network access and try again.',
            'ဤ Wi-Fi ကို ရှာမရပါ။ Network ခွင့်ပြုချက်ကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendTest(NetworkPrinterCandidate printer) async {
    if (_busy || _loadingSettings) return;
    final paperWidth = _paperWidth;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await _service.sendTestReceipt(printer, paperWidth: paperWidth);
      if (mounted) {
        setState(() {
          _testedHost = printer.host;
          _testedWidth = paperWidth;
          _message = shopCopy(
            widget.myanmar,
            'Test sent to ${printer.host}. Check the paper, then choose Use for receipts.',
            '${printer.host} သို့ စမ်းသပ်ချက်ပို့ပြီးပါပြီ။ စက္ကူထွက်လာကြောင်း စစ်ပြီး ပြေစာအတွက်အသုံးပြုရန် ရွေးပါ။',
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Could not send the test. Check the printer and try again.',
            'စမ်းသပ်ပြေစာ မပို့နိုင်ပါ။ ပရင်တာစစ်ပြီး ထပ်ကြိုးစားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _useForReceipts(NetworkPrinterCandidate printer) async {
    if (_busy ||
        _loadingSettings ||
        _testedHost != printer.host ||
        _testedWidth != _paperWidth) {
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final range = await _service.currentWifiRange();
      if (!Ipv4Subnet.fromAddress(
        range.ip,
        range.mask,
      ).hosts.contains(printer.host)) {
        throw const PrinterNetworkChanged();
      }
      await _settings.saveAfterTest(printer, paperWidth: _paperWidth);
      if (mounted) {
        setState(() {
          _savedHost = printer.host;
          _previousHost = printer.host;
          _message = shopCopy(
            widget.myanmar,
            'Printer ready for this session. Re-test it after reopening Shop before sending customer receipts.',
            'ဤအကြိမ်အတွက် ပရင်တာအသင့်ဖြစ်ပါပြီ။ Shop ကို ပြန်ဖွင့်ပြီးနောက် ဖောက်သည်ပြေစာမပို့မီ ပြန်စမ်းသပ်ပါ။',
          );
        });
      }
    } on PrinterNetworkChanged {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Wi-Fi changed after the test. Find and test the printer again.',
            'စမ်းသပ်ပြီးနောက် Wi-Fi ပြောင်းသွားသည်။ ပရင်တာကို ထပ်ရှာပြီး စမ်းသပ်ပါ။',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Printer setup could not be saved. Test the printer again.',
            'ပရင်တာဆက်တင်ကို သိမ်းမရပါ။ ပရင်တာကို ထပ်စမ်းပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final myanmar = widget.myanmar;
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(myanmar, 'Receipt printer', 'ပြေစာပရင်တာ')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    shopCopy(
                      myanmar,
                      'Find it automatically',
                      'အလိုအလျောက်ရှာပါ',
                    ),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    shopCopy(
                      myanmar,
                      'Search is limited to this private Wi-Fi network and ESC/POS port 9100. Nothing is scanned until you tap Find printers.',
                      'ဤသီးသန့် Wi-Fi network နှင့် ESC/POS port 9100 ကိုသာ ရှာဖွေမည်။ ပရင်တာရှာရန်ကို နှိပ်မှသာ စတင်မည်။',
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    shopCopy(myanmar, 'Receipt paper', 'ပြေစာစက္ကူအကျယ်'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<ReceiptPaperWidth>(
                    segments: const [
                      ButtonSegment(
                        value: ReceiptPaperWidth.mm58,
                        label: Text('58 mm'),
                      ),
                      ButtonSegment(
                        value: ReceiptPaperWidth.mm80,
                        label: Text('80 mm'),
                      ),
                    ],
                    selected: {_paperWidth},
                    onSelectionChanged: _busy || _loadingSettings
                        ? null
                        : (selected) {
                            if (selected.first == _paperWidth) return;
                            _settings.requireRetest();
                            setState(() {
                              _paperWidth = selected.first;
                              _testedHost = null;
                              _testedWidth = null;
                              _savedHost = null;
                              _message = shopCopy(
                                myanmar,
                                'Paper width changed. Test the printer again before printing a sale.',
                                'စက္ကူအကျယ်ပြောင်းပြီးပါပြီ။ အရောင်းပြေစာမထုတ်မီ ပရင်တာကို ပြန်စမ်းပါ။',
                              );
                            });
                          },
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: _busy || _loadingSettings ? null : _findPrinters,
                    icon: const Icon(Icons.wifi_find),
                    label: Text(
                      shopCopy(myanmar, 'Find printers', 'ပရင်တာရှာရန်'),
                    ),
                  ),
                  if (_previousHost != null && _savedHost == null) ...[
                    const SizedBox(height: 8),
                    Text(
                      shopCopy(
                        myanmar,
                        'Previous printer: $_previousHost · find and test again.',
                        'ယခင်ပရင်တာ: $_previousHost · ပြန်ရှာပြီး စမ်းသပ်ပါ။',
                      ),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  if (_busy) ...[
                    const SizedBox(height: 12),
                    const LinearProgressIndicator(),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => setState(() => _cancelled = true),
                        child: Text(
                          shopCopy(myanmar, 'Cancel search', 'ရှာဖွေမှုရပ်ရန်'),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_message != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(_message!),
              ),
            ),
          ],
          if (_printers.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              shopCopy(myanmar, 'Printers found', 'တွေ့ရှိသောပရင်တာများ'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            for (final printer in _printers)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: const Icon(Icons.print_outlined),
                  title: Text(printer.label),
                  subtitle: Text(
                    shopCopy(
                      myanmar,
                      'Candidate only · port ${printer.port}',
                      'စမ်းသပ်ရန်သာ · port ${printer.port}',
                    ),
                  ),
                  trailing: FilledButton(
                    onPressed: _busy
                        ? null
                        : _savedHost == printer.host
                        ? null
                        : _testedHost == printer.host
                        ? () => _useForReceipts(printer)
                        : () => _sendTest(printer),
                    child: Text(
                      shopCopy(
                        myanmar,
                        _savedHost == printer.host
                            ? 'In use'
                            : _testedHost == printer.host
                            ? 'Use for receipts'
                            : 'Test',
                        _savedHost == printer.host
                            ? 'အသုံးပြုနေသည်'
                            : _testedHost == printer.host
                            ? 'ပြေစာတွင် သုံးရန်'
                            : 'စမ်းသပ်ရန်',
                      ),
                    ),
                  ),
                ),
              ),
          ],
          if (_scannedIp != null && _scannedMask != null)
            Text(
              shopCopy(
                myanmar,
                'Wi-Fi range searched: ${_scannedIp!} / ${_scannedMask!}',
                'ရှာဖွေထားသော Wi-Fi: ${_scannedIp!} / ${_scannedMask!}',
              ),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 12),
          Text(
            shopCopy(
              myanmar,
              'Check the test receipt by hand. A successful network connection cannot confirm that paper printed.',
              'စမ်းသပ်ပြေစာကို ကိုယ်တိုင်စစ်ဆေးပါ။ Network ချိတ်ဆက်မှုအောင်မြင်ခြင်းက စက္ကူထွက်လာကြောင်း အတည်မပြုနိုင်ပါ။',
            ),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
