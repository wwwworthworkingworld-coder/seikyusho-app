// パソコンのブラウザで画面を確かめるとき（tools/serve_test.py）だけ読み込む。アプリには入らない。データはすべて架空
(() => {
  const q = new URLSearchParams(location.search);
  const pad = n => String(n).padStart(2, "0");
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1;
  const D = (mm, dd) => `${mm < 1 ? y - 1 : y}-${pad(mm < 1 ? mm + 12 : mm)}-${pad(dd)}`;
  const L = (item, qty, unit, price, rate = 10) => ({ item, qty, unit, price, rate });
  if (q.get("seed") !== null && !sessionStorage.getItem("seeded")) {
    sessionStorage.setItem("seeded", "1");
    const docs = [
      { id: "d1", kind: "請求書", no: `I-${y}-003`, date: D(m, Math.min(d.getDate(), 28)), due: D(m + 1 > 12 ? 1 : m + 1, 28), to: "見本商事", honor: "御中", subject: "Webサイト制作", wh: false, memo: "いつもありがとうございます。",
        lines: [L("トップページデザイン", 1, "式", 80000), L("下層ページ制作", 5, "ページ", 12000), L("早期割引", 1, "", -5000)], paid: false, updated: `${y}-${pad(m)}-10T10:00:00.000Z` },
      { id: "d2", kind: "見積書", no: `Q-${y}-004`, date: D(m, Math.min(d.getDate(), 28) - 3 || 1), due: D(m + 1 > 12 ? 1 : m + 1, 10), to: "サンプル工房", honor: "様", subject: "ロゴ制作", wh: true, memo: "",
        lines: [L("ロゴデザイン", 1, "式", 60000), L("名刺デザイン", 1, "式", 15000)], paid: false, updated: `${y}-${pad(m)}-08T10:00:00.000Z` },
      { id: "d3", kind: "請求書", no: `I-${y}-002`, date: D(m - 1, 25), due: D(m, 28), to: "みほんデザイン事務所", honor: "御中", subject: "撮影", wh: true, memo: "",
        lines: [L("商品撮影", 20, "点", 3000), L("レタッチ", 20, "点", 800), L("撮影時の飲食（軽減税率）", 1, "式", 1500, 8)], paid: true, updated: `${y}-${pad(m)}-01T10:00:00.000Z` },
      { id: "d4", kind: "領収書", no: `R-${y}-001`, date: D(m - 1, 28), due: "", to: "見本商事", honor: "御中", subject: "Webサイト保守", wh: false, memo: "",
        lines: [L("月額保守", 1, "か月", 20000)], paid: false, updated: `${y}-${pad(m - 1 || 12)}-28T10:00:00.000Z` },
      { id: "d5", kind: "納品書", no: `D-${y}-001`, date: D(m - 2, 15), due: "", to: "サンプル工房", honor: "様", subject: "チラシ印刷データ", wh: false, memo: "",
        lines: [L("チラシ A4 両面データ", 1, "式", 35000)], paid: false, updated: `${y}-${pad(m - 2 > 0 ? m - 2 : 12)}-15T10:00:00.000Z` },
    ];
    localStorage.setItem("seikyusho-app-v1", JSON.stringify({ docs, clients: [{ name: "見本商事", honor: "御中" }, { name: "サンプル工房", honor: "様" }, { name: "みほんデザイン事務所", honor: "御中" }], items: [],
      me: { name: "サンプル工房", addr: "〒000-0000 東京都見本区見本町 1-2-3", tel: "03-0000-0000", mail: "info@example.com", reg: "T1234567890123", taxable: true, bank: "見本銀行 本店 普通 1234567 サンプルコウボウ" },
      settings: { rounding: "floor", rates: [10, 8], defaultRate: 10, color: q.get("color") || "navy", seal: { type: "text", text: "株式会社サンプル工房", preset: "kaku-classic", noin: true, center: "代表取締役印" }, logo: "", prefix: { "見積書": "Q", "納品書": "D", "請求書": "I", "領収書": "R" }, yearInNo: true, created: 5, lastBackup: "", launches: 1, reviewAsked: false } }));
  }
  // 購入の試し：?buy=0 で未購入の画面
  let bought = q.get("buy") !== "0";
  window.SeikyushoStoreMock = {
    isPurchased: async () => ({ purchased: bought }),
    getProduct: async () => ({ productId: "mock", price: "¥2,500", name: "無制限・印影・テンプレ" }),
    purchase: async () => { bought = true; return { state: "purchased" }; },
    restore: async () => ({ purchased: bought }),
  };
  // 撮影用：iPhoneの上下の余白をまねる
  if (q.get("shot") !== null) {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = ".bar{padding-top:62px!important}.tabs{padding-bottom:30px!important}.sm-bar{padding-top:62px!important}.sm-foot{padding-bottom:40px!important}";
      document.head.appendChild(s);
      if (q.get("open")) setTimeout(() => { const li = document.querySelector(".doclist li"); if (li) li.click(); if (q.get("open") === "preview") setTimeout(() => document.getElementById("previewBtn").click(), 300); }, 400);
      if (q.get("pay") !== null) setTimeout(() => document.getElementById("createBtn").click(), 500);
      // 撮影用：指定の要素まで送る（例 &to=colorChips で「見た目」の所）
      if (q.get("to")) setTimeout(() => { const el = document.getElementById(q.get("to")); if (el) document.getElementById("scroll").scrollTop = el.closest(".card").offsetTop - 8; }, 700);
    });
  }
})();
