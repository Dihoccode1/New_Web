
/**
 * auth.reactive.guard.v2.2.js
 * - Prevents redirect loops & page flicker
 * - Safe on /account/login.html (no redirects from guard while on login page)
 * - One-time render wrapper
 * - Debounced cross-tab reactions
 *
 * Load order (ALL User pages, including login):
 *   1) /assets/js/auth.js
 *   2) /assets/js/auth.security.enforcer.js
 *   3) /assets/js/auth.localstorage.bridge.js
 *   4) /assets/js/auth.reactive.guard.v2.2.js   <-- THIS FILE
 *   5) your app scripts (store.js, ui.js, products.*, etc.)
 */
(function(){
  var DEBUG = false;
  function log(){ if(DEBUG) try{ console.log.apply(console, ['[guard.v2.2]'].concat([].slice.call(arguments))); }catch(_){} }

  var PATH = (location.pathname || '').toLowerCase();
  var IS_LOGIN = PATH.endsWith('/account/login.html') || PATH.endsWith('/account/login');
  var REDIRECT_FLAG = 'sv_guard_redirecting_v22';

  // ========= One-time render guard =========
  var __RAW_RENDER = null;
  var __WRAPPED = null;
  var __CALLED = false;
  function onceWrapped(){
    if (__WRAPPED) return __WRAPPED;
    __WRAPPED = function(){
      if (__CALLED) { log('render skipped (already called)'); return; }
      var st = state();
      if (!IS_LOGIN) {
        if (st === 'locked')      return redirect('Tài khoản của bạn đã bị khóa bởi quản trị viên.');
        if (st === 'deleted')     return redirect('Tài khoản của bạn không còn tồn tại.');
        if (st === 'pass_changed')return redirect('Mật khẩu của bạn đã được thay đổi. Vui lòng đăng nhập lại.');
      }
      __CALLED = true;
      return __RAW_RENDER && __RAW_RENDER.apply(this, arguments);
    };
    return __WRAPPED;
  }

  function wrapRenderSetterOnce(){
    // Avoid redefining if already hooked
    var desc = Object.getOwnPropertyDescriptor(window, 'render');
    if (desc && desc.get && desc.set && desc.configurable === true){
      // already installed by v2.1/v2.2
      return;
    }
    Object.defineProperty(window, 'render', {
      configurable: true,
      enumerable: true,
      get: function(){ return __WRAPPED || __RAW_RENDER; },
      set: function(fn){
        if (typeof fn !== 'function') { __RAW_RENDER = fn; __WRAPPED = null; return; }
        __RAW_RENDER = fn;
        __WRAPPED = onceWrapped();
        log('render wrapped (once-only)');
      }
    });
    if (typeof window.render === 'function') {
      __RAW_RENDER = window.render;
      window.render = onceWrapped();
      log('pre-existing render wrapped');
    }
  }

  // ========= Helpers =========
  function loadUsers(){ try{ return JSON.parse(localStorage.getItem('sv_users_v1')||'[]'); }catch(_){ return []; } }
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
    var sess = getSession();
    var emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) return;
    if (sess.passHashAtLogin) return;
    var u = getUserByEmail(emailLC);
    if (u && u.passHash) {
      sess.passHashAtLogin = u.passHash;
      try{ localStorage.setItem('sv_auth_user_v1', JSON.stringify(sess)); }catch(_){}
      log('snapshot set');
    }
  }

  function redirect(msg){
    // Prevent loops: if already redirecting, do nothing
    try{
      if (sessionStorage.getItem(REDIRECT_FLAG) === '1') { return; }
      sessionStorage.setItem(REDIRECT_FLAG, '1');
    }catch(_){}

    try{
      if (window.AUTH && typeof AUTH.logout === 'function') AUTH.logout();
      else localStorage.removeItem('sv_auth_user_v1');
    }catch(_){}

    var url = '/account/login.html?reason=' + encodeURIComponent(msg||'Đăng nhập lại để tiếp tục.');
    try{ window.location.replace(url); }catch(_){ window.location.href = url; }
  }

  function state(){
    var sess = getSession();
    var emailLC = String(sess.email||'').toLowerCase();
    if (!emailLC) return 'noauth';
    var u = getUserByEmail(emailLC);
    if (!u) return 'deleted';
    if ((u.status||'active') === 'locked') return 'locked';
    if (sess.passHashAtLogin && u.passHash && u.passHash !== sess.passHashAtLogin) return 'pass_changed';
    return 'ok';
  }

  // ========= Pre-guard (no redirect while on login page) =========
  (function preGuard(){
    if (IS_LOGIN) {
      // Clear redirect flag if we are on login page
      try{ sessionStorage.removeItem(REDIRECT_FLAG); }catch(_){}
      return; // do not redirect from login
    }
    var st = state();
    if (st === 'locked')       return redirect('Tài khoản của bạn đã bị khóa bởi quản trị viên.');
    if (st === 'deleted')      return redirect('Tài khoản của bạn không còn tồn tại.');
    if (st === 'pass_changed') return redirect('Mật khẩu của bạn đã được thay đổi. Vui lòng đăng nhập lại.');
    if (st === 'ok')           ensurePassHashSnapshot();
  })();

  // ========= Install render wrapper once =========
  wrapRenderSetterOnce();

  // ========= Debounced runtime reactions =========
  var tId = null;
  function debounceCheck(){
    if (tId) return;
    tId = setTimeout(function(){
      tId = null;
      var st = state();
      if (IS_LOGIN) return; // never redirect while on login page
      if (st === 'locked')       return redirect('Tài khoản của bạn đã bị khóa bởi quản trị viên.');
      if (st === 'deleted')      return redirect('Tài khoản của bạn không còn tồn tại.');
      if (st === 'pass_changed') return redirect('Mật khẩu của bạn đã được thay đổi. Vui lòng đăng nhập lại.');
    }, 80);
  }

  document.addEventListener('DOMContentLoaded', function(){
    if (!IS_LOGIN) ensurePassHashSnapshot();
  });

  document.addEventListener('auth:changed', function(){
    if (!IS_LOGIN){
      var st = state();
      if (st === 'ok') ensurePassHashSnapshot();
      else debounceCheck();
    }
  });

  window.addEventListener('storage', function(e){
    if (!e || !e.key) return;
    if (['sv_users_v1','sv_auth_user_v1','sv_profiles_v1'].includes(e.key)) debounceCheck();
  });

  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) debounceCheck();
  });

  log('guard.v2.2 loaded (login-safe, anti-loop, render-once)');
})();