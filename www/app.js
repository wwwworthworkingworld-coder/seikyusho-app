(async () => {
  const C = window.SeikyushoCore, Paper = window.SeikyushoPaper;
  const KEY = "seikyusho-app-v1";
  const platform = window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : "web";
  // 課金の商品 ID は App Store と Google Play で別（Play は小文字とアンダースコア）
  const PRODUCT_ID = platform === "android" ? "seikyusho_pro" : "com.company256.seikyusho.pro";
  const PRIVACY_URL = "https://256company.com/seikyusho-app-privacy.html";
  const SUPPORT_URL = "https://256company.com/seikyusho-app-support.html";
  const REVIEW_URL = platform === "android" ? "https://play.google.com/store/apps/details?id=com.company256.seikyusho" : "https://apps.apple.com/jp/app/id6835948237?action=write-review";
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const P = native ? window.Capacitor.Plugins : {};
  const store = () => window.SeikyushoStoreMock || P.SeikyushoStore;
  const pdfPlugin = () => window.SeikyushoPdfMock || P.SeikyushoPdf;
  const $ = id => document.getElementById(id);
  const yen = v => (v < 0 ? "−¥" : "¥") + C.yen(Math.abs(v));
  const today = () => C.todayStr();
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const KIND_COLOR = { "見積書": "#5a7d9a", "納品書": "#6b8e5a", "請求書": "#3f51b5", "領収書": "#8b2942", "発注書": "#7a5a9a", "注文書": "#9a7a3a" };

  // ---- 保存（アプリ専用の領域。この端末の中だけ）
  const EMPTY = () => ({ docs: [], trash: [], clients: [], items: [], me: { name: "", person: "", addr: "", tel: "", fax: "", mail: "", reg: "", taxable: true, bank: "" },
    settings: { rounding: "floor", rates: [10, 8], reduced: [8], defaultRate: 10, inclusiveDefault: false, color: "navy", seal: { type: "none" }, logo: "", prefix: Object.assign({}, C.PREFIX), yearInNo: true, created: 0, lastBackup: "", launches: 0, reviewAsked: false, text: { greet: {}, feeNote: undefined, memoDefault: "" } } });
  async function load() {
    try {
      const raw = native ? (await P.Preferences.get({ key: KEY })).value : localStorage.getItem(KEY);
      const d = Object.assign(EMPTY(), JSON.parse(raw || "{}"));
      d.me = Object.assign(EMPTY().me, d.me || {}); d.settings = Object.assign(EMPTY().settings, d.settings || {});
      d.settings.prefix = Object.assign({}, C.PREFIX, d.settings.prefix || {});
      if (!Array.isArray(d.settings.rates) || !d.settings.rates.length) d.settings.rates = [10, 8];
      if (!Array.isArray(d.settings.reduced)) d.settings.reduced = C.DEFAULT_REDUCED.slice();
      d.settings.text = Object.assign({ greet: {}, memoDefault: "" }, d.settings.text || {}); if (!d.settings.text.greet) d.settings.text.greet = {};
      d.clients = (Array.isArray(d.clients) ? d.clients : []).filter(c => c && c.name);
      d.trash = C.purgeTrash(Array.isArray(d.trash) ? d.trash : []);
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
  let purchased = false;   // 有料機能が使えるか（購入済み、または Android の審査用解除）
  let bought = false;      // 実際に購入済みか（復元・購入の処理はこちらだけ見る）
  const refreshPro = () => { purchased = C.isPro(data.settings, bought, platform); };
  let kindFilter = "", search = "", unpaidOnly = false, csvScope = "sales";
  let tId;
  const years = () => { const s = new Set(data.docs.map(d => +String(d.date || "").slice(0, 4)).filter(Boolean)); s.add(+today().slice(0, 4)); return [...s].sort((a, b) => b - a); };
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tId); tId = setTimeout(() => t.classList.remove("show"), 2400); }
  const baseOpt = () => ({ taxable: data.me.taxable !== false, rounding: data.settings.rounding });
  const calcOpt = doc => C.docCalcOpt(doc, baseOpt());
  // 書類の見た目。locked＝true なら未購入の色・印影・ロゴを外す（PDF）。プレビューは locked=false で「選んで見られる」
  const paperOpt = (locked = true) => {
    const free = purchased || !locked;
    return { go: !!data.settings.go, color: free ? data.settings.color : "navy", rounding: data.settings.rounding, seal: free ? data.settings.seal : { type: "none" }, logo: free ? data.settings.logo : "", reduced: data.settings.reduced, text: data.settings.text };
  };

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
    // 種類のチップの横に「未入金だけ」（請求書の未入金・期限超過だけを見る）
    const un = document.createElement("button"); un.type = "button"; un.className = "chip unpaid-chip"; un.textContent = "未入金だけ"; un.setAttribute("aria-pressed", String(unpaidOnly));
    un.onclick = () => { unpaidOnly = !unpaidOnly; renderDocs(); };
    chips($("kindFilter"), [["", "すべて"], ...C.KINDS.map(k => [k, k])], kindFilter, v => { kindFilter = v; renderDocs(); }, un);
    const q = search.trim(), td = today();
    const docs = data.docs.filter(d => (!kindFilter || d.kind === kindFilter) && (!unpaidOnly || (d.kind === "請求書" && !d.paid)) && C.matchDoc(d, q));
    const groups = C.groupByMonth(docs, baseOpt(), kindFilter ? [kindFilter] : C.SALES_KINDS);
    const box = $("docList"); box.innerHTML = "";
    if (!groups.length) { box.innerHTML = '<ul class="doclist"><li class="empty">見つかりませんでした</li></ul>'; return; }
    groups.forEach(g => {
      const h = document.createElement("div"); h.className = "month";
      h.innerHTML = `<span>${g.month.replace("-", "年")}月　${g.docs.length}件</span><span class="mt"><small>${esc(C.monthTotalLabel(kindFilter))}</small><b>${yen(g.total)}</b></span>`;
      box.appendChild(h);
      const ul = document.createElement("ul"); ul.className = "doclist";
      g.docs.forEach(d => {
        const c = C.calc(d.lines, calcOpt(d));
        const li = document.createElement("li");
        const status = d.kind !== "請求書" ? "" : d.paid ? '<small>入金済み</small>' : C.isOverdue(d, td) ? '<small class="overdue">期限超過</small>' : '<small class="unpaid">未入金</small>';
        li.innerHTML = `<span class="k" style="background:${KIND_COLOR[d.kind]}">${esc(d.kind)}</span>`
          + `<span class="t"><div>${esc(d.to || "（取引先なし）")}${d.subject ? "　" + esc(d.subject) : ""}</div><small>${esc(d.no)}　${esc((d.date || "").replace(/-/g, "/"))}</small></span>`
          + `<span class="a">${yen(C.shownAmount(d, c))}${status}</span>`;
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
    cur = { id: newId(), kind, no: C.nextNo(data.docs, kind, data.settings), date, due: C.defaultDue(kind, date), to: "", honor: "御中", toZip: "", toAddr: "", toDept: "", toPerson: "", subject: "", wh: false, inclusive: !!data.settings.inclusiveDefault, memo: (data.settings.text && data.settings.text.memoDefault) || "",
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
      const rec = C.clientFromDoc(cur, cur.updated);
      if (i >= 0) data.clients[i] = Object.assign({}, data.clients[i], rec); else data.clients.push(rec);
    }
    save();
    renderTotal();
  }
  function renderEdit() {
    const d = cur;
    $("meBand").hidden = !C.meMissing(data.me);
    chips($("kindChips"), C.KINDS.map(k => [k, k]), d.kind, k => {
      const old = d.kind; d.kind = k;
      if (!d.no || d.no.startsWith((data.settings.prefix[old] || C.PREFIX[old]) + "-")) d.no = C.nextNo(data.docs.filter(x => x !== d), k, data.settings);
      d.due = C.defaultDue(k, d.date); commit(); renderEdit();
    });
    renderClientChips();
    $("to").value = d.to || ""; $("honor").value = d.honor || "御中";
    $("toZip").value = d.toZip || ""; $("toAddr").value = d.toAddr || ""; $("toDept").value = d.toDept || ""; $("toPerson").value = d.toPerson || "";
    $("toMore").open = !!(d.toZip || d.toAddr || d.toDept || d.toPerson);
    $("no").value = d.no || ""; $("date").value = d.date || ""; $("due").value = d.due || "";
    $("dueWrap").hidden = !C.hasDue(d.kind);
    $("dueLabel").textContent = C.DUE_LABEL[d.kind] || "期限";
    $("subjectLabel").innerHTML = d.kind === "領収書" ? '但し書き <small>「〇〇として」の〇〇</small>' : '件名 <small>任意</small>';
    $("subject").value = d.subject || "";
    $("wh").checked = !!d.wh; $("inclusive").checked = !!d.inclusive; $("memo").value = d.memo || "";
    const allItems = C.recentItems(data.docs, 40);
    $("itemSearch").hidden = allItems.length <= 10;
    const iq = $("itemSearch").value.trim();
    const items = (iq ? allItems.filter(it => it.item.includes(iq)) : allItems).slice(0, iq ? 20 : 8);
    chips($("itemChips"), items.map(it => [it.item, esc(it.item)]), null, name => {
      const it = items.find(x => x.item === name);
      const empty = d.lines.find(l => !String(l.item || "").trim());
      const l = empty || blankLine(); if (!empty) d.lines.push(l);
      Object.assign(l, { item: it.item, unit: it.unit, price: it.price, rate: it.rate === undefined ? data.settings.defaultRate : it.rate, qty: l.qty || 1 });
      commit(); renderLines();
    });
    $("itemChips").hidden = !items.length && !iq;
    renderLines();
    // 引き継ぎ：他の種類すべてへ（見積書から請求書へ直接など）
    const box = $("convertBox"); box.innerHTML = "";
    C.KINDS.filter(k => k !== d.kind).forEach(k => {
      const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = `この内容で${k}を作る`;
      b.onclick = () => convertTo(k); box.appendChild(b);
    });
    $("paidBtn").hidden = d.kind !== "請求書"; $("paidBtn").textContent = d.paid ? `未入金に戻す${d.paidAt ? `（入金日 ${d.paidAt.replace(/-/g, "/")}）` : ""}` : "入金済みにする";
    $("docActions").hidden = !!d.isNew;
    renderTotal();
  }
  // 取引先チップ：入力中の文字で data.clients から絞り込む（空なら直近 6、文字があれば一致 8）
  function renderClientChips() {
    const d = cur, q = $("to").value;
    const list = C.clientSuggest(data.clients, q);
    chips($("clientChips"), list.map(c => [c.name, esc(c.name) + (c.person ? `<small>${esc(c.person)}</small>` : "")]), d.to, name => {
      const c = list.find(x => x.name === name); if (!c) return;
      C.applyClient(d, c); commit(); renderEdit();
    });
    $("clientChips").hidden = !list.length;
    $("clientHint").textContent = data.clients.length > 6 ? "名前を打つと絞り込めます" : "登録した取引先はタップで入ります";
  }
  function renderLines() {
    const box = $("lines"); box.innerHTML = "";
    const rates = data.settings.rates.slice().sort((a, b) => b - a);
    const subs = new Map(C.subtotals(cur.lines).map(s => [s.index, s.amount]));
    const inc = !!cur.inclusive && data.me.taxable !== false;
    cur.lines.forEach((l, i) => {
      const div = document.createElement("div");
      // 「⋯」：上へ・下へ・複製・削除
      const menu = `<button type="button" class="more-btn" aria-label="この行の操作">⋯</button>`;
      const menuRow = `<div class="l-menu" hidden><button type="button" data-act="up"${i === 0 ? " disabled" : ""}>↑ 上へ</button><button type="button" data-act="down"${i === cur.lines.length - 1 ? " disabled" : ""}>↓ 下へ</button><button type="button" data-act="dup">複製</button><button type="button" data-act="del" class="danger">削除</button></div>`;
      if (C.isSubtotal(l)) {
        div.className = "line subtotal";
        div.innerHTML = `<div class="l1"><input class="item" type="text" maxlength="20" placeholder="小計" value="${esc(l.item || "小計")}">${menu}</div>${menuRow}<div class="l3"><small>ここまでの合計</small><span class="amt">${yen(subs.get(i) || 0)}</span></div>`;
        div.querySelector(".item").addEventListener("input", e => { l.item = e.target.value; commit(); });
        wireMenu(div, i, false);
        box.appendChild(div); return;
      }
      const disc = !!l.discount || Number(l.price) < 0;
      div.className = "line" + (disc ? " discount" : "");
      div.innerHTML = `<div class="l1"><input class="item" type="text" maxlength="60" placeholder="${disc ? "値引きの名目" : "品目（例：デザイン制作）"}" value="${esc(l.item)}">${menu}</div>${menuRow}
        <div class="l2"><input class="qty" type="number" inputmode="decimal" step="any" placeholder="数量" value="${esc(l.qty)}"><input class="unit" type="text" maxlength="6" placeholder="単位" value="${esc(l.unit)}"><input class="price" type="number" inputmode="${l.discount ? "numeric" : "numeric"}" step="1" min="${l.discount ? 0 : ""}" placeholder="${l.discount ? "値引き額" : inc ? "単価（税込）" : "単価（税抜）"}" value="${esc(l.price)}"></div>
        <div class="l3"><div class="chips rates"></div><span class="amt ${C.lineAmount(l) < 0 ? "minus" : ""}">${yen(C.lineAmount(l))}</span></div>`;
      chips(div.querySelector(".rates"), [...rates.map(r => [r, `${r}%`]), [null, "対象外"]], l.rate === "" || l.rate === undefined ? null : l.rate, r => { l.rate = r; commit(); renderLines(); });
      const upd = () => {
        l.item = div.querySelector(".item").value; l.unit = div.querySelector(".unit").value;
        l.qty = div.querySelector(".qty").value === "" ? "" : Number(div.querySelector(".qty").value);
        const pv = div.querySelector(".price").value;
        l.price = pv === "" ? "" : (l.discount ? Math.abs(Number(pv)) : Number(pv));
        div.querySelector(".amt").textContent = yen(C.lineAmount(l)); div.querySelector(".amt").className = "amt" + (C.lineAmount(l) < 0 ? " minus" : "");
        commit();
        // 小計行の表示も更新
        const s2 = new Map(C.subtotals(cur.lines).map(s => [s.index, s.amount]));
        box.querySelectorAll(".line.subtotal").forEach((el, k) => { const idx = [...s2.keys()][k]; el.querySelector(".amt").textContent = yen(s2.get(idx) || 0); });
      };
      div.querySelectorAll(".l1 input,.l2 input").forEach(e => e.addEventListener("input", upd));
      wireMenu(div, i, true);
      box.appendChild(div);
    });
  }
  function wireMenu(div, i, isItem) {
    const mb = div.querySelector(".more-btn"), mr = div.querySelector(".l-menu");
    mb.onclick = () => { mr.hidden = !mr.hidden; };
    mr.querySelectorAll("button").forEach(b => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === "up") cur.lines = C.moveLine(cur.lines, i, -1);
        else if (act === "down") cur.lines = C.moveLine(cur.lines, i, 1);
        else if (act === "dup") cur.lines = C.duplicateLine(cur.lines, i);
        else if (act === "del") { cur.lines.splice(i, 1); if (isItem && !cur.lines.length) cur.lines.push(blankLine()); }
        commit(); renderLines();
      };
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
  $("addSubtotal").onclick = () => { cur.lines.push({ type: "subtotal", item: "小計" }); cur.lines.push(blankLine()); commit(); renderLines(); };
  $("itemSearch").addEventListener("input", () => renderEdit());
  // 値引き行：正の数で入れて内部で負にする（数字キーパッドに「−」が無いため）
  $("addDiscount").onclick = () => { cur.lines.push({ item: "値引き", qty: 1, unit: "", price: "", rate: data.settings.defaultRate, discount: true }); commit(); renderLines(); setTimeout(() => { const els = $("lines").querySelectorAll(".price"); els[els.length - 1].focus(); }, 30); };
  ["to", "no", "date", "due", "subject", "memo", "toZip", "toAddr", "toDept", "toPerson"].forEach(k => { $(k).addEventListener("input", () => { cur[k] = $(k).value; if (k === "date" && C.hasDue(cur.kind)) { cur.due = C.defaultDue(cur.kind, cur.date); $("due").value = cur.due; } if (k === "to") renderClientChips(); commit(); }); });
  $("honor").onchange = () => { cur.honor = $("honor").value; commit(); };
  $("wh").onchange = () => { cur.wh = $("wh").checked; commit(); };
  $("inclusive").onchange = () => { cur.inclusive = $("inclusive").checked; commit(); renderLines(); };
  function convertTo(next) {
    if (!next || next === cur.kind) return;
    if (!tryCreate()) return;
    const n = C.convert(cur, next, data.docs, data.settings, new Date(), newId());
    delete n.isNew; data.docs.push(n); data.settings.created = (Number(data.settings.created) || 0) + 1; save();
    cur = n; renderEdit(); $("title").textContent = cur.kind; $("scroll").scrollTop = 0; renderBadge();
    toast(`${cur.from} と同じ内容で ${next} ${cur.no} を作りました`);
  };
  $("paidBtn").onclick = () => { C.setPaid(cur, !cur.paid); commit(); renderEdit(); toast(cur.paid ? `入金済みにしました（入金日 ${cur.paidAt.replace(/-/g, "/")}）` : "未入金に戻しました"); };
  $("dupBtn").onclick = () => {
    if (!tryCreate()) return;
    const n = C.convert(cur, cur.kind, data.docs, data.settings, new Date(), newId()); delete n.from; delete n.isNew;
    data.docs.push(n); data.settings.created = (Number(data.settings.created) || 0) + 1; save();
    cur = n; renderEdit(); $("scroll").scrollTop = 0; renderBadge(); toast(`複製しました（${cur.no}）`);
  };
  $("deleteBtn").onclick = () => {
    if (!confirm(`${cur.kind} ${cur.no} を削除しますか？（設定の「最近削除」から ${C.TRASH_DAYS} 日間は戻せます）`)) return;
    data.trash = C.purgeTrash(data.trash).concat([Object.assign({}, cur, { deletedAt: new Date().toISOString() })]);
    data.docs = data.docs.filter(d => d.id !== cur.id); save(true); cur = null; showTab("docs"); toast("削除しました（最近削除に移動）");
  };

  // ---- 初回の導線：発行者（自分）の情報が空なら短いシート。「あとで」で先に進める
  let meLater = false, meThen = null;
  function openMeSheet(then) {
    meThen = then || null;
    ["name", "addr", "bank", "reg"].forEach(k => { $("mm_" + k).value = data.me[k] || ""; });
    $("meModal").hidden = false;
  }
  $("meBand").onclick = () => openMeSheet(() => renderEdit());
  $("mm_save").onclick = async () => {
    ["name", "addr", "bank"].forEach(k => { data.me[k] = $("mm_" + k).value; });
    data.me.reg = C.normalizeRegNo($("mm_reg").value);
    if (data.me.reg && !C.isRegNo(data.me.reg)) { toast("インボイス登録番号は T＋13 桁です"); return; }
    if (!data.me.name.trim()) { toast("屋号・名前を入れてください"); return; }
    await save(true); $("meModal").hidden = true; toast("保存しました（設定でいつでも変えられます）");
    if (!$("tab-edit").hidden) renderEdit();
    const f = meThen; meThen = null; if (f) f();
  };
  $("mm_later").onclick = () => { $("meModal").hidden = true; meLater = true; const f = meThen; meThen = null; if (f) f(); };
  // プレビュー・PDF の前：屋号が空なら 1 回だけシートを出す
  function ensureMe(then) { if (C.meMissing(data.me) && !meLater) openMeSheet(then); else then(); }

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
  // 未購入でも色・印影・ロゴを選んで見られる（PDF には入らない。上に帯で案内）
  const lookChosen = () => data.settings.color !== "navy" || (data.settings.seal && data.settings.seal.type !== "none") || !!data.settings.logo;
  function renderPreview() {
    const scale = $("previewScale");
    scale.innerHTML = Paper.paperHtml(cur, data.me, paperOpt(false));
    const w = $("previewBody").clientWidth - 24;
    baseScale = Math.min(1, w / (210 * 96 / 25.4));
    layoutPreview();
    $("previewLock").hidden = purchased || !lookChosen();
    $("stampNote").hidden = !(cur.kind === "領収書" && C.shownAmount(cur, C.calc(cur.lines, calcOpt(cur))) >= 50000);
    chips($("previewColors"), C.COLORS.map(([k, label, hex]) => [k, `<span class="sw" style="background:${hex}"></span>${label}`, purchased ? "" : "lock"]), data.settings.color, k => {
      data.settings.color = k; save(); renderPreview();
    });
  }
  $("previewLock").onclick = () => openPay("色・印影・ロゴを PDF に入れるには購入が必要です");
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
    ensureMe(() => { previewing = true; zoom = 1; $("previewModal").hidden = false; renderPreview(); });
  }
  $("previewBtn").onclick = openPreview;
  $("previewClose").onclick = () => { previewing = false; $("previewModal").hidden = true; };
  window.addEventListener("resize", () => { if (previewing) renderPreview(); });

  async function makePdf() {
    const bad = C.validate(cur, data.me); if (bad.length) { toast(bad[0]); return; }
    if (cur.isNew) { toast("取引先か品目を入れてください"); return; }
    ensureMe(makePdfNow);
  }
  async function makePdfNow() {
    const html = Paper.pdfDocument(Paper.paperHtml(cur, data.me, paperOpt(true)));
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
  const ME_FIELDS = ["me_name", "me_person", "me_addr", "me_tel", "me_fax", "me_mail", "me_reg", "me_bank"];
  function renderSettings() {
    const m = data.me, s = data.settings;
    ME_FIELDS.forEach(k => { $(k).value = m[k.slice(3)] || ""; });
    $("regErr").hidden = !m.reg || C.isRegNo(m.reg);
    chips($("taxChips"), [[true, "課税事業者（消費税を記載）"], [false, "免税事業者"]], m.taxable !== false, v => { m.taxable = v; save(); renderSettings(); });
    // 見た目：未購入でも選んで試せる（PDF に入れるには購入）
    $("lookNote").textContent = purchased ? "" : "選んで試せます。PDF に入れるには購入が必要です";
    chips($("colorChips"), C.COLORS.map(([k, label, hex]) => [k, `<span class="sw" style="background:${hex}"></span>${label}`, purchased ? "" : "lock"]), s.color, k => { s.color = k; save(); renderSettings(); });
    const sealType = (s.seal && s.seal.type) || "none";
    chips($("sealChips"), [["none", "なし"], ["text", "文字から作る", purchased ? "" : "lock"], ["image", "写真から選ぶ", purchased ? "" : "lock"]], sealType, async t => {
      if (t === "none") { s.seal = { type: "none" }; save(); renderSettings(); return; }
      if (t === "text") {
        s.seal = Object.assign({ type: "text", text: m.name || "", preset: "kaku-classic", noin: true, center: C.sealCenterDefault(m.name) }, s.seal && s.seal.type === "text" ? s.seal : {});
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
      $("sealCenter").value = sl.center || ""; $("sealCenter").placeholder = C.sealCenterDefault(sl.text);
    }
    $("sealPreview").hidden = sealType === "none";
    if (sealType !== "none") renderSealPreview();
    chips($("logoChips"), [["none", "なし"], ["auto", "自動で作る", purchased ? "" : "lock"], ["image", "写真から選ぶ", purchased ? "" : "lock"]], s.logo ? (s.logoSpec ? "auto" : "image") : "none", t => {
      if (t === "none") { s.logo = ""; s.logoSpec = null; save(); renderSettings(); return; }
      if (t === "auto") { openLogoMaker(); return; }
      $("logoFile").click();
    });
    $("logoPreview").hidden = !s.logo; if (s.logo) $("logoPreview").src = s.logo;
    renderClientList();
    renderTextRows();
    chips($("roundChips"), [["floor", "切り捨て"], ["round", "四捨五入"], ["ceil", "切り上げ"]], s.rounding, v => { s.rounding = v; save(); renderSettings(); });
    $("inclusiveDefault").checked = !!s.inclusiveDefault;
    chips($("rateChips"), s.rates.slice().sort((a, b) => b - a).map(r => [r, `${r}%${r === s.defaultRate ? "（既定）" : ""}`]), s.defaultRate, r => {
      if (r === s.defaultRate && s.rates.length > 1) { if (confirm(`${r}% を選択肢から外しますか？`)) { s.rates = s.rates.filter(x => x !== r); s.defaultRate = s.rates[0]; } }
      else s.defaultRate = r;
      save(); renderSettings();
    });
    // 税率ごとの「軽減税率（※を付ける）」
    const rr = $("reducedRows"); rr.innerHTML = "";
    s.rates.slice().sort((a, b) => b - a).forEach(r => {
      const lab = document.createElement("label"); lab.className = "switch small";
      lab.innerHTML = `<span>${r}% は軽減税率（※を付ける）</span><input type="checkbox">`;
      const cb = lab.querySelector("input"); cb.checked = C.isReduced(r, s.reduced);
      cb.onchange = () => { s.reduced = cb.checked ? [...new Set([...(s.reduced || []), r])] : (s.reduced || []).filter(x => Number(x) !== Number(r)); save(); };
      rr.appendChild(lab);
    });
    const pr = $("prefixRow"); pr.innerHTML = "";
    C.KINDS.forEach(k => {
      const d = document.createElement("div");
      d.innerHTML = `<label>${k}</label><input type="text" maxlength="6" value="${esc(s.prefix[k] || C.PREFIX[k])}">`;
      d.querySelector("input").oninput = e => { s.prefix[k] = e.target.value.trim() || C.PREFIX[k]; save(); };
      pr.appendChild(d);
    });
    $("yearInNo").checked = s.yearInNo !== false;
    $("goTitle").checked = !!s.go;
    // 最近削除
    data.trash = C.purgeTrash(data.trash);
    const tl = $("trashList"); tl.innerHTML = "";
    if (!data.trash.length) tl.innerHTML = '<li class="empty">最近削除した書類はありません</li>';
    data.trash.slice().reverse().forEach(t => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="t">${esc(t.kind)} ${esc(t.no)}<small>${esc(t.to || "")}　あと ${C.trashDaysLeft(t)} 日</small></span><button type="button" class="secondary small" aria-label="${esc(t.no)} を戻す">戻す</button>`;
      li.querySelector("button").onclick = async () => {
        data.trash = data.trash.filter(x => x !== t); const d = Object.assign({}, t); delete d.deletedAt;
        if (data.docs.some(x => x.kind === d.kind && d.no === x.no)) d.no = C.nextNo(data.docs, d.kind, data.settings);
        data.docs.push(d); await save(true); renderSettings(); toast(`${d.kind} ${d.no} を戻しました`);
      };
      tl.appendChild(li);
    });
    // 売上 CSV の年と範囲
    chips($("csvScope"), [["sales", "請求書・領収書だけ"], ["all", "全部"]], csvScope, v => { csvScope = v; renderSettings(); });
    const cy = $("csvYear"), ys = years(); cy.innerHTML = ys.map(y => `<option value="${y}">${y}年</option>`).join(""); if (!ys.includes(+cy.value)) cy.value = String(ys[0]);
    $("lastBackup").textContent = s.lastBackup ? `最後のバックアップ：${new Date(s.lastBackup).toLocaleDateString("ja-JP")}` : "まだバックアップを書き出していません。";
    renderBuy();
  }
  ME_FIELDS.forEach(k => { $(k).addEventListener("input", () => { data.me[k.slice(3)] = $(k).value; if (k === "me_reg") $("regErr").hidden = !data.me.reg || C.isRegNo(data.me.reg); if (k === "me_name" && data.settings.seal && data.settings.seal.type === "text" && !data.settings.seal.userText) { data.settings.seal.text = data.me.name; if (!$("tab-settings").hidden) { $("sealText").value = data.me.name; renderSealPreview(); } } save(); }); });
  $("me_reg").addEventListener("blur", () => { data.me.reg = C.normalizeRegNo(data.me.reg); $("me_reg").value = data.me.reg; $("regErr").hidden = !data.me.reg || C.isRegNo(data.me.reg); save(); });
  $("yearInNo").onchange = () => { data.settings.yearInNo = $("yearInNo").checked; save(); };
  $("goTitle").onchange = () => { data.settings.go = $("goTitle").checked; save(); };
  $("inclusiveDefault").onchange = () => { data.settings.inclusiveDefault = $("inclusiveDefault").checked; save(); };
  $("csvBtn").onclick = async () => {
    const y = +$("csvYear").value;
    const kinds = csvScope === "all" ? null : C.SALES_KINDS;
    if (!data.docs.some(d => String(d.date || "").startsWith(String(y)) && (!kinds || kinds.includes(d.kind)))) { toast("その年の書類がありません"); return; }
    try { if (await shareText(C.salesCsv(data.docs, y, baseOpt(), kinds), `seikyusho_${y}.csv`, "text/csv")) toast("CSV を書き出しました"); }
    catch (e) { toast("書き出せませんでした"); }
  };
  // 書類の文言：挨拶文（種類ごと）・振込手数料の一文・備考の既定文
  function renderTextRows() {
    const t = data.settings.text, box = $("textRows"); box.innerHTML = "";
    C.KINDS.forEach(k => {
      const d = document.createElement("div");
      d.innerHTML = `<label>${k}の挨拶文 <small>空にすると出ません</small></label><input type="text" maxlength="60" value="${esc(t.greet[k] !== undefined ? t.greet[k] : Paper.DEFAULT_TEXT.greet[k])}">`;
      d.querySelector("input").oninput = e => { t.greet[k] = e.target.value; save(); };
      box.appendChild(d);
    });
    $("txt_fee").value = t.feeNote !== undefined ? t.feeNote : Paper.DEFAULT_TEXT.feeNote;
    $("txt_memo").value = t.memoDefault || "";
  }
  $("txt_fee").addEventListener("input", () => { data.settings.text.feeNote = $("txt_fee").value; save(); });
  $("txt_memo").addEventListener("input", () => { data.settings.text.memoDefault = $("txt_memo").value; save(); });
  // 取引先の一覧・編集・削除（名前を変えても既存の書類はそのまま）
  let editingClient = null;
  function renderClientList() {
    const ul = $("clientList"); ul.innerHTML = "";
    const list = data.clients.slice().sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")));
    if (!list.length) ul.innerHTML = '<li class="empty">まだ取引先がありません。「作る」で取引先名を入れると、ここにたまります。</li>';
    list.forEach(c => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="t">${esc(c.name)} <small>${esc([c.addr ? `〒${c.zip || ""} ${c.addr}`.trim() : "", c.dept, c.person].filter(Boolean).join("　") || "住所・担当者なし")}</small></span><button type="button" class="secondary small">編集</button>`;
      li.querySelector("button").onclick = () => { editingClient = c; ["name", "honor", "zip", "addr", "dept", "person"].forEach(k => { $("cl_" + k).value = c[k] || (k === "honor" ? "御中" : ""); }); $("clientEdit").hidden = false; $("clientEdit").scrollIntoView({ block: "nearest" }); };
      ul.appendChild(li);
    });
  }
  $("cl_cancel").onclick = () => { $("clientEdit").hidden = true; editingClient = null; };
  $("cl_save").onclick = () => {
    if (!editingClient) return;
    const name = $("cl_name").value.trim(); if (!name) { toast("取引先名を入れてください"); return; }
    if (name !== editingClient.name && data.clients.some(c => c !== editingClient && c.name === name)) { toast("同じ名前の取引先があります"); return; }
    Object.assign(editingClient, { name, honor: $("cl_honor").value, zip: $("cl_zip").value.trim(), addr: $("cl_addr").value.trim(), dept: $("cl_dept").value.trim(), person: $("cl_person").value.trim() });
    save(); $("clientEdit").hidden = true; editingClient = null; renderClientList(); toast("保存しました");
  };
  (() => {
    // 取引先の削除（確認ダイアログ。作った書類はそのまま）
    const del = document.createElement("button"); del.type = "button"; del.className = "secondary small danger"; del.textContent = "この取引先を削除";
    del.onclick = () => { if (!editingClient || !confirm(`${editingClient.name} を取引先の一覧から消しますか？（作った書類はそのまま残ります）`)) return; data.clients = data.clients.filter(c => c !== editingClient); editingClient = null; $("clientEdit").hidden = true; save(); renderClientList(); toast("消しました"); };
    $("clientEdit").insertBefore(del, $("clientEdit").lastElementChild);
  })();
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
    try { data.settings.logo = await readImage(f, 600, false); data.settings.logoSpec = null; save(); renderSettings(); toast("ロゴを設定しました"); } catch (err) { toast(err.message); }
  };

  // ---- ロゴの自動生成（端末内。屋号から型×色×書体を作る。「これにする」で透過 PNG にして設定のロゴへ）
  const Lg = window.SeikyushoLogo;
  let logoSpec = null;
  function logoName() { return (data.me.name || "").trim(); }
  function openLogoMaker() {
    if (!logoName()) { toast("先に屋号・名前を入れてください"); return; }
    logoSpec = data.settings.logoSpec ? Object.assign({}, data.settings.logoSpec) : Lg.randomSpec(Date.now() & 0xffff);
    $("logoModal").hidden = false; renderLogoMaker();
  }
  function renderLogoMaker() {
    $("logoStage").innerHTML = Lg.logoSvg(logoName(), logoSpec);
    chips($("logoPalettes"), Lg.PALETTES.map(([k, label, main]) => [k, `<span class="sw" style="background:${main}"></span>${label}`]), logoSpec.palette, v => { logoSpec.palette = v; renderLogoMaker(); });
    chips($("logoFonts"), Lg.FONTS.map(([k, label]) => [k, label]), logoSpec.font, v => { logoSpec.font = v; renderLogoMaker(); });
    chips($("logoTemplates"), Lg.TEMPLATES.map(([k, label]) => [k, label]), logoSpec.template, v => { logoSpec.template = v; renderLogoMaker(); });
  }
  $("logoAgain").onclick = () => { let n; do { n = Lg.randomSpec((Date.now() + Math.floor(Math.random() * 1e6)) & 0xffffff); } while (n.template === logoSpec.template && n.palette === logoSpec.palette); logoSpec = n; renderLogoMaker(); };
  $("logoClose").onclick = () => { $("logoModal").hidden = true; };
  // SVG → 透過 PNG（長辺 1024px）。フォントは端末のものがそのまま使われる
  function svgToPng(svg, maxPx) {
    return new Promise((resolve, reject) => {
      const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1].split(" ").map(Number);
      const w = vb[2], h = vb[3], s = maxPx / Math.max(w, h);
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      img.onload = () => {
        const cv = document.createElement("canvas"); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        try { resolve(cv.toDataURL("image/png")); } catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ロゴを画像にできませんでした")); };
      img.src = url;
    });
  }
  $("logoUse").onclick = async () => {
    try {
      const svg = Lg.logoSvg(logoName(), logoSpec);
      data.settings.logo = await svgToPng(svg, 1024); data.settings.logoSpec = Object.assign({}, logoSpec);
      await save(true); $("logoModal").hidden = true; renderSettings(); toast(purchased ? "ロゴを設定しました" : "ロゴを設定しました（PDF に入れるには購入が必要です）");
    } catch (e) { toast(e.message || "ロゴを作れませんでした"); }
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
        data.docs = d.docs; data.trash = C.purgeTrash(d.trash || []); data.clients = d.clients.filter(c => c && c.name); data.items = d.items;
        data.me = Object.assign(EMPTY().me, d.me); data.settings = Object.assign(data.settings, d.settings, { launches: data.settings.launches, reviewAsked: data.settings.reviewAsked, reviewUnlocked: data.settings.reviewUnlocked });
        data.settings.prefix = Object.assign({}, C.PREFIX, data.settings.prefix || {});
        if (!Array.isArray(data.settings.reduced)) data.settings.reduced = C.DEFAULT_REDUCED.slice();
        data.settings.text = Object.assign({ greet: {}, memoDefault: "" }, data.settings.text || {}); if (!data.settings.text.greet) data.settings.text.greet = {};
      }
      // 累計枚数は「今ある書類の数」より小さくならないように
      data.settings.created = Math.max(Number(data.settings.created) || 0, data.docs.length);
      await save(true); refreshPro(); renderSettings(); renderBadge(); toast(`読み込みました（書類 ${data.docs.length}件）`);
    } catch (err) { toast(err.message || "読み込めませんでした"); }
  };

  // ---- 購入
  let priceText = "";
  function renderBuy() {
    $("buyCard").hidden = purchased && false;
    $("buyNote").textContent = purchased ? "購入済みです。書類は無制限、印影・ロゴ・色テンプレが使えます。ありがとうございます。"
      : `無料で作れる書類は 3 枚まで（あと ${C.freeLeft(data.settings)} 枚）。購入すると書類が無制限になり、印影・ロゴ・色テンプレ 5 色を PDF に入れられます。1 回の購入でずっと使えます。`;
    if (!bought && purchased) $("buyNote").textContent = "審査用に解除中です（この端末だけ）。購入状態ではありません。";
    $("buyBtn").hidden = bought; $("restoreBtn").hidden = bought;
    $("buyBtn").textContent = priceText ? `${priceText} で購入する` : "購入する";
    $("payBuy").textContent = $("buyBtn").textContent;
  }
  async function checkPurchased() {
    try {
      if (!store()) { bought = !native; refreshPro(); renderBadge(); return; }   // パソコンのブラウザーでは購入済みとして動かす
      const r = await store().isPurchased({ productId: PRODUCT_ID });
      bought = !!r.purchased;
      if (!bought) { const p = await store().getProduct({ productId: PRODUCT_ID }); if (p && p.price) priceText = p.price; }
    } catch (e) { bought = false; }
    refreshPro(); renderBadge(); renderBuy();
  }
  async function buy() {
    if (!store()) { toast("この環境では購入できません"); return; }
    $("buyBtn").disabled = $("payBuy").disabled = true;
    try {
      const r = await store().purchase({ productId: PRODUCT_ID });
      if (r.state === "purchased") { bought = true; refreshPro(); closePay(); toast("ありがとうございます。無制限・印影・テンプレが使えます"); }
      else if (r.state === "pending") toast("承認待ちです。承認されると使えるようになります");
    } catch (e) { toast("購入できませんでした"); }
    $("buyBtn").disabled = $("payBuy").disabled = false;
    renderBadge(); renderBuy(); if (!$("tab-settings").hidden) renderSettings(); if (previewing) renderPreview();
  }
  async function restorePurchase() {
    if (!store()) return;
    try { const r = await store().restore({ productId: PRODUCT_ID }); bought = !!r.purchased; refreshPro(); toast(bought ? "購入を復元しました" : (platform === "android" ? "この Google アカウントでの購入は見つかりませんでした" : "この Apple アカウントでの購入は見つかりませんでした")); if (bought) closePay(); }
    catch (e) { toast("復元できませんでした"); }
    renderBadge(); renderBuy(); if (!$("tab-settings").hidden) renderSettings();
  }
  $("buyBtn").onclick = $("payBuy").onclick = buy;
  $("restoreBtn").onclick = $("payRestore").onclick = restorePurchase;

  // ---- 審査用コード（Android 版だけ）。設定の「購入を復元する」を長押し（1.2 秒）か 5 回続けてタップで入力欄を出す。
  // コードの照合はネイティブ側（SHA-256 だけを持つ）。iOS にはこのメソッド自体がないので何も起きない。
  if (platform === "android") {
    let taps = 0, tapTimer = 0, pressTimer = 0;
    const b = $("restoreBtn");
    const askCode = async () => {
      if (!P.SeikyushoStore || !P.SeikyushoStore.checkReviewCode) return;
      const code = window.prompt("審査用コード");
      if (!code) return;
      try {
        const r = await P.SeikyushoStore.checkReviewCode({ code });
        if (C.applyReviewCode(data.settings, platform, r && r.ok)) { await save(true); refreshPro(); toast("審査用に解除しました（この端末だけ）"); renderBadge(); renderBuy(); if (!$("tab-settings").hidden) renderSettings(); }
        else toast("コードが違います");
      } catch (e) { toast("確認できませんでした"); }
    };
    b.addEventListener("click", () => { taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 2500); if (taps >= 5) { taps = 0; askCode(); } });
    b.addEventListener("pointerdown", () => { pressTimer = setTimeout(askCode, 1200); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, () => clearTimeout(pressTimer)));
  }
  function openPay(title) { $("payTitle").textContent = title; $("payModal").hidden = false; renderBuy(); }
  function closePay() { $("payModal").hidden = true; }
  $("payLater").onclick = closePay;
  $("payModal").onclick = e => { if (e.target === $("payModal")) closePay(); };

  // ---- レビューのお願い（ストア標準のダイアログ。出すかどうかはストアが決める）
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
