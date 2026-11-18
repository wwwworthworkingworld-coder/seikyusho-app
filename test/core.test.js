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
  assert.strictEqual(P.sealSvg({ type: "text", text: "", preset: "kaku-classic" }), "");
  const a = sv("maru-lines"), b = sv("maru-lines"); assert.notStrictEqual(a.match(/id="(s\w+)/)?.[1], b.match(/id="(s\w+)/)?.[1] || "x");
});
t("月ごとの一覧：新しい月が先、請求書は差引額で合計", () => {
  const docs = [
    { id: "1", kind: "請求書", no: "I-2026-001", date: "2026-10-05", wh: true, lines: [L("a", 1, 100000)] },
    { id: "2", kind: "見積書", no: "Q-2026-001", date: "2026-11-02", wh: false, lines: [L("b", 1, 50000)] },
    { id: "3", kind: "請求書", no: "I-2026-002", date: "2026-11-20", wh: false, lines: [L("c", 1, 10000)] },
  ];
  const g = C.groupByMonth(docs, { taxable: true, rounding: "floor" });
  assert.deepStrictEqual(g.map(x => x.month), ["2026-11", "2026-10"]);
  assert.strictEqual(g[0].total, 55000 + 11000); assert.strictEqual(g[1].total, 110000 - 10210);
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

// ---- ロゴの自動生成
t("ロゴ：法人格を除いた本体と頭文字（英字は単語の頭、和文は先頭 1〜2 字）", () => {
  assert.deepStrictEqual([Lg.nameParts("株式会社見本商事").core, Lg.nameParts("株式会社見本商事").initials], ["見本商事", "見本"]);
  assert.deepStrictEqual([Lg.nameParts("Sample Works LLC").core, Lg.nameParts("Sample Works LLC").initials], ["Sample Works LLC", "SW"]);
  assert.strictEqual(Lg.nameParts("山田").initials, "山");
  assert.strictEqual(Lg.nameParts("").core, "");
});
t("ロゴ：型 10 種・色 6・書体 3。どの組み合わせでも屋号を含む SVG になり、特殊文字は無害化", () => {
  assert.strictEqual(Lg.TEMPLATES.length, 10); assert.strictEqual(Lg.PALETTES.length, 6); assert.strictEqual(Lg.FONTS.length, 3);
  Lg.TEMPLATES.forEach(([tp]) => Lg.PALETTES.forEach(([pl]) => Lg.FONTS.forEach(([f]) => {
    const s = Lg.logoSvg("株式会社サンプル工房", { template: tp, palette: pl, font: f, seed: 1 });
    assert.ok(s.startsWith("<svg") && s.endsWith("</svg>"), tp);
    assert.ok(tp === "monogram" ? s.includes(">サン<") : s.includes("サンプル工房"), tp + " " + pl);
  })));
  const s = Lg.logoSvg("<b>見本</b>", { template: "wordmark" });
  assert.ok(!s.includes("<b>") && s.includes("&lt;b&gt;"));
  assert.strictEqual(Lg.logoSvg("", {}), "");
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
