# Local compatibility patch

This directory contains the BSD-3-Clause `usb_serial` 0.5.2 package, retained
as the transitive USB-serial transport of `unified_esc_pos_printer`.

The Android Gradle file is the only source change: it removes the retired
JCenter repository and the package's obsolete Android Gradle Plugin 4.1.0
buildscript dependency, while using the app-provided Android Gradle Plugin and
keeping Google Maven, Maven Central, and JitPack repositories. This keeps the
network-printer path on the upstream unified package and allows optional USB
serial support to compile on current Android build tooling.

Upstream: https://github.com/altera2015/usbserial
Published package: https://pub.dev/packages/usb_serial/versions/0.5.2
