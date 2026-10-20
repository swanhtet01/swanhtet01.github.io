# Local compatibility patch

This directory contains the BSD-3-Clause `usb_serial` 0.5.2 package, retained
as the transitive USB-serial transport of `unified_esc_pos_printer`.

The Android Gradle file removes the retired JCenter repository and the
package's obsolete Android Gradle Plugin 4.1.0 buildscript dependency, while
using the app-provided Android Gradle Plugin. Its upstream Android USB
transport depended on an unavailable JitPack artifact (`UsbSerial:6.1.0`);
the alternate upstream `7ad6c9f` artifact also failed resolution in hosted
CI. This fork therefore keeps the package's Dart API but disables the unused
Android USB native transport. Shop supports network ESC/POS printers through
the unified printer package; USB printer support is not part of this release.

Upstream: https://github.com/altera2015/usbserial
Published package: https://pub.dev/packages/usb_serial/versions/0.5.2
