#include "ble_manager.h"

#include <objbase.h>

#include <winrt/Windows.Devices.Bluetooth.h>
#include <winrt/Windows.Devices.Bluetooth.Advertisement.h>
#include <winrt/Windows.Devices.Bluetooth.GenericAttributeProfile.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.Streams.h>

#include <algorithm>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <thread>

using namespace winrt;
using namespace Windows::Devices::Bluetooth;
using namespace Windows::Devices::Bluetooth::Advertisement;
using namespace Windows::Devices::Bluetooth::GenericAttributeProfile;
using namespace Windows::Foundation;
using namespace Windows::Storage::Streams;

namespace unified_esc_pos_printer {

// ── PlatformThreadDispatcher ─────────────────────────────────────────────

void PlatformThreadDispatcher::Initialize(HWND hwnd) {
  hwnd_ = hwnd;
  SetWindowSubclass(hwnd, SubclassProc, /*subclass_id=*/1,
                    reinterpret_cast<DWORD_PTR>(this));
}

void PlatformThreadDispatcher::Shutdown() {
  if (hwnd_) {
    RemoveWindowSubclass(hwnd_, SubclassProc, 1);
    hwnd_ = nullptr;
  }
}

void PlatformThreadDispatcher::Post(std::function<void()> callback) {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.push(std::move(callback));
  }
  if (hwnd_) {
    PostMessage(hwnd_, kWmFlutterCallback, 0, 0);
  }
}

void PlatformThreadDispatcher::DrainQueue() {
  std::queue<std::function<void()>> local_queue;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    std::swap(local_queue, queue_);
  }
  while (!local_queue.empty()) {
    local_queue.front()();
    local_queue.pop();
  }
}

LRESULT CALLBACK PlatformThreadDispatcher::SubclassProc(
    HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
    UINT_PTR subclass_id, DWORD_PTR ref_data) {
  if (msg == kWmFlutterCallback) {
    auto* self = reinterpret_cast<PlatformThreadDispatcher*>(ref_data);
    self->DrainQueue();
    return 0;
  }
  return DefSubclassProc(hwnd, msg, wParam, lParam);
}

// ── Well-known ESC/POS BLE UUIDs ─────────────────────────────────────────

static const guid kEscPosServiceUuid{0x000018F0, 0x0000, 0x1000, {0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFB}};
static const guid kEscPosTxCharUuid{0x00002AF1, 0x0000, 0x1000, {0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFB}};

// ── BleManager ───────────────────────────────────────────────────────────

BleManager::BleManager() {
  winrt::init_apartment(winrt::apartment_type::single_threaded);
}

BleManager::~BleManager() {
  Dispose();
}

void BleManager::SetDispatcher(PlatformThreadDispatcher* dispatcher) {
  dispatcher_ = dispatcher;
}

std::unique_ptr<flutter::StreamHandler<flutter::EncodableValue>>
BleManager::CreateScanStreamHandler() {
  auto on_listen = [this](
      const flutter::EncodableValue* arguments,
      std::unique_ptr<flutter::EventSink<flutter::EncodableValue>>&& events)
      -> std::unique_ptr<flutter::StreamHandlerError<flutter::EncodableValue>> {
    scan_event_sink_ = std::move(events);
    return nullptr;
  };
  auto on_cancel = [this](const flutter::EncodableValue* arguments)
      -> std::unique_ptr<flutter::StreamHandlerError<flutter::EncodableValue>> {
    scan_event_sink_.reset();
    return nullptr;
  };
  return std::make_unique<
      flutter::StreamHandlerFunctions<flutter::EncodableValue>>(
      on_listen, on_cancel);
}

// ── Scanning ─────────────────────────────────────────────────────────────

void BleManager::StartScan(
    int timeout_ms,
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  StopScanInternal();

  {
    std::lock_guard<std::mutex> lock(scan_mutex_);
    discovered_devices_.clear();
    resolved_addresses_.clear();
  }

  try {
    watcher_ = BluetoothLEAdvertisementWatcher();
    watcher_.ScanningMode(BluetoothLEScanningMode::Active);

    watcher_received_token_ = watcher_.Received(
        [this](BluetoothLEAdvertisementWatcher const&,
               BluetoothLEAdvertisementReceivedEventArgs const& args) {
          // An exception escaping this WinRT event handler terminates the
          // process, so nothing may throw past this boundary.
          try {
            OnAdvertisementReceived(args);
          } catch (...) {}
        });

    watcher_.Start();
  } catch (const winrt::hresult_error& e) {
    StopScanInternal();
    result->Error("SCAN_FAILED", winrt::to_string(e.message()));
    return;
  } catch (const std::exception& e) {
    StopScanInternal();
    result->Error("SCAN_FAILED", e.what());
    return;
  }

  // Auto-stop after timeout
  std::thread([this, timeout_ms]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms));
    StopScanInternal();
  }).detach();

  result->Success(flutter::EncodableValue());
}

