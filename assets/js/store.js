// /assets/js/store.js - GIỎ HÀNG THEO TÀI KHOẢN
(function (w) {
  // ===== Helpers =====
  const fmtVND = n =>
    (n || n === 0) ? Number(n).toLocaleString('vi-VN') + '₫' : '';

  const toNumber = v =>
    typeof v === 'number' ? v : Number(String(v).replace(/[^\d]/g, '')) || 0;

  const clampNonNegative = n => {
    const x = toNumber(n);
    return x < 0 ? 0 : x;
  };

  function normalizeBadge(p) {
    if (!p || !p.badge) return '';
    const b = String(p.badge).toLowerCase().trim();
    const map = { sale: 'sale', new: 'new', oos: 'out_of_stock', out_of_stock: 'out_of_stock' };
    return map[b] || '';
  }

  function getAllProducts() {
    try {
      const saved = localStorage.getItem('SV_PRODUCTS');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return w.SV_PRODUCT_SEED || [];
  }

  function filterProducts(list, { q, category, minPrice, maxPrice }) {
    let rs = list.slice();
    if (q && String(q).trim()) {
      const kw = String(q).trim().toLowerCase();
      rs = rs.filter(p => (p.name || '').toLowerCase().includes(kw));
    }
    if (category && category !== 'all') {
      const c = String(category).toLowerCase();
      rs = rs.filter(p => (p.category || '').toLowerCase() === c);
    }
    if (minPrice != null && String(minPrice).trim() !== '') {
      const min = clampNonNegative(minPrice);
      rs = rs.filter(p => toNumber(p.price) >= min);
    }
    if (maxPrice != null && String(maxPrice).trim() !== '') {
      const max = clampNonNegative(maxPrice);
      rs = rs.filter(p => toNumber(p.price) <= max);
    }
    return rs;
  }

  function sortProducts(list, sort) {
    if (!sort) return list;
    const [key, dir] = String(sort).split('-');
    const dirN = dir === 'desc' ? -1 : 1;
    return list.slice().sort((a, b) => {
      if (key === 'price') return (toNumber(a.price) - toNumber(b.price)) * dirN;
      if (key === 'name')  return String(a.name).localeCompare(String(b.name), 'vi') * dirN;
      return 0;
    });
  }

  function paginate(list, page = 1, perPage = 12) {
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const cur = Math.min(Math.max(1, Number(page) || 1), pages);
    const start = (cur - 1) * perPage;
    const end = start + perPage;
    return { items: list.slice(start, end), total, pages, page: cur, perPage };
  }

  // ===== Cart (localStorage THEO EMAIL) =====
  const CART_KEY_PREFIX = 'sv_cart_user_'; // prefix + email

  function getCartKey() {
    // Lấy email người dùng đang đăng nhập
    const user = w.AUTH?.user;
    if (!user || !user.email) return null;
    return CART_KEY_PREFIX + user.email.toLowerCase();
  }

  const getCart = () => {
    const key = getCartKey();
    if (!key) return []; // chưa đăng nhập = giỏ rỗng
    try { 
      return JSON.parse(localStorage.getItem(key) || '[]'); 
    } catch { 
      return []; 
    }
  };

  const saveCart = (cart) => {
    const key = getCartKey();
    if (!key) return; // không lưu nếu chưa đăng nhập
    localStorage.setItem(key, JSON.stringify(cart));
  };

  // phát sự kiện toàn cục mỗi khi giỏ đổi
  function emitCartChanged() {
    try { 
      window.dispatchEvent(new CustomEvent('cart:changed')); 
    } catch (_) {}
  }

  function addToCart(id, qty = 1) {
    if (!w.AUTH?.loggedIn) {
      console.warn('[SVStore] Chưa đăng nhập - không thể thêm vào giỏ');
      return [];
    }
    qty = clampNonNegative(qty) || 1;
    const cart = getCart();
    const i = cart.findIndex(x => x.id === id);
    if (i > -1) cart[i].qty += qty; 
    else cart.push({ id, qty });
    saveCart(cart);
    emitCartChanged();
    return cart;
  }

  function setQty(id, qty) {
    if (!w.AUTH?.loggedIn) return [];
    qty = clampNonNegative(qty) || 1;
    const cart = getCart().map(x => x.id === id ? { ...x, qty } : x);
    saveCart(cart);
    emitCartChanged();
    return cart;
  }

  function removeFromCart(id) {
    if (!w.AUTH?.loggedIn) return [];
    const cart = getCart().filter(x => x.id !== id);
    saveCart(cart);
    emitCartChanged();
    return cart;
  }

  function clearCart() {
    if (!w.AUTH?.loggedIn) return;
    saveCart([]);
    emitCartChanged();
  }

  const count = () => {
    if (!w.AUTH?.loggedIn) return 0;
    return getCart().reduce((s, x) => s + (x.qty || 0), 0);
  };

  function total(products = null) {
    if (!w.AUTH?.loggedIn) return 0;
    const list = products || getAllProducts();
    const map = new Map(list.map(p => [p.id, p]));
    return getCart().reduce((s, x) => {
      const p = map.get(x.id);
      return s + (p ? toNumber(p.price) * (x.qty || 0) : 0);
    }, 0);
  }

  w.SVStore = {
    fmtVND, toNumber, normalizeBadge, getAllProducts,
    query(opts = {}) {
      const {
        q = '', category = 'all',
        minPrice = '', maxPrice = '',
        sort = '', page = 1, perPage = 12,
        featured = null
      } = opts;

      const base = getAllProducts();
      const baseByFeatured = base.filter(p =>
        featured === null ? true : (!!p.featured === !!featured)
      );
      const filtered = filterProducts(baseByFeatured, { q, category, minPrice, maxPrice });
      const sorted = sortProducts(filtered, sort);
      return paginate(sorted, page, perPage);
    },

    // Cart API
    getCart, addToCart, setQty, removeFromCart, clearCart, count, total
  };

  // Alias cho backward compat
  window.SVCart = {
    add: (id, qty=1) => {
      if (!w.AUTH?.loggedIn) {
        console.warn('[SVCart] Chưa đăng nhập');
        return;
      }
      w.SVStore?.addToCart(id, qty);
      window.dispatchEvent(new CustomEvent('cart:changed'));
    },
    count: () => w.SVStore?.count?.() ?? 0
  };

  // Khi auth thay đổi (login/logout) → refresh badge
  document.addEventListener('auth:changed', () => {
    emitCartChanged();
  });

})(window);