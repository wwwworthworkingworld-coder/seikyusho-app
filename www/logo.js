/* ロゴの自動生成（手続き型。端末内だけで完結、通信なし）。Node からも require できる。
   屋号から頭文字と文字組みを作り、型 × 色 × 書体の組み合わせを SVG で描く。アプリ側で PNG にして設定のロゴに入れる */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 色：主色・補助色・文字色（アプリの色テンプレと同じ系統＋2 つ）
  const PALETTES = [
    ["indigo", "インディゴ", "#3f51b5", "#8c9cf0", "#1f2430"],
    ["navy", "紺", "#1f4e8c", "#5b8dd6", "#1f2430"],
    ["green", "緑", "#1e7f6b", "#5fc4a8", "#1f2430"],
    ["wine", "ワイン", "#8b2942", "#d26a85", "#1f2430"],
    ["gray", "グレー", "#4a5568", "#a0aec0", "#1f2430"],
    ["mono", "黒", "#222222", "#888888", "#222222"],
  ];
  // 書体：iOS 内蔵（Hiragino）を基本に、Android・パソコンの代替を並べる
  const FONTS = [
    ["sans", "ゴシック太字", '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif', 800],
    ["maru", "丸ゴシック", '"Hiragino Maru Gothic ProN","Hiragino Maru Gothic Pro","Noto Sans JP","Yu Gothic","Meiryo",sans-serif', 700],
    ["mincho", "明朝", '"Hiragino Mincho ProN","Hiragino Mincho Pro","Noto Serif JP","Yu Mincho","YuMincho",serif', 700],
  ];
  // 型（2025〜26 年のロゴメーカーに多い形：太いサンセリフ、1〜2 色、余白、バッジ、角丸、頭文字＋ワードマーク、線の枠、グラデーション、反転）
  const TEMPLATES = [
    ["badge-circle", "丸バッジ＋屋号"],
    ["badge-square", "角丸スクエア＋屋号"],
    ["wordmark", "ワードマーク（下線）"],
    ["wordmark-frame", "ワードマーク（細枠）"],
    ["initial-stack", "頭文字＋屋号 2 段"],
    ["gradient-badge", "グラデーションの丸"],
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

  // 文字幅のざっくりした見積もり（英数 0.6em、和文 1em）→ 文字の大きさを枠に合わせる
  const textWidth = (s, fs) => [...String(s)].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 0.62 : 1.0), 0) * fs;
  const fitSize = (s, maxW, maxFs, minFs = 10) => { let fs = maxFs; while (fs > minFs && textWidth(s, fs) > maxW) fs -= 1; return fs; };

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
    const T = (x, y, s, fs, fill, anchor = "start", extra = "") => `<text x="${x}" y="${y}" font-size="${fs}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central" style="font-family:${esc(family)}"${extra}>${esc(s)}</text>`;
    const ini = initials, iniFs = ini.length > 1 ? 34 : 44;
    let inner = "", vb = "0 0 300 100";
    switch (spec.template) {
      case "badge-square": {
        const fs = fitSize(core, 190, 30);
        inner = `<rect x="8" y="14" width="72" height="72" rx="18" fill="${main}"/>${T(44, 51, ini, iniFs, "#fff", "middle")}${T(96, 50, core, fs, ink)}`; break;
      }
      case "wordmark": {
        const fs = fitSize(core, 270, 40); const w = Math.min(270, textWidth(core, fs));
        inner = `${T(150, 44, core, fs, ink, "middle")}<rect x="${150 - w / 2}" y="70" width="${w}" height="6" rx="3" fill="${main}"/>`; break;
      }
      case "wordmark-frame": {
        const fs = fitSize(core, 230, 32);
        inner = `<rect x="10" y="16" width="280" height="68" rx="12" fill="none" stroke="${main}" stroke-width="3"/>${T(150, 50, core, fs, main, "middle")}`; break;
      }
      case "initial-stack": {
        const fs = fitSize(core, 190, 26);
        inner = `${T(44, 50, ini, 56, main, "middle")}<rect x="86" y="24" width="2" height="52" fill="${sub}"/>${T(100, 40, core, fs, ink)}<rect x="100" y="62" width="${Math.min(190, textWidth(core, fs))}" height="3" fill="${sub}"/>`; break;
      }
      case "gradient-badge": {
        const fs = fitSize(core, 190, 30);
        inner = `<defs><linearGradient id="g${spec.seed || 0}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${sub}"/><stop offset="1" stop-color="${main}"/></linearGradient></defs><circle cx="46" cy="50" r="38" fill="url(#g${spec.seed || 0})"/>${T(46, 51, ini, iniFs, "#fff", "middle")}${T(96, 50, core, fs, ink)}`; break;
      }
      case "inverse": {
        const fs = fitSize(core, 250, 34);
        inner = `<rect x="4" y="12" width="292" height="76" rx="14" fill="${main}"/>${T(150, 50, core, fs, "#fff", "middle")}`; break;
      }
      case "line-frame": {
        const fs = fitSize(core, 210, 30); const w = Math.min(210, textWidth(core, fs));
        inner = `${T(150, 50, core, fs, ink, "middle")}<rect x="${150 - w / 2 - 34}" y="49" width="24" height="2" fill="${main}"/><rect x="${150 + w / 2 + 10}" y="49" width="24" height="2" fill="${main}"/><rect x="${150 - w / 2 - 28}" y="46" width="8" height="8" transform="rotate(45 ${150 - w / 2 - 24} 50)" fill="${main}"/><rect x="${150 + w / 2 + 20}" y="46" width="8" height="8" transform="rotate(45 ${150 + w / 2 + 24} 50)" fill="${main}"/>`; break;
      }
      case "hexagon": {
        const fs = fitSize(core, 190, 30);
        const pts = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k - Math.PI / 6; return `${(46 + 40 * Math.cos(a)).toFixed(1)},${(50 + 40 * Math.sin(a)).toFixed(1)}`; }).join(" ");
        inner = `<polygon points="${pts}" fill="${main}"/>${T(46, 51, ini, iniFs, "#fff", "middle")}${T(96, 50, core, fs, ink)}`; break;
      }
      case "monogram": {
        vb = "0 0 100 100";
        inner = `<circle cx="50" cy="50" r="46" fill="${main}"/>${T(50, 51, ini, ini.length > 1 ? 40 : 52, "#fff", "middle")}`; break;
      }
      default: {   // badge-circle
        const fs = fitSize(core, 190, 30);
        inner = `<circle cx="46" cy="50" r="38" fill="${main}"/>${T(46, 51, ini, iniFs, "#fff", "middle")}${T(96, 50, core, fs, ink)}`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${esc(core)}">${inner}</svg>`;
  }

  const api = { PALETTES, FONTS, TEMPLATES, nameParts, randomSpec, logoSvg, textWidth };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SeikyushoLogo = api;
})(typeof window !== "undefined" ? window : globalThis);
