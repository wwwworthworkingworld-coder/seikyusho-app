package com.company256.seikyusho.pdf;

import android.graphics.pdf.PdfRenderer;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PdfPrint;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 書類の HTML を A4 の PDF にする（Android 版）。画面に出さない WebView に読み込み、印刷アダプターで A4 に割り付ける。
 * できた PDF はアプリのキャッシュに書き、file:// のパスを返す（Share プラグインが FileProvider で渡す）。通信はしない。
 */
@CapacitorPlugin(name = "SeikyushoPdf")
public class SeikyushoPdfPlugin extends Plugin {
    private WebView webView;
    private boolean busy = false;

    @PluginMethod
    public void makePdf(final PluginCall call) {
        final String html = call.getString("html", "");
        final String fileName = call.getString("fileName", "document.pdf");
        if (html == null || html.isEmpty()) { call.reject("html がありません"); return; }
        if (busy) { call.reject("前の PDF を作っています"); return; }
        busy = true;
        final Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
            try {
                webView = new WebView(getContext());
                webView.getSettings().setJavaScriptEnabled(false);
                webView.getSettings().setTextZoom(100);
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        // フォントの描画を待ってから割り付ける
                        main.postDelayed(() -> render(call, fileName), 300);
                    }
                });
                // A4 の CSS px（96dpi）に合わせた大きさで配置する
                webView.layout(0, 0, 794, 1123);
                webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
            } catch (Exception e) {
                finish(call, null, 0, e.getMessage());
            }
        });
    }

    private void render(final PluginCall call, final String fileName) {
        try {
            File dir = new File(getContext().getCacheDir(), "seikyusho-pdf");
            if (!dir.exists()) dir.mkdirs();
            final File file = new File(dir, fileName);
            PrintAttributes attrs = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter("seikyusho");
            new PdfPrint(attrs).print(adapter, file, new PdfPrint.Listener() {
                @Override
                public void onDone(File f) { finish(call, f, countPages(f), null); }

                @Override
                public void onError(String message) { finish(call, null, 0, message); }
            });
        } catch (Exception e) {
            finish(call, null, 0, e.getMessage());
        }
    }

    private int countPages(File f) {
        try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY); PdfRenderer r = new PdfRenderer(fd)) {
            return r.getPageCount();
        } catch (Exception e) {
            return 1;
        }
    }

    private void finish(PluginCall call, File file, int pages, String error) {
        busy = false;
        new Handler(Looper.getMainLooper()).post(() -> {
            if (webView != null) { try { webView.destroy(); } catch (Exception ignored) { } webView = null; }
        });
        if (error != null) { call.reject(error); return; }
        JSObject ret = new JSObject();
        ret.put("path", file.getAbsolutePath());
        ret.put("uri", "file://" + file.getAbsolutePath());
        ret.put("pages", pages);
        call.resolve(ret);
    }
}
