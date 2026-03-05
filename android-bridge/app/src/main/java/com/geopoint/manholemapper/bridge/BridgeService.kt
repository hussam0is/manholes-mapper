package com.geopoint.manholemapper.bridge

import android.app.*
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class BridgeService : Service() {
    private val TAG = "BridgeService"
    private val NOTIFICATION_ID = 1
    private val CHANNEL_ID = "bridge_service_channel"

    private lateinit var bluetoothAdapter: BluetoothAdapter
    private lateinit var btClient: BluetoothSppClient
    private lateinit var wsServer: LocalWebSocketServer
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    private val _btStatus = MutableStateFlow("disconnected")
    val btStatus: StateFlow<String> = _btStatus
    
    private val _clientCount = MutableStateFlow(0)
    val clientCount: StateFlow<Int> = _clientCount
    
    private val _latestNmea = MutableStateFlow("")
    val latestNmea: StateFlow<String> = _latestNmea

    private val _simulationMode = MutableStateFlow(false)
    val simulationMode: StateFlow<Boolean> = _simulationMode

    private var selectedDevice: BluetoothDevice? = null
    private var simulationJob: Job? = null

    inner class LocalBinder : Binder() {
        fun getService(): BridgeService = this@BridgeService
    }

    private val binder = LocalBinder()

    override fun onCreate() {
        super.onCreate()
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        btClient = BluetoothSppClient(bluetoothAdapter)
        wsServer = LocalWebSocketServer(8787)
        wsServer.listener = object : LocalWebSocketServer.ServerListener {
            override fun onClientCountChanged(count: Int) {
                _clientCount.value = count
                wsServer.broadcastStatus(_btStatus.value, selectedDevice?.name)
            }
        }
        wsServer.start()

        observeBt()
    }

    private fun observeBt() {
        serviceScope.launch {
            btClient.statusFlow.collect { status ->
                _btStatus.value = status
                wsServer.broadcastStatus(status, selectedDevice?.name)
                updateNotification()
            }
        }
        
        serviceScope.launch {
            btClient.nmeaFlow.collect { line ->
                _latestNmea.value = line
                wsServer.broadcastNmea(line)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        return START_STICKY
    }

    fun connectToDevice(device: BluetoothDevice) {
        selectedDevice = device
        btClient.connect(device)
    }

    fun disconnect() {
        btClient.disconnect()
        selectedDevice = null
    }

    fun setSimulationMode(enabled: Boolean) {
        _simulationMode.value = enabled
        if (enabled) {
            startSimulation()
        } else {
            simulationJob?.cancel()
        }
    }

    private fun startSimulation() {
        simulationJob?.cancel()
        simulationJob = serviceScope.launch {
            while (isActive) {
                val lat = 32.0 + Math.random() * 0.1
                val lon = 34.0 + Math.random() * 0.1
                val gga = "$""GPGGA,123519,${String.format("%.4f", lat)},N,${String.format("%.4f", lon)},E,1,08,0.9,545.4,M,47.0,M,,*47"
                _latestNmea.value = gga
                wsServer.broadcastNmea(gga)
                delay(1000)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        btClient.disconnect()
        wsServer.stop()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "GNSS Bridge Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(): Notification {
        val statusText = "BT: ${_btStatus.value} | Clients: ${_clientCount.value}"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GNSS Bridge Running")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .build()
    }

    private fun updateNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, createNotification())
    }
}
