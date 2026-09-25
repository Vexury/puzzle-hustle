import Capacitor
import UIKit

// The iOS half of the Android StatusBarStylePlugin: the only thing the app asks of the status bar
// is whether its icons are light or dark, and Capacitor's bridge already carries that.
@objc(StatusBarStylePlugin)
public class StatusBarStylePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StatusBarStylePlugin"
    public let jsName = "StatusBarStyle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise)
    ]

    // DARK means a dark theme, so light icons, as in Capacitor's own status bar plugin.
    @objc func setStyle(_ call: CAPPluginCall) {
        bridge?.statusBarStyle = call.getString("style") == "DARK" ? .lightContent : .darkContent
        call.resolve()
    }
}

// Plugins that live in the app target are not discovered automatically, so the storyboard
// points at this subclass and it registers them.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StatusBarStylePlugin())
    }
}
