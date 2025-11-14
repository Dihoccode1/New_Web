/*
  inventory.js – Tồn kho & Báo cáo (full, đã fix)
  Kết nối trực tiếp với:
    admin.categories : [{id, code, name, active, ...}]
    admin.products   : [{id, code, name, categoryId, qty, status, ...}]
    admin.stock      : [{id, productId, type:'import'|'export'|'adjust', qty, note, ref, createdAt}]
*/

(function () {
  const LS_CATS = "admin.categories";
  const LS_PRODS = "admin.products";
  const LS_TX = "admin.stock";

  const $ = (s) => document.querySelector(s);
  const fmtInt = (n) => Number(n || 0).toLocaleString("vi-VN");

  const state = { cats: [], prods: [], txs: [] };

  // Helpers đọc/ghi
  function loadJSON(key, def) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch {
      return def;
    }
  }
  function saveJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // Bootstrap admin.* từ catalog public nếu trống
  function bootstrapAdminFromCatalogIfEmpty() {
    const prodsCurr = loadJSON(LS_PRODS, []);
    const catsCurr = loadJSON(LS_CATS, []);
    const hasProds = prodsCurr.length > 0;
    const hasCats = catsCurr.length > 0;
    if (hasProds && hasCats) return;

    let publicArr = [];
    try {
      publicArr = JSON.parse(localStorage.getItem("sv_products_v1") || "[]");
    } catch {}
    if (
      (!publicArr || !publicArr.length) &&
      Array.isArray(window.SV_PRODUCT_SEED)
    ) {
      publicArr = window.SV_PRODUCT_SEED;
    }
    if (!publicArr || !publicArr.length) return; // không có gì để bootstrap

    // categories
    const catMap = new Map();
    publicArr.forEach((p) => {
      const cid = String(
        p.categoryId ?? p.category ?? p.cat ?? p.slug ?? ""
      ).trim();
      if (!cid) return;
      if (!catMap.has(cid)) {
        catMap.set(cid, {
          id: cid,
          code: (cid.toUpperCase().replace(/\W+/g, "_") || "CAT_" + cid).slice(
            0,
            24
          ),
          name: String(p.categoryName ?? p.category ?? p.cat ?? cid),
          desc: "",
          active: true,
        });
      }
    });
    const cats = hasCats ? catsCurr : Array.from(catMap.values());

    // products
    const prods = hasProds
      ? prodsCurr
      : publicArr.map((p, i) => ({
          id: p.id ?? p.code ?? Date.now() + i,
          code: String(
            p.code ?? p.sku ?? p.id ?? "SP" + (1000 + i)
          ).toUpperCase(),
          name: String(p.name ?? "Sản phẩm " + (i + 1)),
          categoryId: String(
            p.categoryId ?? p.category ?? p.cat ?? p.slug ?? ""
          ),
          qty: Number(p.qty ?? p.stock ?? 0),
          status: p.status ?? "selling",
        }));

    saveJSON(LS_CATS, cats);
    saveJSON(LS_PRODS, prods);
  }

  // Seed tối thiểu admin.stock (mảng rỗng nếu chưa có)
  (function seedStock() {
    if (!localStorage.getItem(LS_TX)) saveJSON(LS_TX, []);
  })();

  // gọi bootstrap trước khi loadAll
  bootstrapAdminFromCatalogIfEmpty();

  function loadAll() {
    state.cats = loadJSON(LS_CATS, []);
    state.prods = loadJSON(LS_PRODS, []);
    state.txs = loadJSON(LS_TX, []);
  }

  // Helpers
  function catName(id) {
    return state.cats.find((c) => String(c.id) === String(id))?.name || "—";
  }

  // Số lượng hiện tại: đọc từ admin.products.qty
  function currentQty(productId) {
    const p = state.prods.find((x) => String(x.id) === String(productId));
    return Number(p?.qty || 0);
  }

  // Tính tồn tại thời điểm at: từ tồn hiện tại trừ phát sinh SAU thời điểm đó
  function stockOn(productId, at) {
    const atTS = at ? new Date(at).getTime() : Date.now();
    const nowTS = Date.now();
    if (atTS >= nowTS - 1000) return currentQty(productId);

    let deltaAfter = 0;
    for (const t of state.txs) {
      if (String(t.productId) !== String(productId)) continue;
      const ts = new Date(
        t.createdAt || t.date || t.time || new Date()
      ).getTime();
      if (ts > atTS) {
        const q = Number(t.qty || 0);
        if (t.type === "import") deltaAfter += q;
        else if (t.type === "export") deltaAfter -= q;
        else if (t.type === "adjust") deltaAfter += q; // dương/âm tuỳ phiếu
      }
    }
    return currentQty(productId) - deltaAfter;
  }
  const stockNow = (productId) => stockOn(productId, new Date());

  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }

  // ==== Fill dropdown ====
  function fillProductSelect(sel, includeAll = true) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return;
    const opts = [];
    if (includeAll) opts.push('<option value="">— tất cả —</option>');
    const list = state.prods
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "vi")
      );
    for (const p of list) {
      opts.push(
        `<option value="${p.id}">${escapeHtml(p.code || "")} — ${escapeHtml(
          p.name || ""
        )}</option>`
      );
    }
    el.innerHTML = opts.join("");
  }

  function fillCategorySelect(sel, includeAll = true) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return;
    const opts = [];
    if (includeAll) opts.push('<option value="">— tất cả —</option>');
    const list = state.cats
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "vi")
      );
    for (const c of list) {
      if (c.active === false) continue;
      opts.push(`<option value="${c.id}">${escapeHtml(c.name || "")}</option>`);
    }
    el.innerHTML = opts.join("");
  }

  // ==== Khối 1: Tra cứu tồn tại thời điểm ====
  function handleCheckAt() {
    const pid = $("#f-product")?.value || "";
    const cid = $("#f-category")?.value || "";
    const atVal = $("#f-at")?.value;
    const at = atVal ? new Date(atVal) : new Date();

    const list = state.prods.filter((p) => {
      if (pid && String(p.id) !== String(pid)) return false;
      if (cid && String(p.categoryId) !== String(cid)) return false;
      return true;
    });

    const target = $("#at-result");
    if (!target) return;

    if (!list.length) {
      target.innerHTML =
        '<span class="muted">Không có sản phẩm phù hợp bộ lọc.</span>';
      return;
    }

    const rows = list
      .map((p) => {
        const qty = stockOn(p.id, at);
        return `
          <tr>
            <td>${escapeHtml(p.code || "")}</td>
            <td><strong>${escapeHtml(p.name || "")}</strong></td>
            <td>${escapeHtml(catName(p.categoryId))}</td>
            <td class="num">${fmtInt(qty)}</td>
          </tr>
        `;
      })
      .join("");

    const when = at.toLocaleString("vi-VN");
    target.innerHTML = `
      <div class="recentOrders" style="margin-top:8px">
        <div class="muted">Kết quả tại thời điểm: <span class="nowrap">${when}</span></div>
        <table style="margin-top:6px">
          <thead>
            <tr><td>Mã</td><td>Tên sản phẩm</td><td>Loại</td><td class="num">Tồn</td></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
  function resetCheckAt() {
    if ($("#f-product")) $("#f-product").value = "";
    if ($("#f-category")) $("#f-category").value = "";
    if ($("#f-at")) $("#f-at").value = "";
    if ($("#at-result"))
      $("#at-result").innerHTML =
        '<span class="muted">Chọn sản phẩm/loại và thời điểm để tra cứu tồn.</span>';
  }

  // ==== Khối 2: Báo cáo nhập – xuất – tồn ====
  function runReport() {
    const sumEl = $("#summary");
    const body = $("#report-body");
    if (!body) return;

    const fromVal = $("#r-from")?.value;
    const toVal = $("#r-to")?.value;
    const cid = $("#r-category")?.value || "";

    let fromTS = null,
      toTS = null;

    if (fromVal) {
      const d = new Date(fromVal);
      fromTS = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        0,
        0,
        0,
        0
      ).getTime();
    }
    if (toVal) {
      const d = new Date(toVal);
      toTS = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
        999
      ).getTime();
    }

    const products = state.prods.filter((p) => {
      if (cid && String(p.categoryId) !== String(cid)) return false;
      return true;
    });

    const rows = [];
    for (const p of products) {
      const begin = fromTS == null ? 0 : stockOn(p.id, new Date(fromTS - 1));
      let imp = 0;
      let exp = 0;

      for (const t of state.txs) {
        if (String(t.productId) !== String(p.id)) continue;
        const ts = new Date(
          t.createdAt || t.date || t.time || new Date()
        ).getTime();

        if ((fromTS == null || ts >= fromTS) && (toTS == null || ts <= toTS)) {
          const q = Number(t.qty || 0);
          if (t.type === "import") imp += q;
          else if (t.type === "export") exp += q;
          else if (t.type === "adjust") {
            if (q >= 0) imp += q;
            else exp += Math.abs(q);
          }
        }
      }

      const end = begin + imp - exp;

      rows.push({
        id: p.id,
        code: p.code,
        name: p.name,
        categoryId: p.categoryId,
        begin,
        imp,
        exp,
        end,
      });
    }

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#9aa3ad;padding:14px">Không có dữ liệu</td></tr>';
      if (sumEl) sumEl.textContent = "";
      window.__INV_LAST_REPORT__ = [];
      return;
    }

    body.innerHTML = rows
      .map(
        (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><code>${escapeHtml(r.code || "")}</code></td>
          <td><strong>${escapeHtml(r.name || "")}</strong></td>
          <td>${escapeHtml(catName(r.categoryId))}</td>
          <td class="num">${fmtInt(r.begin)}</td>
          <td class="num">${fmtInt(r.imp)}</td>
          <td class="num">${fmtInt(r.exp)}</td>
          <td class="num"><strong>${fmtInt(r.end)}</strong></td>
        </tr>
      `
      )
      .join("");

    const sumBegin = rows.reduce((t, x) => t + x.begin, 0);
    const sumImp = rows.reduce((t, x) => t + x.imp, 0);
    const sumExp = rows.reduce((t, x) => t + x.exp, 0);
    const sumEnd = rows.reduce((t, x) => t + x.end, 0);

    if (sumEl) {
      sumEl.textContent = `Tổng: Tồn đầu ${fmtInt(sumBegin)} • Nhập ${fmtInt(
        sumImp
      )} • Xuất ${fmtInt(sumExp)} • Tồn cuối ${fmtInt(sumEnd)}`;
    }

    window.__INV_LAST_REPORT__ = rows;
  }

  function exportCSV() {
    const rows = window.__INV_LAST_REPORT__ || [];
    if (!rows.length) {
      alert("Chưa có dữ liệu để xuất.");
      return;
    }
    const header = [
      "STT",
      "Ma",
      "Ten",
      "Loai",
      "TonDau",
      "Nhap",
      "Xuat",
      "TonCuoi",
    ];
    const lines = [header.join(",")];

    rows.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          csv(r.code),
          csv(r.name),
          csv(catName(r.categoryId)),
          r.begin,
          r.imp,
          r.exp,
          r.end,
        ].join(",")
      );
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bao_cao_nhap_xuat_ton.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    function csv(v) {
      return `"${String(v ?? "").replace(/"/g, '""')}"`;
    }
  }

  // ==== Khối 3: Cảnh báo sắp hết ====
  function checkLow() {
    const th = Number($("#low-threshold")?.value || 5);
    const cid = $("#low-category")?.value || "";

    const list = state.prods.filter((p) => {
      if (cid && String(p.categoryId) !== String(cid)) return false;
      return true;
    });

    const rows = list
      .map((p) => ({ p, qty: stockNow(p.id) }))
      .filter((x) => x.qty <= th);

    const body = $("#low-body");
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#16a34a;padding:14px">Tốt! Không có sản phẩm nào ≤ ${fmtInt(
        th
      )}.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(
        (x, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><code>${escapeHtml(x.p.code || "")}</code></td>
          <td><strong>${escapeHtml(x.p.name || "")}</strong></td>
          <td>${escapeHtml(catName(x.p.categoryId))}</td>
          <td class="num">${fmtInt(x.qty)}</td>
          <td><span class="status low">Sắp hết</span></td>
        </tr>
      `
      )
      .join("");
  }

  // ==== Init UI ====
  function initUI() {
    fillProductSelect("#f-product", true);
    fillCategorySelect("#f-category", true);
    fillCategorySelect("#r-category", true);
    fillCategorySelect("#low-category", true);

    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    if ($("#r-from")) $("#r-from").value = toInputDate(new Date(y, m, 1));
    if ($("#r-to")) $("#r-to").value = toInputDate(new Date(y, m + 1, 0));
    if ($("#at-result")) {
      $("#at-result").innerHTML =
        '<span class="muted">Chọn sản phẩm/loại và thời điểm để tra cứu tồn.</span>';
    }
  }

  function toInputDate(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function bindEvents() {
    $("#btn-check")?.addEventListener("click", handleCheckAt);
    $("#btn-reset-check")?.addEventListener("click", resetCheckAt);
    $("#btn-run-report")?.addEventListener("click", runReport);
    $("#btn-export-csv")?.addEventListener("click", exportCSV);
    $("#btn-check-low")?.addEventListener("click", checkLow);
  }

  // Boot
  function boot() {
    loadAll();
    initUI();
    bindEvents();
  }
  boot();

  // Lắng nghe thay đổi từ Phiếu nhập / Sản phẩm / Kho (tab khác)
  window.addEventListener("storage", (e) => {
    if ([LS_CATS, LS_PRODS, LS_TX].includes(e.key)) {
      loadAll();
      initUI();
    }
  });
})();
