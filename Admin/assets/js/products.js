// =====================
// LocalStorage keys
// =====================
const CAT_KEY = "admin.categories";
const PROD_KEY = "admin.products";

// ===================================
// Seed Danh mục mặc định (1 lần)
// ===================================
(function seedCats() {
  if (!localStorage.getItem(CAT_KEY)) {
    localStorage.setItem(
      CAT_KEY,
      JSON.stringify([
        {
          id: 1,
          code: "LOAI001",
          name: "Sáp vuốt tóc",
          desc: "Wax/Pomade",
          active: true,
        },
        {
          id: 2,
          code: "LOAI002",
          name: "Gôm xịt",
          desc: "Hairspray",
          active: true,
        },
        {
          id: 3,
          code: "LOAI003",
          name: "Bột tạo phồng",
          desc: "Hair powder",
          active: true,
        },
      ])
    );
  }
})();

// ❌ Không seed sản phẩm demo để nhường import từ User

// =====================
// Helpers storage
// =====================
const loadCats = () => {
  try {
    return JSON.parse(localStorage.getItem(CAT_KEY) || "[]");
  } catch {
    return [];
  }
};
const loadProds = () => {
  try {
    return JSON.parse(localStorage.getItem(PROD_KEY) || "[]");
  } catch {
    return [];
  }
};
const nextId = (a) => a.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;

// =====================================
// BRIDGE -> Xuất sang site User (store)
// =====================================
const PUBLIC_CATALOG_KEY = "sv_products_v1"; // site user đọc key này
const BUMP_KEY = "catalog.bump"; // kích hoạt storage event để User tự refresh

const CAT_SLUG_MAP = {
  "Sáp vuốt tóc": "hair_wax",
  "Gôm xịt": "hair_spray",
  "Bột tạo phồng": "volumizing_powder",
};

function toSlug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ✅ ưu tiên id gốc từ seed user (seedId) để trang User mở đúng URL cũ
function mapAdminProdToPublic(p, cats) {
  const catName = cats.find((c) => c.id === p.categoryId)?.name || "";
  const category = CAT_SLUG_MAP[catName] || toSlug(catName) || "other";
  const publicId = p.seedId || `admin-${p.id}`;

  return {
    id: publicId,
    name: p.name,
    brand: p.supplier || "",
    category,
    price: Number(p.price) || 0,
    original_price: undefined,
    image: p.image || "../assets/images/placeholder.png",
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
  };
}

function syncToStorefront(prods) {
  const cats = loadCats();
  const list = (prods || loadProds())
    .filter((p) => (p.status || "selling") === "selling")
    .map((p) => mapAdminProdToPublic(p, cats));

  localStorage.setItem(PUBLIC_CATALOG_KEY, JSON.stringify(list));
  // 🔔 báo cho phía User trang đang mở (sanpham, trangchu) tự refresh
  localStorage.setItem(BUMP_KEY, String(Date.now()));
}

const saveProds = (a) => {
  localStorage.setItem(PROD_KEY, JSON.stringify(a));
  syncToStorefront(a);
};

// =============================
// DOM refs & khởi tạo dropdown
// =============================
const catSelect = document.getElementById("categoryId");
const filterCat = document.getElementById("filter-cat");

function fillCategories() {
  const cats = loadCats().filter((c) => c.active);
  if (catSelect) {
    catSelect.innerHTML = cats
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
  }
  if (filterCat) {
    filterCat.innerHTML =
      `<option value="">— Tất cả loại —</option>` +
      cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }
}
fillCategories();

// ==================
// Tự tính giá bán & % lợi nhuận
// ==================

// cost + margin → tính lại price
function recalcPriceFromMargin() {
  const costEl = document.getElementById("cost");
  const marginEl = document.getElementById("margin");
  const priceEl = document.getElementById("price");
  if (!costEl || !marginEl || !priceEl) return;

  const cost = Number(costEl.value || 0);
  const margin = Number(marginEl.value || 0);

  const price = Math.round(cost * (1 + margin / 100));
  priceEl.value = isFinite(price) ? price : 0;
}

