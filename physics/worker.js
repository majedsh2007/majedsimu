/**
 * Cloudflare Worker + Durable Object
 * حماية المنصة بجلسة واحدة نشطة للحساب.
 *
 * Environment variables:
 *   USERNAME       اسم المستخدم
 *   PASSWORD_HASH  SHA-256 hex لكلمة المرور
 *
 * wrangler.toml يجب أن يربط AUTH_SESSION بـ Durable Object.
 */

const SESSION_TTL_MS = 2 * 60 * 1000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method === 'OPTIONS') return new Response(null, {headers});

    const url = new URL(request.url);
    if (request.method !== 'POST' || !['/login','/verify','/heartbeat','/logout'].includes(url.pathname))
      return json({message:'Not found'},404,headers);

    let body;
    try { body = await request.json(); } catch { return json({message:'طلب غير صالح'},400,headers); }

    if (url.pathname === '/login') {
      if (!body.username || !body.password || !body.deviceId) return json({message:'أكمل بيانات الدخول'},400,headers);
      if (body.username !== env.USERNAME) return json({message:'اسم المستخدم أو كلمة المرور غير صحيحة'},401,headers);
      const hash = await sha256(body.password);
      if (hash !== env.PASSWORD_HASH) return json({message:'اسم المستخدم أو كلمة المرور غير صحيحة'},401,headers);
      const id = env.AUTH_SESSION.idFromName('main-account');
      const stub = env.AUTH_SESSION.get(id);
      const res = await stub.fetch('https://session/login', {method:'POST',body:JSON.stringify({deviceId})});
      return withHeaders(res,headers);
    }

    const id = env.AUTH_SESSION.idFromName('main-account');
    const stub = env.AUTH_SESSION.get(id);
    const res = await stub.fetch('https://session'+url.pathname,{method:'POST',body:JSON.stringify(body)});
    return withHeaders(res,headers);
  }
};

export class AuthSession {
  constructor(state) { this.state=state; }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const body = await request.json().catch(()=>({}));
    const current = await this.state.storage.get('session');
    const now = Date.now();
    if (current && now - current.lastSeen > SESSION_TTL_MS) await this.state.storage.delete('session');
    const active = await this.state.storage.get('session');

    if (path === '/login') {
      if (active && active.deviceId !== body.deviceId)
        return json({message:'هذا الحساب مستخدم حاليًا على جهاز آخر.'},409);
      const token = crypto.randomUUID() + '-' + crypto.randomUUID();
      await this.state.storage.put('session',{token,deviceId:body.deviceId,lastSeen:now});
      return json({token});
    }

    if (!active || active.token !== body.token || active.deviceId !== body.deviceId)
      return json({message:'الجلسة غير صالحة أو مستخدمة على جهاز آخر.'},409);

    if (path === '/verify' || path === '/heartbeat') {
      active.lastSeen=now; await this.state.storage.put('session',active); return json({ok:true});
    }
    if (path === '/logout') { await this.state.storage.delete('session'); return json({ok:true}); }
    return json({message:'Not found'},404);
  }
}

async function sha256(text){
  const data=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers});}
async function withHeaders(res,headers){const h=new Headers(res.headers);for(const[k,v]of Object.entries(headers))h.set(k,v);return new Response(res.body,{status:res.status,headers:h});}
