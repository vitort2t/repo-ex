-- Testes de integração da base de dados (executar com tests/run.sh num PostgreSQL local).
-- Cada bloco simula um utilizador autenticado via request.jwt.claim.sub.

\set ON_ERROR_STOP 1

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
declare v text;
begin
  reset role;
  select id::text into v from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v, false);
  set role authenticated;
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_msg in sqlerrm) = 0 then
      raise exception 'Esperado erro "%" mas recebi "%" em: %', p_msg, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'Esperado erro "%" mas o comando teve sucesso: %', p_msg, p_sql;
end $$;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_label; end if;
  raise notice 'ok — %', p_label;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users(email, raw_user_meta_data) values
  ('ana@example.com',   '{"display_name":"Ana"}'),
  ('vitor@example.com', '{"display_name":"Vitor"}'),
  ('eve@example.com',   '{"display_name":"Eve"}');

select pg_temp.check((select count(*) from public.profiles) = 3, 'perfis criados automaticamente');
\pset tuples_only on
\pset format unaligned

set role authenticated;

-- ---------------------------------------------------------------- casa
select pg_temp.login('ana@example.com');
create temp table ctx as select public.create_household('A Nossa Casa') as hid;
grant select on ctx to authenticated;
select pg_temp.check((select count(*) from public.categories where household_id = (select hid from ctx)) >= 40, 'categorias pré-definidas');
select pg_temp.check((select count(*) from public.locations  where household_id = (select hid from ctx)) = 7, 'localizações pré-definidas');
select pg_temp.check(public.default_list_id((select hid from ctx)) is not null, 'lista de compras criada');

-- ---------------------------------------------------------------- convite
create temp table inv as select token from public.create_invite((select hid from ctx), 'Vitor@Example.com');
grant select on inv to authenticated;
select pg_temp.login('eve@example.com');
select pg_temp.expect_error(format('select public.accept_invite(%L)', (select token from inv)), 'INVITE_EMAIL_MISMATCH');
select pg_temp.expect_error(format('select public.create_invite(%L, %L)', (select hid from ctx), 'x@y.pt'), 'FORBIDDEN');
select pg_temp.login('vitor@example.com');
select pg_temp.check(public.accept_invite((select token from inv)) = (select hid from ctx), 'Vitor aceita o convite');
select pg_temp.check((select count(*) from public.household_members where household_id = (select hid from ctx)) = 2, 'casa com 2 membros');
select pg_temp.expect_error(format('select public.create_invite(%L, %L)', (select hid from ctx), 'x@y.pt'), 'ONLY_OWNER_CAN_INVITE');

-- ---------------------------------------------------------------- produtos e movimentos
select pg_temp.login('ana@example.com');
create temp table prod as
  select (public.create_product((select hid from ctx), 'Leite meio-gordo', 'Mimosa',
          (select id from public.categories where name = 'Leite e derivados' and household_id = (select hid from ctx)),
          (select id from public.locations where name = 'Despensa' and household_id = (select hid from ctx)),
          'un', 6, 2, 6)).id as leite;
grant select on prod to authenticated;
select pg_temp.check((select quantity from public.products where id = (select leite from prod)) = 6, 'produto criado com stock inicial 6');
select pg_temp.check((select count(*) from public.stock_movements where product_id = (select leite from prod) and reason = 'initial') = 1, 'movimento inicial registado');

select public.record_movement('11111111-1111-1111-1111-111111111111', (select leite from prod), 'out', 2, 'consumption');
select public.record_movement('11111111-1111-1111-1111-111111111111', (select leite from prod), 'out', 2, 'consumption');
select pg_temp.check((select quantity from public.products where id = (select leite from prod)) = 4, 'retirar 2 → 4 (reenvio idempotente não duplica)');

select pg_temp.login('vitor@example.com');
select pg_temp.check((select quantity from public.products where id = (select leite from prod)) = 4, 'Vitor vê a mesma quantidade');
select pg_temp.check((select user_id from public.stock_movements where id = '11111111-1111-1111-1111-111111111111')
                     = (select id from public.profiles where email = 'ana@example.com'), 'movimento identifica quem o fez');
