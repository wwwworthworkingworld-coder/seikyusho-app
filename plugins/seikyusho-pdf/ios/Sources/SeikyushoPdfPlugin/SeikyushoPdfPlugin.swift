import Foundation
import Capacitor
import WebKit
import UIKit

/// 書類の HTML を A4（210×297mm＝595.2×841.8pt）の PDF にする。
/// 画面に出さない WKWebView に HTML を読み込み、UIPrintPageRenderer で紙のサイズに割り付ける（幅ずれが起きない）。
/// できた PDF はアプリの一時フォルダーに書き、パスを返す。通信はしない。
@objc(SeikyushoPdfPlugin)
public class SeikyushoPdfPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate {
    public let identifier = "SeikyushoPdfPlugin"
    public let jsName = "SeikyushoPdf"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "makePdf", returnType: CAPPluginReturnPromise)
    ]
    private var pdfWebView: WKWebView?
    private var pending: CAPPluginCall?
    private var fileName = "document.pdf"
    private let pageSize = CGSize(width: 595.2, height: 841.8)

    @objc func makePdf(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else {
            call.reject("html がありません")
            return
        }
        fileName = call.getString("fileName") ?? "document.pdf"
        DispatchQueue.main.async {
            if self.pending != nil {
                call.reject("前の PDF を作っています")
                return
            }
            self.pending = call
            let config = WKWebViewConfiguration()
            let wv = WKWebView(frame: CGRect(origin: .zero, size: self.pageSize), configuration: config)
            wv.navigationDelegate = self
            wv.isOpaque = true
            wv.backgroundColor = .white
            // 画面には見せないが、描画のために表示階層へ入れる（透明・操作不可）
            wv.alpha = 0
            wv.isUserInteractionEnabled = false
            self.bridge?.viewController?.view.addSubview(wv)
            self.pdfWebView = wv
            wv.loadHTMLString(html, baseURL: nil)
        }
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // フォントの読み込みと描画を待ってから紙に割り付ける
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.render()
        }
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(error: error.localizedDescription)
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(error: error.localizedDescription)
    }

    private func render() {
        guard let wv = pdfWebView else { finish(error: "画面がありません"); return }
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(wv.viewPrintFormatter(), startingAtPageAt: 0)
        let paper = CGRect(origin: .zero, size: pageSize)
        // 余白は HTML 側（@page と .sheet の padding）で取るので、ここでは紙いっぱいに描く
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: paper), forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        let pages = max(renderer.numberOfPages, 1)
        for i in 0..<pages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("seikyusho-pdf", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(fileName)
            try data.write(to: url, options: .atomic)
            finish(path: url.path, pages: pages)
        } catch {
            finish(error: error.localizedDescription)
        }
    }

    private func finish(path: String? = nil, pages: Int = 0, error: String? = nil) {
        let call = pending
        pending = nil
        pdfWebView?.navigationDelegate = nil
        pdfWebView?.removeFromSuperview()
        pdfWebView = nil
        if let e = error { call?.reject(e) } else { call?.resolve(["path": path ?? "", "uri": "file://" + (path ?? ""), "pages": pages]) }
    }
}
