/* 書類（A4）の HTML。アプリのプレビューと PDF の両方で同じものを使う。Node からも require できる */
(function (root) {
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SeikyushoCore;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const br = s => esc(s).replace(/\n/g, "<br>");
  const COLOR = Object.fromEntries(C.COLORS.map(([k, , hex]) => [k, hex]));

  const TITLE = { "見積書": "御 見 積 書", "納品書": "納 品 書", "請求書": "請 求 書", "領収書": "領 収 書" };
  const GREET = { "見積書": "下記のとおりお見積り申し上げます。", "納品書": "下記のとおり納品いたしました。", "請求書": "下記のとおりご請求申し上げます。", "領収書": "下記の金額を正に領収いたしました。" };
  const LABEL = { "見積書": "お見積金額", "納品書": "合計金額", "請求書": "ご請求金額", "領収書": "領収金額" };

  // 書類のスタイル。mm で固定し、表の列幅も固定（PDF で幅がずれないため）
  const CSS = `
.sheet{box-sizing:border-box;width:210mm;min-height:297mm;padding:16mm 16mm 14mm;background:#fff;color:#222;font-family:-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;font-size:10.5pt;line-height:1.55;position:relative;--c:#1f4e8c}
.sheet *{box-sizing:border-box}
.sheet h1{margin:0 0 7mm;text-align:center;font-size:22pt;letter-spacing:.35em;font-weight:700;color:var(--c)}
.sheet .top{display:flex;justify-content:space-between;gap:8mm}
.sheet .left{width:100mm}
.sheet .right{width:70mm;text-align:left;font-size:9.5pt;position:relative}
.sheet .to{font-size:14pt;font-weight:700;border-bottom:1.5pt solid #333;padding-bottom:1mm;margin-bottom:3mm;word-break:break-all}
.sheet .to small{font-size:11pt;font-weight:400;margin-left:2mm}
.sheet .meta div{margin:0 0 1mm}
.sheet .me{margin-top:3mm;padding-right:24mm}
.sheet .me b{font-size:11.5pt}
.sheet .logo{max-width:40mm;max-height:14mm;display:block;margin-bottom:2mm}
.sheet .seal{position:absolute;right:0;top:9mm;width:22mm;height:22mm}
.sheet .seal img{width:22mm;height:22mm;object-fit:contain;mix-blend-mode:multiply}
.sheet .seal-text{box-sizing:border-box;width:22mm;height:22mm;border:1.3pt solid #d1352b;border-radius:50%;color:#d1352b;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;line-height:1.02;letter-spacing:0;padding:0.6mm;opacity:.92;overflow:hidden}
.sheet .seal-text span{display:block;white-space:nowrap}
.sheet .seal-text.square{border-radius:1pt;flex-direction:row-reverse;align-items:center;justify-content:center;padding:1mm;line-height:1.0}
.sheet .seal-text.square span{display:block;writing-mode:vertical-rl;text-orientation:upright;white-space:nowrap;margin:0 0.3mm;letter-spacing:0.02em}
.sheet .amount{margin:6mm 0 4mm;font-size:11pt;font-weight:700;display:flex;align-items:flex-end;gap:4mm}
.sheet .amount b{font-size:20pt;border-bottom:1.5pt solid #333;min-width:70mm;padding:0 2mm 0.5mm;text-align:right;font-variant-numeric:tabular-nums}
.sheet .amount small{font-weight:400;font-size:9pt}
.sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.5pt}
.sheet thead th{background:var(--c);color:#fff;padding:1.8mm 1.5mm;font-weight:700;text-align:center;border:0.4pt solid var(--c);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet tbody td{border-bottom:0.4pt solid #9aa5b5;padding:1.8mm 1.5mm;vertical-align:top;word-break:break-all;overflow-wrap:anywhere}
.sheet tbody tr.blank td{height:7.2mm}
.sheet td.n,.sheet th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sheet td.c{text-align:center}
.sheet .col-no{width:9mm}.sheet .col-item{width:auto}.sheet .col-qty{width:14mm}.sheet .col-unit{width:14mm}.sheet .col-price{width:26mm}.sheet .col-amt{width:30mm}
.sheet .bottom{display:flex;gap:6mm;margin-top:4mm;align-items:flex-start}
.sheet .breakdown{flex:1;font-size:9pt;color:#333}
.sheet .breakdown div{margin-bottom:0.8mm}
.sheet .sums{width:84mm;border-collapse:collapse;table-layout:fixed}
.sheet .sums td{border:0.3pt solid #c9d1dc;padding:1.6mm 2mm;font-size:9.5pt}
.sheet .sums td:first-child{width:42mm;background:#f2f4f7}
.sheet .sums tr.grand td{font-weight:700;background:#fff;border-top:1pt solid var(--c)}
.sheet .foot{margin-top:5mm;font-size:9.5pt}
.sheet .foot .box{border:0.3pt solid #c9d1dc;border-left:3pt solid var(--c);padding:2mm 3mm;margin-top:2mm;background:#fafbfc}
.sheet .foot .memo{margin-top:3mm;white-space:pre-wrap}
.sheet .note{font-size:8.5pt;color:#555;margin-top:2mm}
.sheet .stamp-area{margin-top:3mm;font-size:8.5pt;color:#555}
.sheet.mono{--c:#222}
.sheet.mono thead th{background:#fff;color:#222;border:0.3pt solid #222;border-bottom:1pt solid #222}
.sheet.mono .sums td:first-child{background:#fff}
`;

  function sealHtml(seal) {
    if (!seal || seal.type === "none") return "";
    if (seal.type === "image" && seal.data) return `<div class="seal"><img src="${esc(seal.data)}" alt=""></div>`;
    if (seal.type === "text") {
      const font = (C.SEAL_FONTS.find(f => f[0] === seal.font) || C.SEAL_FONTS[0])[2];
      if (seal.shape === "square") {
        const txt = C.sealSquareText(seal.text, seal.noin !== false);
        if (!txt) return "";
        // 角印：縦書き。文字数で列数と大きさを決める（1 列 4〜5 文字）
        const cols = Math.max(1, Math.ceil(txt.length / 5));
        const per = Math.ceil(txt.length / cols);
        const colsHtml = Array.from({ length: cols }, (_, i) => `<span>${esc(txt.slice(i * per, (i + 1) * per))}</span>`).join("");
        const size = per <= 3 ? 15 : per <= 4 ? 12.5 : per <= 5 ? 10.5 : 9;
        return `<div class="seal"><div class="seal-text square" style="font-size:${size}pt;font-family:${font}">${colsHtml}</div></div>`;
      }
      const lines = C.sealLines(seal.text || "");
      if (!lines.length) return "";
      const longest = Math.max(...lines.map(l => l.length));
      // 丸印：行数と 1 行の文字数から、枠いっぱいに近い大きさにする
      const size = lines.length === 1 ? (longest <= 2 ? 20 : 16) : lines.length === 2 ? (longest <= 2 ? 15 : 12.5) : lines.length === 3 ? 10.5 : 8.5;
      return `<div class="seal"><div class="seal-text" style="font-size:${size}pt;font-family:${font}">${lines.map(l => `<span>${esc(l)}</span>`).join("")}</div></div>`;
    }
    return "";
  }

  /**
   * 書類の中身（<div class="sheet">…</div>）。
   * doc: 書類、me: 自分の情報、opt: { color, rounding, seal, logo }
   */
  function paperHtml(doc, me = {}, opt = {}) {
    const taxable = me.taxable !== false;
    const c = C.calc(doc.lines, { taxable, rounding: opt.rounding || "floor", withholding: !!doc.wh });
    const color = COLOR[opt.color] || COLOR.navy;
    const kind = doc.kind || "請求書";
    const shown = C.shownAmount(doc, c);
    const minRows = 8;
    const rows = c.lines.map((l, i) => `<tr><td class="c">${l.rate === 8 ? "※" : ""}${i + 1}</td><td>${esc(l.item)}</td>` +
      `<td class="n">${l.qty !== "" && l.qty !== undefined ? esc(Number(l.qty).toLocaleString("ja-JP")) : ""}</td><td class="c">${esc(l.unit || "")}</td>` +
      `<td class="n">${C.yen(l.price)}</td><td class="n">${C.yen(l.amount)}</td></tr>`).join("")
      + Array.from({ length: Math.max(0, minRows - c.lines.length) }, () => `<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");
    const sums = [["小計（税抜）", c.base]];
    if (taxable) c.byRate.forEach(g => sums.push([`消費税（${g.rate}%）`, g.tax]));
    sums.push(["合計", c.total, !doc.wh]);
    if (doc.wh) { sums.push(["源泉徴収税額", -c.wh]); sums.push(["差引お支払額", c.net, true]); }
    const breakdown = taxable
      ? c.byRate.map(g => `<div>${g.rate}%対象 ${C.yen(g.base)}円　消費税 ${C.yen(g.tax)}円${g.rate === 8 ? "（※は軽減税率対象）" : ""}</div>`).join("") + (c.exempt ? `<div>対象外 ${C.yen(c.exempt)}円</div>` : "")
      : `<div>※当方は免税事業者のため、消費税額は記載していません。</div>`;
    let foot = "";
    if (kind === "請求書") foot = `<div class="box">${me.bank ? `<div>お振込先：${br(me.bank)}</div>` : ""}${doc.due ? `<div>お支払期限：${C.fmtDate(doc.due)}</div>` : ""}<div class="note">恐れ入りますが、振込手数料はご負担をお願いいたします。</div></div>`;
    else if (kind === "見積書") foot = doc.due ? `<div>有効期限：${C.fmtDate(doc.due)}</div>` : "";
    else if (kind === "領収書") foot = `<div>但し、${esc(doc.subject || "お品代")}として</div>` + (shown >= 50000 ? `<div class="stamp-area">収入印紙（紙で渡す場合）：</div>` : "");
    const regLine = taxable && me.reg ? `<div>登録番号 ${esc(C.normalizeRegNo(me.reg))}</div>` : "";
    return `<div class="sheet ${opt.color === "mono" ? "mono" : ""}" style="--c:${color}">
<h1>${TITLE[kind] || esc(kind)}</h1>
<div class="top">
  <div class="left">
    <div class="to">${esc(doc.to || "（取引先名）")}<small>${esc(doc.honor || "御中")}</small></div>
    ${doc.subject && kind !== "領収書" ? `<div>件名：${esc(doc.subject)}</div>` : ""}
    <div>${GREET[kind] || ""}</div>
  </div>
  <div class="right">
    <div class="meta">${doc.no ? `<div>No. ${esc(doc.no)}</div>` : ""}${doc.date ? `<div>発行日 ${C.fmtDate(doc.date)}</div>` : ""}</div>
    <div class="me">${opt.logo ? `<img class="logo" src="${esc(opt.logo)}" alt="">` : ""}<b>${esc(me.name || "")}</b>${me.addr ? `<div>${br(me.addr)}</div>` : ""}${me.tel ? `<div>TEL ${esc(me.tel)}</div>` : ""}${me.mail ? `<div>${esc(me.mail)}</div>` : ""}${regLine}</div>
    ${sealHtml(opt.seal)}
  </div>
</div>
<div class="amount">${LABEL[kind] || "金額"}<b>¥${C.yen(shown)}-</b>${taxable ? "<small>（税込）</small>" : ""}</div>
<table>
<colgroup><col class="col-no"><col class="col-item"><col class="col-qty"><col class="col-unit"><col class="col-price"><col class="col-amt"></colgroup>
<thead><tr><th>No.</th><th>品目</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="bottom">
  <div class="breakdown">${breakdown}</div>
  <table class="sums">${sums.map(([k, v, grand]) => `<tr${grand ? ' class="grand"' : ""}><td>${k}</td><td class="n">${v < 0 ? "−" : ""}¥${C.yen(Math.abs(v))}</td></tr>`).join("")}</table>
</div>
<div class="foot">${foot}${doc.memo ? `<div class="memo">備考：${br(doc.memo)}</div>` : ""}</div>
</div>`;
  }

  // PDF 用：1 つの HTML 文書に包む（iOS 側が WKWebView に読み込む）
  function pdfDocument(inner) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}${CSS}
.sheet{min-height:0;page-break-after:always}.sheet:last-child{page-break-after:auto}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>${inner}</body></html>`;
  }

  const pdfFileName = doc => `${doc.kind || "書類"}_${String(doc.no || "").replace(/[\\/:*?"<>|\s]/g, "")}_${String(doc.to || "").replace(/[\\/:*?"<>|\s]/g, "").slice(0, 20)}.pdf`;

  const api = { CSS, paperHtml, pdfDocument, pdfFileName };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SeikyushoPaper = api;
})(typeof window !== "undefined" ? window : globalThis);
