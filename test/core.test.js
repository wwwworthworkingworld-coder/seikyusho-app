// node test/core.test.js
const assert = require("assert");
const C = require("../www/core.js");
const P = require("../www/paper.js");
const Lg = require("../www/logo.js");

let n = 0;
const t = (name, f) => { f(); n++; console.log("ok  " + name); };
const L = (item, qty, price, rate = 10, unit = "") => ({ item, qty, unit, price, rate });
const NOW = new Date(2026, 10, 17);
const settings = () => ({ prefix: Object.assign({}, C.PREFIX), yearInNo: true, created: 0, rounding: "floor" });

// ---- 金額
t("税率別に合計し、消費税は税率ごとに 1 回だけ切り捨て", () => {
  const c = C.calc([L("デザイン", 1, 33333, 10), L("写植", 3, 1111, 10), L("食品サンプル", 2, 555, 8)], { taxable: true });
  // 10%: 33333+3333=36666 → 税 3666（36666*0.1=3666.6 切り捨て）。8%: 1110 → 88（88.8 切り捨て）
  assert.deepStrictEqual(c.byRate.map(g => [g.rate, g.base, g.tax]), [[10, 36666, 3666], [8, 1110, 88]]);
  assert.strictEqual(c.base, 37776); assert.strictEqual(c.tax, 3754); assert.strictEqual(c.total, 41530);
});
t("端数：四捨五入と切り上げ", () => {
  const ls = [L("A", 1, 1005, 10)];   // 税 100.5
  assert.strictEqual(C.calc(ls, { rounding: "floor" }).tax, 100);
  assert.strictEqual(C.calc(ls, { rounding: "round" }).tax, 101);
  assert.strictEqual(C.calc(ls, { rounding: "ceil" }).tax, 101);
  assert.strictEqual(C.calc([L("B", 1, 1000, 10)], { rounding: "ceil" }).tax, 100);
});
t("1 行ごとに端数処理しない（行ごとなら 3 円、まとめれば 2 円）", () => {
  const c = C.calc([L("a", 1, 9, 10), L("b", 1, 9, 10), L("c", 1, 9, 10)], { rounding: "floor" });
  assert.strictEqual(c.tax, 2);   // 27*0.1=2.7 → 2。行ごとなら 0+0+0=0 でもなく、四捨五入行ごとなら 3
});
t("対象外（rate null）は消費税に入れず合計には入れる", () => {
  const c = C.calc([L("印紙代", 1, 200, null), L("作業", 1, 10000, 10)]);
  assert.strictEqual(c.exempt, 200); assert.strictEqual(c.tax, 1000); assert.strictEqual(c.total, 11200);
});
t("値引き行（負の単価）", () => {
  const c = C.calc([L("制作", 1, 100000, 10), L("値引き", 1, -10000, 10)]);
  assert.strictEqual(c.base, 90000); assert.strictEqual(c.tax, 9000); assert.strictEqual(c.total, 99000);
});
t("免税事業者は消費税 0", () => {
  const c = C.calc([L("制作", 1, 100000, 10)], { taxable: false });
  assert.strictEqual(c.tax, 0); assert.strictEqual(c.total, 100000);
});
t("源泉徴収：100 万円以下は 10.21%、1 円未満切り捨て", () => {
  const c = C.calc([L("原稿料", 1, 100000, 10)], { withholding: true });
  assert.strictEqual(c.wh, 10210); assert.strictEqual(c.net, 110000 - 10210);
  const c2 = C.calc([L("原稿料", 1, 33333, 10)], { withholding: true });
  assert.strictEqual(c2.wh, Math.floor(33333 * 0.1021));   // 3403
});
t("源泉徴収：100 万円を超える部分は 20.42%＋102,100 円（国税庁の例 150 万円 → 204,200 円）", () => {
  const c = C.calc([L("報酬", 1, 1500000, 10)], { withholding: true });
  assert.strictEqual(c.wh, 204200);
  assert.strictEqual(C.calc([L("報酬", 1, 1000000, 10)], { withholding: true }).wh, 102100);
});
t("品目名が空の行は無視、数量×単価は四捨五入", () => {
  const c = C.calc([L("", 1, 500, 10), L("半端", 1.5, 333, 10)]);
  assert.strictEqual(c.lines.length, 1); assert.strictEqual(c.lines[0].amount, 500);   // 499.5 → 500
});
t("書類に大きく出す金額：請求書で源泉徴収なら差引額、それ以外は税込", () => {
  const c = C.calc([L("a", 1, 100000, 10)], { withholding: true });
  assert.strictEqual(C.shownAmount({ kind: "請求書", wh: true }, c), c.net);
  assert.strictEqual(C.shownAmount({ kind: "見積書", wh: true }, c), c.total);
});

// ---- 番号・期限・登録番号
t("書類番号は接頭＋年＋連番、種類ごとに独立", () => {
  const docs = [{ kind: "請求書", no: "I-2026-001" }, { kind: "請求書", no: "I-2026-007" }, { kind: "見積書", no: "Q-2026-003" }, { kind: "請求書", no: "I-2025-020" }];
  assert.strictEqual(C.nextNo(docs, "請求書", settings(), NOW), "I-2026-008");
  assert.strictEqual(C.nextNo(docs, "見積書", settings(), NOW), "Q-2026-004");
  assert.strictEqual(C.nextNo(docs, "領収書", settings(), NOW), "R-2026-001");
  assert.strictEqual(C.nextNo(docs, "請求書", Object.assign(settings(), { yearInNo: false }), NOW), "I-001");
  assert.strictEqual(C.nextNo([], "請求書", Object.assign(settings(), { prefix: { "請求書": "INV" } }), NOW), "INV-2026-001");
});
t("期限の既定：請求書は翌月末、見積書は 30 日後", () => {
  assert.strictEqual(C.defaultDue("請求書", "2026-11-17"), "2026-12-31");
  assert.strictEqual(C.defaultDue("請求書", "2026-01-15"), "2026-02-28");
  assert.strictEqual(C.defaultDue("見積書", "2026-11-17"), "2026-12-17");
  assert.strictEqual(C.defaultDue("納品書", "2026-11-17"), "");
});
t("インボイス登録番号は T＋13 桁（全角・ハイフンは直す）", () => {
  assert.ok(C.isRegNo("T1234567890123")); assert.ok(C.isRegNo("Ｔ１２３４５６７８９０１２３")); assert.ok(C.isRegNo("T-1234567890123"));
  assert.ok(!C.isRegNo("T123456789012")); assert.ok(!C.isRegNo("1234567890123")); assert.ok(!C.isRegNo(""));
  assert.strictEqual(C.normalizeRegNo("ｔ１２３４５６７８９０１２３"), "T1234567890123");
});

