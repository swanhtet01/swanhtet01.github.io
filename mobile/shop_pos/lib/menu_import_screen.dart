import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import 'menu_import_service.dart';
import 'shop_copy.dart';
import 'shop_database.dart';
import 'shop_models.dart';

class MenuImportScreen extends StatefulWidget {
  const MenuImportScreen({
    required this.database,
    required this.authClient,
    required this.apiBaseUrl,
    required this.myanmar,
    super.key,
  });

  final ShopDatabase database;
  final SupabaseClient? authClient;
  final String apiBaseUrl;
  final bool myanmar;

  @override
  State<MenuImportScreen> createState() => _MenuImportScreenState();
}

class _MenuImportScreenState extends State<MenuImportScreen> {
  final _picker = ImagePicker();
  XFile? _photo;
  bool _photoWasCamera = false;
  bool _cloudConsent = false;
  bool _busy = false;
  String? _message;
  String? _batchId;
  List<_CandidateEditor> _editors = [];

  @override
  void dispose() {
    unawaited(
      discardCapturedMenuPhoto(_photo, createdByCamera: _photoWasCamera),
    );
    for (final editor in _editors) {
      editor.dispose();
    }
    super.dispose();
  }

  Future<void> _takePhoto() async {
    final cameraDevice =
        defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
    final source = cameraDevice ? ImageSource.camera : ImageSource.gallery;
    final photo = await _picker.pickImage(
      source: source,
      imageQuality: 80,
      maxWidth: 1800,
      maxHeight: 1800,
      requestFullMetadata: false,
    );
    if (photo == null) return;
    final previousPhoto = _photo;
    final previousWasCamera = _photoWasCamera;
    if (previousPhoto?.path != photo.path) {
      await discardCapturedMenuPhoto(
        previousPhoto,
        createdByCamera: previousWasCamera,
      );
    }
    if (!mounted) {
      await discardCapturedMenuPhoto(
        photo,
        createdByCamera: source == ImageSource.camera,
      );
      return;
    }
    setState(() {
      _photo = photo;
      _photoWasCamera = source == ImageSource.camera;
      _cloudConsent = false;
      _message = null;
      _batchId = null;
      for (final editor in _editors) {
        editor.dispose();
      }
      _editors = [];
    });
  }

