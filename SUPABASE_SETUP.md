# إعداد Supabase

## المتطلبات

أضف القيم التالية إلى `.env.local` من إعدادات مشروعك في Supabase. لا تضع مفتاح `service_role` في متغير يبدأ بـ `NEXT_PUBLIC_` ولا ترسله إلى المتصفح.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` مطلوبة لإرسال دعوات الموظفين فقط. تُستخدم داخل Route Handler على الخادم ولا تُرسل إلى المتصفح. اضبط `NEXT_PUBLIC_APP_URL` على عنوان التطبيق المنشور في الإنتاج.

## تطبيق المخطط

نفّذ الملف `supabase/migrations/202610170001_initial_store_pos.sql` مرة واحدة على قاعدة البيانات، باستخدام Supabase CLI عبر `supabase db push` أو SQL Editor في لوحة المشروع. يعتمد التطبيق على الجداول ودوال البيع والشراء وسياسات RLS الموجودة في الملف.

## تهيئة أول حساب

1. أنشئ المستخدم الأول من لوحة **Authentication**.
2. أضف سجلًا في `public.profiles` باستخدام معرّف المستخدم نفسه واجعل `role` مساويًا `owner` أو `admin`.
3. أنشئ المتاجر من واجهة النظام بعد تسجيل الدخول.
4. اضبط مزود البريد الصادر في Supabase Auth حتى تصل دعوات الموظفين، ثم أضفهم من صفحة الموظفين. تنشأ ملفاتهم في `profiles` وعضوياتهم في `store_members` تلقائيًا. حقل `permissions` مصفوفة من مفاتيح الوحدات: `pos`, `inventory`, `repairs`, `purchases`, `employees`, `tasks`, `roadmap`, `ledger`.

تُفرض صلاحيات العضوية وعزل `store_id` داخل RLS، وليس عبر إخفاء الروابط فقط. عمليات البيع والشراء تستخدم دوال قاعدة البيانات حتى لا يُحدّث المخزون جزئيًا عند فشل الفاتورة.