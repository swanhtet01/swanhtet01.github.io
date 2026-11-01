#include "connected_coordinator_host.h"

#include <windows.h>

#include <flutter/encodable_value.h>
#include <flutter/flutter_engine.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <memory>
#include <string>

namespace supermega::connected_security {
namespace {

constexpr char kChannelName[] =
    "dev.supermega.supermega_shop/connected_coordinator_host_v1";
constexpr wchar_t kOwnershipMutex[] =
    L"Local\\SuperMegaShopConnectedCoordinatorHostV1";

class ConnectedCoordinatorHost {
 public:
  explicit ConnectedCoordinatorHost(bool feature_enabled)
      : feature_enabled_(feature_enabled),
        restart_cleanup_complete_(ObserveRestartCleanup()) {}

  ConnectedCoordinatorHost(const ConnectedCoordinatorHost&) = delete;
  ConnectedCoordinatorHost& operator=(const ConnectedCoordinatorHost&) =
      delete;

  ~ConnectedCoordinatorHost() { Stop(); }

  bool Start() {
    if (!feature_enabled_) {
      state_ = "disabled";
      last_error_ = "connected_site_disabled";
      return false;
    }
    if (!TryAcquireOwnership()) {
      state_ = "blocked_single_instance";
      last_error_ = "coordinator_owner_unavailable";
      return false;
    }
    // This checkpoint intentionally contains no transport implementation.
    // Release ownership rather than reporting a coordinator as running.
    ReleaseOwnership();
    state_ = "blocked_transport";
    last_error_ = "coordinator_transport_unavailable";
    return false;
  }

  void Stop() {
    ReleaseOwnership();
    state_ = feature_enabled_ ? "stopped" : "disabled";
    if (!feature_enabled_) last_error_ = "connected_site_disabled";
  }

  flutter::EncodableMap Status() const {
    flutter::EncodableMap status;
    status[flutter::EncodableValue("schema")] = flutter::EncodableValue(
        "supermega.connected-coordinator-host-status.v1");
    status[flutter::EncodableValue("state")] =
        flutter::EncodableValue(state_);
    status[flutter::EncodableValue("featureEnabled")] =
        flutter::EncodableValue(feature_enabled_);
    status[flutter::EncodableValue("ownerHeld")] =
        flutter::EncodableValue(ownership_mutex_ != nullptr);
    status[flutter::EncodableValue("transportListening")] =
        flutter::EncodableValue(false);
    status[flutter::EncodableValue("sharedWritesAvailable")] =
        flutter::EncodableValue(false);
    status[flutter::EncodableValue("restartCleanupComplete")] =
        flutter::EncodableValue(restart_cleanup_complete_);
    status[flutter::EncodableValue("visibleStatusRequired")] =
        flutter::EncodableValue(true);
    status[flutter::EncodableValue("lastError")] =
        flutter::EncodableValue(last_error_);
    return status;
  }

 private:
  bool ObserveRestartCleanup() {
    HANDLE existing = OpenMutexW(SYNCHRONIZE | MUTEX_MODIFY_STATE, FALSE,
                                 kOwnershipMutex);
    if (existing == nullptr) return GetLastError() == ERROR_FILE_NOT_FOUND;
    const DWORD wait = WaitForSingleObject(existing, 0);
    bool cleanup_complete = false;
    if (wait == WAIT_OBJECT_0 || wait == WAIT_ABANDONED) {
      cleanup_complete = ReleaseMutex(existing) != 0;
    }
    CloseHandle(existing);
    return cleanup_complete;
  }

  bool TryAcquireOwnership() {
    if (ownership_mutex_ != nullptr) return true;
    HANDLE candidate = CreateMutexW(nullptr, TRUE, kOwnershipMutex);
    if (candidate == nullptr) return false;
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      const DWORD wait = WaitForSingleObject(candidate, 0);
      if (wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED) {
        CloseHandle(candidate);
        return false;
      }
    }
    ownership_mutex_ = candidate;
    restart_cleanup_complete_ = true;
    return true;
  }

  void ReleaseOwnership() {
    if (ownership_mutex_ == nullptr) return;
    ReleaseMutex(ownership_mutex_);
    CloseHandle(ownership_mutex_);
    ownership_mutex_ = nullptr;
  }

  const bool feature_enabled_;
  HANDLE ownership_mutex_ = nullptr;
  bool restart_cleanup_complete_ = false;
  std::string state_ = "disabled";
  std::string last_error_ = "connected_site_disabled";
};

}  // namespace

void RegisterConnectedCoordinatorHostChannel(flutter::FlutterEngine* engine,
                                             bool feature_enabled) {
  static std::unique_ptr<ConnectedCoordinatorHost> host;
  static std::unique_ptr<flutter::MethodChannel<>> channel;
  host = std::make_unique<ConnectedCoordinatorHost>(feature_enabled);
  channel = std::make_unique<flutter::MethodChannel<>>(
      engine->messenger(), kChannelName,
      &flutter::StandardMethodCodec::GetInstance());
  channel->SetMethodCallHandler(
      [](const flutter::MethodCall<>& call,
         std::unique_ptr<flutter::MethodResult<>> result) {
        if (call.method_name() == "status") {
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        if (call.method_name() == "start") {
          if (!host->Start()) {
            result->Error("coordinator_start_rejected",
                          "Windows coordinator host is unavailable.",
                          flutter::EncodableValue(host->Status()));
            return;
          }
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        if (call.method_name() == "stop") {
          host->Stop();
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        result->NotImplemented();
      });
}

}  // namespace supermega::connected_security
