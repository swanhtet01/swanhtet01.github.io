package dev.supermega.supermega_shop

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.time.Instant
import org.json.JSONObject

/**
 * Lifecycle-only coordinator boundary. It never opens a socket and reports LAN
 * availability only after an explicit Dart listener confirmation. The service
 * can remain running only after feature, API, notification, issuer-trust, and
 * committed-identity prerequisites pass.
 */
internal class ConnectedCoordinatorForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            persistStatus(applicationContext, CoordinatorStatus.stopped("explicit_stop"))
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf(startId)
            return START_NOT_STICKY
        }
        val alias = intent?.getStringExtra(EXTRA_ALIAS)
            ?: preferences(applicationContext).getString(KEY_REQUESTED_ALIAS, null)
        val readiness = coordinatorReadiness(applicationContext, alias)
        if (!readiness.ready) {
            val status = CoordinatorStatus.unavailable(readiness.reason, alias)
            persistStatus(applicationContext, status)
            // Satisfy the foreground-service start contract before failing
            // closed. This notification is immediately removed with the
            // stopped service; connected operation never starts.
            startVisible(status)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf(startId)
            return START_NOT_STICKY
        }
        preferences(applicationContext).edit()
            .putString(KEY_REQUESTED_ALIAS, alias)
            .commit()
        val status = CoordinatorStatus.running(alias!!, listenerActive = false)
        persistStatus(applicationContext, status)
        startVisible(status)
        // A system restart may recreate only a previously ready service. Every
        // recreation re-evaluates identity/trust before remaining foreground.
        return START_STICKY
    }

    override fun onDestroy() {
        val current = currentStatus(applicationContext)
        if (current.state == STATE_RUNNING) {
            persistStatus(applicationContext, CoordinatorStatus.stopped("service_destroyed"))
        }
        super.onDestroy()
    }

    private fun startVisible(status: CoordinatorStatus) {
        val notification = coordinatorNotification(this, status)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        internal const val CHANNEL = "dev.supermega.supermega_shop/connected_coordinator_service_v1"
        internal const val STATUS_SCHEMA = "supermega.connected-coordinator-status.v1"
        internal const val REQUEST_SCHEMA = "supermega.connected-coordinator-service-request.v1"
        internal const val ACTION_START = "dev.supermega.supermega_shop.action.START_COORDINATOR"
        internal const val ACTION_STOP = "dev.supermega.supermega_shop.action.STOP_COORDINATOR"
        private const val EXTRA_ALIAS = "coordinatorAlias"
        private const val PREFERENCES = "supermega_connected_coordinator_service_v1"
        private const val KEY_STATUS = "status"
        private const val KEY_REQUESTED_ALIAS = "requestedAlias"
        private const val NOTIFICATION_CHANNEL = "supermega_connected_coordinator"
        private const val NOTIFICATION_ID = 41017
        internal const val STATE_STOPPED = "stopped"
        internal const val STATE_UNAVAILABLE = "unavailable"
        internal const val STATE_RUNNING = "running"

        internal fun requestStart(context: Context, alias: String): CoordinatorStatus {
            val readiness = coordinatorReadiness(context, alias)
            if (!readiness.ready) {
                return CoordinatorStatus.unavailable(readiness.reason, alias).also {
                    persistStatus(context, it)
                }
            }
            val intent = Intent(context, ConnectedCoordinatorForegroundService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_ALIAS, alias)
            context.startForegroundService(intent)
            return CoordinatorStatus.starting(alias).also { persistStatus(context, it) }
        }

        internal fun requestStop(context: Context): CoordinatorStatus {
            context.stopService(Intent(context, ConnectedCoordinatorForegroundService::class.java))
            preferences(context).edit().remove(KEY_REQUESTED_ALIAS).commit()
            return CoordinatorStatus.stopped("explicit_stop").also { persistStatus(context, it) }
        }

        internal fun requestMarkListening(context: Context, alias: String): CoordinatorStatus {
            val current = currentStatus(context)
            val readiness = coordinatorReadiness(context, alias)
            if (!readiness.ready || current.state != STATE_RUNNING ||
                current.coordinatorAlias != alias || current.lanListenerActive) {
                return CoordinatorStatus.unavailable(
                    if (!readiness.ready) readiness.reason else "listener_transition_invalid",
                    alias,
                ).also { persistStatus(context, it) }
            }
            return CoordinatorStatus.running(alias, listenerActive = true).also {
                persistStatus(context, it)
                updateVisibleNotification(context, it)
            }
        }

        internal fun currentStatus(context: Context): CoordinatorStatus {
            val raw = preferences(context).getString(KEY_STATUS, null)
                ?: return CoordinatorStatus.stopped("never_started")
            return try {
                CoordinatorStatus.fromJson(JSONObject(raw))
            } catch (_: Throwable) {
                CoordinatorStatus.unavailable("status_invalid", null)
            }
        }

        private fun coordinatorReadiness(context: Context, alias: String?): Readiness {
            if (!BuildConfig.CONNECTED_SITE_PLATFORM_SECURITY_ENABLED) {
                return Readiness(false, "feature_disabled")
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                return Readiness(false, "api_unavailable")
            }
            if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED) {
                return Readiness(false, "notification_permission_unavailable")
            }
            if (!ConnectedPlatformSecurityAndroid.hasApprovedIssuerTrust()) {
                return Readiness(false, "issuer_trust_unavailable")
            }
            if (alias == null || !ALIAS.matches(alias)) {
                return Readiness(false, "identity_unavailable")
            }
            ConnectedPlatformSecurityAndroid.coordinatorIdentityFailure(context, alias)?.let {
                return Readiness(false, it)
            }
            return Readiness(true, "ready")
        }

        private fun preferences(context: Context) = context.applicationContext
            .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

        private fun persistStatus(context: Context, status: CoordinatorStatus) {
            preferences(context).edit().putString(KEY_STATUS, status.toJson().toString()).commit()
        }

        private fun updateVisibleNotification(context: Context, status: CoordinatorStatus) {
            context.getSystemService(NotificationManager::class.java).notify(
                NOTIFICATION_ID,
                coordinatorNotification(context, status),
            )
        }

        private fun coordinatorNotification(
            context: Context,
            status: CoordinatorStatus,
        ): Notification {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(
                    NOTIFICATION_CHANNEL,
                    "SuperMega coordinator",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Persistent status for the local Shop coordinator"
                    setShowBadge(false)
                },
            )
            val launchIntent = context.packageManager.getLaunchIntentForPackage(
                context.packageName,
            )
            val pendingIntent = launchIntent?.let {
                PendingIntent.getActivity(
                    context,
                    0,
                    it,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
            }
            return Notification.Builder(context, NOTIFICATION_CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
                .setContentTitle("SuperMega coordinator")
                .setContentText(status.notificationText())
                .setOngoing(status.state == STATE_RUNNING)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .apply { if (pendingIntent != null) setContentIntent(pendingIntent) }
                .build()
        }

        private val ALIAS = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    }
}

