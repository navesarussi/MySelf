import Foundation
import WidgetKit
import React

@objc(WidgetSnapshotBridge)
class WidgetSnapshotBridge: NSObject {
  static let appGroupId = "group.com.navesarussi.myself"
  static let fileName = "widget-snapshot.json"

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func writeSnapshot(_ json: String, resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId) else {
      rejecter("no_app_group", "App Group container missing", nil)
      return
    }
    let url = dir.appendingPathComponent(Self.fileName)
    do {
      try json.data(using: .utf8)?.write(to: url, options: .atomic)
      resolver(nil)
    } catch {
      rejecter("write_failed", error.localizedDescription, error)
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
