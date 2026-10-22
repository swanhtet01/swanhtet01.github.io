import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'connected_orders_service.dart';
import 'menu_import_screen.dart';
import 'shop_copy.dart';

/// A read-only connected view. It does not alter this device's sale or stock.
class ConnectedOrdersScreen extends StatefulWidget {
  const ConnectedOrdersScreen({
    required this.myanmar,
    required this.authClient,
    required this.apiBaseUrl,
    super.key,
  });

  final bool myanmar;
  final SupabaseClient? authClient;
  final String apiBaseUrl;

  @override
  State<ConnectedOrdersScreen> createState() => _ConnectedOrdersScreenState();
}

class _ConnectedOrdersScreenState extends State<ConnectedOrdersScreen> {
  ConnectedOrdersService? _service;
  StreamSubscription<AuthState>? _authSubscription;
  ConnectedOrdersSnapshot? _snapshot;
  String? _activeUserId;
  String? _error;
  bool _loading = false;
  int _requestGeneration = 0;

  @override
  void initState() {
    super.initState();
    final auth = widget.authClient;
    final endpoint = connectedOrdersEndpoint(widget.apiBaseUrl);
    _activeUserId = auth?.auth.currentSession?.user.id;
    if (auth != null && endpoint != null) {
      _service = ConnectedOrdersService(
        endpoint: endpoint,
        accessToken: () async => auth.auth.currentSession?.accessToken,
      );
      _authSubscription = auth.auth.onAuthStateChange.listen((event) {
        if (!mounted) return;
        final nextUser = event.session?.user.id;
        if (nextUser == _activeUserId) return;
        _requestGeneration++;
        setState(() {
          _activeUserId = nextUser;
          _snapshot = null;
          _error = null;
          _loading = false;
        });
        if (nextUser != null) unawaited(_refresh());
      });
    }
    if (_activeUserId != null && _service != null) {
      unawaited(_refresh());
    }
  }

  @override
  void dispose() {
    _requestGeneration++;
    unawaited(_authSubscription?.cancel());
    _service?.close();
    super.dispose();
  }

  Future<void> _refresh() async {
    final service = _service;
    final userId = _activeUserId;
    if (service == null || userId == null || _loading) return;
    final generation = ++_requestGeneration;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final next = await service.fetch();
      if (!mounted || generation != _requestGeneration || _activeUserId != userId) {
        return;
      }
      setState(() {
        _snapshot = next;
        _loading = false;
      });
    } on ConnectedOrdersException catch (error) {
      if (!mounted || generation != _requestGeneration || _activeUserId != userId) {
        return;
      }
      setState(() {
        _error = error.code;
        // Only a transport failure may leave a prior same-session read visible.
        if (error.code != 'refresh_unavailable') _snapshot = null;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || generation != _requestGeneration || _activeUserId != userId) {
        return;
      }
      setState(() {
        _error = 'refresh_unavailable';
        _loading = false;
      });
    }
  }