internal class ConnectedCoordinatorServiceChannel(
    private val activity: MainActivity,
    messenger: BinaryMessenger,
) {
    private val context = activity.applicationContext
    private val channel = MethodChannel(messenger, ConnectedCoordinatorForegroundService.CHANNEL)

    fun register() = channel.setMethodCallHandler(::handle)

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        try {
            val args = arguments(call)
            if (args["schema"] != ConnectedCoordinatorForegroundService.REQUEST_SCHEMA) {
                result.error("platform_coordinator_request_invalid", null, null)
                return
            }
            val response: Any = when (call.method) {
                "start" -> {
                    if (args.keys != setOf("schema", "coordinatorAlias")) {
                        throw IllegalArgumentException()
                    }
                    val alias = args["coordinatorAlias"] as? String
                        ?: throw IllegalArgumentException()
                    ConnectedCoordinatorForegroundService.requestStart(context, alias).toMap()
                }
                "stop" -> {
                    if (args.keys != setOf("schema")) throw IllegalArgumentException()
                    ConnectedCoordinatorForegroundService.requestStop(context).toMap()
                }
                "markListening" -> {
                    if (args.keys != setOf("schema", "coordinatorAlias")) {
                        throw IllegalArgumentException()
                    }
                    val alias = args["coordinatorAlias"] as? String
                        ?: throw IllegalArgumentException()
                    ConnectedCoordinatorForegroundService.requestMarkListening(
                        context,
                        alias,
                    ).toMap()
                }
                "status" -> {
                    if (args.keys != setOf("schema")) throw IllegalArgumentException()
                    ConnectedCoordinatorForegroundService.currentStatus(context).toMap()
                }
                "notificationPermissionStatus" -> {
                    if (args.keys != setOf("schema")) throw IllegalArgumentException()
                    notificationPermissionStatus(requestPending = false)
                }
                "requestNotificationPermission" -> {
                    if (args.keys != setOf("schema")) throw IllegalArgumentException()
                    requestNotificationPermission()
                }
                else -> {
                    result.notImplemented()
                    return
                }
            }
            result.success(response)
        } catch (_: Throwable) {
            result.error("platform_coordinator_request_invalid", null, null)
        }
    }

    private fun requestNotificationPermission(): Map<String, Any?> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED) {
            return notificationPermissionStatus(requestPending = false)
        }
        activity.requestPermissions(
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            NOTIFICATION_PERMISSION_REQUEST_CODE,
        )
        // Android owns the prompt and result. The caller must poll status (or
        // retry start) after the Activity callback; this path never assumes a
        // grant merely because a prompt was requested.
        return notificationPermissionStatus(requestPending = true)
    }

    private fun notificationPermissionStatus(requestPending: Boolean): Map<String, Any?> {
        val required = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        val granted = !required || activity.checkSelfPermission(
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        return mapOf(
            "schema" to NOTIFICATION_PERMISSION_SCHEMA,
            "required" to required,
            "state" to when {
                granted -> "granted"
                requestPending -> "request_pending"
                else -> "not_granted"
            },
            "canRequest" to (required && !granted),
            "updatedAt" to Instant.now()
                .truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString(),
        )
    }

    private fun arguments(call: MethodCall): Map<String, Any?> {
        val raw = call.arguments as? Map<*, *> ?: throw IllegalArgumentException()
        if (raw.keys.any { it !is String }) throw IllegalArgumentException()
        @Suppress("UNCHECKED_CAST")
        return raw as Map<String, Any?>
    }

    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 41018
        private const val NOTIFICATION_PERMISSION_SCHEMA =
            "supermega.connected-coordinator-notification-permission.v1"
    }
}

