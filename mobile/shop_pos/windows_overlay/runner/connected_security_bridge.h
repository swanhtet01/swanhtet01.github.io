#ifndef RUNNER_CONNECTED_SECURITY_BRIDGE_H_
#define RUNNER_CONNECTED_SECURITY_BRIDGE_H_

namespace flutter {
class FlutterEngine;
}

namespace supermega::connected_security {

void RegisterConnectedSecurityChannel(flutter::FlutterEngine* engine);

}  // namespace supermega::connected_security

#endif  // RUNNER_CONNECTED_SECURITY_BRIDGE_H_
