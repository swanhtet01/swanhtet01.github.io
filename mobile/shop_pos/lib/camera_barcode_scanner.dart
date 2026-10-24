import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'shop_copy.dart';
import 'shop_runtime_scope.dart';

const _productBarcodeFormats = <BarcodeFormat>{
  BarcodeFormat.ean13,
  BarcodeFormat.ean8,
  BarcodeFormat.upcA,
  BarcodeFormat.upcE,
  BarcodeFormat.code128,
  BarcodeFormat.code39,
  BarcodeFormat.code93,
  BarcodeFormat.itf14,
  BarcodeFormat.itf2of5,
  BarcodeFormat.itf2of5WithChecksum,
  BarcodeFormat.codabar,
  BarcodeFormat.dataBar,
  BarcodeFormat.dataBarExpanded,
  BarcodeFormat.dataBarLimited,
};

typedef ShopCameraViewBuilder = Widget Function(
  BuildContext context,
  ValueChanged<String> onScanned,
  ValueChanged<MobileScannerErrorCode> onError,
);

bool get shopCameraScanningSupported =>
    defaultTargetPlatform == TargetPlatform.android ||
    defaultTargetPlatform == TargetPlatform.iOS;

/// Returns one decoded code. Closing the page or losing camera access returns
/// null, so neither path can modify a sale draft.
class CameraBarcodeScanner extends StatefulWidget {
  const CameraBarcodeScanner({
    required this.myanmar,
    this.cameraViewBuilder,
    this.runtimeScope,
    this.testOnlyAllowMissingRuntimeScope = false,
    super.key,
  });

  final bool myanmar;
  final ShopCameraViewBuilder? cameraViewBuilder;
  final ShopRuntimeScope? runtimeScope;
  final bool testOnlyAllowMissingRuntimeScope;

  @override
  State<CameraBarcodeScanner> createState() => _CameraBarcodeScannerState();
}

class _CameraBarcodeScannerState extends State<CameraBarcodeScanner> {
  bool _claimed = false;
  MobileScannerErrorCode? _cameraError;

  void _accept(String value) {
    final code = value.trim();
    if (_claimed || _cameraError != null || code.isEmpty || !mounted) return;
    _claimed = true;
    Navigator.of(context).pop(code);
  }

  void _reportError(MobileScannerErrorCode error) {
    if (_claimed || _cameraError != null || !mounted) return;
    setState(() => _cameraError = error);
  }

  Widget _cameraView() {
    final scope = requireShopRuntimeScopeOrTestSeam(
      widget.runtimeScope,
      testOnlyAllowMissingRuntimeScope: widget.testOnlyAllowMissingRuntimeScope,
    );
    final builder = widget.cameraViewBuilder;
    if (scope == null) {
      if (builder == null) throw StateError('shop_runtime_scope_required');
      return builder(context, _accept, _reportError);
    }
    if (!scope.capabilities.camera) throw StateError('shop_camera_unavailable');
    if (builder != null) return builder(context, _accept, _reportError);
    return MobileScanner(
      onDetect: (capture) {
        for (final barcode in capture.barcodes) {
          if (!_productBarcodeFormats.contains(barcode.format)) continue;
          final code = barcode.rawValue;
          if (code != null && code.trim().isNotEmpty) {
            _accept(code);
            break;
          }
        }
      },
      onDetectError: (_, _) =>
          _reportError(MobileScannerErrorCode.genericError),
      errorBuilder: (_, error) {
        // The plugin builds this while reporting camera permission errors.
        // Move our state update outside that build frame.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _reportError(error.errorCode);
        });
        return const SizedBox.expand();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final error = _cameraError;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: shopCopy(
            widget.myanmar,
            'Cancel scan',
            'ဖတ်ခြင်းပယ်ဖျက်ရန်',
          ),
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(shopCopy(widget.myanmar, 'Scan barcode', 'ဘားကုဒ်ဖတ်ရန်')),
      ),
      body: SafeArea(
        child: !shopCameraScanningSupported || error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.no_photography_outlined, size: 44),
                      const SizedBox(height: 12),
                      Text(
                        !shopCameraScanningSupported
                            ? shopCopy(
                                widget.myanmar,
                                'Camera scanning is available on Android and iPad. Use the search field for a keyboard scanner here.',
                                'ကင်မရာဖြင့် ဖတ်ခြင်းကို Android နှင့် iPad တွင်သာ သုံးနိုင်ပါသည်။ ဤစက်တွင် ကီးဘုတ်စကင်နာအတွက် ရှာဖွေမှုအကွက်ကို သုံးပါ။',
                              )
                            : error == MobileScannerErrorCode.permissionDenied
                            ? shopCopy(
                                widget.myanmar,
                                'Camera access was denied. No item was added.',
                                'ကင်မရာအသုံးပြုခွင့်ကို ငြင်းပယ်ထားပါသည်။ ပစ္စည်းမထည့်ခဲ့ပါ။',
                              )
                            : shopCopy(
                                widget.myanmar,
                                'The camera is unavailable. No item was added.',
                                'ကင်မရာကို အသုံးမပြုနိုင်ပါ။ ပစ္စည်းမထည့်ခဲ့ပါ။',
                              ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: Text(
                          shopCopy(
                            widget.myanmar,
                            'Return to Sell',
                            'အရောင်းစာမျက်နှာသို့ ပြန်ရန်',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              )
            : Stack(
                fit: StackFit.expand,
                children: [
                  _cameraView(),
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: IgnorePointer(
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        color: Colors.black87,
                        child: Text(
                          shopCopy(
                            widget.myanmar,
                            'Hold one product barcode in view.',
                            'ကုန်ပစ္စည်းဘားကုဒ်တစ်ခုကို ကင်မရာရှေ့တွင် ထားပါ။',
                          ),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
