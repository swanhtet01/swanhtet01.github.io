import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'shop_copy.dart';
import 'shop_correction_authorization_service.dart';
import 'shop_database.dart';

typedef ShopCashMovementIdFactory = String Function();

Future<ShopCashMovement?> showShopCashMovementDialog({
  required BuildContext context,
  required ShopDatabase database,
  required ShopCashShift shift,
  required ShopManagedWorkspaceBinding workspaceBinding,
  required ShopCorrectionAuthorizer authorizer,
  required String kind,
  required bool myanmar,
  ShopCashMovementIdFactory? idFactory,
}) {
  if (!const {'cash_in', 'cash_out'}.contains(kind)) {
    throw ArgumentError.value(kind, 'kind');
  }
  return showDialog<ShopCashMovement>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ShopCashMovementDialog(
      database: database,
      shift: shift,
      workspaceBinding: workspaceBinding,
      authorizer: authorizer,
      kind: kind,
      myanmar: myanmar,
      idFactory: idFactory ?? _newCashMovementId,
    ),
  );
}

String _newCashMovementId() => const Uuid().v4();

class _ShopCashMovementDialog extends StatefulWidget {
  const _ShopCashMovementDialog({
    required this.database,
    required this.shift,
    required this.workspaceBinding,
    required this.authorizer,
    required this.kind,
    required this.myanmar,
    required this.idFactory,
  });

  final ShopDatabase database;
  final ShopCashShift shift;
  final ShopManagedWorkspaceBinding workspaceBinding;
  final ShopCorrectionAuthorizer authorizer;
  final String kind;
  final bool myanmar;
  final ShopCashMovementIdFactory idFactory;

  @override
  State<_ShopCashMovementDialog> createState() =>
      _ShopCashMovementDialogState();
}

class _ShopCashMovementDialogState extends State<_ShopCashMovementDialog> {
  final _amount = TextEditingController();
  late String _reason = _reasons.first;
  late String _operationId = widget.idFactory();
  late String _authorizationRequestId = widget.idFactory();
  ShopCashMovementCommand? _command;
  String? _error;
  bool _busy = false;

  List<String> get _reasons => widget.kind == 'cash_in'
      ? const ['float_top_up', 'other']
      : const [
          'petty_cash_expense',
          'supplier_payment',
          'bank_deposit',
          'other',
        ];

  String _copy(String english, String burmese) =>
      shopCopy(widget.myanmar, english, burmese);

