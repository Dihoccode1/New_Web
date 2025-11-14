// /assets/js/catalog.bridge.js
(function (w) {
  const PUBLIC_CATALOG_KEY = "sv_products_v1";

  // Nếu store.js đã tạo SVStore thì kế thừa, còn không thì dùng object rỗng
  const base = w.SVStore && typeof w.SVStore === "object" ? w.SVStore : {};

  function loadPublic() {
    try {
      return JSON.parse(localStorage.getItem(PUBLIC_CATALOG_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function loadSeed() {
    return Array.isArray(w.SV_PRODUCT_SEED) ? w.SV_PRODUCT_SEED : [];
  }

  // Gộp theo id (admin ghi đè seed nếu trùng id)
  function merge(a = [], b = []) {
    const map = new Map();
    a.forEach((p) => map.set(String(p.id), p));
    b.forEach((p) => map.set(String(p.id), p));
    return [...map.values()];
  }

  // API mới kế thừa từ base (không freeze để không chặn code cũ thêm method)
  const api = Object.assign({}, base, {
    getAllProducts() {
      // 1) seed + admin public
      const merged = merge(loadSeed(), loadPublic());

      // 2) nếu store.js cũ cũng có getAllProducts → gộp thêm (không bắt buộc)
      if (typeof base.getAllProducts === "function") {
        try {
          const extra = base.getAllProducts();
          if (Array.isArray(extra) && extra.length) return merge(merged, extra);
        } catch {}
      }
      return merged;
    },
    findById(id) {
      const idStr = String(id);
      const fromMerged = this.getAllProducts().find(
        (p) => String(p.id) === idStr
      );
      if (fromMerged) return fromMerged;
      if (typeof base.findById === "function") return base.findById(id);
      return null;
    },
    // addToCart... và các hàm khác giữ nguyên từ base nếu có
  });

  w.SVStore = api;
})(window);
