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
 * アプリ内課金（買い切り・非消耗型）。Google Play Billing だけを使い、サーバーも外部サービスも使わない。
 * iOS 版（StoreKit 2）と同じ 4 つのメソッド：getProduct / purchase / restore / isPurchased。
 */
@CapacitorPlugin(name = "SeikyushoStore")
public class SeikyushoStorePlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall purchaseCall;
    private String purchasingId = "";

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

    private void queryOwned(final String productId, final Ready then) {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, purchases) -> {
            boolean owned = false;
            for (Purchase p : purchases) {
                if (p.getProducts().contains(productId) && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
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

    private void queryProduct(final String productId, final java.util.function.Consumer<ProductDetails> then) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
            QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build())).build();
        client.queryProductDetailsAsync(params, (r, list) -> then.accept(list != null && !list.isEmpty() ? list.get(0) : null));
    }

    @PluginMethod
    public void isPurchased(final PluginCall call) {
        final String id = call.getString("productId", "");
        connect(ok -> {
            if (!ok) { resolvePurchased(call, false); return; }
            queryOwned(id, owned -> resolvePurchased(call, owned));
        });
    }

    @PluginMethod
    public void restore(final PluginCall call) { isPurchased(call); }

    @PluginMethod
    public void getProduct(final PluginCall call) {
        final String id = call.getString("productId", "");
        connect(ok -> {
            if (!ok) { JSObject ret = new JSObject(); ret.put("found", false); call.resolve(ret); return; }
            queryProduct(id, pd -> {
                JSObject ret = new JSObject();
                if (pd == null || pd.getOneTimePurchaseOfferDetails() == null) { ret.put("found", false); call.resolve(ret); return; }
                ret.put("found", true);
                ret.put("productId", pd.getProductId());
                ret.put("price", pd.getOneTimePurchaseOfferDetails().getFormattedPrice());
                ret.put("name", pd.getName());
                ret.put("description", pd.getDescription());
                call.resolve(ret);
            });
        });
    }

    @PluginMethod
    public void purchase(final PluginCall call) {
        final String id = call.getString("productId", "");
        connect(ok -> {
            if (!ok) { call.reject("Google Play に接続できませんでした"); return; }
            queryProduct(id, pd -> {
                if (pd == null) { call.reject("商品が見つかりません"); return; }
                purchaseCall = call; purchasingId = id;
                List<BillingFlowParams.ProductDetailsParams> list = Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build());
                BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(list).build();
                new Handler(Looper.getMainLooper()).post(() -> {
                    BillingResult r = client.launchBillingFlow(getActivity(), flow);
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { purchaseCall = null; call.reject("購入画面を開けませんでした"); }
                });
            });
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall call = purchaseCall; purchaseCall = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            String state = "cancelled";
            for (Purchase p : purchases) {
                if (!p.getProducts().contains(purchasingId)) continue;
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) { state = "purchased"; if (!p.isAcknowledged()) acknowledge(p); }
                else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) state = "pending";
            }
            if (call != null) resolveState(call, state);
            notifyListeners("purchaseUpdated", new JSObject().put("productId", purchasingId));
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (call != null) resolveState(call, "cancelled");
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            if (call != null) resolveState(call, "purchased");
        } else {
            if (call != null) call.reject("購入できませんでした（" + code + "）");
        }
    }

    private void resolveState(PluginCall call, String state) { JSObject ret = new JSObject(); ret.put("state", state); call.resolve(ret); }
    private void resolvePurchased(PluginCall call, boolean owned) { JSObject ret = new JSObject(); ret.put("purchased", owned); call.resolve(ret); }
}