  String get _kindLabel => widget.kind == 'cash_in'
      ? _copy('Cash in', 'ငွေသားအဝင်')
      : _copy('Cash out', 'ငွေသားအထွက်');

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _review() async {
    if (_busy) return;
    final amount = parseShopMmkInput(_amount.text);
    if (amount == null || amount <= 0 || amount > shopMaximumMmk) {
      setState(
        () => _error = _copy(
          'Enter a valid whole MMK amount.',
          'ကျပ်ငွေပမာဏအပြည့်အစုံကို မှန်ကန်စွာ ဖြည့်ပါ။',
        ),
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final command = await widget.database.prepareCashMovementCommand(
        operationId: _operationId,
        shiftId: widget.shift.id,
        kind: widget.kind,
        amountMmk: amount,
        reason: _reason,
      );
      if (mounted) setState(() => _command = command);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = _copy(
            'This drawer movement could not be reviewed. Nothing was changed.',
            'ဤအံဆွဲငွေအဝင်အထွက်ကို စစ်ဆေး၍မရပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _edit() {
    setState(() {
      _command = null;
      _operationId = widget.idFactory();
      _authorizationRequestId = widget.idFactory();
      _error = null;
    });
  }

  Future<void> _authorizeAndRecord() async {
    if (_busy || _command == null) return;
    final command = _command!;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.authorizer.authorize(
        authorizationRequestId: _authorizationRequestId,
        workspaceId: widget.workspaceBinding.workspaceId,
        capability: shopCashMovementCapability,
        commandDigest: command.commandDigest,
        requestFingerprint: command.requestFingerprint,
      );
      final movement = await widget.database.recordCashMovement(
        command: command,
        authorization: result.authorization,
      );
      if (mounted) Navigator.of(context).pop(movement);
    } on ShopCorrectionAuthorizationException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = _authorizationError(error.code);
        if (error.code == 'authorization_expired') {
          _authorizationRequestId = widget.idFactory();
        }
      });
    } on StateError catch (error) {
      if (!mounted) return;
      setState(() => _error = _databaseError(error));
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _error = _copy(
          'Authorization could not be completed. Nothing was changed; retry this same review.',
          'ခွင့်ပြုချက်ကို အပြီးသတ်၍မရပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။ ယခုစစ်ဆေးချက်အတိုင်း ထပ်ကြိုးစားပါ။',
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _authorizationError(String code) => switch (code) {
    'sign_in_required' => _copy(
      'Sign in again before requesting owner authorization.',
      'ပိုင်ရှင်ခွင့်ပြုချက် မတောင်းမီ အကောင့်ကို ပြန်ဝင်ပါ။',
    ),
    'owner_authorization_required' => _copy(
      'This drawer movement requires authorization from the workspace owner.',
      'ဤအံဆွဲငွေအဝင်အထွက်ကို လုပ်ငန်းနေရာပိုင်ရှင်က ခွင့်ပြုရန် လိုအပ်ပါသည်။',
    ),
    'authorization_expired' => _copy(
      'The authorization expired. Review the amount and request a new one.',
      'ခွင့်ပြုချိန် ကုန်သွားပါသည်။ ငွေပမာဏကို ပြန်စစ်ပြီး ခွင့်ပြုချက်အသစ် တောင်းပါ။',
    ),
    'session_changed' => _copy(
      'The signed-in account changed. Close this review and start again.',
      'အကောင့်ပြောင်းသွားပါသည်။ ဤစစ်ဆေးချက်ကိုပိတ်ပြီး ပြန်စပါ။',
    ),
    'authorization_conflict' => _copy(
      'This request conflicts with an earlier request. Close it and start again.',
      'ဤတောင်းဆိုမှုသည် အစောပိုင်းတောင်းဆိုမှုနှင့် မကိုက်ညီပါ။ ပိတ်ပြီး ပြန်စပါ။',
    ),
    _ => _copy(
      'Online owner authorization is unavailable. Nothing was changed.',
      'အွန်လိုင်းပိုင်ရှင်ခွင့်ပြုချက် မရနိုင်ပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
    ),
  };

  String _databaseError(Object error) {
    final text = error.toString().toLowerCase();
    if (text.contains('shift changed')) {
      return _copy(
        'The cash shift changed. Close this review and check the shift again.',
        'ငွေသားတာဝန်ချိန် ပြောင်းသွားပါသည်။ ဤစစ်ဆေးချက်ကိုပိတ်ပြီး တာဝန်ချိန်ကို ပြန်စစ်ပါ။',
      );
    }
    if (text.contains('exceeds')) {
      return _copy(
        'Cash out is greater than the recorded drawer cash.',
        'ငွေသားအထွက်သည် အံဆွဲရှိ မှတ်တမ်းတင်ထားသောငွေထက် များနေပါသည်။',
      );
    }
    return _copy(
      'This drawer movement could not be recorded safely. Nothing was changed.',
      'ဤအံဆွဲငွေအဝင်အထွက်ကို လုံခြုံစွာ မှတ်တမ်းတင်၍မရပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
    );
  }

  String _reasonLabel(String reason) => switch (reason) {
    'float_top_up' => _copy('Float top-up', 'စတင်ငွေ ထပ်ဖြည့်ခြင်း'),
    'petty_cash_expense' => _copy('Petty cash expense', 'အသေးစားအသုံးစရိတ်'),
    'supplier_payment' => _copy('Supplier payment', 'ပေးသွင်းသူငွေပေးချေမှု'),
    'bank_deposit' => _copy('Bank deposit', 'ဘဏ်အပ်ငွေ'),
    _ => _copy('Other', 'အခြား'),
  };

  @override
  Widget build(BuildContext context) {
    final command = _command;
    return AlertDialog(
      title: Text(
        command == null
            ? _kindLabel
            : _copy('Review $_kindLabel', '$_kindLabel ပြန်စစ်ရန်'),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              Semantics(
                liveRegion: true,
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (command == null) ...[
              TextField(
                key: const ValueKey('shop-cash-movement-amount'),
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: _copy('Amount', 'ငွေပမာဏ'),
                  suffixText: widget.myanmar ? 'ကျပ်' : 'MMK',
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                key: const ValueKey('shop-cash-movement-reason'),
                initialValue: _reason,
                decoration: InputDecoration(
                  labelText: _copy('Reason', 'အကြောင်းရင်း'),
                ),
                items: [
                  for (final reason in _reasons)
                    DropdownMenuItem(
                      value: reason,
                      child: Text(_reasonLabel(reason)),
                    ),
                ],
                onChanged: _busy
                    ? null
                    : (value) {
                        if (value != null) setState(() => _reason = value);
                      },
              ),
              const SizedBox(height: 12),
              Text(
                _copy(
                  'The workspace owner must authorize this exact amount and reason online.',
                  'ဤငွေပမာဏနှင့် အကြောင်းရင်းအတိအကျကို လုပ်ငန်းနေရာပိုင်ရှင်က အွန်လိုင်းမှ ခွင့်ပြုရမည်။',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ] else ...[
              Text(_kindLabel, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Text(shopMmk(command.amountMmk, myanmar: widget.myanmar)),
              const SizedBox(height: 8),
              Text(_reasonLabel(command.reason)),
              const SizedBox(height: 16),
              Text(
                _copy(
                  'Authorizing records one immutable drawer movement. A retry reuses this same review.',
                  'ခွင့်ပြုပါက ပြင်၍မရသော အံဆွဲငွေအဝင်အထွက်မှတ်တမ်းတစ်ခု သိမ်းမည်။ ထပ်ကြိုးစားပါက ယခုစစ်ဆေးချက်အတိုင်း ပြန်သုံးမည်။',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy
              ? null
              : command == null
              ? () => Navigator.of(context).pop()
              : _edit,
          child: Text(
            command == null
                ? _copy('Cancel', 'မလုပ်တော့ပါ')
                : _copy('Back', 'နောက်သို့'),
          ),
        ),
        FilledButton(
          key: ValueKey(
            command == null
                ? 'shop-cash-movement-review'
                : 'shop-cash-movement-authorize',
          ),
          onPressed: _busy
              ? null
              : command == null
              ? _review
              : _authorizeAndRecord,
          child: Text(
            command == null
                ? _copy('Review', 'ပြန်စစ်မည်')
                : _copy('Authorize and record', 'ခွင့်ပြုပြီး မှတ်တမ်းတင်မည်'),
          ),
        ),
      ],
    );
  }
}
