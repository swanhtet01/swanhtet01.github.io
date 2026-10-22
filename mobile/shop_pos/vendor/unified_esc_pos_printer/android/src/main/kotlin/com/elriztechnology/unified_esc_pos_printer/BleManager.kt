package com.elriztechnology.unified_esc_pos_printer

import android.bluetooth.*
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.util.ArrayDeque
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

class BleManager(private val context: Context) {

    companion object {
        private val ESC_POS_SERVICE_UUID =
            UUID.fromString("000018f0-0000-1000-8000-00805f9b34fb")
        private val ESC_POS_TX_CHAR_UUID =
            UUID.fromString("00002af1-0000-1000-8000-00805f9b34fb")

        // The GATT link is shared process-wide. Background isolates (e.g.
        // notification handlers) attach their own plugin instance, so the
        // connection must not be owned by a single engine (issue #21).
        //
        // All state below is confined to the main thread: method calls from
        // every engine arrive on it, and GATT callbacks post onto it.
        private val sharedMainHandler = Handler(Looper.getMainLooper())

        private var gatt: BluetoothGatt? = null
        private var connectedDeviceId: String? = null
        private var txCharacteristic: BluetoothGattCharacteristic? = null
        private var negotiatedMtu: Int = 20
        private var writeWithoutResponse: Boolean = false

        // In-progress connection attempt; concurrent connects to the same
        // device join it instead of starting a second attempt.
        private var connectingDeviceId: String? = null
        private val pendingConnects =
            mutableListOf<Pair<BleManager, MethodChannel.Result>>()

        // Instances (one per Flutter engine) currently holding the
        // connection. The GATT closes only when the last lease is released.
        private val leaseHolders = mutableSetOf<BleManager>()

        private val instances = CopyOnWriteArrayList<BleManager>()

        // One write call = one print job (chunked + paced; issue #21).
        private class WriteJob(
            val chunks: List<ByteArray>,
            val withoutResponse: Boolean,
            val chunkDelayMs: Int,
            val bytesPerSecond: Int,
            val result: MethodChannel.Result
        ) {
            var index = 0
        }

        private val jobQueue = ArrayDeque<WriteJob>()
        private var activeJob: WriteJob? = null
        private val chunkDelayRunnable = Runnable { writeNextChunk() }

        private fun broadcastState(state: String) {
            for (instance in instances) {
                instance.connectionStateCallback?.invoke(state)
            }
        }

        private fun failPendingConnects(code: String, message: String) {
            for ((_, res) in pendingConnects) {
                res.error(code, message, null)
            }
            pendingConnects.clear()
            connectingDeviceId = null
        }

        private fun failAllJobs(code: String, message: String) {
            activeJob?.result?.error(code, message, null)
            activeJob = null
            while (jobQueue.isNotEmpty()) {
                jobQueue.poll().result.error(code, message, null)
            }
        }

        // Tear down the shared connection. Main thread only.
        private fun cleanupConnection() {
            sharedMainHandler.removeCallbacks(chunkDelayRunnable)
            failAllJobs("DISCONNECTED", "BLE device disconnected")
            try {
                gatt?.disconnect()
                gatt?.close()
            } catch (_: SecurityException) {
                // Ignore — we're disconnecting anyway
            }
            gatt = null
            connectedDeviceId = null
            txCharacteristic = null
            negotiatedMtu = 20
            writeWithoutResponse = false
            leaseHolders.clear()
        }

        // Main thread only.
        private fun pumpJobs() {
            if (activeJob != null) return
            activeJob = jobQueue.poll() ?: return
            writeNextChunk()
        }

        // Main thread only.
        private fun writeNextChunk() {
            val job = activeJob ?: return

            if (job.index >= job.chunks.size) {
                activeJob = null
                job.result.success(null)
                pumpJobs()
                return
            }

            val g = gatt
            val char = txCharacteristic
            if (g == null || char == null) {
                activeJob = null
                job.result.error("NOT_CONNECTED", "BLE device not connected", null)
                pumpJobs()
                return
            }

            val chunk = job.chunks[job.index]

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    // Android 13+ uses new writeCharacteristic API
                    val writeType = if (job.withoutResponse)
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    else
                        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

                    val status = g.writeCharacteristic(char, chunk, writeType)
                    if (status != BluetoothStatusCodes.SUCCESS) {
                        activeJob = null
                        job.result.error("WRITE_FAILED", "writeCharacteristic returned $status", null)
                        pumpJobs()
                    }
                } else {
                    @Suppress("DEPRECATION")
                    char.writeType = if (job.withoutResponse)
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    else
                        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

                    @Suppress("DEPRECATION")
                    char.value = chunk

                    @Suppress("DEPRECATION")
                    val success = g.writeCharacteristic(char)
                    if (!success) {
                        activeJob = null
                        job.result.error("WRITE_FAILED", "writeCharacteristic returned false", null)
                        pumpJobs()
                    }
                }
            } catch (e: SecurityException) {
                activeJob = null
                job.result.error("PERMISSION_DENIED", "Bluetooth write permission denied", e.message)
                pumpJobs()
            }
        }

        private fun pacedDelayMs(job: WriteJob, chunkLength: Int): Long {
            val floor = job.chunkDelayMs.toLong().coerceAtLeast(0L)
            val throughput = if (job.bytesPerSecond > 0 && chunkLength > 0) {
                (chunkLength * 1000L + job.bytesPerSecond - 1) / job.bytesPerSecond
            } else {
                0L
            }
            return maxOf(floor, throughput)
        }

        // Main thread only. Called from onCharacteristicWrite for each chunk.
        private fun onChunkAck(status: Int) {
            val job = activeJob ?: return
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val written = job.chunks[job.index].size
                job.index++
                if (job.index < job.chunks.size) {
                    val delay = pacedDelayMs(job, written)
                    if (delay > 0) {
                        sharedMainHandler.postDelayed(chunkDelayRunnable, delay)
                    } else {
                        writeNextChunk()
                    }
                } else {
                    writeNextChunk()
                }
            } else {
                sharedMainHandler.removeCallbacks(chunkDelayRunnable)
                activeJob = null
                job.result.error("WRITE_FAILED", "BLE write failed with status $status", null)
                pumpJobs()
            }
        }
    }

    private val bluetoothAdapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    private val scanner: BluetoothLeScanner?
        get() = bluetoothAdapter?.bluetoothLeScanner

    private val mainHandler = Handler(Looper.getMainLooper())

    // Scan state (per engine instance)
    private var scanEventSink: EventChannel.EventSink? = null
    private val discoveredDevices = mutableListOf<Map<String, String>>()
    private var scanCallback: ScanCallback? = null
    private var scanTimeoutRunnable: Runnable? = null

    var connectionStateCallback: ((String) -> Unit)? = null

    init {
        instances.add(this)
    }

    val scanStreamHandler = object : EventChannel.StreamHandler {
        override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
            scanEventSink = events
        }

        override fun onCancel(arguments: Any?) {
            scanEventSink = null
        }
    }

    fun getBondedBleDevices(result: MethodChannel.Result) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            result.success(emptyList<Map<String, String>>())
            return
        }

        try {
            val bonded = adapter.bondedDevices?.filter { device ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                    device.type == BluetoothDevice.DEVICE_TYPE_LE ||
                            device.type == BluetoothDevice.DEVICE_TYPE_DUAL
                } else {
                    true // Include all if we can't check type
                }
            }?.map { device ->
                mapOf(
                    "deviceId" to device.address,
                    "name" to (device.name ?: device.address)
                )
            } ?: emptyList()
            result.success(bonded)
        } catch (e: SecurityException) {
            result.error("PERMISSION_DENIED", "Cannot access bonded devices", e.message)
        }
    }

    fun startScan(timeoutMs: Long, result: MethodChannel.Result) {
        val s = scanner
        if (s == null) {
            result.error("UNAVAILABLE", "Bluetooth LE scanner not available", null)
            return
        }

        discoveredDevices.clear()

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, scanResult: ScanResult) {
                val device = scanResult.device
                val id = device.address
                if (discoveredDevices.none { it["deviceId"] == id }) {
                    val name = try { device.name } catch (_: SecurityException) { null }

                    discoveredDevices.add(
                        mapOf(
                            "deviceId" to id,
                            "name" to (name ?: id)
                        )
                    )

                    mainHandler.post {
                        scanEventSink?.success(discoveredDevices.toList())
                    }
                }
            }

            override fun onScanFailed(errorCode: Int) {
                mainHandler.post {
                    scanEventSink?.error("SCAN_FAILED", "BLE scan failed with code $errorCode", null)
                }
            }
        }

        try {
            s.startScan(scanCallback)
        } catch (e: SecurityException) {
            result.error("PERMISSION_DENIED", "Bluetooth scan permission denied", e.message)
            return
        }

        // Auto-stop after timeout
        scanTimeoutRunnable = Runnable {
            stopScanInternal()
        }

        mainHandler.postDelayed(scanTimeoutRunnable!!, timeoutMs)

        result.success(null)
    }

    fun stopScan(result: MethodChannel.Result) {
        stopScanInternal()
        result.success(null)
    }

    private fun stopScanInternal() {
        scanTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        scanTimeoutRunnable = null
        scanCallback?.let { cb ->
            try {
                scanner?.stopScan(cb)
            } catch (_: SecurityException) {
                // Already lost permission — ignore
            }
        }
        scanCallback = null
    }

    fun connect(
        deviceId: String,
        timeoutMs: Long,
        serviceUuid: String?,
        characteristicUuid: String?,
        result: MethodChannel.Result
    ) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            result.error("UNAVAILABLE", "Bluetooth adapter not available", null)
            return
        }

        // Reuse the live connection when another isolate (or this one)
        // already connected to the same printer.
        if (connectedDeviceId == deviceId && gatt != null) {
            leaseHolders.add(this)
            connectionStateCallback?.invoke("connected")
            result.success(null)
            return
        }

        // Join an in-progress attempt to the same device.
        if (connectingDeviceId != null) {
            if (connectingDeviceId == deviceId) {
                pendingConnects.add(this to result)
            } else {
                result.error(
                    "PRINTER_BUSY",
                    "Another BLE connection attempt is in progress",
                    null
                )
            }
            return
        }

        // Connected to a different printer: only tear it down when no other
        // isolate still holds it.
        if (gatt != null) {
            if (leaseHolders.any { it !== this }) {
                result.error(
                    "PRINTER_BUSY",
                    "Another print job is using the BLE connection",
                    null
                )
                return
            }
            cleanupConnection()
        }

        val targetService = serviceUuid?.let { UUID.fromString(it) } ?: ESC_POS_SERVICE_UUID
        val targetChar = characteristicUuid?.let { UUID.fromString(it) } ?: ESC_POS_TX_CHAR_UUID

        val device: BluetoothDevice
        try {
            device = adapter.getRemoteDevice(deviceId)
        } catch (e: Exception) {
            result.error("INVALID_DEVICE", "Invalid device ID: $deviceId", e.message)
            return
        }

        connectingDeviceId = deviceId
        pendingConnects.add(this to result)

        var attemptGatt: BluetoothGatt? = null

        val timeoutRunnable = Runnable {
            if (connectingDeviceId == deviceId) {
                failPendingConnects("TIMEOUT", "BLE connection timed out")
                try {
                    attemptGatt?.disconnect()
                    attemptGatt?.close()
                } catch (_: SecurityException) {
                    // Ignore — we're disconnecting anyway
                }
            }
        }
        sharedMainHandler.postDelayed(timeoutRunnable, timeoutMs)

        val gattCallback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    try {
                        g.requestMtu(512)
                    } catch (e: SecurityException) {
                        sharedMainHandler.post {
                            sharedMainHandler.removeCallbacks(timeoutRunnable)
                            failPendingConnects("PERMISSION_DENIED", "MTU request denied")
                        }
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    sharedMainHandler.post {
                        sharedMainHandler.removeCallbacks(timeoutRunnable)

                        if (connectingDeviceId == deviceId && pendingConnects.isNotEmpty()) {
                            failPendingConnects("DISCONNECTED", "BLE device disconnected during setup")
                            try { g.close() } catch (_: SecurityException) {}
                        } else if (gatt === g) {
                            // Remote disconnection after fully connected.
                            cleanupConnection()
                            broadcastState("disconnected")
                        } else {
                            try { g.close() } catch (_: SecurityException) {}
                        }
                    }
                }
            }

            override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
                sharedMainHandler.post {
                    negotiatedMtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu - 3 else 20
                }
                try {
                    g.discoverServices()
                } catch (e: SecurityException) {
                    sharedMainHandler.post {
                        sharedMainHandler.removeCallbacks(timeoutRunnable)
                        failPendingConnects("PERMISSION_DENIED", "Service discovery denied")
                    }
                }
            }

            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    sharedMainHandler.post {
                        sharedMainHandler.removeCallbacks(timeoutRunnable)
                        failPendingConnects(
                            "SERVICE_DISCOVERY_FAILED",
                            "GATT service discovery failed with status $status"
                        )
                        try { g.disconnect(); g.close() } catch (_: SecurityException) {}
                    }
                    return
                }

                var foundChar: BluetoothGattCharacteristic? = null

                // 1. Try target service/characteristic UUIDs
                val service = g.getService(targetService)
                if (service != null) {
                    val c = service.getCharacteristic(targetChar)
                    if (c != null && isWritable(c)) {
                        foundChar = c
                    }
                }

                // 2. Fallback: any writable characteristic
                if (foundChar == null) {
                    for (svc in g.services) {
                        for (c in svc.characteristics) {
                            if (isWritable(c)) {
                                foundChar = c
                                break
                            }
                        }
                        if (foundChar != null) break
                    }
                }

                sharedMainHandler.post {
                    sharedMainHandler.removeCallbacks(timeoutRunnable)
                    if (foundChar == null) {
                        failPendingConnects("NO_CHARACTERISTIC", "No writable characteristic found")
                        try { g.disconnect(); g.close() } catch (_: SecurityException) {}
                        return@post
                    }

                    gatt = g
                    connectedDeviceId = deviceId
                    txCharacteristic = foundChar
                    // Prefer write-with-response for reliable backpressure; the printer
                    // ACKs each chunk before we send the next, preventing buffer overflow.
                    // Fall back to write-without-response only if that is the sole option.
                    writeWithoutResponse =
                        (foundChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE) == 0 &&
                        (foundChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0

                    for ((manager, res) in pendingConnects) {
                        leaseHolders.add(manager)
                        res.success(null)
                        manager.connectionStateCallback?.invoke("connected")
                    }
                    pendingConnects.clear()
                    connectingDeviceId = null
                }
            }

            override fun onCharacteristicWrite(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                sharedMainHandler.post { Companion.onChunkAck(status) }
            }
        }

        // Check if device is bonded — use autoConnect=true for bonded devices
        // as they may not be advertising, but the system can connect when they
        // become available.
        val isBonded = try {
            device.bondState == BluetoothDevice.BOND_BONDED
        } catch (_: SecurityException) {
            false
        }

        try {
            attemptGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                device.connectGatt(context, isBonded, gattCallback, BluetoothDevice.TRANSPORT_LE)
            } else {
                device.connectGatt(context, isBonded, gattCallback)
            }
        } catch (e: SecurityException) {
            sharedMainHandler.removeCallbacks(timeoutRunnable)
            failPendingConnects("PERMISSION_DENIED", "Bluetooth connect permission denied")
        }
    }

    fun getMtu(result: MethodChannel.Result) {
        result.success(negotiatedMtu)
    }

    fun supportsWriteWithoutResponse(result: MethodChannel.Result) {
        result.success(writeWithoutResponse)
    }

    fun write(
        data: ByteArray,
        withoutResponse: Boolean,
        maxChunkSize: Int,
        chunkDelayMs: Int,
        bytesPerSecond: Int,
        result: MethodChannel.Result
    ) {
        if (gatt == null || txCharacteristic == null) {
            result.error("NOT_CONNECTED", "BLE device not connected", null)
            return
        }

        val mtu = if (negotiatedMtu > 0) negotiatedMtu else 20
        val chunkSize = if (maxChunkSize > 0) minOf(mtu, maxChunkSize) else mtu
        val chunks = mutableListOf<ByteArray>()
        var offset = 0
        while (offset < data.size) {
            val end = minOf(offset + chunkSize, data.size)
            chunks.add(data.copyOfRange(offset, end))
            offset = end
        }

        if (chunks.isEmpty()) {
            result.success(null)
            return
        }

        jobQueue.add(
            WriteJob(
                chunks,
                withoutResponse,
                chunkDelayMs.coerceAtLeast(0),
                bytesPerSecond.coerceAtLeast(0),
                result
            )
        )
        pumpJobs()
    }

    fun disconnect(result: MethodChannel.Result) {
        releaseLease()
        connectionStateCallback?.invoke("disconnected")
        result.success(null)
    }

    fun dispose() {
        stopScanInternal()
        instances.remove(this)
        releaseLease()
    }

    // Main thread only. Closes the GATT only when the last isolate holding
    // the connection releases it.
    private fun releaseLease() {
        leaseHolders.remove(this)
        if (leaseHolders.isEmpty() && connectingDeviceId == null) {
            cleanupConnection()
        }
    }

    private fun isWritable(c: BluetoothGattCharacteristic): Boolean {
        val props = c.properties
        return (props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
                (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
    }
}
