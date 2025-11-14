/*
  Phiếu nhập hàng – hoàn chỉnh (imports.js)
  - Lưu phiếu vào admin.inventoryReceipts
  - Hoàn thành phiếu: +qty vào admin.products và ghi giao dịch admin.stock (type:'import')
  - Snapshot productCode/productName cho mỗi dòng
  - Tự đồng bộ storefront (sv_products_v1) và phát stock.bump/catalog.bump
  - Render tức thì bằng cache + uiReloadSoon(); lắng nghe storage để auto reload
*/
(function () {
  // ===== Storage Keys =====
  const PROD_KEY = "admin.products";
  const RECEIPT_KEY = "admin.inventoryReceipts";
  const CAT_KEY = "admin.categories";
  const TX_KEY = "admin.stock"; // giao dịch kho
  const PUBLIC_CATALOG_KEY = "sv_products_v1";

  // ===== Helpers =====
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
  const money = (x) => (Number(x) || 0).toLocaleString("vi-VN");
  const today = () => new Date().toISOString().slice(0, 10);
  const genId = (p = "PN") =>
    p +
    "_" +
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4);
  const nextCode = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const seq = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    return `PN-${y}${m}${day}-${seq}`;
  };
  function jget(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k) || JSON.stringify(d));
    } catch {
      return d;
    }
  }
  function jset(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }
  function esc(s) {
    return String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)
    );
  }
  const ping = (k) => {
    try {
      localStorage.setItem(k, String(Date.now()));
    } catch {}
  };

  // ===== In-memory cache (để render nhanh) =====
  let _RECEIPTS_CACHE = null;
  function receiptsRead() {
    if (!_RECEIPTS_CACHE) {
      _RECEIPTS_CACHE = jget(RECEIPT_KEY, []).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
    }
    return _RECEIPTS_CACHE;
  }
  function receiptsWrite(arr) {
    _RECEIPTS_CACHE = (arr || []).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    jset(RECEIPT_KEY, _RECEIPTS_CACHE);
    ping("receipts.bump");
  }
  const uiReloadSoon = () =>
    requestAnimationFrame(() => requestAnimationFrame(reload));

  // ===== Products Repo =====
  function listProducts() {
    return jget(PROD_KEY, []);
  }
  function saveProducts(arr) {
    jset(PROD_KEY, arr || []);
    try {
      if (typeof syncToStorefront === "function") syncToStorefront(arr);
      else localSyncStorefront(arr);
    } catch {}
    ping("catalog.bump");
  }
  function getProductById(id) {
    return listProducts().find((p) => String(p.id) === String(id));
  }

  // ===== Stock Transactions Repo =====
  function listTx() {
    return jget(TX_KEY, []);
  }
  function saveTx(arr) {
    jset(TX_KEY, arr || []);
    ping("stock.bump");
  }

  // ===== Minimal sync storefront (fallback) =====
  function localSyncStorefront(prods) {
    const cats = jget(CAT_KEY, []);
    const nameOf = (cid) =>
      (cats.find((c) => String(c.id) === String(cid)) || {}).name || "other";
    const slug = (s) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    const list = (prods || [])
      .filter((p) => (p.status || "selling") === "selling")
      .map((p) => ({
        id: p.seedId || `admin-${p.id}`,
        name: p.name,
        brand: p.supplier || "",
        category: slug(nameOf(p.categoryId)),
        price: Number(p.price) || 0,
        image: p.image || "/assets/img/placeholder.png",
        images: p.image ? [p.image] : [],
        badge: "",
        featured: false,
        short_desc: p.desc || "",
        long_desc: p.desc || "",
        specs: { "Đơn vị": p.uom || "", Mã: p.code || "" },
        unit: p.uom || "",
        quantity: 1,
        min_qty: 1,
        max_qty: Math.max(1, Number(p.qty) || 1),
        stock: Number(p.qty) || 0,
        tags: [],
        details: [],
        usage: [],
      }));
    jset(PUBLIC_CATALOG_KEY, list);
  }

  // ===== Receipts Repo =====
  function listReceipts() {
    return receiptsRead();
  }
  function saveReceipts(arr) {
    receiptsWrite(arr);
  }
  function getReceiptById(id) {
    return listReceipts().find((r) => r.id === id);
  }
  function calcTotals(items) {
    const totalCost = (items || []).reduce(
      (s, it) => s + Number(it.costPrice || 0) * Number(it.quantity || 0),
      0
    );
    const totalQty = (items || []).reduce(
      (s, it) => s + Number(it.quantity || 0),
      0
    );
    return { totalCost, totalQty };
  }
  function normalizeItems(items) {
    return (items || []).map((it) => {
      const p = getProductById(it.productId);
      return {
        productId: it.productId,
        // snapshot
        productCode: it.productCode || p?.code || "",
        productName: it.productName || p?.name || "",
        lotCode: (it.lotCode || "").trim() || `LOT-${Date.now()}`,
        costPrice: Number(it.costPrice || 0),
        quantity: Number(it.quantity || 0),
      };
    });
  }
  function createReceipt({ date, supplier, note, items }) {
    const all = listReceipts();
    const id = genId("PN");
    const code = nextCode();
    const norm = normalizeItems(items);
    const { totalCost, totalQty } = calcTotals(norm);
    const rec = {
      id,
      code,
      date: date || today(),
      supplier: supplier || "",
      note: note || "",
      status: "draft",
      items: norm,
      totalCost,
      totalQty,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(rec);
    saveReceipts(all);
    uiReloadSoon();
    return rec;
  }
  function updateReceipt(id, patch) {
    const all = listReceipts();
    const i = all.findIndex((r) => r.id === id);
    if (i < 0) throw new Error("Không tìm thấy phiếu");
    if (all[i].status !== "draft")
      throw new Error("Chỉ được sửa khi phiếu đang DRAFT");

    const cur = all[i];
    const merged = { ...cur, ...patch };

    if (patch.items) {
      merged.items = normalizeItems(patch.items);
      const t = calcTotals(merged.items);
      merged.totalCost = t.totalCost;
      merged.totalQty = t.totalQty;
    }
    merged.updatedAt = Date.now();

    all[i] = merged;
    saveReceipts(all);
    uiReloadSoon();
    return merged;
  }

  function completeReceipt(id) {
    const all = listReceipts();
    const i = all.findIndex((r) => r.id === id);
    if (i < 0) throw new Error("Không tìm thấy phiếu");
    const rec = all[i];
    if (rec.status !== "draft") throw new Error("Phiếu đã hoàn thành");

    // 1) Cộng tồn sản phẩm + ghi batches
    let prods = listProducts();
    rec.items.forEach((it) => {
      const idx = prods.findIndex((p) => String(p.id) === String(it.productId));
      if (idx < 0) return; // skip nếu SP đã bị xóa
      const p = prods[idx];
      const newQty = Number(p.qty || 0) + Number(it.quantity || 0);
      const batches = Array.isArray(p.batches) ? p.batches.slice() : [];
      batches.push({
        lotCode: it.lotCode,
        quantity: Number(it.quantity || 0),
        costPrice: Number(it.costPrice || 0),
        dateIn: rec.date,
        receiptCode: rec.code,
      });
      prods[idx] = { ...p, qty: newQty, batches };
    });
    saveProducts(prods);

    // 2) Ghi giao dịch kho (admin.stock)
    const tx = listTx();
    rec.items.forEach((it) => {
      tx.push({
        id: genId("STK"),
        productId: it.productId,
        type: "import",
        qty: Number(it.quantity || 0),
        costPrice: Number(it.costPrice || 0),
        lotCode: it.lotCode,
        note: `Phiếu ${rec.code}${rec.supplier ? " - " + rec.supplier : ""}`,
        ref: rec.id,
        createdAt: rec.date, // dùng ngày phiếu làm mốc thời gian
      });
    });
    saveTx(tx); // -> phát stock.bump

    // 3) Cập nhật trạng thái phiếu
    rec.status = "completed";
    rec.completedAt = Date.now();
    rec.updatedAt = Date.now();
    all[i] = rec;
    saveReceipts(all);

    uiReloadSoon();
    return rec;
  }

  // ===== UI =====
  const $tbody = $("#rcp-body");
  const $q = $("#f_q");
  const $st = $("#f_status");
  const $from = $("#f_from");
  const $to = $("#f_to");
  const $btnFilter = $("#btnFilter");
  const $btnNew = $("#btn-new");

  const $modal = $("#pn-modal");
  const $title = $("#pn-title");
  const $date = $("#pn_date");
  const $supplier = $("#pn_supplier");
  const $note = $("#pn_note");
  const $sprod = $("#s_prod");
  const $btnAddLine = $("#btnAddLine");
  const $sumQty = $("#sumQty");
  const $sumCost = $("#sumCost");
  const $meta = $("#pn-meta");
  const $btnSave = $("#btnSave");
  const $btnComplete = $("#btnComplete");
  const $btnClose = $("#btn-close");
  const $lines = $("#tblLines tbody");

  let STATE = { id: null, status: "draft", items: [] };

  function openModal() {
    $modal.classList.add("show");
    $modal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    $modal.classList.remove("show");
    $modal.setAttribute("aria-hidden", "true");
  }

  function searchProducts(keyword) {
    const kw = String(keyword || "")
      .trim()
      .toLowerCase();
    if (!kw) return [];
    return listProducts()
      .filter((p) =>
        `${p.code || ""} ${p.name || ""}`.toLowerCase().includes(kw)
      )
      .slice(0, 10);
  }

  function recalc() {
    const sumQ = STATE.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
    const sumC = STATE.items.reduce(
      (s, it) => s + Number(it.quantity || 0) * Number(it.costPrice || 0),
      0
    );
    $sumQty.textContent = money(sumQ);
    $sumCost.textContent = money(sumC);
  }

  function lineRow(it, idx) {
    const p = getProductById(it.productId);
    const code = it.productCode || p?.code || "";
    const name = it.productName || p?.name || "(đã xóa)";
    const ro = STATE.status !== "draft";
    return `
      <tr data-idx="${idx}">
        <td>${esc(code)} – ${esc(name)}</td>
        <td>${
          ro
            ? esc(it.lotCode || "")
            : `<input data-f="lot" class="input" style="min-width:140px" value="${esc(
                it.lotCode || ""
              )}">`
        }</td>
        <td style="text-align:right">${
          ro
            ? money(it.costPrice)
            : `<input data-f="cost" type="number" class="input" style="width:140px;text-align:right" value="${Number(
                it.costPrice || 0
              )}">`
        }</td>
        <td style="text-align:right">${
          ro
            ? money(it.quantity)
            : `<input data-f="qty" type="number" class="input" style="width:120px;text-align:right" value="${Number(
                it.quantity || 0
              )}">`
        }</td>
        <td>${
          ro ? "" : '<button class="btn sm" data-act="rm">Xóa</button>'
        }</td>
      </tr>
    `;
  }
  function renderLines() {
    $lines.innerHTML = STATE.items.map((it, i) => lineRow(it, i)).join("");
    recalc();
  }

  function reload() {
    const q = ($q.value || "").trim().toLowerCase();
    const status = $st.value || undefined;
    const from = $from.value ? new Date($from.value) : null;
    const to = $to.value ? new Date($to.value) : null;

    const rows = listReceipts().filter((r) => {
      if (status && r.status !== status) return false;
      const d = new Date(r.date);
      if (from && d < from) return false;
      if (to && d > to) return false;

      if (q) {
        const hay = `${r.code} ${r.supplier || ""} ${
          r.note || ""
        }`.toLowerCase();
        const itemMatch = (r.items || []).some((it) => {
          const p = getProductById(it.productId);
          const code = (it.productCode || p?.code || "").toLowerCase();
          const name = (it.productName || p?.name || "").toLowerCase();
          return `${code} ${name}`.includes(q);
        });
        if (!hay.includes(q) && !itemMatch) return false;
      }
      return true;
    });

    if (!rows.length) {
      $tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#9aa3ad;padding:20px">Không có dữ liệu</td></tr>';
      return;
    }

    $tbody.innerHTML = rows
      .map((r) => {
        // danh sách sản phẩm (tối đa 2) + tooltip đầy đủ
        const productList = (r.items || []).map((it) => {
          const p = getProductById(it.productId);
          const code = it.productCode || p?.code || "";
          const name = it.productName || p?.name || "(đã xóa)";
          return `${code} – ${name}`;
        });
        const preview = productList.slice(0, 2).join(", ");
        const more =
          productList.length > 2 ? ` (+${productList.length - 2} sp)` : "";
        const title = esc(productList.join("\n"));

        return `
          <tr>
            <td><b>${esc(r.code)}</b></td>
            <td>${esc(r.date)}</td>
            <td title="${title}">${esc(preview)}${more}</td>
            <td>${esc(r.supplier || "-")}</td>
            <td class="num">${money(r.totalQty)}</td>
            <td class="num">${money(r.totalCost)}</td>
            <td>${esc(r.status)}</td>
            <td>
              <button class="btn sm" data-act="view" data-id="${
                r.id
              }">Xem</button>
              ${
                r.status === "draft"
                  ? `<button class="btn sm" data-act="edit" data-id="${r.id}">Sửa</button>`
                  : ""
              }
              ${
                r.status === "draft"
                  ? `<button class="btn sm primary" data-act="complete" data-id="${r.id}">Hoàn thành</button>`
                  : ""
              }
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function openForm(id, readonly = false) {
    const cur = id ? getReceiptById(id) : null;
    STATE = cur
      ? {
          id: cur.id,
          status: cur.status,
          items: JSON.parse(JSON.stringify(cur.items || [])),
        }
      : { id: null, status: "draft", items: [] };

    $title.textContent = cur
      ? readonly
        ? "Xem phiếu nhập"
        : "Sửa phiếu nhập"
      : "Tạo phiếu nhập";
    $date.value = cur ? cur.date : today();
    $supplier.value = cur?.supplier || "";
    $note.value = cur?.note || "";
    $meta.innerHTML = cur
      ? `Mã phiếu: <b>${esc(cur.code)}</b> – Trạng thái: <b>${esc(
          cur.status
        )}</b>`
      : "";

    const canEdit = !readonly && (!cur || cur.status === "draft");
    $btnSave.style.display = canEdit ? "inline-flex" : "none";
    $btnComplete.style.display =
      cur && cur.status === "draft" ? "inline-flex" : "none";

    renderLines();
    openModal();
  }

  // ===== Events (modal) =====
  $btnClose?.addEventListener("click", closeModal);
  $modal?.addEventListener("click", (e) => {
    if (e.target === $modal) closeModal();
  });

  // add line
  $btnAddLine?.addEventListener("click", () => {
    const kw = ($sprod.value || "").trim();
    const found = searchProducts(kw);
    if (!found.length) {
      alert("Không tìm thấy sản phẩm phù hợp");
      return;
    }
    const p = found[0];
    const lot = prompt(`Nhập mã lô cho ${p.name}`, `LOT-${Date.now()}`);
    if (lot === null) return;
    const cost = Number(prompt("Giá nhập", "100000") || 0);
    const qty = Number(prompt("Số lượng", "1") || 0);
    if (!qty || qty < 0) return;

    STATE.items.push({
      productId: p.id,
      productCode: p.code || "",
      productName: p.name || "",
      lotCode: lot,
      costPrice: cost,
      quantity: qty,
    });
    renderLines();
  });

  // edit/remove line
  $lines.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.getAttribute("data-idx"));
    const f = e.target.getAttribute("data-f");
    if (!f) return;
    const v = e.target.value;
    if (f === "qty" || f === "cost") {
      STATE.items[idx][f === "qty" ? "quantity" : "costPrice"] = Number(v || 0);
    } else if (f === "lot") {
      STATE.items[idx].lotCode = v;
    }
    recalc();
  });
  $lines.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-act="rm"]');
    if (!btn) return;
    const tr = btn.closest("tr");
    const idx = Number(tr.getAttribute("data-idx"));
    STATE.items.splice(idx, 1);
    renderLines();
  });

  // save draft
  $btnSave?.addEventListener("click", () => {
    const data = {
      date: $date.value || today(),
      supplier: $supplier.value,
      note: $note.value,
      items: STATE.items,
    };
    try {
      if (STATE.id) {
        updateReceipt(STATE.id, data);
      } else {
        const r = createReceipt(data);
        STATE.id = r.id;
      }
      alert("Đã lưu phiếu (draft)");
      closeModal();
      uiReloadSoon();
    } catch (err) {
      alert(err.message || err);
    }
  });

  // complete
  $btnComplete?.addEventListener("click", () => {
    if (!STATE.id) {
      alert("Hãy lưu phiếu trước khi hoàn thành");
      return;
    }
    if (
      !confirm(
        "Xác nhận hoàn thành phiếu?\nSau khi hoàn thành sẽ cộng tồn kho, ghi giao dịch và KHÔNG thể sửa."
      )
    )
      return;
    try {
      completeReceipt(STATE.id);
      alert("Đã hoàn thành phiếu và cộng tồn kho");
      closeModal();
      uiReloadSoon();
    } catch (err) {
      alert(err.message || err);
    }
  });

  // list actions
  $btnFilter?.addEventListener("click", reload);
  $tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    if (act === "view") openForm(id, true);
    if (act === "edit") openForm(id, false);
    if (act === "complete") {
      const rec = getReceiptById(id);
      if (!rec) return alert("Không tìm thấy phiếu");
      if (rec.status !== "draft") return alert("Phiếu đã hoàn thành");
      if (!confirm(`Xác nhận hoàn thành phiếu ${rec.code}?`)) return;
      try {
        completeReceipt(id);
        alert("Đã hoàn thành");
        uiReloadSoon();
      } catch (err) {
        alert(err.message || err);
      }
    }
  });

  // toolbar new
  $btnNew?.addEventListener("click", () => {
    if ($st) $st.value = "";
    openForm(null, false);
  });

  // ===== Seed rỗng cho admin.stock nếu chưa có (tránh lỗi parse) =====
  (function seedTxIfMissing() {
    if (!localStorage.getItem(TX_KEY)) jset(TX_KEY, []);
  })();

  // ===== Init + listeners =====
  (function init() {
    $date.value = today();
    reload();
  })();

  // Lắng nghe thay đổi từ tab khác
  window.addEventListener("storage", (e) => {
    const keys = [
      RECEIPT_KEY,
      "receipts.bump",
      TX_KEY,
      "stock.bump",
      PROD_KEY,
      "catalog.bump",
    ];
    if (keys.includes(e.key)) {
      // refresh cache & UI
      _RECEIPTS_CACHE = null;
      reload();
    }
  });
})();