// ---- 引き継ぎ・無料枚数
t("見積書から請求書へ引き継ぐ：品目と取引先は同じ、番号・日付・期限は新しく、元の番号を覚える", () => {
  const q = { id: "a", kind: "見積書", no: "Q-2026-001", date: "2026-10-01", due: "2026-10-31", to: "見本商事", honor: "御中", subject: "Web制作", wh: false, lines: [L("制作", 1, 100000)], paid: false };
  const inv = C.convert(q, "請求書", [q], settings(), NOW, "b");
  assert.strictEqual(inv.id, "b"); assert.strictEqual(inv.kind, "請求書"); assert.strictEqual(inv.no, "I-2026-001");
  assert.strictEqual(inv.date, "2026-11-17"); assert.strictEqual(inv.due, "2026-12-31"); assert.strictEqual(inv.from, "Q-2026-001");
  assert.deepStrictEqual(inv.lines, q.lines); assert.notStrictEqual(inv.lines[0], q.lines[0]);
  assert.strictEqual(inv.to, "見本商事"); assert.strictEqual(inv.subject, "Web制作");
});
t("無料は累計 3 枚まで。購入すれば無制限", () => {
  assert.ok(C.canCreate({ created: 0 }, false)); assert.ok(C.canCreate({ created: 2 }, false));
  assert.ok(!C.canCreate({ created: 3 }, false)); assert.ok(C.canCreate({ created: 99 }, true));
  assert.strictEqual(C.freeLeft({ created: 1 }), 2); assert.strictEqual(C.freeLeft({ created: 10 }), 0);
});

// ---- バックアップ
t("バックアップの往復：書類・取引先・品目・自分の情報・設定が戻る", () => {
  const data = { docs: [{ id: "a", kind: "請求書", no: "I-2026-001", date: "2026-11-17", to: "見本商事", lines: [L("制作", 1, 100000)] }],
    clients: [{ name: "見本商事", honor: "御中" }], items: [{ item: "制作", price: 100000 }], me: { name: "サンプル工房", reg: "T1234567890123" }, settings: { color: "wine", created: 1 } };
  const r = C.restore(C.backup(data, NOW));
  assert.deepStrictEqual(r.docs[0].lines, data.docs[0].lines); assert.strictEqual(r.docs[0].honor, "御中");
  assert.deepStrictEqual(r.me, data.me); assert.strictEqual(r.settings.color, "wine"); assert.strictEqual(r.clients[0].name, "見本商事");
});
t("バックアップでないファイルは断る", () => {
  assert.throws(() => C.restore("abc"), /バックアップ/);
  assert.throws(() => C.restore(JSON.stringify({ app: "other", docs: [] })), /このアプリ/);
  assert.throws(() => C.restore(JSON.stringify({ records: [] })), /このアプリ/);
});
t("復元の「追加」は同じ種類・番号を重ねない", () => {
  const cur = [{ id: "a", kind: "請求書", no: "I-2026-001" }];
  const m = C.mergeDocs(cur, [{ id: "x", kind: "請求書", no: "I-2026-001" }, { id: "y", kind: "見積書", no: "I-2026-001" }, { id: "z", kind: "請求書", no: "I-2026-002" }]);
  assert.deepStrictEqual(m.map(d => d.id), ["a", "y", "z"]);
});

