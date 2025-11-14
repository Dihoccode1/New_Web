// ./assets/js/order.js – Admin Orders (Hợp nhất + TÍCH HỢP KHO + đồng bộ User)
(function () {
  /* ================== Keys & Helpers ================== */
  const KEYS = {
    ADMIN: "admin.orders", // mảng đơn (admin)
    USER: "sv_orders_v1", // { email: [orders...] } hoặc mảng
    FLAT: "sv_orders_flat", // mảng đơn phẳng (bridge)
    PING1: "orders.bump", // chuông thay đổi cho tab admin
    PING2: "sv_orders_ping", // chuông từ phía user (nếu có)
    PROD: "admin.products", // mảng sản phẩm {id, code, qty, ...}
    STOCK: "admin.stock", // lịch sử giao dịch kho
    CAT_BMP: "catalog.bump",
    STK_BMP: "stock.bump",
  };

  const USER_KEYS_IMPORT = [
    "sv_orders_flat",
    "sv_orders_v1",
    "sv_orders",
    "orders",
  ];

  const $ = (s, r = document) => r.querySelector(s);

  const LS = {
    get(k, def) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(k, v) {
      localStorage.setItem(k, JSON.stringify(v));
    },
  };

  // seed rỗng cho admin.stock để tránh lỗi parse
  if (!localStorage.getItem(KEYS.STOCK)) localStorage.setItem(KEYS.STOCK, "[]");

  const money = (n) => (Number(n) || 0).toLocaleString("vi-VN");
  const parseD = (s) => (s ? new Date(s) : null);

  const STATUS_TEXT = {
    new: "Chưa xử lý",
    confirmed: "Đã xác nhận",
    delivered: "Đã giao",
    canceled: "Đã huỷ",
    cancelled: "Đã huỷ",
  };

  const STATUS_CLASS = {
    new: "status-chip st-new",
    confirmed: "status-chip st-confirmed",
    delivered: "status-chip st-delivered",
    canceled: "status-chip st-canceled",
    cancelled: "status-chip st-canceled",
  };

  const canConfirm = (s) => s === "new";
  const canDeliver = (s) => s === "confirmed";
  const canCancel = (s) => s === "new" || s === "confirmed";

  /* ================== Chuẩn hoá đơn từ nhiều schema ================== */
  function normalize(list) {
    return (Array.isArray(list) ? list : []).map((o, i) => {
      const created =
        o.created_at || o.createdAt || o.date || new Date().toISOString();

      const items = (o.items || []).map((it) => ({
        id: it.id || it.productId,
        code: it.code || it.productCode || (it.specs && it.specs["Mã"]) || "",
        name: it.name || it.productName || "",
        price: Number(it.price) || 0,
        qty: Number(it.qty || it.quantity || 1) || 1,
      }));

      const total =
        Number(o.total) ||
        items.reduce(
          (s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0),
          0
        );

      const shipping = o.shipping || {
        fullname: o.customer?.name || o.name || "",
        phone: o.customer?.phone || o.phone || "",
        address: o.customer?.address || o.address || "",
        ward: o.customer?.ward || o.ward || "",
        district: o.customer?.district || o.district || "",
        city: o.customer?.city || o.city || "",
      };

      const id = o.id || o.code || `U${Date.now()}_${i + 1}`;
      const code =
        o.code ||
        o.order_code ||
        (typeof o.id === "string"
          ? o.id
          : `OD-${created.slice(0, 10).replace(/-/g, "")}-${String(
              i + 1
            ).padStart(3, "0")}`);

      const st = String(o.status || "new")
        .replace(/^paid$/i, "confirmed")
        .replace(/^pending$/i, "new")
        .toLowerCase();
      const status = st === "cancelled" ? "canceled" : st;

      return {
        id,
        code,
        created_at: created,
        updatedAt: o.updatedAt || o.updated_at || null,

        status,
        note: o.note || "",
        email: o.email || o.userEmail || "",

        shipping,
        items,
        total,
        subtotal: o.subtotal ?? undefined,
        ship: o.ship ?? undefined,

        canceledAt: o.canceledAt || o.cancelledAt || undefined,
        deliveredAt: o.deliveredAt || undefined,
        payMethod: o.payMethod || o.payment || undefined,

        inventoryCommitted: !!o.inventoryCommitted,
      };
    });
  }

  /* ================== Import lần đầu (nếu admin rỗng) ================== */
  (function importOnce() {
    const has = LS.get(KEYS.ADMIN, []);
    if (Array.isArray(has) && has.length) return;

    let src = [];
    for (const k of USER_KEYS_IMPORT) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;

        if (k === "sv_orders_v1") {
          const obj = JSON.parse(raw || "{}");
          const merged = Object.values(obj || {}).flat();
          if (merged.length) {
            src = merged;
            break;
          }
        } else {
          const arr = JSON.parse(raw || "[]");
          if (Array.isArray(arr) && arr.length) {
            src = arr;
            break;
          }
        }
      } catch {}
    }
    if (!src.length) return;

    const norm = normalize(src);
    LS.set(KEYS.ADMIN, norm);
  })();

  /* ================== Bridge: build/refresh sv_orders_flat ================== */
  function flattenUserOrders() {
    const raw = LS.get(KEYS.USER, {});
    const flat = Array.isArray(raw) ? raw : Object.values(raw || {}).flat();
    LS.set(KEYS.FLAT, flat);
    return flat;
  }

  /* ================== Hợp nhất admin + flat ================== */
  function loadAdminOrdersMerged() {
    let adminList = LS.get(KEYS.ADMIN, []);
    const userFlat = LS.get(KEYS.FLAT, []) ?? [];

    const map = new Map(
      (Array.isArray(adminList) ? adminList : []).map((o) => [String(o.id), o])
    );

    for (const u of Array.isArray(userFlat) ? userFlat : []) {
      const norm = normalize([u])[0];
      const id = String(norm.id);
      if (map.has(id)) {
        const a = map.get(id);
        Object.assign(a, {
          status: norm.status ?? a.status,
          total: norm.total ?? a.total,
          subtotal: norm.subtotal ?? a.subtotal,
          ship: norm.ship ?? a.ship,
          items: norm.items ?? a.items,
          shipping: norm.shipping ?? a.shipping,
          payMethod: norm.payMethod ?? a.payMethod,
          created_at: norm.created_at ?? a.created_at,
          email: norm.email ?? a.email,
          canceledAt: norm.canceledAt ?? a.canceledAt,
          deliveredAt: norm.deliveredAt ?? a.deliveredAt,
          updatedAt: new Date().toISOString(),
        });
      } else {
        map.set(id, norm);
      }
    }

    adminList = Array.from(map.values());
    adminList.sort(
      (x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0)
    );
    LS.set(KEYS.ADMIN, adminList);
    return adminList;
  }

  /* ================== Ghi đơn ở mọi nơi + chuông ================== */
  function writeOrderEverywhere(order) {
    const id = String(order.id);

    // 1) admin.orders
    const adminList = LS.get(KEYS.ADMIN, []);
    const aidx = adminList.findIndex((o) => String(o.id) === id);
    if (aidx >= 0) adminList[aidx] = order;
    else adminList.push(order);
    LS.set(KEYS.ADMIN, adminList);

    // 2) sv_orders_v1
    const userStore = LS.get(KEYS.USER, {});
    let touched = false;
    if (userStore && typeof userStore === "object") {
      for (const email of Object.keys(userStore)) {
        const arr = Array.isArray(userStore[email]) ? userStore[email] : [];
        const uidx = arr.findIndex(
          (o) => String(o.id) === id || String(o.code) === order.code
        );
        if (uidx >= 0) {
          arr[uidx] = order;
          userStore[email] = arr;
          touched = true;
        }
      }
    }
    if (!touched && order.email) {
      const arr2 = Array.isArray(userStore[order.email])
        ? userStore[order.email]
        : [];
      const u2 = arr2.findIndex(
        (o) => String(o.id) === id || String(o.code) === order.code
      );
      if (u2 >= 0) arr2[u2] = order;
      else arr2.push(order);
      userStore[order.email] = arr2;
      touched = true;
    }
    if (touched) LS.set(KEYS.USER, userStore);

    // 3) sv_orders_flat
    let flat = LS.get(KEYS.FLAT, []);
    const fidx = flat.findIndex((o) => String(o.id) === id);
    if (fidx >= 0) flat[fidx] = order;
    else flat.push(order);
    LS.set(KEYS.FLAT, flat);

    // 4) phát chuông
    try {
      localStorage.setItem(KEYS.PING1, String(Date.now()));
    } catch {}
  }

  /* ================== KHO ================== */
  function prodsList() {
    return LS.get(KEYS.PROD, []);
  }
  function prodsSave(arr) {
    LS.set(KEYS.PROD, arr || []);
    try {
      localStorage.setItem(KEYS.CAT_BMP, String(Date.now()));
    } catch {}
  }
  function txList() {
    return LS.get(KEYS.STOCK, []);
  }
  function txSave(arr) {
    LS.set(KEYS.STOCK, arr || []);
    try {
      localStorage.setItem(KEYS.STK_BMP, String(Date.now()));
    } catch {}
  }

  function findProdForItem(pList, it) {
    const byAdminId = pList.find((p) => String(p.id) === String(it.id));
    if (byAdminId) return byAdminId;

    const bySeedId = pList.find(
      (p) => p.seedId && String(p.seedId) === String(it.id)
    );
    if (bySeedId) return bySeedId;

    const code = String(it.code || "").toUpperCase();
    if (code) {
      const byCode = pList.find(
        (p) => String(p.code || "").toUpperCase() === code
      );
      if (byCode) return byCode;
    }

    const name = String(it.name || "")
      .trim()
      .toLowerCase();
    if (!name) return null;
    return (
      pList.find(
        (p) =>
          String(p.name || "")
            .trim()
            .toLowerCase() === name
      ) || null
    );
  }

  // sign = -1 (trừ kho), +1 (cộng lại)
  function applyStockForOrder(order, sign, typeOverride) {
    if (!order || !Array.isArray(order.items)) return;

    const prods = prodsList();
    const txs = txList();
    const when = order.created_at || new Date().toISOString();

    order.items.forEach((it) => {
      const p = findProdForItem(prods, it);
      if (!p) return;

      const delta = Number(it.qty || 0) * (sign || -1);
      const newQty = Number(p.qty || 0) + delta;
      p.qty = newQty < 0 ? 0 : newQty;

      const type = typeOverride || ((sign || -1) < 0 ? "export" : "import");

      txs.push({
        id:
          "STK_" +
          Math.random().toString(36).slice(2, 8) +
          Date.now().toString(36).slice(-4),
        productId: p.id,
        type,
        qty: Math.abs(Number(it.qty || 0)),
        note:
          type === "export"
            ? `Đơn ${order.code} – bán`
            : type === "adjust"
            ? `Đơn ${order.code} – hoàn kho (huỷ đơn)`
            : `Đơn ${order.code} – nhập`,
        ref: order.id,
        createdAt: when,
      });
    });

    prodsSave(prods);
    txSave(txs);
  }

  /* ================== Cập nhật trạng thái ================== */
  function updateStatus(id, status) {
    const list = LS.get(KEYS.ADMIN, []);
    const i = list.findIndex((x) => String(x.id) === String(id));
    if (i < 0) throw new Error("Không tìm thấy đơn hàng");

    const prev = String(list[i].status || "new").toLowerCase();
    const nextRaw = String(status).toLowerCase();
    const next = nextRaw === "cancelled" ? "canceled" : nextRaw;

    const o = { ...list[i] };
    o.status = next;
    o.updatedAt = new Date().toISOString();
    if (next === "delivered") o.deliveredAt = new Date().toISOString();
    if (next === "canceled") o.canceledAt = new Date().toISOString();

    // INVENTORY RULES
    if (
      !o.inventoryCommitted &&
      ((prev === "new" && next === "confirmed") ||
        (prev === "new" && next === "delivered"))
    ) {
      applyStockForOrder(o, -1, "export");
      o.inventoryCommitted = true;
    }

    if (o.inventoryCommitted && prev === "confirmed" && next === "canceled") {
      applyStockForOrder(o, +1, "adjust");
      o.inventoryCommitted = false;
    }

    list[i] = o;
    LS.set(KEYS.ADMIN, list);
    writeOrderEverywhere(o);
    return o;
  }

  /* ================== DOM refs ================== */
  const tb = $("#od-body");
  const qInput = $("#q");
  const fromInput = $("#from");
  const toInput = $("#to");
  const stSelect = $("#status");
  const sortWard = $("#sortWard");
  const btnFilter = $("#btnFilter");

  // Modal
  const modal = $("#od-modal");
  const mTitle = $("#od-title");
  const mStatusSel = $("#od-status");
  const mBtnUpdate = $("#btnUpdateStatus");
  const mBtnClose = $("#btnClose");
  const vCode = $("#vCode");
  const vDate = $("#vDate");
  const vStatus = $("#vStatus");
  const vNote = $("#vNote");
  const vCus = $("#vCus");
  const vPhone = $("#vPhone");
  const vAddr = $("#vAddr");
  const vItems = $("#vItems");
  const vTotal = $("#vTotal");

  let state = { list: [], filtered: [], modalId: null };

  /* ================== Helpers ================== */
  function matchQuery(o, q) {
    if (!q) return true;
    q = q.toLowerCase();
    const address = [
      o?.shipping?.address,
      o?.shipping?.ward,
      o?.shipping?.district,
      o?.shipping?.city,
    ]
      .filter(Boolean)
      .join(" ");
    return [
      String(o.id || "").toLowerCase(),
      String(o.code || "").toLowerCase(),
      String(o?.shipping?.fullname || "").toLowerCase(),
      String(o?.shipping?.phone || "").toLowerCase(),
      address.toLowerCase(),
    ].some((x) => x.includes(q));
  }

  function inDateRange(o, from, to) {
    if (!from && !to) return true;
    const d = parseD(o.created_at);
    if (!d) return false;
    const ms = d.getTime();
    if (from && ms < from.getTime()) return false;
    if (to) {
      const end = new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        23,
        59,
        59,
        999
      );
      if (ms > end.getTime()) return false;
    }
    return true;
  }

  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  function applyFilters() {
    const q = (qInput?.value || "").trim();
    const st = (stSelect?.value || "").trim();
    const fDate = fromInput?.value ? new Date(fromInput.value) : null;
    const tDate = toInput?.value ? new Date(toInput.value) : null;
    const wardSort = (sortWard?.value || "").trim();

    let arr = [...state.list];

    arr = arr.filter((o) => matchQuery(o, q));
    if (st) {
      const stLower = st.toLowerCase();
      arr = arr.filter((o) => String(o.status || "").toLowerCase() === stLower);
    }
    arr = arr.filter((o) => inDateRange(o, fDate, tDate));

    if (wardSort) {
      arr.sort((a, b) => {
        const wa = (a?.shipping?.ward || a?.shipping?.district || "")
          .toString()
          .toLowerCase();
        const wb = (b?.shipping?.ward || b?.shipping?.district || "")
          .toString()
          .toLowerCase();
        if (wa < wb) return wardSort === "asc" ? -1 : 1;
        if (wa > wb) return wardSort === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      arr.sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
    }

    state.filtered = arr;
  }

  function render() {
    applyFilters();
    if (!state.filtered.length) {
      tb.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#9aa3ad;padding:20px">Không có dữ liệu</td></tr>';
      return;
    }

    tb.innerHTML = state.filtered
      .map((o) => {
        const st = String(o.status || "new").toLowerCase();
        const stLabel = STATUS_TEXT[st] || STATUS_TEXT.new;
        const stClass = STATUS_CLASS[st] || STATUS_CLASS.new;
        const when = o.created_at
          ? new Date(o.created_at).toLocaleString("vi-VN")
          : "";

        const addr = [
          o?.shipping?.address,
          o?.shipping?.ward,
          o?.shipping?.district,
          o?.shipping?.city,
        ]
          .filter(Boolean)
          .join(", ");

        const qty = (o.items || []).reduce(
          (s, it) => s + (Number(it.qty) || 0),
          0
        );

        const btnView = `<button class="btn" data-act="view" data-id="${o.id}">Xem</button>`;
        const btnConfirm = canConfirm(st)
          ? `<button class="btn" data-act="confirm" data-id="${o.id}">Xác nhận</button>`
          : "";
        const btnDeliver = canDeliver(st)
          ? `<button class="btn" data-act="deliver" data-id="${o.id}">Giao xong</button>`
          : "";
        const btnCancel = canCancel(st)
          ? `<button class="btn" data-act="cancel" data-id="${o.id}">Huỷ</button>`
          : "";

        return `
          <tr>
            <td><strong>${escapeHtml(o.code || o.id)}</strong></td>
            <td class="small">${escapeHtml(when)}</td>
            <td>
              <div>${escapeHtml(o?.shipping?.fullname || "")}</div>
              <div class="small">${escapeHtml(o?.shipping?.phone || "")}</div>
            </td>
            <td class="small">${escapeHtml(addr)}</td>
            <td style="text-align:right">${qty}</td>
            <td style="text-align:right">${money(o.total)}</td>
            <td>
              <span class="${stClass}">
                ${escapeHtml(stLabel)}
              </span>
            </td>
            <td style="display:flex;gap:4px;flex-wrap:wrap">
              ${btnView}${btnConfirm}${btnDeliver}${btnCancel}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  /* ================== Modal ================== */
  function openModal(id) {
    const o = state.list.find((x) => String(x.id) === String(id));
    if (!o) return;

    state.modalId = id;
    mTitle.textContent = `Chi tiết đơn #${o.code || o.id || "—"}`;
    vCode.textContent = o.code || o.id || "—";
    vDate.textContent = o.created_at
      ? new Date(o.created_at).toLocaleString("vi-VN")
      : "—";

    const st = String(o.status || "new").toLowerCase();
    vStatus.textContent = STATUS_TEXT[st] || STATUS_TEXT.new;
    vNote.textContent = o.note || "—";

    vCus.textContent = o?.shipping?.fullname || "—";
    vPhone.textContent = o?.shipping?.phone || "—";
    const addr = [
      o?.shipping?.address,
      o?.shipping?.ward,
      o?.shipping?.district,
      o?.shipping?.city,
    ]
      .filter(Boolean)
      .join(", ");
    vAddr.textContent = addr || "—";

    mStatusSel.value = st === "cancelled" ? "canceled" : st;

    vItems.innerHTML = (o.items || [])
      .map(
        (it) => `
        <tr>
          <td>${escapeHtml(it.code || "")}</td>
          <td>${escapeHtml(it.name || "")}</td>
          <td style="text-align:right">${money(it.price)}</td>
          <td style="text-align:right">${Number(it.qty) || 0}</td>
          <td style="text-align:right">${money(
            (Number(it.qty) || 0) * (Number(it.price) || 0)
          )}</td>
        </tr>`
      )
      .join("");

    vTotal.textContent = money(o.total || 0);

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    state.modalId = null;
  }

  mBtnClose?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  mBtnUpdate?.addEventListener("click", () => {
    if (!state.modalId) return;
    try {
      updateStatus(state.modalId, mStatusSel.value);
      closeModal();
      render();
      alert("Đã cập nhật trạng thái");
    } catch (err) {
      alert(err.message || err);
    }
  });

  /* ================== Row Actions ================== */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");

    const idx = state.list.findIndex((x) => String(x.id) === String(id));
    if (idx < 0) return;
    const o = state.list[idx];
    const st = String(o.status || "").toLowerCase();

    if (act === "view") {
      openModal(id);
      return;
    }

    try {
      if (act === "confirm") {
        if (!canConfirm(st)) return;
        updateStatus(id, "confirmed");
        render();
        return;
      }
      if (act === "deliver") {
        if (!canDeliver(st)) return;
        updateStatus(id, "delivered");
        render();
        return;
      }
      if (act === "cancel") {
        if (!canCancel(st)) return;
        if (!confirm("Xác nhận huỷ đơn này?")) return;
        updateStatus(id, "canceled");
        render();
        return;
      }
    } catch (err) {
      alert(err.message || err);
    }
  });

  /* ================== Filters & Events ================== */
  btnFilter?.addEventListener("click", render);
  qInput?.addEventListener("keyup", (e) => {
    if (e.key === "Enter") render();
  });
  [fromInput, toInput, stSelect, sortWard].forEach((el) =>
    el?.addEventListener("change", render)
  );

  // Tự reload khi tab khác đổi dữ liệu
  window.addEventListener("storage", (e) => {
    if (
      [KEYS.PING1, KEYS.PING2, KEYS.USER, KEYS.FLAT, KEYS.ADMIN].includes(e.key)
    ) {
      if (e.key === KEYS.USER) {
        flattenUserOrders();
      }
      state.list = loadAdminOrdersMerged();
      render();
    }
  });

  /* ================== Init ================== */
  (function init() {
    if (!Array.isArray(LS.get(KEYS.FLAT))) {
      flattenUserOrders();
    }

    // Không auto lọc 7 ngày, để trống => show hết
    if (fromInput) fromInput.value = "";
    if (toInput) toInput.value = "";

    state.list = loadAdminOrdersMerged();
    render();
  })();
})();
