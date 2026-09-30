package dev.vexury.puzzlehustle;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The web app calls ready() once its first frame is on screen; MainActivity keeps the splash
// until then.
@CapacitorPlugin(name = "Launch")
public class LaunchPlugin extends Plugin {

    private static volatile boolean ready = false;

    static boolean isReady() {
        return ready;
    }

    // A new activity in a running process loads the web view again, so it waits for a new call.
    static void reset() {
        ready = false;
    }

    @PluginMethod
    public void ready(PluginCall call) {
        ready = true;
        call.resolve();
    }
}
