
/**
 * auth.reactive.bridge.js
 * Load AFTER:
 *   /assets/js/auth.js
 *   /assets/js/auth.security.enforcer.js
 *   /assets/js/auth.localstorage.bridge.js
 *
 * Features:
 *  - Live reacts to admin changes via 'storage' events.
 *  - If current user becomes 'locked' -> show message, logout, redirect to login with reason.
 *  - If current user's password is reset by admin -> invalidate session (force re-login).
 *  - Calls global render() (if exists) to refresh the page UI after auth data changes.
 */
(function(){
  var DEBUG = false;
  function log(){ if(DEBUG) try{ console.log.apply(console, ['[auth.reactive]'].concat([].slice.call(arguments))); }catch(_){} }

  function loadUsers(){ try{ return JSON.parse(localStorage.getItem('sv_users_v1')||'[]'); }catch(_){ return []; } }
  function saveSession(sess){ try{ localStorage.setItem('sv_auth_user_v1', JSON.stringify(sess||{})); }catch(_){ } }
  function getSession(){ try{ return JSON.parse(localStorage.getItem('sv_auth_user_v1')||'{}'); }catch(_){ return {}; } }
  function fnv1a(s){ s=String(s||''); let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0).toString(16); }

  function getUserByEmail(emailLC){
    var users = loadUsers();
    var u = users.find(function(x){ return String(x.email||'').toLowerCase() === String(emailLC||'').toLowerCase(); });
    return u || null;
  }

  function ensurePassHashSnapshot(){
    // Store the passHash at login time into the session (if not stored yet)
    var sess = getSession();
    var emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) return;
    if (sess.passHashAtLogin) return; // already there
    var u = getUserByEmail(emailLC);
    if (u && u.passHash) {
      sess.passHashAtLogin = u.passHash;
      saveSession(sess);
      log('Snapshot passHashAtLogin saved');
    }
  }

  function forceLogoutWithMessage(msg){
    try{
      if (window.AUTH && typeof AUTH.logout === 'function') AUTH.logout();
      else {
        // Fallback: clear known session keys
        localStorage.removeItem('sv_auth_user_v1');
      }
    }catch(_){}
    try{ alert(msg || 'Phiên đã bị đăng xuất.'); }catch(_){}
    try{
      var url = '/account/login.html?reason=' + encodeURIComponent(msg||'logout');
      window.location.href = url;
    }catch(_){ window.location.reload(); }
  }

  function checkCurrentUserState(){
    var sess = getSession();
    var emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) return;

    var u = getUserByEmail(emailLC);
    if (!u) {
      forceLogoutWithMessage('Tài khoản của bạn không còn tồn tại.');
      return;
    }

    // 1) Locked?
    if ((u.status||'active') === 'locked') {
      forceLogoutWithMessage('Tài khoản của bạn đã bị khóa bởi quản trị viên.');
      return;
    }

    // 2) Password changed by admin?
    // Compare current passHash with snapshot stored at login time.
    // If no snapshot, create one now; otherwise if changed -> force re-login.
    if (!sess.passHashAtLogin) {
      ensurePassHashSnapshot();
    } else if (u.passHash && sess.passHashAtLogin && u.passHash !== sess.passHashAtLogin) {
      forceLogoutWithMessage('Mật khẩu của bạn đã được thay đổi. Vui lòng đăng nhập lại.');
      return;
    }
  }

  // ===== Wiring =====
  // On page load
  document.addEventListener('DOMContentLoaded', function(){
    try { ensurePassHashSnapshot(); } catch(_){}
    try { checkCurrentUserState(); } catch(_){}
  });

  // On auth actions (custom event from AUTH/changePassword etc.)
  document.addEventListener('auth:changed', function(){
    try { ensurePassHashSnapshot(); } catch(_){}
    try { checkCurrentUserState(); } catch(_){}
    if (typeof window.render === 'function') {
      try { window.render(); } catch(_){}
    }
  });

  // Cross-tab updates
  window.addEventListener('storage', function(e){
    if (!e || !e.key) return;
    if (['sv_users_v1','sv_auth_user_v1','sv_profiles_v1'].includes(e.key)) {
      try { checkCurrentUserState(); } catch(_){}
      if (typeof window.render === 'function') {
        try { window.render(); } catch(_){}
      }
    }
  });

  // Also re-validate on visibility change (user returns to tab)
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) {
      try { checkCurrentUserState(); } catch(_){}
    }
  });

  log('reactive bridge loaded');
})();