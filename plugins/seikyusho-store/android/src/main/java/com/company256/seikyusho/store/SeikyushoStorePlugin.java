package com.company256.seikyusho.store;

import android.os.Handler;
import android.os.Looper;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

/**
 * 請求書ラクラクの買い切り（1 商品固定 seikyusho_pro）。Google Play Billing だけを使い、サーバーは無い。
 * JS からは 4 つ：status（持っているか）・loadOffer（価格の表示文）・buy（購入画面）・recover（別の端末での購入を引き当てる）。iOS 版と同じ名前。
 * ほかに checkReviewCode（Android 版だけの審査用コード。SHA-256 だけを持つ）。
 */
@CapacitorPlugin(name = "SeikyushoStore")
public class SeikyushoStorePlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String OFFER_ID = "seikyusho_pro";
    private BillingClient client;
    private PluginCall buyCall;

    private interface Ready { void run(boolean ok); }

    private void connect(final Ready then) {
        if (client != null && client.isReady()) { then.run(true); return; }
        client = BillingClient.newBuilder(getContext()).setListener(this)
            .enablePendingPurchases(com.android.billingclient.api.PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).build();
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) { then.run(r.getResponseCode() == BillingClient.BillingResponseCode.OK); }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    private void queryOwned(final Ready then) {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, purchases) -> {
            boolean owned = false;
            for (Purchase p : purchases) {
                if (p.getProducts().contains(OFFER_ID) && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    owned = true;
                    if (!p.isAcknowledged()) acknowledge(p);
                }
            }
            then.run(owned);
        });
    }

    private void acknowledge(Purchase p) {
        client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
    }

    private void queryOffer(final java.util.function.Consumer<ProductDetails> then) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
            QueryProductDetailsParams.Product.newBuilder().setProductId(OFFER_ID).setProductType(BillingClient.ProductType.INAPP).build())).build();
        client.queryProductDetailsAsync(params, (r, list) -> then.accept(list != null && !list.isEmpty() ? list.get(0) : null));
    }

    /** 持っているか（起動時） */
    @PluginMethod
    public void status(final PluginCall call) {
        connect(ok -> {
            if (!ok) { reply(call, false); return; }
            queryOwned(owned -> reply(call, owned));
        });
    }

    /** Play は購入をアカウントに持つので、同期の手順は無く status と同じ */
    @PluginMethod
    public void recover(final PluginCall call) { status(call); }

    // 審査用コード（Android 版だけ）。Google Play の審査員が有料部分を確かめるためのもの。
    // コードそのものは持たず SHA-256 だけを持つ。一致しても購入状態には触れない（JS 側が別のフラグで扱う）。
    private static final String REVIEW_CODE_SHA256 = "ee4d5bfb9484afbab2f55923e79cc07f9fe4ad721854377429953f7f05a06e4b";

    @PluginMethod
    public void checkReviewCode(final PluginCall call) {
        String code = call.getString("code", "").trim().toUpperCase();
        boolean ok = false;
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest(code.getBytes(java.nio.charset.StandardCharsets.UTF_8))) hex.append(String.format("%02x", b));
            ok = hex.toString().equals(REVIEW_CODE_SHA256);
        } catch (Exception e) { ok = false; }
        JSObject ret = new JSObject(); ret.put("ok", ok); call.resolve(ret);
    }

    /** 価格の表示文。Play から取れないときはエラーにせず price 無しで返す */
    @PluginMethod
    public void loadOffer(final PluginCall call) {
        final JSObject ret = new JSObject(); ret.put("offer", OFFER_ID);
        connect(ok -> {
            if (!ok) { call.resolve(ret); return; }
            queryOffer(pd -> {
                if (pd != null && pd.getOneTimePurchaseOfferDetails() != null) {
                    ret.put("price", pd.getOneTimePurchaseOfferDetails().getFormattedPrice());
                    ret.put("title", pd.getName());
                }
                call.resolve(ret);
            });
        });
    }

    /** 購入画面。結果は done / waiting（承認待ち）/ cancelled */
    @PluginMethod
    public void buy(final PluginCall call) {
        connect(ok -> {
            if (!ok) { call.reject("Google Play に接続できませんでした"); return; }
            queryOffer(pd -> {
                if (pd == null) { call.reject("商品を読み込めませんでした"); return; }
                buyCall = call;
                List<BillingFlowParams.ProductDetailsParams> list = Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build());
                BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(list).build();
                new Handler(Looper.getMainLooper()).post(() -> {
                    BillingResult r = client.launchBillingFlow(getActivity(), flow);
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { buyCall = null; call.reject("購入画面を開けませんでした"); }
                });
            });
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall call = buyCall; buyCall = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            String result = "cancelled";
            for (Purchase p : purchases) {
                if (!p.getProducts().contains(OFFER_ID)) continue;
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) { result = "done"; if (!p.isAcknowledged()) acknowledge(p); }
                else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) result = "waiting";
            }
            if (call != null) resolveResult(call, result);
            notifyListeners("offerUnlocked", new JSObject().put("offer", OFFER_ID));
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (call != null) resolveResult(call, "cancelled");
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            if (call != null) resolveResult(call, "done");
        } else {
            if (call != null) call.reject("購入できませんでした（" + code + "）");
        }
    }

    private void resolveResult(PluginCall call, String result) { JSObject ret = new JSObject(); ret.put("result", result); call.resolve(ret); }
    private void reply(PluginCall call, boolean unlocked) { JSObject ret = new JSObject(); ret.put("unlocked", unlocked); ret.put("offer", OFFER_ID); call.resolve(ret); }
}
