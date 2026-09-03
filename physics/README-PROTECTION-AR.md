# حماية الموقع: حساب واحد / جهاز واحد في الوقت نفسه

## ماذا أضفنا؟
- صفحة `login.html` قبل جميع صفحات الموقع.
- جلسة دخول على الخادم وليست كلمة مرور داخل HTML.
- منع الحساب من إنشاء جلسة ثانية على جهاز مختلف.
- استمرار الجلسة الأولى عبر Heartbeat كل 30 ثانية.
- تحرير الجلسة بعد دقيقتين تقريبًا من انقطاع الجهاز، أو فور تسجيل الخروج.
- `worker.js` لخادم الحماية باستخدام Cloudflare Worker + Durable Object.

## مهم جدًا
GitHub Pages خدمة استضافة ثابتة، لذلك لا يمكنها وحدها فرض حماية حقيقية أو قفل جلسة بين جهازين. الحل المرفق يحتاج نشر `worker.js` على Cloudflare Workers.

## خطوات الإعداد
1. أنشئ حسابًا مجانيًا في Cloudflare.
2. أنشئ Worker جديدًا، وانسخ إليه محتوى `worker.js`، أو استخدم Wrangler.
3. اربط Durable Object باسم `AUTH_SESSION` كما في `wrangler.toml`.
4. غيّر `USERNAME` إلى اسم المستخدم المطلوب.
5. احسب SHA-256 لكلمة المرور وضع الناتج في `PASSWORD_HASH`.
   مثال Python:
   `python -c "import hashlib; print(hashlib.sha256('YOUR_PASSWORD'.encode()).hexdigest())"`
6. بعد النشر سيظهر رابط مثل:
   `https://physics-login.<your-subdomain>.workers.dev`
7. افتح `auth.js` و`login.html` واستبدل:
   `https://PUT-YOUR-WORKER-URL-HERE.workers.dev`
   برابط الـ Worker الحقيقي.
8. ارفع مجلد الموقع كاملًا إلى مستودع GitHub Pages.

## ملاحظة أمنية
هذا يمنع الحساب من تسجيل جلستين عبر الواجهة المرفقة، لكنه لا يحول GitHub Pages إلى استضافة خاصة؛ الملفات المنشورة على GitHub Pages تبقى ملفات عامة ويمكن الوصول إليها مباشرة إذا عرف المستخدم روابطها. إذا كان المطلوب منع الوصول حتى إلى ملفات HTML نفسها، فيجب نقل الملفات المحمية خلف خادم/Proxy مصادق عليه بدل GitHub Pages المباشر.
