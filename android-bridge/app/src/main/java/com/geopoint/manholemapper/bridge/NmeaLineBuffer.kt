package com.geopoint.manholemapper.bridge

import java.util.*

/**
 * A buffer that collects raw bytes and splits them into valid NMEA sentences.
 * Handles CRLF, LF, or CR line endings.
 */
class NmeaLineBuffer {
    private var buffer = StringBuilder()

    /**
     * Appends a chunk of data and returns a list of complete NMEA sentences found.
     */
    fun onDataReceived(data: String): List<String> {
        buffer.append(data)
        val sentences = mutableListOf<String>()
        
        while (true) {
            val lineEndIndex = buffer.indexOf("\n")
            if (lineEndIndex == -1) break
            
            val line = buffer.substring(0, lineEndIndex + 1).trim()
            if (line.isNotEmpty()) {
                sentences.add(line)
            }
            buffer.delete(0, lineEndIndex + 1)
        }
        
        // Safety: don't let buffer grow infinitely if no newlines are found
        if (buffer.length > 4096) {
            buffer.setLength(0)
        }
        
        return sentences
    }

    fun clear() {
        buffer.setLength(0)
    }
}
