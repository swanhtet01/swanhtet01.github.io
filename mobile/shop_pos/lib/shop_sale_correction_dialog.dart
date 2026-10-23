import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'shop_copy.dart';
import 'shop_correction_authorization_service.dart';
import 'shop_database.dart';

enum ShopSaleCorrectionResult { corrected, alreadyReversed }

typedef ShopCorrectionIdFactory = String Function();

Future<ShopSaleCorrectionResult?> showShopSaleCorrectionDialog({
  required BuildContext context,
  required ShopDatabase database,
  required ShopSaleReceipt sale,
  required ShopManagedWorkspaceBinding workspaceBinding,
  required ShopCorrectionAuthorizer authorizer,
  required bool myanmar,
  ShopCorrectionIdFactory? idFactory,
}) => showDialog<ShopSaleCorrectionResult>(
  context: context,
  barrierDismissible: false,
  builder: (_) => _ShopSaleCorrectionDialog(
    database: database,
    sale: sale,
    workspaceBinding: workspaceBinding,
    authorizer: authorizer,
    myanmar: myanmar,
    idFactory: idFactory ?? _newCorrectionId,
  ),
);

String _newCorrectionId() => const Uuid().v4();

class _ShopSaleCorrectionDialog extends StatefulWidget {
  const _ShopSaleCorrectionDialog({
    required this.database,
    required this.sale,
    required this.workspaceBinding,
    required this.authorizer,
    required this.myanmar,
    required this.idFactory,
  });

  final ShopDatabase database;
  final ShopSaleReceipt sale;
  final ShopManagedWorkspaceBinding workspaceBinding;
  final ShopCorrectionAuthorizer authorizer;
  final bool myanmar;
  final ShopCorrectionIdFactory idFactory;

  @override
  State<_ShopSaleCorrectionDialog> createState() =>
      _ShopSaleCorrectionDialogState();
}

