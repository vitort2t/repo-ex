-- =====================================================================
-- CASA EM STOCK — esquema principal
-- Tabelas, índices, integridade referencial e funções auxiliares.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------

-- Normaliza texto para comparações (minúsculas, sem acentos, espaços simples).
create or replace function public.norm_text(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;

-- Identifica a cadeia de supermercado a partir do nome livre.
create or replace function public.store_chain_of(t text)
returns text language sql immutable parallel safe as $$
  select case
    when n ~ 'mercadona'                              then 'mercadona'
    when n ~ 'auchan|jumbo|pao de acucar'             then 'auchan'
    when n ~ 'continente|modelo continente|worten'    then 'continente'
    when n ~ 'pingo ?doce'                            then 'pingo_doce'
    when n ~ 'lidl'                                   then 'lidl'
    when n ~ 'aldi'                                   then 'aldi'
    when n ~ 'intermarch|itmp|os mosqueteiros'        then 'intermarche'
    else 'outros'
  end
  from (select public.norm_text(t) as n) s
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Utilizadores e casas
-- ---------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.households (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(btrim(name)) between 1 and 80),
  currency                 text not null default 'EUR',
  budget_alert_thresholds  int[] not null default '{50,75,90,100}',
  expiry_alert_days        int not null default 7 check (expiry_alert_days between 1 and 60),
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members(user_id);

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email        text not null,
  token        text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_by  uuid references auth.users(id) on delete set null,
  accepted_at  timestamptz,
  revoked_at   timestamptz
);
create index household_invites_household_idx on public.household_invites(household_id);

-- ---------------------------------------------------------------------
-- Catálogo: categorias, localizações, produtos, lotes
-- ---------------------------------------------------------------------

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  grp          text not null default 'Outros',   -- Alimentação, Higiene pessoal, Limpeza, Casa, Outros
  name         text not null check (length(btrim(name)) between 1 and 60),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, grp, name)
);

create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  brand           text,
  category_id     uuid references public.categories(id) on delete set null,
  location_id     uuid references public.locations(id) on delete set null,
  unit            text not null default 'un',            -- un, kg, g, l, ml, emb
  quantity        numeric(12,3) not null default 0,
  min_quantity    numeric(12,3) not null default 0 check (min_quantity >= 0),
  ideal_quantity  numeric(12,3) not null default 0 check (ideal_quantity >= 0),
  auto_restock    boolean not null default true,
  package_size    numeric(12,3) check (package_size is null or package_size > 0),
  package_unit    text check (package_unit is null or package_unit in ('kg','l','un')),
  last_price      numeric(12,4),
  avg_price       numeric(12,4),
  last_in_at      timestamptz,
  last_out_at     timestamptz,
  photo_path      text,
  notes           text,
  aliases         text[] not null default '{}',          -- nomes aprendidos das faturas
  archived        boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index products_household_idx on public.products(household_id) where not archived;
create index products_name_trgm on public.products using gin (public.norm_text(name) extensions.gin_trgm_ops);

