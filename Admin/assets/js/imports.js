/* ============================================================
   IMPORTS.JS — Quản lý phiếu nhập hàng
   - Luôn có dữ liệu mẫu mặc định, kể cả khi localStorage trống
   - Dữ liệu thật của bạn vẫn lưu ở localStorage như bình thường
   ============================================================ */

(function () {
  // ===== Storage Keys =====
  const PROD_KEY = "admin.products";
  const RECEIPT_KEY = "admin.inventoryReceipts";
  const CAT_KEY = "admin.categories";
  const TX_KEY = "admin.stock";
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

  // ===== Suppliers mẫu & đoán NCC theo tên sản phẩm =====
  const SAMPLE_SUPPLIERS = [
    "Davines",
    "TIGI",
    "Kevin Murphy",
    "Butterfly Shadow",
    "Luxurious",
    "Apestomen",
    "Hanz de Fuko",
  ];
  function guessSupplierFromName(name) {
    const lower = String(name || "").toLowerCase();
    for (const sup of SAMPLE_SUPPLIERS) {
      if (lower.includes(sup.toLowerCase())) return sup;
    }
    return "Nhà cung cấp khác";
  }

  // ===== Tính tổng trên các dòng =====
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

  // ===== Build bộ PHIẾU MẪU (không phụ thuộc localStorage) =====
  function buildDefaultReceipts() {
    const year = new Date().getFullYear();
    const baseDate = new Date(year, 9, 28); // 28/10

    const samples = [
      {
        code: "SP001",
        name: "Gôm xịt tóc Davines Extra Strong Hairspray",
        cost: 180000,
        qty: 30,
      },
      {
        code: "SP002",
        name: "Gôm xịt tóc TIGI Bed Head Masterpiece",
        cost: 170000,
        qty: 20,
      },
      {
        code: "SP003",
        name: "Sáp vuốt tóc Kevin Murphy Free Hold",
        cost: 280000,
        qty: 15,
      },
      {
        code: "SP004",
        name: "Keo xịt tóc Butterfly Shadow Super Hard",
        cost: 90000,
        qty: 40,
      },
      {
        code: "SP005",
        name: "Sáp Luxurious Clay Wax",
        cost: 120000,
        qty: 25,
      },
      {
        code: "SP006",
        name: "Sáp Apestomen Nitro Wax",
        cost: 110000,
        qty: 18,
      },
      {
        code: "SP007",
        name: "Sáp Hanz de Fuko Claymation",
        cost: 260000,
        qty: 12,
      },
      {
        code: "SP008",
        name: "Sáp vuốt tóc Davines Strong Hold Cream",
        cost: 230000,
        qty: 14,
      },
    ];

    const receipts = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];

      // cứ 3 phiếu thì +2 ngày (28/10, 30/10, 01/11,...)
      const group = Math.floor(i / 3);
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + group * 2);
      const dateIso = d.toISOString().slice(0, 10);

      const item = {
        productId: undefined, // demo → không cộng tồn kho nữa
        productCode: s.code,
        productName: s.name,
        lotCode: `SEED-${s.code}-${i + 1}`,
        costPrice: s.cost,
        quantity: s.qty,
      };
      const totals = calcTotals([item]);

      receipts.push({
        id: `PN_DEMO_${i + 1}`,
        code: `PN-${dateIso.replace(/-/g, "")}-${String(i + 1).padStart(
          3,
          "0"
        )}`,
        date: dateIso,
        supplier: guessSupplierFromName(s.name),
        note: `Phiếu nhập mẫu cho ${s.name}`,
        status: "completed",
        items: [item],
        totalCost: totals.totalCost,
        totalQty: totals.totalQty,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
      });
    }
    return receipts;
  }

  // ===== Cache receipts =====
  let _RECEIPTS_CACHE = null;
  function receiptsRead() {
    if (!_RECEIPTS_CACHE) {
      let stored = jget(RECEIPT_KEY, []);
      // Nếu localStorage chưa có gì → nạp bộ mẫu và lưu luôn
      if (!stored || !stored.length) {
        stored = buildDefaultReceipts();
        jset(RECEIPT_KEY, stored);
      }
      _RECEIPTS_CACHE = stored.sort(
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

  // ===== Chuẩn hóa items khi tạo / sửa phiếu thật =====
  function normalizeItems(items) {
    return (items || []).map((it) => {
      const p = getProductById(it.productId);
      return {
        productId: it.productId,
        productCode: it.productCode || p?.code || "",
        productName: it.productName || p?.name || "",
        lotCode: it.lotCode || `LOT-${Date.now()}`,
        costPrice: Number(it.costPrice || 0),
        quantity: Number(it.quantity || 0),
      };
    });
  }

  /* ============================================================
     CRUD Receipts (dữ liệu thật của Admin)
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
    const norm = normalizeItems(items);
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

    // cộng tồn kho thật cho các phiếu do Admin tạo (demo thì productId undefined nên bỏ qua)
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
     UI CODE
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
        const hay = `${r.code} ${r.supplier} ${r.note}`.toLowerCase();
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
          <td><b>${esc(r.code)}</b></td>
          <td>${esc(r.date)}</td>
          <td>${esc(preview)}${more}</td>
          <td>${esc(r.supplier)}</td>
          <td class="num">${money(r.totalQty)}</td>
          <td class="num">${money(r.totalCost)}</td>
          <td>${esc(r.status)}</td>
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

  /* ============================================================
     EVENTS
     ============================================================ */
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

  // thêm dòng
  $btnAddLine?.addEventListener("click", () => {
    const kw = ($sprod.value || "").trim().toLowerCase();
    const found = listProducts().filter((p) =>
      `${p.code} ${p.name}`.toLowerCase().includes(kw)
    );
    if (!found.length) return alert("Không tìm thấy sản phẩm");

    const p = found[0];
    const lot = prompt("Mã lô:", `LOT-${Date.now()}`);
    if (lot === null) return;
    const cost = Number(prompt("Giá nhập:", p.cost || p.price || 0) || 0);
    const qty = Number(prompt("Số lượng:", 1) || 0);
    if (!qty) return;

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

  // sửa / xóa dòng
  $lines?.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    const f = e.target.dataset.f;

    if (f === "cost") STATE.items[idx].costPrice = Number(e.target.value || 0);
    if (f === "qty") STATE.items[idx].quantity = Number(e.target.value || 0);
    if (f === "lot") STATE.items[idx].lotCode = e.target.value;

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

  // lưu draft
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
      alert("Đã lưu");
      $modal.classList.remove("show");
      $modal.setAttribute("aria-hidden", "true");
      reload();
    } catch (e) {
      alert(e);
    }
  });

  // hoàn thành phiếu
  $btnComplete?.addEventListener("click", () => {
    if (!STATE.id) return alert("Hãy lưu phiếu trước");

    if (
      !confirm(
        "Hoàn thành phiếu? Sau khi hoàn thành sẽ cộng tồn kho và không sửa được."
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

  // toolbar
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
      const rec = getReceiptById(id);
      if (!rec) return alert("Không tìm thấy phiếu");
      if (rec.status !== "draft") return alert("Phiếu đã hoàn thành");
      if (!confirm(`Hoàn thành phiếu ${rec.code}?`)) return;
      try {
        completeReceipt(id);
        alert("Đã hoàn thành");
        reload();
      } catch (e) {
        alert(e);
      }
    }
  });

  /* ============================================================
     INIT
     ============================================================ */
  (function init() {
    $date.value = today();
    reload();
  })();

  // đồng bộ khi tab khác thay đổi
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
