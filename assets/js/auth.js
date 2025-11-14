/*! auth.js — Client-side auth (localStorage) — no server required */
(function (w, d) {
  "use strict";

  // ======================= KEYS & FLAGS =======================
  const LS_USERS = "sv_users_v1"; // danh sách user thật
  const LS_AUTH = "sv_auth_user_v1"; // user đang đăng nhập

  // cờ để biết là vừa login bằng form
  const LOGIN_INTENT_FLAG = "sv_auth_via_login";
  const DEMO_EMAIL = "khachhang1@demo.local"; // demo account

  // ======================= HELPERS =======================
  function qs(sel, root) {
    return (root || d).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || d).querySelectorAll(sel));
  }

  function makeBackParam() {
    try {
      var href = w.location.pathname + w.location.search + w.location.hash;
      return encodeURIComponent(href);
    } catch (e) {
      return "";
    }
  }

  // 💡 SỬA: trỏ đúng trang login của bạn
  function redirectToLogin() {
    const back = makeBackParam();
    w.location.href = "../../account/login.html" + (back ? "?redirect=" + back : "");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m];
    });
  }

  function loadUsers() {
    try {
      return JSON.parse(localStorage.getItem(LS_USERS) || "[]");
    } catch {
      return [];
    }
  }
  function saveUsers(list) {
    localStorage.setItem(LS_USERS, JSON.stringify(list || []));
  }

  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem(LS_AUTH) || "null");
    } catch {
      return null;
    }
  }
  function setAuth(obj) {
    if (obj) localStorage.setItem(LS_AUTH, JSON.stringify(obj));
    else localStorage.removeItem(LS_AUTH);
    d.dispatchEvent(new Event("auth:changed"));
  }

  // hash demo
  function hash(s) {
    s = String(s || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  // ============= DEMO USER =============
  const DEMO_BUYER = Object.freeze({
    username: "khachhang1",
    email: DEMO_EMAIL,
    name: "Khách hàng 1",
    passHash: hash("123456"),
  });

  // đảm bảo demo user luôn có trong sv_users_v1
  function ensureDemoUserExists() {
    const users = loadUsers();
    const has = users.some((u) => u.email === DEMO_EMAIL);
    if (!has) {
      users.push({
        name: DEMO_BUYER.name,
        email: DEMO_BUYER.email,
        passHash: DEMO_BUYER.passHash,
        createdAt: new Date().toISOString(),
      });
      saveUsers(users);
    }
  }

  const AUTH = {
    ready: false,
    loggedIn: false,
    user: null,
    _queue: [],

    check: function () {
      const current = getAuth();

      AUTH.loggedIn = !!current;
      AUTH.user = current ? { name: current.name, email: current.email } : null;
      AUTH.ready = true;

      // 💡 nếu đang login bằng demo nhưng bảng user không có thì chèn vào
      if (AUTH.user && AUTH.user.email === DEMO_EMAIL) {
        ensureDemoUserExists();
      }

      AUTH.updateAuthUI();

      try {
        while (AUTH._queue.length) {
          var fn = AUTH._queue.shift();
          if (typeof fn === "function") fn();
        }
      } catch (_) {}

      d.dispatchEvent(new Event("auth:ready"));
      return Promise.resolve();
    },

    ensureReady: function (cb) {
      if (AUTH.ready) return cb && cb();
      AUTH._queue.push(cb);
    },

    requireLoginOrRedirect: function () {
      if (!AUTH.loggedIn) {
        redirectToLogin();
        return false;
      }
      return true;
    },

    updateAuthUI: function () {
      qsa("[data-auth-show]").forEach(function (el) {
        var want = (el.getAttribute("data-auth-show") || "").toLowerCase();
        var shouldShow = want === "logged-in" ? AUTH.loggedIn : !AUTH.loggedIn;
        el.style.display = shouldShow ? "" : "none";
      });

      var nameEl = qs("[data-auth-name]");
      if (nameEl)
        nameEl.textContent =
          (AUTH.user && (AUTH.user.name || AUTH.user.email)) || "";

      var chip = qs("#auth-chip");
      if (chip) {
        if (AUTH.loggedIn) {
          chip.innerHTML =
            "Xin chào, <strong>" +
            escapeHtml((AUTH.user && AUTH.user.name) || "") +
            '</strong> · <a href="#" data-logout>Đăng xuất</a>';
        } else {
          chip.innerHTML =
            '<a href="../../account/login.html">Đăng nhập</a> / <a href="../../account/register.html">Đăng ký</a>';
        }
      }
    },

    register: function (name, email, password) {
      name = String(name || "").trim();
      email = String(email || "")
        .trim()
        .toLowerCase();
      password = String(password || "");
      if (!name || !email || !password)
        throw new Error("Vui lòng nhập đầy đủ thông tin.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Email không hợp lệ.");

      const users = loadUsers();
      if (users.some((u) => u.email === email))
        throw new Error("Email đã tồn tại.");

      users.push({
        name,
        email,
        passHash: hash(password),
        createdAt: new Date().toISOString(),
      });
      saveUsers(users);

      setAuth({ name, email, loginAt: new Date().toISOString() });
      try {
        sessionStorage.setItem(LOGIN_INTENT_FLAG, "1");
      } catch (_) {}
      return { name, email };
    },

    login: function (emailOrUsername, password) {
      var id = String(emailOrUsername || "")
        .trim()
        .toLowerCase();
      var pwd = String(password || "");
      if (!id || !pwd) throw new Error("Vui lòng nhập email và mật khẩu.");

      // nhánh DEMO
      var isDemo =
        id === DEMO_BUYER.username || id === DEMO_BUYER.email.toLowerCase();
      if (isDemo && hash(pwd) === DEMO_BUYER.passHash) {
        // 💡 chèn luôn vào sv_users_v1 để mấy file enforcer không chửi
        ensureDemoUserExists();

        setAuth({
          name: DEMO_BUYER.name,
          email: DEMO_BUYER.email,
          loginAt: new Date().toISOString(),
        });
        try {
          sessionStorage.setItem(LOGIN_INTENT_FLAG, "1");
        } catch (_) {}
        return { name: DEMO_BUYER.name, email: DEMO_BUYER.email };
      }

      // login thường
      const email = id;
      const users = loadUsers();
      const u = users.find((u) => u.email === email);
      if (!u || u.passHash !== hash(pwd)) {
        throw new Error("Thông tin đăng nhập không đúng.");
      }

      setAuth({
        name: u.name,
        email: u.email,
        loginAt: new Date().toISOString(),
      });
      try {
        sessionStorage.setItem(LOGIN_INTENT_FLAG, "1");
      } catch (_) {}
      return { name: u.name, email: u.email };
    },

    logout: function () {
      setAuth(null);
      try {
        sessionStorage.removeItem(LOGIN_INTENT_FLAG);
      } catch (_) {}
    },
  };

  // ======================= GUARDS =======================
  function installGuards() {
    // nếu đang ở trang thanh toán thì đừng chặn
    var path = location.pathname;
    var isCheckout =
      path.includes("checkout") ||
      path.includes("thanhtoan") ||
      path.includes("thanh-toan");

    if (!isCheckout) {
      // chặn add-to-cart khi chưa login
      d.addEventListener(
        "click",
        function (e) {
          var btn =
            e.target &&
            e.target.closest(
              ".btn-add-cart, [data-add-to-cart], .js-add-to-cart"
            );
          if (!btn) return;
          if (!AUTH.loggedIn) {
            e.preventDefault();
            e.stopImmediatePropagation && e.stopImmediatePropagation();
            redirectToLogin();
          }
        },
        true
      );

      // chặn form mua nhanh
      d.addEventListener(
        "submit",
        function (e) {
          var form = e.target && e.target.closest("#buyForm, .js-buy-form");
          if (!form) return;
          if (!AUTH.loggedIn) {
            e.preventDefault();
            e.stopImmediatePropagation && e.stopImmediatePropagation();
            redirectToLogin();
          }
        },
        true
      );
    }

    // nút logout
    d.addEventListener("click", function (e) {
      var out = e.target && e.target.closest("[data-logout]");
      if (!out) return;
      e.preventDefault();
      AUTH.logout();
      AUTH.check();
    });
  }

  // ======================= EXPORT & INIT =======================
  w.AUTH = AUTH;

  d.addEventListener("DOMContentLoaded", function () {
    installGuards();
    AUTH.check();
  });
})(window, document);