create table public.inventory_lots (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  quantity     numeric(12,3) not null check (quantity >= 0),
  expires_on   date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index inventory_lots_product_idx on public.inventory_lots(product_id, expires_on) where quantity > 0;
create index inventory_lots_household_idx on public.inventory_lots(household_id, expires_on) where quantity > 0;

-- ---------------------------------------------------------------------
-- Compras e faturas
-- ---------------------------------------------------------------------

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  file_path       text,
  file_sha256     text,
  mime_type       text,
  status          text not null default 'uploaded'
                  check (status in ('uploaded','processing','parsed','failed','confirmed','discarded','voided')),
  store_name      text,
  document_number text,
  purchase_date   date,
  total_paid      numeric(12,2),
  parsed          jsonb,          -- resultado bruto da interpretação
  error           text,
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- O mesmo ficheiro não pode entrar duas vezes na mesma casa.
create unique index receipts_file_unique on public.receipts(household_id, file_sha256)
  where file_sha256 is not null and status <> 'discarded';
create index receipts_household_idx on public.receipts(household_id, created_at desc);

create table public.receipt_items (
  id                uuid primary key default gen_random_uuid(),
  receipt_id        uuid not null references public.receipts(id) on delete cascade,
  household_id      uuid not null references public.households(id) on delete cascade,
  line_no           int not null,
  raw_text          text,
  name              text,
  quantity          numeric(12,3),
  unit              text,
  unit_price        numeric(12,4),
  line_total        numeric(12,2),
  discount          numeric(12,2),
  is_return         boolean not null default false,
  category_hint     text,
  product_id        uuid references public.products(id) on delete set null,
  match_confidence  numeric(4,3),
  created_at        timestamptz not null default now(),
  unique (receipt_id, line_no)
);

create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null,                         -- idempotência
  household_id     uuid not null references public.households(id) on delete cascade,
  receipt_id       uuid references public.receipts(id) on delete set null,
  store_name       text not null check (length(btrim(store_name)) between 1 and 120),
  store_chain      text generated always as (public.store_chain_of(store_name)) stored,
  document_number  text,
  purchased_at     date not null,
  total_paid       numeric(12,2) not null check (total_paid >= 0),
  items_total      numeric(12,2),
  discount_total   numeric(12,2) not null default 0,
  payment_method   text,
  status           text not null default 'confirmed' check (status in ('confirmed','voided')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references auth.users(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, client_id)
);
-- Uma fatura só pode originar uma compra confirmada.
create unique index purchases_receipt_unique on public.purchases(receipt_id)
  where receipt_id is not null and status = 'confirmed';
-- O mesmo número de documento (ex. ATCUD) não pode ser registado duas vezes na mesma cadeia.
create unique index purchases_document_unique on public.purchases(household_id, store_chain, public.norm_text(document_number))
  where document_number is not null and btrim(document_number) <> '' and status = 'confirmed';
create index purchases_household_date_idx on public.purchases(household_id, purchased_at desc) where status = 'confirmed';

create table public.purchase_items (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references public.purchases(id) on delete cascade,
  household_id   uuid not null references public.households(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  category_id    uuid references public.categories(id) on delete set null,
  name           text not null,
  raw_text       text,
  quantity       numeric(12,3) not null check (quantity > 0),
  unit_price     numeric(12,4),
  line_total     numeric(12,2) not null,     -- valor final pago pela linha (já com desconto de linha)
  discount       numeric(12,2) not null default 0,
  package_size   numeric(12,3),
  package_unit   text,
  add_to_stock   boolean not null default true,
  created_at     timestamptz not null default now()
);
create index purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index purchase_items_product_idx on public.purchase_items(product_id);

-- ---------------------------------------------------------------------
-- Movimentos de stock
-- ---------------------------------------------------------------------

create table public.stock_movements (
  id            uuid primary key,                         -- gerado no cliente → idempotente
  household_id  uuid not null references public.households(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  direction     text not null check (direction in ('in','out')),
  quantity      numeric(12,3) not null check (quantity > 0),
  reason        text not null check (reason in
                  ('purchase','gift','correction','initial','consumption','waste','expired','void')),
  note          text,
  occurred_at   timestamptz not null default now(),
  purchase_id   uuid references public.purchases(id) on delete set null,
  balance_after numeric(12,3) not null,
  user_id       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index stock_movements_household_idx on public.stock_movements(household_id, occurred_at desc);
create index stock_movements_product_idx on public.stock_movements(product_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- Lista de compras
-- ---------------------------------------------------------------------

create table public.shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null default 'Lista principal',
  is_default   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index shopping_lists_default_unique on public.shopping_lists(household_id) where is_default;

create table public.shopping_list_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.shopping_lists(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  product_id   uuid references public.products(id) on delete cascade,
  custom_name  text,
  quantity     numeric(12,3),              -- null = usar quantidade sugerida
  source       text not null default 'manual' check (source in ('auto','manual')),
  status       text not null default 'open' check (status in ('open','dismissed','done')),
  checked      boolean not null default false,
  checked_by   uuid references auth.users(id) on delete set null,
  checked_at   timestamptz,
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (product_id is not null or length(btrim(coalesce(custom_name,''))) > 0)
);
create unique index shopping_items_product_unique on public.shopping_list_items(list_id, product_id)
  where product_id is not null and status in ('open','dismissed');
create index shopping_items_household_idx on public.shopping_list_items(household_id) where status = 'open';

-- ---------------------------------------------------------------------
-- Orçamento, notificações, auditoria
-- ---------------------------------------------------------------------

create table public.monthly_budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  amount       numeric(12,2) not null check (amount >= 0),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, month)
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,  -- null = toda a casa
  kind         text not null,      -- low_stock, out_of_stock, expiry, budget, sync_error
  title        text not null,
  body         text,
  link         text,
  dedupe_key   text,
  created_at   timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications(household_id, dedupe_key) where dedupe_key is not null;
create index notifications_household_idx on public.notifications(household_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_household_idx on public.audit_log(household_id, created_at desc);

-- updated_at automático
do $$
declare t text;
begin
  foreach t in array array['profiles','households','categories','locations','products','inventory_lots',
                           'receipts','purchases','shopping_lists','shopping_list_items','monthly_budgets']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Vistas de leitura
-- ---------------------------------------------------------------------

-- Histórico de preços (apenas compras confirmadas).
create view public.price_history with (security_invoker = true) as
select pi.id,
       pi.household_id,
       pi.product_id,
       pi.name,
       p.purchased_at,
       p.store_name,
       p.store_chain,
       pi.quantity,
       round(pi.line_total / nullif(pi.quantity, 0), 4)                      as unit_price,
       pi.package_size,
       pi.package_unit,
       case when pi.package_size is not null and pi.package_unit is not null
            then round(pi.line_total / nullif(pi.quantity, 0) / pi.package_size, 4) end as normalized_price
from public.purchase_items pi
join public.purchases p on p.id = pi.purchase_id and p.status = 'confirmed';

-- Lotes com validade (consumir primeiro).
create view public.expiring_lots with (security_invoker = true) as
select l.id, l.household_id, l.product_id, pr.name as product_name, pr.unit,
       l.quantity, l.expires_on, (l.expires_on - current_date) as days_left
from public.inventory_lots l
join public.products pr on pr.id = l.product_id and not pr.archived
where l.quantity > 0;