void BleManager::OnAdvertisementReceived(
    BluetoothLEAdvertisementReceivedEventArgs const& args) {
  auto address = args.BluetoothAddress();
  std::ostringstream oss;
  oss << std::hex << std::setfill('0');
  oss << std::setw(2) << ((address >> 40) & 0xFF) << ":"
      << std::setw(2) << ((address >> 32) & 0xFF) << ":"
      << std::setw(2) << ((address >> 24) & 0xFF) << ":"
      << std::setw(2) << ((address >> 16) & 0xFF) << ":"
      << std::setw(2) << ((address >> 8) & 0xFF) << ":"
      << std::setw(2) << (address & 0xFF);
  std::string device_id = oss.str();

  // Try to get name from advertisement data first. Advertisement() can be
  // null for some advertisement types (e.g. extended advertising).
  std::string name;
  auto advertisement = args.Advertisement();
  if (advertisement != nullptr) {
    auto local_name = advertisement.LocalName();
    if (!local_name.empty()) {
      name = winrt::to_string(local_name);
    }
  }

  bool needs_resolve = false;
  if (name.empty()) {
    std::lock_guard<std::mutex> lock(scan_mutex_);
    needs_resolve = resolved_addresses_.count(address) == 0;
    resolved_addresses_.insert(address);
    name = device_id;
  }

  if (UpsertDevice(device_id, name)) {
    EmitDeviceList();
  }

  // If the advertisement carried no name, resolve the friendly name via
  // BluetoothLEDevice on a worker thread (once per address). Blocking with
  // .get() inside the Received handler aborts the process when the event is
  // delivered on an STA thread.
  if (needs_resolve) {
    std::thread([this, address, device_id]() {
      try {
        winrt::init_apartment(winrt::apartment_type::multi_threaded);
      } catch (...) {}
      try {
        auto ble_device =
            BluetoothLEDevice::FromBluetoothAddressAsync(address).get();
        if (ble_device != nullptr) {
          auto friendly_name = ble_device.Name();
          ble_device.Close();
          if (!friendly_name.empty() &&
              UpsertDevice(device_id, winrt::to_string(friendly_name))) {
            EmitDeviceList();
          }
        }
      } catch (...) {
        // Keep the MAC address as the name.
      }
    }).detach();
  }
}

bool BleManager::UpsertDevice(const std::string& device_id,
                              const std::string& name) {
  std::lock_guard<std::mutex> lock(scan_mutex_);

  for (auto& m : discovered_devices_) {
    auto it = m.find(flutter::EncodableValue("deviceId"));
    if (it == m.end() || std::get<std::string>(it->second) != device_id) {
      continue;
    }
    // Known device: only upgrade a placeholder (MAC address) name.
    auto name_it = m.find(flutter::EncodableValue("name"));
    if (name != device_id && name_it != m.end() &&
        std::get<std::string>(name_it->second) == device_id) {
      m[flutter::EncodableValue("name")] = flutter::EncodableValue(name);
      return true;
    }
    return false;
  }

  flutter::EncodableMap device_map;
  device_map[flutter::EncodableValue("deviceId")] =
      flutter::EncodableValue(device_id);
  device_map[flutter::EncodableValue("name")] = flutter::EncodableValue(name);
  discovered_devices_.push_back(device_map);
  return true;
}

void BleManager::EmitDeviceList() {
  if (!dispatcher_) return;

  flutter::EncodableList list;
  {
    std::lock_guard<std::mutex> lock(scan_mutex_);
    for (const auto& d : discovered_devices_) {
      list.push_back(flutter::EncodableValue(d));
    }
  }

  auto value = flutter::EncodableValue(list);
  dispatcher_->Post([this, value = std::move(value)]() {
    if (scan_event_sink_) {
      scan_event_sink_->Success(value);
    }
  });
}

void BleManager::StopScan(
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  StopScanInternal();
  result->Success(flutter::EncodableValue());
}

void BleManager::StopScanInternal() {
  if (watcher_ != nullptr) {
    try {
      watcher_.Stop();
      watcher_.Received(watcher_received_token_);
    } catch (...) {}
    watcher_ = nullptr;
  }
}

// ── Connection ───────────────────────────────────────────────────────────

guid BleManager::ParseUuid(const std::string& uuid_str) {
  // Parse a UUID string like "000018f0-0000-1000-8000-00805f9b34fb"
  GUID g;
  std::wstring wide(uuid_str.begin(), uuid_str.end());
  std::wstring braced = L"{" + wide + L"}";
  CLSIDFromString(braced.c_str(), &g);
  return winrt::guid(g);
}

