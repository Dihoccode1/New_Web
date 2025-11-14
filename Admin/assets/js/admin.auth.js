/*! admin.auth.js - Hệ thống xác thực riêng cho Admin */
(function (w, d) {
    'use strict';

    const LS_ADMIN_USERS = 'sv_admin_users_v1'; // [{username, passHash, fullname, role}]
    const LS_ADMIN_AUTH = 'sv_admin_auth_v1'; // {username, fullname, role, loginAt}

    // Tài khoản admin mặc định
    const DEFAULT_ADMIN = {
        username: 'admin',
        passHash: hash('admin123'), // Mật khẩu: admin123
        fullname: 'Administrator',
        role: 'super_admin',
        createdAt: new Date().toISOString()
    };

    // Hash function (đơn giản - chỉ demo)
    function hash(s) {
        s = String(s || '');
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }

    function loadAdminUsers() {
        try {
            const data = JSON.parse(localStorage.getItem(LS_ADMIN_USERS) || '[]');
            // Nếu chưa có admin nào, tạo tài khoản mặc định
            if (data.length === 0) {
                data.push(DEFAULT_ADMIN);
                localStorage.setItem(LS_ADMIN_USERS, JSON.stringify(data));
            }
            return data;
        } catch {
            return [DEFAULT_ADMIN];
        }
    }

    function saveAdminUsers(list) {
        localStorage.setItem(LS_ADMIN_USERS, JSON.stringify(list || []));
    }

    function getAdminAuth() {
        try {
            return JSON.parse(localStorage.getItem(LS_ADMIN_AUTH) || 'null');
        } catch {
            return null;
        }
    }

    function setAdminAuth(obj) {
        if (obj) {
            localStorage.setItem(LS_ADMIN_AUTH, JSON.stringify(obj));
        } else {
            localStorage.removeItem(LS_ADMIN_AUTH);
        }
        d.dispatchEvent(new Event('admin:auth:changed'));
    }

    const ADMIN_AUTH = {
        ready: false,
        loggedIn: false,
        admin: null,
        _queue: [],

        check: function () {
            const cur = getAdminAuth();
            ADMIN_AUTH.loggedIn = !!cur;
            ADMIN_AUTH.admin = cur ? {
                username: cur.username,
                fullname: cur.fullname,
                role: cur.role
            } : null;
            ADMIN_AUTH.ready = true;

            try {
                while (ADMIN_AUTH._queue.length) {
                    var fn = ADMIN_AUTH._queue.shift();
                    if (typeof fn === 'function') fn();
                }
            } catch (_) {}

            d.dispatchEvent(new Event('admin:auth:ready'));
            return Promise.resolve();
        },

        ensureReady: function (cb) {
            if (ADMIN_AUTH.ready) return cb && cb();
            ADMIN_AUTH._queue.push(cb);
        },

        requireLoginOrRedirect: function () {
            if (!ADMIN_AUTH.loggedIn) {
                const back = encodeURIComponent(w.location.pathname + w.location.search);
                w.location.href = '../../../admin/login.html?redirect=' + back;
                return false;
            }
            return true;
        },

        login: function (username, password) {
            username = String(username || '').trim();
            password = String(password || '');

            if (!username || !password) {
                throw new Error('Vui lòng nhập tên đăng nhập và mật khẩu.');
            }

            const users = loadAdminUsers();
            const u = users.find(user => user.username === username);

            if (!u || u.passHash !== hash(password)) {
                throw new Error('Thông tin đăng nhập không đúng.');
            }

            setAdminAuth({
                username: u.username,
                fullname: u.fullname,
                role: u.role,
                loginAt: new Date().toISOString()
            });

            return {
                username: u.username,
                fullname: u.fullname,
                role: u.role
            };
        },

        logout: function () {
            setAdminAuth(null);
        },

        register: function (username, password, fullname, role = 'admin') {
            username = String(username || '').trim();
            password = String(password || '');
            fullname = String(fullname || '').trim();

            if (!username || !password || !fullname) {
                throw new Error('Vui lòng nhập đầy đủ thông tin.');
            }

            const users = loadAdminUsers();
            if (users.some(u => u.username === username)) {
                throw new Error('Tên đăng nhập đã tồn tại.');
            }

            users.push({
                username,
                passHash: hash(password),
                fullname,
                role,
                createdAt: new Date().toISOString()
            });

            saveAdminUsers(users);
            return {
                username,
                fullname,
                role
            };
        },

        updateUI: function () {
            const nameEl = d.querySelector('[data-admin-name]');
            const roleEl = d.querySelector('[data-admin-role]');

            if (ADMIN_AUTH.loggedIn && ADMIN_AUTH.admin) {
                if (nameEl) nameEl.textContent = ADMIN_AUTH.admin.fullname || ADMIN_AUTH.admin.username;
                if (roleEl) {
                    const roleMap = {
                        'super_admin': 'Quản trị viên cấp cao',
                        'admin': 'Quản trị viên',
                        'staff': 'Nhân viên'
                    };
                    roleEl.textContent = roleMap[ADMIN_AUTH.admin.role] || 'Admin';
                }
            }
        }
    };

    // Auto-check khi page load
    d.addEventListener('DOMContentLoaded', function () {
        ADMIN_AUTH.check();
    });

    // Expose globally
    w.ADMIN_AUTH = ADMIN_AUTH;

})(window, document);