// cost + price → tính lại margin
function recalcMarginFromPrice() {
  const costEl = document.getElementById("cost");
  const marginEl = document.getElementById("margin");
  const priceEl = document.getElementById("price");
  if (!costEl || !marginEl || !priceEl) return;

  const cost = Number(costEl.value || 0);
  const price = Number(priceEl.value || 0);

  if (cost <= 0) {
    // không tính được %LN khi chưa có giá vốn
    marginEl.value = 0;
    return;
  }

  const m = Math.round((price / cost - 1) * 100);
  marginEl.value = isFinite(m) ? m : 0;
}

// Khi đổi giá vốn → tính lại giá bán theo %LN hiện tại
document
  .getElementById("cost")
  ?.addEventListener("input", recalcPriceFromMargin);

// Khi đổi %LN → tính lại giá bán
document
  .getElementById("margin")
  ?.addEventListener("input", recalcPriceFromMargin);

// Khi đổi giá bán → tính lại %LN
document
  .getElementById("price")
  ?.addEventListener("input", recalcMarginFromPrice);

// ============================
// Preview & bỏ hình (Base64)
// ============================
let currentImageData = null;
document.getElementById("image")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentImageData = reader.result;
    renderPreview();
  };
  reader.readAsDataURL(file);
});
document.getElementById("btn-remove-img")?.addEventListener("click", () => {
  currentImageData = null;
  const input = document.getElementById("image");
  if (input) input.value = "";
  renderPreview();
});
function renderPreview() {
  const box = document.getElementById("img-preview");
  if (!box) return;
  box.innerHTML = currentImageData
    ? `<img src="${currentImageData}" alt="" style="max-width:100%;border-radius:10px;border:1px solid #243040">`
    : `<small style="color:#9ca3af;">(chưa có hình)</small>`;
}
renderPreview();

// ==================
// Render bảng
// ==================
function render(list) {
  const q = (document.getElementById("q")?.value || "").toLowerCase().trim();
  const cat = document.getElementById("filter-cat")?.value || "";
  const st = document.getElementById("filter-status")?.value || "";
  const cats = loadCats();

  const data = (list || loadProds()).filter((p) => {
    if (q && !`${p.code} ${p.name} ${p.desc || ""}`.toLowerCase().includes(q))
      return false;
    if (cat && String(p.categoryId) !== cat) return false;
    if (st && p.status !== st) return false;
    return true;
  });

  const tbody = document.getElementById("prod-body");
  if (!tbody) return;

  tbody.innerHTML = data
    .map((p, i) => {
      const catName = cats.find((c) => c.id === p.categoryId)?.name || "";
      const img = p.image ? `<img src="${p.image}" alt="" class="thumb">` : "";
      const stBadge =
        p.status === "selling"
          ? '<span class="status-chip selling">Đang bán</span>'
          : p.status === "stopped"
          ? '<span class="status-chip stopped">Hết bán</span>'
          : '<span class="status-chip hidden">Ẩn</span>';

      const stopLabel = p.status === "selling" ? "Hết bán" : "Bán lại";
      const hideLabel = p.status === "hidden" ? "Hiện" : "Ẩn";

      return `  
      <tr>
        <td>${i + 1}</td>
        <td>${img}</td>
        <td>${p.code}</td>
        <td>${p.name}</td>
        <td>${catName}</td>
        <td>${p.uom || ""}</td>
        <td>${p.qty || 0}</td>
        <td>${(p.cost || 0).toLocaleString("vi-VN")}</td>
        <td>${p.margin || 0}%</td>
        <td>${(p.price || 0).toLocaleString("vi-VN")}</td>
        <td>${p.supplier || ""}</td>
        <td>${stBadge}</td>
        <td>
          <a href="#" class="btn btn-action" data-act="edit"   data-id="${
            p.id
          }">Sửa</a>
          <a href="#" class="btn btn-action" data-act="toggle" data-id="${
            p.id
          }">${stopLabel}</a>
          <a href="#" class="btn btn-action" data-act="hide"   data-id="${
            p.id
          }">${hideLabel}</a>
        </td>
      </tr>`;
    })
    .join("");
}
render();
syncToStorefront(); // đồng bộ ngay lần đầu

