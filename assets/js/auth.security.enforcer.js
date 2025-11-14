
/**
 * auth.security.enforcer.js
 * Load this AFTER /assets/js/auth.js (and before UI scripts).
 * Adds: account lock enforcement, status on register, and changePassword(current,new).
 */
(function(){
  if (!window.AUTH) { console.warn('[auth.security.enforcer] AUTH not found'); return; }

  function fnv1a(s){ s=String(s||''); let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0).toString(16); }
  function loadUsers(){ try{ return JSON.parse(localStorage.getItem('sv_users_v1')||'[]'); }catch(_){ return []; } }
  function saveUsers(arr){ localStorage.setItem('sv_users_v1', JSON.stringify(arr||[])); }

  // 1) Ensure status:'active' when register
  const _register = AUTH.register;
  AUTH.register = function(name, email, password){
    const res = _register.apply(AUTH, arguments);
    try{
      const emailLC = String(email||'').toLowerCase();
      const users = loadUsers();
      const idx = users.findIndex(u => String(u.email||'').toLowerCase() === emailLC);
      if (idx >= 0) {
        users[idx].status = users[idx].status || 'active';
        users[idx].createdAt = users[idx].createdAt || new Date().toISOString();
        saveUsers(users);
      }
    }catch(e){ console.warn('[auth.security.enforcer] register status patch failed', e); }
    return res;
  };

  // 2) Block login if user is locked
  const _login = AUTH.login;
  AUTH.login = function(email, password){
    const emailLC = String(email||'').toLowerCase();
    const users = loadUsers();
    const u = users.find(x => (String(x.email||'').toLowerCase() === emailLC));
    if (u && (u.status||'active') === 'locked') {
      throw new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }
    return _login.apply(AUTH, arguments);
  };

  // 3) changePassword(current,new) requiring current password
  AUTH.changePassword = function(currentPassword, newPassword){
    if (!AUTH.isAuthenticated || !AUTH.isAuthenticated()) throw new Error('Bạn chưa đăng nhập.');
    const sess = (AUTH.getCurrentUser && AUTH.getCurrentUser()) || AUTH.user || {};
    const emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) throw new Error('Không xác định tài khoản.');
    if (!currentPassword || !newPassword) throw new Error('Vui lòng nhập đủ mật khẩu hiện tại và mật khẩu mới.');
    if (String(newPassword).length < 4) throw new Error('Mật khẩu mới tối thiểu 4 ký tự.');

    const users = loadUsers();
    const idx = users.findIndex(u => String(u.email||'').toLowerCase() === emailLC);
    if (idx < 0) throw new Error('Tài khoản không tồn tại.');
    if (users[idx].passHash !== fnv1a(currentPassword)) throw new Error('Mật khẩu hiện tại không đúng.');

    users[idx].passHash = fnv1a(newPassword);
    saveUsers(users);

    try{
      const bs = JSON.parse(localStorage.getItem('bs_users')||'[]');
      const bidx = bs.findIndex(x => String(x.email||'').toLowerCase() === emailLC);
      if (bidx >= 0) {
        bs[bidx].password = String(newPassword);
        localStorage.setItem('bs_users', JSON.stringify(bs));
      }
    }catch(_){}

    document.dispatchEvent(new Event('auth:changed'));
    return true;
  };

  console.log('[auth.security.enforcer] loaded');
})();