// ---- 丸印・一覧・履歴
t("印影の文字割り：法人格は省かない。3 文字以下 1 行、6 以下 2 行、9 以下 3 行、それ以上 4 行", () => {
  assert.deepStrictEqual(C.sealLines("山田"), ["山田"]);
  assert.deepStrictEqual(C.sealLines("サンプル工房"), ["サンプ", "ル工房"]);
  assert.deepStrictEqual(C.sealLines("株式会社見本商事"), ["株式会", "社見本", "商事"]);
  assert.deepStrictEqual(C.sealLines("合同会社みほんデザイン事務所"), ["合同会社", "みほんデ", "ザイン事", "務所"]);
  assert.deepStrictEqual(C.sealLines(""), []);
  assert.strictEqual(C.sealSquareText("株式会社見本商事", true), "株式会社見本商事之印");
  assert.strictEqual(C.sealSquareText("見本商事", false), "見本商事");
  assert.strictEqual(C.SEAL_FONTS.length, 3);
});
t("印影のプリセット 6 種：角印は四角と之印、回し文字は textPath と中央の役職、かすれはフィルター、細枠は薄い朱", () => {
  assert.strictEqual(C.SEAL_PRESETS.length, 6);
  const sv = id => P.sealSvg({ type: "text", text: "株式会社見本商事", preset: id });
  assert.ok(/<rect/.test(sv("kaku-classic")) && sv("kaku-classic").includes(">之<") && sv("kaku-classic").includes(">印<"));
  assert.ok(!P.sealSvg({ type: "text", text: "見本商事", preset: "kaku-classic", noin: false }).includes(">之<"));
  assert.ok(sv("maru-mawashi").includes("<textPath") && sv("maru-mawashi").includes(">代<") && sv("maru-mawashi").includes(">役<"));
  assert.ok(P.sealSvg({ type: "text", text: "見本商事", preset: "maru-mawashi", center: "印" }).includes(">印<"));
  assert.ok(sv("kaku-worn").includes("<filter") && sv("kaku-worn").includes("feTurbulence"));
  assert.ok(sv("maru-modern").includes("#e0493a") && sv("maru-modern").includes("Maru Gothic"));
  assert.ok(sv("kaku-bold").includes('stroke-width="4.6"'));
  assert.deepStrictEqual(["株式会社見本", "合同会社見本", "見本工房", "一般社団法人見本"].map(C.sealCenterDefault), ["代表取締役印", "代表社員之印", "代表者印", "理事長印"]);
  assert.ok(P.sealSvg({ type: "text", text: "合同会社見本", preset: "maru-mawashi" }).includes(">社<"));
  assert.strictEqual(P.sealSvg({ type: "text", text: "", preset: "kaku-classic" }), "");
  const a = sv("maru-lines"), b = sv("maru-lines"); assert.notStrictEqual(a.match(/id="(s\w+)/)?.[1], b.match(/id="(s\w+)/)?.[1] || "x");
});
t("月ごとの一覧：新しい月が先、請求書は差引額で合計、見積書は数えない", () => {
  const docs = [
    { id: "1", kind: "請求書", no: "I-2026-001", date: "2026-10-05", wh: true, lines: [L("a", 1, 100000)] },
    { id: "2", kind: "見積書", no: "Q-2026-001", date: "2026-11-02", wh: false, lines: [L("b", 1, 50000)] },
    { id: "3", kind: "請求書", no: "I-2026-002", date: "2026-11-20", wh: false, lines: [L("c", 1, 10000)] },
  ];
  const g = C.groupByMonth(docs, { taxable: true, rounding: "floor" });
  assert.deepStrictEqual(g.map(x => x.month), ["2026-11", "2026-10"]);
  assert.strictEqual(g[0].total, 11000); assert.strictEqual(g[1].total, 110000 - 10210);
  assert.deepStrictEqual(g[0].docs.map(d => d.id), ["3", "2"]);
});
t("取引先・品目の履歴は新しい順で重複なし、値引きは品目に出さない", () => {
  const docs = [
    { updated: "2026-11-01", to: "見本商事", honor: "御中", lines: [L("制作", 1, 100000), L("値引き", 1, -5000)] },
    { updated: "2026-11-10", to: "サンプル工房", honor: "様", lines: [L("撮影", 1, 30000)] },
    { updated: "2026-11-12", to: "見本商事", honor: "御中", lines: [L("制作", 1, 120000)] },
  ];
  assert.deepStrictEqual(C.recentClients(docs).map(c => c.name), ["見本商事", "サンプル工房"]);
  const items = C.recentItems(docs);
  assert.deepStrictEqual(items.map(i => i.item), ["制作", "撮影"]); assert.strictEqual(items[0].price, 120000);
});
t("レビューのお願いは 1 回だけ、書類 3 枚以上で PDF 直後か 3 回目以降の起動", () => {
  assert.ok(C.shouldAskReview({ asked: false, launches: 1, docs: 3, exported: true }));
  assert.ok(C.shouldAskReview({ asked: false, launches: 3, docs: 3, exported: false }));
  assert.ok(!C.shouldAskReview({ asked: false, launches: 1, docs: 3, exported: false }));
  assert.ok(!C.shouldAskReview({ asked: false, launches: 5, docs: 2, exported: true }));
  assert.ok(!C.shouldAskReview({ asked: true, launches: 5, docs: 9, exported: true }));
});
t("バックアップの注意：5 枚未満は出ない、無ければ出る、31 日以上前なら出る", () => {
  assert.strictEqual(C.backupWarning(4, "", NOW), "");
  assert.ok(/バックアップ/.test(C.backupWarning(5, "", NOW)));
  assert.strictEqual(C.backupWarning(9, "2026-11-01T00:00:00.000Z", NOW), "");
  assert.ok(/日たって/.test(C.backupWarning(9, "2026-09-01T00:00:00.000Z", NOW)));
});
t("PDF の前の確認：取引先名・品目・登録番号の形式", () => {
  assert.deepStrictEqual(C.validate({ to: "", lines: [] }, {}), ["取引先名を入れてください", "品目を 1 行以上入れてください"]);
  assert.deepStrictEqual(C.validate({ to: "見本商事", lines: [L("a", 1, 1)] }, { reg: "T12" }), ["インボイス登録番号は T＋13 桁です（設定で直してください）"]);
  assert.deepStrictEqual(C.validate({ to: "見本商事", lines: [L("a", 1, 1)] }, { reg: "" }), []);
});

// ---- 書類の HTML（PDF の元）
const ME = { name: "サンプル工房", addr: "東京都見本区 1-2-3", tel: "03-0000-0000", mail: "info@example.com", reg: "T1234567890123", taxable: true, bank: "見本銀行 本店 普通 1234567 サンプルコウボウ" };
const DOC = { id: "a", kind: "請求書", no: "I-2026-001", date: "2026-11-17", due: "2026-12-31", to: "見本商事", honor: "御中", subject: "Webサイト制作", wh: true, memo: "いつもありがとうございます。",
  lines: [L("トップページデザイン", 1, 80000, 10, "式"), L("下層ページ", 5, 12000, 10, "ページ"), L("打ち合わせ飲食（軽減）", 1, 1000, 8, "式"), L("早期割引", 1, -5000, 10, "")] };
