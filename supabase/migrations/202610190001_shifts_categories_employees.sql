-- تحديث طرق الدفع لتشمل المحافظ الإلكترونية (wallet)
alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('cash', 'card', 'transfer', 'wallet'));

-- إضافة حقل اسم الحساب المخصص (مثل: اسم البنك أو اسم المحفظة)
alter table public.sales add column if not exists payment_account text not null default '';

-- جدول التصنيفات المخصصة لكل متجر
create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

alter table public.store_categories enable row level security;

drop policy if exists store_categories_read on public.store_categories;
create policy store_categories_read on public.store_categories for select to authenticated
  using (public.can_access_store(store_id));

drop policy if exists store_categories_write on public.store_categories;
create policy store_categories_write on public.store_categories for all to authenticated
  using (public.can_access_store(store_id, 'inventory') or public.can_access_store(store_id, 'pos'))
  with check (public.can_access_store(store_id, 'inventory') or public.can_access_store(store_id, 'pos'));

-- جدول الشفتات وتسليم الحساب الليلي مع تفصيل الحسابات المخصصة
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cashier_name text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(12,2) not null default 0,
  expected_card numeric(12,2) not null default 0,
  expected_transfer numeric(12,2) not null default 0,
  expected_wallet numeric(12,2) not null default 0,
  expenses_total numeric(12,2) not null default 0 check (expenses_total >= 0),
  shift_expenses jsonb not null default '[]'::jsonb,
  accounts_config jsonb not null default '[]'::jsonb,
  expected_breakdown jsonb not null default '{}'::jsonb,
  actual_breakdown jsonb not null default '{}'::jsonb,
  actual_cash numeric(12,2),
  actual_card numeric(12,2),
  actual_transfer numeric(12,2),
  actual_wallet numeric(12,2),
  difference numeric(12,2),
  is_matched boolean,
  notes text not null default '',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.shifts add column if not exists accounts_config jsonb not null default '[]'::jsonb;
alter table public.shifts add column if not exists expected_breakdown jsonb not null default '{}'::jsonb;
alter table public.shifts add column if not exists actual_breakdown jsonb not null default '{}'::jsonb;

alter table public.shifts enable row level security;

drop policy if exists shifts_access on public.shifts;
create policy shifts_access on public.shifts for all to authenticated
  using (public.can_access_store(store_id, 'pos') or public.can_access_store(store_id, 'ledger'))
  with check (public.can_access_store(store_id, 'pos') or public.can_access_store(store_id, 'ledger'));

-- السماح للكاشير بتسجيل مصاريف الشفت
drop policy if exists expenses_access on public.expenses;
create policy expenses_access on public.expenses for all to authenticated
  using (public.can_access_store(store_id, 'ledger') or public.can_access_store(store_id, 'pos'))
  with check (public.can_access_store(store_id, 'ledger') or public.can_access_store(store_id, 'pos'));

-- دالة البيع المحدثة (تدعم المحافظ واسم الحساب المخصص كالبنك أو المحفظة)
create or replace function public.complete_sale(
  p_store_id uuid,
  p_payment_method text,
  p_invoice_discount numeric,
  p_items jsonb,
  p_payment_account text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_sale_id uuid;
  item jsonb;
  item_id uuid;
  item_quantity integer;
  item_discount numeric(12,2);
  item_row public.inventory_items%rowtype;
  subtotal_amount numeric(12,2) := 0;
  item_discount_amount numeric(12,2) := 0;
  final_total numeric(12,2);
begin
  if not public.can_access_store(p_store_id, 'pos') then
    raise exception 'غير مصرح بإتمام البيع لهذا المتجر';
  end if;
  if p_payment_method not in ('cash', 'card', 'transfer', 'wallet') then raise exception 'طريقة الدفع غير صالحة'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    item_id := (item->>'inventory_item_id')::uuid;
    item_quantity := (item->>'quantity')::integer;
    item_discount := coalesce((item->>'discount')::numeric, 0);
    if item_quantity <= 0 or item_discount < 0 then raise exception 'بيانات صنف البيع غير صالحة'; end if;
    select * into item_row from public.inventory_items
      where id = item_id and store_id = p_store_id for update;
    if not found or item_row.quantity < item_quantity then raise exception 'الكمية المطلوبة غير متاحة في المخزون'; end if;
    subtotal_amount := subtotal_amount + item_row.selling_price * item_quantity;
    item_discount_amount := item_discount_amount + least(item_discount, item_row.selling_price * item_quantity);
  end loop;

  if subtotal_amount <= 0 or p_invoice_discount < 0 or p_invoice_discount > subtotal_amount - item_discount_amount then
    raise exception 'قيمة الفاتورة أو الخصم غير صالحة';
  end if;
  final_total := subtotal_amount - item_discount_amount - p_invoice_discount;
  insert into public.sales(store_id, payment_method, payment_account, subtotal, discount, total)
  values (p_store_id, p_payment_method, coalesce(p_payment_account, ''), subtotal_amount, item_discount_amount + p_invoice_discount, final_total)
  returning id into new_sale_id;

  for item in select value from jsonb_array_elements(p_items) loop
    item_id := (item->>'inventory_item_id')::uuid;
    item_quantity := (item->>'quantity')::integer;
    item_discount := coalesce((item->>'discount')::numeric, 0);
    select * into item_row from public.inventory_items
      where id = item_id and store_id = p_store_id for update;
    update public.inventory_items set quantity = quantity - item_quantity
      where id = item_id and store_id = p_store_id and quantity >= item_quantity;
    if not found then raise exception 'الكمية المطلوبة غير متاحة في المخزون'; end if;
    insert into public.sale_items(store_id, sale_id, inventory_item_id, item_name, quantity, unit_price, unit_cost, discount, line_total)
    values (p_store_id, new_sale_id, item_id, item_row.name, item_quantity, item_row.selling_price, item_row.cost_price,
      least(item_discount, item_row.selling_price * item_quantity),
      item_row.selling_price * item_quantity - least(item_discount, item_row.selling_price * item_quantity));
  end loop;
  return new_sale_id;
end;
$$;

-- نسخة احتياطية من الدالة تقبل 4 معاملات فقط لتوافق أي استدعاء قديم
create or replace function public.complete_sale(
  p_store_id uuid,
  p_payment_method text,
  p_invoice_discount numeric,
  p_items jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  return public.complete_sale(p_store_id, p_payment_method, p_invoice_discount, p_items, '');
end;
$$;

grant select, insert, update, delete on public.store_categories to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant insert, update, delete on public.store_members to authenticated;
grant update on public.inventory_items to authenticated;
