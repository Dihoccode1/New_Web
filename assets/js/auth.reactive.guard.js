
/**
 * auth.reactive.guard.js  (one-file combo)
 * Load order (VERY IMPORTANT) on ALL User pages:
 *   1) /assets/js/auth.js
 *   2) /assets/js/auth.security.enforcer.js
 *   3) /assets/js/auth.localstorage.bridge.js
 *   4) /assets/js/auth.reactive.guard.js   <-- THIS FILE
 *   5) (your app scripts: store.js, ui.js, products.*, etc.)
 *
 * What it does:
 *  - Live reacts to admin changes via 'storage' events.
 *  - If current user becomes 'locked' -> alert + logout + redirect to login with ?reason=...
 *  - If current user's password is reset (hash changes) -> force re-login.
 *  - Guard: on page load, if current session is 'locked', redirect to login and DON'T call render().
 *  - Optionally auto-call render() when not locked: set window.SV_REACTIVE.autoCallRender = true;
 */

(function(){
  // ===== Config =====
  window.SV_REACTIVE = window.SV_REACTIVE || { autoCallRender: false };
  var DEBUG = false;
  function log(){ if(DEBUG) try{ console.log.apply(console, ['[auth.reactive.guard]'].concat([].slice.call(arguments))); }catch(_){} }

  // ===== Helpers =====
  function loadUsers(){ try{ return JSON.parse(localStorage.getItem('sv_users_v1')||'[]'); }catch(_){ return []; } }
  function saveSession(sess){ try{ localStorage.setItem('sv_auth_user_v1', JSON.stringify(sess||{})); }catch(_){ } }
  function getSession(){ try{ return JSON.parse(localStorage.getItem('sv_auth_user_v1')||'{}'); }catch(_){ return {}; } }
  function getUserByEmail(emailLC){
    var users = loadUsers();
    for (var i=0;i<users.length;i++){
      var u = users[i];
      if (String(u.email||'').toLowerCase() === String(emailLC||'').toLowerCase()) return u;
    }
    return null;
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
      log('Snapshot passHashAtLogin saved for', emailLC);
    }
  }
  function forceLogoutWithMessage(msg){
    try{
      if (window.AUTH && typeof AUTH.logout === 'function') AUTH.logout();
      else localStorage.removeItem('sv_auth_user_v1');
    }catch(_){}
    try{ alert(msg || 'Phiên đã bị đăng xuất.'); }catch(_){}
    try{
      var url = '../../account/login.html?reason=' + encodeURIComponent(msg||'logout');
      window.location.href = url;
    }catch(_){ window.location.reload(); }
  }
  function isLockedSession(){
    var sess = getSession();
    var emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) return false;
    var u = getUserByEmail(emailLC);
    return !!(u && (u.status||'active') === 'locked');
  }
  function checkCurrentUserState(){
    var sess = getSession();
    var emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) return;

    var u = getUserByEmail(emailLC);
    if (!u) {
      forceLogoutWithMessage('Tài khoản của bạn không còn tồn tại.');
      return 'redirected';
    }

    // 1) Locked?
    if ((u.status||'active') === 'locked') {
      forceLogoutWithMessage('Tài khoản của bạn đã bị khóa bởi quản trị viên.');
      return 'redirected';
    }

    // 2) Password changed by admin?
    // Compare current passHash with snapshot stored at login time.
    // If no snapshot, create one now; otherwise if changed -> force re-login.
    if (!sess.passHashAtLogin) {
      ensurePassHashSnapshot();
    } else if (u.passHash && sess.passHashAtLogin && u.passHash !== sess.passHashAtLogin) {
      forceLogoutWithMessage('Mật khẩu của bạn đã được thay đổi. Vui lòng đăng nhập lại.');
      return 'redirected';
    }

    return 'ok';
  }

  // ===== Guard + Reactive Wiring =====
  document.addEventListener('DOMContentLoaded', function(){
    // Guard: if locked, redirect NOW and do NOT call render().
    var st = checkCurrentUserState();
    if (st === 'ok' && window.SV_REACTIVE.autoCallRender && typeof window.render === 'function') {
      try { window.render(); } catch(_){}
    }
  });

  // Custom event when AUTH state changes (e.g., changePassword)
  document.addEventListener('auth:changed', function(){
    var st = checkCurrentUserState();
    if (st === 'ok') {
      if (typeof window.render === 'function') {
        try { window.render(); } catch(_){}
      }
    }
  });

  // Cross-tab updates
  window.addEventListener('storage', function(e){
    if (!e || !e.key) return;
    if (['sv_users_v1','sv_auth_user_v1','sv_profiles_v1'].includes(e.key)) {
      var st = checkCurrentUserState();
      if (st === 'ok' && typeof window.render === 'function') {
        try { window.render(); } catch(_){}
      }
    }
  });

  // Re-validate on visibility change (user returns to tab)
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) checkCurrentUserState();
  });

  log('auth.reactive.guard loaded');
})();