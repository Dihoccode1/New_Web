// /assets/js/ui.js

(function (w, d) {
  const $  = (s, r = d) => r.querySelector(s);

  // === Helpers chung ===
  const fmtVND = n =>
    (n ?? 0).toLocaleString("vi-VN") + "₫";

  const toNumber = v =>
    typeof v === "number"
      ? v
      : Number(String(v).replace(/[^\d]/g, "")) || 0;

  const stripVN = (str = "") =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const normalizeBadge = (p) => {
    const b = String(p?.badge || "").toLowerCase().trim();
    if (b === "sale") return "sale";
    if (b === "new") return "new";
    if (b === "oos" || b === "out_of_stock") return "out_of_stock";
    return "";
  };

  const isOOS = (p) =>
    normalizeBadge(p) === "out_of_stock" ||
    (typeof p.stock === "number" && p.stock <= 0);

  // Luôn build về /sanpham/pages/product_detail.html
  const productDetailUrl = (p) =>
    `../../sanpham/pages/product_detail.html?id=${encodeURIComponent(p.id)}`;

  const badgeHTML = (p) => {
    const b = normalizeBadge(p);
    if (b === "sale")        return `<span class="product-badge badge-sale">Sale</span>`;
    if (b === "new")         return `<span class="product-badge badge-new">Mới</span>`;
    if (b === "out_of_stock")return `<span class="product-badge badge-out-of-stock">Hết hàng</span>`;
    return "";
  };

  // === CARD HTML có nút "Thêm giỏ" ===
  const cardHTML = (p) => {
    const original =
      p.original_price && toNumber(p.original_price) > toNumber(p.price)
        ? `<span class="original-price">${fmtVND(p.original_price)}</span>`
        : "";

    const disabled = isOOS(p) ? "disabled" : "";
    const btnText  = isOOS(p) ? "Hết hàng" : "Thêm giỏ";

    return `
      <div class="col-6 col-md-4 col-lg-3">
        <div class="product-item">
          <a href="${productDetailUrl(p)}">
            <div class="product-image">
              ${badgeHTML(p)}
              <img src="${p.image}" alt="${p.name}">
            </div>
            <div class="product-name">${p.name}</div>
            <div class="product-price">
              <span class="sale-price">${fmtVND(p.price)}</span>${original}
            </div>
          </a>
          <div class="mt-2">
            <button class="btn btn-sm btn-dark btn-add-cart" data-id="${p.id}" ${disabled}>
              <i class="fas fa-cart-plus"></i> ${btnText}
            </button>
          </div>
        </div>
      </div>`;
  };

  const buildPagination = (pages, current) => {
    if (pages <= 1) return "";
    let html = "";
    if (current > 1) {
      html += `<li class="page-item">
        <a class="page-link" data-page="${current - 1}" href="#">&larr;</a>
      </li>`;
    }
    for (let i = 1; i <= pages; i++) {
      html += `<li class="page-item ${i === current ? "active" : ""}">
        <a class="page-link" data-page="${i}" href="#">${i}</a>
      </li>`;
    }
    if (current < pages) {
      html += `<li class="page-item">
        <a class="page-link" data-page="${current + 1}" href="#">&rarr;</a>
      </li>`;
    }
    return html;
  };

  // === Badge giỏ ở header (dùng SVStore) ===
  function updateCartCount() {
    const el = d.querySelector("#cartCount") || d.querySelector(".cart-count");
    if (!el) return;

    let n = 0;
    if (w.SVStore?.count) {
      n = SVStore.count();
    } else {
      // fallback đọc trực tiếp nếu cần
      try {
        const c = JSON.parse(localStorage.getItem("sv_cart_user_fallback") || "[]");
        n = c.reduce((s, x) => s + (x.qty || 0), 0);
      } catch (_) {}
    }
    el.textContent = n;
  }

  // === Khởi tạo lưới sản phẩm + filter + phân trang ===
  function init(opts = {}) {
    const grid       = $("#product-grid");
    const pagination = $("#pagination");
    const form       = $("#searchForm");

    if (!grid || !pagination) return;

    // Base list: SVStore.getAllProducts ưu tiên, fallback seed
    let base =
      (w.SVStore?.getAllProducts?.() || w.SV_PRODUCT_SEED || []).slice();

    // Chế độ trang
    if (opts.saleOnly)     base = base.filter((p) => normalizeBadge(p) === "sale");
    if (opts.newOnly)      base = base.filter((p) => normalizeBadge(p) === "new");
    if (opts.featuredOnly) base = base.filter((p) => p.featured === true);

    // State
    const state = {
      q: "",
      category: "all",
      minPrice: "",
      maxPrice: "",
      sort: "",
      page: 1,
      perPage: 8,
    };

    const filterSortPaginate = () => {
      let rs = base.slice();

      // search
      if (state.q) {
        const kw = stripVN(state.q);
        rs = rs.filter((p) => stripVN(p.name || "").includes(kw));
      }

      // category
      if (state.category !== "all") {
        const c = (state.category || "").toLowerCase();
        rs = rs.filter((p) => (p.category || "").toLowerCase() === c);
      }

      // price
      if (state.minPrice !== "") {
        const min = Math.max(0, toNumber(state.minPrice));
        rs = rs.filter((p) => toNumber(p.price) >= min);
      }
      if (state.maxPrice !== "") {
        const max = Math.max(0, toNumber(state.maxPrice));
        rs = rs.filter((p) => toNumber(p.price) <= max);
      }

      // sort
      if (state.sort) {
        const [key, dir] = state.sort.split("-");
        const dirN = dir === "desc" ? -1 : 1;
        rs.sort((a, b) => {
          if (key === "price") {
            return (toNumber(a.price) - toNumber(b.price)) * dirN;
          }
          if (key === "name") {
            return String(a.name).localeCompare(String(b.name), "vi") * dirN;
          }
          return 0;
        });
      }

      const total = rs.length;
      const pages = Math.max(1, Math.ceil(total / state.perPage));
      const page  = Math.min(Math.max(1, state.page), pages);
      const items = rs.slice(
        (page - 1) * state.perPage,
        (page - 1) * state.perPage + state.perPage
      );

      return { items, pages, page };
    };

    const render = () => {
      const { items, pages, page } = filterSortPaginate();
      grid.innerHTML =
        items.map(cardHTML).join("") ||
        `<div class="col-12 py-5 text-center text-muted">
           Không có sản phẩm phù hợp.
         </div>`;
      pagination.innerHTML = buildPagination(pages, page);
      updateCartCount();
    };

    // phân trang
    pagination.addEventListener("click", (e) => {
      const a = e.target.closest("a.page-link");
      if (!a) return;
      e.preventDefault();
      state.page = Number(a.dataset.page) || 1;
      render();
    });

    // form lọc
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      state.q        = (form.q?.value || "").trim();
      state.category = form.category?.value || "all";
      state.minPrice = form.priceMin?.value || "";
      state.maxPrice = form.priceMax?.value || "";
      state.sort     = form.sort?.value || "";
      state.page     = 1;
      render();
    });

    // === Event: Add to cart (delegation, SVStore) ===
    d.addEventListener("click", function (e) {
      const btn = e.target.closest(".btn-add-cart");
      if (!btn) return;

      const id = btn.getAttribute("data-id");
      if (!id || !w.SVStore?.addToCart) return;

      SVStore.addToCart(id, 1);
      updateCartCount();

      // feedback
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-check"></i> Đã thêm`;
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = old;
      }, 800);
    });

    render();
  }

  // export
  w.SVUI = {
    init,
    updateCartCount,
  };

  // Cập nhật badge giỏ khi trang load xong
  d.addEventListener("DOMContentLoaded", () => {
    updateCartCount();
  });

})(window, document);
