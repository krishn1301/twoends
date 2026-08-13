package com.twoends.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super, which is when Capacitor builds the bridge and
        // fixes the plugin list. Registering after is silently ignored.
        registerPlugin(WidgetsPlugin.class);
        registerPlugin(ExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
