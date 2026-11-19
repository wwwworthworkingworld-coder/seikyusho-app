/* 画面に関係しない処理（請求書ラクラク）。Node からも require できる */
(function (root) {
  const KINDS = ["見積書", "納品書", "請求書", "領収書", "発注書", "注文書"];
  const PREFIX = { "見積書": "Q", "納品書": "D", "請求書": "I", "領収書": "R", "発注書": "PO", "注文書": "OR" };
  const TRASH_DAYS = 30;                     // 最近削除：30 日たったら消す
  const isSubtotal = l => !!l && l.type === "subtotal";
  const FREE_DOCS = 3;                       // 無料で作れる書類の累計
  const WH_LIMIT = 1000000;                  // 源泉徴収：100万円以下 10.21%、超える部分 20.42%（国税庁 No.2798）
  const REG_RE = /^T\d{13}$/;                // インボイス登録番号：T＋13桁
  const COLORS = [["navy", "紺", "#1f4e8c"], ["green", "緑", "#1e7f6b"], ["wine", "ワイン", "#8b2942"], ["gray", "グレー", "#4a5568"], ["mono", "モノクロ", "#222222"]];
  const SALES_KINDS = ["請求書", "領収書"];  // 「売上」として数える種類（見積・納品・発注・注文は数えない：見積→請求で二重になるため）
  const DEFAULT_REDUCED = [8];               // 軽減税率（※を付ける）の既定。2027-04 の飲食料品の税率引き下げ（国税庁 No.6625 注記）に備えて率ごとに設定できる

  const pad = n => String(n).padStart(2, "0");
  const toDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parse = s => { const [y, m, d] = String(s || "").split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const fmtDate = s => s ? `${+s.slice(0, 4)}年${+s.slice(5, 7)}月${+s.slice(8, 10)}日` : "";
  const yen = v => (v < 0 ? "-" : "") + Math.abs(Math.round(v)).toLocaleString("ja-JP");
  const todayStr = (now = new Date()) => toDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // 端数処理（消費税は税率ごとに合計してから 1 回だけ。国税庁 インボイス制度 Q&A）
  function roundBy(v, mode) {
    if (mode === "round") return Math.round(v);
    if (mode === "ceil") return Math.ceil(v - 1e-9);
    return Math.floor(v + 1e-9);
  }

  const blank = v => v === "" || v === undefined || v === null;
  // 単価も数量も空の行＝見出し行（金額を印字しない）。単価が空なら金額も空欄
  const hasPrice = l => !!l && !blank(l.price);
  // 1 行の金額（数量×単価）。値引き行（discount: true）は正の数で入れて内部で負にする。古いデータの負の単価はそのまま負
  const lineAmount = l => {
    if (!l) return 0;
    const raw = Math.round((Number(l.qty) || 0) * (Number(l.price) || 0));
    return l.discount ? -Math.abs(raw) : raw;
  };

  /**
   * 金額の計算。
   * lines: [{item, qty, unit, price, rate, discount}]  rate は % の数（10, 8, 0）。null/"none" は対象外
   * opt: { taxable: 課税事業者か, rounding: floor|round|ceil, withholding: 源泉徴収するか, inclusive: 単価が税込か }
   * 返り値: byRate [{rate, base, tax, gross}], base(税抜合計), tax, total(税込), wh(源泉徴収税額), net(差引), inclusive
   * 内税：税率ごとの税込合計 × r ÷ (100 + r) を端数処理 1 回で税額、税抜 ＝ 税込 − 税額。免税なら税額なし（税込＝税抜）
   */
  function calc(lines, opt = {}) {
    const taxable = opt.taxable !== false;
    const inclusive = !!opt.inclusive;
    const rounding = opt.rounding || "floor";
    const ls = (lines || []).filter(l => l && !isSubtotal(l) && String(l.item || "").trim());
    const groups = new Map();
    let exempt = 0;
    ls.forEach(l => {
      const amt = lineAmount(l);
      const r = l.rate === null || l.rate === undefined || l.rate === "" || l.rate === "none" ? null : Number(l.rate);
      if (r === null) { exempt += amt; return; }
      groups.set(r, (groups.get(r) || 0) + amt);
    });
    const byRate = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([rate, sum]) => {
      if (!taxable) return { rate, base: sum, tax: 0, gross: sum };
      if (inclusive) { const tax = roundBy(sum * rate / (100 + rate), rounding); return { rate, base: sum - tax, tax, gross: sum }; }
      const tax = roundBy(sum * rate / 100, rounding); return { rate, base: sum, tax, gross: sum + tax };
    });
    const base = byRate.reduce((s, g) => s + g.base, 0) + exempt;
    const tax = byRate.reduce((s, g) => s + g.tax, 0);
    const total = base + tax;
    // 源泉徴収は税抜の報酬額を基に計算（請求書に消費税を区分して記載している場合）。1 円未満切り捨て
    const whBase = Math.max(0, base);
    const wh = opt.withholding ? (whBase <= WH_LIMIT ? Math.floor(whBase * 0.1021) : Math.floor((whBase - WH_LIMIT) * 0.2042) + 102100) : 0;
    return { byRate, exempt, base, tax, total, wh, net: total - wh, inclusive, lines: ls.map(l => Object.assign({}, l, { amount: lineAmount(l) })) };
  }

  // 書類に大きく出す金額（請求書で源泉徴収するときは差引額）
  const shownAmount = (doc, c) => doc.kind === "請求書" && doc.wh ? c.net : c.total;

  // 小計行：直前の小計行（または先頭）からその行までの金額を足す。{ index, amount } の一覧（品目名が空の行は飛ばす）
  function subtotals(lines) {
    const out = []; let run = 0;
    (lines || []).forEach((l, i) => {
      if (isSubtotal(l)) { out.push({ index: i, amount: run }); run = 0; }
      else if (l && String(l.item || "").trim()) run += lineAmount(l);
    });
    return out;
  }

  // 品目行の並べ替え・複製（新しい配列を返す）
  function moveLine(lines, i, dir) {
    const j = i + dir; const a = (lines || []).slice();
    if (i < 0 || i >= a.length || j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]]; return a;
  }
  function duplicateLine(lines, i) {
    const a = (lines || []).slice();
    if (i < 0 || i >= a.length) return a;
    a.splice(i + 1, 0, Object.assign({}, a[i])); return a;
  }

  // 書類番号：接頭 + 年 + 連番（その接頭・年の中で最大＋1）。例 I-2026-001
  function nextNo(docs, kind, settings = {}, now = new Date()) {
    const prefix = (settings.prefix && settings.prefix[kind]) || PREFIX[kind] || "N";
    const year = settings.yearInNo === false ? "" : String(now.getFullYear());
    const head = year ? `${prefix}-${year}-` : `${prefix}-`;
    // 同じ接頭・年で、残りが数字だけの番号を数える（年なしの「I-」が「I-2026-001」を拾わないように）
    const mx = (docs || []).reduce((m, d) => {
      const s = String(d.no || "");
      return s.startsWith(head) && /^\d+$/.test(s.slice(head.length)) ? Math.max(m, parseInt(s.slice(head.length), 10)) : m;
    }, 0);
    return head + String(mx + 1).padStart(3, "0");
  }

  // 期限の既定：請求書は翌月末、見積書・発注書・注文書は 30 日後
  function defaultDue(kind, dateStr) {
    const d = parse(dateStr);
    if (kind === "請求書") { const e = new Date(d.getFullYear(), d.getMonth() + 2, 0); return toDate(e.getFullYear(), e.getMonth() + 1, e.getDate()); }
    if (kind === "見積書" || kind === "発注書" || kind === "注文書") { const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30); return toDate(e.getFullYear(), e.getMonth() + 1, e.getDate()); }
    return "";
  }
  // 期限欄を持つ種類と、そのラベル
  const DUE_LABEL = { "請求書": "お支払期限", "見積書": "有効期限", "発注書": "納期", "注文書": "納期" };
  const hasDue = kind => !!DUE_LABEL[kind];

  // 未入金の管理：支払期限を過ぎた未入金の請求書
  const isOverdue = (doc, today = todayStr()) => !!doc && doc.kind === "請求書" && !doc.paid && !!doc.due && doc.due < today;
  // 入金済みの切り替え：入金日 paidAt を持つ（CSV の「入金日」）
  function setPaid(doc, paid, today = todayStr()) {
    doc.paid = !!paid;
    if (paid) doc.paidAt = doc.paidAt || today; else delete doc.paidAt;
    return doc;
  }

  const isRegNo = s => REG_RE.test(String(s || "").replace(/[Ｔｔ]/g, "T").replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[\s-]/g, ""));
  const normalizeRegNo = s => String(s || "").replace(/[Ｔｔ]/g, "T").replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[\s-]/g, "").toUpperCase();

  // 見積書 → 納品書 → 請求書 → 領収書 の引き継ぎ。品目・取引先・件名を持って、番号と日付と期限を新しくする
  function convert(doc, kind, docs, settings, now = new Date(), newId) {
    const date = toDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const n = Object.assign({}, doc, {
      id: newId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      kind, no: nextNo(docs, kind, settings, now), date, due: defaultDue(kind, date),
      from: doc.no, paid: false, updated: now.toISOString(), lines: (doc.lines || []).map(l => Object.assign({}, l)),
    });
    delete n.paidAt;
    return n;
  }

  // 無料の枚数：保存した書類の累計（settings.created）が FREE_DOCS 未満なら新しく作れる
  const canCreate = (settings, purchased) => !!purchased || (Number(settings && settings.created) || 0) < FREE_DOCS;
  const freeLeft = settings => Math.max(0, FREE_DOCS - (Number(settings && settings.created) || 0));
  // 審査用の解除（Android 版だけ）。購入とは別のフラグ settings.reviewUnlocked。iOS・パソコンでは常に無効
  const reviewUnlocked = (settings, platform) => platform === "android" && !!(settings && settings.reviewUnlocked);
  // ネイティブ側の照合結果 matched を受けて、Android のときだけフラグを立てる。それ以外は何も変えない
  function applyReviewCode(settings, platform, matched) {
    if (platform !== "android" || !matched) return false;
    settings.reviewUnlocked = true; return true;
  }
  // 有料機能が使えるか：購入済み、または審査用に解除中
  const isPro = (settings, purchased, platform) => !!purchased || reviewUnlocked(settings, platform);

  // バックアップ：取引先・品目・自分の情報・設定も含めて 1 つの JSON に（印影・ロゴの画像も入る）
  function backup(data, now = new Date()) {
    return JSON.stringify({ app: "seikyusho-app", version: 1, exported: now.toISOString(),
      docs: data.docs || [], trash: data.trash || [], clients: data.clients || [], items: data.items || [], me: data.me || {}, settings: data.settings || {} });
  }
  function restore(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error("バックアップのファイルではありません"); }
    if (!d || d.app !== "seikyusho-app" || !Array.isArray(d.docs)) throw new Error("このアプリのバックアップではありません");
    const docs = d.docs.filter(x => x && x.id && KINDS.includes(x.kind)).map(x => Object.assign({ lines: [], paid: false, honor: "御中" }, x));
    return { docs, trash: Array.isArray(d.trash) ? d.trash : [], clients: Array.isArray(d.clients) ? d.clients : [], items: Array.isArray(d.items) ? d.items : [], me: d.me || {}, settings: d.settings || {} };
  }
  // 最近削除：削除した書類は 30 日残し、設定から戻せる
  const purgeTrash = (trash, now = new Date()) => (trash || []).filter(t => t && t.deletedAt && (now - new Date(t.deletedAt)) / 864e5 <= TRASH_DAYS);
  const trashDaysLeft = (t, now = new Date()) => Math.max(0, TRASH_DAYS - Math.floor((now - new Date(t.deletedAt)) / 864e5));

  // 一覧の検索：取引先・件名・番号・備考・品目名・担当者
  function matchDoc(doc, q) {
    const s = String(q || "").trim(); if (!s) return true;
    const hay = [doc.to, doc.toPerson, doc.toDept, doc.subject, doc.no, doc.memo, ...(doc.lines || []).map(l => l.item)].map(x => String(x || "")).join("\n");
    return hay.includes(s);
  }

  // 書類ごとの計算条件（内税は書類が持つ）
  const docCalcOpt = (doc, opt) => Object.assign({}, opt, { withholding: !!(doc && doc.wh), inclusive: !!(doc && doc.inclusive) });

  // 売上一覧の CSV（確定申告の売上帳向け。年で絞る。Excel 用に BOM 付き）。kinds：数える種類（既定は請求書・領収書）
  function salesCsv(docs, year, opt = {}, kinds = SALES_KINDS) {
    const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const head = ["日付", "種類", "番号", "取引先", "件名", "税抜", "消費税", "源泉徴収", "税込", "差引", "入金", "入金日"];
    const rows = (docs || []).filter(d => String(d.date || "").startsWith(String(year)) && (!kinds || kinds.includes(d.kind))).sort((a, b) => (a.date + a.no).localeCompare(b.date + b.no)).map(d => {
      const c = calc(d.lines, docCalcOpt(d, opt));
      return [d.date, d.kind, d.no, d.to, d.subject, c.base, c.tax, c.wh, c.total, c.net, d.kind === "請求書" ? (d.paid ? "済" : "未") : "", d.kind === "請求書" && d.paid ? (d.paidAt || "") : ""].map(q).join(",");
    });
    return "﻿" + [head.map(q).join(","), ...rows].join("\r\n") + "\r\n";
  }

  // 復元の「追加」：同じ番号・同じ種類の書類は重ねない
  function mergeDocs(current, incoming) {
    const have = new Set(current.map(d => d.kind + "|" + d.no));
    return current.concat(incoming.filter(d => !have.has(d.kind + "|" + d.no)));
  }

  // 印影の文字割り：屋号・名前を 1〜4 行に割る（「株式会社」などの法人格は省かない。会社の印は法人格を含めるのが一般的）
  // 3 文字以下 1 行、6 以下 2 行、9 以下 3 行、それ以上 4 行（16 文字まで）
  function sealLines(name) {
    const s = String(name || "").replace(/\s+/g, "").slice(0, 16);
    if (!s) return [];
    const n = s.length <= 3 ? 1 : s.length <= 6 ? 2 : s.length <= 9 ? 3 : 4;
    const per = Math.ceil(s.length / n);
    return Array.from({ length: n }, (_, i) => s.slice(i * per, (i + 1) * per)).filter(Boolean);
  }
  // 角印の文字：縦書きで右の列から読む。「之印」を付けるときは末尾に足す
  const sealSquareText = (name, noin) => { const s = String(name || "").replace(/\s+/g, "").slice(0, 16); return s ? s + (noin ? "之印" : "") : ""; };
  const SEAL_FONTS = [["mincho", "明朝", '"Hiragino Mincho ProN","Hiragino Mincho Pro","Yu Mincho","YuMincho","MS Mincho",serif'], ["gothic", "ゴシック", '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif'], ["maru", "丸ゴシック", '"Hiragino Maru Gothic ProN","Hiragino Maru Gothic Pro","Yu Gothic","Meiryo",sans-serif']];

  // 印影のプリセット（印章店の見本の傾向を参考に：角印＝社名＋「之印」の縦書き 2〜3 列、丸印＝外周に社名・中央に役職、書体は篆書・印相・古印・楷書が主流。
  // 篆書・印相体は同梱できるライセンスのフォントが無いので、iOS 内蔵の明朝・ゴシック・丸ゴシックで枠・配置・かすれを変える）
  const SEAL_PRESETS = [
    ["kaku-classic", "角印・標準", { shape: "square", font: "mincho", stroke: 3.4, worn: false }],
    ["kaku-bold", "角印・太枠", { shape: "square", font: "gothic", stroke: 4.6, worn: false }],
    ["kaku-worn", "角印・かすれ", { shape: "square", font: "mincho", stroke: 3.2, worn: true }],
    ["maru-mawashi", "丸印・回し文字", { shape: "round", font: "mincho", stroke: 2.4, worn: false, mawashi: true }],
    ["maru-lines", "丸印・楷書風", { shape: "round", font: "mincho", stroke: 2.2, worn: false }],
    ["maru-modern", "丸印・細枠", { shape: "round", font: "maru", stroke: 1.4, worn: false, light: true }],
  ];
  // 丸印の中央の文字の既定：法人格で決める（印章店の慣行）
  const sealCenterDefault = name => /株式会社/.test(name || "") ? "代表取締役印" : /合同会社/.test(name || "") ? "代表社員之印" : /一般社団法人|一般財団法人|NPO法人|特定非営利活動法人/.test(name || "") ? "理事長印" : "代表者印";
  const sealPreset = id => SEAL_PRESETS.find(p => p[0] === id) || SEAL_PRESETS[0];

  // 軽減税率の印（※）を付ける税率か。settings.reduced（既定 [8]）
  const isReduced = (rate, reduced) => (Array.isArray(reduced) ? reduced : DEFAULT_REDUCED).map(Number).includes(Number(rate));

  // 一覧：月ごとにまとめる（新しい月が先）。合計は kinds（既定：請求書は差引額＋領収書）だけを数える。種類で絞っているときはその種類
  function groupByMonth(docs, opt, kinds = SALES_KINDS) {
    const m = new Map();
    (docs || []).slice().sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no)).forEach(d => {
      const k = String(d.date || "").slice(0, 7) || "日付なし";
      if (!m.has(k)) m.set(k, { month: k, docs: [], total: 0 });
      const g = m.get(k); g.docs.push(d);
      if (!kinds || kinds.includes(d.kind)) g.total += shownAmount(d, calc(d.lines, docCalcOpt(d, opt)));
    });
    return [...m.values()];
  }
  const monthTotalLabel = kindFilter => kindFilter ? `${kindFilter} 合計` : "請求・領収 合計";

  // 取引先：data.clients（名前・敬称・郵便番号・住所・部署・担当者）。入力中の文字で絞り込む（空なら直近 6、文字があれば一致 8）
  function clientSuggest(clients, q, recentLimit = 6, matchLimit = 8) {
    const list = (clients || []).filter(c => c && c.name).slice().sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")));
    const s = String(q || "").trim();
    if (!s) return list.slice(0, recentLimit);
    return list.filter(c => c.name !== s && [c.name, c.person, c.dept].some(x => String(x || "").includes(s))).slice(0, matchLimit);
  }
  // 書類の取引先欄から取引先の記録を作る（既存の記録に上書き）
  function clientFromDoc(doc, now = new Date()) {
    return { name: String(doc.to || "").trim(), honor: doc.honor || "御中", zip: doc.toZip || "", addr: doc.toAddr || "", dept: doc.toDept || "", person: doc.toPerson || "", last: typeof now === "string" ? now : now.toISOString() };
  }
  // 取引先の記録を書類に写す
  function applyClient(doc, c) {
    return Object.assign(doc, { to: c.name, honor: c.honor || "御中", toZip: c.zip || "", toAddr: c.addr || "", toDept: c.dept || "", toPerson: c.person || "" });
  }
  // 取引先・品目の履歴（新しい順、重複なし）
  function recentClients(docs, limit = 6) {
    const seen = new Map();
    (docs || []).slice().sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).forEach(d => { if (d.to && !seen.has(d.to)) seen.set(d.to, { name: d.to, honor: d.honor || "御中" }); });
    return [...seen.values()].slice(0, limit);
  }
  function recentItems(docs, limit = 8) {
    const seen = new Map();
    (docs || []).slice().sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).forEach(d => (d.lines || []).forEach(l => {
      const k = String(l.item || "").trim(); if (k && !seen.has(k) && !l.discount && lineAmount(l) >= 0) seen.set(k, { item: k, unit: l.unit || "", price: Number(l.price) || 0, rate: l.rate });
    }));
    return [...seen.values()].slice(0, limit);
  }

  // レビューのお願いの条件：PDF を作った直後、または 3 回目以降の起動で書類 3 枚以上。1 回だけ
  const shouldAskReview = ({ asked, launches, docs, exported }) => !asked && docs >= 3 && (exported || launches >= 3);

  // バックアップの注意：書類が 5 枚を超え、バックアップが無い／30 日より前
  function backupWarning(docsCount, lastBackup, now = new Date()) {
    if (docsCount < 5) return "";
    if (!lastBackup) return "書類が増えてきました。設定の「バックアップを書き出す」でファイルに保存しておくと、機種変更や削除でも消えません。";
    const days = Math.floor((now - new Date(lastBackup)) / 864e5);
    return days > 30 ? `最後のバックアップから ${days} 日たっています。設定から書き出しておくと安心です。` : "";
  }

  // 発行者（自分）の情報が未設定か（初回の導線）
  const meMissing = me => !me || !String(me.name || "").trim();

  // 書類の中身の確認（PDF にする前）
  function validate(doc, me) {
    const bad = [];
    if (!doc.to || !String(doc.to).trim()) bad.push("取引先名を入れてください");
    if (!(doc.lines || []).some(l => String(l.item || "").trim())) bad.push("品目を 1 行以上入れてください");
    if (me && me.reg && !isRegNo(me.reg)) bad.push("インボイス登録番号は T＋13 桁です（設定で直してください）");
    return bad;
  }

  const api = { KINDS, PREFIX, FREE_DOCS, TRASH_DAYS, SALES_KINDS, DEFAULT_REDUCED, DUE_LABEL, hasDue, isSubtotal, subtotals, moveLine, duplicateLine, purgeTrash, trashDaysLeft, matchDoc, salesCsv, COLORS, WH_LIMIT, roundBy, hasPrice, lineAmount, calc, docCalcOpt, shownAmount, nextNo, defaultDue, isOverdue, setPaid, isRegNo, normalizeRegNo, convert, canCreate, freeLeft, reviewUnlocked, applyReviewCode, isPro, backup, restore, mergeDocs, sealLines, sealSquareText, SEAL_FONTS, SEAL_PRESETS, sealPreset, sealCenterDefault, isReduced, groupByMonth, monthTotalLabel, clientSuggest, clientFromDoc, applyClient, recentClients, recentItems, shouldAskReview, backupWarning, meMissing, validate, fmtDate, yen, todayStr };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SeikyushoCore = api;
})(typeof window !== "undefined" ? window : globalThis);
