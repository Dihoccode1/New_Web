(function () {
  if (window.SV_DISABLE_LISTING_APP) return;

  // ====== Config ======
  const PAGE_SIZE = 8;

  // ====== Utils DOM & Format ======
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const moneyVND = (n) =>
    (n ?? 0).toLocaleString("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    });
  const stripVN = (str = "") =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  // ====== URL query helpers ======
  const getQuery = (k, def = "") => {
    const u = new URL(location.href);
    return u.searchParams.get(k) ?? def;
  };
  const setQuery = (obj) => {
    const u = new URL(location.href);
    Object.entries(obj).forEach(([k, v]) => {
      if (v === null || v === "" || v === undefined) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    });
    history.replaceState({}, "", u.toString());
  };

  // ====== Data ======
  function getAllProducts() {
    return Array.isArray(window.SV_PRODUCT_SEED) ? window.SV_PRODUCT_SEED : [];
  }

  // Badge giỏ ở header
  function updateCartBadge() {
    const el = document.querySelector("#cartCount, .cart-count");
    if (el && window.SVStore?.count) el.textContent = SVStore.count();
  }

  // ====== UI build ======
  function badgeHTML(badge) {
    if (!badge) return "";
    const map = {
      sale: { cls: "badge-sale", text: "Sale" },
      new: { cls: "badge-sale", text: "Mới" },
      oos: { cls: "badge-out-of-stock", text: "Hết hàng" },
      out_of_stock: { cls: "badge-out-of-stock", text: "Hết hàng" },
    };
    const meta = map[String(badge).toLowerCase()] || null;
    return meta
      ? `<span class="product-badge ${meta.cls}">${meta.text}</span>`
      : "";
  }

  function isOutOfStock(p) {
    const b = String(p.badge || "").toLowerCase();
    return (
      b === "oos" ||
      b === "out_of_stock" ||
      (typeof p.stock === "number" && p.stock <= 0)
    );
  }

  function productDetailUrl(p) {
    return `../../sanpham/pages/product_detail.html?id=${encodeURIComponent(p.id)}`;
  }

  function itemHTML(p) {
    const ori =
      p.original_price && Number(p.original_price) > Number(p.price)
        ? `<span class="original-price">${moneyVND(p.original_price)}</span>`
        : "";

    const disabled = isOutOfStock(p) ? "disabled" : "";
    const btnText = isOutOfStock(p) ? "Hết hàng" : "Thêm giỏ";

    return `
      <div class="col-lg-3 col-md-4 col-sm-6 col-6">
        <div class="product-item">
          <a href="${productDetailUrl(p)}">
            <div class="product-image">
              ${badgeHTML(p.badge)}
              <img src="${p.image}" alt="${p.name}">
            </div>
            <div class="product-name">${p.name}</div>
            <div class="product-price">
              <span class="sale-price">${moneyVND(p.price)}</span>
              ${ori}
            </div>
          </a>
          <div class="mt-2">
            <button class="btn btn-sm btn-dark btn-add-cart" data-id="${
              p.id
            }" ${disabled}>
              <i class="fas fa-cart-plus"></i> ${btnText}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Lọc theo: q (tên), category, minprice, maxprice
  function filterProducts(all) {
    const q = (getQuery("q", "") || "").trim();
    const category = (getQuery("category", "all") || "all").toLowerCase();
    const minprice = Number(getQuery("minprice", "")) || null;
    const maxprice = Number(getQuery("maxprice", "")) || null;

    const qNorm = stripVN(q);

    let result = all;

    if (q) {
      result = result.filter((p) => stripVN(p.name).includes(qNorm));
    }
    if (category !== "all") {
      result = result.filter(
        (p) => (p.category || "").toLowerCase() === category
      );
    }
    result = result.filter((p) => {
      const price = Number(p.price || 0);
      if (minprice !== null && price < minprice) return false;
      if (maxprice !== null && price > maxprice) return false;
      return true;
    });

    return { result, q, category, minprice, maxprice };
  }

  function buildPagination(pages, current) {
    const buildHref = (p) => {
      const params = new URLSearchParams();
      const q = getQuery("q", "");
      const category = getQuery("category", "all");
      const minprice = getQuery("minprice", "");
      const maxprice = getQuery("maxprice", "");

      if (q) params.set("q", q);
      if (category && category !== "all") params.set("category", category);
      if (minprice) params.set("minprice", minprice);
      if (maxprice) params.set("maxprice", maxprice);
      params.set("page", String(p));
      return `?${params.toString()}`;
    };

    const li = (label, p, active = false, disabled = false) =>
      active
        ? `<li class="page-item active"><span class="page-link">${label}</span></li>`
        : `<li class="page-item${
            disabled ? " disabled" : ""
          }"><a class="page-link" href="${buildHref(p)}">${label}</a></li>`;

    let html = "";
    html += li("«", Math.max(1, current - 1), false, current === 1);
    for (let i = 1; i <= pages; i++) html += li(String(i), i, i === current);
    html += li("»", Math.min(pages, current + 1), false, current === pages);
    return html;
  }

  function render(all, page, pageSize) {
    const row = $(".product-list .row");
    if (!row) return;

    const { result: filtered } = filterProducts(all);
    const sorted = filtered;

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const cur = Math.min(Math.max(1, page), totalPages);
    const start = (cur - 1) * pageSize;
    const pageItems = sorted.slice(start, start + pageSize);

    row.innerHTML = pageItems.length
      ? pageItems.map(itemHTML).join("")
      : `<div class="col-12 py-5 text-center text-muted">Không tìm thấy sản phẩm phù hợp.</div>`;

    const info = $("#categoryInfo");
    if (info) {
      info.textContent = `${total} sản phẩm`;
    }

    const pag = $(".pagination-list");
    if (pag) {
      pag.innerHTML = buildPagination(totalPages, cur);

      pag.addEventListener(
        "click",
        function (e) {
          const a = e.target.closest("a.page-link");
          if (!a) return;
          e.preventDefault();
          const u = new URL(a.href, location.origin);
          const next = Number(u.searchParams.get("page") || "1");
          setQuery(Object.fromEntries(u.searchParams.entries()));
          render(all, next, pageSize);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        { once: true }
      );
    }

    updateCartBadge();
  }

  function boot() {
    const all = getAllProducts();

    const form = $("#searchForm");
    if (form) {
      if (form.q) form.q.value = getQuery("q", "");
      if (form.category)
        form.category.value = getQuery("category", "all") || "all";
      if (form.minprice) form.minprice.value = getQuery("minprice", "");
      if (form.maxprice) form.maxprice.value = getQuery("maxprice", "");

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = (form.q?.value || "").trim();
        const category = form.category ? form.category.value : "all";
        const minprice =
          form.minprice && form.minprice.value
            ? Number(form.minprice.value)
            : null;
        const maxprice =
          form.maxprice && form.maxprice.value
            ? Number(form.maxprice.value)
            : null;

        setQuery({
          q: q || null,
          category: category || "all",
          minprice: minprice != null ? String(minprice) : null,
          maxprice: maxprice != null ? String(maxprice) : null,
          page: "1",
        });
        render(all, 1, PAGE_SIZE);
      });
    }

    // === Event: Thêm giỏ - BẮT BUỘC ĐĂNG NHẬP ===
    document.addEventListener(
      "click",
      function (e) {
        const btn = e.target.closest(".btn-add-cart");
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function")
          e.stopImmediatePropagation();

        // ✅ KIỂM TRA ĐĂNG NHẬP
        if (!window.AUTH?.loggedIn) {
          alert("Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!");
          const back = location.pathname + location.search + location.hash;
          location.href =
            "../../account/login.html?redirect=" + encodeURIComponent(back);
          return;
        }

        if (btn.disabled || btn.dataset.busy === "1") return;

        const id = btn.dataset.id || btn.getAttribute("data-id");
        let qty = parseInt(btn.dataset.qty || "1", 10);
        if (!id) return;
        if (!Number.isFinite(qty) || qty < 1) qty = 1;

        btn.dataset.busy = "1";

        // Gọi API giỏ hàng (đã kiểm tra auth bên trong)
        if (window.SVStore?.addToCart) {
          window.SVStore.addToCart(id, qty);
        }

        updateCartBadge();
        window.SVUI?.updateCartCount?.();

        const prev = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-check"></i> Đã thêm`;
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = prev;
          btn.dataset.busy = "";
        }, 800);
      },
      true
    );

    // đồng bộ badge nếu giỏ đổi từ tab khác
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith("sv_cart_user_")) updateCartBadge();
    });

    window.addEventListener("cart:changed", updateCartBadge);

    const page = Number(getQuery("page", "1")) || 1;
    render(all, page, PAGE_SIZE);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
