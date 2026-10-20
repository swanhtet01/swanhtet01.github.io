package com.elriztechnology.unified_esc_pos_printer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/**
 * Talks to USB Printer Class (interface class 0x07) devices directly via
 * UsbManager and UsbDeviceConnection.bulkTransfer.
 *
 * This is the fallback path used for printers that don't expose a CDC /
 * serial-chip interface and therefore can't be opened by the `usb_serial`
 * package. Most generic ESC/POS thermal printers fall into this category.
 */
class UsbPrinterClassManager(private val context: Context) {

    companion object {
        private const val ACTION_USB_PERMISSION =
            "com.elriztechnology.unified_esc_pos_printer.USB_PERMISSION"
        private const val WRITE_CHUNK_SIZE = 16 * 1024
        private const val WRITE_TIMEOUT_MS = 5000

        // The USB connection is shared process-wide. Background isolates
        // attach their own plugin instance, so the claimed interface must not
        // be owned by a single engine (issue #21).
        //
        // All connection state below is confined to the single-threaded [ops]
        // executor: opens, writes, and closes run on it in FIFO order, which
        // makes each write call an atomic print job.
        private val ops = Executors.newSingleThreadExecutor { r ->
            Thread(r, "unified-esc-pos-usb").apply { isDaemon = true }
        }

        private var connection: UsbDeviceConnection? = null
        private var claimedInterface: UsbInterface? = null
        private var bulkOut: UsbEndpoint? = null
        private var connectedKey: String? = null

        // Instances (one per Flutter engine) currently holding the
        // connection. It closes only when the last lease is released.
        private val leaseHolders = mutableSetOf<UsbPrinterClassManager>()

        // Runs on the ops thread.
        private fun closeConnection() {
            val conn = connection
            val itf = claimedInterface
            if (conn != null && itf != null) {
                try { conn.releaseInterface(itf) } catch (_: Exception) {}
            }
            try { conn?.close() } catch (_: Exception) {}
            connection = null
            claimedInterface = null
            bulkOut = null
            connectedKey = null
        }
    }

    private val usbManager: UsbManager =
        context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var permissionReceiver: BroadcastReceiver? = null

    var connectionStateCallback: ((String) -> Unit)? = null

    fun listUsbDevices(result: MethodChannel.Result) {
        val devices = usbManager.deviceList.values.map { device ->
            val interfaceClasses = mutableListOf<Int>()
            for (i in 0 until device.interfaceCount) {
                interfaceClasses.add(device.getInterface(i).interfaceClass)
            }
            mapOf(
                "vid" to device.vendorId,
                "pid" to device.productId,
                "deviceName" to device.deviceName,
                "productName" to (device.productName ?: ""),
                "manufacturerName" to (device.manufacturerName ?: ""),
                "interfaceClasses" to interfaceClasses,
                "hasPrinterClass" to interfaceClasses.contains(UsbConstants.USB_CLASS_PRINTER),
                "hasPermission" to usbManager.hasPermission(device)
            )
        }
        result.success(devices)
    }

    fun openPrinterClass(vid: Int, pid: Int, result: MethodChannel.Result) {
        val device = findDevice(vid, pid)
        if (device == null) {
            result.error("NOT_FOUND", "USB device $vid:$pid not found", null)
            return
        }

        if (usbManager.hasPermission(device)) {
            openDeviceInternal(device, result)
        } else {
            requestPermissionAndOpen(device, result)
        }
    }

