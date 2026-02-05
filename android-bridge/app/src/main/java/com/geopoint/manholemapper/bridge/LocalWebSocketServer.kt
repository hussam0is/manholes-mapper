package com.geopoint.manholemapper.bridge

import android.util.Log
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.net.InetSocketAddress

class LocalWebSocketServer(port: Int) : WebSocketServer(InetSocketAddress(port)) {
    private val TAG = "LocalWebSocketServer"
    
    interface ServerListener {
        fun onClientCountChanged(count: Int)
    }
    
    var listener: ServerListener? = null

    override fun onOpen(conn: WebSocket?, handshake: ClientHandshake?) {
        Log.d(TAG, "New connection: ${conn?.remoteSocketAddress}")
        listener?.onClientCountChanged(connections.size)
    }

    override fun onClose(conn: WebSocket?, code: Int, reason: String?, remote: Boolean) {
        Log.d(TAG, "Connection closed: ${conn?.remoteSocketAddress}")
        listener?.onClientCountChanged(connections.size)
    }

    override fun onMessage(conn: WebSocket?, message: String?) {
        // We mostly broadcast, but could handle incoming commands if needed
    }

    override fun onError(conn: WebSocket?, ex: Exception?) {
        Log.e(TAG, "Error on connection ${conn?.remoteSocketAddress}", ex)
    }

    override fun onStart() {
        Log.i(TAG, "WebSocket server started on port $port")
    }

    fun broadcastNmea(line: String) {
        if (connections.isEmpty()) return
        
        val json = JSONObject()
        json.put("type", "nmea")
        json.put("line", line)
        json.put("ts", System.currentTimeMillis())
        
        broadcast(json.toString())
    }

    fun broadcastStatus(btStatus: String, deviceName: String?) {
        val json = JSONObject()
        json.put("type", "status")
        json.put("bt", btStatus)
        json.put("clients", connections.size)
        json.put("device", deviceName ?: "None")
        
        broadcast(json.toString())
    }
}
