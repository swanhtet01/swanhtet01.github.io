#include "include/unified_esc_pos_printer/unified_esc_pos_printer_plugin_c_api.h"

#include "ble_manager.h"
#include "bt_classic_manager.h"
#include "usb_print_manager.h"

#include <flutter/event_channel.h>
#include <flutter/event_stream_handler_functions.h>
#include <flutter/method_channel.h>
#include <flutter/plugin_registrar_windows.h>
#include <flutter/standard_method_codec.h>

#include <memory>
#include <string>

namespace unified_esc_pos_printer {

class UnifiedEscPosPrinterPlugin : public flutter::Plugin {
 public:
  static void RegisterWithRegistrar(flutter::PluginRegistrarWindows* registrar);

  UnifiedEscPosPrinterPlugin(flutter::PluginRegistrarWindows* registrar);
  virtual ~UnifiedEscPosPrinterPlugin();

  UnifiedEscPosPrinterPlugin(const UnifiedEscPosPrinterPlugin&) = delete;
  UnifiedEscPosPrinterPlugin& operator=(const UnifiedEscPosPrinterPlugin&) = delete;

 private:
  void HandleMethodCall(
      const flutter::MethodCall<flutter::EncodableValue>& method_call,
      std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);

  PlatformThreadDispatcher dispatcher_;

  std::unique_ptr<flutter::MethodChannel<flutter::EncodableValue>> method_channel_;
  std::unique_ptr<flutter::EventChannel<flutter::EncodableValue>> ble_scan_channel_;
  std::unique_ptr<flutter::EventChannel<flutter::EncodableValue>> bt_scan_channel_;
  std::unique_ptr<flutter::EventChannel<flutter::EncodableValue>> connection_state_channel_;

  std::unique_ptr<BleManager> ble_manager_;
  std::unique_ptr<BtClassicManager> bt_manager_;
  UsbPrintManager usb_manager_;

  // Connection state event sink
  std::unique_ptr<flutter::EventSink<flutter::EncodableValue>> connection_state_sink_;
};

void UnifiedEscPosPrinterPlugin::RegisterWithRegistrar(
    flutter::PluginRegistrarWindows* registrar) {
  auto plugin = std::make_unique<UnifiedEscPosPrinterPlugin>(registrar);
  registrar->AddPlugin(std::move(plugin));
}

UnifiedEscPosPrinterPlugin::UnifiedEscPosPrinterPlugin(
    flutter::PluginRegistrarWindows* registrar) {
  auto messenger = registrar->messenger();

  // Initialize platform-thread dispatcher for marshalling callbacks.
  HWND hwnd = registrar->GetView()->GetNativeWindow();
  dispatcher_.Initialize(hwnd);

  method_channel_ = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      messenger, "com.elriztechnology.unified_esc_pos_printer/methods",
      &flutter::StandardMethodCodec::GetInstance());
  method_channel_->SetMethodCallHandler(
      [this](const auto& call, auto result) {
        HandleMethodCall(call, std::move(result));
      });

  ble_manager_ = std::make_unique<BleManager>();
  ble_manager_->SetDispatcher(&dispatcher_);

  bt_manager_ = std::make_unique<BtClassicManager>();
  bt_manager_->SetDispatcher(&dispatcher_);

  // BLE scan event channel
  ble_scan_channel_ = std::make_unique<flutter::EventChannel<flutter::EncodableValue>>(
      messenger, "com.elriztechnology.unified_esc_pos_printer/ble_scan",
      &flutter::StandardMethodCodec::GetInstance());
  ble_scan_channel_->SetStreamHandler(ble_manager_->CreateScanStreamHandler());

  // BT Classic discovery event channel
  bt_scan_channel_ = std::make_unique<flutter::EventChannel<flutter::EncodableValue>>(
      messenger, "com.elriztechnology.unified_esc_pos_printer/bt_scan",
      &flutter::StandardMethodCodec::GetInstance());
  bt_scan_channel_->SetStreamHandler(bt_manager_->CreateDiscoveryStreamHandler());

  // Connection state event channel
  connection_state_channel_ = std::make_unique<flutter::EventChannel<flutter::EncodableValue>>(
      messenger, "com.elriztechnology.unified_esc_pos_printer/connection_state",
      &flutter::StandardMethodCodec::GetInstance());