class _ShopSaleCorrectionDialogState extends State<_ShopSaleCorrectionDialog> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  bool? _restockItems;
  bool _cashReturned = false;
  bool _reviewing = false;
  bool _busy = false;
  String? _error;
  ShopFullSaleReversalCommand? _command;
  String? _authorizationRequestId;

  bool get _isCash => widget.sale.paymentMethod == 'cash';

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  String _copy(String english, String myanmar) =>
      shopCopy(widget.myanmar, english, myanmar);

  Future<void> _prepareReview() async {
    if (_busy) return;
    setState(() => _error = null);
    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid) return;
    if (_restockItems == null) {
      setState(
        () => _error = _copy(
          'Choose whether every original item returns to stock.',
          'မူလပစ္စည်းအားလုံးကို လက်ကျန်ထဲ ပြန်ထည့်မည် မထည့်မည်ကို ရွေးပါ။',
        ),
      );
      return;
    }
    if (_isCash && !_cashReturned) {
      setState(
        () => _error = _copy(
          'Confirm that the full cash amount was returned before continuing.',
          'ဆက်မလုပ်မီ ငွေသားအပြည့် ပြန်ပေးပြီးကြောင်း အတည်ပြုပါ။',
        ),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final command = await widget.database.previewFullSaleReversal(
        operationId: widget.idFactory(),
        saleId: widget.sale.id,
        restockItems: _restockItems!,
        reason: _reasonController.text.trim(),
        confirmCashReturned: _isCash,
      );
      if (!mounted) return;
      setState(() {
        _command = command;
        _authorizationRequestId = widget.idFactory();
        _reviewing = true;
      });
    } on StateError catch (error) {
      if (!mounted) return;
      if (_alreadyReversed(error)) {
        Navigator.of(context).pop(ShopSaleCorrectionResult.alreadyReversed);
        return;
      }
      setState(() => _error = _databaseError(error));
    } on ArgumentError catch (error) {
      if (mounted) setState(() => _error = _databaseError(error));
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = _copy(
            'The correction could not be reviewed. Nothing was changed.',
            'ပြင်ဆင်မှုကို စစ်ဆေး၍မရပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _authorizeAndCorrect() async {
    if (_busy) return;
    final command = _command;
    final requestId = _authorizationRequestId;
    if (command == null || requestId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.authorizer.authorize(
        authorizationRequestId: requestId,
        workspaceId: widget.workspaceBinding.workspaceId,
        capability: shopFullSaleReversalCapability,
        commandDigest: command.commandDigest,
        requestFingerprint: command.requestFingerprint,
      );
      await widget.database.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: result.authorization,
      );
      if (!mounted) return;
      Navigator.of(context).pop(ShopSaleCorrectionResult.corrected);
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
      if (_alreadyReversed(error)) {
        Navigator.of(context).pop(ShopSaleCorrectionResult.alreadyReversed);
        return;
      }
      setState(() => _error = _databaseError(error));
    } on ArgumentError catch (error) {
      if (mounted) setState(() => _error = _databaseError(error));
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = _copy(
            'Authorization could not be completed. Nothing was changed; try again with the same review.',
            'ခွင့်ပြုချက်ကို အပြီးသတ်၍မရပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။ ယခုစစ်ဆေးချက်အတိုင်း ထပ်ကြိုးစားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _alreadyReversed(Object error) =>
      error.toString().toLowerCase().contains('already reversed');

  String _databaseError(Object error) {
    final text = error.toString().toLowerCase();
    if (text.contains('cash shift')) {
      return _copy(
        'Open the correct cash shift before reviewing this cash return.',
        'ဤငွေသားပြန်ပေးမှုကို မစစ်ဆေးမီ သက်ဆိုင်ရာ ငွေသားအလှည့်ကို ဖွင့်ပါ။',
      );
    }
    if (text.contains('original sale changed')) {
      return _copy(
        'The original sale changed. Close this review and open the sale again.',
        'မူလအရောင်းမှတ်တမ်း ပြောင်းသွားပါသည်။ ဤစစ်ဆေးချက်ကိုပိတ်ပြီး အရောင်းကို ပြန်ဖွင့်ပါ။',
      );
    }
    if (text.contains('authorization') || text.contains('workspace')) {
      return _copy(
        'The owner authorization does not match this Shop workspace. Nothing was changed.',
        'ပိုင်ရှင်ခွင့်ပြုချက်သည် ဤဆိုင်လုပ်ငန်းနေရာနှင့် မကိုက်ညီပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
      );
    }
    return _copy(
      'The correction could not be recorded safely. Nothing was changed.',
      'ပြင်ဆင်မှုကို လုံခြုံစွာ မှတ်တမ်းတင်၍မရပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။',
    );
  }

  String _authorizationError(String code) => switch (code) {
    'sign_in_required' => _copy(
      'Sign in again before requesting owner authorization.',
      'ပိုင်ရှင်ခွင့်ပြုချက် မတောင်းမီ အကောင့်ကို ပြန်ဝင်ပါ။',
    ),
    'owner_authorization_required' => _copy(
      'This correction requires authorization from the workspace owner.',
      'ဤပြင်ဆင်မှုကို လုပ်ငန်းနေရာပိုင်ရှင်က ခွင့်ပြုရန် လိုအပ်ပါသည်။',
    ),
    'authorization_expired' => _copy(
      'The authorization expired. Check this review and request a new one.',
      'ခွင့်ပြုချိန် ကုန်သွားပါသည်။ စစ်ဆေးချက်ကို ပြန်ကြည့်ပြီး ခွင့်ပြုချက်အသစ် တောင်းပါ။',
    ),
    'session_changed' => _copy(
      'The signed-in account changed. Close this review and start again.',
      'အကောင့်ပြောင်းသွားပါသည်။ ဤစစ်ဆေးချက်ကိုပိတ်ပြီး ပြန်စပါ။',
    ),
    'authorization_conflict' => _copy(
      'This authorization request conflicts with an earlier request. Close this review and start again.',
      'ဤခွင့်ပြုချက်တောင်းဆိုမှုသည် အစောပိုင်းတောင်းဆိုမှုနှင့် မကိုက်ညီပါ။ ဤစစ်ဆေးချက်ကိုပိတ်ပြီး ပြန်စပါ။',
    ),
    'authorization_unavailable' ||
    'authorization_window_closed' ||
    'endpoint_unavailable' => _copy(
      'Online workspace-owner authorization is unavailable, so this sale cannot be corrected here. Normal offline selling is unchanged.',
      'အွန်လိုင်း လုပ်ငန်းနေရာပိုင်ရှင်ခွင့်ပြုချက် မရနိုင်သဖြင့် ဤနေရာတွင် အရောင်းကို မပြင်ဆင်နိုင်ပါ။ ပုံမှန်အော့ဖ်လိုင်းရောင်းချမှုကို မထိခိုက်ပါ။',
    ),
    'device_clock_invalid' => _copy(
      'This device time cannot verify the authorization. Correct the clock and try again.',
      'ဤစက်၏အချိန်ဖြင့် ခွင့်ပြုချက်ကို မစစ်ဆေးနိုင်ပါ။ စက်အချိန်ကို ပြင်ပြီး ထပ်ကြိုးစားပါ။',
    ),
    _ => _copy(
      'Owner authorization could not be verified. Nothing was changed; try again.',
      'ပိုင်ရှင်ခွင့်ပြုချက်ကို အတည်မပြုနိုင်ပါ။ မည်သည့်မှတ်တမ်းကိုမျှ မပြောင်းထားပါ။ ထပ်ကြိုးစားပါ။',
    ),
  };

  void _backToEdit() {
    if (_busy) return;
    setState(() {
      _reviewing = false;
      _command = null;
      _authorizationRequestId = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final narrow = media.size.width < 400;
    return PopScope(
      canPop: !_busy,
      child: AlertDialog(
        insetPadding: EdgeInsets.symmetric(
          horizontal: narrow ? 12 : 40,
          vertical: 24,
        ),
        title: Text(
          _reviewing
              ? _copy(
                  'Review full-sale correction',
                  'အရောင်းတစ်ခုလုံး ပြင်ဆင်မှုကို စစ်ဆေးရန်',
                )
              : _copy('Correct sale', 'အရောင်းပြင်ဆင်ရန်'),
        ),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: _reviewing ? _buildReview(context) : _buildForm(context),
          ),
        ),
        actions: [
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox.square(
                key: ValueKey('shop-correction-progress'),
                dimension: 24,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
            ),
          TextButton(
            key: const ValueKey('shop-correction-cancel'),
            onPressed: _busy
                ? null
                : _reviewing
                ? _backToEdit
                : () => Navigator.of(context).pop(),
            child: Text(
              _reviewing
                  ? _copy('Back', 'နောက်သို့')
                  : _copy('Cancel', 'မလုပ်တော့ပါ'),
            ),
          ),
          FilledButton(
            key: ValueKey(
              _reviewing
                  ? 'shop-correction-authorize'
                  : 'shop-correction-review',
            ),
            onPressed: _busy
                ? null
                : _reviewing
                ? _authorizeAndCorrect
                : _prepareReview,
            child: Text(
              _reviewing
                  ? _copy('Authorize and correct', 'ခွင့်ပြုပြီး ပြင်ဆင်ရန်')
                  : _copy('Review correction', 'ပြင်ဆင်မှုကို စစ်ဆေးရန်'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _copy(
              'Full-sale correction only. The original sale and prices remain in the audit record.',
              'အရောင်းတစ်ခုလုံးကိုသာ ပြင်ဆင်နိုင်ပါသည်။ မူလအရောင်းနှင့် စျေးနှုန်းများကို စစ်ဆေးမှတ်တမ်းတွင် ဆက်လက်ထိန်းသိမ်းထားမည်။',
            ),
          ),
          const SizedBox(height: 16),
          _saleSummary(context),
          const SizedBox(height: 16),
          TextFormField(
            key: const ValueKey('shop-correction-reason'),
            controller: _reasonController,
            enabled: !_busy,
            minLines: 2,
            maxLines: 4,
            maxLength: 240,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: _copy('Reason', 'အကြောင်းရင်း'),
              helperText: _copy(
                'Required for the immutable correction record.',
                'မပြောင်းလဲနိုင်သော ပြင်ဆင်မှုမှတ်တမ်းအတွက် မဖြစ်မနေ ဖြည့်ပါ။',
              ),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? _copy(
                    'Enter a correction reason.',
                    'ပြင်ဆင်ရသည့် အကြောင်းရင်းကို ရေးပါ။',
                  )
                : null,
          ),
          const SizedBox(height: 8),
          Text(
            _copy('Stock treatment', 'လက်ကျန်စာရင်း ဆောင်ရွက်ပုံ'),
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            key: const ValueKey('shop-correction-restock'),
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                key: const ValueKey('shop-correction-restock-all'),
                label: Text(
                  _copy(
                    'Return all to stock',
                    'အားလုံးကို လက်ကျန်ထဲ ပြန်ထည့်မည်',
                  ),
                ),
                selected: _restockItems == true,
                onSelected: _busy
                    ? null
                    : (_) => setState(() => _restockItems = true),
              ),
              ChoiceChip(
                key: const ValueKey('shop-correction-restock-none'),
                label: Text(
                  _copy('Do not change stock', 'လက်ကျန်ကို မပြောင်းပါ'),
                ),
                selected: _restockItems == false,
                onSelected: _busy
                    ? null
                    : (_) => setState(() => _restockItems = false),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_isCash)
            CheckboxListTile(
              key: const ValueKey('shop-correction-cash-return'),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _cashReturned,
              onChanged: _busy
                  ? null
                  : (value) => setState(() => _cashReturned = value ?? false),
              title: Text(
                _copy(
                  'I confirm the full cash amount was returned now.',
                  'ငွေသားအပြည့်ကို ယခုပင် ပြန်ပေးပြီးကြောင်း အတည်ပြုပါသည်။',
                ),
              ),
              subtitle: Text(
                _copy(
                  'The return is bound to the currently open cash shift.',
                  'ငွေပြန်ပေးမှုကို လက်ရှိဖွင့်ထားသော ငွေသားအလှည့်နှင့် ချိတ်ဆက်မှတ်တမ်းတင်မည်။',
                ),
              ),
            )
          else
            _notice(
              context,
              _copy(
                'This local correction does not return wallet money. Provider reconciliation stays pending and must be confirmed separately with evidence.',
                'ဤစက်တွင်းပြင်ဆင်မှုသည် မိုဘိုင်းငွေကို ပြန်ပေးခြင်း မဟုတ်ပါ။ ဝန်ဆောင်မှုပေးသူနှင့် စာရင်းညှိခြင်းကို ဆိုင်းငံ့ထားပြီး အထောက်အထားဖြင့် သီးခြားအတည်ပြုရမည်။',
              ),
            ),
          if (_error case final String error) ...[
            const SizedBox(height: 12),
            _errorMessage(context, error),
          ],
        ],
      ),
    );
  }

  Widget _buildReview(BuildContext context) {
    final command = _command!;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _notice(
          context,
          _copy(
            'An online workspace-owner authorization will be bound to this exact review. The original sale will not be edited or deleted.',
            'ဤစစ်ဆေးချက်အတိအကျကို အွန်လိုင်းလုပ်ငန်းနေရာပိုင်ရှင်၏ ခွင့်ပြုချက်နှင့် ချိတ်ဆက်မည်။ မူလအရောင်းကို ပြင်ခြင်း သို့မဟုတ် ဖျက်ခြင်း မပြုပါ။',
          ),
        ),
        const SizedBox(height: 16),
        _saleSummary(context),
        const Divider(height: 28),
        _reviewRow(_copy('Reason', 'အကြောင်းရင်း'), command.reason),
        _reviewRow(
          _copy('Stock', 'လက်ကျန်'),
          command.restockItems
              ? _copy(
                  'Return every original quantity',
                  'မူလအရေအတွက်အားလုံးကို ပြန်ထည့်မည်',
                )
              : _copy('No stock change', 'လက်ကျန်ကို မပြောင်းပါ'),
        ),
        _reviewRow(
          _copy('Money', 'ငွေပေးချေမှု'),
          _isCash
              ? _copy(
                  'Full cash returned now',
                  'ငွေသားအပြည့် ယခုပင် ပြန်ပေးပြီး',
                )
              : _copy(
                  'No money return recorded; provider follow-up pending',
                  'ငွေပြန်ပေးမှု မမှတ်တမ်းတင်ပါ၊ ဝန်ဆောင်မှုပေးသူနှင့် ဆက်လက်စစ်ဆေးရန် ဆိုင်းငံ့ထားသည်',
                ),
        ),
        if (_error case final String error) ...[
          const SizedBox(height: 12),
          _errorMessage(context, error),
        ],
      ],
    );
  }

  Widget _saleSummary(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final line in widget.sale.lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '${line.productName} × ${shopNumber(line.quantity, myanmar: widget.myanmar)}',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(shopMmk(line.lineTotalMmk, myanmar: widget.myanmar)),
                ],
              ),
            ),
          const Divider(),
          _reviewRow(
            _copy('Full sale total', 'အရောင်းစုစုပေါင်း'),
            shopMmk(widget.sale.totalMmk, myanmar: widget.myanmar),
          ),
          _reviewRow(
            _copy('Original payment', 'မူလငွေပေးချေမှု'),
            switch (widget.sale.paymentMethod) {
              'cash' => _copy('Cash', 'ငွေသား'),
              'kbzpay' => 'KBZPay',
              'wavepay' => 'WavePay',
              final value => value,
            },
          ),
        ],
      ),
    ),
  );

  Widget _reviewRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: Text(label)),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );

  Widget _notice(BuildContext context, String text) => DecoratedBox(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Padding(padding: const EdgeInsets.all(12), child: Text(text)),
  );

  Widget _errorMessage(BuildContext context, String error) => Semantics(
    liveRegion: true,
    child: Text(
      error,
      key: const ValueKey('shop-correction-error'),
      style: TextStyle(
        color: Theme.of(context).colorScheme.error,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}
