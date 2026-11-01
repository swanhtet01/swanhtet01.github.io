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
val shopGeneratedIdentity = rootProject.file("../lib/shop_build_identity.g.dart")

fun verifyShopGeneratedIdentity(profile: String, qaProfile: String, identity: String) {
    if (!shopGeneratedIdentity.isFile) {
        throw GradleException("shop_android_build_identity_missing")
    }
    val source = shopGeneratedIdentity.readText()
    val required = listOf(
        "shopBuildIdentityProfile = '$profile'",
        "shopBuildIdentityQaProfileId = '$qaProfile'",
        "shopBuildIdentityPlatformIdentity = '$identity'",
    )
    if (!required.all(source::contains)) {
        throw GradleException("shop_android_build_identity_mismatch")
    }
}

val verifyShopAndroidProductionIdentity by tasks.registering {
    doLast {
        verifyShopGeneratedIdentity("production", "", "dev.supermega.supermega_shop")
    }
}
val verifyShopAndroidQaIdentity by tasks.registering {
    doLast {
        verifyShopGeneratedIdentity(
            "synthetic_qa_v1",
            "synthetic-qa-v1",
            "dev.supermega.supermega_shop.qa",
        )
    }
}

tasks.configureEach {
    when {
        name.startsWith("preProduction") && name.endsWith("Build") ->
            dependsOn(verifyShopAndroidProductionIdentity)
        name.startsWith("preQa") && name.endsWith("Build") ->
            dependsOn(verifyShopAndroidQaIdentity)
    }
}

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

    buildFeatures {
        buildConfig = true
    }

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
        buildConfigField("boolean", "CONNECTED_SITE_PLATFORM_SECURITY_ENABLED", "false")
    }

    flavorDimensions += "runtimeProfile"
    productFlavors {
        create("production") {
            dimension = "runtimeProfile"
        }
        create("qa") {
            dimension = "runtimeProfile"
            applicationIdSuffix = ".qa"
        }
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

val verifyConnectedPlatformSecuritySourceContract by tasks.registering {
    val source = file("src/main/kotlin/dev/supermega/supermega_shop/MainActivity.kt")
    inputs.file(source)
    doLast {
        val text = source.readText()
        val required = listOf(
            "BuildConfig.CONNECTED_SITE_PLATFORM_SECURITY_ENABLED",
            "Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU",
            "ED25519_ALGORITHM = \"Ed25519\"",
            "KeyProperties.KEY_ALGORITHM_AES",
            "setRandomizedEncryptionRequired(true)",
            "platform_identity_pending_conflict",
            "platform_identity_bundle_conflict",
            "incomplete-only",
            "APPROVED_ISSUERS: Map<String, IssuerTrust> = emptyMap()",
            "certificateChainSha256",
            "parseCertificateChain",
            "certificates.forEach { it.checkValidity(validationDate) }",
            "certificate.verify(issuer.publicKey)",
            "certificate.issuerX500Principal != issuer.subjectX500Principal",
            "issuer.basicConstraints < index",
            "canSignCertificates(issuer)",
            "certificateDigests.toSet().size != certificateDigests.size",
            "root.verify(root.publicKey)",
            "sha256(root.encoded) != expectedRootDerSha256",
            "platform_certificate_root_mismatch",
            "(value[\"privateKeyPem\"] as? ByteArray)?.fill(0)",
            "encoded.fill(0)",
            "val output = ByteArray(header.size + encoded.size + lineCount + footer.size)",
            "expectedBundleDigest",
            "expectedIdentity",
            "PENDING_TTL_MINUTES = 10L",
        )
        check(required.all(text::contains)) {
            "connected_platform_security_source_contract_missing"
        }
        check(!text.contains("BEGIN PRIVATE KEY")) {
            "connected_platform_security_embedded_private_key_forbidden"
        }
        check(!text.contains("ByteArrayOutputStream")) {
            "connected_platform_security_unwiped_output_buffer_forbidden"
        }
        check(!text.contains("CONNECTED_SITE_PLATFORM_SECURITY_ENABLED\", \"true")) {
            "connected_platform_security_must_remain_default_off"
        }
    }
}
