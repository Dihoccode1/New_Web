

/* ===== Storage keys ===== */
const BS_USERS = 'bs_users';          // [{id,status,fullName,username,password,email,phone,address,createdAt}]
const BS_USER  = 'bs_user';           // {username,fullName,email,phone,address,password}
const LS_USERS = 'sv_users_v1';       // [{name,email,passHash,createdAt}]
const LS_AUTH  = 'sv_auth_user_v1';   // {name,email,loginAt}
const PROFILES = 'sv_profiles_v1';    // { [email]: {phone,address,fullname,...} }

/* ===== Hash FNV-1a (same as auth.js) ===== */
function __bridge_fnv1a(s) {
  s = String(s || '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/* ===== Helpers ===== */
function __bridge_loadJSON(key, def){ try{ return JSON.parse(localStorage.getItem(key)||JSON.stringify(def)); }catch{ return def; } }
function __bridge_saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function __bridge_upsert(arr, pred, obj){
  const i = arr.findIndex(pred);
  if (i >= 0) arr[i] = Object.assign({}, arr[i], obj);
  else arr.push(obj);
}

/* ===== 1) MIGRATE once: bs_users -> sv_users_v1 + sv_profiles_v1 ===== */
(function __bridge_migrate_once(){
  const bsUsers = __bridge_loadJSON(BS_USERS, []);
  if (!bsUsers.length) return;

  const svUsers  = __bridge_loadJSON(LS_USERS, []);
  const profiles = __bridge_loadJSON(PROFILES, {});

  let changedUsers = false, changedProfiles = false;

  bsUsers.forEach(u => {
    const email = String(u.email || '').toLowerCase();
    if (!email) return;

    if (!svUsers.some(x => x.email === email)) {
      svUsers.push({
        name: u.fullName || u.username || email,
        email,
        passHash: __bridge_fnv1a(u.password || ''),
        createdAt: u.createdAt || new Date().toISOString()
      });
      changedUsers = true;
    }
    profiles[email] = Object.assign({}, profiles[email] || {}, {
      phone: u.phone || profiles[email]?.phone || '',
      address: u.address || profiles[email]?.address || '',
      fullname: (u.fullName || profiles[email]?.fullname || '')
    });
    changedProfiles = true;
  });

  if (changedUsers)   __bridge_saveJSON(LS_USERS, svUsers);
  if (changedProfiles)__bridge_saveJSON(PROFILES, profiles);
})();

/* ===== 2) Hook AUTH.register/login to mirror to bs_* ===== */
(function __bridge_auth_hooks(){
  if (!window.AUTH) return; // auth.js must load before this file

  const _register = AUTH.register;
  const _login    = AUTH.login;

  AUTH.register = function(name, email, password){
    const res = _register.apply(AUTH, arguments);

    const bsUsers = __bridge_loadJSON(BS_USERS, []);
    const emailLC = String(email||'').toLowerCase();

    if (!bsUsers.some(x => x.email && String(x.email).toLowerCase() === emailLC)) {
      bsUsers.push({
        id: Date.now(),
        status: 'active',
        fullName: name || email,
        username: emailLC,
        password: String(password||''),
        email: emailLC,
        phone: '',
        address: '',
        createdAt: new Date().toISOString()
      });
      __bridge_saveJSON(BS_USERS, bsUsers);
    }

    __bridge_saveJSON(BS_USER, {
      username: emailLC,
      fullName: name || email,
      email: emailLC,
      phone: '',
      address: '',
      password: String(password||'')
    });

    return res;
  };

  AUTH.login = function(email, password){
    const res = _login.apply(AUTH, arguments);

    const emailLC = String(email||'').toLowerCase();
    const svName  = (AUTH && AUTH.user && (AUTH.user.name || AUTH.user.email)) || emailLC;

    const bsUsers = __bridge_loadJSON(BS_USERS, []);
    if (!bsUsers.some(x => String(x.email||'').toLowerCase() === emailLC)) {
      bsUsers.push({
        id: Date.now(),
        status: 'active',
        fullName: svName,
        username: emailLC,
        password: String(password||''),
        email: emailLC,
        phone: '',
        address: '',
        createdAt: new Date().toISOString()
      });
      __bridge_saveJSON(BS_USERS, bsUsers);
    }

    __bridge_saveJSON(BS_USER, {
      username: emailLC,
      fullName: svName,
      email: emailLC,
      phone: '',
      address: '',
      password: String(password||'')
    });

    return res;
  };
})();

/* ===== 3) If user is logged via old UI (bs_user) → ensure exists in sv_* and set sv_auth_user_v1 ===== */
(function __bridge_mirror_bs_session_to_sv(){
  const curBs = __bridge_loadJSON(BS_USER, null);
  if (!curBs) return;

  const emailLC = String(curBs.email||'').toLowerCase();
  if (!emailLC) return;

  const svUsers = __bridge_loadJSON(LS_USERS, []);
  if (!svUsers.some(x => x.email === emailLC)) {
    svUsers.push({
      name: curBs.fullName || curBs.username || emailLC,
      email: emailLC,
      passHash: __bridge_fnv1a(curBs.password || ''),
      createdAt: new Date().toISOString()
    });
    __bridge_saveJSON(LS_USERS, svUsers);
  }

  const hasAuth = !!__bridge_loadJSON(LS_AUTH, null);
  if (!hasAuth) {
    __bridge_saveJSON(LS_AUTH, { name: curBs.fullName || curBs.username || emailLC, email: emailLC, loginAt: new Date().toISOString() });
    document.dispatchEvent(new Event('auth:changed'));
  }

  const profiles = __bridge_loadJSON(PROFILES, {});
  profiles[emailLC] = Object.assign({}, profiles[emailLC] || {}, {
    fullname: curBs.fullName || profiles[emailLC]?.fullname || '',
    phone: curBs.phone || profiles[emailLC]?.phone || '',
    address: curBs.address || profiles[emailLC]?.address || ''
  });
  __bridge_saveJSON(PROFILES, profiles);
})();

/* ===== 4) Keep bs_user in sync when sv_auth_user_v1 changes ===== */
document.addEventListener('auth:changed', function(){
  try{
    const auth = JSON.parse(localStorage.getItem(LS_AUTH)||'null');
    if (!auth) return;
    const emailLC = String(auth.email||'').toLowerCase();
    if (!emailLC) return;

    const bsUsers = __bridge_loadJSON(BS_USERS, []);
    const u = bsUsers.find(x => String(x.email||'').toLowerCase() === emailLC);
    const fullName = auth.name || auth.email;

    if (!u) {
      bsUsers.push({
        id: Date.now(),
        status: 'active',
        fullName: fullName,
        username: emailLC,
        password: '',
        email: emailLC,
        phone: '',
        address: '',
        createdAt: new Date().toISOString()
      });
      __bridge_saveJSON(BS_USERS, bsUsers);
    }
    __bridge_saveJSON(BS_USER, {
      username: emailLC,
      fullName,
      email: emailLC,
      phone: '',
      address: '',
      password: ''
    });
  }catch(_){}
});