#include "connected_security_bridge.h"

#include <windows.h>

#include <bcrypt.h>
#include <flutter/flutter_engine.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <iterator>
#include <limits>
#include <memory>
#include <string>
#include <vector>
#include <variant>

#include "connected_security_store.h"
#include "connected_coordinator_host.h"

namespace supermega::connected_security {
namespace {

constexpr char kChannelName[] =
    "dev.supermega.supermega_shop/connected_security_v1";
constexpr char kClockRequestSchema[] =
    "supermega.connected-trusted-time-platform-clock-request.v1";
constexpr char kClockResponseSchema[] =
    "supermega.connected-trusted-time-platform-clock.v1";
constexpr char kClockSource[] =
    "windows_system_boot_identifier_get_tick_count64_v1";
constexpr ULONG kSystemBootEnvironmentInformation = 90;
constexpr size_t kSha256Bytes = 32;

// SYSTEM_BOOT_ENVIRONMENT_INFORMATION is a fixed Windows information record.
// Querying it is read-only; failure leaves trusted time unavailable.
struct SystemBootEnvironmentInformation {
  GUID boot_identifier;
  ULONG firmware_type;
  ULONGLONG boot_flags;
};

using NtQuerySystemInformationFunction = LONG(WINAPI*)(
    ULONG information_class, void* information, ULONG information_bytes,
    ULONG* return_bytes);

bool ClockRequestIsExact(const flutter::MethodCall<>& call) {
  const auto* arguments =
      std::get_if<flutter::EncodableMap>(call.arguments());
  if (arguments == nullptr || arguments->size() != 1u) return false;
  const auto schema = arguments->find(flutter::EncodableValue("schema"));
  return schema != arguments->end() &&
         std::holds_alternative<std::string>(schema->second) &&
         std::get<std::string>(schema->second) == kClockRequestSchema;
}

bool Sha256(const uint8_t* source, size_t source_bytes,
            std::array<uint8_t, kSha256Bytes>* digest) {
  if (source == nullptr || digest == nullptr ||
      source_bytes > std::numeric_limits<ULONG>::max()) {
    return false;
  }
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  DWORD object_bytes = 0;
  DWORD hash_bytes = 0;
  DWORD copied = 0;
  std::vector<uint8_t> object;
  bool ok = false;
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr,
                                  0) < 0 ||
      BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH,
                        reinterpret_cast<PUCHAR>(&object_bytes),
                        sizeof(object_bytes), &copied, 0) < 0 ||
      copied != sizeof(object_bytes) || object_bytes == 0 ||
      BCryptGetProperty(algorithm, BCRYPT_HASH_LENGTH,
                        reinterpret_cast<PUCHAR>(&hash_bytes),
                        sizeof(hash_bytes), &copied, 0) < 0 ||
      copied != sizeof(hash_bytes) || hash_bytes != digest->size()) {
    goto cleanup;
  }
  object.resize(object_bytes);
  if (BCryptCreateHash(algorithm, &hash, object.data(), object_bytes, nullptr,
                       0, 0) < 0 ||
      BCryptHashData(hash, const_cast<PUCHAR>(source),
                     static_cast<ULONG>(source_bytes), 0) < 0 ||
      BCryptFinishHash(hash, digest->data(),
                       static_cast<ULONG>(digest->size()), 0) < 0) {
    goto cleanup;
  }
  ok = true;

cleanup:
  if (hash != nullptr) BCryptDestroyHash(hash);
  if (algorithm != nullptr) BCryptCloseAlgorithmProvider(algorithm, 0);
  if (!object.empty()) SecureZeroMemory(object.data(), object.size());
  if (!ok) SecureZeroMemory(digest->data(), digest->size());
  return ok;
}

std::string LowerHex(const std::array<uint8_t, kSha256Bytes>& digest) {
  constexpr char kHex[] = "0123456789abcdef";
  std::string result;
  result.reserve(digest.size() * 2);
  for (const uint8_t value : digest) {
    result.push_back(kHex[value >> 4]);
    result.push_back(kHex[value & 0x0f]);
  }
  return result;
}

