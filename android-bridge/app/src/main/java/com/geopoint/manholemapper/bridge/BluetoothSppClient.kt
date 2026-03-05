package com.geopoint.manholemapper.bridge

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import java.io.IOException
import java.io.InputStream
import java.util.*

class BluetoothSppClient(private val bluetoothAdapter: BluetoothAdapter?) {
    private val TAG = "BluetoothSppClient"
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    
    private var socket: BluetoothSocket? = null
    private var inputStream: InputStream? = null
    private var job: Job? = null
    
    private val _nmeaFlow = MutableSharedFlow<String>()
    val nmeaFlow: SharedFlow<String> = _nmeaFlow
    
    private val _statusFlow = MutableSharedFlow<String>()
    val statusFlow: SharedFlow<String> = _statusFlow

    private var isConnecting = false
    private var currentDevice: BluetoothDevice? = null

    @SuppressLint("MissingPermission")
    fun connect(device: BluetoothDevice) {
        if (isConnecting || socket?.isConnected == true) return
        
        currentDevice = device
        isConnecting = true
        
        job = CoroutineScope(Dispatchers.IO).launch {
            try {
                _statusFlow.emit("connecting")
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                bluetoothAdapter?.cancelDiscovery()
                socket?.connect()
                inputStream = socket?.inputStream
                _statusFlow.emit("connected")
                
                readLoop()
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed", e)
                _statusFlow.emit("disconnected")
                reconnect()
            } finally {
                isConnecting = false
            }
        }
    }

    private suspend fun readLoop() {
        val buffer = ByteArray(1024)
        val lineBuffer = NmeaLineBuffer()
        
        while (coroutineContext.isActive) {
            try {
                val bytes = inputStream?.read(buffer) ?: -1
                if (bytes == -1) break
                
                val data = String(buffer, 0, bytes)
                val sentences = lineBuffer.onDataReceived(data)
                sentences.forEach { 
                    _nmeaFlow.emit(it)
                }
            } catch (e: IOException) {
                Log.e(TAG, "Read error", e)
                break
            }
        }
        
        _statusFlow.emit("disconnected")
        reconnect()
    }

    private fun reconnect() {
        val device = currentDevice ?: return
        CoroutineScope(Dispatchers.IO).launch {
            delay(5000) // 5s backoff
            Log.d(TAG, "Attempting reconnect...")
            connect(device)
        }
    }

    fun disconnect() {
        job?.cancel()
        try {
            socket?.close()
        } catch (e: IOException) {
            Log.e(TAG, "Close error", e)
        }
        socket = null
        inputStream = null
        isConnecting = false
    }
}
