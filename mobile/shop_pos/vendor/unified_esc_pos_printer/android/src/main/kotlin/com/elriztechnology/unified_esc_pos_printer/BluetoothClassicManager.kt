package com.elriztechnology.unified_esc_pos_printer

import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

class BluetoothClassicManager(private val context: Context) {

    companion object {
        // Standard SPP (Serial Port Profile) UUID
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb")

        // The physical printer link is shared process-wide. Background isolates
        // (e.g. notification handlers) attach their own plugin instance, so the
        // connection must not be owned by a single engine (issue #21).
        //
        // All connection state below is confined to the single-threaded [ops]
        // executor: connects, writes, and disconnects run on it in FIFO order,
        // which makes each write call an atomic print job.
        private val ops = Executors.newSingleThreadExecutor { r ->
            Thread(r, "unified-esc-pos-bt-classic").apply { isDaemon = true }
        }
        private val sharedMainHandler = Handler(Looper.getMainLooper())

        private var socket: BluetoothSocket? = null
        private var outputStream: OutputStream? = null
        private var inputThread: Thread? = null
        private var connectedAddress: String? = null

        // Instances (one per Flutter engine) currently holding the connection.
        // The socket closes only when the last lease is released.
        private val leaseHolders = mutableSetOf<BluetoothClassicManager>()

        private val instances = CopyOnWriteArrayList<BluetoothClassicManager>()

        // Runs on the ops thread.
        private fun closeConnection() {
            inputThread?.interrupt()
            inputThread = null
            try { outputStream?.close() } catch (_: IOException) {}
            outputStream = null
            try { socket?.close() } catch (_: IOException) {}
            socket = null
            connectedAddress = null
        }

        private fun broadcastState(state: String) {
            sharedMainHandler.post {
                for (instance in instances) {
                    instance.connectionStateCallback?.invoke(state)
                }
            }
        }
    }

    private val bluetoothAdapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private val mainHandler = Handler(Looper.getMainLooper())

    private var activity: Activity? = null

    // Scan state (per engine instance)
    private var scanEventSink: EventChannel.EventSink? = null
    private val discoveredDevices = mutableListOf<Map<String, String>>()
    private var discoveryReceiver: BroadcastReceiver? = null
    private var discoveryTimeoutRunnable: Runnable? = null

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

    fun setActivity(activity: Activity?) {
        this.activity = activity
    }

