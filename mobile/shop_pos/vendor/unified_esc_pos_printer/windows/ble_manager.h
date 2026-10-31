#ifndef BLE_MANAGER_H_
#define BLE_MANAGER_H_

#include <flutter/event_channel.h>
#include <flutter/event_sink.h>
#include <flutter/event_stream_handler_functions.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <winrt/Windows.Devices.Bluetooth.h>
#include <winrt/Windows.Devices.Bluetooth.Advertisement.h>
#include <winrt/Windows.Devices.Bluetooth.GenericAttributeProfile.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.Streams.h>

#include <windows.h>
#include <commctrl.h>

#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace unified_esc_pos_printer {

// Marshals callbacks from background threads to the Flutter platform (UI)
// thread using Win32 window messages.
class PlatformThreadDispatcher {
 public:
  void Initialize(HWND hwnd);
  void Shutdown();

  // Queue a callback to run on the platform thread.
  void Post(std::function<void()> callback);

 private:
  void DrainQueue();

  static constexpr UINT kWmFlutterCallback = WM_APP + 1;
  static LRESULT CALLBACK SubclassProc(HWND hwnd, UINT msg, WPARAM wParam,
                                        LPARAM lParam, UINT_PTR subclass_id,
                                        DWORD_PTR ref_data);

  HWND hwnd_ = nullptr;
  std::mutex mutex_;
  std::queue<std::function<void()>> queue_;
};

class BleManager {
 public:
  BleManager();
  ~BleManager();

  void SetDispatcher(PlatformThreadDispatcher* dispatcher);

  // Scan stream handler for EventChannel
  std::unique_ptr<flutter::StreamHandler<flutter::EncodableValue>>
      CreateScanStreamHandler();

  void StartScan(int timeout_ms,
                  std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);
  void StopScan(std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);

  void Connect(const std::string& device_id, int timeout_ms,
               const std::string* service_uuid,
               const std::string* characteristic_uuid,
               std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);

  void GetMtu(std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);
  void SupportsWriteWithoutResponse(
      std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);

  void Write(const std::vector<uint8_t>& data, bool without_response,
             int max_chunk_size, int chunk_delay_ms, int bytes_per_second,
             std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);

  void Disconnect(std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);

  void Dispose();

  std::function<void(const std::string&)> connection_state_callback;

 private:
  void StopScanInternal();
  void Cleanup();

  void OnAdvertisementReceived(
      winrt::Windows::Devices::Bluetooth::Advertisement::
          BluetoothLEAdvertisementReceivedEventArgs const& args);
  // Add the device or upgrade its placeholder name; returns true if changed.
  bool UpsertDevice(const std::string& device_id, const std::string& name);
  void EmitDeviceList();

  winrt::guid ParseUuid(const std::string& uuid_str);

  PlatformThreadDispatcher* dispatcher_ = nullptr;

  // Scan state
  std::unique_ptr<flutter::EventSink<flutter::EncodableValue>> scan_event_sink_;
  winrt::Windows::Devices::Bluetooth::Advertisement::BluetoothLEAdvertisementWatcher watcher_{nullptr};
  winrt::event_token watcher_received_token_;
  winrt::event_token watcher_stopped_token_;
  std::vector<flutter::EncodableMap> discovered_devices_;
  std::unordered_set<uint64_t> resolved_addresses_;
  std::mutex scan_mutex_;

  // Connection state
  winrt::Windows::Devices::Bluetooth::BluetoothLEDevice device_{nullptr};
  winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristic
      tx_characteristic_{nullptr};
  winrt::Windows::Devices::Bluetooth::GenericAttributeProfile::GattSession
      gatt_session_{nullptr};
  int mtu_payload_ = 20;
  bool write_without_response_ = false;
  winrt::event_token connection_status_token_;
};

}  // namespace unified_esc_pos_printer

#endif  // BLE_MANAGER_H_