  auto cs_on_listen = [this](
      const flutter::EncodableValue*,
      std::unique_ptr<flutter::EventSink<flutter::EncodableValue>>&& events)
      -> std::unique_ptr<flutter::StreamHandlerError<flutter::EncodableValue>> {
    connection_state_sink_ = std::move(events);
    ble_manager_->connection_state_callback = [this](const std::string& state) {
      if (connection_state_sink_) {
        flutter::EncodableMap event;
        event[flutter::EncodableValue("type")] = flutter::EncodableValue("ble");
        event[flutter::EncodableValue("state")] = flutter::EncodableValue(state);
        connection_state_sink_->Success(flutter::EncodableValue(event));
      }
    };
    bt_manager_->connection_state_callback = [this](const std::string& state) {
      if (connection_state_sink_) {
        flutter::EncodableMap event;
        event[flutter::EncodableValue("type")] = flutter::EncodableValue("bt");
        event[flutter::EncodableValue("state")] = flutter::EncodableValue(state);
        connection_state_sink_->Success(flutter::EncodableValue(event));
      }
    };
    return nullptr;
  };
  auto cs_on_cancel = [this](const flutter::EncodableValue*)
      -> std::unique_ptr<flutter::StreamHandlerError<flutter::EncodableValue>> {
    ble_manager_->connection_state_callback = nullptr;
    bt_manager_->connection_state_callback = nullptr;
    connection_state_sink_.reset();
    return nullptr;
  };
  connection_state_channel_->SetStreamHandler(
      std::make_unique<flutter::StreamHandlerFunctions<flutter::EncodableValue>>(
          cs_on_listen, cs_on_cancel));
}

UnifiedEscPosPrinterPlugin::~UnifiedEscPosPrinterPlugin() {
  ble_manager_->Dispose();
  bt_manager_->Dispose();
  dispatcher_.Shutdown();
}