void BleManager::Connect(
    const std::string& device_id, int timeout_ms,
    const std::string* service_uuid, const std::string* characteristic_uuid,
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {

  auto target_svc = service_uuid ? ParseUuid(*service_uuid) : kEscPosServiceUuid;
  auto target_char = characteristic_uuid ? ParseUuid(*characteristic_uuid) : kEscPosTxCharUuid;

  // Parse MAC address to uint64
  uint64_t bt_address = 0;
  std::istringstream iss(device_id);
  std::string byte_str;
  while (std::getline(iss, byte_str, ':')) {
    bt_address = (bt_address << 8) | std::stoul(byte_str, nullptr, 16);
  }

  // Run connection on a background thread (WinRT async)
  auto shared_result = std::shared_ptr<flutter::MethodResult<flutter::EncodableValue>>(
      result.release());

  std::thread([this, bt_address, target_svc, target_char, timeout_ms, shared_result]() {
    try {
      auto device = BluetoothLEDevice::FromBluetoothAddressAsync(bt_address).get();
      if (device == nullptr) {
        dispatcher_->Post([shared_result]() {
          shared_result->Error("NOT_FOUND", "BLE device not found");
        });
        return;
      }

      device_ = device;

      // Monitor connection status
      connection_status_token_ = device.ConnectionStatusChanged(
          [this](BluetoothLEDevice const& dev, auto const&) {
            if (dev.ConnectionStatus() == BluetoothConnectionStatus::Disconnected) {
              Cleanup();
              if (dispatcher_ && connection_state_callback) {
                dispatcher_->Post([this]() {
                  if (connection_state_callback) {
                    connection_state_callback("disconnected");
                  }
                });
              }
            }
          });

      // Open GATT session for MTU
      auto device_id = device.BluetoothDeviceId();
      gatt_session_ = GattSession::FromDeviceIdAsync(device_id).get();
      gatt_session_.MaintainConnection(true);
      mtu_payload_ = static_cast<int>(gatt_session_.MaxPduSize()) - 3;
      if (mtu_payload_ < 20) mtu_payload_ = 20;

      // Discover services
      auto services_result = device.GetGattServicesAsync().get();
      if (services_result.Status() != GattCommunicationStatus::Success) {
        dispatcher_->Post([shared_result]() {
          shared_result->Error("SERVICE_DISCOVERY_FAILED", "Failed to discover GATT services");
        });
        return;
      }

      GattCharacteristic found_char{nullptr};

      // 1. Try target service/characteristic
      for (auto const& svc : services_result.Services()) {
        if (svc.Uuid() == target_svc) {
          auto chars_result = svc.GetCharacteristicsAsync().get();
          if (chars_result.Status() == GattCommunicationStatus::Success) {
            for (auto const& c : chars_result.Characteristics()) {
              if (c.Uuid() == target_char) {
                auto props = c.CharacteristicProperties();
                if ((props & GattCharacteristicProperties::Write) ==
                        GattCharacteristicProperties::Write ||
                    (props & GattCharacteristicProperties::WriteWithoutResponse) ==
                        GattCharacteristicProperties::WriteWithoutResponse) {
                  found_char = c;
                  break;
                }
              }
            }
          }
        }
        if (found_char != nullptr) break;
      }

      // 2. Fallback: any writable characteristic
      if (found_char == nullptr) {
        for (auto const& svc : services_result.Services()) {
          auto chars_result = svc.GetCharacteristicsAsync().get();
          if (chars_result.Status() == GattCommunicationStatus::Success) {
            for (auto const& c : chars_result.Characteristics()) {
              auto props = c.CharacteristicProperties();
              if ((props & GattCharacteristicProperties::Write) ==
                      GattCharacteristicProperties::Write ||
                  (props & GattCharacteristicProperties::WriteWithoutResponse) ==
                      GattCharacteristicProperties::WriteWithoutResponse) {
                found_char = c;
                break;
              }
            }
          }
          if (found_char != nullptr) break;
        }
      }

      if (found_char == nullptr) {
        dispatcher_->Post([shared_result]() {
          shared_result->Error("NO_CHARACTERISTIC", "No writable characteristic found");
        });
        return;
      }

      tx_characteristic_ = found_char;
      auto props = found_char.CharacteristicProperties();
      // Prefer write-with-response for reliable backpressure (printer ACKs
      // each chunk).  Fall back to write-without-response only when that is
      // the sole option — matches the Android / iOS logic.
      bool has_write =
          (props & GattCharacteristicProperties::Write) ==
          GattCharacteristicProperties::Write;
      bool has_write_no_resp =
          (props & GattCharacteristicProperties::WriteWithoutResponse) ==
          GattCharacteristicProperties::WriteWithoutResponse;
      write_without_response_ = !has_write && has_write_no_resp;

      dispatcher_->Post([this, shared_result]() {
        shared_result->Success(flutter::EncodableValue());
        if (connection_state_callback) {
          connection_state_callback("connected");
        }
      });
    } catch (const winrt::hresult_error& e) {
      auto msg = winrt::to_string(e.message());
      dispatcher_->Post([shared_result, msg]() {
        shared_result->Error("CONNECTION_FAILED", msg);
      });
    } catch (const std::exception& e) {
      std::string msg = e.what();
      dispatcher_->Post([shared_result, msg]() {
        shared_result->Error("CONNECTION_FAILED", msg);
      });
    }
  }).detach();
}

// ── MTU & Characteristic Info ────────────────────────────────────────────

void BleManager::GetMtu(
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  result->Success(flutter::EncodableValue(mtu_payload_));
}

void BleManager::SupportsWriteWithoutResponse(
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  result->Success(flutter::EncodableValue(write_without_response_));
}

// ── Writing ──────────────────────────────────────────────────────────────

void BleManager::Write(
    const std::vector<uint8_t>& data, bool without_response,
    int max_chunk_size, int chunk_delay_ms, int bytes_per_second,
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  if (tx_characteristic_ == nullptr) {
    result->Error("NOT_CONNECTED", "BLE device not connected");
    return;
  }

  auto shared_result = std::shared_ptr<flutter::MethodResult<flutter::EncodableValue>>(
      result.release());
  auto char_copy = tx_characteristic_;

  const size_t mtu = mtu_payload_ >= 20 ? static_cast<size_t>(mtu_payload_) : 20;
  const size_t chunk_size = max_chunk_size > 0
      ? (std::min)(mtu, static_cast<size_t>(max_chunk_size))
      : mtu;
  const int delay_floor_ms = (std::max)(0, chunk_delay_ms);
  const int bps = (std::max)(0, bytes_per_second);

  std::thread([this, data, without_response, shared_result, char_copy, chunk_size,
               delay_floor_ms, bps]() {
    try {
      auto write_option = without_response
          ? GattWriteOption::WriteWithoutResponse
          : GattWriteOption::WriteWithResponse;

      for (size_t offset = 0; offset < data.size(); offset += chunk_size) {
        const size_t len = (std::min)(chunk_size, data.size() - offset);

        DataWriter writer;
        writer.WriteBytes(winrt::array_view<const uint8_t>(
            data.data() + offset, static_cast<uint32_t>(len)));
        auto buffer = writer.DetachBuffer();

        auto status = char_copy.WriteValueAsync(buffer, write_option).get();
        if (status != GattCommunicationStatus::Success) {
          dispatcher_->Post([shared_result]() {
            shared_result->Error("WRITE_FAILED", "GATT write failed");
          });
          return;
        }

        if (offset + len < data.size()) {
          long long throughput_ms = 0;
          if (bps > 0 && len > 0) {
            throughput_ms =
                (static_cast<long long>(len) * 1000 + bps - 1) / bps;
          }
          const long long delay_ms =
              (std::max)(static_cast<long long>(delay_floor_ms), throughput_ms);
          if (delay_ms > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
          }
        }
      }

      dispatcher_->Post([shared_result]() {
        shared_result->Success(flutter::EncodableValue());
      });
    } catch (const winrt::hresult_error& e) {
      auto msg = winrt::to_string(e.message());
      dispatcher_->Post([shared_result, msg]() {
        shared_result->Error("WRITE_FAILED", msg);
      });
    } catch (const std::exception& e) {
      std::string msg = e.what();
      dispatcher_->Post([shared_result, msg]() {
        shared_result->Error("WRITE_FAILED", msg);
      });
    }
  }).detach();
}

// ── Disconnection ────────────────────────────────────────────────────────

void BleManager::Disconnect(
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  Cleanup();
  if (connection_state_callback) {
    connection_state_callback("disconnected");
  }
  result->Success(flutter::EncodableValue());
}

void BleManager::Dispose() {
  StopScanInternal();
  Cleanup();
}

void BleManager::Cleanup() {
  tx_characteristic_ = nullptr;
  if (gatt_session_ != nullptr) {
    try { gatt_session_.Close(); } catch (...) {}
    gatt_session_ = nullptr;
  }
  if (device_ != nullptr) {
    try {
      device_.ConnectionStatusChanged(connection_status_token_);
      device_.Close();
    } catch (...) {}
    device_ = nullptr;
  }
  mtu_payload_ = 20;
  write_without_response_ = false;
}

}  // namespace unified_esc_pos_printer
