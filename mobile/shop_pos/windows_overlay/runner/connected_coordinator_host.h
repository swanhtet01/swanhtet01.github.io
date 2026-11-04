#ifndef RUNNER_CONNECTED_COORDINATOR_HOST_H_
#define RUNNER_CONNECTED_COORDINATOR_HOST_H_

namespace flutter {
class FlutterEngine;
}

namespace supermega::connected_security {

// Registers a lifecycle-only app-host seam. The current caller must pass false;
// this source contains no network listener or connected-operation enablement.
void RegisterConnectedCoordinatorHostChannel(flutter::FlutterEngine* engine,
                                             bool feature_enabled);

}  // namespace supermega::connected_security

#endif  // RUNNER_CONNECTED_COORDINATOR_HOST_H_
