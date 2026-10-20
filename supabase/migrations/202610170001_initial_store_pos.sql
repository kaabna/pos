create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'employee' check (role in ('owner', 'admin', 'employee')),
  created_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  manager text not null,
  status text not null default 'active' check (status in ('active', 'setup', 'paused')),
  sales_target numeric(12,2) not null default 0 check (sales_target >= 0),
  fixed_expenses numeric(12,2) not null default 0 check (fixed_expenses >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permissions jsonb not null default '["pos","inventory","repairs","tasks"]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id),
  unique (user_id),
  check (jsonb_typeof(permissions) = 'array')
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  unique (store_id, name),
  unique (store_id, id)
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  category text not null default 'accessory',
  sku text not null,
  barcode text,
  quantity integer not null default 0 check (quantity >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  discount numeric(5,2) not null default 0 check (discount between 0 and 100),
  imei_tracking boolean not null default false,
  supplier_id uuid,
  created_at timestamptz not null default now(),
  unique (store_id, sku),
  unique (store_id, id),
  foreign key (store_id, supplier_id) references public.suppliers(store_id, id)
);

create unique index if not exists inventory_items_store_barcode_idx
  on public.inventory_items(store_id, barcode) where barcode is not null and barcode <> '';

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  supplier_id uuid not null,
  invoice_number text not null,
  purchase_date date not null default current_date,
  total numeric(12,2) not null default 0 check (total >= 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (store_id, invoice_number),
  unique (store_id, id),
  foreign key (store_id, supplier_id) references public.suppliers(store_id, id)
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_id uuid not null,
  inventory_item_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_cost) stored,
  foreign key (store_id, purchase_id) references public.purchases(store_id, id) on delete cascade,
  foreign key (store_id, inventory_item_id) references public.inventory_items(store_id, id)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (store_id, id)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null,
  inventory_item_id uuid not null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  foreign key (store_id, sale_id) references public.sales(store_id, id) on delete cascade,
  foreign key (store_id, inventory_item_id) references public.inventory_items(store_id, id)
);

create table if not exists public.repair_tickets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  device_type text not null,
  device_model text not null,
  serial_number text,
  issue text not null,
  status text not null default 'pending' check (status in ('pending','diagnosing','waiting_parts','repaired','delivered')),
  used_parts jsonb not null default '[]'::jsonb,
  parts_cost numeric(12,2) not null default 0 check (parts_cost >= 0),
  final_price numeric(12,2) not null default 0 check (final_price >= 0),
  deposit numeric(12,2) not null default 0 check (deposit >= 0),
  technician_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid not null references public.profiles(id),
  due_date date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  proof_required boolean not null default false,
  proof_link text,
  proof_note text,
  status text not null default 'open' check (status in ('open','in_progress','completed','blocked')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (store_id, id)
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  description text not null default '',
  owner_id uuid,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'planned' check (status in ('planned','in_progress','review','done')),
  due_date date,
  linked_task_id uuid,
  created_at timestamptz not null default now(),
  foreign key (store_id, owner_id) references public.store_members(store_id, user_id),
  foreign key (store_id, linked_task_id) references public.tasks(store_id, id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  note text not null default '',
  expense_date date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.is_store_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('owner', 'admin')
  );
$$;

create or replace function public.can_access_store(target_store uuid, target_module text default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_store_admin() or exists (
    select 1 from public.store_members membership
    where membership.user_id = (select auth.uid())
      and membership.store_id = target_store
      and (target_module is null or membership.permissions ? target_module)
  );
$$;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.repair_tickets enable row level security;
alter table public.tasks enable row level security;
alter table public.roadmap_items enable row level security;
alter table public.expenses enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_store_admin());

create policy stores_read_permitted on public.stores for select to authenticated
  using (public.can_access_store(id));
create policy stores_admin_insert on public.stores for insert to authenticated
  with check (public.is_store_admin());
create policy stores_admin_update on public.stores for update to authenticated
  using (public.is_store_admin()) with check (public.is_store_admin());
create policy stores_admin_delete on public.stores for delete to authenticated
  using (public.is_store_admin());

create policy members_read on public.store_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_store_admin());
create policy members_admin_write on public.store_members for all to authenticated
  using (public.is_store_admin()) with check (public.is_store_admin());

create policy suppliers_access on public.suppliers for all to authenticated
  using (public.can_access_store(store_id, 'purchases'))
  with check (public.can_access_store(store_id, 'purchases'));
