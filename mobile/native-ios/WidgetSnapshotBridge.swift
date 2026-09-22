import Foundation
import WidgetKit
import React

@objc(WidgetSnapshotBridge)
class WidgetSnapshotBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func writeSnapshot(_ json: String, resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    // Shared Keychain (same access group as session token) — works without App Groups
    // provisioning, which ASC API cannot fully configure for local signing.
    let ok = FinanceIngestKeychain.set(json, forKey: FinanceIngestKeychain.widgetSnapshotKey)
    if ok {
      resolver(nil)
    } else {
      rejecter("write_failed", "Failed to write widget snapshot to Keychain", nil)
    }
  }

  @objc func reloadTimelines(_ resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
      WidgetCenter.shared.reloadAllTimelines()
    }
    resolver(nil)
  }
}