select pg_temp.expect_error(format('select public.record_movement(gen_random_uuid(), %L, %L, 10)', (select leite from prod), 'out'), 'NEGATIVE_STOCK');
select pg_temp.expect_error(format('update public.products set quantity = 100 where id = %L', (select leite from prod)), 'permission denied');
select pg_temp.expect_error(format('insert into public.stock_movements(id, household_id, product_id, direction, quantity, reason, balance_after) values (gen_random_uuid(), %L, %L, %L, 1, %L, 1)', (select hid from ctx), (select leite from prod), 'in', 'gift'), 'permission denied');

select public.record_movement(gen_random_uuid(), (select leite from prod), 'out', 2, 'consumption');
select pg_temp.check((select count(*) from public.shopping_list_items where product_id = (select leite from prod) and status = 'open' and source = 'auto') = 1,
                     'stock no mínimo → entra na lista automática');
select pg_temp.check((select count(*) from public.notifications where kind = 'low_stock') = 1, 'notificação de stock baixo');
select public.record_movement(gen_random_uuid(), (select leite from prod), 'out', 2, 'consumption');
select pg_temp.check((select count(*) from public.notifications where kind = 'out_of_stock') = 1, 'notificação de esgotado');
select pg_temp.check((select count(*) from public.shopping_list_items where product_id = (select leite from prod) and status = 'open') = 1, 'sem duplicados na lista');

-- negativo com confirmação explícita
select public.record_movement(gen_random_uuid(), (select leite from prod), 'out', 1, 'correction', null, true);
select pg_temp.check((select quantity from public.products where id = (select leite from prod)) = -1, 'stock negativo só com confirmação explícita');
select public.record_movement(gen_random_uuid(), (select leite from prod), 'in', 1, 'correction');

-- ---------------------------------------------------------------- isolamento entre casas
select pg_temp.login('eve@example.com');
select public.create_household('Casa da Eve');
select pg_temp.check((select count(*) from public.products) = 0, 'Eve não vê produtos de outra casa');
select pg_temp.check((select count(*) from public.stock_movements) = 0, 'Eve não vê movimentos de outra casa');
select pg_temp.check((select count(*) from public.categories where household_id = (select hid from ctx)) = 0, 'Eve não vê categorias de outra casa');
select pg_temp.expect_error(format('select public.record_movement(gen_random_uuid(), %L, %L, 1)', (select leite from prod), 'in'), 'FORBIDDEN');
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb)', (select hid from ctx), '{"store_name":"Lidl","purchased_at":"2026-11-01","total_paid":1,"items":[]}'), 'FORBIDDEN');
select pg_temp.expect_error(format('insert into public.receipts(household_id, uploaded_by, status) values (%L, auth.uid(), %L)', (select hid from ctx), 'uploaded'), 'row-level security');
select pg_temp.expect_error(format('insert into public.shopping_list_items(list_id, household_id, custom_name) values (%L, %L, %L)', public.default_list_id((select hid from ctx)), (select hid from ctx), 'x'), 'row-level security');

-- ---------------------------------------------------------------- compra a partir de fatura
select pg_temp.login('ana@example.com');
insert into public.shopping_list_items(list_id, household_id, custom_name, source, created_by)
values (public.default_list_id((select hid from ctx)), (select hid from ctx), 'Pilhas AA', 'manual', auth.uid());

create temp table rcp as select gen_random_uuid() as id;
grant select on rcp to authenticated;
insert into public.receipts(id, household_id, file_path, file_sha256, mime_type, uploaded_by, status)
values ((select id from rcp), (select hid from ctx), (select hid from ctx) || '/r1.pdf', 'abc123', 'application/pdf', auth.uid(), 'uploaded');
select pg_temp.expect_error(format('insert into public.receipts(household_id, file_sha256, uploaded_by, status) values (%L, %L, auth.uid(), %L)', (select hid from ctx), 'abc123', 'uploaded'), 'duplicate key');