// ===================
// Tìm kiếm & lọc
// ===================
document.getElementById("q")?.addEventListener("input", () => render());
document
  .getElementById("filter-cat")
  ?.addEventListener("change", () => render());
document
  .getElementById("filter-status")
  ?.addEventListener("change", () => render());

// ===================
// Helpers set form
// ===================
function setForm(p) {
  document.getElementById("id").value = p?.id || "";
  document.getElementById("code").value = p?.code || "";
  document.getElementById("name").value = p?.name || "";
  document.getElementById("categoryId").value =
    p?.categoryId ||
    document.getElementById("categoryId").options[0]?.value ||
    "";
  document.getElementById("desc").value = p?.desc || "";
  document.getElementById("uom").value = p?.uom || "";
  document.getElementById("qty").value = p?.qty ?? 0;
  document.getElementById("cost").value = p?.cost ?? 0;
  document.getElementById("margin").value = p?.margin ?? 0;
  document.getElementById("price").value = p?.price ?? 0;
  document.getElementById("supplier").value = p?.supplier || "";
  document.getElementById("status").value = p?.status || "selling";

  currentImageData = p?.image || null;
  renderPreview();

  document.getElementById("form-title").textContent = p?.id
    ? "Sửa sản phẩm"
    : "Thêm sản phẩm";
}
document.getElementById("btn-new")?.addEventListener("click", () => {
  setForm(null);
  window.AdminProductDrawer?.open?.();
});
document
  .getElementById("btn-cancel")
  ?.addEventListener("click", () => setForm(null));

// ===================
// Submit form
// ===================
document.getElementById("prod-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const prods = loadProds();
  const currentId = Number(document.getElementById("id").value || 0);

  const data = {
    id: currentId,
    code: document.getElementById("code").value.trim(),
    name: document.getElementById("name").value.trim(),
    categoryId: Number(document.getElementById("categoryId").value),
    desc: document.getElementById("desc").value.trim(),
    uom: document.getElementById("uom").value.trim(),
    qty: Number(document.getElementById("qty").value || 0),
    cost: Number(document.getElementById("cost").value || 0),
    margin: Number(document.getElementById("margin").value || 0),
    price: Number(document.getElementById("price").value || 0),
    supplier: document.getElementById("supplier").value.trim(),
    status: document.getElementById("status").value,
    image: currentImageData,
    // giữ seedId cũ nếu là sửa
    seedId: prods.find((x) => x.id === currentId)?.seedId || undefined,
  };

  if (!data.code || !data.name) {
    alert("Nhập mã & tên sản phẩm");
    return;
  }

  if (data.id) {
    const i = prods.findIndex((x) => x.id === data.id);
    if (i >= 0) {
      prods[i] = { ...prods[i], ...data };
      saveProds(prods);
      render(prods);
      setForm(null);
    }
  } else {
    if (prods.some((x) => x.code.toLowerCase() === data.code.toLowerCase())) {
      alert("Mã sản phẩm đã tồn tại");
      return;
    }
    data.id = nextId(prods);
    data.createdAt = Date.now();
    prods.push(data);
    saveProds(prods);
    render(prods);
    setForm(null);
  }
});

// ===================
// Hành động bảng
// ===================
document.getElementById("prod-body")?.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-act]");
  if (!a) return;
  e.preventDefault();

  const id = Number(a.dataset.id);
  const act = a.dataset.act;
  const prods = loadProds();
  const i = prods.findIndex((x) => x.id === id);
  if (i < 0) return;

  if (act === "edit") {
    setForm(prods[i]);
    window.AdminProductDrawer?.open?.();
    return;
  }
  if (act === "toggle") {
    prods[i].status = prods[i].status === "selling" ? "stopped" : "selling";
    saveProds(prods);
    render(prods);
    return;
  }
  if (act === "hide") {
    prods[i].status = prods[i].status === "hidden" ? "selling" : "hidden";
    saveProds(prods);
    render(prods);
    return;
  }
  if (act === "remove") {
    if (confirm("Xóa sản phẩm này?")) {
      prods.splice(i, 1);
      saveProds(prods);
      render(prods);
    }
    return;
  }
});

/* ===========================
   IMPORT từ seed của site user
   =========================== */
