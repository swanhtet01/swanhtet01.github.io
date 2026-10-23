plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val shopReleaseKeystorePath = providers.gradleProperty("SHOP_ANDROID_KEYSTORE_PATH").orNull
val shopReleaseKeyAlias = providers.gradleProperty("SHOP_ANDROID_KEY_ALIAS").orNull
val shopReleaseStorePassword = providers.gradleProperty("SHOP_ANDROID_STORE_PASSWORD").orNull
val shopReleaseKeyPassword = providers.gradleProperty("SHOP_ANDROID_KEY_PASSWORD").orNull
val shopReleaseSigningAvailable = listOf(
    shopReleaseKeystorePath,
    shopReleaseKeyAlias,
    shopReleaseStorePassword,
    shopReleaseKeyPassword,
).all { !it.isNullOrBlank() }

gradle.taskGraph.whenReady {
    val shopReleaseTaskPresent = allTasks.any {
        it.project == project && it.name.contains("release", ignoreCase = true)
    }
    if (shopReleaseTaskPresent && !shopReleaseSigningAvailable) {
        throw GradleException("shop_android_release_signing_unavailable")
    }
    if (shopReleaseTaskPresent && !file(shopReleaseKeystorePath!!).isFile) {
        throw GradleException("shop_android_release_keystore_unavailable")
    }
}

android {
    namespace = "dev.supermega.supermega_shop"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "dev.supermega.supermega_shop"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (shopReleaseSigningAvailable) {
            create("release") {
                storeFile = file(shopReleaseKeystorePath!!)
                keyAlias = shopReleaseKeyAlias
                storePassword = shopReleaseStorePassword
                keyPassword = shopReleaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            if (shopReleaseSigningAvailable) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