create policy inventory_read on public.inventory_items for select to authenticated
  using (public.can_access_store(store_id, 'inventory') or public.can_access_store(store_id, 'pos') or public.can_access_store(store_id, 'purchases'))
;
create policy inventory_insert on public.inventory_items for insert to authenticated
  with check (public.can_access_store(store_id, 'inventory'));
create policy inventory_update on public.inventory_items for update to authenticated
  using (public.can_access_store(store_id, 'inventory') or public.can_access_store(store_id, 'purchases'))
  with check (public.can_access_store(store_id, 'inventory') or public.can_access_store(store_id, 'purchases'));
create policy inventory_delete on public.inventory_items for delete to authenticated
  using (public.can_access_store(store_id, 'inventory'));
create policy purchases_read on public.purchases for select to authenticated
  using (public.can_access_store(store_id, 'purchases') or public.can_access_store(store_id, 'ledger'));
create policy purchases_insert on public.purchases for insert to authenticated
  with check (public.can_access_store(store_id, 'purchases'));
create policy purchases_update on public.purchases for update to authenticated
  using (public.can_access_store(store_id, 'purchases')) with check (public.can_access_store(store_id, 'purchases'));
create policy purchases_delete on public.purchases for delete to authenticated
  using (public.can_access_store(store_id, 'purchases'));
create policy purchase_items_read on public.purchase_items for select to authenticated
  using (public.can_access_store(store_id, 'purchases') or public.can_access_store(store_id, 'ledger'));
create policy purchase_items_insert on public.purchase_items for insert to authenticated
  with check (public.can_access_store(store_id, 'purchases'));
create policy purchase_items_update on public.purchase_items for update to authenticated
  using (public.can_access_store(store_id, 'purchases')) with check (public.can_access_store(store_id, 'purchases'));
create policy purchase_items_delete on public.purchase_items for delete to authenticated
  using (public.can_access_store(store_id, 'purchases'));
create policy sales_access on public.sales for all to authenticated
  using (public.can_access_store(store_id, 'pos') or public.can_access_store(store_id, 'ledger'))
  with check (public.can_access_store(store_id, 'pos'));
create policy sale_items_access on public.sale_items for all to authenticated
  using (public.can_access_store(store_id, 'pos') or public.can_access_store(store_id, 'ledger'))
  with check (public.can_access_store(store_id, 'pos'));
create policy repairs_access on public.repair_tickets for all to authenticated
  using (public.can_access_store(store_id, 'repairs') or public.can_access_store(store_id, 'ledger'))
  with check (public.can_access_store(store_id, 'repairs'));
create policy tasks_read on public.tasks for select to authenticated
  using (public.can_access_store(store_id, 'tasks') and (public.is_store_admin() or assignee_id = (select auth.uid())));
create policy tasks_admin_insert on public.tasks for insert to authenticated
  with check (public.is_store_admin() and public.can_access_store(store_id, 'tasks') and exists (
    select 1 from public.store_members membership join public.profiles member_profile on member_profile.id = membership.user_id
    where membership.store_id = tasks.store_id and membership.user_id = tasks.assignee_id and member_profile.role = 'employee'
  ));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_access_store(store_id, 'tasks') and (public.is_store_admin() or assignee_id = (select auth.uid())))
  with check (public.can_access_store(store_id, 'tasks') and (public.is_store_admin() or assignee_id = (select auth.uid())));
create policy tasks_admin_delete on public.tasks for delete to authenticated
  using (public.is_store_admin() and public.can_access_store(store_id, 'tasks'));
create policy roadmap_access on public.roadmap_items for all to authenticated
  using (public.can_access_store(store_id, 'roadmap'))
  with check (public.can_access_store(store_id, 'roadmap'));
create policy expenses_access on public.expenses for all to authenticated
  using (public.can_access_store(store_id, 'ledger'))
  with check (public.can_access_store(store_id, 'ledger'));

