-- =====================================================================
-- CASA EM STOCK — lógica de negócio (funções transacionais e triggers)
-- Todas as funções "security definer" validam explicitamente que o
-- utilizador pertence à casa antes de ler ou escrever.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Autorização
-- ---------------------------------------------------------------------

create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members
                 where household_id = hid and user_id = auth.uid());
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members
                 where household_id = hid and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.assert_member(hid uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if hid is null or not public.is_household_member(hid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

create or replace function public.audit(p_household uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(household_id, user_id, action, entity, entity_id, details)
  values (p_household, auth.uid(), p_action, p_entity, p_entity_id, p_details);
$$;

-- ---------------------------------------------------------------------
-- Perfil automático quando uma conta é criada
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, email)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Casas, membros e convites
-- ---------------------------------------------------------------------

create or replace function public.seed_household(hid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
begin
  for g in
    select * from (values
      ('Alimentação', array['Arroz e massas','Leguminosas','Cereais','Farinhas','Conservas','Óleos e azeites',
                            'Temperos','Açúcar e adoçantes','Café e bebidas','Leite e derivados','Ovos','Carnes',
                            'Peixes e mariscos','Frutas','Legumes e verduras','Congelados','Snacks e bolachas',
                            'Outros alimentos'], 1),
      ('Higiene pessoal', array['Champô e condicionador','Gel de banho','Sabonetes','Pasta de dentes',
                                'Escovas de dentes','Desodorizantes','Papel higiénico','Higiene feminina',
                                'Fraldas e toalhitas','Outros'], 2),
      ('Limpeza', array['Detergente da roupa','Amaciador','Detergente da loiça','Detergente da máquina','Lixívia',
                        'Desinfetantes','Limpa-vidros','Limpeza geral','Sacos do lixo','Outros'], 3),
      ('Casa', array['Papel de cozinha','Guardanapos','Pilhas','Lâmpadas','Outros consumíveis'], 4)
    ) as t(grp, names, gsort)
  loop
    insert into public.categories(household_id, grp, name, sort)
    select hid, g.grp, n, g.gsort * 100 + ord
    from unnest(g.names) with ordinality as u(n, ord)
    on conflict do nothing;
  end loop;

  insert into public.locations(household_id, name, sort)
  select hid, n, ord
  from unnest(array['Despensa','Frigorífico','Congelador','Armário da cozinha','Casa de banho','Lavandaria','Outros'])
       with ordinality as u(n, ord)
  on conflict do nothing;

  insert into public.shopping_lists(household_id, name, is_default) values (hid, 'Lista principal', true)
  on conflict do nothing;
end $$;

create or replace function public.create_household(p_name text default 'A Nossa Casa')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  insert into public.households(name, created_by) values (coalesce(nullif(btrim(p_name), ''), 'A Nossa Casa'), auth.uid())
  returning id into v_id;
  insert into public.household_members(household_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform public.seed_household(v_id);
  perform public.audit(v_id, 'create', 'household', v_id, jsonb_build_object('name', p_name));
  return v_id;
end $$;

create or replace function public.create_invite(p_household uuid, p_email text)
returns public.household_invites language plpgsql security definer set search_path = public as $$
declare
  v_inv public.household_invites;
begin
  perform public.assert_member(p_household);
  if not public.is_household_owner(p_household) then
    raise exception 'ONLY_OWNER_CAN_INVITE' using errcode = '42501';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  insert into public.household_invites(household_id, email, created_by)
  values (p_household, lower(btrim(p_email)), auth.uid())
  returning * into v_inv;
  perform public.audit(p_household, 'invite', 'household_invite', v_inv.id, jsonb_build_object('email', v_inv.email));
  return v_inv;
end $$;

-- Pré-visualização do convite (antes de aceitar) — não revela dados da casa além do nome.
create or replace function public.invite_info(p_token text)
returns table(household_name text, email text, valid boolean)
language sql stable security definer set search_path = public as $$
  select h.name, i.email,
         (i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
  from public.household_invites i
  join public.households h on h.id = i.household_id
  where i.token = p_token;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv   public.household_invites;
  v_email text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select * into v_inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.revoked_at is not null or v_inv.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = auth.uid() then return v_inv.household_id; end if;
    raise exception 'INVITE_ALREADY_USED';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from v_inv.email then
    raise exception 'INVITE_EMAIL_MISMATCH' using detail = v_inv.email;
  end if;
  insert into public.household_members(household_id, user_id, role)
  values (v_inv.household_id, auth.uid(), 'member')
  on conflict do nothing;
  update public.household_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  perform public.audit(v_inv.household_id, 'join', 'household_member', auth.uid(), null);
  return v_inv.household_id;
end $$;

-- ---------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------

create or replace function public.create_product(
  p_household     uuid,
  p_name          text,
  p_brand         text default null,
  p_category_id   uuid default null,
  p_location_id   uuid default null,
  p_unit          text default 'un',
  p_quantity      numeric default 0,
  p_min_quantity  numeric default 0,
  p_ideal_quantity numeric default 0,
  p_expires_on    date default null,
  p_notes         text default null,
  p_package_size  numeric default null,
  p_package_unit  text default null,
  p_auto_restock  boolean default true,
  p_photo_path    text default null,
  p_id            uuid default null
) returns public.products language plpgsql security definer set search_path = public as $$
declare
  v_prod public.products;
begin
  perform public.assert_member(p_household);
  if p_id is not null then
    select * into v_prod from public.products where id = p_id;
    if found then
      if v_prod.household_id <> p_household then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
      return v_prod;  -- idempotente
    end if;
  end if;
  if coalesce(p_quantity, 0) < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id and household_id = p_household) then
    raise exception 'INVALID_CATEGORY';
  end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id = p_location_id and household_id = p_household) then
    raise exception 'INVALID_LOCATION';
  end if;

  insert into public.products(id, household_id, name, brand, category_id, location_id, unit, quantity,
                              min_quantity, ideal_quantity, notes, package_size, package_unit,
                              auto_restock, photo_path, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_household, btrim(p_name), nullif(btrim(p_brand), ''), p_category_id, p_location_id,
          coalesce(nullif(p_unit, ''), 'un'), 0, coalesce(p_min_quantity, 0),
          greatest(coalesce(p_ideal_quantity, 0), coalesce(p_min_quantity, 0)),
          p_notes, p_package_size, p_package_unit, coalesce(p_auto_restock, true), p_photo_path, auth.uid())
  returning * into v_prod;

  if coalesce(p_quantity, 0) > 0 then
    perform public._apply_movement(gen_random_uuid(), v_prod.id, 'in', p_quantity, 'initial', now(), true, p_expires_on, null, null);
    select * into v_prod from public.products where id = v_prod.id;
  end if;

  perform public.audit(p_household, 'create', 'product', v_prod.id, jsonb_build_object('name', v_prod.name));
  return v_prod;
end $$;

-- ---------------------------------------------------------------------
-- Movimentos de stock
-- ---------------------------------------------------------------------

-- Função interna (sem verificação de permissões — só chamada por funções que já verificaram).
create or replace function public._apply_movement(
  p_id uuid, p_product_id uuid, p_direction text, p_quantity numeric, p_reason text,
  p_occurred_at timestamptz, p_allow_negative boolean, p_expires_on date, p_note text, p_purchase_id uuid
) returns public.stock_movements language plpgsql security definer set search_path = public as $$
declare
  v_prod public.products;
  v_mov  public.stock_movements;
  v_new  numeric;
  v_left numeric;
  v_lot  record;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_direction not in ('in','out') then raise exception 'INVALID_DIRECTION'; end if;
  if p_direction = 'in'  and p_reason not in ('purchase','gift','correction','initial') then raise exception 'INVALID_REASON'; end if;
  if p_direction = 'out' and p_reason not in ('consumption','waste','expired','gift','correction','void') then raise exception 'INVALID_REASON'; end if;

  select * into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  v_new := v_prod.quantity + case when p_direction = 'in' then p_quantity else -p_quantity end;
  if v_new < 0 and not coalesce(p_allow_negative, false) then
    raise exception 'NEGATIVE_STOCK' using detail = v_prod.quantity::text, errcode = 'P0001';
  end if;

  insert into public.stock_movements(id, household_id, product_id, direction, quantity, reason, note,
                                     occurred_at, purchase_id, balance_after, user_id)
  values (p_id, v_prod.household_id, p_product_id, p_direction, p_quantity, p_reason, p_note,
          coalesce(p_occurred_at, now()), p_purchase_id, v_new, auth.uid())
  returning * into v_mov;

  update public.products
     set quantity    = v_new,
         last_in_at  = case when p_direction = 'in'  then greatest(coalesce(last_in_at,  '-infinity'), v_mov.occurred_at) else last_in_at end,
         last_out_at = case when p_direction = 'out' then greatest(coalesce(last_out_at, '-infinity'), v_mov.occurred_at) else last_out_at end
   where id = p_product_id;

  -- Lotes com validade
  if p_direction = 'in' and p_expires_on is not null then
    insert into public.inventory_lots(household_id, product_id, quantity, expires_on)
    values (v_prod.household_id, p_product_id, p_quantity, p_expires_on);
  elsif p_direction = 'out' then
    v_left := p_quantity;
    -- primeiro a expirar, primeiro a sair (FEFO)
    for v_lot in select id, quantity from public.inventory_lots
                  where product_id = p_product_id and quantity > 0
                  order by expires_on, created_at for update
    loop
      exit when v_left <= 0;
      if v_lot.quantity <= v_left then
        update public.inventory_lots set quantity = 0 where id = v_lot.id;
        v_left := v_left - v_lot.quantity;
      else
        update public.inventory_lots set quantity = quantity - v_left where id = v_lot.id;
        v_left := 0;
      end if;
    end loop;
  end if;

  -- Os lotes nunca podem somar mais do que o stock total.
  -- (mantêm-se os lotes que expiram primeiro, por precaução)
  with lots as (
    select id, quantity, sum(quantity) over (order by expires_on, created_at) as acc
    from public.inventory_lots where product_id = p_product_id and quantity > 0
  )
  update public.inventory_lots l
     set quantity = greatest(0, lots.quantity - (lots.acc - greatest(v_new, 0)))
    from lots
   where l.id = lots.id and lots.acc > greatest(v_new, 0);

  return v_mov;
end $$;

create or replace function public.record_movement(
  p_id             uuid,
  p_product_id     uuid,
  p_direction      text,
  p_quantity       numeric,
  p_reason         text default null,
  p_occurred_at    timestamptz default null,
  p_allow_negative boolean default false,
  p_expires_on     date default null,
  p_note           text default null
) returns public.stock_movements language plpgsql security definer set search_path = public as $$
declare
  v_mov public.stock_movements;
  v_hid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  if p_id is null then raise exception 'MISSING_ID'; end if;

  -- Idempotência: um movimento repetido (ex. reenvio offline) devolve o original.
  select * into v_mov from public.stock_movements where id = p_id;
  if found then
    perform public.assert_member(v_mov.household_id);
    return v_mov;
  end if;

  select household_id into v_hid from public.products where id = p_product_id;
  perform public.assert_member(v_hid);

  v_mov := public._apply_movement(
    p_id, p_product_id, p_direction, p_quantity,
    coalesce(p_reason, case when p_direction = 'in' then 'purchase' else 'consumption' end),
    p_occurred_at, p_allow_negative, p_expires_on, p_note, null);
  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- Lista de compras automática
-- ---------------------------------------------------------------------

create or replace function public.default_list_id(hid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.shopping_lists where household_id = hid and is_default limit 1;
$$;

create or replace function public.products_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_list  uuid;
  v_needs boolean;
  v_was   boolean;
begin
  v_list  := public.default_list_id(new.household_id);
  v_needs := new.auto_restock and not new.archived and new.quantity <= new.min_quantity;

  if v_list is not null then
    if v_needs then
      insert into public.shopping_list_items(list_id, household_id, product_id, source, status)
      values (v_list, new.household_id, new.id, 'auto', 'open')
      on conflict (list_id, product_id) where product_id is not null and status in ('open','dismissed') do nothing;
    else
      -- Reposto (ou deixou de ser acompanhado): sai da lista automática.
      delete from public.shopping_list_items
       where list_id = v_list and product_id = new.id and source = 'auto' and status in ('open','dismissed');
    end if;
  end if;

  -- Notificações apenas na transição de estado
  if tg_op = 'UPDATE' and not new.archived and new.auto_restock then
    v_was := old.quantity <= old.min_quantity;
    if new.quantity <= 0 and old.quantity > 0 then
      insert into public.notifications(household_id, kind, title, body, link)
      values (new.household_id, 'out_of_stock', format('%s esgotou', new.name),
              'Foi adicionado à lista de compras como prioritário.', '/stock/' || new.id);
    elsif v_needs and not v_was then
      insert into public.notifications(household_id, kind, title, body, link)
      values (new.household_id, 'low_stock', format('%s está a acabar', new.name),
              format('Restam %s %s.', trim(trailing '.' from trim(trailing '0' from new.quantity::text)), new.unit),
              '/stock/' || new.id);
    end if;
  end if;
  return new;
end $$;

create trigger products_after_change
  after insert or update of quantity, min_quantity, auto_restock, archived on public.products
  for each row execute function public.products_after_change();

-- ---------------------------------------------------------------------
-- Preços dos produtos
-- ---------------------------------------------------------------------

create or replace function public.refresh_product_prices(p_product_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.products pr
     set last_price = s.last_price,
         avg_price  = s.avg_price
    from (
      select (select round(pi.line_total / pi.quantity, 4)
                from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id
               where pi.product_id = p_product_id and p.status = 'confirmed'
               order by p.purchased_at desc, p.created_at desc limit 1) as last_price,
             (select round(sum(pi.line_total) / nullif(sum(pi.quantity), 0), 4)
                from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id
               where pi.product_id = p_product_id and p.status = 'confirmed' and pi.line_total > 0) as avg_price
    ) s
   where pr.id = p_product_id;
$$;

-- ---------------------------------------------------------------------
-- Orçamento e alertas
-- ---------------------------------------------------------------------

create or replace function public.budget_for(hid uuid, p_month date)
returns numeric language sql stable security definer set search_path = public as $$
  select amount from public.monthly_budgets
   where household_id = hid and month <= date_trunc('month', p_month)::date
   order by month desc limit 1;
$$;

create or replace function public.check_budget_alerts(hid uuid, p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_budget numeric;
  v_spent  numeric;
  v_pct    numeric;
  v_t      int;
  v_month  date := date_trunc('month', p_month)::date;
begin
  v_budget := public.budget_for(hid, v_month);
  if v_budget is null or v_budget <= 0 then return; end if;
  select coalesce(sum(total_paid), 0) into v_spent from public.purchases
   where household_id = hid and status = 'confirmed'
     and purchased_at >= v_month and purchased_at < (v_month + interval '1 month');
  v_pct := v_spent / v_budget * 100;
  foreach v_t in array (select budget_alert_thresholds from public.households where id = hid)
  loop
    if v_pct >= v_t then
      insert into public.notifications(household_id, kind, title, body, link, dedupe_key)
      values (hid, 'budget',
              case when v_t >= 100 then 'Orçamento mensal ultrapassado'
                   else format('Já utilizaram %s%% do orçamento mensal', v_t) end,
              format('Gasto: %s € de %s €.', to_char(v_spent, 'FM999990D00'), to_char(v_budget, 'FM999990D00')),
              '/despesas/orcamento',
              format('budget:%s:%s', to_char(v_month, 'YYYY-MM'), v_t))
      on conflict (household_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Confirmação de compra (fatura ou registo manual) — TRANSAÇÃO ÚNICA
-- ---------------------------------------------------------------------
-- p_payload:
-- {
--   "store_name": "Mercadona", "purchased_at": "2026-11-23", "total_paid": 16.99,
--   "document_number": "ATCUD:XXXX-123", "discount_total": 0.5, "payment_method": "cartão",
--   "items": [
--     { "name": "Leite meio-gordo", "raw_text": "LEITE M/G 1L", "quantity": 6, "unit_price": 0.99,
--       "line_total": 5.94, "discount": 0, "category_id": null,
--       "product_id": "<uuid>" | null,
--       "create_product": { "name": "...", "category_id": null, "location_id": null, "unit": "un",
--                           "min_quantity": 1, "ideal_quantity": 4 } | null,
--       "add_to_stock": true, "stock_quantity": 6, "expires_on": null }
--   ]
-- }
create or replace function public.confirm_purchase(
  p_household       uuid,
  p_client_id       uuid,
  p_payload         jsonb,
  p_receipt_id      uuid default null,
  p_allow_duplicate boolean default false
) returns public.purchases language plpgsql security definer set search_path = public as $$
declare
  v_purchase  public.purchases;
  v_receipt   public.receipts;
  v_item      jsonb;
  v_pid       uuid;
  v_cp        jsonb;
  v_qty       numeric;
  v_stock_qty numeric;
  v_total     numeric;
  v_items_sum numeric := 0;
  v_store     text;
  v_date      date;
  v_doc       text;
  v_prod      public.products;
  v_dup       uuid;
  v_touched   uuid[] := '{}';
begin
  perform public.assert_member(p_household);
  if p_client_id is null then raise exception 'MISSING_ID'; end if;

  -- Idempotência
  select * into v_purchase from public.purchases where household_id = p_household and client_id = p_client_id;
  if found then return v_purchase; end if;

  v_store := nullif(btrim(p_payload->>'store_name'), '');
  v_date  := (p_payload->>'purchased_at')::date;
  v_total := (p_payload->>'total_paid')::numeric;
  v_doc   := nullif(btrim(p_payload->>'document_number'), '');
  if v_store is null then raise exception 'MISSING_STORE'; end if;
  if v_date is null then raise exception 'MISSING_DATE'; end if;
  if v_date > current_date + 1 then raise exception 'FUTURE_DATE'; end if;
  if v_total is null or v_total < 0 then raise exception 'INVALID_TOTAL'; end if;
  if jsonb_typeof(coalesce(p_payload->'items', '[]'::jsonb)) <> 'array' then raise exception 'INVALID_ITEMS'; end if;

  -- Fatura: bloquear e validar estado
  if p_receipt_id is not null then
    select * into v_receipt from public.receipts where id = p_receipt_id for update;
    if not found or v_receipt.household_id <> p_household then raise exception 'RECEIPT_NOT_FOUND'; end if;
    if v_receipt.status = 'confirmed' then raise exception 'RECEIPT_ALREADY_CONFIRMED'; end if;
    if v_receipt.status in ('discarded') then raise exception 'RECEIPT_DISCARDED'; end if;
  end if;

  -- Duplicados: mesmo número de documento na mesma cadeia → bloqueio absoluto
  if v_doc is not null then
    select id into v_dup from public.purchases
     where household_id = p_household and status = 'confirmed'
       and store_chain = public.store_chain_of(v_store)
       and public.norm_text(document_number) = public.norm_text(v_doc)
     limit 1;
    if found then raise exception 'DUPLICATE_DOCUMENT' using detail = v_dup::text; end if;
  end if;
  -- Mesma loja + mesma data + mesmo total → provável duplicado (pode ser confirmado explicitamente)
  if not coalesce(p_allow_duplicate, false) then
    select id into v_dup from public.purchases
     where household_id = p_household and status = 'confirmed'
       and store_chain = public.store_chain_of(v_store)
       and (store_chain <> 'outros' or public.norm_text(store_name) = public.norm_text(v_store))
       and purchased_at = v_date and total_paid = v_total
     limit 1;
    if found then raise exception 'POSSIBLE_DUPLICATE' using detail = v_dup::text; end if;
  end if;

  insert into public.purchases(client_id, household_id, receipt_id, store_name, document_number, purchased_at,
                               total_paid, discount_total, payment_method, created_by)
  values (p_client_id, p_household, p_receipt_id, v_store, v_doc, v_date, v_total,
          coalesce((p_payload->>'discount_total')::numeric, 0), nullif(btrim(p_payload->>'payment_method'), ''), auth.uid())
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_ITEM_QUANTITY' using detail = coalesce(v_item->>'name', '?'); end if;
    if (v_item->>'line_total') is null then raise exception 'MISSING_ITEM_TOTAL' using detail = coalesce(v_item->>'name', '?'); end if;

    v_pid := nullif(v_item->>'product_id', '')::uuid;
    v_cp  := v_item->'create_product';

    if v_pid is not null then
      select * into v_prod from public.products where id = v_pid;
      if not found or v_prod.household_id <> p_household then raise exception 'INVALID_PRODUCT'; end if;
    elsif v_cp is not null and jsonb_typeof(v_cp) = 'object' then
      v_prod := public.create_product(
        p_household, coalesce(nullif(btrim(v_cp->>'name'), ''), v_item->>'name'), v_cp->>'brand',
        nullif(v_cp->>'category_id', '')::uuid, nullif(v_cp->>'location_id', '')::uuid,
        coalesce(v_cp->>'unit', 'un'), 0,
        coalesce((v_cp->>'min_quantity')::numeric, 0), coalesce((v_cp->>'ideal_quantity')::numeric, 0),
        null, null, nullif(v_cp->>'package_size', '')::numeric, nullif(v_cp->>'package_unit', ''));
      v_pid := v_prod.id;
    else
      v_prod := null;
    end if;

    insert into public.purchase_items(purchase_id, household_id, product_id, category_id, name, raw_text, quantity,
                                      unit_price, line_total, discount, package_size, package_unit, add_to_stock)
    values (v_purchase.id, p_household, v_pid,
            coalesce(nullif(v_item->>'category_id', '')::uuid, v_prod.category_id),
            coalesce(nullif(btrim(v_item->>'name'), ''), v_prod.name, 'Artigo'),
            v_item->>'raw_text', v_qty,
            nullif(v_item->>'unit_price', '')::numeric,
            (v_item->>'line_total')::numeric,
            coalesce(nullif(v_item->>'discount', '')::numeric, 0),
            v_prod.package_size, v_prod.package_unit,
            coalesce((v_item->>'add_to_stock')::boolean, true));

    v_items_sum := v_items_sum + (v_item->>'line_total')::numeric;

    if v_pid is not null then
      v_stock_qty := coalesce(nullif(v_item->>'stock_quantity', '')::numeric, v_qty);
      if coalesce((v_item->>'add_to_stock')::boolean, true) and v_stock_qty > 0 then
        perform public._apply_movement(gen_random_uuid(), v_pid, 'in', v_stock_qty, 'purchase',
                                       v_date::timestamptz + (now() - date_trunc('day', now())),
                                       true, nullif(v_item->>'expires_on', '')::date, v_store, v_purchase.id);
      end if;
      -- Aprender o nome da fatura para futuras associações automáticas
      if nullif(btrim(v_item->>'raw_text'), '') is not null
         and public.norm_text(v_item->>'raw_text') <> public.norm_text(v_prod.name) then
        update public.products
           set aliases = (select array_agg(distinct a) from unnest(aliases || public.norm_text(v_item->>'raw_text')) a)
         where id = v_pid;
      end if;
      v_touched := v_touched || v_pid;
    end if;
  end loop;

  update public.purchases set items_total = v_items_sum where id = v_purchase.id returning * into v_purchase;

  -- Produtos comprados saem da lista; os não comprados mantêm-se.
  update public.shopping_list_items
     set status = 'done', checked = true, checked_at = coalesce(checked_at, now())
   where household_id = p_household and product_id = any(v_touched) and status in ('open','dismissed');

  -- Preços
  perform public.refresh_product_prices(x) from unnest(v_touched) x;

  if p_receipt_id is not null then
    update public.receipts
       set status = 'confirmed', store_name = v_store, purchase_date = v_date,
           total_paid = v_total, document_number = v_doc
     where id = p_receipt_id;
  end if;

  perform public.check_budget_alerts(p_household, v_date);
  perform public.audit(p_household, 'confirm', 'purchase', v_purchase.id,
                       jsonb_build_object('store', v_store, 'date', v_date, 'total', v_total,
                                          'items', jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)),
                                          'receipt_id', p_receipt_id));
  return v_purchase;
end $$;

-- ---------------------------------------------------------------------
-- Anulação de compra (corrigir/eliminar) — reverte stock e estatísticas
-- ---------------------------------------------------------------------
create or replace function public.void_purchase(
  p_purchase_id    uuid,
  p_reason         text default null,
  p_revert_stock   boolean default true,
  p_reopen_receipt boolean default false
) returns public.purchases language plpgsql security definer set search_path = public as $$
declare
  v_p   public.purchases;
  v_m   record;
  v_ids uuid[];
begin
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  perform public.assert_member(v_p.household_id);
  if v_p.status = 'voided' then return v_p; end if;

  if coalesce(p_revert_stock, true) then
    for v_m in select product_id, sum(quantity) as q from public.stock_movements
                where purchase_id = v_p.id and direction = 'in' and reason = 'purchase'
                group by product_id
    loop
      perform public._apply_movement(gen_random_uuid(), v_m.product_id, 'out', v_m.q, 'void', now(), true, null,
                                     'Anulação da compra ' || v_p.store_name, v_p.id);
    end loop;
  end if;

  update public.purchases
     set status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = v_p.id returning * into v_p;

  if v_p.receipt_id is not null then
    update public.receipts
       set status = case when p_reopen_receipt then 'parsed' else 'voided' end
     where id = v_p.receipt_id;
  end if;

  select array_agg(distinct product_id) into v_ids from public.purchase_items where purchase_id = v_p.id and product_id is not null;
  perform public.refresh_product_prices(x) from unnest(coalesce(v_ids, '{}')) x;

  perform public.audit(v_p.household_id, 'void', 'purchase', v_p.id,
                       jsonb_build_object('reason', p_reason, 'revert_stock', p_revert_stock, 'reopen', p_reopen_receipt));
  return v_p;
end $$;

-- Correção de dados do cabeçalho (loja, data, total, pagamento) sem mexer no stock.
create or replace function public.update_purchase(
  p_purchase_id    uuid,
  p_store_name     text,
  p_purchased_at   date,
  p_total_paid     numeric,
  p_payment_method text default null,
  p_document_number text default null
) returns public.purchases language plpgsql security definer set search_path = public as $$
declare
  v_p public.purchases;
  v_old jsonb;
begin
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  perform public.assert_member(v_p.household_id);
  if v_p.status <> 'confirmed' then raise exception 'PURCHASE_VOIDED'; end if;
  if p_total_paid is null or p_total_paid < 0 then raise exception 'INVALID_TOTAL'; end if;
  if nullif(btrim(p_store_name), '') is null then raise exception 'MISSING_STORE'; end if;
  v_old := jsonb_build_object('store', v_p.store_name, 'date', v_p.purchased_at, 'total', v_p.total_paid);
  update public.purchases
     set store_name = btrim(p_store_name), purchased_at = p_purchased_at, total_paid = p_total_paid,
         payment_method = nullif(btrim(p_payment_method), ''), document_number = nullif(btrim(p_document_number), '')
   where id = p_purchase_id returning * into v_p;
  perform public.check_budget_alerts(v_p.household_id, v_p.purchased_at);
  perform public.audit(v_p.household_id, 'update', 'purchase', v_p.id, jsonb_build_object('before', v_old));
  return v_p;
end $$;

-- ---------------------------------------------------------------------
-- Faturas
-- ---------------------------------------------------------------------

create or replace function public.discard_receipt(p_receipt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.receipts;
begin
  select * into v_r from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform public.assert_member(v_r.household_id);
  if v_r.status = 'confirmed' then raise exception 'RECEIPT_ALREADY_CONFIRMED'; end if;
  update public.receipts set status = 'discarded' where id = p_receipt_id;
  perform public.audit(v_r.household_id, 'discard', 'receipt', v_r.id, null);
end $$;

-- Verifica duplicados antes da confirmação (para avisos na página de revisão).
create or replace function public.find_duplicate_purchases(
  p_household uuid, p_store_name text, p_purchased_at date, p_total numeric, p_document_number text default null
) returns table(id uuid, store_name text, purchased_at date, total_paid numeric, document_number text, match text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_member(p_household);
  return query
  select p.id, p.store_name, p.purchased_at, p.total_paid, p.document_number,
         case when p_document_number is not null and public.norm_text(p.document_number) = public.norm_text(p_document_number)
              then 'document' else 'store_date_total' end
    from public.purchases p
   where p.household_id = p_household and p.status = 'confirmed'
     and p.store_chain = public.store_chain_of(p_store_name)
     and ( (p_document_number is not null and btrim(p_document_number) <> ''
            and public.norm_text(p.document_number) = public.norm_text(p_document_number))
        or (p.purchased_at = p_purchased_at and p.total_paid = p_total) );
end $$;

-- ---------------------------------------------------------------------
-- Alertas de validade (gerados quando a app abre; deduplicados)
-- ---------------------------------------------------------------------
create or replace function public.refresh_expiry_notifications(p_household uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_days int;
  v_n    int := 0;
  v_cnt  int;
  v_exp  int;
begin
  perform public.assert_member(p_household);
  select expiry_alert_days into v_days from public.households where id = p_household;

  select count(*) filter (where expires_on >= current_date), count(*) filter (where expires_on < current_date)
    into v_cnt, v_exp
    from public.expiring_lots
   where household_id = p_household and expires_on <= current_date + v_days;

  if v_cnt > 0 then
    insert into public.notifications(household_id, kind, title, body, link, dedupe_key)
    values (p_household, 'expiry',
            case when v_cnt = 1 then 'Existe 1 produto próximo da validade'
                 else format('Existem %s produtos próximos da validade', v_cnt) end,
            format('Nos próximos %s dias. Consumir primeiro!', v_days), '/stock/validades',
            format('expiry:%s:%s', current_date, v_cnt))
    on conflict (household_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
  end if;
  if v_exp > 0 then
    insert into public.notifications(household_id, kind, title, body, link, dedupe_key)
    values (p_household, 'expiry',
            case when v_exp = 1 then '1 produto já passou da validade' else format('%s produtos já passaram da validade', v_exp) end,
            'Verifiquem e registem o desperdício, se for o caso.', '/stock/validades',
            format('expired:%s:%s', current_date, v_exp))
    on conflict (household_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_n;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  insert into public.notification_reads(notification_id, user_id)
  select n.id, auth.uid() from public.notifications n
   where n.id = any(p_ids) and public.is_household_member(n.household_id)
  on conflict do nothing;
$$;
