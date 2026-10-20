/// Platform-routing export for the network (TCP/IP) connector.
///
/// `dart:io` sockets are unavailable on the web, so web builds get a stub
/// whose `scan()` finds no devices and whose `connect()` throws.
library;

export 'network_connector_stub.dart'
    if (dart.library.io) 'network_connector_io.dart';