bool ReadTrustedTimeClock(flutter::EncodableMap* response) {
  if (response == nullptr) return false;
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll == nullptr) return false;
  const auto query = reinterpret_cast<NtQuerySystemInformationFunction>(
      GetProcAddress(ntdll, "NtQuerySystemInformation"));
  if (query == nullptr) return false;
  SystemBootEnvironmentInformation environment{};
  ULONG returned = 0;
  const LONG status = query(kSystemBootEnvironmentInformation, &environment,
                            sizeof(environment), &returned);
  if (status < 0 || returned < sizeof(environment)) return false;
  const auto* guid =
      reinterpret_cast<const uint8_t*>(&environment.boot_identifier);
  if (!std::any_of(guid, guid + sizeof(environment.boot_identifier),
                   [](const uint8_t value) { return value != 0; })) {
    return false;
  }

  constexpr char kDomain[] = "supermega.windows-boot-identifier.v1|";
  std::vector<uint8_t> identity(std::begin(kDomain), std::end(kDomain) - 1);
  identity.insert(identity.end(), guid, guid + sizeof(environment.boot_identifier));
  std::array<uint8_t, kSha256Bytes> digest{};
  const bool hashed = Sha256(identity.data(), identity.size(), &digest);
  SecureZeroMemory(identity.data(), identity.size());
  if (!hashed) return false;

  const ULONGLONG monotonic = GetTickCount64();
  if (monotonic > static_cast<ULONGLONG>(
                      std::numeric_limits<int64_t>::max())) {
    SecureZeroMemory(digest.data(), digest.size());
    return false;
  }
  (*response)[flutter::EncodableValue("schema")] =
      flutter::EncodableValue(kClockResponseSchema);
  (*response)[flutter::EncodableValue("source")] =
      flutter::EncodableValue(kClockSource);
  (*response)[flutter::EncodableValue("bootSessionId")] =
      flutter::EncodableValue(LowerHex(digest));
  (*response)[flutter::EncodableValue("monotonicMillis")] =
      flutter::EncodableValue(static_cast<int64_t>(monotonic));
  SecureZeroMemory(digest.data(), digest.size());
  return true;
}

bool IsKnownMethod(const std::string& method) {
  return method == "prepareIdentity" ||
         method == "completeIdentityEnrollment" ||
         method == "abortIdentity" ||
         method == "abortIdentityPreparation" ||
         method == "reconcileIdentity" || method == "loadIdentity" ||
         method == "sign" || method == "openTlsIdentity" ||
         method == "deleteIdentity" || method == "readTrustedTimeClock";
}

}  // namespace

void RegisterConnectedSecurityChannel(flutter::FlutterEngine* engine) {
  // The pinned Windows SDK has not yet proved a persistent, non-exportable
  // Ed25519 key path. Registering the channel while returning NotImplemented
  // keeps the Dart boundary explicitly unavailable (MissingPluginException)
  // instead of silently substituting another algorithm or software key.
  const bool persistent_ed25519_available =
      SupportsPersistentNonExportableEd25519();
  (void)persistent_ed25519_available;
  static std::unique_ptr<flutter::MethodChannel<>> channel;
  channel = std::make_unique<flutter::MethodChannel<>>(
      engine->messenger(), kChannelName,
      &flutter::StandardMethodCodec::GetInstance());
  channel->SetMethodCallHandler(
      [](const flutter::MethodCall<>& call,
         std::unique_ptr<flutter::MethodResult<>> result) {
        if (call.method_name() == "readTrustedTimeClock") {
          if (!ClockRequestIsExact(call)) {
            result->Error("connected_trusted_time_platform_clock_invalid");
            return;
          }
          flutter::EncodableMap response;
          if (!ReadTrustedTimeClock(&response)) {
            result->Error("connected_trusted_time_platform_clock_unavailable");
            return;
          }
          result->Success(flutter::EncodableValue(response));
          return;
        }
        if (IsKnownMethod(call.method_name())) {
          result->NotImplemented();
          return;
        }
        result->NotImplemented();
      });
  RegisterConnectedCoordinatorHostChannel(engine, false);
}

}  // namespace supermega::connected_security
