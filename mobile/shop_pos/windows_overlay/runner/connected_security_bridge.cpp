#include "connected_security_bridge.h"

#include <flutter/flutter_engine.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <memory>
#include <string>

#include "connected_security_store.h"
#include "connected_coordinator_host.h"

namespace supermega::connected_security {
namespace {

constexpr char kChannelName[] =
    "dev.supermega.supermega_shop/connected_security_v1";

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
        if (IsKnownMethod(call.method_name())) {
          result->NotImplemented();
          return;
        }
        result->NotImplemented();
      });
  RegisterConnectedCoordinatorHostChannel(engine, false);
}

}  // namespace supermega::connected_security
