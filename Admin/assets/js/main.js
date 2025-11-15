// --- Active item in sidebar ---
const navItems = document.querySelectorAll(".navagation li");
navItems.forEach((li) => {
  li.addEventListener("click", () => {
    navItems.forEach((x) => x.classList.remove("hovered"));
    li.classList.add("hovered");
  });
});

// --- Menu toggle (null-safe, 1 bản duy nhất) ---
const toggleBtn = document.querySelector(".toggle");
const nav = document.querySelector(".navagation");
const main = document.querySelector(".main");

if (toggleBtn && nav && main) {
  toggleBtn.addEventListener("click", () => {
    nav.classList.toggle("active");
    main.classList.toggle("active");
  });
}

// Không xử lý .topbar .search ở file này nữa
// ==========================
// HIỂN THỊ THÔNG TIN ADMIN Ở SIDEBAR
// ==========================
(function () {
  try {
    const raw = sessionStorage.getItem("session.user") || "null";
    const u = JSON.parse(raw);

    if (!u) return;

    // Lấy username: ưu tiên u.username, fallback u.account, u.email...
    const username = u.username || u.account || u.email || u.name || "admin";

    // Map role → chữ tiếng Việt đẹp hơn
    const r = (u.role || "admin").toLowerCase();
    let roleLabel = "Người dùng";
    if (r === "admin") roleLabel = "Quản trị viên";
    else if (r === "staff") roleLabel = "Nhân viên";
    else if (r === "manager") roleLabel = "Quản lý";
    else roleLabel = u.role || "Người dùng";

    // Avatar: lấy ký tự đầu của tên / username
    const baseName = (u.fullname || u.name || username).trim();
    const avatarText = baseName ? baseName.charAt(0).toUpperCase() : "A";

    // Gán vào DOM
    const $ = (s) => document.querySelector(s);

    const elAvatar = $("#sb-admin-avatar");
    const elUser = $("#sb-admin-username");
    const elRole = $("#sb-admin-role");

    if (elAvatar) elAvatar.textContent = avatarText;
    if (elUser) elUser.textContent = username;
    if (elRole) elRole.textContent = roleLabel;
  } catch (e) {
    console.warn("Lỗi hiển thị thông tin admin ở sidebar:", e);
  }
})();
