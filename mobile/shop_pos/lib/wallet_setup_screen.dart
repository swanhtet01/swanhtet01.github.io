import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_models.dart';

class WalletSetupScreen extends StatefulWidget {
  const WalletSetupScreen({
    required this.database,
    required this.myanmar,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;

  @override
  State<WalletSetupScreen> createState() => _WalletSetupScreenState();
}

class _WalletSetupScreenState extends State<WalletSetupScreen> {
  String? _expandedProvider;

  @override
  Widget build(BuildContext context) {
    final myanmar = widget.myanmar;
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(myanmar, 'Mobile money', 'မိုဘိုင်းငွေပေးချေမှု')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
            child: Text(
              shopCopy(
                myanmar,
                'Choose a wallet to add its merchant QR.',
                'ဆိုင်ငွေလက်ခံ QR ထည့်ရန် ငွေပေးချေမှုအကောင့်ကို ရွေးပါ။',
              ),
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
          _WalletEditor(
            database: widget.database,
            provider: 'KBZPay',
            myanmar: myanmar,
            expanded: _expandedProvider == 'KBZPay',
            onToggle: () => setState(() {
              _expandedProvider = _expandedProvider == 'KBZPay'
                  ? null
                  : 'KBZPay';
            }),
          ),
          const SizedBox(height: 8),
          _WalletEditor(
            database: widget.database,
            provider: 'WavePay',
            myanmar: myanmar,
            expanded: _expandedProvider == 'WavePay',
            onToggle: () => setState(() {
              _expandedProvider = _expandedProvider == 'WavePay'
                  ? null
                  : 'WavePay';
            }),
          ),
        ],
      ),
    );
  }
}

class _WalletEditor extends StatefulWidget {
  const _WalletEditor({
    required this.database,
    required this.provider,
    required this.myanmar,
    required this.expanded,
    required this.onToggle,
  });

  final ShopDatabase database;
  final String provider;
  final bool myanmar;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  State<_WalletEditor> createState() => _WalletEditorState();
}

