/// Connection lifecycle states for a [PrinterConnector].
enum PrinterConnectionState {
  disconnected,
  scanning,
  connecting,
  connected,
  printing,
  disconnecting,
  error,
}

/// Valid state machine transitions.
///
/// ```
/// disconnected > scan() > scanning > timeout/stop > disconnected
/// disconnected > connect() > connecting > connected
/// connected > writeBytes() > printing > connected
/// connected > disconnect() > disconnecting > disconnected
/// any > error > error > disconnected
/// ```
extension PrinterConnectionStateX on PrinterConnectionState {
  bool canTransitionTo(PrinterConnectionState next) {
    const Map<PrinterConnectionState, Set<PrinterConnectionState>> allowed = {
      PrinterConnectionState.disconnected: {
        PrinterConnectionState.scanning,
        PrinterConnectionState.connecting,
      },
      PrinterConnectionState.scanning: {
        PrinterConnectionState.disconnected,
        PrinterConnectionState.error,
      },
      PrinterConnectionState.connecting: {
        PrinterConnectionState.connected,
        PrinterConnectionState.disconnected,
        PrinterConnectionState.error,
      },
      PrinterConnectionState.connected: {
        PrinterConnectionState.printing,
        PrinterConnectionState.disconnecting,
        PrinterConnectionState.error,
      },
      PrinterConnectionState.printing: {
        PrinterConnectionState.connected,
        PrinterConnectionState.error,
      },
      PrinterConnectionState.disconnecting: {
        PrinterConnectionState.disconnected,
        PrinterConnectionState.error,
      },
      PrinterConnectionState.error: {
        PrinterConnectionState.disconnected,
      },
    };

    return allowed[this]?.contains(next) ?? false;
  }
}
