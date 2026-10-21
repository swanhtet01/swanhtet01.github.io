import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import 'shop_copy.dart';
import 'shop_database.dart';

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
    parts.add('SKU ${sku.trim()}');
  }
  if (product.barcode case final String barcode
      when barcode.trim().isNotEmpty) {
    parts.add('${shopCopy(myanmar, 'Barcode', 'ဘားကုဒ်')} ${barcode.trim()}');
  }
  if (parts.isNotEmpty) return parts.join(' · ');
  return '${shopCopy(myanmar, 'Reference', 'အမှတ်')} ${product.id}';
}

class StockScreen extends StatefulWidget {
  const StockScreen({required this.database, required this.myanmar, super.key});

  final ShopDatabase database;
  final bool myanmar;

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

  Future<void> _changeStock(ShopProduct product) async {
    final result = await showDialog<int>(
      context: context,
      builder: (_) => _StockChangeDialog(
        database: widget.database,
        product: product,
        myanmar: widget.myanmar,
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
              'လက်ကျန်သိမ်းပြီး · $result ခု',
            ),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်'))),
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
          final products = snapshot.data!
              .where(
                (item) =>
                    query.isEmpty ||
                    item.name.toLowerCase().contains(query) ||
                    (item.barcode?.toLowerCase().contains(query) ?? false),
              )
              .toList();
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 900),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextField(
                      key: const ValueKey('stock-search'),
                      controller: _search,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search),
                        hintText: shopCopy(
                          widget.myanmar,
                          'Find a product or scan barcode',
                          'ကုန်ပစ္စည်းရှာရန် သို့မဟုတ် ဘားကုဒ်ဖတ်ရန်',
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
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
                              separatorBuilder: (_, _) =>
                                  const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final item = products[index];
                                return Card(
                                  child: Padding(
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
                                            children: [
                                              Text(
                                                item.name,
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodyMedium
                                                    ?.copyWith(
                                                      fontWeight:
                                                          FontWeight.w600,
                                                    ),
                                              ),
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
                                              Text(
                                                shopCopy(
                                                  widget.myanmar,
                                                  '${item.onHand} in stock',
                                                  '${item.onHand} ခု လက်ကျန်',
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        OutlinedButton(
                                          key: ValueKey(
                                            'stock-update-${item.id}',
                                          ),
                                          onPressed: () => _changeStock(item),
                                          child: Text(
                                            shopCopy(
                                              widget.myanmar,
                                              'Update',
                                              'ပြင်ရန်',
                                            ),
                                          ),
                                        ),
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
  });

  final ShopDatabase database;
  final ShopProduct product;
  final bool myanmar;

  @override
  State<_StockChangeDialog> createState() => _StockChangeDialogState();
}

class _StockChangeDialogState extends State<_StockChangeDialog> {
  final _formKey = GlobalKey<FormState>();
  final _quantity = TextEditingController();
  final _operationId = const Uuid().v4();
  String _kind = 'receive';
  bool _saving = false;
  String? _error;

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
            Text(_stockProductReference(widget.product, widget.myanmar)),
            const SizedBox(height: 8),
            Text(
              shopCopy(
                widget.myanmar,
                '${widget.product.onHand} currently in stock',
                'လက်ရှိ ${widget.product.onHand} ခု လက်ကျန်',
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
