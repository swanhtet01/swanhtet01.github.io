package dev.supermega.supermega_shop

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.provider.Settings
import android.util.Base64
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        if (BuildConfig.CONNECTED_SITE_PLATFORM_SECURITY_ENABLED) {
            ConnectedPlatformSecurityAndroid(
                applicationContext,
                flutterEngine.dartExecutor.binaryMessenger,
            ).register()
            ConnectedCoordinatorServiceChannel(
                this,
                flutterEngine.dartExecutor.binaryMessenger,
            ).register()
        }
    }
}

/** API-33+ custody boundary. Ordinary Shop builds never register this channel. */
internal class ConnectedPlatformSecurityAndroid(
    context: Context,
    messenger: BinaryMessenger,
    private val clock: () -> Instant = {
        Instant.now().truncatedTo(ChronoUnit.MILLIS)
    },
) {
    private val appContext = context.applicationContext
    private val channel = MethodChannel(messenger, CHANNEL)
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun register() = channel.setMethodCallHandler(::handle)

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.error(UNAVAILABLE, null, null)
            return
        }
        try {
            garbageCollectExpired()
            val value = when (call.method) {
                "prepareIdentity" -> prepare(arguments(call))
                "completeIdentityEnrollment" -> complete(arguments(call))
                "abortIdentityPreparation" -> abortPreparation(arguments(call))
                "abortIdentity" -> abortIdentity(arguments(call))
                "reconcileIdentity" -> reconcile(arguments(call))
                "loadIdentity" -> loadIdentity(arguments(call))
                "sign" -> sign(arguments(call))
                "openTlsIdentity" -> openTlsIdentity(arguments(call))
                "deleteIdentity" -> deleteIdentity(arguments(call))
                "readTrustedTimeClock" -> readTrustedTimeClock(arguments(call))
                else -> {
                    result.notImplemented()
                    return
                }
            }
            result.success(value)
            if (call.method == "openTlsIdentity" && value is Map<*, *>) {
                // StandardMethodCodec has copied the response synchronously by
                // this point. The Dart copy is the documented in-process
                // HttpServer boundary; wipe the native response buffer now.
                (value["privateKeyPem"] as? ByteArray)?.fill(0)
            }
        } catch (error: PlatformSecurityError) {
            result.error(error.code, null, null)
        } catch (_: Throwable) {
            result.error(OPERATION_FAILED, null, null)
        }
    }

    private fun readTrustedTimeClock(args: Map<String, Any?>): Map<String, Any?> {
        exactKeys(args, setOf("schema"))
        requireValue(
            args,
            "schema",
            "supermega.connected-trusted-time-platform-clock-request.v1",
        )
        val bootCount = Settings.Global.getInt(
            appContext.contentResolver,
            Settings.Global.BOOT_COUNT,
        )
        if (bootCount < 0) throw PlatformSecurityError(OPERATION_FAILED)
        val bootSessionId = sha256(
            "supermega.android-boot-count.v1|$bootCount".toByteArray(StandardCharsets.UTF_8),
        )
        return mapOf(
            "schema" to "supermega.connected-trusted-time-platform-clock.v1",
            "source" to "android_system_clock_elapsed_realtime_boot_count_v1",
            "bootSessionId" to bootSessionId,
            "monotonicMillis" to SystemClock.elapsedRealtime(),
        )
    }

    private fun prepare(args: Map<String, Any?>): Map<String, Any?> {
        exactKeys(
            args,
            setOf("schema", "alias", "workspaceId", "siteId", "deviceId", "sessionGeneration"),
        )
        requireValue(args, "schema", PREPARE_REQUEST_SCHEMA)
        val alias = token(args, "alias")
        val workspaceId = token(args, "workspaceId")
        val siteId = token(args, "siteId")
        val deviceId = token(args, "deviceId")
        val generation = args["sessionGeneration"] as? Int
            ?: throw PlatformSecurityError("platform_session_generation_invalid")
        if (generation < 1) throw PlatformSecurityError("platform_session_generation_invalid")
        val existing = readRecord(alias)
        if (existing != null && existing.state != STATE_EXPIRED) {
            throw PlatformSecurityError("platform_identity_pending_conflict")
        }
        if (existing != null) preferences.edit().remove(recordKey(alias)).commitOrThrow()
        deleteKeyMaterial(alias)
        var pendingPersisted = false
        try {
        val signingPair = KeyPairGenerator.getInstance(
            ED25519_ALGORITHM,
            ANDROID_KEYSTORE,
        ).run {
            initialize(
                KeyGenParameterSpec.Builder(
                    signingAlias(alias),
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                ).setDigests(KeyProperties.DIGEST_NONE).build(),
            )
            generateKeyPair()
        }
        val signingPublic = rawEd25519PublicKey(signingPair.public.encoded)
        val tlsPair = KeyPairGenerator.getInstance("EC").run {
            initialize(ECGenParameterSpec("secp256r1"))
            generateKeyPair()
        }
        val tlsSpki = tlsPair.public.encoded.copyOf()
        val tlsPrivate = tlsPair.private.encoded.copyOf()
        val aesKey = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    aesAlias(alias),
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
        val sealed = try {
            encrypt(aesKey, tlsPrivate, alias.toByteArray(StandardCharsets.UTF_8))
        } finally {
            tlsPrivate.fill(0)
        }
        val nonce = randomBytes(32)
        val now = now()
        val expires = now.plus(PENDING_TTL_MINUTES, ChronoUnit.MINUTES)
        val handle = randomToken(32)
        val request = linkedMapOf<String, Any>(
            "schema" to ENROLLMENT_REQUEST_SCHEMA,
            "alias" to alias,
            "workspaceId" to workspaceId,
            "siteId" to siteId,
            "deviceId" to deviceId,
            "sessionGeneration" to generation,
            "signingKeyId" to signingAlias(alias),
            "signingAlgorithm" to "ed25519",
            "signingPublicKeyBase64" to base64(signingPublic),
            "signingPublicKeyFingerprintSha256" to sha256(signingPublic),
            "tlsKeyId" to tlsKeyIdFor(alias),
            "tlsAlgorithm" to "ecdsa-p256",
            "tlsPublicKeySpkiBase64" to base64(tlsSpki),
            "tlsPublicKeyFingerprintSha256" to sha256(tlsSpki),
            "sealedTlsMaterialId" to sealedTlsMaterialIdFor(alias),
            "preparationHandle" to handle,
            "nonceBase64Url" to base64Url(nonce),
            "createdAt" to now.toString(),
            "pendingExpiresAt" to expires.toString(),
        )
        val requestDigest = digestCanonical(request)
        request["requestDigest"] = requestDigest
        val record = IdentityRecord(
            alias = alias,
            state = STATE_PENDING,
            preparationHandle = handle,
            requestDigest = requestDigest,
            pendingExpiresAt = expires.toString(),
            workspaceId = workspaceId,
            siteId = siteId,
            deviceId = deviceId,
            sessionGeneration = generation,
            signingKeyId = signingAlias(alias),
            signingPublicKey = base64(signingPublic),
            signingFingerprint = sha256(signingPublic),
            tlsPublicSpki = base64(tlsSpki),
            tlsFingerprint = sha256(tlsSpki),
            tlsKeyId = tlsKeyIdFor(alias),
            sealedTlsMaterialId = sealedTlsMaterialIdFor(alias),
            nonceBase64Url = base64Url(nonce),
            encryptedTlsPrivate = base64(sealed.ciphertext),
            encryptedTlsIv = base64(sealed.iv),
            issuerKeyId = "",
            enrollmentIssuedAt = "",
            enrollmentExpiresAt = "",
            enrollmentSignatureAlgorithm = "",
            issuerSignatureBase64Url = "",
            certificateChainSha256 = "",
        )
        if (!writeRecord(record)) {
            deleteKeyMaterial(alias)
            throw PlatformSecurityError(OPERATION_FAILED)
        }
        pendingPersisted = true
        signingPublic.fill(0)
        tlsSpki.fill(0)
        nonce.fill(0)
        return mapOf(
            "schema" to PREPARE_RESPONSE_SCHEMA,
            "preparationHandle" to handle,
            "requestDigest" to requestDigest,
            "request" to request,
        )
        } finally {
            if (!pendingPersisted) {
                deleteKeyMaterial(alias)
                preferences.edit().remove(recordKey(alias)).commit()
            }
        }
    }

    private fun complete(args: Map<String, Any?>): Map<String, Any?> {
        exactKeys(args, COMPLETE_KEYS)
        requireValue(args, "schema", COMPLETE_REQUEST_SCHEMA)
        requireValue(args, "enrollmentSchema", ENROLLMENT_BUNDLE_SCHEMA)
        val alias = token(args, "alias")
        val requestDigest = digest(args, "requestDigest")
        val bundleDigest = digest(args, "bundleDigest")
        val preparationHandle = token(args, "preparationHandle")
        val record = readRecord(alias) ?: throw PlatformSecurityError("platform_identity_not_found")
        if (record.requestDigest != requestDigest || record.preparationHandle != preparationHandle) {
            throw PlatformSecurityError("platform_identity_enrollment_mismatch")
        }
        if (record.state == STATE_COMMITTED) {
            if (record.bundleDigest != bundleDigest) {
                throw PlatformSecurityError("platform_identity_bundle_conflict")
            }
            return completion(record, replayed = true)
        }
        if (record.state != STATE_PENDING) {
            throw PlatformSecurityError("platform_identity_enrollment_mismatch")
        }

        val issuerKeyId = token(args, "issuerKeyId")
        val issuerTrust = APPROVED_ISSUERS[issuerKeyId]
            ?: throw PlatformSecurityError(UNAVAILABLE)
        val bundlePayload = linkedMapOf<String, Any>(
            "schema" to ENROLLMENT_BUNDLE_SCHEMA,
            "requestDigest" to requestDigest,
            "alias" to alias,
            "workspaceId" to token(args, "workspaceId"),
            "siteId" to token(args, "siteId"),
            "deviceId" to token(args, "deviceId"),
            "sessionGeneration" to positiveInt(args, "sessionGeneration"),
            "signingKeyId" to token(args, "signingKeyId"),
            "signingPublicKeyFingerprintSha256" to digest(args, "signingPublicKeyFingerprintSha256"),
            "tlsKeyId" to token(args, "tlsKeyId"),
            "tlsPublicKeyFingerprintSha256" to digest(args, "tlsPublicKeyFingerprintSha256"),
            "sealedTlsMaterialId" to token(args, "sealedTlsMaterialId"),
            "preparationHandle" to token(args, "preparationHandle"),
            "nonceBase64Url" to boundedText(args, "nonceBase64Url", 128),
            "issuerKeyId" to issuerKeyId,
            "certificateChainSha256" to digest(args, "certificateChainSha256"),
            "tlsCertificateFingerprintSha256" to digest(args, "tlsCertificateFingerprintSha256"),
            "issuedAt" to timestampText(args, "issuedAt"),
            "expiresAt" to timestampText(args, "expiresAt"),
            "pendingExpiresAt" to timestampText(args, "pendingExpiresAt"),
            "signatureAlgorithm" to boundedText(args, "signatureAlgorithm", 32),
        )
        if (bundlePayload["signatureAlgorithm"] != "ed25519" ||
            bundlePayload["workspaceId"] != record.workspaceId ||
            bundlePayload["siteId"] != record.siteId ||
            bundlePayload["deviceId"] != record.deviceId ||
            bundlePayload["sessionGeneration"] != record.sessionGeneration ||
            bundlePayload["signingKeyId"] != record.signingKeyId ||
            bundlePayload["signingPublicKeyFingerprintSha256"] != record.signingFingerprint ||
            bundlePayload["tlsKeyId"] != record.tlsKeyId ||
            bundlePayload["tlsPublicKeyFingerprintSha256"] != record.tlsFingerprint ||
            bundlePayload["sealedTlsMaterialId"] != record.sealedTlsMaterialId ||
            bundlePayload["nonceBase64Url"] != record.nonceBase64Url ||
            bundlePayload["pendingExpiresAt"] != record.pendingExpiresAt) {
            throw PlatformSecurityError("platform_identity_enrollment_mismatch")
        }
        val signatureText = boundedText(args, "issuerSignatureBase64Url", 128)
        val signature = decodeBase64Url(signatureText, 64)
        val publicKey = KeyFactory.getInstance("Ed25519").generatePublic(
            X509EncodedKeySpec(
                Base64.decode(
                    issuerTrust.enrollmentKeySpkiBase64,
                    Base64.DEFAULT,
                ),
            ),
        )
        val signatureValid = Signature.getInstance("Ed25519").run {
            initVerify(publicKey)
            update(canonicalJson(bundlePayload).toByteArray(StandardCharsets.UTF_8))
            verify(signature)
        }
        if (!signatureValid) throw PlatformSecurityError("platform_issuer_signature_invalid")
        val calculatedBundleDigest = digestCanonical(
            bundlePayload + ("issuerSignatureBase64Url" to signatureText),
        )
        if (calculatedBundleDigest != bundleDigest) {
            throw PlatformSecurityError("platform_identity_bundle_conflict")
        }
        val certificateBytes = args["certificateChainPem"] as? ByteArray
            ?: throw PlatformSecurityError("platform_certificate_chain_invalid")
        if (certificateBytes.isEmpty() || certificateBytes.size > MAX_CERTIFICATE_BYTES ||
            sha256(certificateBytes) != bundlePayload["certificateChainSha256"]) {
            throw PlatformSecurityError("platform_certificate_chain_invalid")
        }
        val certificates = parseCertificateChain(certificateBytes)
        val now = now()
        validateCertificateChain(
            certificates,
            now,
            issuerTrust.rootCertificateDerSha256,
        )
        val leaf = certificates.first()
        val issuedAt = Instant.parse(bundlePayload["issuedAt"] as String)
        val expiresAt = Instant.parse(bundlePayload["expiresAt"] as String)
        val pendingExpiresAt = Instant.parse(record.pendingExpiresAt)
        if (issuedAt.isAfter(now.plusSeconds(CLOCK_SKEW_SECONDS)) ||
            !expiresAt.isAfter(now) || expiresAt.isBefore(pendingExpiresAt)) {
            throw PlatformSecurityError("platform_enrollment_bundle_stale")
        }
        if (leaf.notBefore.toInstant().isAfter(issuedAt) ||
            leaf.notAfter.toInstant().isBefore(expiresAt) ||
            leaf.notAfter.toInstant().isBefore(pendingExpiresAt)) {
            throw PlatformSecurityError("platform_certificate_chain_invalid")
        }
        if (sha256(leaf.publicKey.encoded) != record.tlsFingerprint ||
            sha256(leaf.encoded) != bundlePayload["tlsCertificateFingerprintSha256"]) {
            throw PlatformSecurityError("platform_identity_enrollment_mismatch")
        }
        val committed = record.copy(
            state = STATE_COMMITTED,
            certificateChainPem = base64(certificateBytes),
            certificateChainSha256 = bundlePayload["certificateChainSha256"] as String,
            certificateFingerprint = bundlePayload["tlsCertificateFingerprintSha256"] as String,
            bundleDigest = bundleDigest,
            issuerKeyId = issuerKeyId,
            enrollmentIssuedAt = bundlePayload["issuedAt"] as String,
            enrollmentExpiresAt = bundlePayload["expiresAt"] as String,
            enrollmentSignatureAlgorithm = bundlePayload["signatureAlgorithm"] as String,
            issuerSignatureBase64Url = signatureText,
        )
        if (!writeRecord(committed)) throw PlatformSecurityError(OPERATION_FAILED)
        return completion(committed, replayed = false)
    }

    private fun reconcile(args: Map<String, Any?>): Map<String, Any?> {
        exactKeys(
            args,
            setOf("schema", "alias", "requestDigest", "expectedBundleDigest", "expectedIdentity"),
        )
        requireValue(args, "schema", RECONCILE_REQUEST_SCHEMA)
        val alias = token(args, "alias")
        val requestDigest = digest(args, "requestDigest")
        val record = readRecord(alias) ?: throw PlatformSecurityError("platform_identity_not_found")
        if (record.requestDigest != requestDigest) {
            throw PlatformSecurityError("platform_preparation_status_binding_mismatch")
        }
        if (record.state == STATE_COMMITTED) {
            val expectedBundle = args["expectedBundleDigest"] as? String
                ?: throw PlatformSecurityError("platform_preparation_recovery_expectation_missing")
            if (!DIGEST.matches(expectedBundle) || expectedBundle != record.bundleDigest ||
                args["expectedIdentity"] !is Map<*, *> ||
                !mapsEqualStringKeys(args["expectedIdentity"] as Map<*, *>, identity(record))) {
                throw PlatformSecurityError("platform_preparation_recovery_mismatch")
            }
        }
        return status(record)
    }

    private fun abortPreparation(args: Map<String, Any?>): Boolean {
        exactKeys(args, setOf("schema", "alias", "scope", "preparationHandle", "requestDigest"))
        requireValue(args, "schema", ABORT_PREPARATION_SCHEMA)
        requireValue(args, "scope", "incomplete-only")
        val alias = token(args, "alias")
        val handle = token(args, "preparationHandle")
        val requestDigest = digest(args, "requestDigest")
        val record = readRecord(alias) ?: return true
        if (record.preparationHandle != handle || record.requestDigest != requestDigest) {
            throw PlatformSecurityError("platform_preparation_status_binding_mismatch")
        }
        if (record.state == STATE_COMMITTED || record.state == STATE_EXPIRED) return true
        expire(record, now())
        return true
    }

    private fun abortIdentity(args: Map<String, Any?>): Boolean {
        exactKeys(args, setOf("schema", "alias", "requestDigest"))
        requireValue(args, "schema", ABORT_REQUEST_SCHEMA)
        val alias = token(args, "alias")
        val requestDigest = digest(args, "requestDigest")
        val record = readRecord(alias) ?: return true
        if (record.requestDigest != requestDigest) {
            throw PlatformSecurityError("platform_identity_abort_unconfirmed")
        }
        deleteKeyMaterial(alias)
        preferences.edit().remove(recordKey(alias)).commitOrThrow()
        return true
    }

    private fun loadIdentity(args: Map<String, Any?>): Map<String, Any> {
        exactKeys(args, setOf("schema", "alias"))
        requireValue(args, "schema", GENERIC_REQUEST_SCHEMA)
        val record = committedRecord(token(args, "alias"))
        return identity(record)
    }

    private fun sign(args: Map<String, Any?>): ByteArray {
        exactKeys(args, setOf("schema", "alias", "payload"))
        requireValue(args, "schema", SIGN_REQUEST_SCHEMA)
        val alias = token(args, "alias")
        committedRecord(alias)
        val payload = args["payload"] as? ByteArray
            ?: throw PlatformSecurityError("platform_signing_payload_invalid")
        if (payload.isEmpty() || payload.size > MAX_SIGNING_BYTES) {
            throw PlatformSecurityError("platform_signing_payload_invalid")
        }
        val privateKey = keyStore.getKey(signingAlias(alias), null) as? java.security.PrivateKey
            ?: throw PlatformSecurityError(OPERATION_FAILED)
        return Signature.getInstance("Ed25519").run {
            initSign(privateKey)
            update(payload)
            sign()
        }
    }

    private fun openTlsIdentity(args: Map<String, Any?>): Map<String, Any> {
        exactKeys(args, setOf("schema", "alias", "sealedTlsMaterialId"))
        requireValue(args, "schema", TLS_REQUEST_SCHEMA)
        val alias = token(args, "alias")
        val record = committedRecord(alias)
        if (token(args, "sealedTlsMaterialId") != record.sealedTlsMaterialId) {
            throw PlatformSecurityError("platform_tls_material_invalid")
        }
        val aesKey = keyStore.getKey(aesAlias(alias), null) as? SecretKey
            ?: throw PlatformSecurityError("platform_tls_material_invalid")
        val privateBytes = decrypt(
            aesKey,
            decodeBase64(record.encryptedTlsPrivate),
            decodeBase64(record.encryptedTlsIv),
            alias.toByteArray(StandardCharsets.UTF_8),
        )
        return try {
            KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(privateBytes))
            mapOf(
                "schema" to TLS_IDENTITY_SCHEMA,
                "certificatePem" to decodeBase64(record.certificateChainPem),
                "privateKeyPem" to pem("PRIVATE KEY", privateBytes),
                "certificateFingerprintSha256" to record.certificateFingerprint,
            )
        } finally {
            privateBytes.fill(0)
        }
    }

    private fun deleteIdentity(args: Map<String, Any?>): Boolean {
        exactKeys(args, setOf("schema", "alias"))
        requireValue(args, "schema", GENERIC_REQUEST_SCHEMA)
        val alias = token(args, "alias")
        deleteKeyMaterial(alias)
        preferences.edit().remove(recordKey(alias)).commitOrThrow()
        return true
    }

    private fun garbageCollectExpired() {
        val current = now()
        preferences.all.keys.filter { it.startsWith(RECORD_PREFIX) }.forEach { key ->
            val record = runCatching {
                IdentityRecord.fromJson(JSONObject(preferences.getString(key, null)!!))
            }.getOrNull() ?: return@forEach
            if (record.state == STATE_PENDING && !Instant.parse(record.pendingExpiresAt).isAfter(current)) {
                expire(record, current)
            }
        }
    }

    private fun expire(record: IdentityRecord, cleanedAt: Instant) {
        deleteKeyMaterial(record.alias)
        val evidence = linkedMapOf<String, Any>(
            "schema" to CLEANUP_EVIDENCE_SCHEMA,
            "alias" to record.alias,
            "preparationHandle" to record.preparationHandle,
            "requestDigest" to record.requestDigest,
            "cleanedAt" to cleanedAt.toString(),
            "signingKeyDeleted" to true,
            "tlsMaterialDeleted" to true,
        )
        val expired = record.copy(
            state = STATE_EXPIRED,
            encryptedTlsPrivate = "",
            encryptedTlsIv = "",
            cleanupEvidenceJson = JSONObject(
                evidence + ("evidenceDigest" to digestCanonical(evidence)),
            ).toString(),
        )
        if (!writeRecord(expired)) throw PlatformSecurityError(OPERATION_FAILED)
    }

    private fun completion(record: IdentityRecord, replayed: Boolean): Map<String, Any?> = mapOf(
        "schema" to COMPLETION_RESPONSE_SCHEMA,
        "requestDigest" to record.requestDigest,
        "bundleDigest" to record.bundleDigest,
        "replayed" to replayed,
        "identity" to identity(record),
    )

    private fun status(record: IdentityRecord): Map<String, Any?> = mapOf(
        "schema" to RECONCILE_RESPONSE_SCHEMA,
        "alias" to record.alias,
        "preparationHandle" to record.preparationHandle,
        "requestDigest" to record.requestDigest,
        "state" to record.state,
        "observedAt" to now().toString(),
        "pendingExpiresAt" to record.pendingExpiresAt,
        "committedBundleDigest" to record.bundleDigest.ifEmpty { null },
        "identity" to if (record.state == STATE_COMMITTED) identity(record) else null,
        "cleanupEvidence" to if (record.state == STATE_EXPIRED) jsonMap(record.cleanupEvidenceJson) else null,
    )

    private fun identity(record: IdentityRecord): Map<String, Any> = mapOf(
        "schema" to IDENTITY_SCHEMA,
        "alias" to record.alias,
        "keyId" to record.signingKeyId,
        "algorithm" to "ed25519",
        "publicKeyBase64" to record.signingPublicKey,
        "publicKeyFingerprintSha256" to record.signingFingerprint,
        "tlsCertificateFingerprintSha256" to record.certificateFingerprint,
        "sealedTlsMaterialId" to record.sealedTlsMaterialId,
    )

    private fun committedRecord(alias: String): IdentityRecord {
        val record = readRecord(alias) ?: throw PlatformSecurityError("platform_identity_not_found")
        if (record.state != STATE_COMMITTED) throw PlatformSecurityError("platform_identity_not_found")
        return record
    }

    private fun readRecord(alias: String): IdentityRecord? = preferences
        .getString(recordKey(alias), null)
        ?.let { IdentityRecord.fromJson(JSONObject(it)) }
        ?.also { record ->
            if (record.alias != alias || !record.isValid()) {
                throw PlatformSecurityError(OPERATION_FAILED)
            }
        }

    private fun writeRecord(record: IdentityRecord): Boolean = preferences.edit()
        .putString(recordKey(record.alias), record.toJson().toString())
        .commit()

    private fun deleteKeyMaterial(alias: String) {
        keyStore.deleteEntry(signingAlias(alias))
        keyStore.deleteEntry(aesAlias(alias))
    }

    private fun arguments(call: MethodCall): Map<String, Any?> {
        val raw = call.arguments as? Map<*, *> ?: throw PlatformSecurityError(OPERATION_FAILED)
        if (raw.keys.any { it !is String }) throw PlatformSecurityError(OPERATION_FAILED)
        @Suppress("UNCHECKED_CAST")
        return raw as Map<String, Any?>
    }

    private fun exactKeys(args: Map<String, Any?>, keys: Set<String>) {
        if (args.keys != keys) throw PlatformSecurityError(OPERATION_FAILED)
    }

    private fun token(args: Map<String, Any?>, key: String): String {
        val value = boundedText(args, key, 128)
        if (!TOKEN.matches(value)) throw PlatformSecurityError("platform_${snake(key)}_invalid")
        return value
    }

    private fun digest(args: Map<String, Any?>, key: String): String {
        val value = boundedText(args, key, 64)
        if (!DIGEST.matches(value)) throw PlatformSecurityError("platform_${snake(key)}_invalid")
        return value
    }

    private fun boundedText(args: Map<String, Any?>, key: String, max: Int): String {
        val value = args[key] as? String ?: throw PlatformSecurityError(OPERATION_FAILED)
        if (value.isEmpty() || value.length > max) throw PlatformSecurityError(OPERATION_FAILED)
        return value
    }

    private fun timestampText(args: Map<String, Any?>, key: String): String {
        val value = boundedText(args, key, 40)
        try {
            canonicalInstant(value)
        } catch (_: Throwable) {
            throw PlatformSecurityError(OPERATION_FAILED)
        }
        return value
    }

    private fun positiveInt(args: Map<String, Any?>, key: String): Int {
        val value = args[key] as? Int ?: throw PlatformSecurityError(OPERATION_FAILED)
        if (value < 1) throw PlatformSecurityError(OPERATION_FAILED)
        return value
    }

    private fun requireValue(args: Map<String, Any?>, key: String, expected: String) {
        if (args[key] != expected) throw PlatformSecurityError(OPERATION_FAILED)
    }

    private fun encrypt(key: SecretKey, plaintext: ByteArray, aad: ByteArray): SealedBytes =
        Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, key)
            updateAAD(aad)
            SealedBytes(iv.copyOf(), doFinal(plaintext))
        }

    private fun randomToken(size: Int) = base64Url(randomBytes(size))
    private fun randomBytes(size: Int) = ByteArray(size).also { java.security.SecureRandom().nextBytes(it) }
    private fun base64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
    private fun base64Url(bytes: ByteArray) = Base64.encodeToString(
        bytes,
        Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE,
    )
    private fun decodeBase64(value: String) = Base64.decode(value, Base64.NO_WRAP)
    private fun pem(label: String, bytes: ByteArray): ByteArray {
        val encoded = Base64.encode(bytes, Base64.NO_WRAP)
        val header = "-----BEGIN $label-----\n".toByteArray(StandardCharsets.US_ASCII)
        val footer = "-----END $label-----\n".toByteArray(StandardCharsets.US_ASCII)
        val lineCount = (encoded.size + PEM_LINE_BYTES - 1) / PEM_LINE_BYTES
        val output = ByteArray(header.size + encoded.size + lineCount + footer.size)
        return try {
            var sourceOffset = 0
            var outputOffset = 0
            header.copyInto(output, outputOffset)
            outputOffset += header.size
            while (sourceOffset < encoded.size) {
                val length = minOf(PEM_LINE_BYTES, encoded.size - sourceOffset)
                encoded.copyInto(
                    output,
                    destinationOffset = outputOffset,
                    startIndex = sourceOffset,
                    endIndex = sourceOffset + length,
                )
                sourceOffset += length
                outputOffset += length
                output[outputOffset++] = '\n'.code.toByte()
            }
            footer.copyInto(output, outputOffset)
            outputOffset += footer.size
            check(outputOffset == output.size)
            output
        } finally {
            encoded.fill(0)
        }
    }
    private fun jsonMap(value: String): Map<String, Any?> {
        val json = JSONObject(value)
        return json.keys().asSequence().associateWith { key -> if (json.isNull(key)) null else json.get(key) }
    }
    private fun mapsEqualStringKeys(left: Map<*, *>, right: Map<String, Any>): Boolean =
        left.keys.all { it is String } && left.size == right.size && right.all { left[it.key] == it.value }
    private fun now() = clock().truncatedTo(ChronoUnit.MILLIS)
    private fun signingAlias(alias: String) = "supermega-connected-signing-$alias"
    private fun aesAlias(alias: String) = "supermega-connected-seal-$alias"
    private fun recordKey(alias: String) = "$RECORD_PREFIX$alias"
    private fun snake(value: String) = value.replace(Regex("([a-z])([A-Z])"), "$1_$2").lowercase()
    private fun android.content.SharedPreferences.Editor.commitOrThrow() {
        if (!commit()) throw PlatformSecurityError(OPERATION_FAILED)
    }

    private data class SealedBytes(val iv: ByteArray, val ciphertext: ByteArray)

    private data class IssuerTrust(
        val enrollmentKeySpkiBase64: String,
        val rootCertificateDerSha256: String,
    )

    private data class IdentityRecord(
        val alias: String,
        val state: String,
        val preparationHandle: String,
        val requestDigest: String,
        val pendingExpiresAt: String,
        val workspaceId: String,
        val siteId: String,
        val deviceId: String,
        val sessionGeneration: Int,
        val signingKeyId: String,
        val signingPublicKey: String,
        val signingFingerprint: String,
        val tlsPublicSpki: String,
        val tlsFingerprint: String,
        val tlsKeyId: String,
        val sealedTlsMaterialId: String,
        val nonceBase64Url: String,
        val encryptedTlsPrivate: String,
        val encryptedTlsIv: String,
        val issuerKeyId: String,
        val enrollmentIssuedAt: String,
        val enrollmentExpiresAt: String,
        val enrollmentSignatureAlgorithm: String,
        val issuerSignatureBase64Url: String,
        val certificateChainPem: String = "",
        val certificateChainSha256: String = "",
        val certificateFingerprint: String = "",
        val bundleDigest: String = "",
        val cleanupEvidenceJson: String = "",
    ) {
        fun isValid(): Boolean = try {
            TOKEN.matches(alias) &&
                state in setOf(STATE_PENDING, STATE_COMMITTED, STATE_EXPIRED) &&
                TOKEN.matches(preparationHandle) &&
                DIGEST.matches(requestDigest) &&
                Instant.parse(pendingExpiresAt) != null &&
                TOKEN.matches(workspaceId) && TOKEN.matches(siteId) && TOKEN.matches(deviceId) &&
                sessionGeneration >= 1 &&
                signingKeyId == signingAliasFor(alias) &&
                Base64.decode(signingPublicKey, Base64.NO_WRAP).size == 32 &&
                sha256Static(Base64.decode(signingPublicKey, Base64.NO_WRAP)) == signingFingerprint &&
                DIGEST.matches(signingFingerprint) &&
                sha256Static(Base64.decode(tlsPublicSpki, Base64.NO_WRAP)) == tlsFingerprint &&
                DIGEST.matches(tlsFingerprint) &&
                tlsKeyId == tlsKeyIdFor(alias) &&
                sealedTlsMaterialId == sealedTlsMaterialIdFor(alias) &&
                BASE64_URL.matches(nonceBase64Url) &&
                when (state) {
                    STATE_PENDING -> encryptedTlsPrivate.isNotEmpty() && encryptedTlsIv.isNotEmpty()
                    STATE_COMMITTED -> certificateChainPem.isNotEmpty() &&
                        DIGEST.matches(certificateChainSha256) &&
                        DIGEST.matches(certificateFingerprint) && DIGEST.matches(bundleDigest) &&
                        TOKEN.matches(issuerKeyId) &&
                        canonicalInstant(enrollmentExpiresAt).isAfter(
                            canonicalInstant(enrollmentIssuedAt),
                        ) &&
                        enrollmentSignatureAlgorithm == "ed25519" &&
                        BASE64_URL.matches(issuerSignatureBase64Url) &&
                        decodeBase64Url(issuerSignatureBase64Url, 64).size == 64
                    else -> encryptedTlsPrivate.isEmpty() && encryptedTlsIv.isEmpty() &&
                        cleanupEvidenceJson.isNotEmpty()
                }
        } catch (_: Throwable) {
            false
        }

        fun toJson() = JSONObject().apply {
            put("schema", RECORD_SCHEMA)
            put("alias", alias)
            put("state", state)
            put("preparationHandle", preparationHandle)
            put("requestDigest", requestDigest)
            put("pendingExpiresAt", pendingExpiresAt)
            put("workspaceId", workspaceId)
            put("siteId", siteId)
            put("deviceId", deviceId)
            put("sessionGeneration", sessionGeneration)
            put("signingKeyId", signingKeyId)
            put("signingPublicKey", signingPublicKey)
            put("signingFingerprint", signingFingerprint)
            put("tlsPublicSpki", tlsPublicSpki)
            put("tlsFingerprint", tlsFingerprint)
            put("tlsKeyId", tlsKeyId)
            put("sealedTlsMaterialId", sealedTlsMaterialId)
            put("nonceBase64Url", nonceBase64Url)
            put("encryptedTlsPrivate", encryptedTlsPrivate)
            put("encryptedTlsIv", encryptedTlsIv)
            put("issuerKeyId", issuerKeyId)
            put("enrollmentIssuedAt", enrollmentIssuedAt)
            put("enrollmentExpiresAt", enrollmentExpiresAt)
            put("enrollmentSignatureAlgorithm", enrollmentSignatureAlgorithm)
            put("issuerSignatureBase64Url", issuerSignatureBase64Url)
            put("certificateChainPem", certificateChainPem)
            put("certificateChainSha256", certificateChainSha256)
            put("certificateFingerprint", certificateFingerprint)
            put("bundleDigest", bundleDigest)
            put("cleanupEvidenceJson", cleanupEvidenceJson)
        }

        companion object {
            private fun sha256Static(bytes: ByteArray): String =
                MessageDigest.getInstance("SHA-256").digest(bytes)
                    .joinToString("") { "%02x".format(it) }

            fun fromJson(json: JSONObject): IdentityRecord {
                if (json.getString("schema") != RECORD_SCHEMA) throw PlatformSecurityError(OPERATION_FAILED)
                val expected = setOf(
                    "schema", "alias", "state", "preparationHandle", "requestDigest",
                    "pendingExpiresAt", "workspaceId", "siteId", "deviceId", "sessionGeneration",
                    "signingKeyId", "signingPublicKey", "signingFingerprint", "tlsPublicSpki",
                    "tlsFingerprint", "tlsKeyId", "sealedTlsMaterialId", "nonceBase64Url", "encryptedTlsPrivate",
                    "encryptedTlsIv", "issuerKeyId", "enrollmentIssuedAt", "enrollmentExpiresAt",
                    "enrollmentSignatureAlgorithm", "issuerSignatureBase64Url",
                    "certificateChainPem", "certificateChainSha256",
                    "certificateFingerprint", "bundleDigest",
                    "cleanupEvidenceJson",
                )
                if (json.keys().asSequence().toSet() != expected) {
                    throw PlatformSecurityError(OPERATION_FAILED)
                }
                return IdentityRecord(
                    alias = json.getString("alias"),
                    state = json.getString("state"),
                    preparationHandle = json.getString("preparationHandle"),
                    requestDigest = json.getString("requestDigest"),
                    pendingExpiresAt = json.getString("pendingExpiresAt"),
                    workspaceId = json.getString("workspaceId"),
                    siteId = json.getString("siteId"),
                    deviceId = json.getString("deviceId"),
                    sessionGeneration = json.getInt("sessionGeneration"),
                    signingKeyId = json.getString("signingKeyId"),
                    signingPublicKey = json.getString("signingPublicKey"),
                    signingFingerprint = json.getString("signingFingerprint"),
                    tlsPublicSpki = json.getString("tlsPublicSpki"),
                    tlsFingerprint = json.getString("tlsFingerprint"),
                    tlsKeyId = json.getString("tlsKeyId"),
                    sealedTlsMaterialId = json.getString("sealedTlsMaterialId"),
                    nonceBase64Url = json.getString("nonceBase64Url"),
                    encryptedTlsPrivate = json.optString("encryptedTlsPrivate"),
                    encryptedTlsIv = json.optString("encryptedTlsIv"),
                    issuerKeyId = json.optString("issuerKeyId"),
                    enrollmentIssuedAt = json.optString("enrollmentIssuedAt"),
                    enrollmentExpiresAt = json.optString("enrollmentExpiresAt"),
                    enrollmentSignatureAlgorithm = json.optString("enrollmentSignatureAlgorithm"),
                    issuerSignatureBase64Url = json.optString("issuerSignatureBase64Url"),
                    certificateChainPem = json.optString("certificateChainPem"),
                    certificateChainSha256 = json.optString("certificateChainSha256"),
                    certificateFingerprint = json.optString("certificateFingerprint"),
                    bundleDigest = json.optString("bundleDigest"),
                    cleanupEvidenceJson = json.optString("cleanupEvidenceJson"),
                )
            }
        }
    }

    private class PlatformSecurityError(val code: String) : RuntimeException()

    companion object {
        internal fun hasApprovedIssuerTrust(): Boolean =
            APPROVED_ISSUERS.isNotEmpty()

        /**
         * Revalidates the complete persisted custody boundary before a
         * coordinator lifecycle may report ready. A null result is the only
         * success value; all malformed, stale, missing, or substituted state
         * fails closed without repairing it.
         */
        internal fun coordinatorIdentityFailure(
            context: Context,
            alias: String,
            currentTime: Instant = Instant.now().truncatedTo(ChronoUnit.MILLIS),
        ): String? {
            if (!TOKEN.matches(alias) || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                return "identity_unavailable"
            }
            return try {
                val preferences = context.applicationContext.getSharedPreferences(
                    PREFERENCES,
                    Context.MODE_PRIVATE,
                )
                val raw = preferences.getString("$RECORD_PREFIX$alias", null)
                    ?: return "identity_unavailable"
                val record = IdentityRecord.fromJson(JSONObject(raw))
                if (record.alias != alias || record.state != STATE_COMMITTED || !record.isValid()) {
                    return "identity_custody_invalid"
                }
                if (record.signingKeyId != signingAliasFor(alias) ||
                    record.tlsKeyId != tlsKeyIdFor(alias) ||
                    record.sealedTlsMaterialId != sealedTlsMaterialIdFor(alias)) {
                    return "identity_custody_invalid"
                }
                val enrollmentIssuedAt = canonicalInstant(record.enrollmentIssuedAt)
                val enrollmentExpiresAt = canonicalInstant(record.enrollmentExpiresAt)
                val pendingExpiresAt = canonicalInstant(record.pendingExpiresAt)
                if (enrollmentIssuedAt.isAfter(currentTime.plusSeconds(CLOCK_SKEW_SECONDS)) ||
                    !enrollmentExpiresAt.isAfter(currentTime) ||
                    enrollmentExpiresAt.isBefore(pendingExpiresAt)) {
                    return "identity_enrollment_expired"
                }
                val trust = APPROVED_ISSUERS[record.issuerKeyId]
                    ?: return "issuer_trust_unavailable"
                val signedBundlePayload = linkedMapOf<String, Any>(
                    "schema" to ENROLLMENT_BUNDLE_SCHEMA,
                    "requestDigest" to record.requestDigest,
                    "alias" to record.alias,
                    "workspaceId" to record.workspaceId,
                    "siteId" to record.siteId,
                    "deviceId" to record.deviceId,
                    "sessionGeneration" to record.sessionGeneration,
                    "signingKeyId" to record.signingKeyId,
                    "signingPublicKeyFingerprintSha256" to record.signingFingerprint,
                    "tlsKeyId" to record.tlsKeyId,
                    "tlsPublicKeyFingerprintSha256" to record.tlsFingerprint,
                    "sealedTlsMaterialId" to record.sealedTlsMaterialId,
                    "preparationHandle" to record.preparationHandle,
                    "nonceBase64Url" to record.nonceBase64Url,
                    "issuerKeyId" to record.issuerKeyId,
                    "certificateChainSha256" to record.certificateChainSha256,
                    "tlsCertificateFingerprintSha256" to record.certificateFingerprint,
                    "issuedAt" to record.enrollmentIssuedAt,
                    "expiresAt" to record.enrollmentExpiresAt,
                    "pendingExpiresAt" to record.pendingExpiresAt,
                    "signatureAlgorithm" to record.enrollmentSignatureAlgorithm,
                )
                val reconstructedBundleDigest = digestCanonical(
                    signedBundlePayload +
                        ("issuerSignatureBase64Url" to record.issuerSignatureBase64Url),
                )
                if (reconstructedBundleDigest != record.bundleDigest) {
                    return "identity_custody_invalid"
                }
                val issuerSignature = decodeBase64Url(record.issuerSignatureBase64Url, 64)
                try {
                    val issuerPublicKey = KeyFactory.getInstance("Ed25519").generatePublic(
                        X509EncodedKeySpec(
                            Base64.decode(
                                trust.enrollmentKeySpkiBase64,
                                Base64.DEFAULT,
                            ),
                        ),
                    )
                    val signedBytes = canonicalJson(signedBundlePayload)
                        .toByteArray(StandardCharsets.UTF_8)
                    try {
                        val verified = Signature.getInstance("Ed25519").run {
                            initVerify(issuerPublicKey)
                            update(signedBytes)
                            verify(issuerSignature)
                        }
                        if (!verified) return "identity_custody_invalid"
                    } finally {
                        signedBytes.fill(0)
                    }
                } finally {
                    issuerSignature.fill(0)
                }
                val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply {
                    load(null)
                }
                val signingCertificate = keyStore.getCertificate(signingAliasFor(alias))
                    ?: return "identity_custody_invalid"
                val signingPrivateKey = keyStore.getKey(signingAliasFor(alias), null)
                    as? java.security.PrivateKey ?: return "identity_custody_invalid"
                val signingPublic = rawEd25519PublicKey(signingCertificate.publicKey.encoded)
                try {
                    if (base64(signingPublic) != record.signingPublicKey ||
                        sha256(signingPublic) != record.signingFingerprint) {
                        return "identity_custody_invalid"
                    }
                } finally {
                    signingPublic.fill(0)
                }
                val signingChallenge = MessageDigest.getInstance("SHA-256").digest(
                    "supermega.coordinator-signing-custody.v1:$alias:${record.requestDigest}:${record.bundleDigest}"
                        .toByteArray(StandardCharsets.UTF_8),
                )
                try {
                    val signingProof = Signature.getInstance("Ed25519").run {
                        initSign(signingPrivateKey)
                        update(signingChallenge)
                        sign()
                    }
                    try {
                        val verified = Signature.getInstance("Ed25519").run {
                            initVerify(signingCertificate.publicKey)
                            update(signingChallenge)
                            verify(signingProof)
                        }
                        if (!verified) return "identity_custody_invalid"
                    } finally {
                        signingProof.fill(0)
                    }
                } finally {
                    signingChallenge.fill(0)
                }

                val certificateBytes = decodeBase64(record.certificateChainPem)
                try {
                    if (sha256(certificateBytes) != record.certificateChainSha256) {
                        return "identity_custody_invalid"
                    }
                    val certificates = parseCertificateChain(certificateBytes)
                    validateCertificateChain(
                        certificates,
                        currentTime,
                        trust.rootCertificateDerSha256,
                    )
                    val leaf = certificates.first()
                    if (sha256(leaf.encoded) != record.certificateFingerprint ||
                        sha256(leaf.publicKey.encoded) != record.tlsFingerprint ||
                        leaf.notBefore.toInstant().isAfter(enrollmentIssuedAt) ||
                        leaf.notAfter.toInstant().isBefore(enrollmentExpiresAt) ||
                        leaf.notAfter.toInstant().isBefore(pendingExpiresAt)) {
                        return "identity_custody_invalid"
                    }
                } finally {
                    certificateBytes.fill(0)
                }
                val tlsSpki = decodeBase64(record.tlsPublicSpki)
                try {
                    if (sha256(tlsSpki) != record.tlsFingerprint) {
                        return "identity_custody_invalid"
                    }
                } finally {
                    tlsSpki.fill(0)
                }

                val aesKey = keyStore.getKey(aesAliasFor(alias), null) as? SecretKey
                    ?: return "identity_custody_invalid"
                val ciphertext = decodeBase64(record.encryptedTlsPrivate)
                val iv = decodeBase64(record.encryptedTlsIv)
                val aad = alias.toByteArray(StandardCharsets.UTF_8)
                val privateBytes = try {
                    decrypt(aesKey, ciphertext, iv, aad)
                } finally {
                    ciphertext.fill(0)
                    iv.fill(0)
                    aad.fill(0)
                }
                try {
                    val privateKey = KeyFactory.getInstance("EC")
                        .generatePrivate(PKCS8EncodedKeySpec(privateBytes))
                    val certificateBytesAgain = decodeBase64(record.certificateChainPem)
                    try {
                        val leaf = parseCertificateChain(certificateBytesAgain).first()
                        val challenge = MessageDigest.getInstance("SHA-256").digest(
                            "supermega.coordinator-custody.v1:$alias:${record.requestDigest}"
                                .toByteArray(StandardCharsets.UTF_8),
                        )
                        try {
                            val proof = Signature.getInstance("SHA256withECDSA").run {
                                initSign(privateKey)
                                update(
                                    challenge,
                                )
                                sign()
                            }
                            try {
                                val verified = Signature.getInstance("SHA256withECDSA").run {
                                    initVerify(leaf.publicKey)
                                    update(challenge)
                                    verify(proof)
                                }
                                if (!verified) return "identity_custody_invalid"
                            } finally {
                                proof.fill(0)
                            }
                        } finally {
                            challenge.fill(0)
                        }
                    } finally {
                        certificateBytesAgain.fill(0)
                    }
                } finally {
                    privateBytes.fill(0)
                }
                null
            } catch (_: Throwable) {
                "identity_custody_invalid"
            }
        }

        private fun signingAliasFor(alias: String) = "supermega-connected-signing-$alias"
        private fun aesAliasFor(alias: String) = "supermega-connected-seal-$alias"
        private fun tlsKeyIdFor(alias: String) = "tls-$alias"
        private fun sealedTlsMaterialIdFor(alias: String) = "sealed-$alias"

        private fun rawEd25519PublicKey(encoded: ByteArray): ByteArray {
            val prefix = byteArrayOf(
                0x30, 0x2a, 0x30, 0x05, 0x06, 0x03,
                0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
            )
            if (encoded.size != prefix.size + 32 ||
                !encoded.copyOfRange(0, prefix.size).contentEquals(prefix)) {
                throw PlatformSecurityError(OPERATION_FAILED)
            }
            return encoded.copyOfRange(prefix.size, encoded.size)
        }

        private fun parseCertificateChain(bytes: ByteArray): List<X509Certificate> {
            val certificates = CertificateFactory.getInstance("X.509")
                .generateCertificates(ByteArrayInputStream(bytes))
                .mapNotNull { it as? X509Certificate }
            if (certificates.size < 2) {
                throw PlatformSecurityError("platform_certificate_chain_invalid")
            }
            return certificates
        }

        private fun validateCertificateChain(
            certificates: List<X509Certificate>,
            currentTime: Instant,
            expectedRootDerSha256: String,
        ) {
            if (!DIGEST.matches(expectedRootDerSha256)) throw PlatformSecurityError(UNAVAILABLE)
            val validationDate = Date.from(currentTime)
            try {
                certificates.forEach { it.checkValidity(validationDate) }
                val certificateDigests = certificates.map { sha256(it.encoded) }
                if (certificateDigests.toSet().size != certificateDigests.size ||
                    certificates.first().basicConstraints >= 0) {
                    throw PlatformSecurityError("platform_certificate_chain_invalid")
                }
                for (index in 0 until certificates.lastIndex) {
                    val certificate = certificates[index]
                    val issuer = certificates[index + 1]
                    if (certificate.issuerX500Principal != issuer.subjectX500Principal ||
                        issuer.basicConstraints < index || !canSignCertificates(issuer)) {
                        throw PlatformSecurityError("platform_certificate_chain_invalid")
                    }
                    certificate.verify(issuer.publicKey)
                }
                val root = certificates.last()
                if (root.subjectX500Principal != root.issuerX500Principal ||
                    root.basicConstraints < 0 || !canSignCertificates(root)) {
                    throw PlatformSecurityError("platform_certificate_chain_invalid")
                }
                root.verify(root.publicKey)
                if (sha256(root.encoded) != expectedRootDerSha256) {
                    throw PlatformSecurityError("platform_certificate_root_mismatch")
                }
            } catch (error: PlatformSecurityError) {
                throw error
            } catch (_: Throwable) {
                throw PlatformSecurityError("platform_certificate_chain_invalid")
            }
        }

        private fun canSignCertificates(certificate: X509Certificate): Boolean {
            val usage = certificate.keyUsage ?: return false
            return usage.size > KEY_CERT_SIGN_INDEX && usage[KEY_CERT_SIGN_INDEX]
        }

        private fun canonicalInstant(value: String): Instant {
            if (!CANONICAL_UTC_TIMESTAMP.matches(value)) {
                throw PlatformSecurityError(OPERATION_FAILED)
            }
            return Instant.parse(value)
        }

        private fun digestCanonical(value: Map<String, Any>): String = sha256(
            canonicalJson(value).toByteArray(StandardCharsets.UTF_8),
        )

        private fun canonicalJson(value: Any?): String = when (value) {
            null -> "null"
            is String -> JSONObject.quote(value)
            is Boolean, is Int, is Long -> value.toString()
            is Map<*, *> -> value.entries
                .map { (key, item) ->
                    (key as? String ?: throw PlatformSecurityError(OPERATION_FAILED)) to item
                }
                .sortedBy { it.first }
                .joinToString(prefix = "{", postfix = "}") { (key, item) ->
                    "${JSONObject.quote(key)}:${canonicalJson(item)}"
                }
            is List<*> -> value.joinToString(prefix = "[", postfix = "]") {
                canonicalJson(it)
            }
            else -> throw PlatformSecurityError(OPERATION_FAILED)
        }

        private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }

        private fun base64(bytes: ByteArray): String =
            Base64.encodeToString(bytes, Base64.NO_WRAP)

        private fun decodeBase64(value: String): ByteArray =
            Base64.decode(value, Base64.NO_WRAP)

        private fun decodeBase64Url(value: String, length: Int): ByteArray {
            if (!BASE64_URL.matches(value)) throw PlatformSecurityError(OPERATION_FAILED)
            val decoded = Base64.decode(
                value,
                Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE,
            )
            val canonical = Base64.encodeToString(
                decoded,
                Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE,
            )
            if (decoded.size != length || canonical != value) {
                decoded.fill(0)
                throw PlatformSecurityError(OPERATION_FAILED)
            }
            return decoded
        }

        private fun decrypt(
            key: SecretKey,
            ciphertext: ByteArray,
            iv: ByteArray,
            aad: ByteArray,
        ): ByteArray = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            updateAAD(aad)
            doFinal(ciphertext)
        }

        const val CHANNEL = "dev.supermega.supermega_shop/connected_security_v1"
        const val PREFERENCES = "supermega_connected_security_v1"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ED25519_ALGORITHM = "Ed25519"
        const val RECORD_PREFIX = "identity:"
        const val RECORD_SCHEMA = "supermega.connected-platform-android-record.v1"
        const val PREPARE_REQUEST_SCHEMA = "supermega.connected-platform-prepare-request.v1"
        const val PREPARE_RESPONSE_SCHEMA = "supermega.connected-platform-prepare-response.v1"
        const val ENROLLMENT_REQUEST_SCHEMA = "supermega.connected-platform-enrollment-request.v1"
        const val COMPLETE_REQUEST_SCHEMA = "supermega.connected-platform-complete-request.v1"
        const val ENROLLMENT_BUNDLE_SCHEMA = "supermega.connected-platform-enrollment-bundle.v1"
        const val COMPLETION_RESPONSE_SCHEMA = "supermega.connected-platform-completion.v1"
        const val ABORT_REQUEST_SCHEMA = "supermega.connected-platform-abort-request.v1"
        const val ABORT_PREPARATION_SCHEMA = "supermega.connected-platform-abort-preparation.v1"
        const val RECONCILE_REQUEST_SCHEMA = "supermega.connected-platform-reconcile-request.v1"
        const val RECONCILE_RESPONSE_SCHEMA = "supermega.connected-platform-reconcile-response.v1"
        const val CLEANUP_EVIDENCE_SCHEMA = "supermega.connected-platform-cleanup-evidence.v1"
        const val IDENTITY_SCHEMA = "supermega.connected-platform-identity.v1"
        const val TLS_IDENTITY_SCHEMA = "supermega.connected-platform-tls-identity.v1"
        const val GENERIC_REQUEST_SCHEMA = "supermega.connected-platform-request.v1"
        const val SIGN_REQUEST_SCHEMA = "supermega.connected-platform-sign-request.v1"
        const val TLS_REQUEST_SCHEMA = "supermega.connected-platform-tls-request.v1"
        const val STATE_PENDING = "pending"
        const val STATE_COMMITTED = "completed"
        const val STATE_EXPIRED = "expired"
        const val PENDING_TTL_MINUTES = 10L
        const val CLOCK_SKEW_SECONDS = 30L
        const val MAX_CERTIFICATE_BYTES = 64 * 1024
        const val MAX_SIGNING_BYTES = 1024 * 1024
        const val KEY_CERT_SIGN_INDEX = 5
        const val PEM_LINE_BYTES = 64
        const val UNAVAILABLE = "platform_security_unavailable"
        const val OPERATION_FAILED = "platform_security_operation_failed"
        val TOKEN = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        val DIGEST = Regex("^[0-9a-f]{64}$")
        val BASE64_URL = Regex("^[A-Za-z0-9_-]+$")
        val CANONICAL_UTC_TIMESTAMP = Regex(
            """^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,6})?Z$""",
        )

        // Deliberately empty. Adding a key requires independent source review;
        // runtime input, preferences, QR data, and URLs can never populate it.
        private val APPROVED_ISSUERS: Map<String, IssuerTrust> = emptyMap()

        val COMPLETE_KEYS = setOf(
            "schema", "enrollmentSchema", "requestDigest", "alias", "workspaceId", "siteId",
            "deviceId", "sessionGeneration", "signingKeyId", "signingPublicKeyFingerprintSha256",
            "tlsKeyId", "tlsPublicKeyFingerprintSha256", "sealedTlsMaterialId", "preparationHandle",
            "nonceBase64Url", "issuerKeyId", "certificateChainPem", "certificateChainSha256",
            "tlsCertificateFingerprintSha256", "issuedAt", "expiresAt", "pendingExpiresAt",
            "signatureAlgorithm", "issuerSignatureBase64Url", "bundleDigest",
        )
    }
}