create or replace function public.save_purchase(
  p_store_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_purchase_date date,
  p_items jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_purchase_id uuid;
  item jsonb;
  item_id uuid;
  item_quantity integer;
  item_cost numeric(12,2);
  old_quantity integer;
  old_cost numeric(12,2);
  invoice_total numeric(12,2) := 0;
  item_count integer := 0;
begin
  if not public.can_access_store(p_store_id, 'purchases') then
    raise exception 'غير مصرح بإضافة مشتريات لهذا المتجر';
  end if;

  insert into public.purchases(store_id, supplier_id, invoice_number, purchase_date, total)
  values (p_store_id, p_supplier_id, p_invoice_number, coalesce(p_purchase_date, current_date), 0)
  returning id into new_purchase_id;

  for item in select value from jsonb_array_elements(p_items) loop
    item_id := (item->>'inventory_item_id')::uuid;
    item_quantity := (item->>'quantity')::integer;
    item_cost := (item->>'unit_cost')::numeric(12,2);
    if item_quantity <= 0 or item_cost < 0 then raise exception 'بيانات صنف الشراء غير صالحة'; end if;

    select quantity, cost_price into old_quantity, old_cost
    from public.inventory_items
    where id = item_id and store_id = p_store_id
    for update;
    if not found then raise exception 'الصنف غير موجود في هذا المتجر'; end if;

    update public.inventory_items
    set quantity = old_quantity + item_quantity,
        cost_price = case when old_quantity + item_quantity = 0 then item_cost
          else ((old_quantity * old_cost) + (item_quantity * item_cost)) / (old_quantity + item_quantity) end
    where id = item_id and store_id = p_store_id;

    insert into public.purchase_items(store_id, purchase_id, inventory_item_id, quantity, unit_cost)
    values (p_store_id, new_purchase_id, item_id, item_quantity, item_cost);
    invoice_total := invoice_total + item_quantity * item_cost;
    item_count := item_count + 1;
  end loop;

  if item_count = 0 then raise exception 'أضف صنفًا واحدًا على الأقل إلى الفاتورة'; end if;
  update public.purchases set total = invoice_total where id = new_purchase_id and store_id = p_store_id;
  return new_purchase_id;
end;
$$;

create or replace function public.complete_sale(
  p_store_id uuid,
  p_payment_method text,
  p_invoice_discount numeric,
  p_items jsonb
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
  if p_payment_method not in ('cash', 'card', 'transfer') then raise exception 'طريقة الدفع غير صالحة'; end if;

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
  insert into public.sales(store_id, payment_method, subtotal, discount, total)
  values (p_store_id, p_payment_method, subtotal_amount, item_discount_amount + p_invoice_discount, final_total)
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

create or replace function public.update_task_status(
  p_store_id uuid,
  p_task_id uuid,
  p_status text,
  p_proof_link text,
  p_proof_note text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  task_row public.tasks%rowtype;
begin
  if p_status not in ('open', 'in_progress', 'completed', 'blocked') then
    raise exception 'حالة المهمة غير صالحة';
  end if;
  if not public.can_access_store(p_store_id, 'tasks') then
    raise exception 'غير مصرح بتحديث هذه المهمة';
  end if;
  select * into task_row from public.tasks
    where id = p_task_id and store_id = p_store_id for update;
  if not found or (not public.is_store_admin() and task_row.assignee_id <> (select auth.uid())) then
    raise exception 'غير مصرح بتحديث هذه المهمة';
  end if;
  if task_row.proof_required and p_status = 'completed'
    and coalesce(nullif(p_proof_link, ''), nullif(p_proof_note, '')) is null then
    raise exception 'أضف الإثبات قبل إكمال المهمة';
  end if;
  update public.tasks set status = p_status, proof_link = nullif(p_proof_link, ''), proof_note = nullif(p_proof_note, '')
    where id = p_task_id and store_id = p_store_id;
end;
$$;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.stores to authenticated;
grant update, delete on public.store_members to authenticated;
grant insert, update, delete on public.suppliers to authenticated;
grant insert, delete on public.inventory_items to authenticated;
grant insert on public.tasks to authenticated;
grant insert, update, delete on public.roadmap_items to authenticated;
grant insert on public.repair_tickets, public.expenses to authenticated;
grant update on public.repair_tickets to authenticated;
grant delete on public.repair_tickets to authenticated;
revoke all on function public.is_store_admin() from public, anon;
revoke all on function public.can_access_store(uuid, text) from public, anon;
revoke all on function public.save_purchase(uuid, uuid, text, date, jsonb) from public, anon;
revoke all on function public.complete_sale(uuid, text, numeric, jsonb) from public, anon;
revoke all on function public.update_task_status(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.is_store_admin() to authenticated;
grant execute on function public.can_access_store(uuid, text) to authenticated;
grant execute on function public.save_purchase(uuid, uuid, text, date, jsonb) to authenticated;
grant execute on function public.complete_sale(uuid, text, numeric, jsonb) to authenticated;
grant execute on function public.update_task_status(uuid, uuid, text, text, text) to authenticated;