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
    this.active = true,
    this.embeddedTaskShell = false,
    this.onAddProduct,
    super.key,
  });

  final ShopDatabase database;
  final bool myanmar;
  final bool active;
  final bool embeddedTaskShell;
  final VoidCallback? onAddProduct;

  @override
  State<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<StockScreen> {
  final _search = TextEditingController();
  final _thumbnailFutures = <String, Future<Uint8List?>>{};
  late Stream<List<ShopProduct>> _products;

  Future<Uint8List?> _thumbnailFor(String productId) {
    if (_thumbnailFutures.length >= 64 &&
        !_thumbnailFutures.containsKey(productId)) {
      _thumbnailFutures.clear();
    }
    return _thumbnailFutures.putIfAbsent(
      productId,
      () => widget.database.readProductThumbnail(productId),
    );
  }

  @override
  void initState() {
    super.initState();
    _products = widget.database.watchActiveProducts();
  }

  @override
  void didUpdateWidget(covariant StockScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.database != widget.database) {
      _products = widget.database.watchActiveProducts();
      _thumbnailFutures.clear();
    } else if (!oldWidget.active && widget.active) {
      // A photo can change in Sell while this page stays in the task stack.
      _thumbnailFutures.clear();
    }
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

  Future<void> _editProduct(ShopProduct product) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _EditProductDialog(
        database: widget.database,
        product: product,
        myanmar: widget.myanmar,
      ),
    );
    if (!mounted || saved != true) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            shopCopy(
              widget.myanmar,
              'Product details saved.',
              'ကုန်ပစ္စည်းအချက်အလက်များ သိမ်းပြီးပါပြီ။',
            ),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: widget.embeddedTaskShell
        ? null
        : AppBar(
            title: Text(shopCopy(widget.myanmar, 'Stock', 'လက်ကျန်')),
            actions: [
              if (widget.onAddProduct != null)
                IconButton(
                  key: const ValueKey('stock-add-product'),
                  tooltip: shopCopy(
                    widget.myanmar,
                    'Add product',
                    'ကုန်ပစ္စည်းထည့်ရန်',
                  ),
                  onPressed: widget.onAddProduct,
                  icon: const Icon(Icons.add),
                ),
            ],
          ),
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
                  final leftNeedsAttention =
                      left.onHand == 0 ||
                      (left.reorderLevel != null &&
                          left.onHand <= left.reorderLevel!);
                  final rightNeedsAttention =
                      right.onHand == 0 ||
                      (right.reorderLevel != null &&
                          right.onHand <= right.reorderLevel!);
                  if (leftNeedsAttention != rightNeedsAttention) {
                    return leftNeedsAttention ? -1 : 1;
                  }
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
                        trailing:
                            widget.onAddProduct == null || products.isEmpty
                            ? null
                            : MediaQuery.sizeOf(context).width < 360 &&
                                  MediaQuery.textScalerOf(context).scale(1) >
                                      1.2
                            ? IconButton.filledTonal(
                                key: const ValueKey('stock-add-product'),
                                tooltip: shopCopy(
                                  widget.myanmar,
                                  'Add product',
                                  'ကုန်ပစ္စည်းထည့်ရန်',
                                ),
                                onPressed: widget.onAddProduct,
                                icon: const Icon(Icons.add),
                              )
                            : OutlinedButton.icon(
                                key: const ValueKey('stock-add-product'),
                                onPressed: widget.onAddProduct,
                                icon: const Icon(Icons.add),
                                label: Text(
                                  shopCopy(
                                    widget.myanmar,
                                    'Add product',
                                    'ကုန်ပစ္စည်းထည့်ရန်',
                                  ),
                                ),
                              ),
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
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
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
                                  if (widget.embeddedTaskShell &&
                                      widget.onAddProduct != null &&
                                      query.isEmpty) ...[
                                    const SizedBox(height: 12),
                                    FilledButton.icon(
                                      key: const ValueKey('stock-add-product'),
                                      onPressed: widget.onAddProduct,
                                      icon: const Icon(Icons.add),
                                      label: Text(
                                        shopCopy(
                                          widget.myanmar,
                                          'Add first product',
                                          'ပထမကုန်ပစ္စည်းထည့်ရန်',
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            )
                          : ListView.separated(
                              itemCount: products.length,
                              separatorBuilder: (_, _) =>
                                  const Divider(height: 1),
                              itemBuilder: (context, index) {
                                final item = products[index];
                                final threshold = item.reorderLevel;
                                final lowAlertLevel =
                                    threshold != null &&
                                        item.onHand <= threshold
                                    ? threshold
                                    : null;
                                final hasCode =
                                    (item.sku?.trim().isNotEmpty ?? false) ||
                                    (item.barcode?.trim().isNotEmpty ?? false);
                                final showReference =
                                    hasCode ||
                                    duplicateNames.contains(
                                      item.name.trim().toLowerCase(),
                                    );
                                final compact = !wide;
                                final textTheme = Theme.of(context).textTheme;
                                final productTextStyle = wide
                                    ? textTheme.titleMedium
                                    : textTheme.bodyMedium;
                                final colors = Theme.of(context).colorScheme;
                                final priceLabel = shopCopy(
                                  widget.myanmar,
                                  '${shopNumber(item.priceMmk, myanmar: false)} MMK',
                                  '${shopNumber(item.priceMmk, myanmar: true)} ကျပ်',
                                );
                                final conciseReference = [
                                  if (item.sku?.trim().isNotEmpty ?? false)
                                    item.sku!.trim(),
                                  if (item.barcode?.trim().isNotEmpty ?? false)
                                    item.barcode!.trim(),
                                ].join(' / ');
                                final displayReference =
                                    conciseReference.isEmpty
                                    ? item.id
                                    : conciseReference;
                                final details = Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.name,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: productTextStyle?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        height: 1.3,
                                      ),
                                    ),
                                    Text(
                                      compact && showReference
                                          ? '$priceLabel · $displayReference'
                                          : priceLabel,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: textTheme.bodySmall?.copyWith(
                                        color: colors.onSurfaceVariant,
                                        fontWeight: FontWeight.w500,
                                        fontFeatures: const [
                                          FontFeature.tabularFigures(),
                                        ],
                                      ),
                                    ),
                                    if (showReference && wide)
                                      Text(
                                        _stockProductReference(
                                          item,
                                          widget.myanmar,
                                        ),
                                        maxLines: compact ? 1 : 2,
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
                                final detailsWithPhoto = Row(
                                  children: [
                                    FutureBuilder<Uint8List?>(
                                      future: _thumbnailFor(item.id),
                                      builder: (context, image) {
                                        final bytes = image.data;
                                        if (bytes == null) {
                                          return const SizedBox.shrink();
                                        }
                                        return Padding(
                                          padding: const EdgeInsets.only(
                                            right: 10,
                                          ),
                                          child: ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              8,
                                            ),
                                            child: Image.memory(
                                              bytes,
                                              key: ValueKey(
                                                'stock-photo-${item.id}',
                                              ),
                                              width: 44,
                                              height: 44,
                                              fit: BoxFit.cover,
                                              errorBuilder:
                                                  (_, error, stackTrace) =>
                                                      const SizedBox(
                                                        width: 44,
                                                        height: 44,
                                                      ),
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                    Expanded(child: details),
                                  ],
                                );
                                final onHand = Text(
                                  shopCopy(
                                    widget.myanmar,
                                    '${item.onHand} in stock',
                                    '${shopNumber(item.onHand, myanmar: true)} ခု လက်ကျန်',
                                  ),
                                  style:
                                      (wide
                                              ? textTheme.titleMedium
                                              : textTheme.bodyMedium)
                                          ?.copyWith(
                                            fontWeight: FontWeight.w600,
                                            color: item.onHand == 0
                                                ? colors.error
                                                : lowAlertLevel == null
                                                ? colors.onSurface
                                                : const Color(0xff88530e),
                                          ),
                                );
                                final reorderNote = lowAlertLevel == null
                                    ? null
                                    : Text(
                                        shopCopy(
                                          widget.myanmar,
                                          'Reorder at ${shopNumber(lowAlertLevel, myanmar: false)}',
                                          'ပြန်မှာရန်: ${shopNumber(lowAlertLevel, myanmar: true)} ခု',
                                        ),
                                        style: textTheme.bodySmall?.copyWith(
                                          color: const Color(0xff88530e),
                                        ),
                                      );
                                Future<void> openStockChange() => _changeStock(
                                  item,
                                  showReference: showReference,
                                );
                                final fullAdjustLabel = shopCopy(
                                  widget.myanmar,
                                  'Adjust stock',
                                  'လက်ကျန်ပြင်ရန်',
                                );
                                final narrowPhone =
                                    MediaQuery.sizeOf(context).width < 360;
                                final update = Tooltip(
                                  message: fullAdjustLabel,
                                  excludeFromSemantics: true,
                                  child: OutlinedButton(
                                    key: ValueKey('stock-update-${item.id}'),
                                    onPressed: openStockChange,
                                    style: OutlinedButton.styleFrom(
                                      minimumSize: const Size(0, 48),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                      ),
                                    ),
                                    child: Semantics(
                                      label: narrowPhone
                                          ? fullAdjustLabel
                                          : null,
                                      child: ExcludeSemantics(
                                        excluding: narrowPhone,
                                        child: Text(
                                          narrowPhone
                                              ? shopCopy(
                                                  widget.myanmar,
                                                  'Adjust',
                                                  'ပြင်ရန်',
                                                )
                                              : fullAdjustLabel,
                                          maxLines: 1,
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                    ),
                                  ),
                                );
                                final more = PopupMenuButton<String>(
                                  key: ValueKey('stock-more-${item.id}'),
                                  tooltip: shopCopy(
                                    widget.myanmar,
                                    'More for ${item.name}',
                                    '${item.name} အတွက် နောက်ထပ်',
                                  ),
                                  icon: const Icon(Icons.more_vert),
                                  onSelected: (value) {
                                    if (value == 'edit') {
                                      unawaited(_editProduct(item));
                                    }
                                  },
                                  itemBuilder: (_) => [
                                    PopupMenuItem(
                                      key: ValueKey('stock-edit-${item.id}'),
                                      value: 'edit',
                                      child: Text(
                                        shopCopy(
                                          widget.myanmar,
                                          'Edit product',
                                          'ကုန်ပစ္စည်း ပြင်ရန်',
                                        ),
                                      ),
                                    ),
                                  ],
                                );
                                final stockSummaryLabel = [
                                  item.name,
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
                                  if (lowAlertLevel != null)
                                    shopCopy(
                                      widget.myanmar,
                                      'Low at $lowAlertLevel',
                                      '${shopNumber(lowAlertLevel, myanmar: true)} ခုနှင့်အောက် သတိပေး',
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
                                          Expanded(
                                            flex: 5,
                                            child: detailsWithPhoto,
                                          ),
                                          Expanded(
                                            flex: 2,
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [onHand, ?reorderNote],
                                            ),
                                          ),
                                          SizedBox(width: 168, child: update),
                                          more,
                                        ],
                                      ),
                                    ),
                                  );
                                }
                                return ColoredBox(
                                  color: colors.surface,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 4,
                                      vertical: 8,
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Semantics(
                                                label: stockSummaryLabel,
                                                child: ExcludeSemantics(
                                                  child: Container(
                                                    key: ValueKey(
                                                      'stock-row-${item.id}',
                                                    ),
                                                    child: detailsWithPhoto,
                                                  ),
                                                ),
                                              ),
                                            ),
                                            more,
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        if (narrowPhone) ...[
                                          ExcludeSemantics(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [onHand, ?reorderNote],
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          Align(
                                            alignment: Alignment.centerRight,
                                            child: SizedBox(
                                              width: 120,
                                              child: update,
                                            ),
                                          ),
                                        ] else
                                          Row(
                                            children: [
                                              Expanded(
                                                child: ExcludeSemantics(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      onHand,
                                                      ?reorderNote,
                                                    ],
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              SizedBox(
                                                width: 120,
                                                child: update,
                                              ),
                                            ],
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

class _EditProductDialog extends StatefulWidget {
  const _EditProductDialog({
    required this.database,
    required this.product,
    required this.myanmar,
  });

  final ShopDatabase database;
  final ShopProduct product;
  final bool myanmar;

  @override
  State<_EditProductDialog> createState() => _EditProductDialogState();
}

class _EditProductDialogState extends State<_EditProductDialog> {
  final _formKey = GlobalKey<FormState>();
  final _operationId = const Uuid().v4();
  late final _name = TextEditingController(text: widget.product.name);
  late final _barcode = TextEditingController(
    text: widget.product.barcode ?? '',
  );
  late final _price = TextEditingController(
    text: widget.product.priceMmk.toString(),
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _barcode.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.database.updateProductDetails(
        operationId: _operationId,
        productId: widget.product.id,
        expectedName: widget.product.name,
        expectedPriceMmk: widget.product.priceMmk,
        expectedBarcode: widget.product.barcode,
        name: _name.text,
        priceMmk: parseShopMmkInput(_price.text, maximum: 2000000000)!,
        barcode: _barcode.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error =
            error is StateError &&
                error.message ==
                    'That barcode is already assigned to a product.'
            ? shopCopy(
                widget.myanmar,
                'That barcode already belongs to another product.',
                'ဤဘားကုဒ်ကို အခြားပစ္စည်းတွင် သုံးထားပြီးပါပြီ။',
              )
            : error is StateError &&
                  error.message == 'Product changed. Reopen this item.'
            ? shopCopy(
                widget.myanmar,
                'Product changed. Reopen it and check the details.',
                'ပစ္စည်းအချက်အလက် ပြောင်းသွားပါပြီ။ ပြန်ဖွင့်ပြီး စစ်ဆေးပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Could not save this product. Check the details and try again.',
                'ပစ္စည်းကို မသိမ်းနိုင်ပါ။ အချက်အလက်များစစ်ပြီး ထပ်စမ်းပါ။',
              );
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    title: Text(
      shopCopy(widget.myanmar, 'Edit product', 'ကုန်ပစ္စည်း ပြင်ရန်'),
    ),
    content: Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextFormField(
            key: const ValueKey('stock-edit-name'),
            controller: _name,
            enabled: !_saving,
            decoration: InputDecoration(
              labelText: shopCopy(widget.myanmar, 'Name', 'အမည်'),
            ),
            validator: (value) =>
                value == null ||
                    value.trim().isEmpty ||
                    value.trim().length > 160
                ? shopCopy(
                    widget.myanmar,
                    'Enter a product name.',
                    'ကုန်ပစ္စည်းအမည် ထည့်ပါ။',
                  )
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('stock-edit-price'),
            controller: _price,
            enabled: !_saving,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: shopCopy(
                widget.myanmar,
                'Price · MMK',
                'ဈေးနှုန်း · ကျပ်',
              ),
            ),
            validator: (value) {
              final amount = parseShopMmkInput(value, maximum: 2000000000);
              return amount == null
                  ? shopCopy(
                      widget.myanmar,
                      'Enter a whole MMK amount.',
                      'ကျပ်ဈေးနှုန်းကို ဂဏန်းအပြည့်ထည့်ပါ။',
                    )
                  : null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('stock-edit-barcode'),
            controller: _barcode,
            enabled: !_saving,
            decoration: InputDecoration(
              labelText: shopCopy(
                widget.myanmar,
                'Barcode (optional)',
                'ဘားကုဒ် (မဖြစ်မနေမဟုတ်ပါ)',
              ),
            ),
            validator: (value) => (value?.trim().length ?? 0) > 64
                ? shopCopy(
                    widget.myanmar,
                    'Barcode is too long.',
                    'ဘားကုဒ် ရှည်လွန်းပါသည်။',
                  )
                : null,
          ),
          const SizedBox(height: 12),
          Text(
            shopCopy(
              widget.myanmar,
              'To change the quantity, use Adjust stock.',
              'အရေအတွက်ပြောင်းရန် လက်ကျန်ပြင်ရန်ကို သုံးပါ။',
            ),
            style: Theme.of(context).textTheme.bodySmall,
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
        onPressed: _saving ? null : () => Navigator.of(context).pop(false),
        child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
      ),
      FilledButton(
        key: const ValueKey('stock-edit-save'),
        onPressed: _saving ? null : _save,
        child: Text(shopCopy(widget.myanmar, 'Save', 'သိမ်းရန်')),
      ),
    ],
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
  late final TextEditingController _level;
  final _operationId = const Uuid().v4();
  String _kind = 'receive';
  late int? _reorderLevel;
  bool _saving = false;
  bool _savingAlert = false;
  bool _showAlertEditor = false;
  String? _error;
  String? _alertError;

  @override
  void initState() {
    super.initState();
    _reorderLevel = widget.product.reorderLevel;
    _level = TextEditingController(text: _reorderLevel?.toString() ?? '');
  }

  @override
  void dispose() {
    _quantity.dispose();
    _level.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || _savingAlert) return;
    if (_showAlertEditor && parseStockQuantity(_level.text) != _reorderLevel) {
      setState(() {
        _alertError = shopCopy(
          widget.myanmar,
          'Save the alert change first.',
          'သတိပေးချက်ပြောင်းလဲမှုကို အရင်သိမ်းပါ။',
        );
      });
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;
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

  Future<void> _saveAlert() async {
    if (_saving || _savingAlert) return;
    final value = parseStockQuantity(_level.text);
    if (_level.text.trim().isNotEmpty &&
        (value == null || value < 0 || value > 2000000000)) {
      setState(() {
        _alertError = shopCopy(
          widget.myanmar,
          'Enter a valid whole quantity.',
          'မှန်ကန်သောအရေအတွက်ကို ထည့်ပါ။',
        );
      });
      return;
    }
    if (value == _reorderLevel) {
      setState(() {
        _showAlertEditor = false;
        _alertError = null;
      });
      return;
    }
    setState(() {
      _savingAlert = true;
      _alertError = null;
    });
    try {
      await widget.database.setReorderLevel(
        productId: widget.product.id,
        expectedReorderLevel: _reorderLevel,
        reorderLevel: value,
      );
      if (!mounted) return;
      setState(() {
        _reorderLevel = value;
        _showAlertEditor = false;
        _savingAlert = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _savingAlert = false;
        _alertError =
            error is StateError &&
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
                shopCopy(
                  widget.myanmar,
                  'Low-stock alert',
                  'လက်ကျန်နည်း သတိပေးချက်',
                ),
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
              trailing: Icon(
                _showAlertEditor ? Icons.expand_less : Icons.expand_more,
              ),
              onTap: _saving || _savingAlert
                  ? null
                  : () => setState(() {
                      _showAlertEditor = !_showAlertEditor;
                      _level.text = _reorderLevel?.toString() ?? '';
                      _alertError = null;
                    }),
            ),
            if (_showAlertEditor) ...[
              TextField(
                key: const ValueKey('reorder-level-input'),
                controller: _level,
                enabled: !_saving && !_savingAlert,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                    RegExp('[0-9\u1040-\u1049]'),
                  ),
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
                  errorText: _alertError,
                ),
              ),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  onPressed: _saving || _savingAlert ? null : _saveAlert,
                  child: Text(
                    shopCopy(
                      widget.myanmar,
                      'Save alert',
                      'သတိပေးချက်သိမ်းရန်',
                    ),
                  ),
                ),
              ),
            ],
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
        onPressed: _saving || _savingAlert
            ? null
            : () => Navigator.of(context).pop(),
        child: Text(shopCopy(widget.myanmar, 'Cancel', 'မလုပ်တော့ပါ')),
      ),
      FilledButton(
        onPressed: _saving || _savingAlert ? null : _save,
        child: Text(shopCopy(widget.myanmar, 'Save stock', 'လက်ကျန်သိမ်းရန်')),
      ),
    ],
  );
}
