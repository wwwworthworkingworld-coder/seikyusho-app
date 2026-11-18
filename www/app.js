(async () => {
  const C = window.SeikyushoCore, Paper = window.SeikyushoPaper;
  const KEY = "seikyusho-app-v1";
  const PRODUCT_ID = "com.company256.seikyusho.pro";
  const PRIVACY_URL = "https://256company.com/seikyusho-app-privacy.html";
  const SUPPORT_URL = "https://256company.com/seikyusho-app-support.html";
  const REVIEW_URL = "https://apps.apple.com/jp/app/id6835948237?action=write-review";
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const P = native ? window.Capacitor.Plugins : {};
  const store = () => window.SeikyushoStoreMock || P.SeikyushoStore;
  const pdfPlugin = () => window.SeikyushoPdfMock || P.SeikyushoPdf;
  const $ = id => document.getElementById(id);
  const yen = v => (v < 0 ? "−¥" : "¥") + C.yen(Math.abs(v));
  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const COLOR_HEX = Object.fromEntries(C.COLORS.map(([k, , hex]) => [k, hex]));
  const KIND_COLOR = { "見積書": "#5a7d9a", "納品書": "#6b8e5a", "請求書": "#3f51b5", "領収書": "#8b2942" };

  // ---- 保存（アプリ専用の領域。この端末の中だけ）
  const EMPTY = () => ({ docs: [], clients: [], items: [], me: { name: "", addr: "", tel: "", mail: "", reg: "", taxable: true, bank: "" },
    settings: { rounding: "floor", rates: [10, 8], defaultRate: 10, color: "navy", seal: { type: "none" }, logo: "", prefix: Object.assign({}, C.PREFIX), yearInNo: true, created: 0, lastBackup: "", launches: 0, reviewAsked: false } });
  async function load() {
    try {
      const raw = native ? (await P.Preferences.get({ key: KEY })).value : localStorage.getItem(KEY);
      const d = Object.assign(EMPTY(), JSON.parse(raw || "{}"));
      d.me = Object.assign(EMPTY().me, d.me || {}); d.settings = Object.assign(EMPTY().settings, d.settings || {});
      d.settings.prefix = Object.assign({}, C.PREFIX, d.settings.prefix || {});
      if (!Array.isArray(d.settings.rates) || !d.settings.rates.length) d.settings.rates = [10, 8];
      return d;
    } catch (e) { return EMPTY(); }
  }
  let saveTimer;
  async function save(now) {
    clearTimeout(saveTimer);
    const run = async () => {
      const value = JSON.stringify(data);
      try { if (native) await P.Preferences.set({ key: KEY, value }); else localStorage.setItem(KEY, value); }
      catch (e) { toast("保存できませんでした"); }
    };
    if (now) return run();
    saveTimer = setTimeout(run, 400);
  }

  let data = await load();
  let cur = null;              // 編集中の書類（data.docs の中のオブジェクト）
  let purchased = false;
  let kindFilter = "", search = "";
  let tId;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tId); tId = setTimeout(() => t.classList.remove("show"), 2400); }
  const calcOpt = doc => ({ taxable: data.me.taxable !== false, rounding: data.settings.rounding, withholding: !!(doc && doc.wh) });
  const paperOpt = () => ({ color: purchased ? data.settings.color : "navy", rounding: data.settings.rounding, seal: purchased ? data.settings.seal : { type: "none" }, logo: purchased ? data.settings.logo : "" });

  // ---- 画面の切り替え
  const TITLES = { docs: "書類", edit: "作る", settings: "設定" };
  function showTab(name) {
    Object.keys(TITLES).forEach(k => { $("tab-" + k).hidden = k !== name; });
    document.querySelectorAll(".tabs button").forEach(b => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("title").textContent = name === "edit" && cur ? (cur.kind + (cur.isNew ? "を作る" : "")) : TITLES[name];
    $("totalbar").hidden = name !== "edit";
    $("fabbar").hidden = name !== "docs";
    $("scroll").scrollTop = 0;
    if (name === "docs") renderDocs();
    if (name === "settings") renderSettings();
    if (name === "edit") { if (!cur) newDoc("請求書"); else renderEdit(); }
    renderBadge();
  }
  document.querySelectorAll(".tabs button").forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

  function chips(el, list, selected, onPick, extra) {
    el.innerHTML = "";
    list.forEach(([value, label, cls]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip" + (cls ? " " + cls : ""); b.innerHTML = label;
      b.setAttribute("aria-pressed", String(selected === value));
      b.onclick = () => onPick(value);
      el.appendChild(b);
    });
    if (extra) el.appendChild(extra);
  }
  function renderBadge() {
    const b = $("freeBadge");
    b.hidden = purchased; if (!purchased) b.textContent = `無料であと ${C.freeLeft(data.settings)} 枚`;
  }

  // ---- 書類（ホーム）
  function renderDocs() {
    const empty = data.docs.length === 0;
    $("emptyDocs").hidden = !empty; $("docsBody").hidden = empty;
    const w = C.backupWarning(data.docs.length, data.settings.lastBackup);
    $("backupWarn").hidden = !w; $("backupWarn").textContent = w;
    if (empty) return;
    chips($("kindFilter"), [["", "すべて"], ...C.KINDS.map(k => [k, k])], kindFilter, v => { kindFilter = v; renderDocs(); });
    const q = search.trim();
    const docs = data.docs.filter(d => (!kindFilter || d.kind === kindFilter) && (!q || (d.to || "").includes(q) || (d.subject || "").includes(q) || (d.no || "").includes(q)));
    const groups = C.groupByMonth(docs, calcOpt());
    const box = $("docList"); box.innerHTML = "";
    if (!groups.length) { box.innerHTML = '<ul class="doclist"><li class="empty">見つかりませんでした</li></ul>'; return; }
    groups.forEach(g => {
      const h = document.createElement("div"); h.className = "month";
      h.innerHTML = `<span>${g.month.replace("-", "年")}月　${g.docs.length}件</span><b>${yen(g.total)}</b>`;
      box.appendChild(h);
      const ul = document.createElement("ul"); ul.className = "doclist";
      g.docs.forEach(d => {
        const c = C.calc(d.lines, calcOpt(d));
        const li = document.createElement("li");
        li.innerHTML = `<span class="k" style="background:${KIND_COLOR[d.kind]}">${esc(d.kind)}</span>`
          + `<span class="t"><div>${esc(d.to || "（取引先なし）")}${d.subject ? "　" + esc(d.subject) : ""}</div><small>${esc(d.no)}　${esc((d.date || "").replace(/-/g, "/"))}</small></span>`
          + `<span class="a">${yen(C.shownAmount(d, c))}${d.kind === "請求書" ? `<small class="${d.paid ? "" : "unpaid"}">${d.paid ? "入金済み" : "未入金"}</small>` : ""}</span>`;
        li.onclick = () => openDoc(d.id);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    });
  }
  $("search").oninput = e => { search = e.target.value; renderDocs(); };
  $("createBtn").onclick = () => { if (!tryCreate()) return; newDoc("請求書"); showTab("edit"); };
  $("firstCreate").onclick = () => { newDoc("請求書"); showTab("edit"); };

  // 無料枚数の確認：作れないときは購入のシートを出す
  function tryCreate() {
    if (C.canCreate(data.settings, purchased)) return true;
    openPay("無料で作れるのは 3 枚までです");
    return false;
  }

  // ---- 作る（編集）
  function blankLine(rate) { return { item: "", qty: 1, unit: "", price: "", rate: rate === undefined ? data.settings.defaultRate : rate }; }
  function newDoc(kind) {
    const date = today();
    cur = { id: newId(), kind, no: C.nextNo(data.docs, kind, data.settings), date, due: C.defaultDue(kind, date), to: "", honor: "御中", subject: "", wh: false, memo: "",
      lines: [blankLine()], paid: false, updated: new Date().toISOString(), isNew: true };
    renderEdit();
  }
  function openDoc(id) { cur = data.docs.find(d => d.id === id); if (!cur) return; cur.isNew = false; showTab("edit"); }
  // 入力のたびに保存。新しい書類は、取引先か品目が入った時点で一覧に入る（累計枚数も数える）
  function commit() {
    if (!cur) return;
    cur.updated = new Date().toISOString();
    const has = (cur.to && cur.to.trim()) || cur.lines.some(l => String(l.item || "").trim());
    if (cur.isNew && has) {
      if (!C.canCreate(data.settings, purchased)) { openPay("無料で作れるのは 3 枚までです"); return; }
      cur.isNew = false; delete cur.isNew;
      data.docs.push(cur); data.settings.created = (Number(data.settings.created) || 0) + 1;
      $("title").textContent = cur.kind; renderBadge();
    }
    if (cur.to && cur.to.trim()) {
      const i = data.clients.findIndex(x => x.name === cur.to.trim());
      const rec = { name: cur.to.trim(), honor: cur.honor, last: cur.updated };
      if (i >= 0) data.clients[i] = rec; else data.clients.push(rec);
    }
    save();
    renderTotal();
  }
  function renderEdit() {
    const d = cur;
    chips($("kindChips"), C.KINDS.map(k => [k, k]), d.kind, k => {
      const old = d.kind; d.kind = k;
      if (!d.no || d.no.startsWith((data.settings.prefix[old] || C.PREFIX[old]) + "-")) d.no = C.nextNo(data.docs.filter(x => x !== d), k, data.settings);
      d.due = C.defaultDue(k, d.date); commit(); renderEdit();
    });
    const clients = C.recentClients(data.docs, 6);
    $("clientChips").innerHTML = "";
    chips($("clientChips"), clients.map(c => [c.name, esc(c.name)]), d.to, name => { const c = clients.find(x => x.name === name); d.to = name; d.honor = c.honor || "御中"; commit(); renderEdit(); });
    $("clientChips").hidden = !clients.length;
    $("to").value = d.to || ""; $("honor").value = d.honor || "御中";
    $("no").value = d.no || ""; $("date").value = d.date || ""; $("due").value = d.due || "";
    $("dueWrap").hidden = !(d.kind === "請求書" || d.kind === "見積書");
    $("dueLabel").textContent = d.kind === "見積書" ? "有効期限" : "お支払期限";
    $("subjectLabel").innerHTML = d.kind === "領収書" ? '但し書き <small>「〇〇として」の〇〇</small>' : '件名 <small>任意</small>';
    $("subject").value = d.subject || "";
    $("wh").checked = !!d.wh; $("memo").value = d.memo || "";
    const items = C.recentItems(data.docs, 8);
    chips($("itemChips"), items.map(it => [it.item, esc(it.item)]), null, name => {
      const it = items.find(x => x.item === name);
      const empty = d.lines.find(l => !String(l.item || "").trim());
      const l = empty || blankLine(); if (!empty) d.lines.push(l);
      Object.assign(l, { item: it.item, unit: it.unit, price: it.price, rate: it.rate === undefined ? data.settings.defaultRate : it.rate, qty: l.qty || 1 });
      commit(); renderLines();
    });
    $("itemChips").hidden = !items.length;
    renderLines();
    // 引き継ぎ：他の 3 種類すべてへ（見積書から請求書へ直接など）。流れの順に並べる
    const box = $("convertBox"); box.innerHTML = "";
    C.KINDS.filter(k => k !== d.kind).forEach(k => {
      const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = `この内容で${k}を作る`;
      b.onclick = () => convertTo(k); box.appendChild(b);
    });
    $("paidBtn").hidden = d.kind !== "請求書"; $("paidBtn").textContent = d.paid ? "未入金に戻す" : "入金済みにする";
    $("docActions").hidden = !!d.isNew;
    renderTotal();
  }
  function renderLines() {
    const box = $("lines"); box.innerHTML = "";
    const rates = data.settings.rates.slice().sort((a, b) => b - a);
    cur.lines.forEach((l, i) => {
      const div = document.createElement("div"); div.className = "line" + (Number(l.price) < 0 ? " discount" : "");
      div.innerHTML = `<div class="l1"><input class="item" type="text" maxlength="60" placeholder="${Number(l.price) < 0 ? "値引きの名目" : "品目（例：デザイン制作）"}" value="${esc(l.item)}"><button type="button" class="del" aria-label="この行を消す">×</button></div>
        <div class="l2"><input class="qty" type="number" inputmode="decimal" step="any" placeholder="数量" value="${esc(l.qty)}"><input class="unit" type="text" maxlength="6" placeholder="単位" value="${esc(l.unit)}"><input class="price" type="number" inputmode="numeric" step="1" placeholder="単価（税抜）" value="${esc(l.price)}"></div>
        <div class="l3"><div class="chips rates"></div><span class="amt ${C.lineAmount(l) < 0 ? "minus" : ""}">${yen(C.lineAmount(l))}</span></div>`;
      chips(div.querySelector(".rates"), [...rates.map(r => [r, `${r}%`]), [null, "対象外"]], l.rate === "" || l.rate === undefined ? null : l.rate, r => { l.rate = r; commit(); renderLines(); });
      const upd = () => {
        l.item = div.querySelector(".item").value; l.unit = div.querySelector(".unit").value;
        l.qty = div.querySelector(".qty").value === "" ? "" : Number(div.querySelector(".qty").value);
        l.price = div.querySelector(".price").value === "" ? "" : Number(div.querySelector(".price").value);
        div.querySelector(".amt").textContent = yen(C.lineAmount(l)); div.querySelector(".amt").className = "amt" + (C.lineAmount(l) < 0 ? " minus" : "");
        commit();
      };
      div.querySelectorAll("input").forEach(e => e.addEventListener("input", upd));
      div.querySelector(".del").onclick = () => { cur.lines.splice(i, 1); if (!cur.lines.length) cur.lines.push(blankLine()); commit(); renderLines(); };
      box.appendChild(div);
    });
  }
  function renderTotal() {
    if (!cur) return;
    const c = C.calc(cur.lines, calcOpt(cur));
    const shown = C.shownAmount(cur, c);
    $("tbLabel").textContent = cur.kind === "請求書" && cur.wh ? "差引お支払額" : data.me.taxable === false ? "合計" : "合計（税込）";
    $("tbTotal").textContent = yen(shown);
  }
  $("addLine").onclick = () => { cur.lines.push(blankLine()); renderLines(); setTimeout(() => { const els = $("lines").querySelectorAll(".item"); els[els.length - 1].focus(); }, 30); };
  $("addDiscount").onclick = () => { cur.lines.push({ item: "値引き", qty: 1, unit: "", price: "", rate: data.settings.defaultRate }); commit(); renderLines(); setTimeout(() => { const els = $("lines").querySelectorAll(".price"); els[els.length - 1].focus(); }, 30); };
  ["to", "no", "date", "due", "subject", "memo"].forEach(k => { $(k).addEventListener("input", () => { cur[k] = $(k).value; if (k === "date" && cur.kind !== "領収書" && cur.kind !== "納品書") { cur.due = C.defaultDue(cur.kind, cur.date); $("due").value = cur.due; } commit(); }); });
  $("honor").onchange = () => { cur.honor = $("honor").value; commit(); };
  $("wh").onchange = () => { cur.wh = $("wh").checked; commit(); };
  function convertTo(next) {
    if (!next || next === cur.kind) return;
    if (!tryCreate()) return;
    const n = C.convert(cur, next, data.docs, data.settings, new Date(), newId());
    delete n.isNew; data.docs.push(n); data.settings.created = (Number(data.settings.created) || 0) + 1; save();
    cur = n; renderEdit(); $("title").textContent = cur.kind; $("scroll").scrollTop = 0; renderBadge();
    toast(`${cur.from} と同じ内容で ${next} ${cur.no} を作りました`);
  };
  $("paidBtn").onclick = () => { cur.paid = !cur.paid; commit(); renderEdit(); toast(cur.paid ? "入金済みにしました" : "未入金に戻しました"); };
  $("dupBtn").onclick = () => {
    if (!tryCreate()) return;
    const n = C.convert(cur, cur.kind, data.docs, data.settings, new Date(), newId()); delete n.from; delete n.isNew;
    data.docs.push(n); data.settings.created = (Number(data.settings.created) || 0) + 1; save();
    cur = n; renderEdit(); $("scroll").scrollTop = 0; renderBadge(); toast(`複製しました（${cur.no}）`);
  };
  $("deleteBtn").onclick = () => {
    if (!confirm(`${cur.kind} ${cur.no} を削除しますか？`)) return;
    data.docs = data.docs.filter(d => d.id !== cur.id); save(true); cur = null; showTab("docs"); toast("削除しました");
  };

  // ---- プレビュー・PDF
  let previewing = false;
  let zoom = 1, baseScale = 1;
  function layoutPreview() {
    const scale = $("previewScale"), wrap = $("previewWrap");
    const pxPerMm = 96 / 25.4, sheetW = 210 * pxPerMm;
    const s = baseScale * zoom;
    const h = Math.max(297 * pxPerMm, scale.firstElementChild ? scale.firstElementChild.offsetHeight : 0);
    scale.style.transform = `scale(${s})`; scale.style.width = sheetW + "px";
    // 拡大した分だけ外枠を広げて、指でスクロールできるようにする
    wrap.style.width = Math.round(sheetW * s) + "px"; wrap.style.height = Math.round(h * s) + "px";
    $("previewInfo").textContent = zoom > 1.05 ? `A4 ×${zoom.toFixed(1)}` : "A4";
  }
  function renderPreview() {
    const scale = $("previewScale");
    scale.innerHTML = Paper.paperHtml(cur, data.me, paperOpt());
    const w = $("previewBody").clientWidth - 24;
    baseScale = Math.min(1, w / (210 * 96 / 25.4));
    layoutPreview();
    $("stampNote").hidden = !(cur.kind === "領収書" && C.shownAmount(cur, C.calc(cur.lines, calcOpt(cur))) >= 50000);
    chips($("previewColors"), C.COLORS.map(([k, label, hex]) => [k, `<span class="sw" style="background:${hex}"></span>${label}`, purchased ? "" : "lock"]), paperOpt().color, k => {
      if (!purchased) { openPay("色テンプレは購入後に使えます"); return; }
      data.settings.color = k; save(); renderPreview();
    });
  }
  // 指 2 本で拡大・縮小（1〜4 倍）。ダブルタップで 2 倍⇔元に戻す。PDF の見た目には影響しない
  (() => {
    const body = $("previewBody");
    let d0 = 0, z0 = 1, lastTap = 0;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    body.addEventListener("touchstart", e => {
      if (e.touches.length === 2) { d0 = dist(e.touches); z0 = zoom; }
      else if (e.touches.length === 1) { const now = Date.now(); if (now - lastTap < 300) { zoom = zoom > 1.05 ? 1 : 2; layoutPreview(); } lastTap = now; }
    }, { passive: true });
    body.addEventListener("touchmove", e => {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      zoom = Math.min(4, Math.max(1, z0 * dist(e.touches) / d0)); layoutPreview();
    }, { passive: false });
    body.addEventListener("touchend", e => { if (e.touches.length < 2) d0 = 0; }, { passive: true });
  })();
  function openPreview() {
    const bad = C.validate(cur, data.me); if (bad.length) { toast(bad[0]); return; }
    previewing = true; zoom = 1; $("previewModal").hidden = false; renderPreview();
  }
  $("previewBtn").onclick = openPreview;
  $("previewClose").onclick = () => { previewing = false; $("previewModal").hidden = true; };
  window.addEventListener("resize", () => { if (previewing) renderPreview(); });

  async function makePdf() {
    const bad = C.validate(cur, data.me); if (bad.length) { toast(bad[0]); return; }
    if (cur.isNew) { toast("取引先か品目を入れてください"); return; }
    const html = Paper.pdfDocument(Paper.paperHtml(cur, data.me, paperOpt()));
    const name = Paper.pdfFileName(cur);
    if (!pdfPlugin()) {
      // パソコンのブラウザー：印刷画面で「PDF に保存」
      const w = window.open("", "_blank"); if (!w) { toast("ポップアップを許可してください"); return; }
      w.document.open(); w.document.write(html); w.document.close(); w.document.title = name; setTimeout(() => w.print(), 300);
      return;
    }
    $("pdfBtn").disabled = $("pdfBtn2").disabled = true;
    try {
      const r = await pdfPlugin().makePdf({ html, fileName: name });
      try { await P.Share.share({ title: name, files: [r.uri || r.path], dialogTitle: name }); toast(`PDF を作りました（${r.pages} ページ）`); maybeAskReview(true); }
      catch (e) { if (!/cancel/i.test(e.message || "")) throw e; }
    } catch (e) { toast(e.message || "PDF を作れませんでした"); }
    $("pdfBtn").disabled = $("pdfBtn2").disabled = false;
  }
  $("pdfBtn").onclick = $("pdfBtn2").onclick = makePdf;

  // ---- 設定
  function renderSettings() {
    const m = data.me, s = data.settings;
    ["me_name", "me_addr", "me_tel", "me_mail", "me_reg", "me_bank"].forEach(k => { $(k).value = m[k.slice(3)] || ""; });
    $("regErr").hidden = !m.reg || C.isRegNo(m.reg);
    chips($("taxChips"), [[true, "課税事業者（消費税を記載）"], [false, "免税事業者"]], m.taxable !== false, v => { m.taxable = v; save(); renderSettings(); });
    $("lookNote").textContent = purchased ? "" : "購入すると使えます";
    chips($("colorChips"), C.COLORS.map(([k, label, hex]) => [k, `<span class="sw" style="background:${hex}"></span>${label}`, purchased ? "" : "lock"]), s.color, k => { if (!purchased) { openPay("色テンプレは購入後に使えます"); return; } s.color = k; save(); renderSettings(); });
    const sealType = purchased ? ((s.seal && s.seal.type) || "none") : "none";
    chips($("sealChips"), [["none", "なし"], ["text", "文字から作る", purchased ? "" : "lock"], ["image", "写真から選ぶ", purchased ? "" : "lock"]], sealType, async t => {
      if (t !== "none" && !purchased) { openPay("印影・ロゴは購入後に使えます"); return; }
      if (t === "none") { s.seal = { type: "none" }; save(); renderSettings(); return; }
      if (t === "text") {
        s.seal = Object.assign({ type: "text", text: m.name || "", preset: "kaku-classic", noin: true, center: "代表取締役印" }, s.seal && s.seal.type === "text" ? s.seal : {});
        if (!s.seal.preset) s.seal.preset = s.seal.shape === "square" ? "kaku-classic" : "maru-lines";
        if (!s.seal.text) s.seal.text = m.name || "";
        save(); renderSettings(); return;
      }
      $("sealFile").click();
    });
    $("sealOpts").hidden = sealType !== "text";
    if (sealType === "text") {
      const sl = s.seal;
      if (!sl.preset) sl.preset = sl.shape === "square" ? "kaku-classic" : "maru-lines";
      $("sealText").value = sl.text || "";
      // プリセットは屋号を入れた実物のプレビューをタイルで並べ、1 タップで選ぶ
      const tiles = $("sealTiles"); tiles.innerHTML = "";
      C.SEAL_PRESETS.forEach(([id, label, def]) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "seal-tile"; b.setAttribute("aria-pressed", String(sl.preset === id));
        b.innerHTML = Paper.sealSvg(Object.assign({}, sl, { preset: id, font: sl.font && sl.fontUser ? sl.font : def.font }), "64px") + `<span>${esc(label)}</span>`;
        b.onclick = () => { sl.preset = id; if (!sl.fontUser) sl.font = def.font; save(); renderSettings(); };
        tiles.appendChild(b);
      });
      const def = C.sealPreset(sl.preset)[2];
      chips($("sealFontChips"), C.SEAL_FONTS.map(([k, label]) => [k, label]), sl.font || def.font, v => { sl.font = v; sl.fontUser = true; save(); renderSettings(); });
      $("sealNoinRow").hidden = def.shape !== "square";
      $("sealNoin").checked = sl.noin !== false;
      $("sealCenterRow").hidden = !def.mawashi;
      $("sealCenter").value = sl.center || "";
    }
    $("sealPreview").hidden = sealType === "none";
    if (sealType !== "none") renderSealPreview();
    chips($("logoChips"), [["none", "なし"], ["image", "写真から選ぶ", purchased ? "" : "lock"]], s.logo ? "image" : "none", t => {
      if (t === "image" && !purchased) { openPay("印影・ロゴは購入後に使えます"); return; }
      if (t === "none") { s.logo = ""; save(); renderSettings(); return; }
      $("logoFile").click();
    });
    $("logoPreview").hidden = !s.logo; if (s.logo) $("logoPreview").src = s.logo;
    chips($("roundChips"), [["floor", "切り捨て"], ["round", "四捨五入"], ["ceil", "切り上げ"]], s.rounding, v => { s.rounding = v; save(); renderSettings(); });
    chips($("rateChips"), s.rates.slice().sort((a, b) => b - a).map(r => [r, `${r}%${r === s.defaultRate ? "（既定）" : ""}`]), s.defaultRate, r => {
      if (r === s.defaultRate && s.rates.length > 1) { if (confirm(`${r}% を選択肢から外しますか？`)) { s.rates = s.rates.filter(x => x !== r); s.defaultRate = s.rates[0]; } }
      else s.defaultRate = r;
      save(); renderSettings();
    });
    const pr = $("prefixRow"); pr.innerHTML = "";
    C.KINDS.forEach(k => {
      const d = document.createElement("div");
      d.innerHTML = `<label>${k}</label><input type="text" maxlength="6" value="${esc(s.prefix[k] || C.PREFIX[k])}">`;
      d.querySelector("input").oninput = e => { s.prefix[k] = e.target.value.trim() || C.PREFIX[k]; save(); };
      pr.appendChild(d);
    });
    $("yearInNo").checked = s.yearInNo !== false;
    $("lastBackup").textContent = s.lastBackup ? `最後のバックアップ：${new Date(s.lastBackup).toLocaleDateString("ja-JP")}` : "まだバックアップを書き出していません。";
    renderBuy();
  }
  ["me_name", "me_addr", "me_tel", "me_mail", "me_reg", "me_bank"].forEach(k => { $(k).addEventListener("input", () => { data.me[k.slice(3)] = $(k).value; if (k === "me_reg") $("regErr").hidden = !data.me.reg || C.isRegNo(data.me.reg); if (k === "me_name" && data.settings.seal && data.settings.seal.type === "text" && !data.settings.seal.userText) { data.settings.seal.text = data.me.name; if (!$("tab-settings").hidden) { $("sealText").value = data.me.name; renderSealPreview(); } } save(); }); });
  $("me_reg").addEventListener("blur", () => { data.me.reg = C.normalizeRegNo(data.me.reg); $("me_reg").value = data.me.reg; $("regErr").hidden = !data.me.reg || C.isRegNo(data.me.reg); save(); });
  $("yearInNo").onchange = () => { data.settings.yearInNo = $("yearInNo").checked; save(); };
  function renderSealPreview() {
    const sp = $("sealPreview");
    const m = Paper.paperHtml({ kind: "請求書", lines: [] }, {}, { seal: data.settings.seal }).match(/<div class="seal">[\s\S]*?<\/div>\s*<\/div>/);
    sp.innerHTML = `<div class="sheet" style="all:unset">${m ? m[0] : ""}</div>`;
    sp.querySelectorAll(".seal").forEach(e => { e.style.position = "static"; });
  }
  $("sealText").addEventListener("input", () => { const sl = data.settings.seal; if (sl && sl.type === "text") { sl.text = $("sealText").value; sl.userText = true; save(); renderSealPreview(); document.querySelectorAll("#sealTiles .seal-tile").forEach((b, i) => { const [id, , def] = C.SEAL_PRESETS[i]; b.firstElementChild.outerHTML = Paper.sealSvg(Object.assign({}, sl, { preset: id, font: sl.fontUser ? sl.font : def.font }), "64px"); }); } });
  $("sealNoin").onchange = () => { const sl = data.settings.seal; if (sl && sl.type === "text") { sl.noin = $("sealNoin").checked; save(); renderSealPreview(); } };
  $("sealCenter").addEventListener("input", () => { const sl = data.settings.seal; if (sl && sl.type === "text") { sl.center = $("sealCenter").value; save(); renderSealPreview(); } });
  $("addRate").onclick = () => {
    const r = Number($("newRate").value); if (!(r >= 0 && r <= 100)) { toast("0〜100 の数で入れてください"); return; }
    if (!data.settings.rates.includes(r)) data.settings.rates.push(r);
    $("newRate").value = ""; save(); renderSettings();
  };

  // 画像を読み込んで小さくする。印影は白い背景を透明に
  function readImage(file, maxPx, transparentWhite) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxPx / Math.max(img.width, img.height));
        const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        if (transparentWhite) {
          const id = ctx.getImageData(0, 0, cv.width, cv.height), px = id.data;
          for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; if (l > 200) px[i + 3] = Math.max(0, Math.round((235 - l) * 255 / 35)); }
          ctx.putImageData(id, 0, 0);
        }
        URL.revokeObjectURL(img.src); resolve(cv.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("画像を読めませんでした"));
      img.src = URL.createObjectURL(file);
    });
  }
  $("sealFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { data.settings.seal = { type: "image", data: await readImage(f, 400, true) }; save(); renderSettings(); toast("印影を設定しました"); } catch (err) { toast(err.message); }
  };
  $("logoFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { data.settings.logo = await readImage(f, 600, false); save(); renderSettings(); toast("ロゴを設定しました"); } catch (err) { toast(err.message); }
  };

  // ---- ファイルの書き出し（共有シート。利用者が保存先を選ぶ）
  async function shareText(text, name, mime) {
    if (!native) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); return true;
    }
    const { uri } = await P.Filesystem.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
    try { await P.Share.share({ title: name, files: [uri], dialogTitle: name }); return true; }
    catch (e) { if (/cancel/i.test(e.message || "")) return false; throw e; }
  }
  $("backupBtn").onclick = async () => {
    try {
      if (await shareText(C.backup(data), `seikyusho_backup_${today().replace(/-/g, "")}.json`, "application/json")) {
        data.settings.lastBackup = new Date().toISOString(); save(true); renderSettings(); toast("バックアップを書き出しました");
      }
    } catch (e) { toast("書き出せませんでした"); }
  };
  $("restoreFile").onchange = async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    try {
      const d = C.restore(await file.text());
      const add = data.docs.length ? confirm(`今の書類 ${data.docs.length}件に、バックアップの ${d.docs.length}件を追加しますか？\n（「キャンセル」で今の書類を置き換えます）`) : false;
      if (add) { data.docs = C.mergeDocs(data.docs, d.docs); d.clients.forEach(c => { if (!data.clients.some(x => x.name === c.name)) data.clients.push(c); }); }
      else {
        if (data.docs.length && !confirm(`今の書類 ${data.docs.length}件を消して、バックアップの ${d.docs.length}件に置き換えます。よいですか？`)) return;
        data.docs = d.docs; data.clients = d.clients; data.items = d.items;
        data.me = Object.assign(EMPTY().me, d.me); data.settings = Object.assign(data.settings, d.settings, { launches: data.settings.launches, reviewAsked: data.settings.reviewAsked });
        data.settings.prefix = Object.assign({}, C.PREFIX, data.settings.prefix || {});
      }
      // 累計枚数は「今ある書類の数」より小さくならないように
      data.settings.created = Math.max(Number(data.settings.created) || 0, data.docs.length);
      await save(true); renderSettings(); renderBadge(); toast(`読み込みました（書類 ${data.docs.length}件）`);
    } catch (err) { toast(err.message || "読み込めませんでした"); }
  };

  // ---- 購入
  let priceText = "";
  function renderBuy() {
    $("buyCard").hidden = purchased && false;
    $("buyNote").textContent = purchased ? "購入済みです。書類は無制限、印影・ロゴ・色テンプレが使えます。ありがとうございます。"
      : `無料で作れる書類は 3 枚まで（あと ${C.freeLeft(data.settings)} 枚）。購入すると書類が無制限になり、印影・ロゴ・色テンプレ 5 色が使えます。1 回の購入でずっと使えます。`;
    $("buyBtn").hidden = purchased; $("restoreBtn").hidden = purchased;
    $("buyBtn").textContent = priceText ? `${priceText} で購入する` : "購入する";
    $("payBuy").textContent = $("buyBtn").textContent;
  }
  async function checkPurchased() {
    try {
      if (!store()) { purchased = !native; renderBadge(); return; }   // パソコンのブラウザーでは購入済みとして動かす
      const r = await store().isPurchased({ productId: PRODUCT_ID });
      purchased = !!r.purchased;
      if (!purchased) { const p = await store().getProduct({ productId: PRODUCT_ID }); if (p && p.price) priceText = p.price; }
    } catch (e) { purchased = false; }
    renderBadge(); renderBuy();
  }
  async function buy() {
    if (!store()) { toast("この環境では購入できません"); return; }
    $("buyBtn").disabled = $("payBuy").disabled = true;
    try {
      const r = await store().purchase({ productId: PRODUCT_ID });
      if (r.state === "purchased") { purchased = true; closePay(); toast("ありがとうございます。無制限・印影・テンプレが使えます"); }
      else if (r.state === "pending") toast("承認待ちです。承認されると使えるようになります");
    } catch (e) { toast("購入できませんでした"); }
    $("buyBtn").disabled = $("payBuy").disabled = false;
    renderBadge(); renderBuy(); if (!$("tab-settings").hidden) renderSettings(); if (previewing) renderPreview();
  }
  async function restorePurchase() {
    if (!store()) return;
    try { const r = await store().restore({ productId: PRODUCT_ID }); purchased = !!r.purchased; toast(purchased ? "購入を復元しました" : "この Apple アカウントでの購入は見つかりませんでした"); if (purchased) closePay(); }
    catch (e) { toast("復元できませんでした"); }
    renderBadge(); renderBuy(); if (!$("tab-settings").hidden) renderSettings();
  }
  $("buyBtn").onclick = $("payBuy").onclick = buy;
  $("restoreBtn").onclick = $("payRestore").onclick = restorePurchase;
  function openPay(title) { $("payTitle").textContent = title; $("payModal").hidden = false; renderBuy(); }
  function closePay() { $("payModal").hidden = true; }
  $("payLater").onclick = closePay;
  $("payModal").onclick = e => { if (e.target === $("payModal")) closePay(); };

  // ---- レビューのお願い（Apple の標準ダイアログ。出すかどうかは Apple が決める）
  async function maybeAskReview(exported) {
    if (!native || !P.SeikyushoReview) return;
    if (!C.shouldAskReview({ asked: data.settings.reviewAsked, launches: data.settings.launches, docs: data.docs.length, exported })) return;
    data.settings.reviewAsked = true; await save(true);
    setTimeout(() => { try { P.SeikyushoReview.request(); } catch (e) { /* 出なくても何もしない */ } }, exported ? 1500 : 2000);
  }
  $("reviewBtn").onclick = () => window.open(REVIEW_URL, "_blank");
  $("privacyBtn").onclick = () => window.open(PRIVACY_URL, "_blank");
  $("supportBtn").onclick = () => window.open(SUPPORT_URL, "_blank");

  // ---- 起動（書類のスタイルをプレビュー用に読み込む。PDF 側は paper.js が自分で持つ）
  const paperStyle = document.createElement("style"); paperStyle.textContent = Paper.CSS; document.head.appendChild(paperStyle);
  await checkPurchased();
  data.settings.launches = (Number(data.settings.launches) || 0) + 1;
  save(true).then(() => maybeAskReview(false));
  const first = location.hash.slice(1);
  showTab(TITLES[first] ? first : "docs");
})();
