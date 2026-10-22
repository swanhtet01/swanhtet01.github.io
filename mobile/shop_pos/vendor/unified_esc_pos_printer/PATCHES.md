# Local package patch

This directory is the `unified_esc_pos_printer` 3.4.0 package from pub.dev,
upstream: https://github.com/elrizwiraswara/unified_esc_pos_printer

The archive SHA-256 was verified against pub.dev metadata:
`430a33968d2fa080bb31df9190d221dcd52f25a083e546debab032737f17cc9c`.

The only source change is `android/build.gradle.kts`: `compileSdk` is 36
because the locked `network_info_plus` 8.x plugin requires dependent Android
libraries to compile against API 36. The app's target SDK is unchanged.
