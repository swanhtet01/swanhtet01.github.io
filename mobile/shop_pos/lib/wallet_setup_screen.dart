import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_models.dart';

class WalletSetupScreen extends StatelessWidget {
  const WalletSetupScreen({
    required this.database,
    required this.myanmar,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(myanmar, 'Mobile money', 'မိုဘိုင်းငွေပေးချေမှု')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                shopCopy(
                  myanmar,
                  'Use a QR issued by your payment provider. A phone number alone is not a payment QR. The cashier still confirms each payment.',
                  'ငွေပေးချေမှုဝန်ဆောင်မှုပေးသူမှ ထုတ်ပေးသော QR ကို အသုံးပြုပါ။ ဖုန်းနံပါတ်တစ်ခုတည်းသည် payment QR မဟုတ်ပါ။ ငွေလက်ခံရရှိမှုကို ဆိုင်ရှင်က အတည်ပြုရမည်။',
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _WalletEditor(
            database: database,
            provider: 'KBZPay',
            myanmar: myanmar,
          ),
          const SizedBox(height: 12),
          _WalletEditor(
            database: database,
            provider: 'WavePay',
            myanmar: myanmar,
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
  });

  final ShopDatabase database;
  final String provider;
  final bool myanmar;

  @override
  State<_WalletEditor> createState() => _WalletEditorState();
}

class _WalletEditorState extends State<_WalletEditor> {
  late final TextEditingController _phone = TextEditingController();
  late final TextEditingController _payload = TextEditingController();
  bool _issuerConfirmed = false;
  bool _busy = true;
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
    }
    setState(() => _busy = false);
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
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Saved on this device.',
            'ဤစက်တွင် သိမ်းပြီးပါပြီ။',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Could not save. Use a valid static Myanmar MMQR payload and confirm it matches this wallet.',
            'မသိမ်းနိုင်ပါ။ Myanmar MMQR static payload အမှန်ကိုထည့်ပြီး ဤ wallet နှင့်ကိုက်ညီကြောင်း အတည်ပြုပါ။',
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
    final qrPayload = qrPayloadForDisplay(
      _payload.text,
      confirmedAsProviderIssued: _issuerConfirmed,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.provider,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            TextField(
              key: ValueKey('wallet-phone-${widget.provider}'),
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: shopCopy(
                  myanmar,
                  'Merchant number',
                  'ဆိုင်ရှင်ဖုန်းနံပါတ်',
                ),
              ),
              onChanged: (_) => setState(() {
                // A merchant-number change may point at a different account.
                _issuerConfirmed = false;
              }),
            ),
            const SizedBox(height: 10),
            TextField(
              key: ValueKey('wallet-payload-${widget.provider}'),
              controller: _payload,
              maxLines: 3,
              maxLength: 512,
              decoration: InputDecoration(
                labelText: shopCopy(
                  myanmar,
                  'Provider-issued QR payload',
                  'ဝန်ဆောင်မှုပေးသူထုတ်ပေးသော QR payload',
                ),
                helperText: shopCopy(
                  myanmar,
                  'Paste the exact payload from the merchant QR. Do not enter a phone number or invented wallet link.',
                  'Merchant QR မှ payload အတိအကျကို ကူးထည့်ပါ။ ဖုန်းနံပါတ် သို့မဟုတ် ကိုယ်တိုင်ဖန်တီးထားသော wallet link မထည့်ပါနှင့်။',
                ),
              ),
              onChanged: (_) => setState(() {
                // The operator's confirmation applies only to the exact QR
                // payload they reviewed. Editing it invalidates that check.
                _issuerConfirmed = false;
              }),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _issuerConfirmed,
              onChanged: (value) =>
                  setState(() => _issuerConfirmed = value ?? false),
              title: Text(
                shopCopy(
                  myanmar,
                  'I checked this static MMQR against the merchant QR issued for this wallet.',
                  'ဤ static MMQR ကို ဤ wallet အတွက် ထုတ်ပေးထားသော ဆိုင် QR နှင့် တိုက်စစ်ပြီးပါပြီ။',
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
                    'ဤအချက်အလက်သည် static Myanmar MMQR အမှန်မဟုတ်ပါ။ Wallet provider မှ ဆိုင် QR အချက်အလက်အတိအကျကို ကူးယူပါ။',
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
                  label: '${widget.provider} merchant QR',
                  child: QrImageView(
                    data: qrPayload,
                    size: 210,
                    semanticsLabel: '${widget.provider} merchant QR',
                  ),
                ),
              ),
            if (_message != null) ...[
              const SizedBox(height: 8),
              Text(_message!),
            ],
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy ? null : _save,
              child: Text(
                shopCopy(
                  myanmar,
                  'Save payment setup',
                  'ငွေပေးချေမှုကို သိမ်းရန်',
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              shopCopy(
                myanmar,
                'The app checks MMQR structure and checksum, not who issued it. Verify the merchant name in the wallet app. A scan never marks an order paid.',
                'App သည် MMQR ပုံစံနှင့် checksum ကိုသာ စစ်ဆေးပြီး ထုတ်ပေးသူကို မစစ်ဆေးပါ။ Wallet app တွင် ဆိုင်အမည်ကို စစ်ပါ။ Scan လုပ်ရုံဖြင့် order paid မဖြစ်ပါ။',
              ),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