  Future<void> _signIn() async {
    final auth = widget.authClient;
    if (auth == null) return;
    await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => EmailCodeSignInScreen(
          authClient: auth,
          myanmar: widget.myanmar,
        ),
      ),
    );
    if (mounted && _activeUserId != null && _snapshot == null) {
      unawaited(_refresh());
    }
  }

  String _stateLabel(ConnectedOrder order) => switch (order.status) {
    'confirmed' => shopCopy(widget.myanmar, 'Confirmed', 'အတည်ပြုပြီး'),
    'preparing' => shopCopy(widget.myanmar, 'Preparing', 'ပြင်ဆင်နေ'),
    'ready' => shopCopy(widget.myanmar, 'Ready', 'အသင့်ဖြစ်ပြီ'),
    'completed' => shopCopy(widget.myanmar, 'Completed', 'ပြီးစီးပြီ'),
    'cancelled' => shopCopy(widget.myanmar, 'Cancelled', 'ပယ်ဖျက်ပြီး'),
    _ => shopCopy(widget.myanmar, 'Status unavailable', 'အခြေအနေ မသိနိုင်ပါ'),
  };

  String _paymentLabel(ConnectedOrder order) {
    if (order.refundStatus == 'due') {
      return shopCopy(widget.myanmar, 'Refund due', 'ငွေပြန်အမ်းရန်ရှိ');
    }
    if (order.refundStatus == 'settled') {
      return shopCopy(widget.myanmar, 'Refund recorded', 'ငွေပြန်အမ်းမှု မှတ်တမ်းရှိ');
    }
    return order.paymentStatus == 'reconciled'
        ? shopCopy(widget.myanmar, 'Payment recorded', 'ငွေပေးချေမှု မှတ်တမ်းရှိ')
        : shopCopy(widget.myanmar, 'Payment not recorded', 'ငွေပေးချေမှု မမှတ်ရသေး');
  }

  String _dateTime(BuildContext context, DateTime value) {
    final local = value.toLocal();
    final strings = MaterialLocalizations.of(context);
    return '${strings.formatShortDate(local)} ${TimeOfDay.fromDateTime(local).format(context)}';
  }

  Widget _message(String text, {Widget? action}) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 460),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text, textAlign: TextAlign.center),
            if (action != null) ...[
              const SizedBox(height: 16),
              action,
            ],
          ],
        ),
      ),
    ),
  );

  String _errorMessage(String code) => switch (code) {
    'sign_in_required' => shopCopy(
      widget.myanmar,
      'Your Shop session ended. Sign in again to view connected orders.',
      'ချိတ်ဆက်ထားသော အော်ဒါများကြည့်ရန် Shop သို့ ပြန်ဝင်ပါ။',
    ),
    'access_denied' => shopCopy(
      widget.myanmar,
      'This account cannot view connected Shop orders.',
      'ဤအကောင့်ဖြင့် ချိတ်ဆက်ထားသော Shop အော်ဒါများ မကြည့်နိုင်ပါ။',
    ),
    'snapshot_too_large' => shopCopy(
      widget.myanmar,
      'There are too many orders for this app view. Use the browser for now.',
      'ဤအက်ပ်တွင် ပြရန် အော်ဒါများလွန်းသည်။ ယခု ဘရောက်ဇာဖြင့် ကြည့်ပါ။',
    ),
    'endpoint_unavailable' => shopCopy(
      widget.myanmar,
      'Connected orders are not available in this build yet.',
      'ဤအက်ပ်ဗားရှင်းတွင် ချိတ်ဆက်အော်ဒါများ မရသေးပါ။',
    ),
    'invalid_snapshot' => shopCopy(
      widget.myanmar,
      'Orders could not be read safely. Try again later.',
      'အော်ဒါများကို လုံခြုံစွာ မဖတ်နိုင်ပါ။ နောက်မှ ထပ်စမ်းပါ။',
    ),
    _ => shopCopy(
      widget.myanmar,
      'Could not refresh connected orders. Check your connection and try again.',
      'ချိတ်ဆက်အော်ဒါများ ပြန်မဖတ်နိုင်ပါ။ အင်တာနက်ကို စစ်ပြီး ထပ်စမ်းပါ။',
    ),
  };

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final error = _error;
    final auth = widget.authClient;
    return Scaffold(
      appBar: AppBar(
        title: Text(shopCopy(widget.myanmar, 'Connected orders', 'ချိတ်ဆက်အော်ဒါများ')),
        actions: [
          if (_activeUserId != null && _service != null)
            IconButton(
              tooltip: shopCopy(widget.myanmar, 'Refresh orders', 'အော်ဒါများ ပြန်ဖတ်ရန်'),
              onPressed: _loading ? null : _refresh,
              icon: const Icon(Icons.refresh),
            ),
        ],
      ),
      body: SafeArea(
        child: _service == null
            ? _message(
                auth == null
                    ? shopCopy(
                        widget.myanmar,
                        'Account sign-in is not configured in this build.',
                        'ဤအက်ပ်ဗားရှင်းတွင် အကောင့်ဝင်ရန် မစီစဉ်ထားပါ။',
                      )
                    : _errorMessage('endpoint_unavailable'),
              )
            : _activeUserId == null
                ? _message(
                    shopCopy(
                      widget.myanmar,
                      'Sign in to see confirmed orders for your Shop account.',
                      'Shop အကောင့်၏ အတည်ပြုပြီး အော်ဒါများကြည့်ရန် ဝင်ပါ။',
                    ),
                    action: auth == null
                        ? null
                        : FilledButton(
                            onPressed: _signIn,
                            child: Text(shopCopy(widget.myanmar, 'Sign in', 'ဝင်ရန်')),
                          ),
                  )
                : _loading && snapshot == null
                    ? const Center(child: CircularProgressIndicator())
                    : snapshot == null
                        ? _message(
                            _errorMessage(error ?? 'refresh_unavailable'),
                            action: error == 'sign_in_required' && auth != null
                                ? FilledButton(
                                    onPressed: _signIn,
                                    child: Text(shopCopy(widget.myanmar, 'Sign in again', 'ပြန်ဝင်ရန်')),
                                  )
                                : OutlinedButton(
                                    onPressed: _loading ? null : _refresh,
                                    child: Text(shopCopy(widget.myanmar, 'Try again', 'ထပ်စမ်းရန်')),
                                  ),
                          )
                        : RefreshIndicator(
                            onRefresh: _refresh,
                            child: ListView(
                              padding: const EdgeInsets.all(16),
                              children: [
                                if (_loading) const LinearProgressIndicator(),
                                if (error != null) ...[
                                  Card(
                                    color: Theme.of(context).colorScheme.errorContainer,
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Text(
                                        '${_errorMessage(error)} ${shopCopy(widget.myanmar, 'Showing an earlier read.', 'ယခင်ဖတ်ထားသော အော်ဒါများကို ပြနေသည်။')}',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                ],
                                Text(
                                  shopCopy(
                                    widget.myanmar,
                                    'Confirmed orders · local sales and stock are separate',
                                    'အတည်ပြုပြီး အော်ဒါများ · ဤစက်၏ အရောင်းနှင့် လက်ကျန်စာရင်း သီးခြားဖြစ်သည်',
                                  ),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  snapshot.workspaceUpdatedAt == null
                                      ? shopCopy(widget.myanmar, 'No server update yet', 'ဆာဗာတွင် ပြောင်းလဲမှု မရှိသေးပါ')
                                      : '${shopCopy(widget.myanmar, 'Server updated', 'ဆာဗာမှ ပြောင်းလဲချိန်')} ${_dateTime(context, snapshot.workspaceUpdatedAt!)}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                Text(
                                  '${shopCopy(widget.myanmar, 'Last read', 'နောက်ဆုံးဖတ်ချိန်')} ${_dateTime(context, snapshot.receivedAt)}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                const SizedBox(height: 16),
                                if (snapshot.orders.isEmpty)
                                  _message(shopCopy(widget.myanmar, 'No confirmed orders here yet.', 'အတည်ပြုပြီး အော်ဒါ မရှိသေးပါ။')),
                                for (final order in snapshot.orders) ...[
                                  _orderCard(context, order),
                                  const SizedBox(height: 8),
                                ],
                              ],
                            ),
                          ),
      ),
    );
  }

  Widget _orderCard(BuildContext context, ConnectedOrder order) {
    final type = Theme.of(context).textTheme;
    final items = order.lines.map((line) {
      final name = widget.myanmar && line.nameMy != null ? line.nameMy! : line.name;
      return '$name × ${shopNumber(line.quantity, myanmar: widget.myanmar)}';
    }).join(' · ');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 12,
              runSpacing: 4,
              children: [
                Text(
                  order.id,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.labelMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                Text(
                  shopMmk(order.totalMmk, myanmar: widget.myanmar),
                  style: type.titleMedium?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${_stateLabel(order)} · ${_paymentLabel(order)}',
              style: type.bodyMedium,
            ),
            const SizedBox(height: 6),
            Text(
              order.lineSnapshotsAvailable
                  ? items
                  : shopCopy(widget.myanmar, 'Item details unavailable for this older order', 'အော်ဒါဟောင်းအတွက် ပစ္စည်းအသေးစိတ် မရှိပါ'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.bodyMedium,
            ),
            if (order.paymentDueAt != null) ...[
              const SizedBox(height: 4),
              Text('${shopCopy(widget.myanmar, 'Payment due', 'ငွေပေးရန် နောက်ဆုံးချိန်')} ${_dateTime(context, order.paymentDueAt!)}', style: type.bodySmall),
            ],
            if (order.promisedAt != null) ...[
              const SizedBox(height: 4),
              Text('${shopCopy(widget.myanmar, 'Promised', 'ပေးပို့ရန်ကတိချိန်')} ${_dateTime(context, order.promisedAt!)}', style: type.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}