    private fun requestPermissionAndOpen(device: UsbDevice, result: MethodChannel.Result) {
        unregisterPermissionReceiver()

        permissionReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION) return
                unregisterPermissionReceiver()

                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                if (!granted) {
                    mainHandler.post {
                        result.error("PERMISSION_DENIED", "USB permission denied by user", null)
                    }
                    return
                }
                openDeviceInternal(device, result)
            }
        }

        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            context.registerReceiver(
                permissionReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(permissionReceiver, filter)
        }

        // Setting the package on the intent makes it explicit (required for
        // PendingIntent on Android 14+ when targeting an unexported receiver).
        val intent = Intent(ACTION_USB_PERMISSION).setPackage(context.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val pendingIntent = PendingIntent.getBroadcast(context, 0, intent, flags)
        usbManager.requestPermission(device, pendingIntent)
    }

    private fun openDeviceInternal(device: UsbDevice, result: MethodChannel.Result) {
        val key = "${device.vendorId}:${device.productId}"

        ops.execute {
            // Reuse the live connection when another isolate (or this one)
            // already opened the same printer.
            if (connectedKey == key && connection != null) {
                leaseHolders.add(this)
                mainHandler.post {
                    connectionStateCallback?.invoke("connected")
                    result.success(null)
                }
                return@execute
            }

            // Connected to a different printer: only tear it down when no
            // other isolate still holds it.
            val othersHold = leaseHolders.any { it !== this }
            if (connection != null && othersHold) {
                mainHandler.post {
                    result.error(
                        "PRINTER_BUSY",
                        "Another print job is using the USB connection",
                        null
                    )
                }
                return@execute
            }

            closeConnection()
            leaseHolders.clear()

            val conn = usbManager.openDevice(device)
            if (conn == null) {
                mainHandler.post {
                    result.error("OPEN_FAILED", "Could not open USB device", null)
                }
                return@execute
            }

            var printerInterface: UsbInterface? = null
            var outEndpoint: UsbEndpoint? = null

            outer@ for (i in 0 until device.interfaceCount) {
                val itf = device.getInterface(i)
                if (itf.interfaceClass != UsbConstants.USB_CLASS_PRINTER) continue
                for (e in 0 until itf.endpointCount) {
                    val ep = itf.getEndpoint(e)
                    if (ep.direction == UsbConstants.USB_DIR_OUT &&
                        ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK
                    ) {
                        printerInterface = itf
                        outEndpoint = ep
                        break@outer
                    }
                }
            }

            if (printerInterface == null || outEndpoint == null) {
                conn.close()
                mainHandler.post {
                    result.error(
                        "NO_PRINTER_INTERFACE",
                        "No USB Printer Class interface with bulk-OUT endpoint found",
                        null
                    )
                }
                return@execute
            }

            if (!conn.claimInterface(printerInterface, true)) {
                conn.close()
                mainHandler.post {
                    result.error("CLAIM_FAILED", "Could not claim USB printer interface", null)
                }
                return@execute
            }

            connection = conn
            claimedInterface = printerInterface
            bulkOut = outEndpoint
            connectedKey = key
            leaseHolders.add(this)

            mainHandler.post {
                connectionStateCallback?.invoke("connected")
                result.success(null)
            }
        }
    }

    fun write(data: ByteArray, result: MethodChannel.Result) {
        ops.execute {
            val conn = connection
            val endpoint = bulkOut
            if (conn == null || endpoint == null) {
                mainHandler.post {
                    result.error("NOT_CONNECTED", "USB printer not connected", null)
                }
                return@execute
            }

            try {
                var offset = 0
                while (offset < data.size) {
                    val len = minOf(WRITE_CHUNK_SIZE, data.size - offset)
                    val chunk = if (offset == 0 && len == data.size) {
                        data
                    } else {
                        data.copyOfRange(offset, offset + len)
                    }
                    val written = conn.bulkTransfer(endpoint, chunk, len, WRITE_TIMEOUT_MS)
                    if (written < 0) {
                        mainHandler.post {
                            result.error(
                                "WRITE_FAILED",
                                "USB bulkTransfer failed at offset $offset",
                                null
                            )
                        }
                        return@execute
                    }
                    offset += written
                }
                mainHandler.post { result.success(null) }
            } catch (e: Exception) {
                mainHandler.post {
                    result.error("WRITE_FAILED", "USB write failed", e.message)
                }
            }
        }
    }

    fun close(result: MethodChannel.Result) {
        ops.execute {
            releaseLease()
            mainHandler.post {
                connectionStateCallback?.invoke("disconnected")
                result.success(null)
            }
        }
    }

    fun dispose() {
        unregisterPermissionReceiver()
        ops.execute { releaseLease() }
    }

    private fun findDevice(vid: Int, pid: Int): UsbDevice? {
        return usbManager.deviceList.values.firstOrNull {
            it.vendorId == vid && it.productId == pid
        }
    }

    // Runs on the ops thread. Closes the connection only when the last
    // isolate holding it releases its lease.
    private fun releaseLease() {
        leaseHolders.remove(this)
        if (leaseHolders.isEmpty()) {
            closeConnection()
        }
    }

    private fun unregisterPermissionReceiver() {
        val receiver = permissionReceiver ?: return
        try { context.unregisterReceiver(receiver) } catch (_: IllegalArgumentException) {}
        permissionReceiver = null
    }
}
