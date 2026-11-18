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
.sheet .seal svg{width:22mm;height:22mm;display:block}
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

  // 印影を SVG で描く（プレビューと PDF で同じ見た目。枠・配置・かすれはプリセット、文字は屋号）
  let sealSeq = 0;
  function sealSvg(seal, size = "22mm") {
    if (!seal || seal.type !== "text") return "";
    const preset = C.sealPreset(seal.preset || (seal.shape === "square" ? "kaku-classic" : "maru-lines"))[2];
    const font = (C.SEAL_FONTS.find(f => f[0] === (seal.font || preset.font)) || C.SEAL_FONTS[0])[2];
    const red = preset.light ? "#e0493a" : "#d1352b";
    const id = "s" + (++sealSeq) + Math.random().toString(36).slice(2, 6);
    const text = String(seal.text || "").replace(/\s+/g, "").slice(0, 16);
    if (!text) return "";
    const E = esc;
    const vcol = (chars, x, fs, attrs = "") => { const top = 50 - chars.length * fs / 2; return [...chars].map((ch, i) => `<text x="${x}" y="${(top + i * fs + fs / 2).toFixed(1)}" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" style="font-family:${E(font)}" fill="${red}"${attrs}>${E(ch)}</text>`).join(""); };
    let body = "";
    if (preset.shape === "square") {
      const txt = seal.noin !== false ? text + "之印" : text;
      const cols = Math.max(1, Math.ceil(txt.length / 5));
      const per = Math.ceil(txt.length / cols);
      const fs = Math.min(30, Math.floor(72 / per));            // 1 列あたりの高さ 72 に収める（枠から 1 文字分あける）
      const gap = Math.min(30, 84 / cols);
      body += `<rect x="6" y="6" width="88" height="88" rx="2" fill="none" stroke="${red}" stroke-width="${preset.stroke}"/>`;
      for (let k = 0; k < cols; k++) {
        const x = 50 + (cols - 1) * gap / 2 - k * gap;          // 右の列から
        const col = txt.slice(k * per, (k + 1) * per);
        body += vcol(col, x, fs);
      }
    } else if (preset.mawashi) {
      // 外周に社名（上から時計回り）、中央に役職（縦書き 2 列）
      const center = String(seal.center || "代表取締役印").slice(0, 8);
      const n = text.length;
      const fs = Math.min(12.5, Math.floor(150 / Math.max(n, 6)));
      body += `<circle cx="50" cy="50" r="46" fill="none" stroke="${red}" stroke-width="${preset.stroke}"/>`;
      body += `<defs><path id="${id}p" d="M50,50 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0"/></defs>`;
      body += `<text font-size="${fs}" font-weight="700" fill="${red}" style="font-family:${E(font)};letter-spacing:${n > 8 ? 0 : 1}px"><textPath href="#${id}p" startOffset="25%" text-anchor="middle">${E(text)}</textPath></text>`;
      const cc = Math.ceil(center.length / 2), c1 = center.slice(0, cc), c2 = center.slice(cc);
      const cfs = Math.min(13, Math.floor(40 / Math.max(cc, 3)));
      body += vcol(c1, c2 ? 50 + cfs * 0.55 : 50, cfs);
      if (c2) body += vcol(c2, 50 - cfs * 0.55, cfs);
    } else {
      const lines = C.sealLines(text);
      const longest = Math.max(...lines.map(l => l.length));
      const fs = Math.min(Math.floor(64 / longest), Math.floor(64 / lines.length), 30);
      const lh = fs * 1.05, y0 = 50 - (lines.length - 1) * lh / 2 + fs * 0.36;
      body += `<circle cx="50" cy="50" r="46" fill="none" stroke="${red}" stroke-width="${preset.stroke}"/>`;
      lines.forEach((l, k) => { body += `<text x="50" y="${(y0 + k * lh).toFixed(1)}" font-size="${fs}" font-weight="700" text-anchor="middle" style="font-family:${E(font)}" fill="${red}">${E(l)}</text>`; });
    }
    // かすれ：ノイズで印面を少し欠けさせる
    const worn = preset.worn ? `<filter id="${id}w" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.1" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" class="seal-svg" aria-label="印影">${worn ? `<defs>${worn}</defs><g filter="url(#${id}w)" opacity=".92">${body}</g>` : `<g opacity=".92">${body}</g>`}</svg>`;
  }
  function sealHtml(seal) {
    if (!seal || seal.type === "none") return "";
    if (seal.type === "image" && seal.data) return `<div class="seal"><img src="${esc(seal.data)}" alt=""></div>`;
    if (seal.type === "text") { const svg = sealSvg(seal); return svg ? `<div class="seal">${svg}</div>` : ""; }
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

  const api = { CSS, paperHtml, pdfDocument, pdfFileName, sealSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SeikyushoPaper = api;
})(typeof window !== "undefined" ? window : globalThis);
