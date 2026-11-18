package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * WebView の印刷アダプターを使って PDF ファイルに書く。
 * LayoutResultCallback / WriteResultCallback はパッケージ内からしか作れないので、このクラスは android.print パッケージに置く
 * （Android の WebView を PDF にする定番の方法。通信はしない）。
 */
public class PdfPrint {
    public interface Listener {
        void onDone(File file);
        void onError(String message);
    }

    private final PrintAttributes attributes;

    public PdfPrint(PrintAttributes attributes) {
        this.attributes = attributes;
    }

    public void print(final PrintDocumentAdapter adapter, final File file, final Listener listener) {
        adapter.onLayout(null, attributes, null, new PrintDocumentAdapter.LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                ParcelFileDescriptor fd;
                try {
                    fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE);
                } catch (FileNotFoundException e) {
                    listener.onError("ファイルを作れませんでした");
                    return;
                }
                adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, fd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                    @Override
                    public void onWriteFinished(PageRange[] pages) {
                        try { fd.close(); } catch (Exception ignored) { }
                        listener.onDone(file);
                    }

                    @Override
                    public void onWriteFailed(CharSequence error) {
                        try { fd.close(); } catch (Exception ignored) { }
                        listener.onError(error == null ? "PDF を書けませんでした" : error.toString());
                    }
                });
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                listener.onError(error == null ? "PDF の割り付けに失敗しました" : error.toString());
            }
        }, null);
    }
}