internal data class CoordinatorStatus(
    val state: String,
    val reason: String,
    val coordinatorAlias: String?,
    val lanListenerActive: Boolean,
    val connectedOperationEnabled: Boolean,
    val updatedAt: String,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "schema" to ConnectedCoordinatorForegroundService.STATUS_SCHEMA,
        "state" to state,
        "reason" to reason,
        "coordinatorAlias" to coordinatorAlias,
        "lanListenerActive" to lanListenerActive,
        "connectedOperationEnabled" to connectedOperationEnabled,
        "restartPolicy" to "sticky_when_ready",
        "updatedAt" to updatedAt,
    )

    fun toJson() = JSONObject(toMap())

    fun notificationText(): String = when (state) {
        ConnectedCoordinatorForegroundService.STATE_RUNNING -> if (lanListenerActive) {
            "Coordinator active · private LAN"
        } else {
            "Coordinator ready · LAN listener inactive"
        }
        ConnectedCoordinatorForegroundService.STATE_UNAVAILABLE ->
            "Coordinator unavailable · ${reason.replace('_', ' ')}"
        else -> "Coordinator stopped"
    }

    companion object {
        fun starting(alias: String) = status("starting", "start_requested", alias)
        fun running(alias: String, listenerActive: Boolean) = status(
            ConnectedCoordinatorForegroundService.STATE_RUNNING,
            "ready",
            alias,
            listenerActive,
        )
        fun stopped(reason: String) = status(
            ConnectedCoordinatorForegroundService.STATE_STOPPED,
            reason,
            null,
        )
        fun unavailable(reason: String, alias: String?) = status(
            ConnectedCoordinatorForegroundService.STATE_UNAVAILABLE,
            reason,
            alias,
        )

        fun fromJson(json: JSONObject): CoordinatorStatus {
            if (json.getString("schema") != ConnectedCoordinatorForegroundService.STATUS_SCHEMA ||
                json.getString("restartPolicy") != "sticky_when_ready") {
                throw IllegalArgumentException()
            }
            val state = json.getString("state")
            if (state !in setOf("starting", "running", "stopped", "unavailable")) {
                throw IllegalArgumentException()
            }
            val listenerActive = json.getBoolean("lanListenerActive")
            val operationEnabled = json.getBoolean("connectedOperationEnabled")
            if (listenerActive != operationEnabled ||
                state != ConnectedCoordinatorForegroundService.STATE_RUNNING && listenerActive) {
                throw IllegalArgumentException()
            }
            return CoordinatorStatus(
                state = state,
                reason = json.getString("reason"),
                coordinatorAlias = if (json.isNull("coordinatorAlias")) null
                    else json.getString("coordinatorAlias"),
                lanListenerActive = listenerActive,
                connectedOperationEnabled = operationEnabled,
                updatedAt = json.getString("updatedAt"),
            )
        }

        private fun status(
            state: String,
            reason: String,
            alias: String?,
            listenerActive: Boolean = false,
        ) = CoordinatorStatus(
            state = state,
            reason = reason,
            coordinatorAlias = alias,
            lanListenerActive = listenerActive,
            connectedOperationEnabled = listenerActive,
            updatedAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString(),
        )
    }
}

private data class Readiness(val ready: Boolean, val reason: String)
