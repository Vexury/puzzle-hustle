import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Info.plist names Main.storyboard for this scene, so UIKit has already built the window
        // around its MainViewController, which registers the app's own plugins. Replacing it with
        // a plain bridge would leave StatusBarStylePlugin unregistered.
        if window == nil {
            window = UIWindow(windowScene: windowScene)
            window?.rootViewController = MainViewController()
            window?.makeKeyAndVisible()
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // Control Center, Notification Center and call banners make the scene inactive without hiding
    // the page, so the web side never hears about them and a puzzle clock keeps running. Same
    // events as MainActivity.onWindowFocusChanged on Android.
    func sceneWillResignActive(_ scene: UIScene) {
        bridge?.triggerWindowJSEvent(eventName: "appBlur")
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        bridge?.triggerWindowJSEvent(eventName: "appFocus")
    }

    private var bridge: CAPBridgeProtocol? {
        (window?.rootViewController as? CAPBridgeViewController)?.bridge
    }
}
