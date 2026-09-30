package dev.vexury.puzzlehustle;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The splash stays until the web app has painted its first frame (LaunchPlugin.ready), where
    // the same piece waits in the same place, so the handover shows no blank web view. The cap
    // keeps a web side that never reports from holding the splash for good.
    private static final long SPLASH_MAX_MS = 2000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StatusBarStylePlugin.class);
        registerPlugin(LaunchPlugin.class);
        LaunchPlugin.reset();
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        long start = System.currentTimeMillis();
        splash.setKeepOnScreenCondition(() -> !LaunchPlugin.isReady() && System.currentTimeMillis() - start < SPLASH_MAX_MS);
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
