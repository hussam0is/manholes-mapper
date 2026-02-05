package com.geopoint.manholemapper.bridge

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.geopoint.manholemapper.bridge.databinding.ActivityMainBinding
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var bridgeService: BridgeService? = null
    private var isBound = false
    
    private val bluetoothManager by lazy { getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager }
    private val bluetoothAdapter by lazy { bluetoothManager.adapter }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) {
            loadBondedDevices()
        } else {
            Toast.makeText(this, "Permissions required", Toast.LENGTH_SHORT).show()
        }
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as BridgeService.LocalBinder
            bridgeService = binder.getService()
            isBound = true
            observeService()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            bridgeService = null
            isBound = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        checkPermissions()
        startAndBindService()

        binding.btnConnect.setOnClickListener {
            val selectedDevice = binding.spinnerDevices.selectedItem as? DeviceItem
            selectedDevice?.let {
                bridgeService?.connectToDevice(it.device)
            }
        }

        binding.btnDisconnect.setOnClickListener {
            bridgeService?.disconnect()
        }

        binding.cbSimulation.setOnCheckedChangeListener { _, isChecked ->
            bridgeService?.setSimulationMode(isChecked)
        }
    }

    private fun checkPermissions() {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            permissions.add(Manifest.permission.BLUETOOTH_SCAN)
        } else {
            permissions.add(Manifest.permission.BLUETOOTH)
            permissions.add(Manifest.permission.BLUETOOTH_ADMIN)
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        } else {
            loadBondedDevices()
        }
    }

    @SuppressLint("MissingPermission")
    private fun loadBondedDevices() {
        val bonded = bluetoothAdapter?.bondedDevices ?: emptySet()
        val items = bonded.map { DeviceItem(it) }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, items)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spinnerDevices.adapter = adapter
    }

    private fun startAndBindService() {
        val intent = Intent(this, BridgeService::class.java)
        startService(intent)
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    private fun observeService() {
        lifecycleScope.launch {
            bridgeService?.btStatus?.collectLatest { status ->
                binding.tvBtStatus.text = "BT Status: $status"
                if (status == "connected") {
                    binding.btnConnect.visibility = View.GONE
                    binding.btnDisconnect.visibility = View.VISIBLE
                } else {
                    binding.btnConnect.visibility = View.VISIBLE
                    binding.btnDisconnect.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            bridgeService?.clientCount?.collectLatest { count ->
                binding.tvWsStatus.text = "WS Clients: $count"
            }
        }

        lifecycleScope.launch {
            bridgeService?.latestNmea?.collectLatest { nmea ->
                binding.tvNmea.text = nmea
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isBound) {
            unbindService(serviceConnection)
            isBound = false
        }
    }

    data class DeviceItem(val device: BluetoothDevice) {
        @SuppressLint("MissingPermission")
        override fun toString(): String = "${device.name ?: "Unknown"} (${device.address})"
    }
}
