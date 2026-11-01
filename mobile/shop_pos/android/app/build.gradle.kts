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
    val coordinator = file(
        "src/main/kotlin/dev/supermega/supermega_shop/ConnectedCoordinatorForegroundService.kt",
    )
    val manifest = file("src/main/AndroidManifest.xml")
    inputs.files(source, coordinator, manifest)
    doLast {
        val text = source.readText() + coordinator.readText()
        val manifestText = manifest.readText()
        val required = listOf(
            "BuildConfig.CONNECTED_SITE_PLATFORM_SECURITY_ENABLED",
            "Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU",
            "ED25519_ALGORITHM = \"Ed25519\"",
            "KeyProperties.KEY_ALGORITHM_AES",
            "setRandomizedEncryptionRequired(true)",
            "platform_identity_pending_conflict",
            "platform_identity_bundle_conflict",
            "incomplete-only",
            "private val APPROVED_ISSUERS: Map<String, IssuerTrust> = emptyMap()",
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
        val coordinatorRequired = listOf(
            "ConnectedCoordinatorForegroundService",
            "startForeground",
            "START_STICKY",
            "POST_NOTIFICATIONS",
            "issuer_trust_unavailable",
            "identity_unavailable",
            "lanListenerActive\" to false",
            "connectedOperationEnabled\" to false",
            "sticky_when_ready",
            "ACTION_START",
            "ACTION_STOP",
            "coordinatorIdentityFailure",
            "IdentityRecord.fromJson",
            "record.isValid()",
            "sha256(certificateBytes) != record.certificateChainSha256",
            "sha256(leaf.publicKey.encoded) != record.tlsFingerprint",
            "Signature.getInstance(\"SHA256withECDSA\")",
            "Signature.getInstance(\"Ed25519\")",
            "identity_custody_invalid",
            "identity_enrollment_expired",
            "record.enrollmentIssuedAt",
            "record.enrollmentExpiresAt",
            "record.enrollmentSignatureAlgorithm",
            "record.issuerSignatureBase64Url",
            "enrollmentIssuedAt.isAfter(currentTime.plusSeconds(CLOCK_SKEW_SECONDS))",
            "!enrollmentExpiresAt.isAfter(currentTime)",
            "enrollmentExpiresAt.isBefore(pendingExpiresAt)",
            "parsed.toString() != value",
            "signedBundlePayload +",
            "reconstructedBundleDigest != record.bundleDigest",
            "initVerify(issuerPublicKey)",
            "canonicalJson(signedBundlePayload)",
            "leaf.notBefore.toInstant().isAfter(enrollmentIssuedAt)",
            "leaf.notAfter.toInstant().isBefore(enrollmentExpiresAt)",
            "leaf.notAfter.toInstant().isBefore(pendingExpiresAt)",
            "record.signingKeyId != signingAliasFor(alias)",
            "record.tlsKeyId != tlsKeyIdFor(alias)",
            "record.sealedTlsMaterialId != sealedTlsMaterialIdFor(alias)",
            "signingKeyId == signingAliasFor(alias)",
            "tlsKeyId == tlsKeyIdFor(alias)",
            "sealedTlsMaterialId == sealedTlsMaterialIdFor(alias)",
            "supermega.coordinator-signing-custody.v1",
            "notificationPermissionStatus",
            "requestNotificationPermission",
            "requestPermissions(",
            "arrayOf(Manifest.permission.POST_NOTIFICATIONS)",
            "request_pending",
            "supermega.connected-coordinator-notification-permission.v1",
        )
        check(coordinatorRequired.all(text::contains)) {
            "connected_coordinator_service_contract_missing"
        }
        check(!text.contains("ServerSocket") && !text.contains("DatagramSocket")) {
            "connected_coordinator_listener_forbidden"
        }
        check(!text.contains("hasCommittedIdentity")) {
            "connected_coordinator_shallow_identity_check_forbidden"
        }
        check(text.contains(
            "ConnectedPlatformSecurityAndroid.coordinatorIdentityFailure(context, alias)",
        )) {
            "connected_coordinator_custody_readiness_binding_missing"
        }
        check(manifestText.contains("android:foregroundServiceType=\"connectedDevice\"") &&
            manifestText.contains("android:exported=\"false\"") &&
            manifestText.contains("android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE")) {
            "connected_coordinator_manifest_contract_missing"
        }
    }
}