class _WalletEditorState extends State<_WalletEditor> {
  late final TextEditingController _phone = TextEditingController();
  late final TextEditingController _payload = TextEditingController();
  bool _issuerConfirmed = false;
  bool _busy = true;
  bool _loaded = false;
  bool _dirty = false;
  String? _savedPayload;
  bool _savedIssuerConfirmed = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _phone.dispose();
    _payload.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final profiles = await widget.database.readWalletSetups();
    final profile = profiles.where((item) => item.provider == widget.provider);
    if (!mounted) return;
    if (profile.isNotEmpty) {
      _phone.text = profile.first.merchantPhone ?? '';
      _payload.text = profile.first.officialQrPayload ?? '';
      _issuerConfirmed = profile.first.issuerConfirmed;
      _savedPayload = profile.first.officialQrPayload;
      _savedIssuerConfirmed = profile.first.issuerConfirmed;
    }
    setState(() {
      _busy = false;
      _loaded = true;
    });
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.database.saveWalletSetup(
        MerchantWalletSetup(
          provider: widget.provider,
          merchantPhone: _phone.text,
          officialQrPayload: _payload.text,
          issuerConfirmed: _issuerConfirmed,
        ),
      );
      if (mounted) {
        setState(() {
          _savedPayload = _payload.text;
          _savedIssuerConfirmed = _issuerConfirmed;
          _dirty = false;
          _message = shopCopy(
            widget.myanmar,
            'Saved on this device.',
            'ဤစက်တွင် သိမ်းပြီးပါပြီ။',
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Could not save. Use a valid static Myanmar MMQR payload and confirm it matches this wallet.',
            'မသိမ်းနိုင်ပါ။ အသုံးပြုနိုင်သော ပုံသေ မြန်မာ MMQR အချက်အလက်ကို ထည့်ပြီး ဤငွေလက်ခံအကောင့်နှင့် ကိုက်ညီကြောင်း အတည်ပြုပါ။',
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
    final String status;
    if (!_loaded) {
      status = shopCopy(myanmar, 'Loading setup…', 'ပြင်ဆင်မှုကို ဖွင့်နေသည်…');
    } else if (_dirty) {
      status = shopCopy(
        myanmar,
        'Unsaved changes',
        'မသိမ်းရသေးသော ပြင်ဆင်ချက်များ',
      );
    } else if (qrPayloadForDisplay(
          _savedPayload,
          confirmedAsProviderIssued: _savedIssuerConfirmed,
        ) !=
        null) {
      status = shopCopy(
        myanmar,
        'Ready to show QR',
        'QR ပြသရန် အသင့်ဖြစ်ပြီ',
      );
    } else if ((_savedPayload ?? '').trim().isNotEmpty) {
      status = shopCopy(
        myanmar,
        'Saved · confirm merchant QR',
        'သိမ်းပြီး · ဆိုင် QR ကို အတည်ပြုရန် လိုသည်',
      );
    } else {
      status = shopCopy(
        myanmar,
        'No merchant QR saved',
        'ဆိုင် QR မသိမ်းရသေး',
      );
    }
    final qrPayload = qrPayloadForDisplay(
      _payload.text,
      confirmedAsProviderIssued: _issuerConfirmed,
    );
    final qrLabel = shopCopy(
      myanmar,
      '${widget.provider} merchant QR',
      '${widget.provider} ဆိုင်ငွေလက်ခံ QR',
    );
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            button: true,
            label: '${widget.provider}, $status',
            hint: shopCopy(
              myanmar,
              widget.expanded ? 'Close setup' : 'Open setup',
              widget.expanded ? 'ပြင်ဆင်မှု ပိတ်ရန်' : 'ပြင်ဆင်မှု ဖွင့်ရန်',
            ),
            onTap: widget.onToggle,
            child: ExcludeSemantics(
              child: ListTile(
                key: ValueKey('wallet-provider-${widget.provider}'),
                title: Text(widget.provider),
                subtitle: Text(status),
                trailing: Icon(
                  widget.expanded
                      ? Icons.keyboard_arrow_up
                      : Icons.chevron_right,
                ),
                onTap: widget.onToggle,
              ),
            ),
          ),
          if (widget.expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    shopCopy(
                      myanmar,
                      'Use this wallet provider’s merchant QR. A phone number cannot create a payment QR.',
                      'ဝန်ဆောင်မှုပေးသူ၏ ဆိုင် QR ကို ထည့်ပါ။ ဖုန်းနံပါတ်ဖြင့် ငွေပေးချေမှု QR မဖန်တီးနိုင်ပါ။',
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    shopCopy(
                      myanmar,
                      'Merchant number (optional)',
                      'ဆိုင်ရှင်ဖုန်းနံပါတ် (မထည့်လည်းရ)',
                    ),
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    key: ValueKey('wallet-phone-${widget.provider}'),
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      hintText: shopCopy(
                        myanmar,
                        'Phone number',
                        'ဖုန်းနံပါတ်',
                      ),
                    ),
                    onChanged: (_) => setState(() {
                      // A merchant-number change may point at a different account.
                      _issuerConfirmed = false;
                      _dirty = true;
                      _message = null;
                    }),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    shopCopy(
                      myanmar,
                      'Provider-issued static MMQR data',
                      'ဝန်ဆောင်မှုပေးသူ ထုတ်ပေးသော ပုံသေ MMQR အချက်အလက်',
                    ),
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    key: ValueKey('wallet-payload-${widget.provider}'),
                    controller: _payload,
                    maxLines: 3,
                    maxLength: 512,
                    decoration: InputDecoration(
                      hintText: shopCopy(
                        myanmar,
                        'Paste QR data',
                        'QR အချက်အလက် ထည့်ရန်',
                      ),
                    ),
                    onChanged: (_) => setState(() {
                      // The operator's confirmation applies only to the exact QR
                      // payload they reviewed. Editing it invalidates that check.
                      _issuerConfirmed = false;
                      _dirty = true;
                      _message = null;
                    }),
                  ),
                  Text(
                    shopCopy(
                      myanmar,
                      'Paste the exact data from the merchant QR. Do not enter a phone number or invented wallet link.',
                      'ဆိုင်အတွက် ထုတ်ပေးထားသော QR မှ အချက်အလက်အတိအကျကို ကူးထည့်ပါ။ ဖုန်းနံပါတ် သို့မဟုတ် ကိုယ်တိုင်ဖန်တီးထားသောလင့်ခ် မထည့်ပါနှင့်။',
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _issuerConfirmed,
                    onChanged: (value) => setState(() {
                      _issuerConfirmed = value ?? false;
                      _dirty = true;
                      _message = null;
                    }),
                    title: Text(
                      shopCopy(
                        myanmar,
                        'I checked this static MMQR against the merchant QR issued for this wallet.',
                        'ဤပုံသေ MMQR ကို ဤငွေလက်ခံအကောင့်အတွက် ထုတ်ပေးထားသော ဆိုင် QR နှင့် တိုက်စစ်ပြီးပါပြီ။',
                      ),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  if (_payload.text.trim().isNotEmpty &&
                      _issuerConfirmed &&
                      qrPayload == null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        shopCopy(
                          myanmar,
                          'This is not a valid static Myanmar MMQR payload. Copy the exact merchant QR data from your wallet provider.',
                          'ဤအချက်အလက်သည် အသုံးပြုနိုင်သော ပုံသေ မြန်မာ MMQR မဟုတ်ပါ။ ငွေပေးချေမှုဝန်ဆောင်မှုပေးသူမှ ထုတ်ပေးထားသော ဆိုင် QR အချက်အလက်အတိအကျကို ကူးယူပါ။',
                        ),
                        style: TextStyle(color: Theme.of(context).colorScheme.error),
                      ),
                    ),
                  if (qrPayload != null)
                    Center(
                      child: Semantics(
                        container: true,
                        excludeSemantics: true,
                        image: true,
                        label: qrLabel,
                        child: QrImageView(
                          data: qrPayload,
                          size: 210,
                          semanticsLabel: qrLabel,
                        ),
                      ),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    shopCopy(
                      myanmar,
                      'The cashier confirms each payment before completing the sale.',
                      'အရောင်းမပြီးစီးမီ ငွေလက်ခံရရှိမှုကို ငွေကိုင်က အတည်ပြုရမည်။',
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  ExpansionTile(
                    key: ValueKey('wallet-safety-${widget.provider}'),
                    tilePadding: EdgeInsets.zero,
                    childrenPadding: const EdgeInsets.only(bottom: 8),
                    title: Text(
                      shopCopy(
                        myanmar,
                        'Why check this QR?',
                        'ဤ QR ကို ဘာကြောင့် စစ်ဆေးရသနည်း။',
                      ),
                    ),
                    children: [
                      Text(
                        shopCopy(
                          myanmar,
                          'The app checks MMQR structure and checksum, but cannot verify the issuer. Compare the merchant name in the wallet app. Displaying or scanning this QR does not mark a sale paid.',
                          'အက်ပ်သည် MMQR ၏ ဖွဲ့စည်းပုံနှင့် စစ်ဆေးဂဏန်းကို စစ်ဆေးသော်လည်း ထုတ်ပေးသူကို မအတည်ပြုနိုင်ပါ။ ငွေပေးချေမှုအက်ပ်တွင် ဆိုင်အမည်ကို တိုက်စစ်ပါ။ ဤ QR ကို ပြသခြင်း သို့မဟုတ် ဖတ်ခြင်းဖြင့် အရောင်းကို ငွေချေပြီးဟု မမှတ်ပါ။',
                        ),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                  if (_message != null) ...[
                    const SizedBox(height: 8),
                    Text(_message!),
                  ],
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _busy ? null : _save,
                      child: Text(
                        shopCopy(
                          myanmar,
                          'Save payment setup',
                          'ငွေပေးချေမှုကို သိမ်းရန်',
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
