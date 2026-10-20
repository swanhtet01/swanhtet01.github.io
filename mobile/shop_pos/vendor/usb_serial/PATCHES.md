# Local compatibility patch

This directory contains the BSD-3-Clause `usb_serial` 0.5.2 package, retained
as the transitive USB-serial transport of `unified_esc_pos_printer`.

The Android Gradle file removes the retired JCenter repository and the
package's obsolete Android Gradle Plugin 4.1.0 buildscript dependency, while
using the app-provided Android Gradle Plugin. The upstream `UsbSerial:6.1.0`
JitPack artifact is no longer resolvable, so the dependency is pinned to the
upstream `7ad6c9f` build and its `release` AAR classifier. The app-level
repository list includes JitPack. This retains the optional USB transport;
network printing remains the primary supported setup flow.

The upstream project reports that the 6.1.0 JitPack build is broken and that
the `7ad6c9f` build succeeded. Keep device qualification for USB printers as a
separate acceptance gate.

Upstream: https://github.com/altera2015/usbserial
Published package: https://pub.dev/packages/usb_serial/versions/0.5.2
