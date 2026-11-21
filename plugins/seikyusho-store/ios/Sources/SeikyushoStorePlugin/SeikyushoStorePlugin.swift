import Foundation
import Capacitor
import StoreKit

/// 請求書ラクラクの買い切り（1 商品固定）。StoreKit 2 の Product / Transaction だけを使い、サーバーは無い。
/// JS からは 4 つ：status（持っているか）・loadOffer（価格の表示文）・buy（購入画面）・recover（別の端末での購入を引き当てる）
@objc(SeikyushoStorePlugin)
public class SeikyushoStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SeikyushoStorePlugin"
    public let jsName = "SeikyushoStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadOffer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "buy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recover", returnType: CAPPluginReturnPromise)
    ]

    /// 商品は 1 つだけ（無制限・印影・テンプレ）。App Store Connect の製品 ID
    private static let offerId = "com.company256.seikyusho.pro"
    private var watcher: Task<Void, Never>?
    private var cachedOffer: Product?

    public override func load() {
        // 承認待ち（Ask to Buy など）がアプリの外で確定したときに受け取り、finish して JS に知らせる
        watcher = Task.detached { [weak self] in
            for await outcome in Transaction.updates {
                guard case .verified(let tx) = outcome else { continue }
                await tx.finish()
                self?.notifyListeners("offerUnlocked", data: ["offer": tx.productID])
            }
        }
    }

    deinit { watcher?.cancel() }

    // ---- 内部

    private func fetchOffer() async throws -> Product? {
        if let p = cachedOffer { return p }
        let p = try await Product.products(for: [Self.offerId]).first
        cachedOffer = p
        return p
    }

    private func entitled() async -> Bool {
        for await outcome in Transaction.currentEntitlements {
            guard case .verified(let tx) = outcome else { continue }
            if tx.productID == Self.offerId && tx.revocationDate == nil { return true }
        }
        return false
    }

    private func reply(_ call: CAPPluginCall, unlocked: Bool) {
        call.resolve(["unlocked": unlocked, "offer": Self.offerId])
    }

    // ---- JS から

    /// 持っているか（起動時）。Apple の currentEntitlements を見る
    @objc func status(_ call: CAPPluginCall) {
        Task { reply(call, unlocked: await entitled()) }
    }

    /// 価格の表示文（例「¥2,500」）。App Store から取れないときはエラーにせず price 無しで返す（画面は「購入する」とだけ出す）
    @objc func loadOffer(_ call: CAPPluginCall) {
        Task {
            var out: [String: Any] = ["offer": Self.offerId]
            if let p = try? await fetchOffer() {
                out["price"] = p.displayPrice
                out["title"] = p.displayName
            }
            call.resolve(out)
        }
    }

    /// 購入画面を出す。結果は done / waiting（承認待ち）/ cancelled
    @objc func buy(_ call: CAPPluginCall) {
        Task {
            do {
                guard let p = try await fetchOffer() else {
                    call.reject("商品を読み込めませんでした")
                    return
                }
                switch try await p.purchase() {
                case .success(let outcome):
                    guard case .verified(let tx) = outcome else {
                        call.reject("購入を確認できませんでした")
                        return
                    }
                    await tx.finish()
                    call.resolve(["result": "done"])
                case .pending:
                    call.resolve(["result": "waiting"])
                case .userCancelled:
                    call.resolve(["result": "cancelled"])
                @unknown default:
                    call.resolve(["result": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// 別の端末・再インストール後：App Store と同期してから持っているかを見る
    @objc func recover(_ call: CAPPluginCall) {
        Task {
            try? await AppStore.sync()
            reply(call, unlocked: await entitled())
        }
    }
}