create temp table pur as
select (public.confirm_purchase((select hid from ctx), '22222222-2222-2222-2222-222222222222', jsonb_build_object(
  'store_name', 'MERCADONA, S.A.', 'purchased_at', '2026-11-23', 'total_paid', 16.99, 'document_number', 'ATCUD:JJ4K-100',
  'items', jsonb_build_array(
     jsonb_build_object('name','Leite meio-gordo','raw_text','LEITE M/G 1L','quantity',6,'unit_price',0.99,'line_total',5.94,'product_id',(select leite from prod)),
     jsonb_build_object('name','Arroz agulha','raw_text','ARROZ AGULHA 1KG','quantity',2,'unit_price',1.29,'line_total',2.58,
                        'create_product', jsonb_build_object('name','Arroz agulha','min_quantity',2,'ideal_quantity',5)),
     jsonb_build_object('name','Ovos M','quantity',1,'line_total',3.49,'create_product', jsonb_build_object('name','Ovos')),
     jsonb_build_object('name','Saco','quantity',1,'line_total',0.10,'add_to_stock',false),
     jsonb_build_object('name','Detergente','quantity',1,'line_total',4.88,'discount',0.11)
  )), (select id from rcp))).id as id;
grant select on pur to authenticated;

select pg_temp.check((select store_chain from public.purchases where id = (select id from pur)) = 'mercadona', 'supermercado identificado (Mercadona)');
select pg_temp.check((select items_total from public.purchases where id = (select id from pur)) = 16.99, 'total das linhas conciliado');
select pg_temp.check((select quantity from public.products where id = (select leite from prod)) = 6, 'stock do leite atualizado (0 + 6)');
select pg_temp.check((select quantity from public.products where name = 'Arroz agulha') = 2, 'produto novo criado a partir da fatura');
select pg_temp.check((select last_price from public.products where id = (select leite from prod)) = 0.99, 'último preço atualizado');
select pg_temp.check((select 'leite m/g 1l' = any(aliases) from public.products where id = (select leite from prod)), 'nome da fatura aprendido');
select pg_temp.check((select status from public.receipts where id = (select id from rcp)) = 'confirmed', 'fatura marcada como confirmada');
select pg_temp.check((select count(*) from public.shopping_list_items where product_id = (select leite from prod) and status = 'open') = 0, 'leite comprado sai da lista');
select pg_temp.check((select count(*) from public.shopping_list_items where custom_name = 'Pilhas AA' and status = 'open') = 1, 'produto não comprado mantém-se na lista');
select pg_temp.check((select count(*) from public.shopping_list_items where product_id = (select id from public.products where name = 'Arroz agulha') and status = 'open') = 0,
                     'arroz efetivamente comprado sai da lista');
select pg_temp.check((select count(*) from public.stock_movements where purchase_id = (select id from pur)) = 3, 'só artigos associados entram no stock');

-- Repetições e duplicados
select pg_temp.check((public.confirm_purchase((select hid from ctx), '22222222-2222-2222-2222-222222222222', '{}'::jsonb)).id = (select id from pur), 'reenvio da mesma confirmação é idempotente');
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb, %L)', (select hid from ctx),
  '{"store_name":"Mercadona","purchased_at":"2026-11-23","total_paid":16.99,"items":[]}', (select id from rcp)), 'RECEIPT_ALREADY_CONFIRMED');
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb)', (select hid from ctx),
  '{"store_name":"Mercadona Matosinhos","purchased_at":"2026-11-23","total_paid":16.99,"items":[]}'), 'POSSIBLE_DUPLICATE');
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb, null, true)', (select hid from ctx),
  '{"store_name":"Mercadona","purchased_at":"2026-11-20","total_paid":3,"document_number":"atcud:jj4k-100","items":[]}'), 'DUPLICATE_DOCUMENT');
select pg_temp.check((select count(*) from public.find_duplicate_purchases((select hid from ctx), 'Mercadona', '2026-11-23', 16.99)) = 1, 'deteção de duplicados para aviso');
select pg_temp.check((select count(*) from public.purchases where status = 'confirmed') = 1, 'nenhuma compra duplicada registada');