  Future<bool> _ensureSignedIn() async {
    final auth = widget.authClient;
    if (auth == null) {
      setState(
        () => _message = shopCopy(
          widget.myanmar,
          'Cloud sign-in is not configured. Local setup remains available.',
          'Cloud sign-in မသတ်မှတ်ရသေးပါ။ စက်တွင်းပြင်ဆင်မှုကို ဆက်လက်အသုံးပြုနိုင်သည်။',
        ),
      );
      return false;
    }
    if (auth.auth.currentSession != null) return true;
    final signedIn = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) =>
            EmailCodeSignInScreen(authClient: auth, myanmar: widget.myanmar),
      ),
    );
    return signedIn == true && auth.auth.currentSession != null;
  }

  Future<void> _importPhoto() async {
    if (_photo == null || _busy) return;
    if (!_cloudConsent) {
      setState(
        () => _message = shopCopy(
          widget.myanmar,
          'Choose cloud consent before sending this menu photo.',
          'မီနူးဓာတ်ပုံပေးပို့ရန် Cloud သဘောတူညီချက်ကို ရွေးပါ။',
        ),
      );
      return;
    }
    final signedIn = await _ensureSignedIn();
    if (!signedIn || !mounted) return;
    final photo = _photo!;
    final photoWasCamera = _photoWasCamera;
    setState(() {
      _busy = true;
      _message = null;
    });
    final endpoint = Uri.parse(widget.apiBaseUrl)
        .resolve('/api/shop/menu-import');
    final service = MenuImportService(
      endpoint: endpoint,
      accessToken: () async =>
          widget.authClient?.auth.currentSession?.accessToken,
    );
    try {
      final candidates = await service.parsePhoto(
        photo,
        cloudConsent: _cloudConsent,
      );
      if (!mounted) return;
      setState(() {
        _editors = candidates.map(_CandidateEditor.new).toList();
        _batchId = const Uuid().v4();
        _message = candidates.isEmpty
            ? shopCopy(
                widget.myanmar,
                'No readable items were found. Try a brighter, closer photo.',
                'ဖတ်ရှုနိုင်သောပစ္စည်း မတွေ့ပါ။ ပိုလင်းပြီး ပိုနီးသောဓာတ်ပုံဖြင့် ထပ်ကြိုးစားပါ။',
              )
            : shopCopy(
                widget.myanmar,
                'Review every field. No product is added automatically.',
                'အချက်အလက်အားလုံးကို စစ်ဆေးပါ။ ကုန်ပစ္စည်းကို အလိုအလျောက် မထည့်ပါ။',
              );
      });
    } on MenuImportException catch (error) {
      if (!mounted) return;
      setState(() => _message = _friendlyError(error.code));
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _message = shopCopy(
          widget.myanmar,
          'Could not read this menu. Check your connection and try again.',
          'မီနူးကို ဖတ်မရပါ။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ပြီး ထပ်ကြိုးစားပါ။',
        ),
      );
    } finally {
      service.close();
      await discardCapturedMenuPhoto(photo, createdByCamera: photoWasCamera);
      if (mounted) {
        setState(() {
          _busy = false;
          if (_photo?.path == photo.path) {
            _photo = null;
            _photoWasCamera = false;
            _cloudConsent = false;
          }
        });
      }
    }
  }

  String _friendlyError(String code) {
    final myanmar = widget.myanmar;
    return switch (code) {
      'authentication_required' => shopCopy(
        myanmar,
        'Sign in again to use menu import.',
        'မီနူးတင်သွင်းရန် ပြန်လည်ဝင်ရောက်ပါ။',
      ),
      'menu_import_not_enabled_for_account' ||
      'menu_import_not_enabled' => shopCopy(
        myanmar,
        'AI menu import is not enabled for this account yet.',
        'ဤအကောင့်တွင် AI မီနူးတင်သွင်းမှုကို မဖွင့်ရသေးပါ။',
      ),
      'menu_import_rate_limited' => shopCopy(
        myanmar,
        'Please wait before trying another photo.',
        'နောက်ဓာတ်ပုံမတင်မီ ခဏစောင့်ပါ။',
      ),
      'photo_size_invalid' || 'unsupported_or_oversized_image' => shopCopy(
        myanmar,
        'Use a clear photo under 2.4 MB.',
        '2.4 MB အောက်ရှိ ရှင်းလင်းသောဓာတ်ပုံကို အသုံးပြုပါ။',
      ),
      'consent_required' => shopCopy(
        myanmar,
        'Choose cloud consent before sending the photo.',
        'ဓာတ်ပုံမပေးပို့မီ Cloud သဘောတူညီချက်ကို ရွေးပါ။',
      ),
      _ => shopCopy(
        myanmar,
        'Menu import is unavailable right now. Your photo was not saved.',
        'မီနူးတင်သွင်းမှုကို ယခုအသုံးမပြုနိုင်ပါ။ ဓာတ်ပုံကို မသိမ်းထားပါ။',
      ),
    };
  }

  Future<void> _addReviewedProducts() async {
    if (_editors.isEmpty || _busy) return;
    final batchId = _batchId ??= const Uuid().v4();
    try {
      final products = _editors
          .map((editor) => editor.toDraft(batchId))
          .toList(growable: false);
      setState(() => _busy = true);
      final count = await widget.database.importReviewedMenuBatch(
        batchId: batchId,
        products: products,
      );
      if (!mounted) return;
      setState(() {
        _message = shopCopy(
          widget.myanmar,
          'Added $count reviewed products to this device.',
          'စစ်ဆေးပြီးသော ကုန်ပစ္စည်း $count ခုကို ဤစက်တွင် ထည့်ပြီးပါပြီ။',
        );
        _batchId = null;
        for (final editor in _editors) {
          editor.dispose();
        }
        _editors = [];
      });
    } on FormatException {
      setState(
        () => _message = shopCopy(
          widget.myanmar,
          'Confirm every product name, price and opening-stock count before adding the batch.',
          'စာရင်းမထည့်မီ ပစ္စည်းအမည်၊ ဈေးနှုန်းနှင့် စတင်လက်ကျန်အားလုံးကို အတည်ပြုပါ။',
        ),
      );
    } on ArgumentError catch (error) {
      if (mounted) {
        setState(
          () => _message =
              error.message?.toString() ??
              shopCopy(
                widget.myanmar,
                'Review the product fields and try again.',
                'ကုန်ပစ္စည်းအချက်အလက်များကို စစ်ပြီး ထပ်ကြိုးစားပါ။',
              ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Drafts were not saved. Correct the fields and try again.',
            'မူကြမ်းများကို မသိမ်းနိုင်ပါ။ အချက်အလက်များပြင်ပြီး ထပ်ကြိုးစားပါ။',
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
        title: Text(shopCopy(myanmar, 'Add products', 'ကုန်ပစ္စည်းထည့်ရန်')),
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
                    shopCopy(myanmar, 'Menu photo', 'မီနူးဓာတ်ပုံ'),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    shopCopy(
                      myanmar,
                      'The photo is sent to SuperMega and OpenAI only after you agree and tap Read menu. It is not kept in the app database.',
                      'သဘောတူပြီး မီနူးဖတ်ရန်ကို နှိပ်မှသာ ဓာတ်ပုံကို SuperMega နှင့် OpenAI သို့ ပေးပို့မည်။ App database တွင် မသိမ်းပါ။',
                    ),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _takePhoto,
                    icon: Icon(
                      defaultTargetPlatform == TargetPlatform.android ||
                              defaultTargetPlatform == TargetPlatform.iOS
                          ? Icons.camera_alt_outlined
                          : Icons.photo_library_outlined,
                    ),
                    label: Text(
                      shopCopy(
                        myanmar,
                        defaultTargetPlatform == TargetPlatform.android ||
                                defaultTargetPlatform == TargetPlatform.iOS
                            ? (_photo == null
                                  ? 'Take menu photo'
                                  : 'Take another photo')
                            : (_photo == null
                                  ? 'Choose menu photo'
                                  : 'Choose another photo'),
                        defaultTargetPlatform == TargetPlatform.android ||
                                defaultTargetPlatform == TargetPlatform.iOS
                            ? (_photo == null
                                  ? 'မီနူးဓာတ်ပုံရိုက်ရန်'
                                  : 'ဓာတ်ပုံအသစ်ရိုက်ရန်')
                            : (_photo == null
                                  ? 'မီနူးဓာတ်ပုံရွေးရန်'
                                  : 'ဓာတ်ပုံအသစ်ရွေးရန်'),
                      ),
                    ),
                  ),
                  if (_photo != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      shopCopy(myanmar, 'Photo ready', 'ဓာတ်ပုံအသင့်ဖြစ်ပါပြီ'),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _cloudConsent,
                    onChanged: _busy
                        ? null
                        : (value) =>
                              setState(() => _cloudConsent = value ?? false),
                    title: Text(
                      shopCopy(
                        myanmar,
                        'I agree to send this photo to cloud AI for reading.',
                        'ဖတ်ရှုရန် ဤဓာတ်ပုံကို Cloud AI သို့ပေးပို့ရန် သဘောတူပါသည်။',
                      ),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  FilledButton.icon(
                    onPressed: _busy || _photo == null ? null : _importPhoto,
                    icon: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome_outlined),
                    label: Text(shopCopy(myanmar, 'Read menu', 'မီနူးဖတ်ရန်')),
                  ),
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
          if (_editors.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              shopCopy(
                myanmar,
                'Review suggestions',
                'အကြံပြုချက်များကို စစ်ဆေးပါ',
              ),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            for (var index = 0; index < _editors.length; index++)
              _CandidateCard(
                editor: _editors[index],
                index: index,
                myanmar: myanmar,
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _addReviewedProducts,
              child: Text(
                shopCopy(
                  myanmar,
                  'Add reviewed products',
                  'စစ်ဆေးပြီးပစ္စည်းများထည့်ရန်',
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              shopCopy(
                myanmar,
                'Confirm the price and opening stock for every item. Missing values are never guessed.',
                'ပစ္စည်းတိုင်း၏ ဈေးနှုန်းနှင့် စတင်လက်ကျန်ကို အတည်ပြုပါ။ မရှိသောတန်ဖိုးများကို မခန့်မှန်းပါ။',
              ),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _CandidateEditor {
  _CandidateEditor(MenuCandidate candidate)
    : name = TextEditingController(text: candidate.name),
      category = TextEditingController(text: candidate.category),
      description = TextEditingController(text: candidate.description),
      price = TextEditingController(text: candidate.priceMmk?.toString() ?? ''),
      sku = TextEditingController(),
      barcode = TextEditingController(),
      openingStock = TextEditingController();

  final TextEditingController name;
  final TextEditingController category;
  final TextEditingController description;
  final TextEditingController price;
  final TextEditingController sku;
  final TextEditingController barcode;
  final TextEditingController openingStock;
  final String id = const Uuid().v4();

  MenuDraftInput toDraft(String batchId) {
    final priceText = price.text.trim();
    final stockText = openingStock.text.trim();
    final parsedPrice = priceText.isEmpty ? null : int.tryParse(priceText);
    final parsedStock = stockText.isEmpty ? null : int.tryParse(stockText);
    if (name.text.trim().isEmpty ||
        category.text.trim().isEmpty ||
        priceText.isEmpty ||
        stockText.isEmpty ||
        parsedPrice == null ||
        parsedStock == null ||
        parsedPrice < 0 ||
        parsedPrice > 2000000000 ||
        parsedStock < 0 ||
        parsedStock > 2000000000) {
      throw const FormatException('Review fields are invalid.');
    }
    return MenuDraftInput(
      id: id,
      batchId: batchId,
      category: category.text.trim(),
      name: name.text.trim(),
      description: description.text.trim(),
      priceMmk: parsedPrice,
      sku: sku.text.trim().isEmpty ? null : sku.text.trim(),
      barcode: barcode.text.trim().isEmpty ? null : barcode.text.trim(),
      openingStock: parsedStock,
    );
  }

  void dispose() {
    name.dispose();
    category.dispose();
    description.dispose();
    price.dispose();
    sku.dispose();
    barcode.dispose();
    openingStock.dispose();
  }
}

class _CandidateCard extends StatelessWidget {
  const _CandidateCard({
    required this.editor,
    required this.index,
    required this.myanmar,
  });

  final _CandidateEditor editor;
  final int index;
  final bool myanmar;

  @override
  Widget build(BuildContext context) {
    final labels = myanmar
        ? [
            'အမည်',
            'အမျိုးအစား',
            'ဖော်ပြချက်',
            'ဈေးနှုန်း MMK',
            'SKU',
            'ဘားကုဒ်',
            'စတင်လက်ကျန်',
          ]
        : [
            'Name',
            'Category',
            'Description',
            'Price MMK',
            'SKU',
            'Barcode',
            'Opening stock',
          ];
    final fields = [
      editor.name,
      editor.category,
      editor.description,
      editor.price,
      editor.sku,
      editor.barcode,
      editor.openingStock,
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              (index + 1).toString(),
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < fields.length; i++) ...[
              TextField(
                controller: fields[i],
                keyboardType: i == 3 || i == 6
                    ? TextInputType.number
                    : TextInputType.text,
                maxLines: i == 2 ? 2 : 1,
                decoration: InputDecoration(
                  labelText: labels[i],
                  isDense: true,
                ),
              ),
              if (i != fields.length - 1) const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}

class EmailCodeSignInScreen extends StatefulWidget {
  const EmailCodeSignInScreen({
    required this.authClient,
    required this.myanmar,
    super.key,
  });

  final SupabaseClient authClient;
  final bool myanmar;

  @override
  State<EmailCodeSignInScreen> createState() => _EmailCodeSignInScreenState();
}

class _EmailCodeSignInScreenState extends State<EmailCodeSignInScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _email.text.trim();
    if (email.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.authClient.auth.signInWithOtp(
        email: email,
        shouldCreateUser: false,
      );
      if (mounted) {
        setState(() {
          _sent = true;
          _message = shopCopy(
            widget.myanmar,
            'Check your email for the sign-in code.',
            'ဝင်ရောက်ရန် code ကို အီးမေးလ်စစ်ဆေးပါ။',
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'Could not send a code. Check the email and try again.',
            'Code ပို့မရပါ။ အီးမေးလ်စစ်ပြီး ထပ်ကြိုးစားပါ။',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyCode() async {
    final email = _email.text.trim();
    final code = _code.text.trim();
    if (email.isEmpty || code.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.authClient.auth.verifyOTP(
        email: email,
        token: code,
        type: OtpType.email,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = shopCopy(
            widget.myanmar,
            'That code did not work. Request a new one and try again.',
            'Code မမှန်ပါ။ အသစ်တောင်းပြီး ထပ်ကြိုးစားပါ။',
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
        title: Text(shopCopy(myanmar, 'Sign in to Shop', 'Shop သို့ ဝင်ရန်')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: shopCopy(myanmar, 'Email', 'အီးမေးလ်'),
            ),
          ),
          if (_sent) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: shopCopy(myanmar, 'Email code', 'အီးမေးလ် code'),
              ),
            ),
          ],
          if (_message != null) ...[
            const SizedBox(height: 12),
            Text(_message!),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : (_sent ? _verifyCode : _sendCode),
            child: Text(
              _busy
                  ? shopCopy(myanmar, 'Please wait…', 'ခဏစောင့်ပါ…')
                  : shopCopy(
                      myanmar,
                      _sent ? 'Verify code' : 'Email me a code',
                      _sent ? 'Code အတည်ပြုရန်' : 'Code ပို့ရန်',
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
