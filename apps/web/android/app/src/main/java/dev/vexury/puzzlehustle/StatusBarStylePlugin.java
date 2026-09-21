package dev.vexury.puzzlehustle;

import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Replaces @capacitor/status-bar, of which the app used nothing but the icon colour. The plugin
// also carried Window.getStatusBarColor and setStatusBarColor, which Android 15 dropped and the
// Play Console flags, although an app targeting 36 never reaches those branches.
@CapacitorPlugin(name = "StatusBarStyle")
public class StatusBarStylePlugin extends Plugin {

    @PluginMethod
    public void setStyle(PluginCall call) {
        boolean dark = "DARK".equals(call.getString("style"));
        getActivity()
            .runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(!dark);
            });
        call.resolve();
    }
}