t("書類の HTML：インボイスの記載事項（登録番号・日付・税率別の合計と消費税・相手の名前・軽減税率の印）が入る", () => {
  const h = P.paperHtml(DOC, ME, { color: "navy", rounding: "floor" });
  ["T1234567890123", "2026年11月17日", "見本商事", "御中", "10%対象", "8%対象", "※", "請 求 書", "源泉徴収税額", "差引お支払額", "見本銀行", "2026年12月31日", "Webサイト制作"].forEach(k => assert.ok(h.includes(k), "missing " + k));
  const c = C.calc(DOC.lines, { taxable: true, withholding: true });
  assert.ok(h.includes("¥" + C.yen(c.net))); assert.ok(h.includes(C.yen(c.byRate[0].tax)));
});
t("書類の HTML：免税事業者は消費税と登録番号を出さず、その旨を書く", () => {
  const h = P.paperHtml(Object.assign({}, DOC, { wh: false }), Object.assign({}, ME, { taxable: false, reg: "" }), { color: "mono" });
  assert.ok(h.includes("免税事業者")); assert.ok(!h.includes("登録番号")); assert.ok(!h.includes("消費税（10%）"));
});
t("書類の HTML：領収書は但し書き、見積書は有効期限、納品書は期限なし", () => {
  assert.ok(P.paperHtml(Object.assign({}, DOC, { kind: "領収書" }), ME, {}).includes("但し、Webサイト制作として"));
  assert.ok(P.paperHtml(Object.assign({}, DOC, { kind: "見積書", due: "2026-12-17" }), ME, {}).includes("有効期限：2026年12月17日"));
  assert.ok(!P.paperHtml(Object.assign({}, DOC, { kind: "納品書" }), ME, {}).includes("期限"));
});
t("書類の HTML：印影・ロゴ・色が反映され、HTML の特殊文字は無害化される", () => {
  const h = P.paperHtml(Object.assign({}, DOC, { to: "<script>x</script>見本" }), ME, { color: "wine", seal: { type: "image", data: "data:image/png;base64,AAAA" }, logo: "data:image/png;base64,BBBB" });
  assert.ok(!h.includes("<script>x")); assert.ok(h.includes("&lt;script&gt;"));
  assert.ok(h.includes("data:image/png;base64,AAAA")); assert.ok(h.includes("data:image/png;base64,BBBB")); assert.ok(h.includes("#8b2942"));
  const h2 = P.paperHtml(DOC, ME, { seal: { type: "text", text: "株式会社サンプル工房", preset: "maru-lines" } });
  assert.ok(h2.includes("<svg")); assert.ok(h2.includes("<circle")); assert.ok(h2.includes("株式会")); assert.ok(h2.includes("Hiragino Mincho"));
  const h3 = P.paperHtml(DOC, ME, { seal: { type: "text", text: "株式会社見本商事", preset: "kaku-bold" } });
  assert.ok(h3.includes("<rect")); assert.ok(h3.includes(">之<")); assert.ok(h3.includes("Hiragino Sans"));
});
t("書類の HTML を PDF 用の 1 ページ文書に包む（A4・余白・フォント）", () => {
  const full = P.pdfDocument(P.paperHtml(DOC, ME, {}));
  assert.ok(full.startsWith("<!doctype html>")); assert.ok(full.includes("210mm")); assert.ok(full.includes("Hiragino"));
  assert.ok(/@page\s*\{[^}]*A4/.test(full)); assert.ok(full.includes("min-height:0"), "PDF では用紙いっぱいの高さ指定を外す（空白ページを防ぐ）");
});
t("ファイル名：種類_番号_取引先.pdf、使えない文字は除く", () => {
  assert.strictEqual(P.pdfFileName(DOC), "請求書_I-2026-001_見本商事.pdf");
  assert.strictEqual(P.pdfFileName(Object.assign({}, DOC, { to: "見本/商事:株" })), "請求書_I-2026-001_見本商事株.pdf");
});

// ---- 1.0 追加の 8 項目（競合比較 07 の 4-2）
t("小計行：直前の小計からの合計。合計・消費税には入れない", () => {
  const ls = [L("基礎", 1, 100000), L("型枠", 2, 30000), { type: "subtotal", item: "小計" }, L("塗装", 1, 50000), { type: "subtotal", item: "小計" }];
  assert.deepStrictEqual(C.subtotals(ls), [{ index: 2, amount: 160000 }, { index: 4, amount: 50000 }]);
  const c = C.calc(ls); assert.strictEqual(c.base, 210000); assert.strictEqual(c.lines.length, 3);
  const h = P.paperHtml(Object.assign({}, DOC, { lines: ls }), ME, {});
  assert.ok(h.includes('class="sub"') && h.includes("160,000") && h.includes("50,000"));
});
t("値引き行は PDF で赤（neg）", () => {
  const h = P.paperHtml(DOC, ME, {}); assert.ok(h.includes('class="neg"'));
  assert.ok(!P.paperHtml(Object.assign({}, DOC, { lines: [L("a", 1, 100)] }), ME, {}).includes('class="neg"'));
});
t("「御」の切替：設定でオンのとき見積・納品・請求の題名に御、領収書は変わらない。既定は御なし", () => {
  assert.ok(P.paperHtml(Object.assign({}, DOC, { kind: "見積書" }), ME, {}).includes("見 積 書") && !P.paperHtml(Object.assign({}, DOC, { kind: "見積書" }), ME, {}).includes("御 見 積 書"));
  assert.ok(P.paperHtml(Object.assign({}, DOC, { kind: "見積書" }), ME, { go: true }).includes("御 見 積 書"));
  assert.ok(P.paperHtml(DOC, ME, { go: true }).includes("御 請 求 書"));
  assert.ok(P.paperHtml(Object.assign({}, DOC, { kind: "領収書" }), ME, { go: true }).includes("領 収 書"));
});
t("発注書・注文書：種類 6 つ、番号の接頭 PO/OR、納期、発注者／受注者の欄名", () => {
  assert.deepStrictEqual(C.KINDS, ["見積書", "納品書", "請求書", "領収書", "発注書", "注文書"]);
  assert.strictEqual(C.nextNo([], "発注書", settings(), NOW), "PO-2026-001");
  assert.strictEqual(C.defaultDue("発注書", "2026-11-17"), "2026-12-17");
  const h = P.paperHtml(Object.assign({}, DOC, { kind: "発注書", due: "2026-12-17" }), ME, {});
  assert.ok(h.includes("発 注 書") && h.includes("納期：2026年12月17日") && h.includes("受注者") && h.includes("発注者") && h.includes("発注金額"));
  assert.ok(P.paperHtml(Object.assign({}, DOC, { kind: "注文書" }), ME, {}).includes("注 文 書"));
});
t("最近削除：30 日以内は残り、31 日以上で消える。残り日数", () => {
  const tr = [{ id: "a", deletedAt: "2026-11-01T00:00:00.000Z" }, { id: "b", deletedAt: "2026-10-01T00:00:00.000Z" }];
  assert.deepStrictEqual(C.purgeTrash(tr, NOW).map(x => x.id), ["a"]);
  assert.strictEqual(C.trashDaysLeft(tr[0], NOW), 30 - Math.floor((NOW - new Date(tr[0].deletedAt)) / 864e5));   // タイムゾーンに依らない
  const r = C.restore(C.backup({ docs: [], trash: tr }, NOW)); assert.strictEqual(r.trash.length, 2);
});
t("検索：取引先・件名・番号・備考・品目名", () => {
  const d = { to: "見本商事", subject: "ロゴ制作", no: "I-2026-003", memo: "急ぎ", lines: [L("名刺デザイン", 1, 1)] };
  ["見本", "ロゴ", "003", "急ぎ", "名刺"].forEach(q => assert.ok(C.matchDoc(d, q), q));
  assert.ok(!C.matchDoc(d, "存在しない")); assert.ok(C.matchDoc(d, ""));
});
t("売上一覧の CSV：年で絞り、BOM 付き、列は日付〜入金、税抜・消費税・源泉・税込・差引", () => {
  const docs = [
    { kind: "請求書", no: "I-2026-001", date: "2026-03-10", to: "見本商事", subject: "A", wh: true, paid: true, lines: [L("a", 1, 100000)] },
    { kind: "見積書", no: "Q-2026-001", date: "2026-04-01", to: "サンプル工房", subject: "B", wh: false, lines: [L("b", 1, 50000)] },
    { kind: "請求書", no: "I-2025-009", date: "2025-12-01", to: "去年", subject: "", wh: false, lines: [L("c", 1, 1000)] },
  ];
  const csv = C.salesCsv(docs, 2026, { taxable: true, rounding: "floor" }, null);   // 全部
  assert.ok(csv.startsWith("﻿\"日付\",\"種類\",\"番号\",\"取引先\",\"件名\",\"税抜\",\"消費税\",\"源泉徴収\",\"税込\",\"差引\",\"入金\",\"入金日\""));
  const lines = csv.trim().split("\r\n"); assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[1], '"2026-03-10","請求書","I-2026-001","見本商事","A","100000","10000","10210","110000","99790","済",""');
  assert.ok(lines[2].includes('"見積書"') && lines[2].endsWith('"",""') && !csv.includes("去年"));
  assert.strictEqual(C.salesCsv(docs, 2026, {}).trim().split("\r\n").length, 2);   // 既定は請求書・領収書だけ
});
t("空欄の項目は書類に印刷しない（電話・メール・住所・登録番号が空ならその行が出ない）", () => {
  const h = P.paperHtml(DOC, { name: "サンプル工房", taxable: true }, {});
  assert.ok(!h.includes("TEL") && !h.includes("登録番号") && !h.includes("お振込先"));
});