-- Validações
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb)', (select hid from ctx),
  '{"store_name":"Lidl","purchased_at":"2026-11-02","total_paid":2,"items":[{"name":"X","line_total":2}]}'), 'INVALID_ITEM_QUANTITY');
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb)', (select hid from ctx),
  '{"store_name":"Lidl","purchased_at":"2026-11-02","total_paid":2,"items":[{"name":"X","quantity":1}]}'), 'MISSING_ITEM_TOTAL');
select pg_temp.expect_error(format('select public.confirm_purchase(%L, gen_random_uuid(), %L::jsonb)', (select hid from ctx),
  '{"purchased_at":"2026-11-02","total_paid":2,"items":[]}'), 'MISSING_STORE');

-- ---------------------------------------------------------------- orçamento
insert into public.monthly_budgets(household_id, month, amount) values ((select hid from ctx), '2026-11-01', 30);
select public.confirm_purchase((select hid from ctx), gen_random_uuid(),
  '{"store_name":"Lidl Gaia","purchased_at":"2026-11-10","total_paid":12.50,"items":[]}'::jsonb);
select pg_temp.check((select count(*) from public.notifications where kind = 'budget') = 3, 'alertas de 50% e 75% e 90% do orçamento (29,49 € de 30 €)');
select pg_temp.check(public.budget_for((select hid from ctx), '2027-01-15') = 30, 'orçamento herdado nos meses seguintes');

-- ---------------------------------------------------------------- anulação
select public.void_purchase((select id from pur), 'Fatura errada', true, true);
select pg_temp.check((select status from public.purchases where id = (select id from pur)) = 'voided', 'compra anulada');
select pg_temp.check((select quantity from public.products where id = (select leite from prod)) = 0, 'stock revertido após anulação');
select pg_temp.check((select status from public.receipts where id = (select id from rcp)) = 'parsed', 'fatura reaberta para correção');
select pg_temp.check((select last_price from public.products where id = (select leite from prod)) is null, 'preços recalculados após anulação');
select pg_temp.check((select coalesce(sum(total_paid),0) from public.purchases where status = 'confirmed') = 12.50, 'compras anuladas não contam nas despesas');
-- A fatura reaberta pode ser confirmada de novo (com correções)
select public.confirm_purchase((select hid from ctx), gen_random_uuid(),
  '{"store_name":"Mercadona","purchased_at":"2026-11-23","total_paid":16.89,"document_number":"ATCUD:JJ4K-100","items":[]}'::jsonb, (select id from rcp));
select pg_temp.check((select status from public.receipts where id = (select id from rcp)) = 'confirmed', 'fatura corrigida e confirmada de novo');

-- ---------------------------------------------------------------- validades (FEFO)
select public.record_movement(gen_random_uuid(), (select leite from prod), 'in', 2, 'purchase', null, false, current_date + 3);
select public.record_movement(gen_random_uuid(), (select leite from prod), 'in', 3, 'purchase', null, false, current_date + 20);
select public.record_movement(gen_random_uuid(), (select leite from prod), 'out', 3, 'consumption');
select pg_temp.check((select quantity from public.inventory_lots where product_id = (select leite from prod) and expires_on = current_date + 3) = 0, 'FEFO: lote mais antigo consumido primeiro');
select pg_temp.check((select quantity from public.inventory_lots where product_id = (select leite from prod) and expires_on = current_date + 20) = 2, 'FEFO: restante no lote mais recente');
select public.record_movement(gen_random_uuid(), (select leite from prod), 'in', 1, 'purchase', null, false, current_date + 5);
select public.refresh_expiry_notifications((select hid from ctx));
select public.refresh_expiry_notifications((select hid from ctx));
select pg_temp.check((select count(*) from public.notifications where kind = 'expiry') = 1, 'alerta de validade sem duplicados');

-- ---------------------------------------------------------------- funções internas protegidas
select pg_temp.expect_error(format('select public._apply_movement(gen_random_uuid(), %L, %L, 100, %L, now(), true, null, null, null)', (select leite from prod), 'in', 'gift'), 'permission denied');

reset role;
select 'TESTES DA BASE DE DADOS: TODOS PASSARAM' as resultado;
