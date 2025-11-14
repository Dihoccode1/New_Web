// /admin/assets/js/admin.common.js
(function () {
  // 1) Đọc session admin hiện tại
  let u = null;
  try {
    u = JSON.parse(sessionStorage.getItem("session.user") || "null");
  } catch {}

  // Nếu không có hoặc không phải admin -> về login
  if (!u || u.role !== "admin") {
    location.replace("./login.html");
    return;
  }

  // ===== 2) CHECK BẮT BUỘC: nếu tài khoản admin bị khóa / đổi mật khẩu -> ép đăng xuất =====
  (function () {
    try {
      const email = String(u.email || u.username || "").toLowerCase();
      if (!email) return;

      function readList(key) {
        try {
          const raw = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(raw) ? raw : [];
        } catch {
          return [];
        }
      }

      let reason = "";

      // a) Nếu bị đánh dấu trong danh sách force logout vì khóa
      const lockedList = readList("sv_force_logout_locked");
      if (lockedList.includes(email)) {
        reason =
          "Tài khoản quản trị của bạn đã bị khóa bởi hệ thống. Vui lòng liên hệ quản lý cấp cao.";
        localStorage.setItem(
          "sv_force_logout_locked",
          JSON.stringify(lockedList.filter((x) => x !== email))
        );
      }

      // b) Nếu chưa có reason và bị đánh dấu đổi mật khẩu
      if (!reason) {
        const pwdList = readList("sv_force_logout_password");
        if (pwdList.includes(email)) {
          reason =
            "Mật khẩu tài khoản quản trị đã được thay đổi. Vui lòng đăng nhập lại để tiếp tục.";
          localStorage.setItem(
            "sv_force_logout_password",
            JSON.stringify(pwdList.filter((x) => x !== email))
          );
        }
      }

      // c) Nếu chưa có reason, kiểm tra trạng thái trong bs_users / sv_users_v1
      if (!reason) {
        try {
          const bs = JSON.parse(localStorage.getItem("bs_users") || "[]") || [];
          const found = bs.find(
            (it) => String(it.email || it.username || "")
              .toLowerCase() === email
          );
          if (found && String(found.status || "").toLowerCase() === "locked") {
            reason =
              "Tài khoản quản trị của bạn hiện đang bị khóa. Vui lòng liên hệ chủ hệ thống.";
          }
        } catch {}
        try {
          const sv = JSON.parse(localStorage.getItem("sv_users_v1") || "[]") || [];
          const found2 = sv.find(
            (it) => String(it.email || "").toLowerCase() === email
          );
          if (
            !reason &&
            found2 &&
            String(found2.status || "").toLowerCase() === "locked"
          ) {
            reason =
              "Tài khoản quản trị của bạn hiện đang bị khóa. Vui lòng liên hệ chủ hệ thống.";
          }
        } catch {}
      }

      // Nếu có lý do -> xóa session & chuyển về trang login kèm thông báo
      if (reason) {
        sessionStorage.removeItem("session.user");
        // có thể thêm clear localStorage auth nếu bạn dùng
        // localStorage.removeItem("session.user");
        // localStorage.removeItem("AUTH_TOKEN");

        const url =
          "./login.html?msg=" + encodeURIComponent(reason);
        location.replace(url);
      }
    } catch (e) {
      // lỗi im lặng, không chặn admin nếu check fail
      console.warn("Admin force-logout check error:", e);
    }
  })();

  // Nếu qua được đoạn trên => admin hợp lệ
  window.CURRENT_ADMIN = u;

  // 3) Sau khi DOM sẵn sàng: hiển thị tên + nút logout
  document.addEventListener("DOMContentLoaded", () => {
    const nameEl = document.getElementById("admin-username");
    if (nameEl) {
      // Ưu tiên fullname, fallback username/email
      nameEl.textContent =
        u.fullname || u.name || u.username || u.email || "Admin";
    }

    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        sessionStorage.removeItem("session.user");
        // localStorage.removeItem("session.user"); // nếu có lưu
        location.href = "./login.html";
      });
    }
  });
})();
