package dev.bessems.usbserial;

import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;

/**
 * Network printing is the supported Shop printer transport. The transitive
 * usb_serial Dart package remains available to preserve dependency APIs, but
 * its broken optional Android USB backend is deliberately unavailable.
 */
public final class UsbSerialPlugin implements FlutterPlugin, MethodChannel.MethodCallHandler {
    private MethodChannel channel;

    @Override
    public void onAttachedToEngine(FlutterPluginBinding binding) {
        channel = new MethodChannel(binding.getBinaryMessenger(), "usb_serial");
        channel.setMethodCallHandler(this);
    }

    @Override
    public void onMethodCall(MethodCall call, MethodChannel.Result result) {
        result.error(
                "usb_transport_unavailable",
                "This Shop build supports network ESC/POS printers. USB serial printing is not enabled.",
                null);
    }

    @Override
    public void onDetachedFromEngine(FlutterPluginBinding binding) {
        if (channel != null) {
            channel.setMethodCallHandler(null);
            channel = null;
        }
    }
}
