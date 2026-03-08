# Add project specific ProGuard rules here.

# Keep Capacitor classes (required for WebView bridge)
-keep class com.getcapacitor.** { *; }
-keep class com.geopoint.manholemapper.** { *; }

# Keep JavaScript interface classes for WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor plugin classes
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }

# Keep Bluetooth Serial plugin
-keep class com.nicandtom.capacitor.bluetoothserial.** { *; }

# Preserve line numbers for debugging stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
