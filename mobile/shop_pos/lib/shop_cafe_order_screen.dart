import 'dart:async';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'shop_cafe_order_contract.dart';
import 'shop_cafe_kitchen_entitlement.dart';
import 'shop_cafe_order_store.dart';
import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_staff_authorization.dart';

const shopCafePreparationModifiers = <CafeModifierSnapshot>[
  CafeModifierSnapshot(
    id: 'no-sugar',
    version: 1,
    labelEn: 'No sugar',
    labelMy: 'သကြားမထည့်',
    priceDeltaMmk: 0,
  ),
  CafeModifierSnapshot(
    id: 'less-ice',
    version: 1,
    labelEn: 'Less ice',
    labelMy: 'ရေခဲလျော့',
    priceDeltaMmk: 0,
  ),
];

class ShopCafeOrderScreen extends StatefulWidget {
  const ShopCafeOrderScreen({
    required this.database,
    required this.myanmar,
    this.modifiers = shopCafePreparationModifiers,
    this.kitchenEntitlement = const ShopCafeKitchenEntitlementUnavailable(),
    this.staffAuthorizer = const ShopStaffCommandAuthorizationUnavailable(),
    this.staffActorId,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final List<CafeModifierSnapshot> modifiers;
  final ShopCafeKitchenEntitlement kitchenEntitlement;
  final ShopStaffCommandAuthorizer staffAuthorizer;
  final String? staffActorId;

  @override
  State<ShopCafeOrderScreen> createState() => _ShopCafeOrderScreenState();
}

class _ShopCafeOrderScreenState extends State<ShopCafeOrderScreen> {
  final _uuid = const Uuid();
  final _searchController = TextEditingController();
  late final ShopCafeOrderStore _store = ShopCafeOrderStore(
    widget.database,
    kitchenEntitlement: widget.kitchenEntitlement,
    staffAuthorizer: widget.staffAuthorizer,
    staffActorId: widget.staffActorId,
  );
  List<StoredCafeOrder> _orders = const [];
  Map<String, CafeOrderSplitReversalCandidate> _splitReversals = const {};
  Map<String, String> _productNames = const {};
  Map<String, ShopProduct> _products = const {};
  bool _loading = true;
  bool _busy = false;
  bool _cashConfirming = false;
  bool _choosingProduct = false;
  String? _error;
  String _searchQuery = '';

  String _copy(String en, String my) => shopCopy(widget.myanmar, en, my);
  Map<String, CafeModifierSnapshot> get _catalog => {
    for (final item in widget.modifiers) item.key: item,
  };

  bool _sameModifier(CafeModifierSnapshot left, CafeModifierSnapshot right) =>
      left.id == right.id &&
      left.version == right.version &&
      left.labelEn == right.labelEn &&
      left.labelMy == right.labelMy &&
      left.priceDeltaMmk == right.priceDeltaMmk;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<StoredCafeOrder> get _visibleOrders {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return _orders;
    return [
      for (final order in _orders)
        if (_matchesSearch(order, query)) order,
    ];
  }

  bool _matchesSearch(StoredCafeOrder order, String query) {
    final context = order.ticket.serviceContext;
    final values = <String>[
      order.ticket.id,
      _displayOrderId(order.ticket.id),
      order.state,
      order.state == 'held' ? 'held ခဏသိမ်း' : 'open ဖွင့်ထား',
      if (context != null) context.areaLabel,
      if (context != null) context.tableLabel,
      for (final line in order.ticket.lines) ...[
        line.productName ?? _productNames[line.productId] ?? line.productId,
        line.remark,
      ],
    ];
    return values.any((value) => value.toLowerCase().contains(query));
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() => _searchQuery = '');
  }

  Future<void> _reload() async {
    if (mounted) setState(() => _loading = true);
    try {
      final results = await Future.wait<Object>([
        _store.readActive(),
        widget.database.readActiveProducts(),
        _store.readSplitReversalCandidates(),
      ]);
      final orders = results[0] as List<StoredCafeOrder>;
      final products = results[1] as List<ShopProduct>;
      final splitReversals =
          results[2] as List<CafeOrderSplitReversalCandidate>;
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _productNames = {for (final item in products) item.id: item.name};
        _products = {for (final item in products) item.id: item};
        _splitReversals = {
          for (final item in splitReversals) item.source.ticket.id: item,
        };
        _error = null;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = _copy(
          'Cafe orders could not be read. Try again.',
          'ကော်ဖီဆိုင် မှာစာများကို မဖတ်နိုင်ပါ။ ထပ်စမ်းပါ။',
        );
        _loading = false;
      });
    }
  }

  Future<void> _guard(
    Future<void> Function() action, {
    Future<void> Function()? onCashShiftChanged,
  }) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ShopCashShiftChangedException {
      if (onCashShiftChanged != null) {
        await onCashShiftChanged();
      } else if (mounted) {
        setState(() {
          _error = _copy(
            'The cash shift changed. No sale was recorded. Review it before retrying.',
            'ငွေသားအဆိုင်း ပြောင်းသွားသည်။ အရောင်းမမှတ်ရသေးပါ။ ထပ်မကြိုးစားမီ ပြန်စစ်ပါ။',
          );
        });
      }
    } on FormatException {
      if (mounted) {
        setState(() {
          _error = _copy(
            'Review the order details and try again.',
            'မှာစာအချက်အလက်ကို စစ်ဆေးပြီး ထပ်စမ်းပါ။',
          );
        });
      }
    } on ShopCafeKitchenEntitlementException {
      if (mounted) {
        setState(() {
          _error = _copy(
            'Kitchen tickets need verified Premium access. The basic cafe order is still available.',
            'မီးဖိုချောင်လက်မှတ်အတွက် အတည်ပြုထားသော Premium အသုံးပြုခွင့်လိုသည်။ အခြေခံကော်ဖီဆိုင်မှာစာကို ဆက်သုံးနိုင်သည်။',
          );
        });
      }
    } on ShopCafeInsufficientStockException catch (error) {
      if (mounted) {
        setState(() {
          final available = shopNumber(
            error.available,
            myanmar: widget.myanmar,
          );
          final required = shopNumber(
            error.requiredQuantity,
            myanmar: widget.myanmar,
          );
          _error = _copy(
            '${error.productName} has $available in stock, but this order needs $required. Edit or remove the item before taking cash.',
            '${error.productName} လက်ကျန် $available ခုသာရှိပြီး ဤမှာစာတွင် $required ခုလိုပါသည်။ ငွေသားမယူမီ ပစ္စည်းကို ပြင်ပါ သို့မဟုတ် ဖယ်ပါ။',
          );
        });
      }
    } on ShopCafeStartedKitchenLineException {
      if (mounted) {
        setState(() {
          _error = _copy(
            'This item is already being prepared. Keep it unchanged, or cancel the order and tell the kitchen or bar directly.',
            'ဤပစ္စည်းကို စတင်ပြင်ဆင်နေပြီးဖြစ်သည်။ မပြောင်းဘဲထားပါ သို့မဟုတ် မှာစာကို ပယ်ဖျက်ပြီး မီးဖိုချောင် သို့မဟုတ် ဘားကို တိုက်ရိုက်အသိပေးပါ။',
          );
        });
      }
    } on StateError catch (error) {
      if (mounted) {
        final detail = error.message.toString();
        setState(() {
          _error = detail.contains('pending wallet')
              ? _copy(
                  'Finish or cancel the pending mobile payment before taking cash.',
                  'ငွေသားမယူမီ ဆိုင်းငံ့နေသော မိုဘိုင်းငွေပေးချေမှုကို ပြီးစီးပါ သို့မဟုတ် ပယ်ဖျက်ပါ။',
                )
              : _copy(
                  'The order changed or could not be saved. Refresh and review it.',
                  'မှာစာပြောင်းသွားသည် သို့မဟုတ် မသိမ်းနိုင်ပါ။ ပြန်ဖတ်ပြီး စစ်ဆေးပါ။',
                );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = _copy(
            'The order changed or could not be saved. Refresh and review it.',
            'မှာစာပြောင်းသွားသည် သို့မဟုတ် မသိမ်းနိုင်ပါ။ ပြန်ဖတ်ပြီး စစ်ဆေးပါ။',
          );
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<_LineDraft?> _editLine(
    ShopProduct product, {
    CafeServiceContext? existingContext,
    CafeOrderLine? existingLine,
  }) async {
    final currentByKey = {
      for (final modifier in widget.modifiers) modifier.key: modifier,
    };
    for (final persisted in existingLine?.modifiers ?? const []) {
      final current = currentByKey[persisted.key];
      if (current != null && !_sameModifier(current, persisted)) {
        setState(() {
          _error = _copy(
            'This saved preparation option changed in the catalog. Keep the order unchanged and review the modifier setup.',
            'သိမ်းထားသော ပြင်ဆင်မှုရွေးချယ်စရာသည် စာရင်းတွင် ပြောင်းသွားပါသည်။ မှာစာကို မပြောင်းဘဲ ရွေးချယ်စရာသတ်မှတ်ချက်ကို စစ်ပါ။',
          );
        });
        return null;
      }
    }
    var remark = existingLine?.remark ?? '';
    var areaLabel = existingContext?.areaLabel ?? '';
    var tableLabel = existingContext?.tableLabel ?? '';
    var station = existingLine?.preparationStation ?? 'kitchen';
    final selected = <String>{
      for (final modifier in existingLine?.modifiers ?? const []) modifier.key,
    };
    final availableModifiers = <CafeModifierSnapshot>[
      for (final modifier in existingLine?.modifiers ?? const []) modifier,
      for (final modifier in widget.modifiers)
        if (!(existingLine?.modifiers ?? const []).any(
          (item) => item.key == modifier.key,
        ))
          modifier,
    ];
    var quantity = (existingLine?.quantity ?? 1).toString();
    var quantityInvalid = false;
    return showDialog<_LineDraft>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            existingLine == null
                ? product.name
                : _copy('Edit ${product.name}', '${product.name} ပြင်ရန်'),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (existingContext == null) ...[
                  TextField(
                    key: const ValueKey('cafe-area-label'),
                    maxLength: 80,
                    onChanged: (value) => areaLabel = value,
                    decoration: InputDecoration(
                      labelText: _copy('Area (optional)', 'ဧရိယာ (မထည့်လည်းရ)'),
                      hintText: _copy(
                        'Example: Ground floor',
                        'ဥပမာ - မြေညီထပ်',
                      ),
                    ),
                  ),
                  TextField(
                    key: const ValueKey('cafe-table-label'),
                    maxLength: 80,
                    onChanged: (value) => tableLabel = value,
                    decoration: InputDecoration(
                      labelText: _copy(
                        'Table (optional)',
                        'စားပွဲ (မထည့်လည်းရ)',
                      ),
                      hintText: _copy('Example: T-04', 'ဥပမာ - စားပွဲ ၄'),
                    ),
                  ),
                ],
                TextFormField(
                  key: const ValueKey('cafe-line-quantity'),
                  initialValue: quantity,
                  keyboardType: TextInputType.number,
                  onChanged: (value) => setDialogState(() {
                    quantity = value;
                    quantityInvalid = false;
                  }),
                  decoration: InputDecoration(
                    labelText: _copy('Quantity', 'အရေအတွက်'),
                    errorText: quantityInvalid
                        ? _copy(
                            'Enter a whole quantity from 1 to 1,000.',
                            '၁ မှ ၁၀၀၀ အထိ အရေအတွက်အပြည့် ထည့်ပါ။',
                          )
                        : null,
                  ),
                ),
                const SizedBox(height: 12),
                if (widget.kitchenEntitlement.allowsKitchenDispatch)
                  DropdownButtonFormField<String>(
                    key: const ValueKey('cafe-preparation-station'),
                    initialValue: station,
                    decoration: InputDecoration(
                      labelText: _copy(
                        'Send preparation to',
                        'ပြင်ဆင်ရန် ပို့မည့်နေရာ',
                      ),
                    ),
                    items: [
                      DropdownMenuItem(
                        value: 'kitchen',
                        child: Text(_copy('Kitchen', 'မီးဖိုချောင်')),
                      ),
                      DropdownMenuItem(
                        value: 'bar',
                        child: Text(_copy('Bar', 'ဘား')),
                      ),
                    ],
                    onChanged: existingLine == null
                        ? (value) => station = value ?? 'kitchen'
                        : null,
                  )
                else
                  Text(
                    _copy(
                      'Basic order only. Kitchen tickets require verified Premium access.',
                      'အခြေခံမှာစာသာ သုံးနိုင်သည်။ မီးဖိုချောင်လက်မှတ်အတွက် အတည်ပြုထားသော Premium အသုံးပြုခွင့်လိုသည်။',
                    ),
                    key: const ValueKey('cafe-kitchen-entitlement-unavailable'),
                  ),
                const SizedBox(height: 12),
                Text(_copy('Preparation', 'ပြင်ဆင်မှု')),
                for (final modifier in availableModifiers)
                  CheckboxListTile(
                    key: ValueKey('cafe-modifier:${modifier.key}'),
                    contentPadding: EdgeInsets.zero,
                    value: selected.contains(modifier.key),
                    title: Text(
                      widget.myanmar ? modifier.labelMy : modifier.labelEn,
                    ),
                    subtitle:
                        existingLine?.modifiers.any(
                                  (item) => item.key == modifier.key,
                                ) ==
                                true &&
                            !widget.modifiers.any(
                              (item) => item.key == modifier.key,
                            )
                        ? Text(
                            _copy(
                              'Saved with this order',
                              'ဤမှာစာနှင့် သိမ်းထားသည်',
                            ),
                          )
                        : null,
                    onChanged: (value) => setDialogState(() {
                      if (value ?? false) {
                        selected.add(modifier.key);
                      } else {
                        selected.remove(modifier.key);
                      }
                    }),
                  ),
                TextFormField(
                  key: const ValueKey('cafe-remark'),
                  initialValue: remark,
                  maxLength: 240,
                  maxLines: 2,
                  onChanged: (value) => remark = value,
                  decoration: InputDecoration(
                    labelText: _copy(
                      'Remark (optional)',
                      'မှတ်ချက် (မထည့်လည်းရ)',
                    ),
                    hintText: _copy(
                      'Example: serve warm',
                      'ဥပမာ - နွေးနွေးပေးပါ',
                    ),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(_copy('Cancel', 'မလုပ်တော့ပါ')),
            ),
            FilledButton(
              key: const ValueKey('cafe-add-line-confirm'),
              onPressed: () {
                final parsed = parseShopMmkInput(quantity, maximum: 1000);
                if (parsed == null || parsed < 1 || parsed > 1000) {
                  setDialogState(() => quantityInvalid = true);
                  return;
                }
                Navigator.pop(
                  dialogContext,
                  _LineDraft(
                    quantity: parsed,
                    remark: remark.trim(),
                    serviceContext:
                        areaLabel.trim().isEmpty && tableLabel.trim().isEmpty
                        ? existingContext
                        : CafeServiceContext(
                            areaLabel: areaLabel.trim(),
                            tableLabel: tableLabel.trim(),
                          ),
                    preparationStation:
                        widget.kitchenEntitlement.allowsKitchenDispatch
                        ? station
                        : null,
                    modifiers: [
                      for (final modifier in availableModifiers)
                        if (selected.contains(modifier.key)) modifier,
                    ],
                  ),
                );
              },
              child: Text(
                existingLine == null
                    ? _copy('Add line', 'စာကြောင်းထည့်မည်')
                    : _copy('Save line', 'စာကြောင်းသိမ်းမည်'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _chooseProduct({StoredCafeOrder? order}) async {
    if (_choosingProduct) return;
    setState(() => _choosingProduct = true);
    final catalogReadError = _copy(
      'Products could not be read. Try New order again.',
      'ကုန်ပစ္စည်းများကို မဖတ်နိုင်ပါ။ မှာစာသစ်ကို ထပ်စမ်းပါ။',
    );
    late final List<ShopProduct> products;
    try {
      products = await widget.database.readActiveProducts();
    } catch (_) {
      if (mounted) {
        setState(() => _error = catalogReadError);
      }
      return;
    } finally {
      if (mounted) {
        setState(() => _choosingProduct = false);
      } else {
        _choosingProduct = false;
      }
    }
    if (!mounted) return;
    if (_error == catalogReadError) setState(() => _error = null);
    if (products.isEmpty) {
      setState(() {
        _error = _copy(
          'Add an in-stock product before creating a cafe order.',
          'ကော်ဖီမှာစာ မဖန်တီးမီ လက်ကျန်ရှိ ကုန်ပစ္စည်းတစ်မျိုး ထည့်ပါ။',
        );
      });
      return;
    }
    final product = await showModalBottomSheet<ShopProduct>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(title: Text(_copy('Choose product', 'ကုန်ပစ္စည်းရွေးပါ'))),
            for (final item in products)
              ListTile(
                key: ValueKey('cafe-product:${item.id}'),
                enabled: item.onHand > 0,
                title: Text(item.name),
                subtitle: Text(
                  '${shopMmk(item.priceMmk, myanmar: widget.myanmar)} · '
                  '${_copy('stock', 'လက်ကျန်')} '
                  '${shopNumber(item.onHand, myanmar: widget.myanmar)}',
                ),
                onTap: item.onHand > 0
                    ? () => Navigator.pop(context, item)
                    : null,
              ),
          ],
        ),
      ),
    );
    if (product == null || !mounted) return;
    final draft = await _editLine(
      product,
      existingContext: order?.ticket.serviceContext,
    );
    if (draft == null) return;
    await _guard(() async {
      final orderId = order?.ticket.id ?? 'cafe-${_uuid.v4()}';
      final lineId = 'line-${_uuid.v4()}';
      final line = draft.preparationStation == null
          ? CafeOrderLine.local(
              id: lineId,
              productId: product.id,
              productName: product.name,
              quantity: draft.quantity,
              baseUnitPriceMmk: product.priceMmk,
              remark: draft.remark,
              modifiers: draft.modifiers,
            )
          : CafeOrderLine(
              id: lineId,
              productId: product.id,
              productName: product.name,
              quantity: draft.quantity,
              baseUnitPriceMmk: product.priceMmk,
              remark: draft.remark,
              preparationStation: draft.preparationStation!,
              modifiers: draft.modifiers,
            );
      await _store.applyCommand(
        CafeOrderCommand(
          id: 'cmd-${_uuid.v4()}',
          ticketId: orderId,
          expectedVersion: order?.ticket.version ?? 0,
          lines: [...?order?.ticket.lines, line],
          serviceContext: order?.ticket.serviceContext ?? draft.serviceContext,
        ),
        _catalogWithPersistedSnapshots(order?.ticket.lines ?? const []),
      );
      await _reload();
    });
  }

  Map<String, CafeModifierSnapshot> _catalogWithPersistedSnapshots(
    Iterable<CafeOrderLine> lines,
  ) {
    final catalog = Map<String, CafeModifierSnapshot>.of(_catalog);
    for (final line in lines) {
      for (final modifier in line.modifiers) {
        final current = catalog[modifier.key];
        if (current != null && !_sameModifier(current, modifier)) {
          throw StateError(
            'A saved café modifier conflicts with the current catalog.',
          );
        }
        catalog[modifier.key] = modifier;
      }
    }
    return catalog;
  }

  Future<void> _holdOrResume(StoredCafeOrder order) => _guard(() async {
    if (order.state == 'open') {
      await _store.hold(
        orderId: order.ticket.id,
        operationId: 'hold-${_uuid.v4()}',
        expectedStateRevision: order.stateRevision,
      );
    } else {
      await _store.resume(
        orderId: order.ticket.id,
        operationId: 'resume-${_uuid.v4()}',
        expectedStateRevision: order.stateRevision,
      );
    }
    await _reload();
  });

  Future<void> _advanceKitchenStatus(
    StoredCafeOrder order,
    CafeOrderLine line,
  ) => _guard(() async {
    await _store.advanceKitchenStatus(
      orderId: order.ticket.id,
      lineId: line.id,
      operationId: 'kitchen-status-${_uuid.v4()}',
      expectedTicketVersion: order.ticket.version,
      expectedStatus: order.kitchenStatusByLine[line.id]!,
    );
    await _reload();
  });

  Future<void> _cancelOrder(StoredCafeOrder order) async {
    final routed = order.ticket.lines.any((line) => line.hasPreparationRoute);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          _copy('Cancel entire order?', 'မှာစာတစ်ခုလုံး ပယ်ဖျက်မည်လား'),
        ),
        content: Text(
          routed
              ? _copy(
                  'This cancels the unpaid order on this device. Its kitchen history stays in the audit record, but this does not confirm that kitchen preparation stopped. Tell the kitchen or bar directly.',
                  'ဤစက်ရှိ ငွေမချေရသေးသော မှာစာကို ပယ်ဖျက်ပါမည်။ မီးဖိုချောင်မှတ်တမ်းမှာ ဆက်ရှိမည်ဖြစ်သော်လည်း ပြင်ဆင်မှုရပ်သွားကြောင်း အတည်မပြုနိုင်ပါ။ မီးဖိုချောင် သို့မဟုတ် ဘားကို တိုက်ရိုက်အသိပေးပါ။',
                )
              : _copy(
                  'This cancels the unpaid order. No sale, payment or stock movement will be recorded.',
                  'ငွေမချေရသေးသော မှာစာကို ပယ်ဖျက်ပါမည်။ အရောင်း၊ ငွေပေးချေမှု သို့မဟုတ် လက်ကျန်ပြောင်းလဲမှု မမှတ်တမ်းတင်ပါ။',
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(_copy('Keep order', 'မှာစာထားမည်')),
          ),
          FilledButton(
            key: const ValueKey('cafe-cancel-order-confirm'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_copy('Cancel order', 'မှာစာပယ်ဖျက်မည်')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _guard(() async {
      await _store.cancel(
        orderId: order.ticket.id,
        operationId: 'cancel-${_uuid.v4()}',
        expectedStateRevision: order.stateRevision,
      );
      await _reload();
      if (routed && mounted) {
        final messenger = ScaffoldMessenger.of(context);
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(
          SnackBar(
            key: const ValueKey('cafe-kitchen-cancel-followup'),
            duration: const Duration(seconds: 10),
            content: Text(
              _copy(
                'Order cancelled here. Kitchen or bar was not notified automatically—tell them directly before preparation continues.',
                'ဤစက်တွင် မှာစာပယ်ဖျက်ပြီးပါပြီ။ မီးဖိုချောင် သို့မဟုတ် ဘားကို အလိုအလျောက် အသိပေးထားခြင်းမရှိပါ။ ပြင်ဆင်မှုမဆက်မီ တိုက်ရိုက်အသိပေးပါ။',
              ),
            ),
            action: SnackBarAction(
              label: _copy('Got it', 'သိပါပြီ'),
              onPressed: () {},
            ),
          ),
        );
      }
    });
  }

  Future<void> _editOrderLine(StoredCafeOrder order, CafeOrderLine line) async {
    final product = _products[line.productId];
    if (product == null) {
      setState(() {
        _error = _copy(
          'This product is no longer active. Keep the saved line or start a new order.',
          'ဤကုန်ပစ္စည်းကို မသုံးတော့ပါ။ သိမ်းထားသောစာကြောင်းကို ဆက်ထားပါ သို့မဟုတ် မှာစာသစ်စပါ။',
        );
      });
      return;
    }
    final draft = await _editLine(
      product,
      existingContext: order.ticket.serviceContext,
      existingLine: line,
    );
    if (draft == null) return;
    final updated = line.hasPreparationRoute
        ? CafeOrderLine(
            id: line.id,
            productId: line.productId,
            productName: line.productName ?? product.name,
            quantity: draft.quantity,
            baseUnitPriceMmk: line.baseUnitPriceMmk,
            remark: draft.remark,
            preparationStation: line.preparationStation,
            modifiers: draft.modifiers,
          )
        : CafeOrderLine.local(
            id: line.id,
            productId: line.productId,
            productName: line.productName ?? product.name,
            quantity: draft.quantity,
            baseUnitPriceMmk: line.baseUnitPriceMmk,
            remark: draft.remark,
            modifiers: draft.modifiers,
          );
    await _guard(() async {
      await _store.applyCommand(
        CafeOrderCommand(
          id: 'edit-${_uuid.v4()}',
          ticketId: order.ticket.id,
          expectedVersion: order.ticket.version,
          lines: [
            for (final current in order.ticket.lines)
              if (current.id == line.id) updated else current,
          ],
          serviceContext: order.ticket.serviceContext,
        ),
        _catalogWithPersistedSnapshots(order.ticket.lines),
      );
      await _reload();
    });
  }

  Future<void> _removeOrderLine(
    StoredCafeOrder order,
    CafeOrderLine line,
  ) async {
    if (order.state != 'open' || order.ticket.lines.length <= 1) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_copy('Remove item?', 'ပစ္စည်းဖယ်မည်လား')),
        content: Text(
          line.hasPreparationRoute
              ? _copy(
                  'This removes the item from the current bill. Its kitchen history stays in the audit record, so tell the kitchen if preparation already started.',
                  'ဤပစ္စည်းကို လက်ရှိကျသင့်ငွေမှ ဖယ်ပါမည်။ မီးဖိုချောင် မှတ်တမ်းမှာ ဆက်ရှိနေမည်ဖြစ်၍ ပြင်ဆင်နေပြီးပါက မီးဖိုချောင်ကို အသိပေးပါ။',
                )
              : _copy(
                  'This removes the item from the current bill. No sale or stock movement has been recorded yet.',
                  'ဤပစ္စည်းကို လက်ရှိကျသင့်ငွေမှ ဖယ်ပါမည်။ အရောင်း သို့မဟုတ် လက်ကျန်ပြောင်းလဲမှု မမှတ်တမ်းတင်ရသေးပါ။',
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(_copy('Keep item', 'ပစ္စည်းထားမည်')),
          ),
          FilledButton(
            key: const ValueKey('cafe-remove-line-confirm'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_copy('Remove item', 'ပစ္စည်းဖယ်မည်')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _guard(() async {
      final remainingLines = [
        for (final current in order.ticket.lines)
          if (current.id != line.id) current,
      ];
      await _store.applyCommand(
        CafeOrderCommand(
          id: 'remove-${_uuid.v4()}',
          ticketId: order.ticket.id,
          expectedVersion: order.ticket.version,
          lines: remainingLines,
          serviceContext: order.ticket.serviceContext,
        ),
        _catalogWithPersistedSnapshots(remainingLines),
      );
      await _reload();
    });
  }

  Future<void> _moveOrder(StoredCafeOrder order) async {
    var areaLabel = order.ticket.serviceContext?.areaLabel ?? '';
    var tableLabel = order.ticket.serviceContext?.tableLabel ?? '';
    final moved = await showDialog<CafeServiceContext>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) {
          final cleanArea = areaLabel.trim();
          final cleanTable = tableLabel.trim();
          final current = order.ticket.serviceContext;
          final unchanged =
              current?.areaLabel == cleanArea &&
              current?.tableLabel == cleanTable;
          final valid =
              (cleanArea.isNotEmpty || cleanTable.isNotEmpty) && !unchanged;
          return AlertDialog(
            title: Text(_copy('Move order', 'မှာစာ နေရာပြောင်းရန်')),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  key: const ValueKey('cafe-move-area'),
                  initialValue: areaLabel,
                  maxLength: 80,
                  onChanged: (value) => update(() => areaLabel = value),
                  decoration: InputDecoration(
                    labelText: _copy('Area (optional)', 'ဧရိယာ (မထည့်လည်းရ)'),
                  ),
                ),
                TextFormField(
                  key: const ValueKey('cafe-move-table'),
                  initialValue: tableLabel,
                  maxLength: 80,
                  autofocus: true,
                  onChanged: (value) => update(() => tableLabel = value),
                  decoration: InputDecoration(
                    labelText: _copy('Table', 'စားပွဲ'),
                    helperText: _copy(
                      'The order and kitchen ticket stay the same.',
                      'မှာစာနှင့် မီးဖိုချောင်လက်မှတ် မပြောင်းပါ။',
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: Text(_copy('Cancel', 'မလုပ်တော့ပါ')),
              ),
              FilledButton(
                key: const ValueKey('cafe-move-confirm'),
                onPressed: valid
                    ? () => Navigator.pop(
                        dialogContext,
                        CafeServiceContext(
                          areaLabel: cleanArea,
                          tableLabel: cleanTable,
                        ),
                      )
                    : null,
                child: Text(_copy('Move order', 'နေရာပြောင်းမည်')),
              ),
            ],
          );
        },
      ),
    );
    if (moved == null || !mounted) return;
    await _guard(() async {
      await _store.applyCommand(
        CafeOrderCommand(
          id: 'move-${_uuid.v4()}',
          ticketId: order.ticket.id,
          expectedVersion: order.ticket.version,
          lines: order.ticket.lines,
          serviceContext: moved,
        ),
        _catalog,
      );
      await _reload();
    });
  }

  Future<void> _splitOrder(StoredCafeOrder order) async {
    final movedQuantities = <String, int>{};
    final selectedQuantities = await showDialog<Map<String, int>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) {
          final selectedUnits = movedQuantities.values.fold<int>(
            0,
            (sum, quantity) => sum + quantity,
          );
          final totalUnits = order.ticket.lines.fold<int>(
            0,
            (sum, line) => sum + line.quantity,
          );
          return AlertDialog(
            scrollable: true,
            title: Text(_copy('Split into two bills', 'ဘေလ်နှစ်ခု ခွဲမည်')),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _copy(
                    'Choose whole units for a new local bill. Each bill must be paid separately. Payment methods cannot be split here.',
                    'ဘေလ်အသစ်သို့ ရွှေ့မည့် ပစ္စည်းအရေအတွက်အပြည့်ကို ရွေးပါ။ ဘေလ်တစ်ခုချင်းစီကို သီးခြားငွေချေရမည်။ ဤနေရာတွင် ငွေပေးချေမှုနည်းလမ်းကို မခွဲနိုင်ပါ။',
                  ),
                ),
                const SizedBox(height: 8),
                for (final line in order.ticket.lines)
                  if (line.quantity == 1)
                    CheckboxListTile(
                      key: ValueKey('cafe-split-line:${line.id}'),
                      contentPadding: EdgeInsets.zero,
                      value: movedQuantities[line.id] == 1,
                      title: Text(_lineName(line)),
                      subtitle: Text(
                        shopMmk(line.totalMmk(), myanmar: widget.myanmar),
                      ),
                      onChanged: (checked) => update(() {
                        if (checked ?? false) {
                          movedQuantities[line.id] = 1;
                        } else {
                          movedQuantities.remove(line.id);
                        }
                      }),
                    )
                  else
                    ListTile(
                      key: ValueKey('cafe-split-line:${line.id}'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(_lineName(line)),
                      subtitle: Text(
                        shopMmk(line.totalMmk(), myanmar: widget.myanmar),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            key: ValueKey('cafe-split-decrease:${line.id}'),
                            tooltip: _copy('Move one less', 'တစ်ခုလျှော့ရွှေ့'),
                            onPressed: (movedQuantities[line.id] ?? 0) == 0
                                ? null
                                : () => update(() {
                                    final next =
                                        (movedQuantities[line.id] ?? 0) - 1;
                                    if (next == 0) {
                                      movedQuantities.remove(line.id);
                                    } else {
                                      movedQuantities[line.id] = next;
                                    }
                                  }),
                            icon: const Icon(Icons.remove),
                          ),
                          Text(
                            '${movedQuantities[line.id] ?? 0} / ${line.quantity}',
                            key: ValueKey('cafe-split-quantity:${line.id}'),
                          ),
                          IconButton(
                            key: ValueKey('cafe-split-increase:${line.id}'),
                            tooltip: _copy('Move one more', 'တစ်ခုထပ်ရွှေ့'),
                            onPressed:
                                (movedQuantities[line.id] ?? 0) >= line.quantity
                                ? null
                                : () => update(() {
                                    movedQuantities[line.id] =
                                        (movedQuantities[line.id] ?? 0) + 1;
                                  }),
                            icon: const Icon(Icons.add),
                          ),
                        ],
                      ),
                    ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: Text(_copy('Keep one bill', 'ဘေလ်တစ်ခုတည်းထားမည်')),
              ),
              FilledButton(
                key: const ValueKey('cafe-split-confirm'),
                onPressed: selectedUnits == 0 || selectedUnits == totalUnits
                    ? null
                    : () => Navigator.pop(
                        dialogContext,
                        Map<String, int>.unmodifiable(movedQuantities),
                      ),
                child: Text(_copy('Create second bill', 'ဒုတိယဘေလ် ဖန်တီးမည်')),
              ),
            ],
          );
        },
      ),
    );
    if (selectedQuantities == null || !mounted) return;
    await _guard(() async {
      await _store.splitLocalBillQuantities(
        sourceOrderId: order.ticket.id,
        destinationOrderId: 'cafe-${_uuid.v4()}',
        operationId: 'split-${_uuid.v4()}',
        expectedTicketVersion: order.ticket.version,
        expectedStateRevision: order.stateRevision,
        movedLineQuantities: selectedQuantities,
      );
      await _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          key: const ValueKey('cafe-split-success'),
          content: Text(
            _copy(
              'Second local bill created. Take payment for each bill separately.',
              'ဒုတိယစက်တွင်းဘေလ် ဖန်တီးပြီးပါပြီ။ ဘေလ်တစ်ခုချင်းစီအတွက် သီးခြားငွေယူပါ။',
            ),
          ),
        ),
      );
    });
  }

  Future<void> _undoSplit(CafeOrderSplitReversalCandidate candidate) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_copy('Undo this split?', 'ဤဘေလ်ခွဲမှုကို ပြန်ဖျက်မည်လား')),
        content: Text(
          _copy(
            'The two unchanged, unpaid local bills will become the exact original bill again. No payment, sale, stock, or printed receipt is moved or created.',
            'မပြောင်းလဲရသေးသော ငွေမချေရသေးသည့် စက်တွင်းဘေလ်နှစ်ခုကို မူလဘေလ်အတိုင်း ပြန်ပေါင်းပါမည်။ ငွေပေးချေမှု၊ အရောင်း၊ ကုန်လက်ကျန် သို့မဟုတ် ပြေစာကို မရွှေ့ပြောင်း၊ အသစ်မဖန်တီးပါ။',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(_copy('Keep two bills', 'ဘေလ်နှစ်ခုထားမည်')),
          ),
          FilledButton(
            key: const ValueKey('cafe-unsplit-confirm'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_copy('Undo split', 'ဘေလ်ခွဲမှု ပြန်ဖျက်မည်')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _guard(() async {
      await _store.reverseLocalSplit(
        splitOperationId: candidate.splitEvent.operationId,
        operationId: 'unsplit-${_uuid.v4()}',
        expectedSourceTicketVersion: candidate.source.ticket.version,
        expectedSourceStateRevision: candidate.source.stateRevision,
        expectedDestinationTicketVersion: candidate.destination.ticket.version,
        expectedDestinationStateRevision: candidate.destination.stateRevision,
      );
      await _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          key: const ValueKey('cafe-unsplit-success'),
          content: Text(
            _copy(
              'The unchanged bills are back in one local bill. No payment was created.',
              'မပြောင်းလဲရသေးသော ဘေလ်နှစ်ခုကို စက်တွင်းဘေလ်တစ်ခုတည်းအဖြစ် ပြန်ပေါင်းပြီးပါပြီ။ ငွေပေးချေမှု အသစ်မဖန်တီးပါ။',
            ),
          ),
        ),
      );
    });
  }

  Future<void> _complete(StoredCafeOrder order) async {
    if (_cashConfirming || _busy) return;
    setState(() => _cashConfirming = true);
    try {
      final recoveredCash = await widget.database.readPendingCashCheckout(
        checkoutKind: 'cafe',
        subjectId: order.ticket.id,
      );
      if (!mounted) return;
      if (recoveredCash != null) {
        final resume = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => AlertDialog(
            title: Text(
              _copy(
                'Cash checkout interrupted',
                'ငွေသားအရောင်း ကြားဖြတ်သွားသည်',
              ),
            ),
            content: Text(
              _copy(
                'No sale was recorded yet. Continue this cash checkout, or cancel it before editing the order.',
                'အရောင်းကို မမှတ်ရသေးပါ။ ဤငွေသားအရောင်းကို ဆက်လုပ်ပါ သို့မဟုတ် မှာစာမပြင်မီ ပယ်ဖျက်ပါ။',
              ),
            ),
            actions: [
              TextButton(
                key: const ValueKey('cafe-cancel-recovered-cash'),
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: Text(
                  _copy('Cancel cash attempt', 'ငွေသားအတည်ပြုမှု ပယ်ဖျက်မည်'),
                ),
              ),
              FilledButton(
                key: const ValueKey('cafe-resume-recovered-cash'),
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: Text(_copy('Continue', 'ဆက်လုပ်မည်')),
              ),
            ],
          ),
        );
        if (resume != true) {
          await widget.database.cancelPendingCashCheckout(
            checkoutKind: recoveredCash.checkoutKind,
            subjectId: recoveredCash.subjectId,
          );
          if (mounted) {
            setState(() {
              _error = _copy(
                'Cash attempt cancelled. No sale was recorded; review the order.',
                'ငွေသားအတည်ပြုမှု ပယ်ဖျက်ပြီးပါပြီ။ အရောင်းမမှတ်ရသေးပါ။ မှာစာကို ပြန်စစ်ပါ။',
              );
            });
          }
          return;
        }
      }
      if (!mounted) return;
      var cashGiven = '';
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, update) {
            final entered = cashGiven.trim();
            final tendered = entered.isEmpty
                ? null
                : parseShopMmkInput(entered);
            final invalid = entered.isNotEmpty && tendered == null;
            final short = tendered != null && tendered < order.totalMmk;
            return AlertDialog(
              scrollable: true,
              title: Text(_copy('Take cash?', 'ငွေသားလက်ခံမည်လား')),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_copy('Review total', 'စုစုပေါင်းစစ်ပါ')}: '
                    '${shopMmk(order.totalMmk, myanmar: widget.myanmar)}',
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('cafe-cash-given'),
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    onChanged: (value) => update(() => cashGiven = value),
                    decoration: InputDecoration(
                      labelText: _copy(
                        'Cash given (optional)',
                        'ပေးငွေ (မထည့်လည်းရ)',
                      ),
                    ),
                  ),
                  if (tendered != null && !short) ...[
                    const SizedBox(height: 12),
                    Text(_copy('Change', 'ပြန်အမ်းငွေ')),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        shopMmk(
                          tendered - order.totalMmk,
                          myanmar: widget.myanmar,
                        ),
                        key: const ValueKey('cafe-cash-change'),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                  ],
                  if (short || invalid) ...[
                    const SizedBox(height: 8),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _copy(
                          short
                              ? 'Cash given is less than the amount due.'
                              : 'Enter a valid amount.',
                          short
                              ? 'ပေးထားသော ငွေသားမှာ ကျသင့်ငွေထက် နည်းပါသည်။'
                              : 'မှန်ကန်သော ငွေပမာဏကို ထည့်ပါ။',
                        ),
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: Text(_copy('Not yet', 'မလုပ်သေးပါ')),
                ),
                FilledButton(
                  key: const ValueKey('cafe-complete-cash-confirm'),
                  onPressed: short || invalid
                      ? null
                      : () => Navigator.pop(dialogContext, true),
                  child: Text(
                    _copy('Complete cash sale', 'ငွေသားအရောင်းပြီးစီးမည်'),
                  ),
                ),
              ],
            );
          },
        ),
      );
      if (confirmed != true) return;
      final tendered = cashGiven.trim().isEmpty
          ? null
          : parseShopMmkInput(cashGiven);
      ShopPendingCashCheckout? pending;
      await _guard(
        () async {
          pending = await widget.database.beginPendingCashCheckout(
            operationId: 'cafe-sale-${_uuid.v4()}',
            checkoutKind: 'cafe',
            subjectId: order.ticket.id,
          );
          final receipt = await _store.completeCash(
            orderId: order.ticket.id,
            operationId: pending!.operationId,
            expectedTicketVersion: order.ticket.version,
            expectedStateRevision: order.stateRevision,
            cashTenderedMmk: tendered,
            requirePendingCashCheckout: true,
          );
          await _reload();
          if (!mounted) return;
          await showDialog<void>(
            context: context,
            builder: (context) => AlertDialog(
              title: Text(_copy('Sale saved', 'အရောင်းသိမ်းပြီး')),
              content: Text(
                '${_copy('Receipt', 'ပြေစာ')} ${receipt.id}\n'
                '${shopMmk(receipt.totalMmk, myanmar: widget.myanmar)}'
                '${receipt.cashChangeMmk == null ? '' : '\n${_copy('Change', 'ပြန်အမ်းငွေ')} ${shopMmk(receipt.cashChangeMmk!, myanmar: widget.myanmar)}'}',
              ),
              actions: [
                FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(_copy('Done', 'ပြီးပြီ')),
                ),
              ],
            ),
          );
        },
        onCashShiftChanged: () async {
          final activePending = pending;
          if (activePending != null) {
            await _resolveChangedCashCheckout(activePending);
          }
        },
      );
    } finally {
      if (mounted) setState(() => _cashConfirming = false);
    }
  }

  Future<void> _resolveChangedCashCheckout(
    ShopPendingCashCheckout pending,
  ) async {
    if (!mounted) return;
    final cancel = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          _copy('Cash shift changed', 'ငွေသားအဆိုင်း ပြောင်းသွားသည်'),
        ),
        content: Text(
          _copy(
            'No sale was recorded. Review the shift before retrying. Keep this cash attempt pending, or cancel it to edit the order.',
            'အရောင်းကို မမှတ်ရသေးပါ။ ထပ်မကြိုးစားမီ ငွေသားအဆိုင်းကို စစ်ပါ။ ဤငွေသားအတည်ပြုမှုကို ဆိုင်းငံ့ထားနိုင်သည် သို့မဟုတ် မှာစာပြင်ရန် ပယ်ဖျက်နိုင်သည်။',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(_copy('Keep pending', 'ဆိုင်းငံ့ထားမည်')),
          ),
          FilledButton(
            key: const ValueKey('cafe-cancel-pending-cash'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              _copy('Cancel cash attempt', 'ငွေသားအတည်ပြုမှု ပယ်ဖျက်မည်'),
            ),
          ),
        ],
      ),
    );
    if (cancel == true) {
      await widget.database.cancelPendingCashCheckout(
        checkoutKind: pending.checkoutKind,
        subjectId: pending.subjectId,
      );
      if (mounted) {
        setState(() {
          _error = _copy(
            'Cash attempt cancelled. No sale was recorded; review the order.',
            'ငွေသားအတည်ပြုမှု ပယ်ဖျက်ပြီးပါပြီ။ အရောင်းမမှတ်ရသေးပါ။ မှာစာကို ပြန်စစ်ပါ။',
          );
        });
      }
    } else if (mounted) {
      setState(() {
        _error = _copy(
          'Cash attempt is still pending. No sale was recorded; review the shift before retrying.',
          'ငွေသားအတည်ပြုမှု ဆိုင်းငံ့ထားဆဲဖြစ်သည်။ အရောင်းမမှတ်ရသေးပါ။ ထပ်မကြိုးစားမီ ငွေသားအဆိုင်းကို စစ်ပါ။',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(_copy('Cafe orders', 'ကော်ဖီဆိုင် မှာစာများ')),
      actions: [
        IconButton(
          tooltip: _copy('Refresh orders', 'မှာစာများ ပြန်ဖတ်ပါ'),
          onPressed: _busy ? null : _reload,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    floatingActionButton: FloatingActionButton.extended(
      key: const ValueKey('cafe-new-order'),
      onPressed: _busy || _choosingProduct ? null : () => _chooseProduct(),
      icon: const Icon(Icons.add),
      label: Text(_copy('New order', 'မှာစာသစ်')),
    ),
    body: SafeArea(
      child: Column(
        children: [
          if (_error != null)
            MaterialBanner(
              key: const ValueKey('cafe-error'),
              content: Text(_error!),
              actions: [
                TextButton(
                  onPressed: _reload,
                  child: Text(_copy('Refresh', 'ပြန်ဖတ်ပါ')),
                ),
              ],
            ),
          if (!_loading && _orders.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: TextField(
                key: const ValueKey('cafe-order-search'),
                controller: _searchController,
                textInputAction: TextInputAction.search,
                onChanged: (value) => setState(() => _searchQuery = value),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchQuery.isEmpty
                      ? null
                      : IconButton(
                          key: const ValueKey('cafe-order-search-clear'),
                          tooltip: _copy('Clear search', 'ရှာဖွေမှု ဖျက်မည်'),
                          onPressed: _clearSearch,
                          icon: const Icon(Icons.clear),
                        ),
                  labelText: _copy(
                    'Find table or order',
                    'စားပွဲ သို့မဟုတ် မှာစာ ရှာရန်',
                  ),
                  hintText: _copy(
                    'Order ID, table, item, or remark',
                    'မှာစာ ID၊ စားပွဲ၊ ပစ္စည်း သို့မဟုတ် မှတ်ချက်',
                  ),
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _orders.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _copy(
                          'No open cafe orders. Start one when the customer orders.',
                          'ဖွင့်ထားသော ကော်ဖီဆိုင်မှာစာ မရှိသေးပါ။ ဖောက်သည်မှာလျှင် စတင်ပါ။',
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : _visibleOrders.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _copy(
                              'No open or held order matches this search.',
                              'ဤရှာဖွေမှုနှင့် ကိုက်ညီသော ဖွင့်ထားသည့် သို့မဟုတ် ခဏသိမ်းထားသည့် မှာစာမရှိပါ။',
                            ),
                            key: const ValueKey('cafe-order-search-empty'),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          OutlinedButton(
                            key: const ValueKey(
                              'cafe-order-search-empty-clear',
                            ),
                            onPressed: _clearSearch,
                            child: Text(
                              _copy('Show all orders', 'မှာစာအားလုံး ပြမည်'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                    itemCount: _visibleOrders.length,
                    itemBuilder: (context, index) =>
                        _orderCard(_visibleOrders[index]),
                  ),
          ),
        ],
      ),
    ),
  );

  Widget _orderCard(StoredCafeOrder order) => Card(
    key: ValueKey('cafe-order:${order.ticket.id}'),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${_copy('Order', 'မှာစာ')} '
                  '${_displayOrderId(order.ticket.id)}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Chip(
                label: Text(
                  order.state == 'held'
                      ? _copy('Held', 'ခဏသိမ်း')
                      : _copy('Open', 'ဖွင့်ထား'),
                ),
              ),
            ],
          ),
          if (order.ticket.serviceContext != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _serviceContextLabel(order.ticket.serviceContext!),
                key: ValueKey('cafe-service-context:${order.ticket.id}'),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          for (final line in order.ticket.lines)
            Builder(
              builder: (context) {
                final dispatch = line.hasPreparationRoute
                    ? order.kitchenDispatchLines.singleWhere(
                        (item) => item.lineId == line.id,
                      )
                    : null;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_lineName(line)),
                            if (line.remark.isNotEmpty)
                              Text(
                                line.remark,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            if (line.hasPreparationRoute)
                              Wrap(
                                key: ValueKey('cafe-kitchen-ticket:${line.id}'),
                                spacing: 8,
                                runSpacing: 4,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  Text(
                                    '${_stationLabel(line.preparationStation)} · '
                                    '#${dispatch!.sequence} · '
                                    '${_kitchenStatusLabel(order.kitchenStatusByLine[line.id]!)}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelSmall,
                                  ),
                                  if (cafeKitchenNextState(
                                        order.kitchenStatusByLine[line.id]!,
                                      ) !=
                                      null)
                                    OutlinedButton(
                                      key: ValueKey(
                                        'cafe-kitchen-advance:${line.id}',
                                      ),
                                      onPressed: _busy
                                          ? null
                                          : () => _advanceKitchenStatus(
                                              order,
                                              line,
                                            ),
                                      child: Text(
                                        _kitchenActionLabel(
                                          order.kitchenStatusByLine[line.id]!,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                          ],
                        ),
                      ),
                      if (order.state == 'open')
                        IconButton(
                          key: ValueKey('cafe-edit-line:${line.id}'),
                          tooltip: _copy('Edit item', 'ပစ္စည်းပြင်ရန်'),
                          onPressed: _busy
                              ? null
                              : () => _editOrderLine(order, line),
                          icon: const Icon(Icons.edit_outlined),
                        ),
                      if (order.state == 'open' &&
                          order.ticket.lines.length > 1)
                        IconButton(
                          key: ValueKey('cafe-remove-line:${line.id}'),
                          tooltip: _copy('Remove item', 'ပစ္စည်းဖယ်ရန်'),
                          onPressed: _busy
                              ? null
                              : () => _removeOrderLine(order, line),
                          icon: const Icon(Icons.delete_outline),
                        ),
                      Text(shopMmk(line.totalMmk(), myanmar: widget.myanmar)),
                    ],
                  ),
                );
              },
            ),
          const Divider(),
          Text(
            '${_copy('Total', 'စုစုပေါင်း')} · '
            '${shopMmk(order.totalMmk, myanmar: widget.myanmar)}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: ValueKey('cafe-hold-resume:${order.ticket.id}'),
                onPressed: _busy ? null : () => _holdOrResume(order),
                icon: Icon(
                  order.state == 'held' ? Icons.play_arrow : Icons.pause,
                ),
                label: Text(
                  order.state == 'held'
                      ? _copy('Resume', 'ပြန်ဖွင့်')
                      : _copy('Hold', 'ခဏသိမ်း'),
                ),
              ),
              if (order.state == 'open' &&
                  (order.ticket.lines.length > 1 ||
                      order.ticket.lines.any((line) => line.quantity > 1)) &&
                  !order.ticket.lines.any((line) => line.hasPreparationRoute))
                OutlinedButton.icon(
                  key: ValueKey('cafe-split:${order.ticket.id}'),
                  onPressed: _busy ? null : () => _splitOrder(order),
                  icon: const Icon(Icons.call_split),
                  label: Text(_copy('Split bill', 'ဘေလ်ခွဲ')),
                ),
              if (_splitReversals[order.ticket.id] case final candidate?)
                OutlinedButton.icon(
                  key: ValueKey('cafe-unsplit:${order.ticket.id}'),
                  onPressed: _busy ? null : () => _undoSplit(candidate),
                  icon: const Icon(Icons.undo),
                  label: Text(_copy('Undo split', 'ဘေလ်ခွဲမှု ပြန်ဖျက်')),
                ),
              OutlinedButton.icon(
                key: ValueKey('cafe-move:${order.ticket.id}'),
                onPressed: _busy ? null : () => _moveOrder(order),
                icon: const Icon(Icons.swap_horiz),
                label: Text(
                  order.ticket.serviceContext == null
                      ? _copy('Assign table', 'စားပွဲသတ်မှတ်')
                      : _copy('Move table', 'စားပွဲပြောင်း'),
                ),
              ),
              OutlinedButton.icon(
                key: ValueKey('cafe-cancel-order:${order.ticket.id}'),
                onPressed: _busy ? null : () => _cancelOrder(order),
                icon: const Icon(Icons.cancel_outlined),
                label: Text(_copy('Cancel order', 'မှာစာပယ်ဖျက်')),
              ),
              if (order.state == 'open') ...[
                OutlinedButton.icon(
                  key: ValueKey('cafe-add-line:${order.ticket.id}'),
                  onPressed: _busy || _choosingProduct
                      ? null
                      : () => _chooseProduct(order: order),
                  icon: const Icon(Icons.add),
                  label: Text(_copy('Add item', 'ပစ္စည်းထည့်')),
                ),
                FilledButton.icon(
                  key: ValueKey('cafe-complete:${order.ticket.id}'),
                  onPressed: _busy ? null : () => _complete(order),
                  icon: const Icon(Icons.payments_outlined),
                  label: Text(_copy('Take cash', 'ငွေသားယူ')),
                ),
              ],
            ],
          ),
        ],
      ),
    ),
  );

  String _kitchenStatusLabel(String status) => switch (status) {
    'pending_local' => _copy('Pending locally', 'စက်အတွင်း စောင့်ဆိုင်းနေ'),
    'preparing_local' => _copy('Preparing locally', 'စက်အတွင်း ပြင်ဆင်နေ'),
    'ready_local' => _copy('Ready locally', 'စက်အတွင်း အသင့်ဖြစ်'),
    'served_local' => _copy('Served locally', 'စက်အတွင်း ပို့ပြီး'),
    _ => throw StateError('Unknown kitchen status.'),
  };

  String _kitchenActionLabel(String status) => switch (status) {
    'pending_local' => _copy('Start', 'စတင်'),
    'preparing_local' => _copy('Ready', 'အသင့်'),
    'ready_local' => _copy('Served', 'ပို့ပြီး'),
    _ => throw StateError('Kitchen status cannot advance.'),
  };

  String _lineName(CafeOrderLine line) {
    final details = [
      for (final modifier in line.modifiers)
        widget.myanmar ? modifier.labelMy : modifier.labelEn,
    ];
    final product =
        line.productName ??
        _productNames[line.productId] ??
        _copy('Item', 'ပစ္စည်း');
    final name = details.isEmpty ? product : '$product · ${details.join(', ')}';
    return line.quantity == 1
        ? name
        : '$name × ${shopNumber(line.quantity, myanmar: widget.myanmar)}';
  }

  String _displayOrderId(String id) {
    final value = id.startsWith('cafe-') ? id.substring(5) : id;
    return value.length > 8 ? value.substring(0, 8) : value;
  }

  String _stationLabel(String station) =>
      station == 'bar' ? _copy('Bar', 'ဘား') : _copy('Kitchen', 'မီးဖိုချောင်');

  String _serviceContextLabel(CafeServiceContext context) {
    final labels = <String>[
      if (context.areaLabel.isNotEmpty)
        '${_copy('Area', 'ဧရိယာ')}: ${context.areaLabel}',
      if (context.tableLabel.isNotEmpty)
        '${_copy('Table', 'စားပွဲ')}: ${context.tableLabel}',
    ];
    return labels.join(' · ');
  }
}

class _LineDraft {
  const _LineDraft({
    required this.quantity,
    required this.remark,
    required this.modifiers,
    required this.serviceContext,
    required this.preparationStation,
  });

  final int quantity;
  final String remark;
  final CafeServiceContext? serviceContext;
  final String? preparationStation;
  final List<CafeModifierSnapshot> modifiers;
}
