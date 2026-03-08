package com.geopoint.manholemapper;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Only enable WebView debugging in debug builds (significant perf overhead)
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Enable hardware acceleration for the WebView
        android.webkit.WebView webView = getBridge().getWebView();
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

        // Optimize WebView rendering
        android.webkit.WebSettings settings = webView.getSettings();
        settings.setRenderPriority(android.webkit.WebSettings.RenderPriority.HIGH);
        settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
    }
}
