// ストア画像を撮るときだけ（ios-screens.yml）シミュレーターのアプリに差し込む。架空のデータを入れて、画面を順に切り替える
(async () => {
  const pad = n => String(n).padStart(2, "0");
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1;
  const D = (mm, dd) => `${mm < 1 ? y - 1 : y}-${pad(mm < 1 ? mm + 12 : mm)}-${pad(dd)}`;
  const L = (item, qty, unit, price, rate = 10) => ({ item, qty, unit, price, rate });
  const P = window.Capacitor.Plugins;
  const seeded = await P.Preferences.get({ key: "seeded" });
  if (!seeded.value) {
    const docs = [
      { id: "d1", kind: "請求書", no: `I-${y}-003`, date: D(m, Math.min(d.getDate(), 28)), due: D(m + 1 > 12 ? 1 : m + 1, 28), to: "見本商事", honor: "御中", subject: "Webサイト制作", wh: false, memo: "いつもありがとうございます。",
        lines: [L("トップページデザイン", 1, "式", 80000), L("下層ページ制作", 5, "ページ", 12000), L("早期割引", 1, "", -5000)], paid: false, updated: `${y}-${pad(m)}-10T10:00:00.000Z` },
      { id: "d2", kind: "見積書", no: `Q-${y}-004`, date: D(m, Math.max(1, Math.min(d.getDate(), 28) - 3)), due: D(m + 1 > 12 ? 1 : m + 1, 10), to: "サンプル工房", honor: "様", subject: "ロゴ制作", wh: true, memo: "",
        lines: [L("ロゴデザイン", 1, "式", 60000), L("名刺デザイン", 1, "式", 15000)], paid: false, updated: `${y}-${pad(m)}-08T10:00:00.000Z` },
      { id: "d3", kind: "請求書", no: `I-${y}-002`, date: D(m - 1, 25), due: D(m, 28), to: "みほんデザイン事務所", honor: "御中", subject: "撮影", wh: true, memo: "",
        lines: [L("商品撮影", 20, "点", 3000), L("レタッチ", 20, "点", 800), L("撮影時の飲食（軽減税率）", 1, "式", 1500, 8)], paid: true, updated: `${y}-${pad(m)}-01T10:00:00.000Z` },
      { id: "d4", kind: "領収書", no: `R-${y}-001`, date: D(m - 1, 28), due: "", to: "見本商事", honor: "御中", subject: "Webサイト保守", wh: false, memo: "",
        lines: [L("月額保守", 1, "か月", 20000)], paid: false, updated: `${y}-${pad(m - 1 || 12)}-28T10:00:00.000Z` },
      { id: "d5", kind: "納品書", no: `D-${y}-001`, date: D(m - 2, 15), due: "", to: "サンプル工房", honor: "様", subject: "チラシ印刷データ", wh: false, memo: "",
        lines: [L("チラシ A4 両面データ", 1, "式", 35000)], paid: false, updated: `${y}-${pad(m - 2 > 0 ? m - 2 : 12)}-15T10:00:00.000Z` },
    ];
    await P.Preferences.set({ key: "seeded", value: "1" });
    await P.Preferences.set({ key: "seikyusho-app-v1", value: JSON.stringify({ docs, clients: [{ name: "見本商事", honor: "御中" }, { name: "サンプル工房", honor: "様" }, { name: "みほんデザイン事務所", honor: "御中" }], items: [],
      me: { name: "サンプル工房", addr: "〒000-0000 東京都見本区見本町 1-2-3", tel: "03-0000-0000", mail: "info@example.com", reg: "T1234567890123", taxable: true, bank: "見本銀行 本店 普通 1234567 サンプルコウボウ" },
      settings: { rounding: "floor", rates: [10, 8], defaultRate: 10, color: "navy", seal: { type: "text", text: "株式会社サンプル工房", shape: "round", font: "mincho", noin: true }, logo: "", prefix: { "見積書": "Q", "納品書": "D", "請求書": "I", "領収書": "R" }, yearInNo: true, created: 5, lastBackup: "", launches: 1, reviewAsked: false } }) });
    location.reload();
    return;
  }
  window.SeikyushoStoreMock = { isPurchased: async () => ({ purchased: true }), getProduct: async () => ({ price: "¥2,500" }), purchase: async () => ({ state: "purchased" }), restore: async () => ({ purchased: true }) };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // 1画面を60秒ずつ見せる。ios-screens.yml が起動の40秒後から60秒おきに撮る：1 一覧 → 2 作る → 3 プレビュー → 4 設定
  await wait(60000); document.querySelector(".doclist li").click();
  await wait(60000); document.getElementById("previewBtn").click();
  await wait(60000); document.getElementById("previewClose").click(); document.querySelector("[data-tab=settings]").click();
})();
