package dev.vexury.puzzlehustle;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The system splash disappears with the first frame, so the app looks like it never
    // started. Hold the logo briefly instead; the web view keeps loading behind it.
    private static final long SPLASH_MS = 800;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        long start = System.currentTimeMillis();
        splash.setKeepOnScreenCondition(() -> System.currentTimeMillis() - start < SPLASH_MS);
        super.onCreate(savedInstanceState);
    }
}
