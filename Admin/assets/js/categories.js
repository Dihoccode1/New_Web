// /Admin/assets/js/categories.js
const CAT_KEY = "admin.categories";
const PROD_KEY = "admin.products"; // kiểm tra khi xoá danh mục

/* =====================
   Seed dữ liệu ban đầu
   ===================== */
(function seedCats() {
  if (localStorage.getItem(CAT_KEY)) return;
  const demo = [
    {
      id: 1,
      code: "LOAI001",
      name: "Sáp vuốt tóc",
      desc: "Wax/Pomade",
      active: true,
    },
    {
      id: 2,
      code: "LOAI002",
      name: "Bột tạo phồng",
      desc: "Volumizing powder",
      active: true,
    },
    {
      id: 3,
      code: "LOAI003",
      name: "Gôm xịt tóc",
      desc: "Hairspray",
      active: true,
    },
    {
      id: 4,
      code: "LOAI004",
      name: "Dưỡng tóc",
      desc: "Hair Conditioner",
      active: true,
    },
  ];
  localStorage.setItem(CAT_KEY, JSON.stringify(demo));
})();

/* ==============
   Helper storage
   ============== */
const loadCats = () => {
  try {
    return JSON.parse(localStorage.getItem(CAT_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveCats = (a) => {
  localStorage.setItem(CAT_KEY, JSON.stringify(a));
  // ping cho các tab User để tự refresh bộ lọc danh mục
  try {
    localStorage.setItem("catalog.bump", String(Date.now()));
  } catch {}
};
const loadProds = () => {
  try {
    return JSON.parse(localStorage.getItem(PROD_KEY) || "[]");
  } catch {
    return [];
  }
};
const nextId = (a) => a.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
const pad3 = (n) => String(n).padStart(3, "0");

/* ==========================
   Migration tên danh mục cũ
   ========================== */
(function migrateCategoryNamesOnce() {
  const FLAG = "admin.categories.migrated.2025-11-04";
  if (localStorage.getItem(FLAG)) return;

  const rename = new Map([
    // cũ -> mới
    ["Sáp  vuốt tóc", "Sáp vuốt tóc"], // thừa khoảng trắng
    ["Sáp vuốt tóc ", "Sáp vuốt tóc"],
    ["Gôm xịt", "Gôm xịt tóc"],
    ["Hair Conditioner", "Dưỡng tóc"],
    ["Hair conditioner", "Dưỡng tóc"],
    ["Hair Conditioner ", "Dưỡng tóc"],
  ]);

  const cats = loadCats();
  if (!cats.length) {
    localStorage.setItem(FLAG, "1");
    return;
  }

  let changed = false;
  const normalized = cats.map((c) => {
    const trimmed = (c.name || "").trim();
    const newName = rename.get(trimmed) || trimmed;
    if (newName !== c.name) {
      changed = true;
      c = { ...c, name: newName };
    }
    return c;
  });

  if (changed) saveCats(normalized);
  localStorage.setItem(FLAG, "1");
})();

/* =========
   Rendering
   ========= */
function render(list) {
  const q = (document.getElementById("q")?.value || "").toLowerCase().trim();
  const cats = (list || loadCats()).filter((c) => {
    if (q && !`${c.name} ${c.desc || ""}`.toLowerCase().includes(q))
      return false;
    return true;
  });

  const tbody = document.getElementById("cat-body");
  if (!tbody) return;

  const countEl = document.getElementById("cat-count");
  if (countEl) countEl.textContent = `${cats.length} danh mục`;

  tbody.innerHTML = cats
    .map((c) => {
      const toggleLabel = c.active ? "Ẩn" : "Hiện";
      const statusBadge = c.active
        ? '<span class="badge on">Đang dùng</span>'
        : '<span class="badge off">Đang ẩn</span>';
      return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <strong>${c.name}</strong> ${statusBadge}
          </div>
        </td>
        <td>${c.desc || ""}</td>
        <td>
          <a href="#" class="btn btn-action" data-act="edit" data-id="${
            c.id
          }">Sửa</a>
          <a href="#" class="btn btn-action" data-act="toggle" data-id="${
            c.id
          }">${toggleLabel}</a>
        </td>
      </tr>
    `;
    })
    .join("");
}
render();

/* ========
   Search
   ======== */
document.getElementById("q")?.addEventListener("input", () => render());

/* ==========
   Form utils
   ========== */
function setForm(c) {
  document.getElementById("id").value = c?.id || "";
  document.getElementById("name").value = c?.name || "";
  document.getElementById("desc").value = c?.desc || "";
  document.getElementById("form-title").textContent = c?.id
    ? "Sửa danh mục"
    : "Thêm danh mục";
}
document.getElementById("btn-new")?.addEventListener("click", () => {
  setForm(null);
  window.AdminCategoryDrawer?.open?.();
});
document
  .getElementById("btn-cancel")
  ?.addEventListener("click", () => setForm(null));

/* ===========
   Submit form
   =========== */
document.getElementById("cat-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const cats = loadCats();

  const id = Number(document.getElementById("id").value || 0);
  const name = document
    .getElementById("name")
    .value.trim()
    .replace(/\s{2,}/g, " "); // chuẩn hoá space
  const desc = document.getElementById("desc").value.trim();

  if (!name) return alert("Nhập tên danh mục");

  if (id) {
    // update
    const i = cats.findIndex((x) => x.id === id);
    if (i >= 0) {
      const dup = cats.some(
        (x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase()
      );
      if (dup) return alert("Tên danh mục đã tồn tại");
      cats[i] = { ...cats[i], name, desc };
      saveCats(cats);
      render(cats);
      setForm(null);
      window.AdminCategoryDrawer?.close?.();
    }
  } else {
    // create
    if (cats.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      alert("Tên danh mục đã tồn tại");
      return;
    }
    const newId = nextId(cats);
    const code = "LOAI" + pad3(newId);
    cats.push({ id: newId, code, name, desc, active: true });
    saveCats(cats);
    render(cats);
    setForm(null);
    window.AdminCategoryDrawer?.close?.();
  }
});

/* ============
   Table action
   ============ */
document.getElementById("cat-body")?.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-act]");
  if (!a) return;
  e.preventDefault();

  const id = Number(a.dataset.id);
  const act = a.dataset.act;

  const cats = loadCats();
  const i = cats.findIndex((x) => x.id === id);
  if (i < 0) return;

  if (act === "edit") {
    setForm(cats[i]);
    window.AdminCategoryDrawer?.open?.();
    return;
  }

  if (act === "toggle") {
    cats[i].active = !cats[i].active;
    saveCats(cats);
    render(cats);
    return;
  }

  if (act === "remove") {
    // kiểm tra sản phẩm đang gắn danh mục này
    const prods = loadProds();
    const used = prods.filter((p) => Number(p.categoryId) === id);
    if (used.length) {
      const ok = confirm(
        `Có ${used.length} sản phẩm đang gắn danh mục này.\n` +
          `Chọn OK để XOÁ danh mục và gỡ danh mục khỏi các sản phẩm đó (categoryId = null).`
      );
      if (!ok) return;
      used.forEach((p) => (p.categoryId = null));
      localStorage.setItem(PROD_KEY, JSON.stringify(prods));
    }
    cats.splice(i, 1);
    saveCats(cats);
    render(cats);
    return;
  }
});
