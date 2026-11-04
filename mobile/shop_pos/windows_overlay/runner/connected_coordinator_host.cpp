#include "connected_coordinator_host.h"

#include <windows.h>

#include <flutter/encodable_value.h>
#include <flutter/flutter_engine.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <memory>
#include <string>
#include <variant>

namespace supermega::connected_security {
namespace {

constexpr char kChannelName[] =
    "dev.supermega.supermega_shop/connected_coordinator_host_v1";
constexpr char kRequestSchema[] =
    "supermega.connected-coordinator-host-request.v1";
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

  bool Start(const std::string& coordinator_alias) {
    if (!feature_enabled_) {
      state_ = "disabled";
      last_error_ = "connected_site_disabled";
      return false;
    }
    if (ownership_mutex_ != nullptr) {
      last_error_ = "coordinator_already_started";
      return false;
    }
    if (!TryAcquireOwnership()) {
      state_ = "blocked_single_instance";
      last_error_ = "coordinator_owner_unavailable";
      return false;
    }
    coordinator_alias_ = coordinator_alias;
    transport_listening_ = false;
    state_ = "running";
    last_error_.clear();
    return true;
  }

  bool MarkListening(const std::string& coordinator_alias) {
    if (!feature_enabled_ || ownership_mutex_ == nullptr ||
        state_ != "running" || coordinator_alias_ != coordinator_alias ||
        transport_listening_) {
      last_error_ = "coordinator_listener_transition_invalid";
      return false;
    }
    transport_listening_ = true;
    return true;
  }

  void Stop() {
    ReleaseOwnership();
    coordinator_alias_.clear();
    transport_listening_ = false;
    state_ = feature_enabled_ ? "stopped" : "disabled";
    if (feature_enabled_) {
      last_error_.clear();
    } else {
      last_error_ = "connected_site_disabled";
    }
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
        flutter::EncodableValue(transport_listening_);
    status[flutter::EncodableValue("sharedWritesAvailable")] =
        flutter::EncodableValue(transport_listening_);
    status[flutter::EncodableValue("coordinatorAlias")] =
        coordinator_alias_.empty()
            ? flutter::EncodableValue()
            : flutter::EncodableValue(coordinator_alias_);
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
  bool transport_listening_ = false;
  std::string state_ = "disabled";
  std::string last_error_ = "connected_site_disabled";
  std::string coordinator_alias_;
};

bool IsAlias(const std::string& value) {
  if (value.empty() || value.size() > 128) return false;
  for (size_t index = 0; index < value.size(); ++index) {
    const char value_at = value[index];
    const bool allowed =
        (value_at >= 'A' && value_at <= 'Z') ||
        (value_at >= 'a' && value_at <= 'z') ||
        (value_at >= '0' && value_at <= '9') ||
        (index > 0 && (value_at == '.' || value_at == '_' ||
                       value_at == ':' || value_at == '-'));
    if (!allowed) return false;
  }
  return true;
}

const flutter::EncodableMap* RequestArguments(
    const flutter::MethodCall<>& call,
    bool requires_alias,
    std::string* coordinator_alias) {
  const auto* arguments =
      std::get_if<flutter::EncodableMap>(call.arguments());
  if (arguments == nullptr ||
      arguments->size() != (requires_alias ? 2u : 1u)) {
    return nullptr;
  }
  const auto schema = arguments->find(flutter::EncodableValue("schema"));
  if (schema == arguments->end() ||
      !std::holds_alternative<std::string>(schema->second) ||
      std::get<std::string>(schema->second) != kRequestSchema) {
    return nullptr;
  }
  if (!requires_alias) return arguments;
  const auto alias =
      arguments->find(flutter::EncodableValue("coordinatorAlias"));
  if (alias == arguments->end() ||
      !std::holds_alternative<std::string>(alias->second)) {
    return nullptr;
  }
  *coordinator_alias = std::get<std::string>(alias->second);
  return IsAlias(*coordinator_alias) ? arguments : nullptr;
}

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
          std::string ignored;
          if (RequestArguments(call, false, &ignored) == nullptr) {
            result->Error("coordinator_request_invalid");
            return;
          }
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        if (call.method_name() == "start") {
          std::string coordinator_alias;
          if (RequestArguments(call, true, &coordinator_alias) == nullptr) {
            result->Error("coordinator_request_invalid");
            return;
          }
          if (!host->Start(coordinator_alias)) {
            result->Error("coordinator_start_rejected",
                          "Windows coordinator host is unavailable.",
                          flutter::EncodableValue(host->Status()));
            return;
          }
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        if (call.method_name() == "markListening") {
          std::string coordinator_alias;
          if (RequestArguments(call, true, &coordinator_alias) == nullptr) {
            result->Error("coordinator_request_invalid");
            return;
          }
          if (!host->MarkListening(coordinator_alias)) {
            result->Error("coordinator_listener_rejected",
                          "Windows coordinator listener was not confirmed.",
                          flutter::EncodableValue(host->Status()));
            return;
          }
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        if (call.method_name() == "stop") {
          std::string ignored;
          if (RequestArguments(call, false, &ignored) == nullptr) {
            result->Error("coordinator_request_invalid");
            return;
          }
          host->Stop();
          result->Success(flutter::EncodableValue(host->Status()));
          return;
        }
        result->NotImplemented();
      });
}

}  // namespace supermega::connected_security
