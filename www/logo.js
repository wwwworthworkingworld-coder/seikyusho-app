/* ロゴの自動生成（手続き型。端末内だけで完結、通信なし）。Node からも require できる。
   屋号から頭文字と文字組みを作り、型 × 色 × 書体の組み合わせを SVG で描く。アプリ側で PNG にして設定のロゴに入れる */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 色：主色・補助色・文字色（アプリの色テンプレと同じ系統＋2 つ）
  // 色：日本のビジネスロゴで定番の 2 色（主色・補助色・文字色）。調査 2026-11-19（02_画面設計.md 11 章）
  const PALETTES = [
    ["navy-gold", "ネイビー×ゴールド", "#0B1D3A", "#D4AF37", "#0B1D3A"],
    ["black-white", "黒×白", "#111111", "#888888", "#111111"],
    ["green-cream", "深緑×生成り", "#00552E", "#C9B99A", "#1f2a24"],
    ["wine-beige", "ワイン×ベージュ", "#640125", "#C9A27A", "#3a1f28"],
    ["navy-white", "ネイビー×白", "#223A70", "#6B86C4", "#223A70"],
    ["charcoal-orange", "チャコール×オレンジ", "#524E4D", "#ED6D3D", "#2b2928"],
    ["teal-white", "青緑×白", "#0E7C7B", "#6FC2C1", "#0E4F4E"],
    ["sumi-shu", "墨×朱", "#595857", "#EB6101", "#2f2e2d"],
  ];
  // 書体：iOS 内蔵（Hiragino）を基本に、Android・パソコンの代替を並べる
  const FONTS = [
    ["sans", "ゴシック太字", '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif', 800],
    ["maru", "丸ゴシック", '"Hiragino Maru Gothic ProN","Hiragino Maru Gothic Pro","Noto Sans JP","Yu Gothic","Meiryo",sans-serif', 700],
    ["mincho", "明朝", '"Hiragino Mincho ProN","Hiragino Mincho Pro","Noto Serif JP","Yu Mincho","YuMincho",serif', 700],
  ];
  // 型（調査 2026-11-19：日本の小規模事業は「シンプル・モノクロ・文字主体」が最多、次に和風、エンブレム。小さく白黒で印刷しても潰れないよう、グラデーション・細線は使わず 2 色まで）
  const TEMPLATES = [
    ["badge-circle", "丸バッジ＋屋号"],
    ["badge-square", "角丸スクエア＋屋号"],
    ["wordmark", "ワードマーク（下線）"],
    ["wordmark-frame", "ワードマーク（細枠）"],
    ["initial-stack", "頭文字＋屋号 2 段"],
    ["wafu-rakkan", "和風（落款つき）"],
    ["inverse", "反転色（濃い地に白）"],
    ["line-frame", "線の飾り枠"],
    ["hexagon", "六角形バッジ"],
    ["monogram", "頭文字だけ（正方形）"],
  ];

  // 法人格・敬称を除いた本体と、頭文字（英字なら単語の頭 1〜2 字、和文なら先頭 1〜2 字）
  function nameParts(name) {
    const raw = String(name || "").trim();
    const core = raw.replace(/^(株式会社|有限会社|合同会社|合資会社|一般社団法人|一般財団法人|特定非営利活動法人|NPO法人)\s*/, "").replace(/\s*(株式会社|有限会社|合同会社)$/, "").trim() || raw;
    let initials;
    const words = core.split(/[\s　・\-_/]+/).filter(Boolean);
    if (/^[A-Za-z0-9]/.test(core)) initials = words.slice(0, 2).map(w => w[0].toUpperCase()).join("");
    else initials = [...core].slice(0, core.length >= 4 ? 2 : 1).join("");
    return { raw, core, initials: initials || core.slice(0, 1), words };
  }

  // 乱数（seed があれば再現できる）
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function randomSpec(seed) {
    const r = rng(seed);
    return { template: TEMPLATES[Math.floor(r() * TEMPLATES.length)][0], palette: PALETTES[Math.floor(r() * PALETTES.length)][0], font: FONTS[Math.floor(r() * FONTS.length)][0], seed };
  }

  // 文字幅の見積もり（英数 0.62em、和文 1.0em）→ 文字の大きさを枠に合わせる
  const textWidth = (s, fs) => [...String(s)].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 0.62 : 1.0), 0) * fs;
  const fitSize = (s, maxW, maxFs, minFs = 8) => { let fs = maxFs; while (fs > minFs && textWidth(s, fs) > maxW) fs -= 1; return fs; };
  // 屋号を枠に収める：9 まで縮め、それでも入らなければ末尾を「…」にする
  function fitText(s, maxW, maxFs, minFs = 9) {
    let fs = fitSize(s, maxW, maxFs, minFs), t = String(s);
    while (t.length > 2 && textWidth(t, fs) > maxW) t = t.slice(0, -2) + "…";
    return { s: t, fs };
  }
  // 安全領域：横長 300×100 の 8%（左右 24、上下 8）。すべての図形と文字をこの中に収める
  const SAFE = { x0: 24, x1: 276, y0: 8, y1: 92 };

  /**
   * ロゴの SVG。横長（viewBox 300×100）。monogram だけ正方形（100×100）。
   * spec: { template, palette, font }
   */
  function logoSvg(name, spec = {}) {
    const { core, initials } = nameParts(name);
    if (!core) return "";
    const pal = PALETTES.find(p => p[0] === spec.palette) || PALETTES[0];
    const fnt = FONTS.find(f => f[0] === spec.font) || FONTS[0];
    const [, , main, sub, ink] = pal;
    const family = fnt[2], weight = fnt[3];
    const T = (x, y, s, fs, fill, anchor = "start", fam = family, extra = "") => `<text x="${x}" y="${y}" font-size="${fs}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central" style="font-family:${esc(fam)}"${extra}>${esc(s)}</text>`;
    const ini = initials.slice(0, 2);
    const { x0, x1 } = SAFE;
    // バッジ（左の図形）の寸法：中心 58、半径 34 → 24..92。屋号は 104 から右端まで
    const BC = 58, BR = 34, NX = 104, NW = x1 - NX;
    const iniIn = (box, max) => fitSize(ini, box, max);          // 図形の中の頭文字
    let inner = "", vb = "0 0 300 100";
    switch (spec.template) {
      case "badge-square": {
        const nm = fitText(core, NW, 30), fs = nm.fs, ifs = iniIn(BR * 2 - 10, 40);
        inner = `<rect x="${BC - BR}" y="${50 - BR}" width="${BR * 2}" height="${BR * 2}" rx="16" fill="${main}"/>${T(BC, 51, ini, ifs, "#fff", "middle")}${T(NX, 50, nm.s, fs, ink)}`; break;
      }
      case "wordmark": {
        const nm = fitText(core, x1 - x0, 40), fs = nm.fs; const w = Math.min(x1 - x0, textWidth(nm.s, fs));
        inner = `${T(150, 44, nm.s, fs, main, "middle")}<rect x="${(150 - w / 2).toFixed(1)}" y="70" width="${w.toFixed(1)}" height="6" rx="3" fill="${sub}"/>`; break;
      }
      case "wordmark-frame": {
        const nm = fitText(core, x1 - x0 - 40, 32), fs = nm.fs;
        inner = `<rect x="${x0}" y="16" width="${x1 - x0}" height="68" rx="12" fill="none" stroke="${main}" stroke-width="4"/>${T(150, 50, nm.s, fs, main, "middle")}`; break;
      }
      case "initial-stack": {
        // 頭文字は左の 24..100 に収め、仕切り線は 108、屋号は 118 から
        const ifs = fitSize(ini, 72, 54), nm = fitText(core, x1 - 118, 26), fs = nm.fs;
        const nw = Math.min(x1 - 118, textWidth(nm.s, fs));
        inner = `${T(62, 50, ini, ifs, main, "middle")}<rect x="107" y="26" width="2" height="48" fill="${sub}"/>${T(118, 42, nm.s, fs, ink)}<rect x="118" y="60" width="${nw.toFixed(1)}" height="3" fill="${sub}"/>`; break;
      }
      case "wafu-rakkan": {
        // 和風：明朝の屋号＋右に小さな朱の落款（頭文字）。筆文字・判子の需要に合わせる
        const fam = FONTS[2][2];
        const ls = core.length <= 8 ? 2 : 0;                     // 字間は短い屋号だけ
        const nm = fitText(core, x1 - x0 - 38 - ls * core.length, 34), fs = nm.fs;
        const w = textWidth(nm.s, fs) + ls * nm.s.length;
        const sx = 150 - (w + 38) / 2;
        inner = `${T(sx.toFixed(1), 52, nm.s, fs, ink, "start", fam, ls ? ' letter-spacing="2"' : "")}`
          + `<rect x="${(sx + w + 12).toFixed(1)}" y="37" width="26" height="26" rx="2" fill="${sub === "#888888" ? "#C0392B" : sub}"/>`
          + `${T((sx + w + 25).toFixed(1), 50.5, ini, ini.length > 1 ? 11 : 17, "#fff", "middle", fam)}`; break;
      }
      case "inverse": {
        const nm = fitText(core, x1 - x0 - 30, 34), fs = nm.fs;
        inner = `<rect x="${x0}" y="12" width="${x1 - x0}" height="76" rx="14" fill="${main}"/>${T(150, 50, nm.s, fs, "#fff", "middle")}`; break;
      }
      case "line-frame": {
        const nm = fitText(core, x1 - x0 - 88, 30), fs = nm.fs; const w = Math.min(x1 - x0 - 88, textWidth(nm.s, fs));
        const l = 150 - w / 2 - 12, r = 150 + w / 2 + 12;   // 文字の外側に 12 あけて線 24 と菱形
        inner = `${T(150, 50, nm.s, fs, ink, "middle")}<rect x="${(l - 24).toFixed(1)}" y="48.5" width="24" height="3" fill="${main}"/><rect x="${r.toFixed(1)}" y="48.5" width="24" height="3" fill="${main}"/>`
          + `<rect x="${(l - 30).toFixed(1)}" y="46" width="8" height="8" transform="rotate(45 ${(l - 26).toFixed(1)} 50)" fill="${sub}"/><rect x="${(r + 22).toFixed(1)}" y="46" width="8" height="8" transform="rotate(45 ${(r + 26).toFixed(1)} 50)" fill="${sub}"/>`; break;
      }
      case "hexagon": {
        const nm = fitText(core, NW, 30), fs = nm.fs, ifs = iniIn(BR * 2 - 14, 38);
        const pts = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k - Math.PI / 6; return `${(BC + BR * Math.cos(a)).toFixed(1)},${(50 + BR * Math.sin(a)).toFixed(1)}`; }).join(" ");
        inner = `<polygon points="${pts}" fill="${main}"/>${T(BC, 51, ini, ifs, "#fff", "middle")}${T(NX, 50, nm.s, fs, ink)}`; break;
      }
      case "monogram": {
        vb = "0 0 100 100";
        const ifs = fitSize(ini, 60, 52);
        inner = `<circle cx="50" cy="50" r="42" fill="${main}"/>${T(50, 51, ini, ifs, "#fff", "middle")}`; break;
      }
      default: {   // badge-circle
        const nm = fitText(core, NW, 30), fs = nm.fs, ifs = iniIn(BR * 2 - 14, 40);
        inner = `<circle cx="${BC}" cy="50" r="${BR}" fill="${main}"/>${T(BC, 51, ini, ifs, "#fff", "middle")}${T(NX, 50, nm.s, fs, ink)}`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${esc(core)}">${inner}</svg>`;
  }

  // 生成した SVG の外接枠を見積もる（試験用：すべての図形・文字が安全領域に収まるか）
  function logoBounds(svg) {
    let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const add = (x0, y0, x1, y1) => { b = { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) }; };
    const attr = (tag, k) => { const m = tag.match(new RegExp(` ${k}="([^"]*)"`)); return m ? m[1] : ""; };
    (svg.match(/<rect [^>]*>/g) || []).forEach(t => {
      const x = +attr(t, "x"), y = +attr(t, "y"), w = +attr(t, "width"), h = +attr(t, "height");
      const rot = attr(t, "transform").match(/rotate\(45 ([\d.]+) ([\d.]+)\)/);
      if (rot) { const cx = +rot[1], cy = +rot[2], d = Math.hypot(w, h) / 2; add(cx - d, cy - d, cx + d, cy + d); } else add(x, y, x + w, y + h);
    });
    (svg.match(/<circle [^>]*>/g) || []).forEach(t => { const cx = +attr(t, "cx"), cy = +attr(t, "cy"), r = +attr(t, "r"); add(cx - r, cy - r, cx + r, cy + r); });
    (svg.match(/<polygon [^>]*>/g) || []).forEach(t => attr(t, "points").split(" ").forEach(pt => { const [x, y] = pt.split(",").map(Number); add(x, y, x, y); }));
    (svg.match(/<text [^>]*>[^<]*<\/text>/g) || []).forEach(t => {
      const x = +attr(t, "x"), y = +attr(t, "y"), fs = +attr(t, "font-size"), anchor = attr(t, "text-anchor");
      const text = t.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      const w = textWidth(text, fs) + (+(attr(t, "letter-spacing") || 0)) * text.length;
      const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      add(left, y - fs / 2, left + w, y + fs / 2);
    });
    return b;
  }

  const api = { PALETTES, FONTS, TEMPLATES, SAFE, nameParts, randomSpec, logoSvg, logoBounds, textWidth };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SeikyushoLogo = api;
})(typeof window !== "undefined" ? window : globalThis);
