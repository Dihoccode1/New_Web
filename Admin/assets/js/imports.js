/* ============================================================
   IMPORTS.JS — Quản lý phiếu nhập hàng (bản dùng NCC theo tên SP)
   - Xoá phiếu mẫu cũ (1 phiếu nhiều sản phẩm, NCC = "Nhà cung cấp mẫu")
   - Phiếu mẫu mới: mỗi phiếu 1 sản phẩm
   - Nhà cung cấp được suy ra từ tên sản phẩm:
     Davines, TIGI, Kevin Murphy, Butterfly Shadow,
     Luxurious, Apestomen, Hanz de Fuko
   ============================================================ */

(function () {
  // ===== Storage Keys =====
  const PROD_KEY = "admin.products";
  const RECEIPT_KEY = "admin.inventoryReceipts";
  const CAT_KEY = "admin.categories";
  const TX_KEY = "admin.stock";
  const PUBLIC_CATALOG_KEY = "sv_products_v1";

  // ===== Từ khóa nhà cung cấp =====
  const SUPPLIER_KEYWORDS = [
    { key: "davines", name: "Davines" },
    { key: "tigi", name: "TIGI" },
    { key: "kevin murphy", name: "Kevin Murphy" },
    { key: "butterfly shadow", name: "Butterfly Shadow" },
    { key: "luxurious", name: "Luxurious" },
    { key: "apestomen", name: "Apestomen" },
    { key: "hanz de fuko", name: "Hanz de Fuko" },
  ];
  const SUPPLIER_NAMES = SUPPLIER_KEYWORDS.map((s) => s.name);

  // Đoán nhà cung cấp từ tên sản phẩm (ưu tiên theo key, nếu không thấy thì fallback)
  function detectSupplierByName(productName, fallbackIndex = 0) {
    const n = String(productName || "").toLowerCase();
    if (n) {
      for (const s of SUPPLIER_KEYWORDS) {
        if (n.includes(s.key)) return s.name;
      }
    }
    // fallback để vẫn có NCC nhìn cho đẹp
    return SUPPLIER_NAMES[fallbackIndex % SUPPLIER_NAMES.length];
  }

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

  // ===== Cache receipts =====
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

  // ===== Products Repo =====
  function listProducts() {
    return jget(PROD_KEY, []);
  }
  function saveProducts(arr) {
    jset(PROD_KEY, arr || []);
    ping("catalog.bump");
  }
  function getProductById(id) {
    return listProducts().find((p) => String(p.id) === String(id));
  }

  // ===== Stock Transactions =====
  function listTx() {
    return jget(TX_KEY, []);
  }
  function saveTx(arr) {
    jset(TX_KEY, arr || []);
    ping("stock.bump");
  }

  // ===== Totals =====
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

  // ===== Normalize items =====
  function normalizeItems(items) {
    return (items || []).map((it) => {
      const p = getProductById(it.productId);
      return {
        productId: it.productId,
        productCode: it.productCode || p?.code || "",
        productName: it.productName || p?.name || "",
        lotCode: (it.lotCode || "").trim() || `LOT-${Date.now()}`,
        costPrice: Number(it.costPrice || 0),
        quantity: Number(it.quantity || 0),
      };
    });
  }

  /* ============================================================
   MIGRATION 1: xoá phiếu mẫu cũ (1 phiếu nhiều sản phẩm)
   Điều kiện xoá:
   - supplier === "Nhà cung cấp mẫu"
   - status === "completed"
   - items.length > 1
   ============================================================ */
  function removeOldSampleReceiptV1() {
    const list = jget(RECEIPT_KEY, []);
    if (!list.length) return;
    const filtered = list.filter(
      (r) =>
        !(
          r &&
          r.supplier === "Nhà cung cấp mẫu" &&
          r.status === "completed" &&
          Array.isArray(r.items) &&
          r.items.length > 1
        )
    );
    if (filtered.length !== list.length) {
      receiptsWrite(filtered);
    }
  }

  /* ============================================================
   MIGRATION 2: cập nhật supplier phiếu mẫu theo tên sản phẩm
   - Nhận diện phiếu mẫu: note bắt đầu "Phiếu nhập mẫu cho sản phẩm"
   - Lấy tên sản phẩm từ item.productName hoặc từ products
   - supplier = detectSupplierByName(productName)
   ============================================================ */
  function migrateSampleSuppliersByProductName() {
    const list = jget(RECEIPT_KEY, []);
    if (!list.length) return;
    let idx = 0;
    let changed = false;

    list.forEach((r) => {
      if (
        r &&
        r.status === "completed" &&
        typeof r.note === "string" &&
        r.note.startsWith("Phiếu nhập mẫu cho sản phẩm") &&
        Array.isArray(r.items) &&
        r.items.length >= 1
      ) {
        const it = r.items[0];
        const p = getProductById(it.productId);
        const name = it.productName || p?.name || "";
        const sup = detectSupplierByName(name, idx++);
        if (sup && r.supplier !== sup) {
          r.supplier = sup;
          changed = true;
        }
      }
    });

    if (changed) {
      receiptsWrite(list);
    }
  }

  /* ============================================================
   🔥 SEED PHIẾU NHẬP MẪU V2 – MỖI PHIẾU 1 SẢN PHẨM
   - Không đè dữ liệu thật
   - Mục tiêu: ~8 phiếu mẫu
   - Chỉ chạy 1 lần theo key "admin.importSeeded.v2"
   ============================================================ */
  function seedReceiptsFromProductsOnceV2() {
    const flag = "admin.importSeeded.v2";
    if (localStorage.getItem(flag) === "1") return;

    const receipts = jget(RECEIPT_KEY, []) || [];
    const prods = listProducts();
    if (!prods.length) {
      localStorage.setItem(flag, "1");
      return;
    }

    // Nhận diện phiếu mẫu v2
    const sampleReceipts = receipts.filter(
      (r) =>
        r &&
        r.status === "completed" &&
        typeof r.note === "string" &&
        r.note.startsWith("Phiếu nhập mẫu cho sản phẩm")
    );

    const currentSampleCount = sampleReceipts.length;
    const targetSample = Math.min(8, prods.length);

    if (currentSampleCount >= targetSample) {
      localStorage.setItem(flag, "1");
      receiptsWrite(receipts);
      return;
    }

    // set productId đã dùng
    const usedProductIds = new Set();
    sampleReceipts.forEach((r) => {
      const it = (r.items || [])[0];
      if (it && it.productId != null) {
        usedProductIds.add(String(it.productId));
      }
    });

    const year = new Date().getFullYear();
    const baseDate = new Date(year, 9, 28); // 28/10
    let newSampleCount = currentSampleCount;
    const newReceipts = [];

    for (let i = 0; i < prods.length; i++) {
      if (newSampleCount >= targetSample) break;
      const p = prods[i];
      if (usedProductIds.has(String(p.id))) continue;

      const group = Math.floor(newSampleCount / 3); // cứ 3 phiếu cách 2 ngày
      const dateObj = new Date(baseDate);
      dateObj.setDate(baseDate.getDate() + group * 2);
      const dateIso = dateObj.toISOString().slice(0, 10);

      const item = {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        lotCode: `SEED-${p.code}-${newSampleCount + 1}`,
        costPrice: Number(p.cost || p.price || 0),
        quantity: Math.max(1, Number(p.qty) || 5),
      };
      const totals = calcTotals([item]);

      const supplierName = detectSupplierByName(
        p.name || p.supplier || "",
        newSampleCount
      );

      newReceipts.push({
        id: genId("PN"),
        code: nextCode(),
        date: dateIso,
        supplier: supplierName,
        note: `Phiếu nhập mẫu cho sản phẩm ${p.name}`,
        status: "completed",
        items: [item],
        totalCost: totals.totalCost,
        totalQty: totals.totalQty,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
      });

      newSampleCount++;
      usedProductIds.add(String(p.id));
    }

    const merged = receipts.concat(newReceipts);
    receiptsWrite(merged);
    localStorage.setItem(flag, "1");
  }

  /* ============================================================
     CRUD Receipts
     ============================================================ */
  function listReceipts() {
    return receiptsRead();
  }
  function saveReceipts(arr) {
    receiptsWrite(arr);
  }
  function getReceiptById(id) {
    return listReceipts().find((r) => r.id === id);
  }

  function createReceipt({ date, supplier, note, items }) {
    const all = listReceipts();
    const norm = normalizeItems(items || []);
    const t = calcTotals(norm);

    const rec = {
      id: genId("PN"),
      code: nextCode(),
      date: date || today(),
      supplier: supplier || "",
      note: note || "",
      status: "draft",
      items: norm,
      totalCost: t.totalCost,
      totalQty: t.totalQty,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    all.push(rec);
    saveReceipts(all);
    return rec;
  }

  function updateReceipt(id, patch) {
    const all = listReceipts();
    const i = all.findIndex((r) => r.id === id);
    if (i < 0) throw "Không tìm thấy phiếu";
    if (all[i].status !== "draft") throw "Chỉ sửa phiếu ở trạng thái DRAFT";

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
    return merged;
  }

  function completeReceipt(id) {
    const all = listReceipts();
    const i = all.findIndex((r) => r.id === id);
    if (i < 0) throw "Không tìm thấy phiếu";
    const rec = all[i];
    if (rec.status !== "draft") throw "Phiếu đã hoàn thành";

    // cộng tồn thật
    let prods = listProducts();
    rec.items.forEach((it) => {
      const idx = prods.findIndex((p) => String(p.id) === String(it.productId));
      if (idx < 0) return;
      prods[idx].qty = Number(prods[idx].qty || 0) + Number(it.quantity || 0);
    });
    saveProducts(prods);

    rec.status = "completed";
    rec.completedAt = Date.now();
    rec.updatedAt = Date.now();
    all[i] = rec;
    saveReceipts(all);

    return rec;
  }

  /* ============================================================
     UI
     ============================================================ */

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

  function renderLines() {
    $lines.innerHTML = STATE.items
      .map((it, i) => {
        const p = getProductById(it.productId);
        const name = it.productName || p?.name || "(Đã xóa)";
        return `
          <tr data-idx="${i}">
            <td>${esc(it.productCode)} – ${esc(name)}</td>
            <td>
              <input data-f="lot" class="input" value="${esc(
                it.lotCode || ""
              )}">
            </td>
            <td style="text-align:right">
              <input data-f="cost" class="input" type="number" value="${
                it.costPrice
              }">
            </td>
            <td style="text-align:right">
              <input data-f="qty" class="input" type="number" value="${
                it.quantity
              }">
            </td>
            <td>
              <button data-act="rm" class="btn sm">Xóa</button>
            </td>
          </tr>
        `;
      })
      .join("");

    const sumQ = STATE.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
    const sumC = STATE.items.reduce(
      (s, it) => s + Number(it.quantity || 0) * Number(it.costPrice || 0),
      0
    );
    $sumQty.textContent = money(sumQ);
    $sumCost.textContent = money(sumC);
  }

  function reload() {
    const q = ($q.value || "").trim().toLowerCase();
    const st = $st.value;
    const from = $from.value ? new Date($from.value) : null;
    const to = $to.value ? new Date($to.value) : null;

    const rows = listReceipts().filter((r) => {
      if (st && r.status !== st) return false;
      const d = new Date(r.date);
      if (from && d < from) return false;
      if (to && d > to) return false;

      if (q) {
        const hay = `${r.code} ${r.supplier || ""} ${
          r.note || ""
        }`.toLowerCase();
        const matchItems = (r.items || []).some((it) =>
          `${it.productCode} ${it.productName}`.toLowerCase().includes(q)
        );
        if (!hay.includes(q) && !matchItems) return false;
      }

      return true;
    });

    if (!rows.length) {
      $tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:20px;color:#aaa">Không có dữ liệu</td></tr>';
      return;
    }

    $tbody.innerHTML = rows
      .map((r) => {
        const list = (r.items || []).map(
          (it) => `${it.productCode} – ${it.productName}`
        );
        const preview = list.slice(0, 2).join(", ");
        const more = list.length > 2 ? ` (+${list.length - 2} sp)` : "";

        return `
        <tr>
          <td><b>${r.code}</b></td>
          <td>${r.date}</td>
          <td>${preview}${more}</td>
          <td>${esc(r.supplier || "")}</td>
          <td class="num">${money(r.totalQty)}</td>
          <td class="num">${money(r.totalCost)}</td>
          <td>${r.status}</td>
          <td>
            <button data-act="view" data-id="${
              r.id
            }" class="btn sm">Xem</button>
            ${
              r.status === "draft"
                ? `<button data-act="edit" data-id="${r.id}" class="btn sm">Sửa</button>`
                : ""
            }
            ${
              r.status === "draft"
                ? `<button data-act="complete" data-id="${r.id}" class="btn sm primary">Hoàn thành</button>`
                : ""
            }
          </td>
        </tr>`;
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

    const editable = !readonly && (!cur || cur.status === "draft");
    $btnSave.style.display = editable ? "inline-flex" : "none";
    $btnComplete.style.display =
      cur && cur.status === "draft" ? "inline-flex" : "none";

    renderLines();
    $modal.classList.add("show");
    $modal.setAttribute("aria-hidden", "false");
  }

  /* EVENTS */

  $btnClose?.addEventListener("click", () => {
    $modal.classList.remove("show");
    $modal.setAttribute("aria-hidden", "true");
  });
  $modal?.addEventListener("click", (e) => {
    if (e.target === $modal) {
      $modal.classList.remove("show");
      $modal.setAttribute("aria-hidden", "true");
    }
  });

  $btnAddLine?.addEventListener("click", () => {
    const kw = ($sprod.value || "").trim().toLowerCase();
    const found = listProducts().filter((p) =>
      `${p.code} ${p.name}`.toLowerCase().includes(kw)
    );
    if (!found.length) return alert("Không tìm thấy sản phẩm");

    const p = found[0];
    const lot = prompt("Mã lô:", `LOT-${Date.now()}`);
    if (lot === null) return;
    const cost = Number(prompt("Giá nhập:", p.cost || p.price || 0));
    const qty = Number(prompt("Số lượng:", 1));

    if (!qty || qty <= 0) return;

    STATE.items.push({
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      lotCode: lot,
      costPrice: cost,
      quantity: qty,
    });

    renderLines();
  });

  $lines?.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    const f = e.target.dataset.f;
    const v = e.target.value;

    if (f === "cost") STATE.items[idx].costPrice = Number(v || 0);
    if (f === "qty") STATE.items[idx].quantity = Number(v || 0);
    if (f === "lot") STATE.items[idx].lotCode = v;

    renderLines();
  });

  $lines?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act='rm']");
    if (!btn) return;
    const tr = btn.closest("tr");
    const idx = Number(tr.dataset.idx);
    STATE.items.splice(idx, 1);
    renderLines();
  });

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
        const rec = createReceipt(data);
        STATE.id = rec.id;
      }
      alert("Đã lưu phiếu");
      $modal.classList.remove("show");
      $modal.setAttribute("aria-hidden", "true");
      reload();
    } catch (e) {
      alert(e);
    }
  });

  $btnComplete?.addEventListener("click", () => {
    if (!STATE.id) return alert("Hãy lưu phiếu trước");

    if (
      !confirm(
        "Hoàn thành phiếu? Điều này sẽ cộng tồn kho thật và không sửa phiếu được nữa."
      )
    )
      return;

    try {
      completeReceipt(STATE.id);
      alert("Đã hoàn thành");
      $modal.classList.remove("show");
      $modal.setAttribute("aria-hidden", "true");
      reload();
    } catch (e) {
      alert(e);
    }
  });

  $btnNew?.addEventListener("click", () => openForm(null, false));
  $btnFilter?.addEventListener("click", reload);

  $tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const id = btn.dataset.id;
    const act = btn.dataset.act;

    if (act === "view") openForm(id, true);
    if (act === "edit") openForm(id, false);
    if (act === "complete") {
      if (
        !confirm(
          "Hoàn thành phiếu? Điều này sẽ cộng tồn kho thật và không sửa phiếu được nữa."
        )
      )
        return;
      completeReceipt(id);
      reload();
    }
  });

  /* INIT */
  (function init() {
    removeOldSampleReceiptV1(); // dọn phiếu mẫu cũ
    seedReceiptsFromProductsOnceV2(); // seed thêm phiếu mẫu nếu thiếu
    migrateSampleSuppliersByProductName(); // sửa lại NCC theo tên SP
    $date.value = today();
    reload();
  })();

  /* Storage sync giữa các tab */
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
      _RECEIPTS_CACHE = null;
      reload();
    }
  });
})();
