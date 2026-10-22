import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_today_screen.dart';

int? parseStockQuantity(String? value) {
  final input = value?.trim() ?? '';
  if (input.isEmpty) return null;
  final normalized = String.fromCharCodes(
    input.runes.map(
      (digit) =>
          digit >= 0x1040 && digit <= 0x1049 ? digit - 0x1040 + 0x30 : digit,
    ),
  );
  return int.tryParse(normalized);
}

String _stockProductReference(ShopProduct product, bool myanmar) {
  final parts = <String>[];
  if (product.sku case final String sku when sku.trim().isNotEmpty) {
    parts.add('${shopCopy(myanmar, 'SKU', 'ကုန်ပစ္စည်းကုဒ်')} ${sku.trim()}');
  }
  if (product.barcode case final String barcode
      when barcode.trim().isNotEmpty) {
    parts.add('${shopCopy(myanmar, 'Barcode', 'ဘားကုဒ်')} ${barcode.trim()}');
  }
  if (parts.isNotEmpty) return parts.join(' · ');
  return '${shopCopy(myanmar, 'Reference', 'အမှတ်')} ${product.id}';
}

class StockScreen extends StatefulWidget {
  const StockScreen({
    required this.database,
    required this.myanmar,
    this.embeddedTaskShell = false,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final bool embeddedTaskShell;

  @override
  State<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<StockScreen> {
  final _search = TextEditingController();
  late final Stream<List<ShopProduct>> _products;

  @override
  void initState() {
    super.initState();
    _products = widget.database.watchActiveProducts();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _changeStock(
    ShopProduct product, {
    required bool showReference,
  }) async {
    final result = await showDialog<int>(
      context: context,
      builder: (_) => _StockChangeDialog(
        database: widget.database,
        product: product,
        myanmar: widget.myanmar,
        showReference: showReference,
      ),
    );
    if (!mounted || result == null) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            shopCopy(
              widget.myanmar,
              'Stock saved · $result on hand',
              'လက်ကျန်သိမ်းပြီး · ${shopNumber(result, myanmar: true)} ခု',
            ),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: widget.embeddedTaskShell
        ? null
        : AppBar(title: Text(shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်'))),
    body: SafeArea(
      child: StreamBuilder<List<ShopProduct>>(
        stream: _products,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text(
                shopCopy(
                  widget.myanmar,
                  'Could not load stock. Reopen this screen and try again.',
                  'လက်ကျန်စာရင်း မဖွင့်နိုင်ပါ။ ဤစာမျက်နှာကို ပြန်ဖွင့်ပါ။',
                ),
              ),
            );
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final query = _search.text.trim().toLowerCase();
          final products =
              snapshot.data!
                  .where(
                    (item) =>
                        query.isEmpty ||
                        item.name.toLowerCase().contains(query) ||
                        (item.barcode?.toLowerCase().contains(query) ?? false),
                  )
                  .toList()
                ..sort((left, right) {
                  final stockOrder = left.onHand.compareTo(right.onHand);
                  if (stockOrder != 0) return stockOrder;
                  return left.name.toLowerCase().compareTo(
                    right.name.toLowerCase(),
                  );
                });
          final seenNames = <String>{};
          final duplicateNames = <String>{};
          for (final product in snapshot.data!) {
            final name = product.name.trim().toLowerCase();
            if (!seenNames.add(name)) duplicateNames.add(name);
          }
          final wide = MediaQuery.sizeOf(context).width >= 700;
          final count = shopNumber(products.length, myanmar: widget.myanmar);
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1100),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    if (widget.embeddedTaskShell) ...[
                      ShopTaskPageHeader(
                        title: shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်'),
                        myanmar: widget.myanmar,
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (wide) ...[
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Text(
                          shopCopy(
                            widget.myanmar,
                            query.isEmpty
                                ? '$count products'
                                : '$count matches',
                            query.isEmpty
                                ? 'ကုန်ပစ္စည်း $count မျိုး'
                                : 'ကိုက်ညီမှု $count ခု',
                          ),
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                              ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextField(
                      key: const ValueKey('stock-search'),
                      controller: _search,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search),
                        hintText: shopCopy(
                          widget.myanmar,
                          'Name or barcode',
                          'အမည် / ဘားကုဒ်',
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (wide && products.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              flex: 5,
                              child: Text(
                                shopCopy(
                                  widget.myanmar,
                                  'Product',
                                  'ကုန်ပစ္စည်း',
                                ),
                              ),
                            ),
                            Expanded(
                              flex: 2,
                              child: Text(
                                shopCopy(widget.myanmar, 'On hand', 'လက်ကျန်'),
                              ),
                            ),
                            const SizedBox(width: 104),
                          ],
                        ),
                      ),
                    Expanded(
                      child: products.isEmpty
                          ? Center(
                              child: Text(
                                shopCopy(
                                  widget.myanmar,
                                  query.isEmpty
                                      ? 'No products yet'
                                      : 'No matching products',
                                  query.isEmpty
                                      ? 'ကုန်ပစ္စည်း မရှိသေးပါ'
                                      : 'ကိုက်ညီသောပစ္စည်း မတွေ့ပါ',
                                ),
                              ),
                            )
                          : ListView.separated(
                              itemCount: products.length,
                              separatorBuilder: (_, _) => wide
                                  ? const Divider(height: 1)
                                  : const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final item = products[index];
                                final hasCode =
                                    (item.sku?.trim().isNotEmpty ?? false) ||
                                    (item.barcode?.trim().isNotEmpty ?? false);
                                final showReference =
                                    hasCode ||
                                    duplicateNames.contains(
                                      item.name.trim().toLowerCase(),
                                    );
                                final compact =
                                    MediaQuery.sizeOf(context).width < 480;
                                final textTheme = Theme.of(context).textTheme;
                                final productTextStyle = wide
                                    ? textTheme.titleMedium
                                    : textTheme.bodyMedium;
                                final colors = Theme.of(context).colorScheme;
                                final details = Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.name,
                                      maxLines: compact ? 3 : 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: productTextStyle?.copyWith(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (showReference)
                                      Text(
                                        _stockProductReference(
                                          item,
                                          widget.myanmar,
                                        ),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .onSurfaceVariant,
                                            ),
                                      ),
                                  ],
                                );
                                final onHand = Text(
                                  shopCopy(
                                    widget.myanmar,
                                    '${item.onHand} in stock',
                                    '${shopNumber(item.onHand, myanmar: true)} ခု လက်ကျန်',
                                  ),
                                  style: wide
                                      ? Theme.of(context).textTheme.titleMedium
                                      : null,
                                );
                                Future<void> openStockChange() => _changeStock(
                                  item,
                                  showReference: showReference,
                                );
                                final update = OutlinedButton(
                                  key: ValueKey('stock-update-${item.id}'),
                                  onPressed: openStockChange,
                                  child: Text(
                                    shopCopy(
                                      widget.myanmar,
                                      'Update',
                                      'ပြင်ရန်',
                                    ),
                                  ),
                                );
                                final stockActionLabel = [
                                  shopCopy(
                                    widget.myanmar,
                                    'Adjust stock for ${item.name}',
                                    '${item.name} ၏ လက်ကျန် ပြင်ရန်',
                                  ),
                                  shopCopy(
                                    widget.myanmar,
                                    '${item.onHand} in stock',
                                    '${shopNumber(item.onHand, myanmar: true)} ခု လက်ကျန်',
                                  ),
                                  if (showReference)
                                    _stockProductReference(
                                      item,
                                      widget.myanmar,
                                    ),
                                ].join('. ');
                                if (wide) {
                                  return ColoredBox(
                                    color: colors.surface,
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 16,
                                        vertical: 14,
                                      ),
                                      child: Row(
                                        children: [
                                          Expanded(flex: 5, child: details),
                                          Expanded(flex: 2, child: onHand),
                                          SizedBox(width: 104, child: update),
                                        ],
                                      ),
                                    ),
                                  );
                                }
                                return Card(
                                  clipBehavior: Clip.antiAlias,
                                  child: compact
                                      ? Semantics(
                                          button: true,
                                          label: stockActionLabel,
                                          onTap: openStockChange,
                                          child: ExcludeSemantics(
                                            child: InkWell(
                                              key: ValueKey(
                                                'stock-row-${item.id}',
                                              ),
                                              onTap: openStockChange,
                                              child: Padding(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 12,
                                                      vertical: 12,
                                                    ),
                                                child: Row(
                                                  children: [
                                                    Expanded(
                                                      child: Column(
                                                        crossAxisAlignment:
                                                            CrossAxisAlignment
                                                                .start,
                                                        children: [
                                                          details,
                                                          const SizedBox(
                                                            height: 4,
                                                          ),
                                                          onHand,
                                                        ],
                                                      ),
                                                    ),
                                                    const SizedBox(width: 8),
                                                    Icon(
                                                      Icons.chevron_right,
                                                      color: colors
                                                          .onSurfaceVariant,
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                          ),
                                        )
                                      : Padding(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 8,
                                          ),
                                          child: Row(
                                            children: [
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment.start,
                                                  children: [details, onHand],
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              update,
                                            ],
                                          ),
                                        ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    ),
  );
}

class _StockChangeDialog extends StatefulWidget {
  const _StockChangeDialog({
    required this.database,
    required this.product,
    required this.myanmar,
    required this.showReference,
  });

  final ShopDatabase database;
  final ShopProduct product;
  final bool myanmar;
  final bool showReference;

  @override
  State<_StockChangeDialog> createState() => _StockChangeDialogState();
}

class _StockChangeDialogState extends State<_StockChangeDialog> {
  final _formKey = GlobalKey<FormState>();
  final _quantity = TextEditingController();
  final _operationId = const Uuid().v4();
  String _kind = 'receive';
  late int? _reorderLevel;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _reorderLevel = widget.product.reorderLevel;
  }

  @override
  void dispose() {
    _quantity.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result = await widget.database.changeStock(
        operationId: _operationId,
        productId: widget.product.id,
        kind: _kind,
        quantity: parseStockQuantity(_quantity.text)!,
        expectedOnHand: widget.product.onHand,
      );
      if (mounted) Navigator.of(context).pop(result);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error =
            error is StateError &&
                error.message.toString().startsWith('Stock changed.')
            ? shopCopy(
                widget.myanmar,
                'Stock changed. Reopen this item and check the count.',
                'လက်ကျန် ပြောင်းလဲသွားပါပြီ။ ပစ္စည်းကို ပြန်ဖွင့်ပြီး စစ်ဆေးပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Could not save stock. Check the quantity and try again.',
                'လက်ကျန် မသိမ်းနိုင်ပါ။ အရေအတွက်စစ်ပြီး ပြန်ကြိုးစားပါ။',
              );
      });
    }
  }

  Future<void> _editReorderLevel() async {
    final saved = await showDialog<_SavedReorderLevel>(
      context: context,
      builder: (_) => _ReorderLevelDialog(
        database: widget.database,
        product: widget.product,
        expectedReorderLevel: _reorderLevel,
        myanmar: widget.myanmar,
      ),
    );
    if (mounted && saved != null) {
      setState(() => _reorderLevel = saved.value);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.product.name),
    content: Form(
      key: _formKey,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.showReference) ...[
              Text(_stockProductReference(widget.product, widget.myanmar)),
              const SizedBox(height: 8),
            ],
            Text(
              shopCopy(
                widget.myanmar,
                '${widget.product.onHand} currently in stock',
                'လက်ရှိ ${shopNumber(widget.product.onHand, myanmar: true)} ခု လက်ကျန်',
              ),
            ),
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(
                  value: 'receive',
                  label: Text(shopCopy(widget.myanmar, 'Receive', 'လက်ခံရန်')),
                ),
                ButtonSegment(
                  value: 'count',
                  label: Text(shopCopy(widget.myanmar, 'Count', 'ရေတွက်ရန်')),
                ),
              ],
              selected: {_kind},
              onSelectionChanged: _saving
                  ? null
                  : (values) => setState(() {
                      _kind = values.first;
                      _quantity.clear();
                      _error = null;
                    }),
            ),
            const SizedBox(height: 16),
            Text(
              _kind == 'receive'
                  ? shopCopy(
                      widget.myanmar,
                      'Add units from a delivery.',
                      'ရောက်ရှိလာသော ပစ္စည်းအရေအတွက်ကို ထည့်ပါ။',
                    )
                  : shopCopy(
                      widget.myanmar,
                      'Set stock to the physical count.',
                      'လက်တွေ့ရေတွက်ထားသော လက်ကျန်ကို ထည့်ပါ။',
                    ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: const ValueKey('stock-change-quantity'),
              controller: _quantity,
              autofocus: true,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9\u1040-\u1049]')),
              ],
              decoration: InputDecoration(
                labelText: _kind == 'receive'
                    ? shopCopy(
                        widget.myanmar,
                        'Units received',
                        'လက်ခံရရှိသောအရေအတွက်',
                      )
                    : shopCopy(
                        widget.myanmar,
                        'Counted on hand',
                        'ရေတွက်ထားသောလက်ကျန်',
                      ),
              ),
              validator: (value) {
                final quantity = parseStockQuantity(value);
                if (quantity == null ||
                    quantity < (_kind == 'receive' ? 1 : 0) ||
                    quantity > 2000000000) {
                  return shopCopy(
                    widget.myanmar,
                    'Enter a valid whole quantity.',
                    'မှန်ကန်သောအရေအတွက်ကို ထည့်ပါ။',
                  );
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            ListTile(
              key: const ValueKey('stock-alert-edit'),
              contentPadding: EdgeInsets.zero,
              title: Text(
                shopCopy(widget.myanmar, 'Low-stock alert', 'လက်ကျန်နည်း သတိပေးချက်'),
              ),
              subtitle: Text(
                _reorderLevel == null
                    ? shopCopy(widget.myanmar, 'Off', 'ပိတ်ထားသည်')
                    : shopCopy(
                        widget.myanmar,
                        'At ${shopNumber(_reorderLevel!, myanmar: false)} units or less',
                        '${shopNumber(_reorderLevel!, myanmar: true)} ခုနှင့်အောက်',
                      ),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: _saving ? null : _editReorderLevel,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.of(context).pop(),
        child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
      ),
      FilledButton(
        onPressed: _saving ? null : _save,
        child: Text(shopCopy(widget.myanmar, 'Save stock', 'လက်ကျန်သိမ်းရန်')),
      ),
    ],
  );
}

class _SavedReorderLevel {
  const _SavedReorderLevel(this.value);

  final int? value;
}

class _ReorderLevelDialog extends StatefulWidget {
  const _ReorderLevelDialog({
    required this.database,
    required this.product,
    required this.expectedReorderLevel,
    required this.myanmar,
  });

  final ShopDatabase database;
  final ShopProduct product;
  final int? expectedReorderLevel;
  final bool myanmar;

  @override
  State<_ReorderLevelDialog> createState() => _ReorderLevelDialogState();
}

class _ReorderLevelDialogState extends State<_ReorderLevelDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _level;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _level = TextEditingController(
      text: widget.expectedReorderLevel?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _level.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final value = parseStockQuantity(_level.text);
    try {
      await widget.database.setReorderLevel(
        productId: widget.product.id,
        expectedReorderLevel: widget.expectedReorderLevel,
        reorderLevel: value,
      );
      if (mounted) Navigator.of(context).pop(_SavedReorderLevel(value));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error is StateError &&
                error.message.toString().startsWith('Low-stock alert changed.')
            ? shopCopy(
                widget.myanmar,
                'Alert changed. Reopen this item.',
                'သတိပေးချက် ပြောင်းလဲသွားပါပြီ။ ပစ္စည်းကို ပြန်ဖွင့်ပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Could not save alert. Try again.',
                'သတိပေးချက် မသိမ်းနိုင်ပါ။ ထပ်ကြိုးစားပါ။',
              );
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(shopCopy(widget.myanmar, 'Low-stock alert', 'လက်ကျန်နည်း သတိပေးချက်')),
    content: Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.product.name),
          const SizedBox(height: 16),
          TextFormField(
            key: const ValueKey('reorder-level-input'),
            controller: _level,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[0-9\u1040-\u1049]')),
            ],
            decoration: InputDecoration(
              labelText: shopCopy(
                widget.myanmar,
                'Alert at or below',
                'ဤလက်ကျန်နှင့်အောက်တွင် သတိပေးရန်',
              ),
              helperText: shopCopy(
                widget.myanmar,
                'Leave empty to turn off.',
                'ပိတ်ရန် ဗလာထားပါ။',
              ),
            ),
            validator: (text) {
              if ((text?.trim() ?? '').isEmpty) return null;
              final value = parseStockQuantity(text);
              if (value == null || value < 0 || value > 2000000000) {
                return shopCopy(
                  widget.myanmar,
                  'Enter a valid whole quantity.',
                  'မှန်ကန်သောအရေအတွက်ကို ထည့်ပါ။',
                );
              }
              return null;
            },
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.of(context).pop(),
        child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
      ),
      FilledButton(
        onPressed: _saving ? null : _save,
        child: Text(shopCopy(widget.myanmar, 'Save alert', 'သတိပေးချက်သိမ်းရန်')),
      ),
    ],
  );
}