const SLUG_TO_CATNAME = {
  hair_wax: "Sáp vuốt tóc",
  hair_spray: "Gôm xịt",
  volumizing_powder: "Bột tạo phồng",
};
const pad3 = (n) => String(n).padStart(3, "0");

function ensureCategoryBySlug(slug) {
  const cats = loadCats();
  const name =
    SLUG_TO_CATNAME[slug] ||
    String(slug || "other")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  let found = cats.find((c) => c.name === name);
  if (found) return found.id;

  const newId = cats.reduce((m, c) => Math.max(m, c.id || 0), 0) + 1 || 1;
  const newCat = {
    id: newId,
    code: "LOAI" + pad3(newId),
    name,
    desc: name,
    active: true,
  };
  cats.push(newCat);
  localStorage.setItem(CAT_KEY, JSON.stringify(cats));
  fillCategories();
  return newId;
}

function importUserSeedIntoAdmin({ force = false } = {}) {
  const userSeed = Array.isArray(window.SV_PRODUCT_SEED)
    ? window.SV_PRODUCT_SEED
    : [];
  const seedFromStore = (() => {
    try {
      return JSON.parse(localStorage.getItem("sv_products_v1") || "[]");
    } catch {
      return [];
    }
  })();

  // Ưu tiên seed trong file, nếu không có thì lấy cái admin đang public
  const source = userSeed.length ? userSeed : seedFromStore;
  if (!source.length) return;

  const already = loadProds();
  const importedFlag = localStorage.getItem("admin.userImported") === "1";
  // nếu đã có sp và đã import rồi thì thôi
  if (already.length && importedFlag && !force) return;

  const prods = [];
  let autoId = 0;

  source.forEach((item) => {
    const slug =
      (item.category || item.category_slug || "").toString().trim() || "other";
    const categoryId = ensureCategoryBySlug(slug);

    const stoppedByStock = Number(item.stock || 0) <= 0;
    const badge = (item.badge || "").toString().toLowerCase();
    const status =
      stoppedByStock || badge === "out_of_stock" || badge === "oos"
        ? "stopped"
        : "selling";

    const price = Number(item.price) || 0;
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : price;

    autoId += 1;

    const code =
      (item.specs && (item.specs.Mã || item.specs["Mã"])) ||
      item.code ||
      "SP" + pad3(autoId);

    prods.push({
      id: autoId, // ✅ id auto tăng, không trùng
      seedId: item.id, // giữ id gốc của user
      code: String(code).toUpperCase(),
      name: item.name || "",
      categoryId,
      desc: item.short_desc || item.long_desc || "",
      uom: item.unit || "",
      qty: Number(item.stock || 0),
      cost,
      margin: 0,
      price,
      supplier: item.brand || "",
      status,
      image: item.image || null,
      createdAt: Date.now(),
    });
  });

  localStorage.setItem(PROD_KEY, JSON.stringify(prods));
  localStorage.setItem("admin.userImported", "1");
  syncToStorefront(prods);
}

// 🔁 Backfill seedId cho dữ liệu cũ (chạy 1 lần)
function backfillSeedIdOnce() {
  const flagKey = "admin.seedIdBackfilled";
  if (localStorage.getItem(flagKey) === "1") return;

  const prods = loadProds();
  if (!prods.length) return;
  const seed = Array.isArray(window.SV_PRODUCT_SEED)
    ? window.SV_PRODUCT_SEED
    : [];
  if (!seed.length) return;

  let changed = false;
  prods.forEach((p) => {
    if (p.seedId) return;
    const found = seed.find(
      (s) =>
        ((s.specs && (s.specs.Mã || s.specs["Mã"])) || "")
          .toString()
          .toUpperCase() === (p.code || "").toUpperCase() ||
        String(s.name || "")
          .trim()
          .toLowerCase() ===
          String(p.name || "")
            .trim()
            .toLowerCase()
    );
    if (found) {
      p.seedId = found.id;
      changed = true;
    }
  });

  if (changed) saveProds(prods);
  localStorage.setItem(flagKey, "1");
}

// Chạy importer + backfill + render
try {
  importUserSeedIntoAdmin({ force: false });
  backfillSeedIdOnce();
  render();
} catch (e) {
  console.warn("import seed error:", e);
}