// ---- ロゴの自動生成
t("ロゴ：法人格を除いた本体と頭文字（英字は単語の頭、和文は先頭 1〜2 字）", () => {
  assert.deepStrictEqual([Lg.nameParts("株式会社見本商事").core, Lg.nameParts("株式会社見本商事").initials], ["見本商事", "見本"]);
  assert.deepStrictEqual([Lg.nameParts("Sample Works LLC").core, Lg.nameParts("Sample Works LLC").initials], ["Sample Works LLC", "SW"]);
  assert.strictEqual(Lg.nameParts("山田").initials, "山");
  assert.strictEqual(Lg.nameParts("").core, "");
});
t("ロゴ：型 10 種・色 6・書体 3。どの組み合わせでも屋号を含む SVG になり、特殊文字は無害化", () => {
  assert.strictEqual(Lg.TEMPLATES.length, 10); assert.strictEqual(Lg.PALETTES.length, 8); assert.strictEqual(Lg.FONTS.length, 3);
  Lg.TEMPLATES.forEach(([tp]) => Lg.PALETTES.forEach(([pl]) => Lg.FONTS.forEach(([f]) => {
    const s = Lg.logoSvg("株式会社サンプル工房", { template: tp, palette: pl, font: f, seed: 1 });
    assert.ok(s.startsWith("<svg") && s.endsWith("</svg>"), tp);
    assert.ok(tp === "monogram" ? s.includes(">サン<") : s.includes("サンプル工房"), tp + " " + pl);
  })));
  assert.ok(!Lg.logoSvg("見本", { template: "wafu-rakkan" }).includes("Gradient") && Lg.logoSvg("見本商事", { template: "wafu-rakkan" }).includes("<rect"));
  const s = Lg.logoSvg("<b>見本</b>", { template: "wordmark" });
  assert.ok(!s.includes("<b>") && s.includes("&lt;b&gt;"));
  assert.strictEqual(Lg.logoSvg("", {}), "");
});
t("ロゴ：全 10 型 × 8 色 × 3 書体 × 屋号 4 種（2 字・12 字・英字・長い英字）で、図形と文字が安全領域（8%）からはみ出さない", () => {
  const names = ["見本", "株式会社見本商事ホールディングス", "Sample Works LLC", "Yamada Design Studio International"];
  let n = 0;
  Lg.TEMPLATES.forEach(([tp]) => Lg.PALETTES.forEach(([pl]) => Lg.FONTS.forEach(([f]) => names.forEach(nm => {
    const svg = Lg.logoSvg(nm, { template: tp, palette: pl, font: f, seed: 3 });
    const b = Lg.logoBounds(svg);
    const sq = tp === "monogram";
    const lim = sq ? { x0: 8, y0: 8, x1: 92, y1: 92 } : Lg.SAFE;
    assert.ok(b.x0 >= lim.x0 - 0.01 && b.y0 >= lim.y0 - 0.01 && b.x1 <= lim.x1 + 0.01 && b.y1 <= lim.y1 + 0.01, `${tp}/${pl}/${f}/${nm}: ${JSON.stringify(b)}`);
    n++;
  }))));
  assert.strictEqual(n, 10 * 8 * 3 * 4);
  // 頭文字 2 段：仕切り線が頭文字・屋号と重ならない
  const sv = Lg.logoSvg("株式会社見本商事ホールディングス", { template: "initial-stack" });
  const texts = (sv.match(/<text [^>]*>[^<]*<\/text>/g) || []).map(t2 => Lg.logoBounds(`<svg>${t2}</svg>`));
  assert.ok(texts[0].x1 <= 107 && texts[1].x0 >= 109, JSON.stringify(texts));
});
// ---- ビルド 5（08 の 4-1 A・C・D・E・J・M・F）
t("A 値引き行：正の数で入れて discount:true なら負。古いデータの負の単価もそのまま負。小計・履歴も符号を見る", () => {
  const d = { item: "早期割引", qty: 1, price: 5000, discount: true, rate: 10 };
  assert.strictEqual(C.lineAmount(d), -5000);
  assert.strictEqual(C.lineAmount({ item: "旧", qty: 1, price: -3000, rate: 10 }), -3000);
  assert.strictEqual(C.lineAmount({ item: "負で入った値引き", qty: 1, price: -2000, discount: true, rate: 10 }), -2000);
  const c = C.calc([L("制作", 1, 30000), d], { rounding: "floor" });
  assert.strictEqual(c.base, 25000); assert.strictEqual(c.tax, 2500); assert.strictEqual(c.total, 27500);
  assert.deepStrictEqual(C.subtotals([L("a", 1, 10000), d, { type: "subtotal" }]).map(s => s.amount), [5000]);
  const items = C.recentItems([{ updated: "2026-01-01", lines: [L("制作", 1, 1000), d] }]);
  assert.deepStrictEqual(items.map(i => i.item), ["制作"]);
  // 画面と PDF は赤と「−」
  const html = P.paperHtml({ kind: "請求書", lines: [L("制作", 1, 30000), d] }, {});
  assert.ok(/<tr class="neg">.*早期割引.*−5,000.*−5,000/.test(html));
});
t("C 見出し行：数量・単価が空の行は PDF の数量・単価・金額が空欄（「0」を印字しない）。合計に入れない", () => {
  const lines = [{ item: "【第 1 期】", qty: "", unit: "", price: "", rate: 10 }, L("設計", 1, 100000)];
  const html = P.paperHtml({ kind: "請求書", lines }, {});
  const row = html.match(/<tr class="head">.*?<\/tr>/)[0];
  assert.ok(row.includes("【第 1 期】"));
  assert.ok(!/>0</.test(row), row);
  assert.strictEqual((row.match(/<td class="n"><\/td>/g) || []).length, 3);
  assert.strictEqual(C.calc(lines).base, 100000);
  // 単価だけ空（数量あり）でも金額は空欄
  const html2 = P.paperHtml({ kind: "請求書", lines: [{ item: "持ち込み", qty: 2, unit: "個", price: "", rate: 10 }] }, {});
  assert.ok(/<td class="n">2<\/td><td class="c">個<\/td><td class="n"><\/td><td class="n"><\/td>/.test(html2));
});
t("D 月合計：請求書（差引）＋領収書だけ。種類で絞ればその種類。CSV は請求書・領収書だけ／全部", () => {
  const docs = [
    { kind: "見積書", no: "Q-1", date: "2026-05-01", lines: [L("a", 1, 10000)] },
    { kind: "請求書", no: "I-1", date: "2026-05-02", wh: true, lines: [L("a", 1, 10000)], paid: true, paidAt: "2026-05-20" },
    { kind: "領収書", no: "R-1", date: "2026-05-03", lines: [L("b", 1, 5000)] },
    { kind: "納品書", no: "D-1", date: "2026-05-04", lines: [L("c", 1, 99999)] },
  ];
  const g = C.groupByMonth(docs, { rounding: "floor" });
  assert.strictEqual(g.length, 1); assert.strictEqual(g[0].docs.length, 4);
  assert.strictEqual(g[0].total, (11000 - 1021) + 5500);
  assert.strictEqual(C.groupByMonth(docs, {}, ["見積書"])[0].total, 11000);
  assert.strictEqual(C.monthTotalLabel(""), "請求・領収 合計"); assert.strictEqual(C.monthTotalLabel("見積書"), "見積書 合計");
  const csv = C.salesCsv(docs, 2026, {});
  assert.strictEqual(csv.trim().split("\r\n").length, 3);
  assert.ok(csv.includes('"入金日"') && csv.includes('"済","2026-05-20"'));
  assert.strictEqual(C.salesCsv(docs, 2026, {}, null).trim().split("\r\n").length, 5);
});
t("E 内税：税率ごとに税込合計×r÷(100+r) を 1 回だけ端数処理、税抜＝税込−税（10/8 混在）", () => {
  const c = C.calc([L("a", 1, 11000, 10), L("b", 1, 1080, 8), L("c", 2, 1000, 10)], { inclusive: true, rounding: "floor" });
  // 10%: 13000 → 税 1181（13000×10/110=1181.8 切り捨て）税抜 11819。8%: 1080 → 税 80 税抜 1000
  assert.deepStrictEqual(c.byRate.map(g => [g.rate, g.gross, g.tax, g.base]), [[10, 13000, 1181, 11819], [8, 1080, 80, 1000]]);
  assert.strictEqual(c.total, 14080); assert.strictEqual(c.tax, 1261); assert.strictEqual(c.base, 12819); assert.strictEqual(c.inclusive, true);
});
t("E 内税：端数 3 方式", () => {
  const ls = [L("a", 1, 1005, 10)];   // 1005×10/110 = 91.36
  assert.strictEqual(C.calc(ls, { inclusive: true, rounding: "floor" }).tax, 91);
  assert.strictEqual(C.calc(ls, { inclusive: true, rounding: "round" }).tax, 91);
  assert.strictEqual(C.calc(ls, { inclusive: true, rounding: "ceil" }).tax, 92);
  assert.strictEqual(C.calc([L("b", 1, 1100, 10)], { inclusive: true, rounding: "ceil" }).tax, 100);
});
t("E 内税：値引き行は税込で引く", () => {
  const c = C.calc([L("a", 1, 11000, 10), Object.assign(L("値引き", 1, 1100, 10), { discount: true })], { inclusive: true });
  assert.strictEqual(c.total, 9900); assert.strictEqual(c.tax, 900); assert.strictEqual(c.base, 9000);
});
t("E 内税：免税事業者は税額なし（税込＝税抜）", () => {
  const c = C.calc([L("a", 1, 11000, 10)], { inclusive: true, taxable: false });
  assert.strictEqual(c.tax, 0); assert.strictEqual(c.base, 11000); assert.strictEqual(c.total, 11000);
});
t("E 内税：源泉徴収の基礎は税抜", () => {
  const c = C.calc([L("原稿料", 1, 110000, 10)], { inclusive: true, withholding: true });
  assert.strictEqual(c.base, 100000); assert.strictEqual(c.wh, 10210); assert.strictEqual(c.net, 110000 - 10210);
});
t("E 内税：PDF の見出しは「単価（税込）」「金額（税込）」、内訳は「10%対象（税込）」。外税のときは出ない", () => {
  const h1 = P.paperHtml({ kind: "請求書", inclusive: true, lines: [L("a", 1, 11000, 10)] }, {});
  assert.ok(h1.includes("<th>単価（税込）</th><th>金額（税込）</th>") && h1.includes("10%対象（税込） 11,000円　内消費税 1,000円"));
  const h2 = P.paperHtml({ kind: "請求書", lines: [L("a", 1, 10000, 10)] }, {});
  assert.ok(h2.includes("<th>単価</th><th>金額</th>") && h2.includes("10%対象 10,000円　消費税 1,000円"));
  // 免税なら内税スイッチが入っていても税の見出しは出ない
  const h3 = P.paperHtml({ kind: "請求書", inclusive: true, lines: [L("a", 1, 11000, 10)] }, { taxable: false });
  assert.ok(h3.includes("<th>単価</th>") && h3.includes("免税事業者"));
});
t("J 未入金：期限を過ぎた未入金の請求書だけ期限超過。入金済みにすると paidAt、戻すと消える", () => {
  const d = { kind: "請求書", due: "2026-05-31", paid: false };
  assert.strictEqual(C.isOverdue(d, "2026-06-01"), true); assert.strictEqual(C.isOverdue(d, "2026-05-31"), false);
  assert.strictEqual(C.isOverdue(Object.assign({}, d, { paid: true }), "2026-06-01"), false);
  assert.strictEqual(C.isOverdue({ kind: "見積書", due: "2026-05-31" }, "2026-06-01"), false);
  C.setPaid(d, true, "2026-06-03"); assert.strictEqual(d.paid, true); assert.strictEqual(d.paidAt, "2026-06-03");
  C.setPaid(d, false); assert.strictEqual(d.paid, false); assert.strictEqual(d.paidAt, undefined);
  // 引き継ぎ・複製で入金日を持ち越さない
  const n = C.convert({ kind: "請求書", no: "I-2026-001", date: "2026-05-01", paid: true, paidAt: "2026-05-20", lines: [] }, "領収書", [], settings(), NOW, "x");
  assert.strictEqual(n.paid, false); assert.strictEqual(n.paidAt, undefined);
});
t("M 軽減税率の印は率ごとの設定：既定は 8%。5% をオンにすれば 5% に※、8% を外せば消える", () => {
  const lines = [L("食品", 1, 1000, 8), L("雑貨", 1, 1000, 10), L("新税率", 1, 1000, 5)];
  const h1 = P.paperHtml({ kind: "請求書", lines }, {}, {});
  assert.ok(h1.includes('<td class="c">※1</td>') && h1.includes('<td class="c">2</td>') && h1.includes('<td class="c">3</td>') && h1.includes("※は軽減税率対象"));
  const h2 = P.paperHtml({ kind: "請求書", lines }, {}, { reduced: [5] });
  assert.ok(h2.includes('<td class="c">1</td>') && h2.includes('<td class="c">※3</td>'));
  const h3 = P.paperHtml({ kind: "請求書", lines: [L("雑貨", 1, 1000, 10)] }, {}, { reduced: [] });
  assert.ok(!h3.includes("※"));
  assert.strictEqual(C.isReduced(8, undefined), true); assert.strictEqual(C.isReduced("8", [8]), true); assert.strictEqual(C.isReduced(10, [8]), false);
});
t("F 取引先：絞り込み（空なら直近 6、文字があれば一致 8）。書類に住所・部署・担当者を写し、PDF に出る", () => {
  const clients = Array.from({ length: 12 }, (_, i) => ({ name: `見本${i}商事`, honor: "御中", last: `2026-01-${String(i + 1).padStart(2, "0")}` }));
  clients.push({ name: "サンプル工房", honor: "様", person: "見本 花子", last: "2026-02-01" });
  assert.strictEqual(C.clientSuggest(clients, "").length, 6); assert.strictEqual(C.clientSuggest(clients, "")[0].name, "サンプル工房");
  assert.strictEqual(C.clientSuggest(clients, "見本").length, 8);
  assert.deepStrictEqual(C.clientSuggest(clients, "花子").map(c => c.name), ["サンプル工房"]);
  assert.strictEqual(C.clientSuggest(clients, "サンプル工房").length, 0);   // 全部入力済みなら出さない
  const doc = C.applyClient({ kind: "請求書", lines: [] }, { name: "見本商事", honor: "御中", zip: "000-0000", addr: "東京都見本区 1-2-3", dept: "総務部", person: "見本 花子" });
  const html = P.paperHtml(doc, { name: "サンプル工房", person: "見本 太郎", tel: "03-0000-0000", fax: "03-0000-0001" });
  assert.ok(html.includes('<div class="to-addr">〒000-0000　東京都見本区 1-2-3</div>'));
  assert.ok(html.includes('<div class="to-person">総務部　見本 花子 様</div>'));
  assert.ok(html.includes("担当：見本 太郎") && html.includes("TEL 03-0000-0000　FAX 03-0000-0001"));
  const rec = C.clientFromDoc(doc, "2026-03-01T00:00:00.000Z");
  assert.deepStrictEqual(rec, { name: "見本商事", honor: "御中", zip: "000-0000", addr: "東京都見本区 1-2-3", dept: "総務部", person: "見本 花子", last: "2026-03-01T00:00:00.000Z" });
  assert.ok(C.matchDoc(doc, "花子"));
});
t("H 文言：挨拶文・振込手数料の一文を変えられる。空にすれば出ない。既定は今の文", () => {
  const doc = { kind: "請求書", lines: [L("a", 1, 1000)], due: "2026-06-30" };
  const h0 = P.paperHtml(doc, {});
  assert.ok(h0.includes("下記のとおりご請求申し上げます。") && h0.includes("振込手数料はご負担をお願いいたします。"));
  const h1 = P.paperHtml(doc, {}, { text: { greet: { "請求書": "ご請求です。" }, feeNote: "" } });
  assert.ok(h1.includes("ご請求です。") && !h1.includes("振込手数料") && !h1.includes("下記のとおりご請求"));
  const h2 = P.paperHtml(doc, {}, { text: { greet: { "請求書": "" } } });
  assert.ok(!h2.includes("下記のとおりご請求") && h2.includes("振込手数料"));
});
t("I 行の並べ替え・複製", () => {
  const ls = [L("a", 1, 1), L("b", 1, 2), L("c", 1, 3)];
  assert.deepStrictEqual(C.moveLine(ls, 0, 1).map(l => l.item), ["b", "a", "c"]);
  assert.deepStrictEqual(C.moveLine(ls, 0, -1).map(l => l.item), ["a", "b", "c"]);
  assert.deepStrictEqual(C.moveLine(ls, 2, 1).map(l => l.item), ["a", "b", "c"]);
  const d = C.duplicateLine(ls, 1); assert.deepStrictEqual(d.map(l => l.item), ["a", "b", "b", "c"]); assert.notStrictEqual(d[1], d[2]);
});
t("B 期限欄：請求書・見積書・発注書・注文書に出て、発注書・注文書は「納期」。納品書・領収書は出ない", () => {
  assert.strictEqual(C.DUE_LABEL["発注書"], "納期"); assert.strictEqual(C.DUE_LABEL["注文書"], "納期"); assert.strictEqual(C.DUE_LABEL["見積書"], "有効期限");
  assert.ok(C.hasDue("請求書") && C.hasDue("発注書") && !C.hasDue("納品書") && !C.hasDue("領収書"));
});
t("K 初回の導線：屋号が空なら未設定", () => {
  assert.strictEqual(C.meMissing({ name: "" }), true); assert.strictEqual(C.meMissing({ name: "  " }), true); assert.strictEqual(C.meMissing({ name: "サンプル工房" }), false); assert.strictEqual(C.meMissing(null), true);
});

