// ===== CẦU NỐI AUTH <-> UI (KHÔNG MODAL) =====
(function (w, d) {
  "use strict";

  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }

  function updateAuthUI() {
    const topbarRight = d.querySelector(".topbar-right");
    if (!topbarRight) return;

    if (w.AUTH?.loggedIn && w.AUTH.user) {
      const user = w.AUTH.user;
      const displayName = user.name || user.email || "User";

      // --- KHI ĐÃ ĐĂNG NHẬP ---
      // --- KHI ĐÃ ĐĂNG NHẬP ---
      topbarRight.innerHTML = `
  <div class="welcome-user">
    <span class="welcome-message">Chào mừng</span>
    <a class="user-name" href="/account/profile.html">${escapeHtml(
      displayName
    )}</a>
  </div>
  <a href="#" data-logout class="btn btn-primary">ĐĂNG XUẤT</a>
`;
    } else {
      // --- KHI CHƯA ĐĂNG NHẬP ---
      topbarRight.innerHTML = `
        <a href="/account/register.html" class="btn btn-outline">ĐĂNG KÝ</a>
        <a href="/account/login.html" class="btn btn-primary">ĐĂNG NHẬP</a>
      `;
    }
    updateCartBadge();
  }

  function updateCartBadge() {
    const badges = d.querySelectorAll(".cart-count, #cartCount");
    const count = w.SVStore?.count?.() || 0;
    badges.forEach((el) => {
      if (el) el.textContent = count;
    });
  }

  d.addEventListener("click", function (e) {
    const logoutBtn = e.target.closest("[data-logout]");
    if (!logoutBtn) return;
    e.preventDefault();
    if (confirm("Bạn có chắc muốn đăng xuất?")) {
      w.AUTH?.logout?.();
    }
  });

  d.addEventListener("auth:ready", updateAuthUI);
  d.addEventListener("auth:changed", updateAuthUI);
  d.addEventListener("cart:changed", updateCartBadge);
  w.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("sv_cart_user_")) {
      updateCartBadge();
    }
  });

  if (d.readyState !== "loading") {
    w.AUTH?.check?.();
  } else {
    d.addEventListener("DOMContentLoaded", () => w.AUTH?.check?.());
  }
})(window, document);
