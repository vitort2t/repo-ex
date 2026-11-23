-- =====================================================================
-- LAR. — Módulo financeiro familiar
-- Pessoas, contas, categorias, movimentos (livro-razão), transferências,
-- apoio ao Heitor, recorrências, orçamentos, objetivos e importações.
--
-- Regras contabilísticas aplicadas aqui (e testadas em tests/20_finance.sql):
--  • Só contam valores com status = 'done' (recebido / pago).
--  • Transferências entre contas próprias (incl. poupança e pagamento de
--    cartão) são dois movimentos ligados por transfer_group, com
--    nature = 'transfer' — nunca rendimento nem despesa.
--  • Uma compra de supermercado confirmada gera UM movimento de despesa
--    (purchase_id único); anulação/correção da compra reflete-se nele.
--  • Envios ao Heitor são despesas (categoria Heitor) com a taxa de câmbio
--    guardada no momento — nunca recalculada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pessoas (membros com conta + beneficiários sem acesso, ex. Heitor)
-- ---------------------------------------------------------------------
create table public.fin_people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  kind         text not null default 'beneficiary' check (kind in ('member','beneficiary')),
  user_id      uuid references auth.users(id) on delete set null,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index fin_people_user_unique on public.fin_people(household_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------
-- Contas e carteiras
-- ---------------------------------------------------------------------
create table public.fin_accounts (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 80),
  kind             text not null default 'bank' check (kind in ('bank','cash','savings','credit_card')),
  owner_person_id  uuid references public.fin_people(id) on delete set null,   -- null = conjunta
  institution      text,
  currency         text not null default 'EUR' check (currency in ('EUR','BRL')),
  opening_balance  numeric(14,2) not null default 0,
  opening_date     date not null default current_date,
  reserved_amount  numeric(14,2) not null default 0 check (reserved_amount >= 0),
  archived         boolean not null default false,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorias e subcategorias
-- ---------------------------------------------------------------------
create table public.fin_categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind         text not null check (kind in ('income','expense','savings')),
  parent_id    uuid references public.fin_categories(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  system_key   text,              -- ex. 'alimentacao.supermercado', 'heitor', 'heitor.transferencias'
  sort         int not null default 0,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index fin_categories_key_unique on public.fin_categories(household_id, system_key) where system_key is not null;
create unique index fin_categories_name_unique on public.fin_categories(household_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ---------------------------------------------------------------------
-- Objetivos de poupança
-- ---------------------------------------------------------------------
create table public.fin_goals (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 80),
  target_amount   numeric(14,2) not null check (target_amount > 0),
  initial_amount  numeric(14,2) not null default 0 check (initial_amount >= 0),
  start_date      date not null default current_date,
  deadline        date,
  account_id      uuid references public.fin_accounts(id) on delete set null,
  notes           text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Despesas/rendimentos recorrentes (calendário financeiro)
-- ---------------------------------------------------------------------
create table public.fin_recurring (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  type          text not null check (type in ('income','expense')),
  description   text not null check (length(btrim(description)) between 1 and 120),
  amount        numeric(14,2) not null check (amount > 0),
  category_id   uuid references public.fin_categories(id) on delete set null,
  account_id    uuid references public.fin_accounts(id) on delete set null,
  person_id     uuid references public.fin_people(id) on delete set null,
  beneficiary_id uuid references public.fin_people(id) on delete set null,
  frequency     text not null check (frequency in ('weekly','monthly','yearly','days')),
  interval_n    int not null default 1 check (interval_n between 1 and 365),
  next_due      date not null,
  end_date      date,
  active        boolean not null default true,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Importações de extratos (evita importar o mesmo ficheiro duas vezes)
-- ---------------------------------------------------------------------
create table public.fin_imports (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  file_name    text,
  file_sha256  text,
  file_path    text,
  account_id   uuid references public.fin_accounts(id) on delete set null,
  row_count    int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index fin_imports_file_unique on public.fin_imports(household_id, file_sha256) where file_sha256 is not null;

-- ---------------------------------------------------------------------
-- Movimentos (livro-razão)
-- ---------------------------------------------------------------------
create table public.fin_transactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  client_id       uuid,                                  -- idempotência (formulários)
  nature          text not null check (nature in ('income','expense','transfer')),
  direction       text not null check (direction in ('in','out')),
  status          text not null default 'done' check (status in ('planned','pending','done','cancelled')),
  amount          numeric(14,2) not null check (amount > 0),
  currency        text not null default 'EUR' check (currency in ('EUR','BRL')),
  date            date not null,
  description     text not null check (length(btrim(description)) between 1 and 160),
  category_id     uuid references public.fin_categories(id) on delete set null,
  account_id      uuid references public.fin_accounts(id) on delete set null,
  person_id       uuid references public.fin_people(id) on delete set null,      -- quem recebeu / quem pagou
  beneficiary_id  uuid references public.fin_people(id) on delete set null,      -- quem beneficiou
  scope           text not null default 'shared' check (scope in ('shared','individual')),
  payment_method  text,
  notes           text,
  proof_path      text,                                  -- comprovativo (Storage privado)
  transfer_group  uuid,                                  -- liga saída e entrada de uma transferência
  transfer_kind   text check (transfer_kind in ('internal','savings','card_payment')),
  goal_id         uuid references public.fin_goals(id) on delete set null,
  recurring_id    uuid references public.fin_recurring(id) on delete set null,
  purchase_id     uuid references public.purchases(id) on delete set null,
  import_id       uuid references public.fin_imports(id) on delete set null,
  source          text not null default 'manual' check (source in ('manual','purchase','recurring','import')),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((nature = 'income' and direction = 'in') or (nature = 'expense' and direction = 'out') or nature = 'transfer'),
  check (nature <> 'transfer' or transfer_group is not null)
);
create unique index fin_tx_client_unique on public.fin_transactions(household_id, client_id, direction) where client_id is not null;
-- Uma compra de supermercado gera no máximo um movimento financeiro.
create unique index fin_tx_purchase_unique on public.fin_transactions(purchase_id) where purchase_id is not null;
-- Cada ocorrência de uma recorrência só é gerada uma vez.
create unique index fin_tx_recurring_unique on public.fin_transactions(recurring_id, date) where recurring_id is not null;
create index fin_tx_household_date_idx on public.fin_transactions(household_id, date desc);
create index fin_tx_account_idx on public.fin_transactions(account_id) where status = 'done';
create index fin_tx_group_idx on public.fin_transactions(transfer_group) where transfer_group is not null;

-- Detalhes dos envios ao Heitor (taxa de câmbio guardada no momento)
create table public.fin_heitor_transfers (
  transaction_id uuid primary key references public.fin_transactions(id) on delete cascade,
  household_id   uuid not null references public.households(id) on delete cascade,
  amount_eur     numeric(14,2) not null check (amount_eur > 0),
  amount_brl     numeric(14,2) check (amount_brl is null or amount_brl >= 0),
  fx_rate        numeric(14,6) check (fx_rate is null or fx_rate > 0),     -- BRL por 1 EUR, efetivamente aplicada
  fees_eur       numeric(14,2) not null default 0 check (fees_eur >= 0),
  service        text,
  purpose        text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Orçamentos (total, por categoria, por pessoa) — valem a partir do mês indicado
-- ---------------------------------------------------------------------
create table public.fin_budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  scope        text not null check (scope in ('total','category','person')),
  category_id  uuid references public.fin_categories(id) on delete cascade,
  person_id    uuid references public.fin_people(id) on delete cascade,
  amount       numeric(14,2) not null check (amount >= 0),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((scope = 'total' and category_id is null and person_id is null)
      or (scope = 'category' and category_id is not null and person_id is null)
      or (scope = 'person' and person_id is not null and category_id is null))
);
create unique index fin_budgets_unique on public.fin_budgets(household_id, month, scope,
  coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid));

do $$
declare t text;
begin
  foreach t in array array['fin_people','fin_accounts','fin_categories','fin_goals','fin_recurring','fin_transactions','fin_budgets']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Histórico de alterações (auditoria linha a linha das tabelas financeiras)
-- =====================================================================
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
begin
  insert into public.audit_log(household_id, user_id, action, entity, entity_id, details)
  values (coalesce((v_new->>'household_id')::uuid, (v_old->>'household_id')::uuid), auth.uid(),
          lower(tg_op), tg_table_name, coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, (v_new->>'transaction_id')::uuid),
          case when tg_op = 'UPDATE' then jsonb_build_object('old', v_old, 'new', v_new)
               when tg_op = 'INSERT' then jsonb_build_object('new', v_new)
               else jsonb_build_object('old', v_old) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['fin_people','fin_accounts','fin_categories','fin_goals','fin_recurring','fin_transactions',
                           'fin_heitor_transfers','fin_budgets']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Sementes: pessoas e categorias
-- =====================================================================
create or replace function public.fin_seed(hid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record; v_parent uuid; v_key text; v_sort int := 0;
  sub text; i int;
begin
  -- Pessoas: membros atuais + Heitor (beneficiário, sem conta de acesso)
  insert into public.fin_people(household_id, name, kind, user_id)
  select m.household_id, coalesce(nullif(p.display_name, ''), 'Membro'), 'member', m.user_id
    from public.household_members m left join public.profiles p on p.id = m.user_id
   where m.household_id = hid
  on conflict do nothing;
  if not exists (select 1 from public.fin_people where household_id = hid and kind = 'beneficiary' and lower(name) = 'heitor') then
    insert into public.fin_people(household_id, name, kind) values (hid, 'Heitor', 'beneficiary');
  end if;

  -- Rendimentos
  for g in select * from (values
      ('salarios','Salários'),('subsidio_desemprego','Subsídios de desemprego'),('subsidios','Subsídios e apoios'),
      ('extras','Trabalhos extras'),('servicos','Prestação de serviços'),('comissoes','Comissões'),
      ('reembolsos','Reembolsos'),('vendas','Vendas'),('outros_rendimentos','Outros rendimentos')) as t(k, n)
  loop
    v_sort := v_sort + 1;
    insert into public.fin_categories(household_id, kind, name, system_key, sort)
    values (hid, 'income', g.n, 'income.' || g.k, v_sort) on conflict do nothing;
  end loop;

  -- Despesas e poupança (grupo → subcategorias)
  v_sort := 0;
  for g in select * from (values
      ('habitacao','Habitação','expense', array['Renda','Condomínio','Reparações','Mobiliário','Outros']),
      ('contas','Contas domésticas','expense', array['Eletricidade','Água','Gás','Internet','Telemóveis']),
      ('alimentacao','Alimentação','expense', array['Supermercado','Restaurantes','Cafés','Take-away']),
      ('transportes','Transportes','expense', array['Combustível','Portagens','Estacionamento','Transportes públicos','Manutenção automóvel','Seguros automóveis']),
      ('familia','Família','expense', array['Despesas gerais','Despesas pessoais','Apoio familiar']),
      ('heitor','Heitor','expense', array['Transferências','Escola','Material escolar','Vestuário','Saúde','Outras despesas']),
      ('olivia','Olívia','expense', array['Alimentação','Fraldas','Higiene','Vestuário','Saúde','Brinquedos','Outros']),
      ('saude','Saúde','expense', array['Consultas','Medicamentos','Exames','Seguros']),
      ('animais','Animais','expense', array['Alimentação','Higiene','Veterinário']),
      ('pessoais','Despesas pessoais','expense', array['Roupa','Beleza','Cabeleireiro','Compras individuais']),
      ('lazer','Lazer e viagens','expense', array['Restaurantes','Passeios','Férias','Entretenimento']),
      ('financeiro','Financeiro','expense', array['Prestações','Créditos','Juros','Comissões bancárias']),
      ('poupanca','Poupança e investimentos','savings', array['Fundo de emergência','Poupança familiar','Objetivos específicos'])
    ) as t(k, n, kind, subs)
  loop
    v_sort := v_sort + 1;
    insert into public.fin_categories(household_id, kind, name, system_key, sort)
    values (hid, g.kind, g.n, g.k, v_sort * 100) on conflict do nothing;
    select id into v_parent from public.fin_categories where household_id = hid and system_key = g.k;
    i := 0;
    foreach sub in array g.subs loop
      i := i + 1;
      v_key := g.k || '.' || regexp_replace(public.norm_text(sub), '[^a-z0-9]+', '_', 'g');
      insert into public.fin_categories(household_id, kind, parent_id, name, system_key, sort)
      values (hid, g.kind, v_parent, sub, v_key, v_sort * 100 + i) on conflict do nothing;
    end loop;
  end loop;
end $$;

-- Novas casas recebem também as sementes financeiras.
create or replace function public.seed_household_finance_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fin_seed(new.household_id);
  return new;
end $$;
-- Quando alguém entra numa casa, passa a existir como pessoa no módulo financeiro.
create trigger household_members_fin_person
  after insert on public.household_members
  for each row execute function public.seed_household_finance_trigger();

-- Casas já existentes
do $$ declare h record; begin
  for h in select id from public.households loop perform public.fin_seed(h.id); end loop;
end $$;

-- =====================================================================
-- Funções auxiliares
-- =====================================================================
create or replace function public.fin_person_of_user(hid uuid, uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.fin_people where household_id = hid and user_id = uid limit 1;
$$;

create or replace function public.fin_category_by_key(hid uuid, k text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.fin_categories where household_id = hid and system_key = k;
$$;

create or replace function public.fin_assert_same_household(hid uuid, p_table text, p_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if p_id is null then return; end if;
  execute format('select household_id from public.%I where id = $1', p_table) into v using p_id;
  if v is distinct from hid then raise exception 'INVALID_REFERENCE' using detail = p_table; end if;
end $$;

-- =====================================================================
-- Criação de movimentos (todas as variantes, numa transação)
-- p_payload:
--   type: income | expense | transfer | heitor | savings
--   status: planned | pending | done      amount, date, description, notes, proof_path
--   category_id, account_id, to_account_id (transfer/savings), person_id, beneficiary_id,
--   scope (shared|individual), payment_method, goal_id, currency, transfer_kind (internal|card_payment)
--   heitor: { amount_eur, amount_brl, fx_rate, fees_eur, service, purpose }
-- =====================================================================
create or replace function public.fin_create_movement(p_household uuid, p_client_id uuid, p_payload jsonb)
returns setof public.fin_transactions language plpgsql security definer set search_path = public as $$
declare
  v_type    text := p_payload->>'type';
  v_status  text := coalesce(nullif(p_payload->>'status', ''), 'done');
  v_amount  numeric := nullif(p_payload->>'amount', '')::numeric;
  v_date    date := coalesce(nullif(p_payload->>'date', '')::date, current_date);
  v_desc    text := nullif(btrim(p_payload->>'description'), '');
  v_cat     uuid := nullif(p_payload->>'category_id', '')::uuid;
  v_acc     uuid := nullif(p_payload->>'account_id', '')::uuid;
  v_to      uuid := nullif(p_payload->>'to_account_id', '')::uuid;
  v_person  uuid := nullif(p_payload->>'person_id', '')::uuid;
  v_benef   uuid := nullif(p_payload->>'beneficiary_id', '')::uuid;
  v_goal    uuid := nullif(p_payload->>'goal_id', '')::uuid;
  v_scope   text := coalesce(nullif(p_payload->>'scope', ''), 'shared');
  v_cur     text := coalesce(nullif(p_payload->>'currency', ''), 'EUR');
  v_group   uuid;
  v_kind    text;
  v_catkind text;
  v_h       jsonb := p_payload->'heitor';
  v_eur     numeric; v_brl numeric; v_rate numeric; v_fees numeric;
  v_row     public.fin_transactions;
  v_acc_cur text; v_to_cur text; v_to_kind text;
begin
  perform public.assert_member(p_household);
  if p_client_id is null then raise exception 'MISSING_ID'; end if;

  -- Idempotência
  if exists (select 1 from public.fin_transactions where household_id = p_household and client_id = p_client_id) then
    return query select * from public.fin_transactions where household_id = p_household and client_id = p_client_id order by direction desc;
    return;
  end if;

  if coalesce(v_type, '') not in ('income','expense','transfer','heitor','savings') then raise exception 'INVALID_TYPE'; end if;
  if v_status not in ('planned','pending','done') then raise exception 'INVALID_STATUS'; end if;
  if v_scope not in ('shared','individual') then raise exception 'INVALID_SCOPE'; end if;
  if v_date > current_date and v_status = 'done' then raise exception 'FUTURE_DONE'; end if;

  perform public.fin_assert_same_household(p_household, 'fin_categories', v_cat);
  perform public.fin_assert_same_household(p_household, 'fin_accounts', v_acc);
  perform public.fin_assert_same_household(p_household, 'fin_accounts', v_to);
  perform public.fin_assert_same_household(p_household, 'fin_people', v_person);
  perform public.fin_assert_same_household(p_household, 'fin_people', v_benef);
  perform public.fin_assert_same_household(p_household, 'fin_goals', v_goal);

  if v_acc is not null then select currency into v_acc_cur from public.fin_accounts where id = v_acc; v_cur := v_acc_cur; end if;
  if v_person is null then v_person := public.fin_person_of_user(p_household, auth.uid()); end if;

  -- Envio ao Heitor: despesa (apoio familiar) com detalhes de câmbio
  if v_type = 'heitor' then
    v_eur  := nullif(v_h->>'amount_eur', '')::numeric;
    v_brl  := nullif(v_h->>'amount_brl', '')::numeric;
    v_rate := nullif(v_h->>'fx_rate', '')::numeric;
    v_fees := coalesce(nullif(v_h->>'fees_eur', '')::numeric, 0);
    if v_eur is null or v_eur <= 0 then raise exception 'INVALID_AMOUNT'; end if;
    if v_fees < 0 or (v_brl is not null and v_brl < 0) or (v_rate is not null and v_rate <= 0) then raise exception 'INVALID_AMOUNT'; end if;
    if v_rate is null and v_brl is not null and v_brl > 0 then v_rate := round(v_brl / v_eur, 6); end if;  -- taxa efetiva
    if v_acc_cur is not null and v_acc_cur <> 'EUR' then raise exception 'HEITOR_ACCOUNT_MUST_BE_EUR'; end if;
    v_amount := v_eur + v_fees;
    v_cur := 'EUR';
    v_cat := coalesce(v_cat, public.fin_category_by_key(p_household, 'heitor.transferencias'));
    v_benef := coalesce(v_benef, (select id from public.fin_people where household_id = p_household and kind = 'beneficiary' and lower(name) = 'heitor' limit 1));
    v_desc := coalesce(v_desc, 'Envio para o Heitor');
  end if;

  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_desc is null then raise exception 'MISSING_DESCRIPTION'; end if;

  if v_type in ('transfer','savings') then
    if v_acc is null or v_to is null then raise exception 'TRANSFER_NEEDS_ACCOUNTS'; end if;
    if v_acc = v_to then raise exception 'TRANSFER_SAME_ACCOUNT'; end if;
    select currency, kind into v_to_cur, v_to_kind from public.fin_accounts where id = v_to;
    if v_to_cur <> v_acc_cur then raise exception 'TRANSFER_CURRENCY_MISMATCH'; end if;
    v_kind := case when v_type = 'savings' then 'savings'
                   when v_to_kind = 'credit_card' then 'card_payment'
                   when v_to_kind = 'savings' then 'savings'
                   else coalesce(nullif(p_payload->>'transfer_kind', ''), 'internal') end;
    if v_cat is not null then
      select kind into v_catkind from public.fin_categories where id = v_cat;
      if v_catkind <> 'savings' then v_cat := null; end if;   -- transferências não têm categoria de consumo
    end if;
    v_group := gen_random_uuid();
    insert into public.fin_transactions(household_id, client_id, nature, direction, status, amount, currency, date, description,
                                        category_id, account_id, person_id, notes, proof_path, transfer_group, transfer_kind, goal_id, created_by)
    values (p_household, p_client_id, 'transfer', 'out', v_status, v_amount, v_cur, v_date, v_desc, v_cat, v_acc, v_person,
            p_payload->>'notes', p_payload->>'proof_path', v_group, v_kind, v_goal, auth.uid())
    returning * into v_row;
    return next v_row;
    insert into public.fin_transactions(household_id, client_id, nature, direction, status, amount, currency, date, description,
                                        category_id, account_id, person_id, notes, transfer_group, transfer_kind, goal_id, created_by)
    values (p_household, p_client_id, 'transfer', 'in', v_status, v_amount, v_cur, v_date, v_desc, v_cat, v_to, v_person,
            p_payload->>'notes', v_group, v_kind, v_goal, auth.uid())
    returning * into v_row;
    return next v_row;
    perform public.audit(p_household, 'create', 'fin_transfer', v_group, jsonb_build_object('amount', v_amount, 'kind', v_kind));
    return;
  end if;

  -- Rendimento / despesa / Heitor
  if v_cat is not null then
    select kind into v_catkind from public.fin_categories where id = v_cat;
    if (v_type = 'income' and v_catkind <> 'income') or (v_type in ('expense','heitor') and v_catkind <> 'expense') then
      raise exception 'CATEGORY_KIND_MISMATCH';
    end if;
  end if;

  insert into public.fin_transactions(household_id, client_id, nature, direction, status, amount, currency, date, description,
                                      category_id, account_id, person_id, beneficiary_id, scope, payment_method, notes, proof_path, created_by)
  values (p_household, p_client_id, case when v_type = 'income' then 'income' else 'expense' end,
          case when v_type = 'income' then 'in' else 'out' end, v_status, v_amount, v_cur, v_date, v_desc,
          v_cat, v_acc, v_person, v_benef, v_scope, nullif(btrim(p_payload->>'payment_method'), ''), p_payload->>'notes',
          p_payload->>'proof_path', auth.uid())
  returning * into v_row;

  if v_type = 'heitor' then
    insert into public.fin_heitor_transfers(transaction_id, household_id, amount_eur, amount_brl, fx_rate, fees_eur, service, purpose)
    values (v_row.id, p_household, v_eur, v_brl, v_rate, v_fees, nullif(btrim(v_h->>'service'), ''), nullif(btrim(v_h->>'purpose'), ''));
  end if;
  return next v_row;
end $$;

-- =====================================================================
-- Edição, confirmação e cancelamento
-- =====================================================================
create or replace function public.fin_update_movement(p_id uuid, p_payload jsonb)
returns public.fin_transactions language plpgsql security definer set search_path = public as $$
declare
  v public.fin_transactions;
  v_amount numeric; v_cat uuid; v_catkind text; v_acc uuid; v_h jsonb := p_payload->'heitor';
  v_eur numeric; v_brl numeric; v_rate numeric; v_fees numeric; v_status text;
begin
  select * into v from public.fin_transactions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.assert_member(v.household_id);
  if v.status = 'cancelled' then raise exception 'MOVEMENT_CANCELLED'; end if;

  v_cat := case when p_payload ? 'category_id' then nullif(p_payload->>'category_id', '')::uuid else v.category_id end;
  v_acc := case when p_payload ? 'account_id' then nullif(p_payload->>'account_id', '')::uuid else v.account_id end;
  perform public.fin_assert_same_household(v.household_id, 'fin_categories', v_cat);
  perform public.fin_assert_same_household(v.household_id, 'fin_accounts', v_acc);
  if p_payload ? 'person_id' then perform public.fin_assert_same_household(v.household_id, 'fin_people', nullif(p_payload->>'person_id', '')::uuid); end if;
  if p_payload ? 'beneficiary_id' then perform public.fin_assert_same_household(v.household_id, 'fin_people', nullif(p_payload->>'beneficiary_id', '')::uuid); end if;
  if v_cat is not null and v.nature <> 'transfer' then
    select kind into v_catkind from public.fin_categories where id = v_cat;
    if v_catkind <> v.nature then raise exception 'CATEGORY_KIND_MISMATCH'; end if;
  end if;

  -- Movimentos de compras de supermercado: valor, data e estado vêm da compra (corrigir lá).
  if v.purchase_id is not null then
    update public.fin_transactions set
      category_id = v_cat, account_id = v_acc,
      person_id = case when p_payload ? 'person_id' then nullif(p_payload->>'person_id', '')::uuid else person_id end,
      scope = coalesce(nullif(p_payload->>'scope', ''), scope),
      payment_method = case when p_payload ? 'payment_method' then nullif(btrim(p_payload->>'payment_method'), '') else payment_method end,
      notes = case when p_payload ? 'notes' then p_payload->>'notes' else notes end,
      updated_by = auth.uid()
    where id = p_id returning * into v;
    return v;
  end if;

  v_status := coalesce(nullif(p_payload->>'status', ''), v.status);
  if v_status not in ('planned','pending','done') then raise exception 'INVALID_STATUS'; end if;
  v_amount := coalesce(nullif(p_payload->>'amount', '')::numeric, v.amount);

  if exists (select 1 from public.fin_heitor_transfers where transaction_id = p_id) and v_h is not null then
    v_eur := nullif(v_h->>'amount_eur', '')::numeric; v_brl := nullif(v_h->>'amount_brl', '')::numeric;
    v_rate := nullif(v_h->>'fx_rate', '')::numeric; v_fees := coalesce(nullif(v_h->>'fees_eur', '')::numeric, 0);
    if v_eur is null or v_eur <= 0 then raise exception 'INVALID_AMOUNT'; end if;
    if v_rate is null and v_brl is not null and v_brl > 0 then v_rate := round(v_brl / v_eur, 6); end if;
    update public.fin_heitor_transfers set amount_eur = v_eur, amount_brl = v_brl, fx_rate = v_rate, fees_eur = v_fees,
           service = nullif(btrim(v_h->>'service'), ''), purpose = nullif(btrim(v_h->>'purpose'), '')
     where transaction_id = p_id;
    v_amount := v_eur + v_fees;
  end if;
  if v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(nullif(p_payload->>'date', '')::date, v.date) > current_date and v_status = 'done' then raise exception 'FUTURE_DONE'; end if;

  if v.transfer_group is not null then
    -- Atualizar as duas pernas da transferência em conjunto (a conta de cada perna mantém-se).
    update public.fin_transactions set
      amount = v_amount, status = v_status,
      date = coalesce(nullif(p_payload->>'date', '')::date, date),
      description = coalesce(nullif(btrim(p_payload->>'description'), ''), description),
      notes = case when p_payload ? 'notes' then p_payload->>'notes' else notes end,
      goal_id = case when p_payload ? 'goal_id' then nullif(p_payload->>'goal_id', '')::uuid else goal_id end,
      updated_by = auth.uid()
    where transfer_group = v.transfer_group;
    select * into v from public.fin_transactions where id = p_id;
    return v;
  end if;

  update public.fin_transactions set
    amount = v_amount, status = v_status,
    date = coalesce(nullif(p_payload->>'date', '')::date, date),
    description = coalesce(nullif(btrim(p_payload->>'description'), ''), description),
    category_id = v_cat, account_id = v_acc,
    currency = coalesce((select currency from public.fin_accounts where id = v_acc), currency),
    person_id = case when p_payload ? 'person_id' then nullif(p_payload->>'person_id', '')::uuid else person_id end,
    beneficiary_id = case when p_payload ? 'beneficiary_id' then nullif(p_payload->>'beneficiary_id', '')::uuid else beneficiary_id end,
    scope = coalesce(nullif(p_payload->>'scope', ''), scope),
    payment_method = case when p_payload ? 'payment_method' then nullif(btrim(p_payload->>'payment_method'), '') else payment_method end,
    notes = case when p_payload ? 'notes' then p_payload->>'notes' else notes end,
    proof_path = case when p_payload ? 'proof_path' then nullif(p_payload->>'proof_path', '') else proof_path end,
    updated_by = auth.uid()
  where id = p_id returning * into v;
  return v;
end $$;

-- Confirmar que um valor previsto/pendente foi efetivamente recebido ou pago.
create or replace function public.fin_confirm_movement(p_id uuid, p_amount numeric default null, p_date date default null, p_account_id uuid default null)
returns public.fin_transactions language plpgsql security definer set search_path = public as $$
declare v public.fin_transactions;
begin
  select * into v from public.fin_transactions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.assert_member(v.household_id);
  if v.status = 'cancelled' then raise exception 'MOVEMENT_CANCELLED'; end if;
  if v.status = 'done' then return v; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(p_date, current_date) > current_date then raise exception 'FUTURE_DONE'; end if;
  perform public.fin_assert_same_household(v.household_id, 'fin_accounts', p_account_id);
  if v.transfer_group is not null then
    update public.fin_transactions set status = 'done', amount = coalesce(p_amount, amount), date = coalesce(p_date, least(date, current_date)), updated_by = auth.uid()
     where transfer_group = v.transfer_group;
  else
    update public.fin_transactions set status = 'done', amount = coalesce(p_amount, amount), date = coalesce(p_date, least(date, current_date)),
           account_id = coalesce(p_account_id, account_id), updated_by = auth.uid()
     where id = p_id;
  end if;
  select * into v from public.fin_transactions where id = p_id;
  return v;
end $$;

create or replace function public.fin_cancel_movement(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.fin_transactions;
begin
  select * into v from public.fin_transactions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.assert_member(v.household_id);
  if v.purchase_id is not null then raise exception 'CANCEL_VIA_PURCHASE'; end if;
  update public.fin_transactions
     set status = 'cancelled', updated_by = auth.uid(),
         notes = case when p_reason is not null then concat_ws(' · ', notes, 'Anulado: ' || p_reason) else notes end
   where id = p_id or (v.transfer_group is not null and transfer_group = v.transfer_group);
end $$;

-- =====================================================================
-- Integração com as compras de supermercado (sem duplicações)
-- =====================================================================
create or replace function public.purchases_to_finance()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cat uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'confirmed' then return new; end if;
    v_cat := public.fin_category_by_key(new.household_id, 'alimentacao.supermercado');
    insert into public.fin_transactions(household_id, nature, direction, status, amount, date, description, category_id,
                                        person_id, scope, payment_method, purchase_id, source, created_by)
    values (new.household_id, 'expense', 'out', 'done', greatest(new.total_paid, 0.01), new.purchased_at,
            'Supermercado · ' || new.store_name, v_cat, public.fin_person_of_user(new.household_id, new.created_by),
            'shared', new.payment_method, new.id, 'purchase', new.created_by)
    on conflict (purchase_id) where purchase_id is not null do nothing;
    return new;
  end if;
  -- UPDATE
  if new.status = 'voided' then
    update public.fin_transactions set status = 'cancelled', updated_by = auth.uid() where purchase_id = new.id;
  elsif new.total_paid > 0 then
    update public.fin_transactions
       set amount = new.total_paid, date = new.purchased_at, description = 'Supermercado · ' || new.store_name,
           status = 'done', updated_by = auth.uid()
     where purchase_id = new.id
       and (amount, date, description, status) is distinct from (new.total_paid, new.purchased_at, 'Supermercado · ' || new.store_name, 'done');
  end if;
  return new;
end $$;

create trigger purchases_to_finance
  after insert or update of status, total_paid, purchased_at, store_name on public.purchases
  for each row execute function public.purchases_to_finance();

-- Compras já existentes passam a constar nas finanças (uma única vez).
insert into public.fin_transactions(household_id, nature, direction, status, amount, date, description, category_id,
                                    person_id, scope, payment_method, purchase_id, source, created_by)
select p.household_id, 'expense', 'out', 'done', greatest(p.total_paid, 0.01), p.purchased_at, 'Supermercado · ' || p.store_name,
       public.fin_category_by_key(p.household_id, 'alimentacao.supermercado'), public.fin_person_of_user(p.household_id, p.created_by),
       'shared', p.payment_method, p.id, 'purchase', p.created_by
  from public.purchases p
 where p.status = 'confirmed'
on conflict (purchase_id) where purchase_id is not null do nothing;

-- =====================================================================
-- Recorrências: gerar ocorrências previstas (idempotente)
-- =====================================================================
create or replace function public.fin_next_date(d date, freq text, n int)
returns date language sql immutable as $$
  select case freq
    when 'weekly'  then d + (7 * n)
    when 'monthly' then (d + make_interval(months => n))::date
    when 'yearly'  then (d + make_interval(years => n))::date
    else d + n end
$$;

create or replace function public.fin_generate_recurring(p_household uuid, p_horizon_days int default 45)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; v_d date; v_n int := 0; v_until date := current_date + p_horizon_days; v_guard int;
begin
  perform public.assert_member(p_household);
  for r in select * from public.fin_recurring where household_id = p_household and active for update loop
    v_d := r.next_due; v_guard := 0;
    while v_d <= v_until and (r.end_date is null or v_d <= r.end_date) and v_guard < 120 loop
      insert into public.fin_transactions(household_id, nature, direction, status, amount, date, description, category_id,
                                          account_id, person_id, beneficiary_id, recurring_id, source, created_by)
      values (p_household, r.type, case when r.type = 'income' then 'in' else 'out' end, 'planned', r.amount, v_d, r.description,
              r.category_id, r.account_id, r.person_id, r.beneficiary_id, r.id, 'recurring', r.created_by)
      on conflict (recurring_id, date) where recurring_id is not null do nothing;
      if found then v_n := v_n + 1; end if;
      v_d := public.fin_next_date(v_d, r.frequency, r.interval_n);
      v_guard := v_guard + 1;
    end loop;
    update public.fin_recurring set next_due = v_d where id = r.id and next_due <> v_d;
  end loop;
  return v_n;
end $$;

-- =====================================================================
-- Orçamentos: valor em vigor, gasto e alertas
-- =====================================================================
create or replace function public.fin_category_tree(p_cat uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p_cat union select id from public.fin_categories where parent_id = p_cat;
$$;

create or replace function public.fin_budget_status(p_household uuid, p_month date)
returns table(budget_id uuid, scope text, category_id uuid, person_id uuid, amount numeric, spent numeric, planned numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date;
begin
  perform public.assert_member(p_household);
  return query
  with current_budgets as (
    select distinct on (b.scope, b.category_id, b.person_id) b.*
      from public.fin_budgets b
     where b.household_id = p_household and b.month <= v_m
     order by b.scope, b.category_id, b.person_id, b.month desc
  ), tx as (
    select t.* from public.fin_transactions t
     where t.household_id = p_household and t.nature = 'expense' and t.currency = 'EUR'
       and t.date >= v_m and t.date < (v_m + interval '1 month')
  )
  select b.id, b.scope, b.category_id, b.person_id, b.amount,
         coalesce((select sum(t.amount) from tx t where t.status = 'done' and (
            b.scope = 'total'
            or (b.scope = 'category' and t.category_id in (select public.fin_category_tree(b.category_id)))
            or (b.scope = 'person' and coalesce(t.beneficiary_id, t.person_id) = b.person_id and t.scope = 'individual'))), 0),
         coalesce((select sum(t.amount) from tx t where t.status in ('planned','pending') and (
            b.scope = 'total'
            or (b.scope = 'category' and t.category_id in (select public.fin_category_tree(b.category_id)))
            or (b.scope = 'person' and coalesce(t.beneficiary_id, t.person_id) = b.person_id and t.scope = 'individual'))), 0)
    from current_budgets b
   where b.amount > 0;
end $$;

create or replace function public.fin_check_budget_alerts(p_household uuid, p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_t int; v_pct numeric; v_label text; v_month date := date_trunc('month', p_month)::date;
  v_thresholds int[];
begin
  select budget_alert_thresholds into v_thresholds from public.households where id = p_household;
  for r in
    with current_budgets as (
      select distinct on (b.scope, b.category_id, b.person_id) b.*
        from public.fin_budgets b where b.household_id = p_household and b.month <= v_month
       order by b.scope, b.category_id, b.person_id, b.month desc)
    select b.*, coalesce((select sum(t.amount) from public.fin_transactions t
       where t.household_id = p_household and t.nature = 'expense' and t.status = 'done' and t.currency = 'EUR'
         and t.date >= v_month and t.date < (v_month + interval '1 month')
         and (b.scope = 'total'
           or (b.scope = 'category' and t.category_id in (select public.fin_category_tree(b.category_id)))
           or (b.scope = 'person' and coalesce(t.beneficiary_id, t.person_id) = b.person_id and t.scope = 'individual'))), 0) as spent
      from current_budgets b where b.amount > 0
  loop
    v_pct := r.spent / r.amount * 100;
    v_label := case r.scope when 'total' then 'orçamento familiar'
                 when 'category' then 'orçamento de ' || (select name from public.fin_categories where id = r.category_id)
                 else 'orçamento de ' || (select name from public.fin_people where id = r.person_id) end;
    foreach v_t in array coalesce(v_thresholds, '{50,75,90,100}') loop
      if v_pct >= v_t then
        insert into public.notifications(household_id, kind, title, body, link, dedupe_key)
        values (p_household, 'budget',
                case when v_t >= 100 then initcap(left(v_label, 1)) || substr(v_label, 2) || ' ultrapassado'
                     else format('Já utilizaram %s%% do %s', v_t, v_label) end,
                format('Gasto: %s € de %s €.', to_char(r.spent, 'FM9999990D00'), to_char(r.amount, 'FM9999990D00')),
                '/financas/orcamento',
                format('finbudget:%s:%s:%s:%s', to_char(v_month, 'YYYY-MM'), r.scope, coalesce(r.category_id, r.person_id, r.household_id), v_t))
        on conflict (household_id, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.fin_tx_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nature = 'expense' and new.status = 'done' and new.date >= date_trunc('month', current_date) - interval '1 month' then
    perform public.fin_check_budget_alerts(new.household_id, new.date);
  end if;
  return new;
end $$;
create trigger fin_tx_after_change after insert or update of status, amount, date, category_id on public.fin_transactions
  for each row execute function public.fin_tx_after_change();

-- Alertas de vencimento (gerados ao abrir a app; deduplicados por dia)
create or replace function public.fin_refresh_due_notifications(p_household uuid, p_days int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int; v_over int; v_total numeric;
begin
  perform public.assert_member(p_household);
  perform public.fin_generate_recurring(p_household);
  select count(*) filter (where date >= current_date), count(*) filter (where date < current_date),
         coalesce(sum(amount), 0)
    into v_n, v_over, v_total
    from public.fin_transactions
   where household_id = p_household and direction = 'out' and nature = 'expense'
     and status in ('planned','pending') and date <= current_date + p_days;
  if v_n + v_over > 0 then
    insert into public.notifications(household_id, kind, title, body, link, dedupe_key)
    values (p_household, 'bill',
            case when v_over > 0 then format('%s pagamento(s) em atraso', v_over)
                 else format('%s pagamento(s) a vencer nos próximos %s dias', v_n, p_days) end,
            format('Total: %s €. Confirmem quando estiverem pagos.', to_char(v_total, 'FM9999990D00')),
            '/financas/calendario', format('bills:%s:%s:%s', current_date, v_n, v_over))
    on conflict (household_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_n + v_over;
end $$;

-- =====================================================================
-- Importação de extratos: duplicados e confirmação
-- p_rows: [{ key, date, description, amount, direction, action: 'create'|'skip'|'link',
--            nature: income|expense|transfer, category_id, link_id, to_account_id, person_id }]
-- =====================================================================
create or replace function public.fin_find_duplicates(p_household uuid, p_rows jsonb, p_days int default 3)
returns table(key text, transaction_id uuid, date date, amount numeric, description text, source text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_member(p_household);
  return query
  select r->>'key', t.id, t.date, t.amount, t.description, t.source
    from jsonb_array_elements(p_rows) r
    join public.fin_transactions t
      on t.household_id = p_household and t.status <> 'cancelled'
     and t.amount = abs((r->>'amount')::numeric)
     and t.direction = coalesce(r->>'direction', case when (r->>'amount')::numeric < 0 then 'out' else 'in' end)
     and t.date between (r->>'date')::date - p_days and (r->>'date')::date + p_days;
end $$;

create or replace function public.fin_import_movements(p_household uuid, p_import jsonb, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_imp uuid; v_acc uuid := nullif(p_import->>'account_id', '')::uuid; r jsonb;
  v_created int := 0; v_linked int := 0; v_skipped int := 0; v_nature text; v_dir text; v_amount numeric;
  v_payload jsonb; v_cid uuid;
begin
  perform public.assert_member(p_household);
  perform public.fin_assert_same_household(p_household, 'fin_accounts', v_acc);
  if v_acc is null then raise exception 'IMPORT_NEEDS_ACCOUNT'; end if;
  if exists (select 1 from public.fin_imports where household_id = p_household and file_sha256 = p_import->>'file_sha256') then
    raise exception 'IMPORT_ALREADY_DONE';
  end if;
  insert into public.fin_imports(household_id, file_name, file_sha256, file_path, account_id, row_count, created_by)
  values (p_household, p_import->>'file_name', nullif(p_import->>'file_sha256', ''), p_import->>'file_path', v_acc,
          jsonb_array_length(p_rows), auth.uid())
  returning id into v_imp;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_amount := abs((r->>'amount')::numeric);
    v_dir := coalesce(r->>'direction', case when (r->>'amount')::numeric < 0 then 'out' else 'in' end);
    if r->>'action' = 'skip' then v_skipped := v_skipped + 1; continue; end if;
    if r->>'action' = 'link' then
      -- O movimento já existe (ex. fatura de supermercado): apenas completar a conta.
      update public.fin_transactions set account_id = coalesce(account_id, v_acc), import_id = coalesce(import_id, v_imp), updated_by = auth.uid()
       where id = (r->>'link_id')::uuid and household_id = p_household;
      v_linked := v_linked + 1; continue;
    end if;
    v_nature := r->>'nature';
    if coalesce(v_nature, '') not in ('income','expense','transfer') then raise exception 'IMPORT_ROW_NEEDS_NATURE' using detail = coalesce(r->>'description', '?'); end if;
    if (v_nature = 'income' and v_dir <> 'in') or (v_nature = 'expense' and v_dir <> 'out') then raise exception 'IMPORT_DIRECTION_MISMATCH' using detail = coalesce(r->>'description', '?'); end if;
    v_cid := gen_random_uuid();
    if v_nature = 'transfer' then
      v_payload := jsonb_build_object('type', 'transfer', 'status', 'done', 'amount', v_amount, 'date', r->>'date', 'description', r->>'description',
        'account_id', case when v_dir = 'out' then v_acc else nullif(r->>'to_account_id', '')::uuid end,
        'to_account_id', case when v_dir = 'out' then nullif(r->>'to_account_id', '')::uuid else v_acc end,
        'category_id', r->>'category_id');
    else
      v_payload := jsonb_build_object('type', v_nature, 'status', 'done', 'amount', v_amount, 'date', r->>'date', 'description', r->>'description',
        'account_id', v_acc, 'category_id', r->>'category_id', 'person_id', r->>'person_id', 'scope', coalesce(r->>'scope', 'shared'));
    end if;
    perform public.fin_create_movement(p_household, v_cid, v_payload);
    update public.fin_transactions set source = 'import', import_id = v_imp where household_id = p_household and client_id = v_cid;
    v_created := v_created + 1;
  end loop;
  update public.fin_imports set row_count = v_created + v_linked where id = v_imp;
  perform public.audit(p_household, 'import', 'fin_import', v_imp, jsonb_build_object('created', v_created, 'linked', v_linked, 'skipped', v_skipped));
  return jsonb_build_object('import_id', v_imp, 'created', v_created, 'linked', v_linked, 'skipped', v_skipped);
end $$;

-- =====================================================================
-- Vistas de leitura (respeitam RLS)
-- =====================================================================
create view public.fin_account_balances with (security_invoker = true) as
select a.id, a.household_id, a.name, a.kind, a.currency, a.owner_person_id, a.institution, a.archived, a.reserved_amount,
       a.opening_balance,
       a.opening_balance + coalesce(sum(case when t.status = 'done' and t.direction = 'in'  then t.amount
                                             when t.status = 'done' and t.direction = 'out' then -t.amount end), 0) as balance,
       coalesce(sum(case when t.status in ('planned','pending') and t.direction = 'out'
                          and t.date <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date then t.amount end), 0) as pending_out,
       coalesce(sum(case when t.status in ('planned','pending') and t.direction = 'in'
                          and t.date <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date then t.amount end), 0) as pending_in
  from public.fin_accounts a
  left join public.fin_transactions t on t.account_id = a.id and t.date >= a.opening_date and t.status <> 'cancelled'
 group by a.id;

create view public.fin_goal_progress with (security_invoker = true) as
select g.*,
       g.initial_amount + coalesce((select sum(case when t.direction = 'in' then t.amount else -t.amount end)
                                      from public.fin_transactions t
                                     where t.goal_id = g.id and t.status = 'done' and t.nature = 'transfer'
                                       and (g.account_id is null or t.account_id = g.account_id)), 0) as accumulated
  from public.fin_goals g;

-- =====================================================================
-- Segurança
-- =====================================================================
alter table public.fin_people           enable row level security;
alter table public.fin_accounts         enable row level security;
alter table public.fin_categories       enable row level security;
alter table public.fin_goals            enable row level security;
alter table public.fin_recurring        enable row level security;
alter table public.fin_imports          enable row level security;
alter table public.fin_transactions     enable row level security;
alter table public.fin_heitor_transfers enable row level security;
alter table public.fin_budgets          enable row level security;

revoke all on public.fin_people, public.fin_accounts, public.fin_categories, public.fin_goals, public.fin_recurring,
              public.fin_imports, public.fin_transactions, public.fin_heitor_transfers, public.fin_budgets,
              public.fin_account_balances, public.fin_goal_progress from anon, authenticated;
grant select on public.fin_people, public.fin_accounts, public.fin_categories, public.fin_goals, public.fin_recurring,
               public.fin_imports, public.fin_transactions, public.fin_heitor_transfers, public.fin_budgets,
               public.fin_account_balances, public.fin_goal_progress to authenticated;

do $$
declare t text;
begin
  foreach t in array array['fin_people','fin_accounts','fin_categories','fin_goals','fin_recurring','fin_imports',
                           'fin_transactions','fin_heitor_transfers','fin_budgets']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_household_member(household_id))', t || '_select', t);
  end loop;
  -- Tabelas de configuração: escrita direta por membros (com auditoria por trigger)
  foreach t in array array['fin_people','fin_accounts','fin_categories','fin_goals','fin_recurring','fin_budgets']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_household_member(household_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))', t || '_update', t);
  end loop;
end $$;

grant insert (id, household_id, name, kind) on public.fin_people to authenticated;
grant update (name, archived) on public.fin_people to authenticated;
grant insert (id, household_id, name, kind, owner_person_id, institution, currency, opening_balance, opening_date, reserved_amount, sort) on public.fin_accounts to authenticated;
grant update (name, kind, owner_person_id, institution, opening_balance, opening_date, reserved_amount, archived, sort) on public.fin_accounts to authenticated;
grant insert (id, household_id, kind, parent_id, name, sort) on public.fin_categories to authenticated;
grant update (name, sort, archived) on public.fin_categories to authenticated;
grant insert (id, household_id, name, target_amount, initial_amount, start_date, deadline, account_id, notes) on public.fin_goals to authenticated;
grant update (name, target_amount, initial_amount, start_date, deadline, account_id, notes, archived) on public.fin_goals to authenticated;
grant insert (id, household_id, type, description, amount, category_id, account_id, person_id, beneficiary_id, frequency, interval_n, next_due, end_date, active, notes, created_by) on public.fin_recurring to authenticated;
grant update (description, amount, category_id, account_id, person_id, beneficiary_id, frequency, interval_n, next_due, end_date, active, notes) on public.fin_recurring to authenticated;
grant insert (id, household_id, month, scope, category_id, person_id, amount, created_by) on public.fin_budgets to authenticated;
grant update (amount) on public.fin_budgets to authenticated;
grant delete on public.fin_budgets to authenticated;
create policy fin_budgets_delete on public.fin_budgets for delete to authenticated using (public.is_household_member(household_id));
-- fin_transactions, fin_heitor_transfers e fin_imports: escrita só pelas funções (validação + atomicidade).

grant execute on function
  public.fin_create_movement(uuid, uuid, jsonb),
  public.fin_update_movement(uuid, jsonb),
  public.fin_confirm_movement(uuid, numeric, date, uuid),
  public.fin_cancel_movement(uuid, text),
  public.fin_generate_recurring(uuid, int),
  public.fin_budget_status(uuid, date),
  public.fin_refresh_due_notifications(uuid, int),
  public.fin_find_duplicates(uuid, jsonb, int),
  public.fin_import_movements(uuid, jsonb, jsonb),
  public.fin_category_tree(uuid),
  public.fin_next_date(date, text, int)
to authenticated;
revoke all on function public.audit_row(), public.fin_seed(uuid), public.seed_household_finance_trigger(),
                       public.purchases_to_finance(), public.fin_check_budget_alerts(uuid, date), public.fin_tx_after_change(),
                       public.fin_person_of_user(uuid, uuid), public.fin_category_by_key(uuid, text),
                       public.fin_assert_same_household(uuid, text, uuid)
  from public, anon, authenticated;

-- Comprovativos e extratos: balde privado, por casa
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-docs', 'finance-docs', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/webp','text/csv','text/plain','application/vnd.ms-excel'])
on conflict (id) do nothing;
create policy storage_finance_read on storage.objects for select to authenticated
  using (bucket_id = 'finance-docs' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy storage_finance_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and public.is_household_member(((storage.foldername(name))[1])::uuid));

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['fin_transactions','fin_accounts','fin_categories','fin_goals','fin_recurring','fin_budgets','fin_people','fin_heitor_transfers']
    loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