t("審査用コード：ネイティブの照合が一致したら Android だけ解除。iOS・web では一致しても無効、購入フラグとは別", () => {
  const s1 = settings();
  assert.strictEqual(C.applyReviewCode(s1, "android", true), true); assert.strictEqual(s1.reviewUnlocked, true);
  assert.strictEqual(C.isPro(s1, false, "android"), true); assert.strictEqual(C.canCreate(s1, C.isPro(s1, false, "android")), true);
  const s2 = settings();
  assert.strictEqual(C.applyReviewCode(s2, "ios", true), false); assert.strictEqual(s2.reviewUnlocked, undefined);
  assert.strictEqual(C.applyReviewCode(s2, "web", true), false); assert.strictEqual(C.applyReviewCode(s2, "android", false), false);
  assert.strictEqual(C.isPro(s2, false, "ios"), false);
  // 解除フラグが入ったバックアップを iOS で読んでも有料にならない
  const s3 = { reviewUnlocked: true, created: 5 }; assert.strictEqual(C.isPro(s3, false, "ios"), false); assert.strictEqual(C.isPro(s3, false, "android"), true);
  assert.strictEqual(C.isPro(s3, true, "ios"), true);
});
t("審査用コード：コードの文字列は www（iOS バンドル）に入っていない。Java は SHA-256 だけを持つ", () => {
  const fs = require("fs"), path = require("path"), crypto = require("crypto");
  const java = fs.readFileSync(path.join(__dirname, "../plugins/seikyusho-store/android/src/main/java/com/company256/seikyusho/store/SeikyushoStorePlugin.java"), "utf8");
  const m = java.match(/REVIEW_CODE_SHA256 = "([0-9a-f]{64})"/); assert.ok(m, "Java にハッシュがない");
  const secret = path.join(__dirname, "../../store/審査用コード_非公開.md");
  if (!fs.existsSync(secret)) { console.log("    （非公開ファイルがないので文字列の照合は省略）"); return; }
  const code = (fs.readFileSync(secret, "utf8").match(/`([A-Z0-9]{12})`/) || [])[1]; assert.ok(code, "非公開ファイルにコードがない");
  assert.strictEqual(crypto.createHash("sha256").update(code).digest("hex"), m[1], "ハッシュが一致しない");
  for (const f of fs.readdirSync(path.join(__dirname, "../www"))) {
    const p = path.join(__dirname, "../www", f); if (fs.statSync(p).isFile()) assert.ok(!fs.readFileSync(p, "utf8").includes(code), f + " にコードが入っている");
  }
  assert.ok(!fs.readFileSync(path.join(__dirname, "../plugins/seikyusho-store/ios/Sources/SeikyushoStorePlugin/SeikyushoStorePlugin.swift"), "utf8").includes(code));
});
t("ロゴ：同じ seed なら同じ案、違う seed なら別の案が出る。長い屋号は文字が小さくなる", () => {
  assert.deepStrictEqual(Lg.randomSpec(42), Lg.randomSpec(42));
  const specs = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(Lg.randomSpec(i + 1))));
  assert.ok(specs.size > 10);
  const short = Lg.logoSvg("見本", { template: "wordmark" }).match(/font-size="(\d+)"/)[1];
  const long = Lg.logoSvg("とても長い屋号のデザイン事務所サンプル", { template: "wordmark" }).match(/font-size="(\d+)"/)[1];
  assert.ok(+long < +short);
});

console.log(`\n${n} 件すべて合格`);
