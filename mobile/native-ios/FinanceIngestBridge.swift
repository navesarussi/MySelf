import Foundation
import React

@objc(FinanceIngestBridge)
class FinanceIngestBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func setIngestToken(
    _ token: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let ok = FinanceIngestKeychain.set(token, forKey: FinanceIngestKeychain.ingestTokenKey)
    ok ? resolve(nil) : reject("keychain_error", "Failed to store ingest token", nil)
  }

  @objc func setSessionToken(
    _ token: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let ok = FinanceIngestKeychain.set(token, forKey: FinanceIngestKeychain.sessionTokenKey)
    ok ? resolve(nil) : reject("keychain_error", "Failed to store session token", nil)
  }

  @objc func hasAuthToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(FinanceIngestKeychain.resolveAuthToken() != nil)
  }
}
