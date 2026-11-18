package com.company256.seikyusho.review;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Google Play の In-App Review。「出してよいか」を頼むだけで、出すかどうかは Google が決める。
 * 文言や回数はこちらで足さない（Play のポリシー）。
 */
@CapacitorPlugin(name = "SeikyushoReview")
public class SeikyushoReviewPlugin extends Plugin {
    @PluginMethod
    public void request(final PluginCall call) {
        try {
            final ReviewManager manager = ReviewManagerFactory.create(getContext());
            manager.requestReviewFlow().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || getActivity() == null) { resolve(call, false); return; }
                ReviewInfo info = task.getResult();
                manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(t -> resolve(call, true));
            });
        } catch (Exception e) {
            resolve(call, false);
        }
    }

    private void resolve(PluginCall call, boolean requested) {
        JSObject ret = new JSObject();
        ret.put("requested", requested);
        call.resolve(ret);
    }
}
