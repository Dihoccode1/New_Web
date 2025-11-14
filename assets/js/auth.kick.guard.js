/**
 * Logout tức thì khi tài khoản bị khóa (client-only, localStorage).
 * Bền vững với nhiều kiểu session & key khác nhau.
 */
(function () {
  // ==== cấu hình đường dẫn login (tự suy đoán + fallback) ====
  function guessLoginURL() {
    if (window.AUTH?.LOGIN_URL) return window.AUTH.LOGIN_URL;
    // tìm anchor có chữ login
    var a = document.querySelector('a[href*="login"]');
    if (a && a.href) return a.href;
    // các fallback phổ biến (đổi theo site bạn)
    var candidates = [
      "../../account/login.html",
      "/dangnhap.html",
      "../../account/login.html",
      "../../account/login.html",
      "./dangnhap.html",
      "../../account/login.html",
    ];
    return candidates[0];
  }
  var LOGIN_URL = guessLoginURL();

  // ==== các key kho chứa user phía bạn (dự phòng nhiều biến thể) ====
  var KS = {
    usersA: "sv_users_v1", // chuẩn mình đề xuất
    usersAlt: "sv_users", // đề phòng bạn dùng key ngắn
    usersLegacy: "users", // đề phòng key rất cũ
    bs: "bs_users", // mirror dạng bảng đơn
  };

  // ==== helpers ====
  function loadJSON(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k) || JSON.stringify(d));
    } catch {
      return d;
    }
  }
  function getSessionUser() {
    // 1) sessionStorage
    try {
      var s = JSON.parse(sessionStorage.getItem("session.user") || "null");
      if (s && (s.email || s.username)) return s;
    } catch {}

    // 2) biến AUTH bạn đang xài
    if (window.AUTH && (AUTH.user || AUTH.profile)) {
      return AUTH.user || AUTH.profile;
    }

    // 3) localStorage dự phòng
    try {
      var s2 = JSON.parse(localStorage.getItem("session.user") || "null");
      if (s2 && (s2.email || s2.username)) return s2;
    } catch {}

    return null;
  }
  function normalizeEmail(u) {
    var e = u?.email || u?.username || "";
    return String(e).trim().toLowerCase();
  }
  function isLocked(emailLC) {
    if (!emailLC) return false;

    // sv_users_v1
    var sv = loadJSON(KS.usersA, []);
    var u = sv.find((x) => String(x.email || "").toLowerCase() === emailLC);
    if (u && u.status === "locked") return true;

    // bs_users (bảng phụ)
    var bs = loadJSON(KS.bs, []);
    var b = bs.find((x) => String(x.email || "").toLowerCase() === emailLC);
    if (b && b.status === "locked") return true;

    // dự phòng key cũ
    var sv2 = loadJSON(KS.usersAlt, []);
    var u2 = sv2.find((x) => String(x.email || "").toLowerCase() === emailLC);
    if (u2 && u2.status === "locked") return true;

    var sv3 = loadJSON(KS.usersLegacy, []);
    var u3 = sv3.find((x) => String(x.email || "").toLowerCase() === emailLC);
    if (u3 && u3.status === "locked") return true;

    return false;
  }
  function forceLogout(redirectUrl) {
    try {
      sessionStorage.removeItem("session.user");
    } catch {}
    try {
      localStorage.removeItem("session.user");
    } catch {}
    // Nếu hệ auth của bạn có API logout, gọi thêm ở đây
    if (window.AUTH && typeof AUTH.logout === "function") {
      try {
        AUTH.logout();
      } catch {}
    }
    location.replace(redirectUrl || LOGIN_URL);
  }

  // ==== check ngay + nghe tín hiệu ====
  function checkNow() {
    var su = getSessionUser();
    if (!su) return;
    var emailLC = normalizeEmail(su);
    if (!emailLC) return;
    if (isLocked(emailLC)) forceLogout();
  }

  // 1) kiểm tra khi trang sẵn sàng / lấy lại focus
  document.addEventListener("DOMContentLoaded", checkNow);
  window.addEventListener("focus", checkNow);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkNow();
  });

  // 2) nghe localStorage events (từ tab admin cùng origin)
  window.addEventListener("storage", function (e) {
    var su = getSessionUser();
    if (!su) return;
    var emailLC = normalizeEmail(su);
    if (!emailLC) return;

    // Admin phát “kick” cụ thể theo email (chuẩn mình đề xuất)
    if (e.key === "auth.kick." + emailLC) {
      forceLogout();
      return;
    }

    // Bất kỳ thay đổi nào trong kho user => kiểm tra lại
    var touchedKeys = [
      KS.usersA,
      KS.usersAlt,
      KS.usersLegacy,
      KS.bs,
      "auth.bump." + emailLC,
    ];
    if (touchedKeys.includes(e.key)) checkNow();
  });

  // 3) dự phòng: poll nhẹ mỗi 5s (phòng khi không có storage event)
  setInterval(checkNow, 5000);
})();
