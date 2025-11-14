/* Admin SPA – dashboard.js (v1)
   Phụ trách render nội dung vào #main dựa trên data-view trên sidebar.
   Yêu cầu:
   - Có thể chạy "toàn cục" không import (script tag type="module" KHÔNG BẮT BUỘC)
   - Tự phát hiện db/products từ 3 nguồn: window.db, localStorage 'SV_PRODUCTS', hoặc SV_PRODUCT_SEED
   - Làm việc chung với AUTH + SVStore nếu có (đếm giỏ, đơn, doanh thu mô phỏng)
*/
(function (w, d) {
  'use strict';

  // ====== Utils ======
  const $ = (s, r=d) => r.querySelector(s);
  const $$ = (s, r=d) => Array.from(r.querySelectorAll(s));
  const fmt = n => (Number(n||0)).toLocaleString('vi-VN', {style:'currency', currency:'VND', maximumFractionDigits:0});
  const fmtNum = n => (Number(n||0)).toLocaleString('vi-VN');

  const getNow = () => new Date().toISOString();

  function readJSON(key, def){ try{ return JSON.parse(localStorage.getItem(key)||JSON.stringify(def)); }catch(_){ return def; } }
  function writeJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

  // ====== Data layer (tự thích nghi) ======
  const Data = {
    products() {
      // 1) window.db (nếu có) → ưu tiên
      if (w.db?.products?.getAll) {
        try { return w.db.products.getAll(); } catch(_) {}
      }
      // 2) LocalStorage SV_PRODUCTS → kế tiếp
      const saved = readJSON('SV_PRODUCTS', null);
      if (Array.isArray(saved) && saved.length) return saved;
      // 3) SV_PRODUCT_SEED (biến global trên user pages)
      return Array.isArray(w.SV_PRODUCT_SEED) ? w.SV_PRODUCT_SEED : [];
    },
    users(){
      // đồng bộ với AUTH (sv_users_v1)
      const list = readJSON('sv_users_v1', []);
      return list.map(u => ({name: u.name, email: u.email, createdAt: u.createdAt}));
    },
    orders(){
      // Demo: lưu order mô phỏng trong LS 'sv_orders_v1'
      return readJSON('sv_orders_v1', []);
    },
    saveOrders(list){ writeJSON('sv_orders_v1', list||[]); },
    inventorySlips(){ return readJSON('sv_inventory_v1', []); },
    saveInventory(list){ writeJSON('sv_inventory_v1', list||[]); },
  };

  // ====== State & Router ======
  const State = { view: 'dashboard' };

  function setActive(link){
    $$('.navagation a[data-view]').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-view') === link);
    });
  }

  function navigate(view){
    State.view = view || 'dashboard';
    setActive(State.view);
    render();
  }

  // ====== Small UI helpers ======
  function card(title, value, sub){
    return `<div class="col-6 col-md-3">
      <div class="card" style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,.04)">
        <div style="font-size:13px;color:#64748b;margin-bottom:6px">${title}</div>
        <div style="font-size:24px;font-weight:700">${value}</div>
        ${sub?`<div style="font-size:12px;color:#94a3b8;margin-top:4px">${sub}</div>`:''}
      </div>
    </div>`;
  }

  function table(headers, rowsHtml){
    return `<div class="card" style="background:#fff;border:1px solid #eee;border-radius:14px;padding:0;overflow:hidden">
      <table class="table" style="width:100%;border-collapse:collapse">
        <thead style="background:#f8fafc"><tr>${headers.map(h=>`<th style="text-align:left;padding:10px 12px;border-bottom:1px solid #eee">${h}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml || ''}</tbody>
      </table>
    </div>`;
  }

  // ====== Views ======
  function viewDashboard(){
    const products = Data.products();
    const users = Data.users();
    const orders = Data.orders();

    const totalRevenue = orders.reduce((s,o)=> s + Number(o.total||0), 0);
    const totalItems = products.length;
    const outOfStock = products.filter(p => (p.badge+'' ).toLowerCase()==='oos' || (p.badge+'' ).toLowerCase()==='out_of_stock' || (typeof p.stock==='number' && p.stock<=0)).length;

    const topProducts = products.slice(0, 5).map((p,i)=>`
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:center">
          <img src="${p.image}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid #eee"/>
          <div>
            <div style="font-weight:600">${p.name}</div>
            <div style="font-size:12px;color:#94a3b8">${p.category||'—'}</div>
          </div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmt(p.price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmtNum(p.stock ?? 0)}</td>
      </tr>`).join('');

    return `
      <div class="container-fluid">
        <div class="row" style="margin:-8px 0 16px -8px;gap:8px 0">
          ${card('Tổng doanh thu', fmt(totalRevenue))}
          ${card('Số đơn', fmtNum(orders.length))}
          ${card('Sản phẩm', fmtNum(totalItems))}
          ${card('Hết hàng', fmtNum(outOfStock))}
        </div>
        <h3 style="margin:16px 0">Sản phẩm nổi bật</h3>
        ${table(['#','Sản phẩm','Giá','Tồn'], topProducts)}
      </div>`;
  }

  function viewUsers(){
    const users = Data.users();
    const rows = users.map((u,i)=>`<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${u.name||u.email}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${u.email}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${(u.createdAt||'').replace('T',' ').replace('Z','')}</td>
    </tr>`).join('');
    return `<div class="container-fluid">
      <div class="row"><div class="col-12">
        <div class="filter" style="margin:8px 0 12px;display:flex;gap:8px;flex-wrap:wrap">
          <input id="fUser" class="input" placeholder="Tìm tên hoặc email" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px"/>
        </div>
        ${table(['#','Tên','Email','Ngày tạo'], rows)}
      </div></div></div>`;
  }

  function viewCategories(){
    // Demo từ product.category
    const cats = {};
    Data.products().forEach(p => { const c=(p.category||'Khác'); cats[c]=(cats[c]||0)+1; });
    const rows = Object.keys(cats).sort().map((c,i)=>`<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${c}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmtNum(cats[c])}</td>
    </tr>`).join('');
    return `<div class="container-fluid">
      <div class="row"><div class="col-12">
        <div style="margin:8px 0 12px">
          <button id="btnAddCat" class="btn">+ Thêm danh mục</button>
        </div>
        ${table(['#','Danh mục','Số SP'], rows)}
      </div></div></div>`;
  }

  function viewProducts(){
    const products = Data.products();
    const rows = products.map((p,i)=>`<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;gap:10px;align-items:center">
          <img src="${p.image}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid #eee"/>
          <div>
            <div style="font-weight:600">${p.name}</div>
            <div style="font-size:12px;color:#94a3b8">${p.id}</div>
          </div>
        </div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${p.category||'—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmt(p.price)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmtNum(p.stock ?? 0)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
        <button class="btn js-edit" data-id="${p.id}">Sửa</button>

      </td>
    </tr>`).join('');
    return `<div class="container-fluid">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">
        <button id="btnAdd" class="btn">+ Thêm sản phẩm</button>
        <button id="btnImportSeed" class="btn">Nhập từ SEED</button>
      </div>
      ${table(['#','Sản phẩm','Danh mục','Giá','Tồn','Hành động'], rows)}
    </div>`;
  }

  function viewInventory(){
    const slips = Data.inventorySlips();
    const rows = slips.map((s,i)=>`<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${s.code||('PN'+(1000+i))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${(s.date||'').replace('T',' ').replace('Z','')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmt(s.total||0)}</td>
    </tr>`).join('');
    return `<div class="container-fluid">
      <div style="margin:8px 0 12px"><button id="btnNewSlip" class="btn">+ Phiếu nhập</button></div>
      ${table(['#','Mã phiếu','Ngày','Tổng tiền'], rows)}
    </div>`;
  }

  function viewPricing(){
    // Tính giá đề xuất theo %LN (demo)
    const products = Data.products();
    const rows = products.map((p,i)=>{
      const cost = Number(p.cost||0);
      const price = Number(p.price||0);
      const margin = price>0? Math.round((price - cost) / price * 100) : 0;
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${p.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmt(cost)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmt(price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${margin}%</td>
      </tr>`;
    }).join('');
    return `<div class="container-fluid">
      <div class="row"><div class="col-12">
        ${table(['#','Sản phẩm','Giá vốn (demo)','Giá bán','%LN ước tính'], rows)}  
      </div></div></div>`;
  }

  function viewOrders(){
    const orders = Data.orders();
    const rows = orders.map((o,i)=>`<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${i+1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${o.code||('DH'+(1000+i))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${(o.date||'').replace('T',' ').replace('Z','')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9"><span class="status ${o.status||'inPending'}">${o.status||'inPending'}</span></td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${fmt(o.total||0)}</td>
    </tr>`).join('');
    return `<div class="container-fluid">
      <div style="margin:8px 0 12px">
        <button id="btnGenDemoOrders" class="btn">+ Tạo 5 đơn demo</button>
      </div>
      ${table(['#','Mã đơn','Ngày','Trạng thái','Tổng tiền'], rows)}
    </div>`;
  }

  function viewReports(){
    const products = Data.products();
    const inv = products.reduce((sum, p)=> sum + Number(p.price||0) * Number(p.stock||0), 0);
    const orders = Data.orders();
    const revenue = orders.reduce((s,o)=> s + Number(o.total||0), 0);
    return `<div class="container-fluid">
      <div class="row" style="margin:-8px 0 16px -8px;gap:8px 0">
        ${card('Giá trị tồn kho (ước tính)', fmt(inv))}
        ${card('Doanh thu đã ghi nhận', fmt(revenue))}
      </div>
      <p class="text-muted" style="font-size:13px">(Số liệu demo tính từ dữ liệu local – có thể thay bằng window.db khi bạn thêm database.js)</p>
    </div>`;
  }

  const TEMPLATES = {
    dashboard: viewDashboard,
    users: viewUsers,
    categories: viewCategories,
    products: viewProducts,
    inventory: viewInventory,
    pricing: viewPricing,
    orders: viewOrders,
    reports: viewReports,
  };

  function render(){
    const main = $('#main');
    if (!main) return;
    const fn = TEMPLATES[State.view] || TEMPLATES.dashboard;
    main.innerHTML = fn();
  }

  // ====== Events ======
  d.addEventListener('click', function(e){
    const a = e.target.closest('.navagation a[data-view]');
    if (a){
      e.preventDefault();
      navigate(a.getAttribute('data-view'));
      return;
    }
  });

  // hash routing (#dashboard, #products ...)
  function hashToView(){
    const h = (location.hash||'').replace('#','');
    if (!h) return 'dashboard';
    const valid = Object.keys(TEMPLATES);
    return valid.includes(h) ? h : 'dashboard';
  }

  window.addEventListener('hashchange', ()=> navigate(hashToView()));

  // ====== Boot ======
  function boot(){
    navigate(hashToView());
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();

})(window, document);
