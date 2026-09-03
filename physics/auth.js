/* جلسة الدخول للموقع - يعمل مع Cloudflare Worker */
(() => {
  'use strict';

  // بعد نشر worker.js على Cloudflare Workers ضع رابطه هنا.
  // مثال: https://physics-login.your-subdomain.workers.dev
  const API_BASE = window.PHYSICS_AUTH_API || 'https://PUT-YOUR-WORKER-URL-HERE.workers.dev';
  const SESSION_KEY = 'physics_auth_session';
  const DEVICE_KEY = 'physics_auth_device';

  const scriptSrc = document.currentScript?.src || new URL('auth.js', location.href).href;
  const rootUrl = new URL('./', scriptSrc);
  const loginUrl = new URL('login.html', rootUrl).href;

  const isLoginPage = /\/login\.html(?:$|[?#])/.test(location.pathname);
  const apiReady = !API_BASE.includes('PUT-YOUR-WORKER-URL-HERE');

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function saveSession(data) { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      credentials: 'omit'
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.message || 'تعذر الاتصال بخادم الدخول');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showBlocked(message) {
    document.documentElement.innerHTML = `
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1329;color:#fff;font-family:system-ui;text-align:center;padding:20px;box-sizing:border-box;direction:rtl">
        <div style="max-width:560px;background:#1c2541;padding:36px;border-radius:18px;box-shadow:0 15px 50px #0008">
          <div style="font-size:48px;margin-bottom:15px">🔒</div>
          <h2 style="margin:0 0 14px">الوصول غير مسموح</h2>
          <p style="line-height:1.8;color:#ddd">${message}</p>
          <button onclick="location.href=${JSON.stringify(loginUrl)}" style="margin-top:10px;padding:12px 25px;border:0;border-radius:10px;cursor:pointer;font-size:16px">العودة إلى تسجيل الدخول</button>
        </div>
      </body>`;
  }

  async function verify() {
    if (!apiReady) {
      showBlocked('لم يتم إعداد رابط خادم الحماية بعد. افتح ملف <b>auth.js</b> وضع رابط Cloudflare Worker في المتغير API_BASE.');
      return false;
    }
    const s = session();
    if (!s?.token) {
      location.replace(loginUrl);
      return false;
    }
    try {
      await api('/verify', { method:'POST', body: JSON.stringify({ token:s.token, deviceId:deviceId() }) });
      return true;
    } catch (e) {
      clearSession();
      if (e.status === 409) showBlocked('هذا الحساب مستخدم حاليًا على جهاز آخر. سجّل الخروج من الجهاز الأول ثم حاول مرة أخرى.');
      else location.replace(loginUrl);
      return false;
    }
  }

  if (isLoginPage) return;

  // نوقف الصفحة بصريًا إلى أن يتم التحقق من الجلسة.
  document.documentElement.style.visibility = 'hidden';
  verify().then(ok => {
    if (ok) {
      document.documentElement.style.visibility = '';
      const heartbeat = async () => {
        const s = session();
        if (!s?.token) return;
        try { await api('/heartbeat', { method:'POST', body:JSON.stringify({token:s.token, deviceId:deviceId()}) }); }
        catch { clearSession(); location.replace(loginUrl); }
      };
      heartbeat();
      setInterval(heartbeat, 30000);
    }
  });

  window.physicsLogout = async function() {
    const s = session();
    if (s?.token && apiReady) {
      try { await api('/logout', { method:'POST', body:JSON.stringify({token:s.token, deviceId:deviceId()}) }); } catch {}
    }
    clearSession();
    location.href = loginUrl;
  };
})();