void UnifiedEscPosPrinterPlugin::HandleMethodCall(
    const flutter::MethodCall<flutter::EncodableValue>& method_call,
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  const auto& method = method_call.method_name();
  const auto* args = std::get_if<flutter::EncodableMap>(method_call.arguments());

  auto get_string = [&args](const std::string& key) -> const std::string* {
    if (!args) return nullptr;
    auto it = args->find(flutter::EncodableValue(key));
    if (it != args->end()) {
      if (auto* s = std::get_if<std::string>(&it->second)) return s;
    }
    return nullptr;
  };

  auto get_int = [&args](const std::string& key, int default_val) -> int {
    if (!args) return default_val;
    auto it = args->find(flutter::EncodableValue(key));
    if (it != args->end()) {
      if (auto* v = std::get_if<int32_t>(&it->second)) return *v;
    }
    return default_val;
  };

  auto get_bool = [&args](const std::string& key, bool default_val) -> bool {
    if (!args) return default_val;
    auto it = args->find(flutter::EncodableValue(key));
    if (it != args->end()) {
      if (auto* v = std::get_if<bool>(&it->second)) return *v;
    }
    return default_val;
  };

  if (method == "requestPermissions") {
    // No runtime permissions needed on Windows
    result->Success(flutter::EncodableValue(true));
  }
  // ── BLE ──────────────────────────────────────────────────────────────
  else if (method == "startBleScan") {
    ble_manager_->StartScan(get_int("timeoutMs", 5000), std::move(result));
  } else if (method == "stopBleScan") {
    ble_manager_->StopScan(std::move(result));
  } else if (method == "bleConnect") {
    auto* device_id = get_string("deviceId");
    if (!device_id) {
      result->Error("INVALID_ARGS", "deviceId is required");
      return;
    }
    auto* svc = get_string("serviceUuid");
    auto* chr = get_string("characteristicUuid");
    ble_manager_->Connect(*device_id, get_int("timeoutMs", 10000), svc, chr,
                          std::move(result));
  } else if (method == "bleGetMtu") {
    ble_manager_->GetMtu(std::move(result));
  } else if (method == "bleSupportsWriteWithoutResponse") {
    ble_manager_->SupportsWriteWithoutResponse(std::move(result));
  } else if (method == "bleWrite") {
    std::vector<uint8_t> data;
    if (args) {
      auto it = args->find(flutter::EncodableValue("data"));
      if (it != args->end()) {
        if (auto* bytes = std::get_if<std::vector<uint8_t>>(&it->second)) {
          data = *bytes;
        }
      }
    }
    ble_manager_->Write(data, get_bool("withoutResponse", false),
                        get_int("chunkSize", 0), get_int("chunkDelayMs", 0),
                        get_int("bytesPerSecond", 0), std::move(result));
  } else if (method == "bleDisconnect") {
    ble_manager_->Disconnect(std::move(result));
  }
  // ── Bluetooth Classic (RFCOMM/SPP) ──────────────────────────────────
  else if (method == "getBondedDevices") {
    bt_manager_->GetBondedDevices(std::move(result));
  } else if (method == "startBtDiscovery") {
    bt_manager_->StartDiscovery(get_int("timeoutMs", 5000), std::move(result));
  } else if (method == "stopBtDiscovery") {
    bt_manager_->StopDiscovery(std::move(result));
  } else if (method == "btConnect") {
    auto* address = get_string("address");
    if (!address) {
      result->Error("INVALID_ARGS", "address is required");
      return;
    }
    bt_manager_->Connect(*address, get_int("timeoutMs", 10000),
                          std::move(result));
  } else if (method == "btWrite") {
    std::vector<uint8_t> data;
    if (args) {
      auto it = args->find(flutter::EncodableValue("data"));
      if (it != args->end()) {
        if (auto* bytes = std::get_if<std::vector<uint8_t>>(&it->second)) {
          data = *bytes;
        }
      }
    }
    bt_manager_->Write(data, get_int("chunkSize", 512),
                       get_int("chunkDelayMs", 0), std::move(result));
  } else if (method == "btDisconnect") {
    bt_manager_->Disconnect(std::move(result));
  }
  // ── USB via Windows Print Spooler ─────────────────────────────────────
  else if (method == "usbGetList") {
    auto printers = UsbPrintManager::ListPrinters();
    flutter::EncodableList list;
    for (const auto& p : printers) {
      flutter::EncodableMap m;
      m[flutter::EncodableValue("name")] = flutter::EncodableValue(p.name);
      m[flutter::EncodableValue("model")] = flutter::EncodableValue(p.model);
      m[flutter::EncodableValue("isDefault")] = flutter::EncodableValue(p.is_default);
      m[flutter::EncodableValue("isAvailable")] = flutter::EncodableValue(p.is_available);
      list.push_back(flutter::EncodableValue(m));
    }
    result->Success(flutter::EncodableValue(list));
  } else if (method == "usbConnect") {
    auto* name = get_string("name");
    if (!name) {
      result->Error("INVALID_ARGS", "name is required");
      return;
    }
    if (usb_manager_.Open(*name)) {
      result->Success(flutter::EncodableValue(true));
    } else {
      result->Error("USB_OPEN_FAILED", "Failed to open printer: " + *name);
    }
  } else if (method == "usbWrite") {
    std::vector<uint8_t> data;
    if (args) {
      auto it = args->find(flutter::EncodableValue("data"));
      if (it != args->end()) {
        if (auto* bytes = std::get_if<std::vector<uint8_t>>(&it->second)) {
          data = *bytes;
        }
      }
    }
    if (usb_manager_.PrintBytes(data)) {
      result->Success(flutter::EncodableValue(true));
    } else {
      result->Error("USB_WRITE_FAILED", "Failed to write to printer");
    }
  } else if (method == "usbDisconnect") {
    usb_manager_.Close();
    result->Success(flutter::EncodableValue(true));
  } else {
    result->NotImplemented();
  }
}

}  // namespace unified_esc_pos_printer

void UnifiedEscPosPrinterPluginCApiRegisterWithRegistrar(
    FlutterDesktopPluginRegistrarRef registrar) {
  unified_esc_pos_printer::UnifiedEscPosPrinterPlugin::RegisterWithRegistrar(
      flutter::PluginRegistrarManager::GetInstance()
          ->GetRegistrar<flutter::PluginRegistrarWindows>(registrar));
}
