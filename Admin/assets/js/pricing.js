// =====================
// LocalStorage keys
// =====================
const CAT_KEY = "admin.categories";
const PROD_KEY = "admin.products";

const PUBLIC_CATALOG_KEY = "sv_products_v1"; // site khách đọc key này
const BUMP_KEY = "catalog.bump"; // báo cho trang khách tự refresh

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
const saveProds = (a) => {
  localStorage.setItem(PROD_KEY, JSON.stringify(a));
  syncToStorefront(a);
};

// =====================
// Map & sync ra site khách
// (giống logic bên products.js)
// =====================
function mapAdminProdToPublic(p, cats) {
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
    image: p.image || "/assets/images/placeholder.png",
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
  localStorage.setItem(BUMP_KEY, String(Date.now()));
}

// =====================
// Fill dropdown loại
// =====================
const filterCat = document.getElementById("filter-cat");
function fillCategories() {
  const cats = loadCats().filter((c) => c.active);
  if (filterCat) {
    filterCat.innerHTML =
      `<option value="">— Tất cả loại —</option>` +
      cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }
}
fillCategories();

// =====================
// Render bảng giá
// =====================
function renderPricing() {
  const q = (document.getElementById("q")?.value || "").toLowerCase().trim();
  const cat = document.getElementById("filter-cat")?.value || "";
  const cats = loadCats();
  const prods = loadProds();

  const data = prods.filter((p) => {
    if (q && !`${p.code} ${p.name}`.toLowerCase().includes(q)) return false;
    if (cat && String(p.categoryId) !== cat) return false;
    return true;
  });

  const tbody = document.getElementById("pricing-body");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;color:#9aa3ad;padding:20px">
          Không có sản phẩm phù hợp
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = data
    .map((p, i) => {
      const catName = cats.find((c) => c.id === p.categoryId)?.name || "";
      const statusLabel =
        p.status === "selling"
          ? "Đang bán"
          : p.status === "stopped"
          ? "Hết bán"
          : "Ẩn";

      return `
      <tr>
        <td>${i + 1}</td>
        <td>${p.code}</td>
        <td>${p.name}</td>
        <td>${catName}</td>
        <td>${(p.cost || 0).toLocaleString("vi-VN")}</td>
        <td>
          <input
            type="number"
            class="input margin-input"
            data-id="${p.id}"
            value="${p.margin ?? 0}"
            min="0"
            style="width: 90px"
          />
        </td>
        <td>
          <span class="price-display" data-id="${p.id}">
            ${(p.price || 0).toLocaleString("vi-VN")}
          </span>
        </td>
        <td>${statusLabel}</td>
        <td>
          <button class="btn btn-action btn-save-one" data-id="${p.id}">
            Lưu
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

renderPricing();

// =====================
// Tìm kiếm / lọc
// =====================
document.getElementById("q")?.addEventListener("input", renderPricing);
document
  .getElementById("filter-cat")
  ?.addEventListener("change", renderPricing);

// =====================
// Khi đổi % lợi nhuận
// -> auto tính lại giá bán (hiển thị)
// =====================
document.getElementById("pricing-body")?.addEventListener("input", (e) => {
  const input = e.target.closest(".margin-input");
  if (!input) return;

  const id = Number(input.dataset.id);
  const margin = Number(input.value || 0);
  const prods = loadProds();
  const p = prods.find((x) => x.id === id);
  if (!p) return;

  const cost = Number(p.cost || 0);
  const price = Math.round(cost * (1 + margin / 100));

  const span = document.querySelector(`.price-display[data-id="${id}"]`);
  if (span) span.textContent = (price || 0).toLocaleString("vi-VN");
});

// =====================
// Lưu 1 dòng giá bán
// =====================
document.getElementById("pricing-body")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-save-one");
  if (!btn) return;
  e.preventDefault();

  const id = Number(btn.dataset.id);
  const marginInput = document.querySelector(`.margin-input[data-id="${id}"]`);
  const priceSpan = document.querySelector(`.price-display[data-id="${id}"]`);
  if (!marginInput || !priceSpan) return;

  const margin = Number(marginInput.value || 0);

  // lấy số từ text (đã format 1.000.000) -> về number
  const raw = priceSpan.textContent.replace(/[^\d]/g, "");
  const price = Number(raw || 0);

  const prods = loadProds();
  const i = prods.findIndex((x) => x.id === id);
  if (i < 0) return;

  prods[i].margin = margin;
  prods[i].price = price;

  saveProds(prods);
  alert("Đã cập nhật giá bán sản phẩm.");
});