    fun getBondedDevices(result: MethodChannel.Result) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            result.success(emptyList<Map<String, String>>())
            return
        }

        try {
            val bonded = adapter.bondedDevices?.map { device ->
                mapOf(
                    "name" to (device.name ?: device.address),
                    "address" to device.address
                )
            } ?: emptyList()
            result.success(bonded)
        } catch (e: SecurityException) {
            result.error("PERMISSION_DENIED", "Cannot access bonded devices", e.message)
        }
    }

    fun startDiscovery(timeoutMs: Long, result: MethodChannel.Result) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            result.error("UNAVAILABLE", "Bluetooth adapter not available", null)
            return
        }

        discoveredDevices.clear()
        stopDiscoveryInternal()

        discoveryReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device: BluetoothDevice? =
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        device?.let {
                            val address = it.address
                            if (discoveredDevices.none { d -> d["address"] == address }) {
                                val name = try { it.name } catch (_: SecurityException) { null }

                                discoveredDevices.add(
                                    mapOf(
                                        "name" to (name ?: address),
                                        "address" to address
                                    )
                                )

                                mainHandler.post {
                                    scanEventSink?.success(discoveredDevices.toList())
                                }
                            }
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        stopDiscoveryInternal()
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }

        context.registerReceiver(discoveryReceiver, filter)

        try {
            adapter.startDiscovery()
        } catch (e: SecurityException) {
            stopDiscoveryInternal()
            result.error("PERMISSION_DENIED", "Bluetooth discovery permission denied", e.message)
            return
        }

        // Auto-stop after timeout
        discoveryTimeoutRunnable = Runnable { stopDiscoveryInternal() }
        mainHandler.postDelayed(discoveryTimeoutRunnable!!, timeoutMs)

        result.success(null)
    }

    fun stopDiscovery(result: MethodChannel.Result) {
        stopDiscoveryInternal()
        result.success(null)
    }

    private fun stopDiscoveryInternal() {
        discoveryTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        discoveryTimeoutRunnable = null

        discoveryReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
                // Not registered
            }
        }

        discoveryReceiver = null

        try {
            bluetoothAdapter?.cancelDiscovery()
        } catch (_: SecurityException) {}
    }

    fun connect(address: String, timeoutMs: Long, result: MethodChannel.Result) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            result.error("UNAVAILABLE", "Bluetooth adapter not available", null)
            return
        }

        val device: BluetoothDevice
        try {
            device = adapter.getRemoteDevice(address)
        } catch (e: Exception) {
            result.error("INVALID_ADDRESS", "Invalid Bluetooth address: $address", e.message)
            return
        }

        ops.execute {
            // Reuse the live connection when another isolate (or this one)
            // already connected to the same printer.
            if (connectedAddress == address && socket?.isConnected == true) {
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
            if (socket != null && othersHold) {
                mainHandler.post {
                    result.error(
                        "PRINTER_BUSY",
                        "Another print job is using the Bluetooth connection",
                        null
                    )
                }
                return@execute
            }

            closeConnection()
            leaseHolders.clear()

            try {
                // Cancel discovery before connecting (improves reliability)
                try { adapter.cancelDiscovery() } catch (_: SecurityException) {}

                // Try secure RFCOMM first, then insecure, then reflection fallback.
                // Pre-paired devices from OS settings often fail the secure SDP
                // lookup, so fallbacks are essential.
                val sock = try {
                    val s = device.createRfcommSocketToServiceRecord(SPP_UUID)
                    s.connect()
                    s
                } catch (_: IOException) {
                    try {
                        val s = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
                        s.connect()
                        s
                    } catch (_: IOException) {
                        // Last resort: reflection-based socket on port 1
                        val m = device.javaClass.getMethod(
                            "createRfcommSocket",
                            Int::class.javaPrimitiveType
                        )
                        val s = m.invoke(device, 1) as BluetoothSocket
                        s.connect()
                        s
                    }
                }

                socket = sock
                outputStream = sock.outputStream
                connectedAddress = address
                leaseHolders.add(this)

                startInputMonitor(sock)

                mainHandler.post {
                    connectionStateCallback?.invoke("connected")
                    result.success(null)
                }
            } catch (e: SecurityException) {
                mainHandler.post {
                    result.error("PERMISSION_DENIED", "Bluetooth connect permission denied", e.message)
                }
            } catch (e: Exception) {
                mainHandler.post {
                    result.error("CONNECTION_FAILED", "Bluetooth Classic connection failed", e.message)
                }
            }
        }
    }

    // Monitor for remote disconnection. Runs until the socket closes.
    private fun startInputMonitor(sock: BluetoothSocket) {
        val thread = Thread {
            try {
                val inputStream = sock.inputStream
                val buffer = ByteArray(1024)
                while (!Thread.currentThread().isInterrupted) {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead == -1) {
                        break
                    }
                }
            } catch (_: IOException) {
                // Connection lost
            }
            ops.execute {
                if (socket === sock) {
                    closeConnection()
                    leaseHolders.clear()
                    broadcastState("disconnected")
                }
            }
        }
        thread.isDaemon = true
        thread.start()
        inputThread = thread
    }

    fun write(data: ByteArray, chunkSize: Int, chunkDelayMs: Int, result: MethodChannel.Result) {
        ops.execute {
            val os = outputStream
            if (os == null) {
                mainHandler.post {
                    result.error("NOT_CONNECTED", "Bluetooth Classic not connected", null)
                }
                return@execute
            }

            try {
                // Pace the transfer: cheap printer modules forward data to
                // the print MCU over an internal UART without flow control,
                // and a large job at full RFCOMM speed overflows it.
                val step = if (chunkSize > 0) chunkSize else data.size.coerceAtLeast(1)
                var offset = 0
                while (offset < data.size) {
                    val len = minOf(step, data.size - offset)
                    os.write(data, offset, len)
                    os.flush()
                    offset += len
                    if (chunkDelayMs > 0 && offset < data.size) {
                        try {
                            Thread.sleep(chunkDelayMs.toLong())
                        } catch (_: InterruptedException) {
                            Thread.currentThread().interrupt()
                        }
                    }
                }
                mainHandler.post { result.success(null) }
            } catch (e: IOException) {
                mainHandler.post {
                    result.error("WRITE_FAILED", "Bluetooth Classic write failed", e.message)
                }
            }
        }
    }

    fun disconnect(result: MethodChannel.Result) {
        ops.execute {
            releaseLease()
            mainHandler.post {
                connectionStateCallback?.invoke("disconnected")
                result.success(null)
            }
        }
    }

    fun dispose() {
        stopDiscoveryInternal()
        instances.remove(this)
        ops.execute { releaseLease() }
    }

    // Runs on the ops thread. Closes the socket only when the last isolate
    // holding the connection releases it.
    private fun releaseLease() {
        leaseHolders.remove(this)
        if (leaseHolders.isEmpty()) {
            closeConnection()
        }
    }
}
