// 監修用のサンプル書類（架空のデータ）を HTML に書き出す。PDF 化は make_samples.py（Chrome の headless）
// node tools/make_samples.js <出力フォルダー>
const fs = require("fs"), path = require("path");
const C = require("../www/core.js"), P = require("../www/paper.js");
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const me = { name: "株式会社サンプル工房", person: "見本 太郎", addr: "〒000-0000 東京都見本区見本町 1-2-3", tel: "03-0000-0000", fax: "03-0000-0001", mail: "info@example.com", reg: "T1234567890123", taxable: true, bank: "見本銀行 本店 普通 1234567 カ）サンプルコウボウ" };
const L = (item, qty, unit, price, rate = 10, extra = {}) => Object.assign({ item, qty, unit, price, rate }, extra);
const to = { to: "見本商事株式会社", honor: "御中", toZip: "000-0000", toAddr: "東京都見本区見本町 4-5-6", toDept: "総務部", toPerson: "見本 花子" };
const seal = { type: "text", text: "株式会社サンプル工房", preset: "kaku-classic", noin: true };
const docs = [
  ["0_請求書", Object.assign({ kind: "請求書", no: "I-2026-003", date: "2026-11-20", due: "2026-12-31", subject: "Webサイト制作", wh: false,
    lines: [L("トップページデザイン", 1, "式", 80000), L("下層ページ制作", 5, "ページ", 12000), L("早期割引", 1, "", 5000, 10, { discount: true })], memo: "いつもありがとうございます。" }, to)],
  ["1_見積書", Object.assign({ kind: "見積書", no: "Q-2026-001", date: "2026-11-20", due: "2026-12-20", subject: "Webサイト制作", wh: false,
    lines: [L("トップページデザイン", 1, "式", 80000), L("下層ページ制作", 5, "ページ", 12000), { type: "subtotal", item: "小計（制作）" }, L("撮影時の飲食（軽減税率）", 1, "式", 1500, 8), L("早期割引", 1, "", 5000, 10, { discount: true })], memo: "有効期限内のご発注で早期割引を適用します。" }, to)],
  ["2_納品書", Object.assign({ kind: "納品書", no: "D-2026-001", date: "2026-12-10", due: "", subject: "Webサイト制作", wh: false,
    lines: [L("トップページデザイン", 1, "式", 80000), L("下層ページ制作", 5, "ページ", 12000)], memo: "" }, to)],
  ["3_請求書_源泉あり", Object.assign({ kind: "請求書", no: "I-2026-001", date: "2026-12-15", due: "2027-01-31", subject: "原稿執筆料（12 月分）", wh: true,
    lines: [L("原稿執筆（特集記事）", 1, "本", 1200000), L("取材交通費（対象外）", 1, "式", 8000, null)], memo: "源泉徴収税額は消費税を除いた金額を基に計算しています。" }, to)],
  ["4_請求書_内税_軽減税率混在", Object.assign({ kind: "請求書", no: "I-2026-002", date: "2026-12-15", due: "2027-01-31", subject: "ケータリング（12 月）", wh: false, inclusive: true,
    lines: [L("弁当（持ち帰り・軽減税率）", 30, "個", 1080, 8), L("飲料（持ち帰り・軽減税率）", 30, "本", 162, 8), L("配達・会場設営", 1, "式", 11000, 10), L("食器レンタル", 30, "組", 220, 10)], memo: "単価は税込です。消費税は税率ごとに税込合計から計算しています。" }, to)],
  ["5_領収書_5万円以上", Object.assign({ kind: "領収書", no: "R-2026-001", date: "2026-12-20", due: "", subject: "Webサイト制作費", wh: false,
    lines: [L("Webサイト制作費", 1, "式", 140000)], memo: "" }, to)],
  ["6_発注書", Object.assign({ kind: "発注書", no: "PO-2026-001", date: "2026-11-25", due: "2026-12-25", subject: "印刷物（チラシ）", wh: false,
    lines: [L("A4 チラシ 両面カラー", 5000, "枚", 8), L("デザインデータ修正", 1, "式", 15000)], memo: "納品先：当社本社。検品後に請求書をお送りください。" }, to)],
];
const manifest = [];
for (const [name, doc] of docs) {
  const html = P.pdfDocument(P.paperHtml(doc, me, { color: "navy", rounding: "floor", seal, reduced: [8] }));
  fs.writeFileSync(path.join(out, name + ".html"), html, "utf8");
  const c = C.calc(doc.lines, { taxable: true, rounding: "floor", withholding: !!doc.wh, inclusive: !!doc.inclusive });
  manifest.push({ name, kind: doc.kind, base: c.base, tax: c.tax, total: c.total, wh: c.wh, net: c.net, byRate: c.byRate });
}
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1), "utf8");
console.log(manifest.map(m => `${m.name}: 税抜 ${m.base} 税 ${m.tax} 税込 ${m.total} 源泉 ${m.wh} 差引 ${m.net} byRate ${JSON.stringify(m.byRate)}`).join("\n"));
