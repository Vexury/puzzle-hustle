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
        registerPlugin(StatusBarStylePlugin.class);
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        long start = System.currentTimeMillis();
        splash.setKeepOnScreenCondition(() -> System.currentTimeMillis() - start < SPLASH_MS);
        super.onCreate(savedInstanceState);
        // A web view refuses to render text below 8 px by default, which is meant for pages
        // nobody controls. Here it silently inflated the pencil marks and cage sums of a Killer
        // cell, pushing them over the cage outline on a phone while a desktop browser drew the
        // same board correctly. The board sizes its own text against the board width.
        getBridge().getWebView().getSettings().setMinimumFontSize(1);
        getBridge().getWebView().getSettings().setMinimumLogicalFontSize(1);
    }

    // The notification shade and other system overlays neither stop the activity nor change the
    // page's visibility, so the web side never hears about them and the clock in a puzzle keeps
    // running behind them. Window focus is the one signal that covers those cases.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent(hasFocus ? "appFocus" : "appBlur");
        }
    }
}
