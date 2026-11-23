-- Testes do módulo financeiro (corre depois de 10_flows.sql, na mesma base de dados).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

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
  begin execute p_sql;
  exception when others then
    if position(p_msg in sqlerrm) = 0 then raise exception 'Esperado erro "%" mas recebi "%" em: %', p_msg, sqlerrm, p_sql; end if;
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

create temp table f as
  select h.id as hid from public.households h where h.name = 'A Nossa Casa';
grant select on f to authenticated;
-- atalhos
create or replace function pg_temp.hid() returns uuid language sql as $$ select hid from f $$;
create or replace function pg_temp.cat(k text) returns uuid language sql as $$ select id from public.fin_categories where household_id = (select hid from f) and system_key = k $$;
create or replace function pg_temp.acc(n text) returns uuid language sql as $$ select id from public.fin_accounts where household_id = (select hid from f) and name = n $$;
create or replace function pg_temp.bal(n text) returns numeric language sql as $$ select balance from public.fin_account_balances where household_id = (select hid from f) and name = n $$;
create or replace function pg_temp.mv(p jsonb, cid uuid default gen_random_uuid()) returns uuid language sql as $$
  select (select id from public.fin_create_movement((select hid from f), cid, p) limit 1) $$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.login('ana@example.com');

-- ---------------------------------------------------------------- sementes
select pg_temp.check((select count(*) from public.fin_people where household_id = pg_temp.hid() and kind = 'member') = 2, 'Ana e Vitor existem como pessoas');
select pg_temp.check((select count(*) from public.fin_people where household_id = pg_temp.hid() and name = 'Heitor' and kind = 'beneficiary' and user_id is null) = 1, 'Heitor é beneficiário sem conta de acesso');
select pg_temp.check(pg_temp.cat('alimentacao.supermercado') is not null and pg_temp.cat('heitor.transferencias') is not null and pg_temp.cat('olivia.fraldas') is not null, 'categorias e subcategorias criadas');
select pg_temp.check((select count(*) from public.fin_categories where household_id = pg_temp.hid() and kind = 'income' and parent_id is null) = 9, '9 categorias de rendimento');

-- ---------------------------------------------------------------- integração com compras de supermercado
select pg_temp.check((select count(*) from public.fin_transactions t join public.purchases p on p.id = t.purchase_id
                       where p.household_id = pg_temp.hid()) = (select count(*) from public.purchases where household_id = pg_temp.hid()),
                     'cada compra tem exatamente um movimento financeiro');
select pg_temp.check((select bool_and(t.status = case when p.status = 'confirmed' then 'done' else 'cancelled' end and t.amount = p.total_paid)
                        from public.fin_transactions t join public.purchases p on p.id = t.purchase_id), 'compras anuladas → movimento anulado; valores iguais');
select pg_temp.check((select count(*) from public.fin_transactions where source = 'purchase' and category_id = pg_temp.cat('alimentacao.supermercado')) > 0, 'compras contam em Alimentação › Supermercado');

create temp table np as select (public.confirm_purchase(pg_temp.hid(), gen_random_uuid(),
  '{"store_name":"Pingo Doce","purchased_at":"2026-11-21","total_paid":23.40,"items":[]}'::jsonb)).id as id;
grant select on np to authenticated;
select pg_temp.check((select count(*) from public.fin_transactions where purchase_id = (select id from np)) = 1, 'nova fatura confirmada entra uma vez nas finanças');
select public.update_purchase((select id from np), 'Pingo Doce', '2026-11-21', 25.10);
select pg_temp.check((select amount from public.fin_transactions where purchase_id = (select id from np)) = 25.10, 'correção da compra atualiza o movimento (sem duplicar)');
select pg_temp.check((select count(*) from public.fin_transactions where purchase_id = (select id from np)) = 1, 'continua um único movimento');
select pg_temp.expect_error(format('select public.fin_cancel_movement(%L)', (select id from public.fin_transactions where purchase_id = (select id from np))), 'CANCEL_VIA_PURCHASE');

-- ---------------------------------------------------------------- contas
insert into public.fin_accounts(household_id, name, kind, owner_person_id, opening_balance, opening_date) values
  (pg_temp.hid(), 'Conta Ana', 'bank', (select id from public.fin_people where user_id = auth.uid() and household_id = pg_temp.hid()), 1000, '2026-01-01'),
  (pg_temp.hid(), 'Conta Vitor', 'bank', null, 500, '2026-01-01'),
  (pg_temp.hid(), 'Poupança', 'savings', null, 0, '2026-01-01'),
  (pg_temp.hid(), 'Cartão de crédito', 'credit_card', null, 0, '2026-01-01');
select pg_temp.check(pg_temp.bal('Conta Ana') = 1000, 'saldo inicial');

-- ---------------------------------------------------------------- rendimentos
select pg_temp.mv(jsonb_build_object('type','income','amount',1500,'date','2026-11-05','description','Salário Ana','category_id',pg_temp.cat('income.salarios'),'account_id',pg_temp.acc('Conta Ana')));
select pg_temp.check(pg_temp.bal('Conta Ana') = 2500, 'salário recebido entra no saldo');
create temp table planned as select pg_temp.mv(jsonb_build_object('type','income','status','planned','amount',200,'date',current_date + 5,'description','Trabalho extra','account_id',pg_temp.acc('Conta Ana'))) as id;
grant select on planned to authenticated;
select pg_temp.check(pg_temp.bal('Conta Ana') = 2500, 'rendimento previsto não conta no saldo');
select pg_temp.check((select pending_in from public.fin_account_balances where name = 'Conta Ana') = 200 or current_date + 5 > (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'previsto aparece como entrada prevista');
select public.fin_confirm_movement((select id from planned), 210, current_date);
select pg_temp.check(pg_temp.bal('Conta Ana') = 2710, 'confirmado com o valor efetivamente recebido');
select pg_temp.expect_error(format('select pg_temp.mv(%L::jsonb)', jsonb_build_object('type','income','status','done','amount',10,'date',current_date + 3,'description','x')), 'FUTURE_DONE');

-- ---------------------------------------------------------------- despesas
select pg_temp.mv(jsonb_build_object('type','expense','amount',650,'date','2026-11-01','description','Renda','category_id',pg_temp.cat('habitacao.renda'),'account_id',pg_temp.acc('Conta Ana')));
select pg_temp.check(pg_temp.bal('Conta Ana') = 2060, 'despesa paga sai do saldo');
select pg_temp.expect_error(format('select pg_temp.mv(%L::jsonb)', jsonb_build_object('type','expense','amount',5,'description','x','category_id',pg_temp.cat('income.salarios'))), 'CATEGORY_KIND_MISMATCH');
select pg_temp.expect_error(format('select pg_temp.mv(%L::jsonb)', jsonb_build_object('type','expense','amount',0,'description','x')), 'INVALID_AMOUNT');

-- despesa partilhada paga pelo Vitor conta uma só vez
select pg_temp.mv(jsonb_build_object('type','expense','amount',40,'date','2026-11-10','description','Eletricidade','category_id',pg_temp.cat('contas.eletricidade'),
  'account_id',pg_temp.acc('Conta Vitor'),'person_id',(select id from public.fin_people where name = 'Vitor'),'scope','shared'));
select pg_temp.check((select count(*) from public.fin_transactions where description = 'Eletricidade') = 1, 'despesa partilhada registada uma vez');

-- idempotência
select pg_temp.mv(jsonb_build_object('type','expense','amount',3,'date','2026-11-11','description','Café','category_id',pg_temp.cat('alimentacao.cafes')), '33333333-3333-3333-3333-333333333333');
select pg_temp.mv(jsonb_build_object('type','expense','amount',3,'date','2026-11-11','description','Café','category_id',pg_temp.cat('alimentacao.cafes')), '33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) from public.fin_transactions where description = 'Café') = 1, 'reenvio do mesmo formulário não duplica');

-- ---------------------------------------------------------------- transferências e poupança
select pg_temp.mv(jsonb_build_object('type','savings','amount',300,'date','2026-11-12','description','Poupança do mês','account_id',pg_temp.acc('Conta Ana'),'to_account_id',pg_temp.acc('Poupança')));
select pg_temp.check(pg_temp.bal('Conta Ana') = 1760 and pg_temp.bal('Poupança') = 300, 'poupança: sai de uma conta e entra na outra');
select pg_temp.check((select count(distinct transfer_group) = 1 and count(*) = 2 from public.fin_transactions where description = 'Poupança do mês'), 'as duas pernas partilham o mesmo identificador');
select pg_temp.check((select bool_and(nature = 'transfer' and transfer_kind = 'savings') from public.fin_transactions where description = 'Poupança do mês'), 'poupança não é despesa nem rendimento');
select pg_temp.expect_error(format('select pg_temp.mv(%L::jsonb)', jsonb_build_object('type','transfer','amount',10,'description','x','account_id',pg_temp.acc('Conta Ana'),'to_account_id',pg_temp.acc('Conta Ana'))), 'TRANSFER_SAME_ACCOUNT');

-- cartão de crédito: compra conta uma vez; o pagamento do cartão é transferência
select pg_temp.mv(jsonb_build_object('type','expense','amount',50,'date','2026-11-13','description','Farmácia','category_id',pg_temp.cat('saude.medicamentos'),'account_id',pg_temp.acc('Cartão de crédito'),'payment_method','cartão de crédito'));
select pg_temp.check(pg_temp.bal('Cartão de crédito') = -50, 'compra a crédito fica em dívida no cartão');
select pg_temp.mv(jsonb_build_object('type','transfer','amount',50,'date','2026-11-20','description','Pagamento do cartão','account_id',pg_temp.acc('Conta Ana'),'to_account_id',pg_temp.acc('Cartão de crédito')));
select pg_temp.check(pg_temp.bal('Cartão de crédito') = 0 and pg_temp.bal('Conta Ana') = 1710, 'pagamento do cartão liquida a dívida');
select pg_temp.check((select transfer_kind from public.fin_transactions where description = 'Pagamento do cartão' limit 1) = 'card_payment', 'pagamento de cartão identificado');
select pg_temp.check((select sum(amount) from public.fin_transactions where nature = 'expense' and status = 'done' and description in ('Farmácia','Pagamento do cartão')) = 50,
                     'a compra no cartão não é contada duas vezes');

-- ---------------------------------------------------------------- Heitor
create temp table ht as select pg_temp.mv(jsonb_build_object('type','heitor','date','2026-11-15','account_id',pg_temp.acc('Conta Ana'),
  'heitor', jsonb_build_object('amount_eur',200,'amount_brl',1180,'fees_eur',3.5,'service','Wise','purpose','Escola'))) as id;
grant select on ht to authenticated;
select pg_temp.check((select amount from public.fin_transactions where id = (select id from ht)) = 203.50, 'saída = valor enviado + taxas');
select pg_temp.check((select fx_rate from public.fin_heitor_transfers where transaction_id = (select id from ht)) = 5.9, 'taxa de câmbio efetiva guardada (5,9 BRL/EUR)');
select pg_temp.check((select nature = 'expense' and category_id = pg_temp.cat('heitor.transferencias') and beneficiary_id = (select id from public.fin_people where name = 'Heitor')
                        from public.fin_transactions where id = (select id from ht)), 'envio ao Heitor é apoio familiar (despesa), não rendimento');
select pg_temp.check(pg_temp.bal('Conta Ana') = 1506.50, 'envio sai da conta de origem');
-- editar outro envio não mexe na taxa deste
select pg_temp.mv(jsonb_build_object('type','heitor','date','2026-11-18','heitor', jsonb_build_object('amount_eur',100,'amount_brl',610,'fx_rate',6.1)));
select pg_temp.check((select fx_rate from public.fin_heitor_transfers where transaction_id = (select id from ht)) = 5.9, 'taxas antigas nunca são recalculadas');

-- ---------------------------------------------------------------- edição e cancelamento
select public.fin_cancel_movement((select id from public.fin_transactions where description = 'Poupança do mês' and direction = 'out'), 'engano');
select pg_temp.check((select bool_and(status = 'cancelled') from public.fin_transactions where description = 'Poupança do mês'), 'anular uma transferência anula as duas pernas');
select pg_temp.check(pg_temp.bal('Poupança') = 0 and pg_temp.bal('Conta Ana') = 1806.50, 'saldos revertidos');
select public.fin_update_movement((select id from public.fin_transactions where description = 'Renda'), '{"amount": 700}'::jsonb);
select pg_temp.check(pg_temp.bal('Conta Ana') = 1756.50, 'edição do valor reflete-se no saldo');
select pg_temp.check((select count(*) from public.audit_log where entity = 'fin_transactions' and action = 'update') > 0, 'histórico de alterações registado');

-- ---------------------------------------------------------------- objetivos
insert into public.fin_goals(household_id, name, target_amount, initial_amount, account_id) values (pg_temp.hid(), 'Fundo de emergência', 3000, 100, pg_temp.acc('Poupança'));
select pg_temp.mv(jsonb_build_object('type','savings','amount',250,'date','2026-11-22','description','Reforço fundo','account_id',pg_temp.acc('Conta Ana'),'to_account_id',pg_temp.acc('Poupança'),
  'goal_id',(select id from public.fin_goals where name = 'Fundo de emergência')));
select pg_temp.check((select accumulated from public.fin_goal_progress where name = 'Fundo de emergência') = 350, 'objetivo acumula a poupança associada');

-- ---------------------------------------------------------------- recorrências
insert into public.fin_recurring(household_id, type, description, amount, category_id, account_id, frequency, interval_n, next_due, created_by)
values (pg_temp.hid(), 'expense', 'Internet', 35, pg_temp.cat('contas.internet'), pg_temp.acc('Conta Ana'), 'monthly', 1, current_date - 3, auth.uid());
select public.fin_generate_recurring(pg_temp.hid());
select public.fin_generate_recurring(pg_temp.hid());
select pg_temp.check((select count(*) from public.fin_transactions where description = 'Internet') between 2 and 3, 'ocorrências geradas até ao horizonte, sem duplicados');
select pg_temp.check((select bool_and(status = 'planned') from public.fin_transactions where description = 'Internet'), 'despesa recorrente fica prevista até ser confirmada');
select pg_temp.check(pg_temp.bal('Conta Ana') = 1506.50, 'previsto não sai do saldo real');
select public.fin_refresh_due_notifications(pg_temp.hid());
select pg_temp.check((select count(*) from public.notifications where kind = 'bill') = 1, 'alerta de pagamento em atraso/a vencer');

-- ---------------------------------------------------------------- orçamento
insert into public.fin_budgets(household_id, month, scope, amount) values (pg_temp.hid(), date_trunc('month', current_date)::date, 'total', 100);
insert into public.fin_budgets(household_id, month, scope, category_id, amount) values (pg_temp.hid(), date_trunc('month', current_date)::date, 'category', pg_temp.cat('heitor'), 250);
select pg_temp.mv(jsonb_build_object('type','expense','amount',120,'date',current_date,'description','Supermercado extra','category_id',pg_temp.cat('alimentacao.restaurantes')));
select pg_temp.check((select count(*) from public.notifications where kind = 'budget' and dedupe_key like 'finbudget:%:total:%') = 4, 'alertas 50/75/90/100% do orçamento familiar');
select pg_temp.check((select spent from public.fin_budget_status(pg_temp.hid(), current_date) where scope = 'category')
                     = (select coalesce(sum(amount), 0) from public.fin_transactions where nature = 'expense' and status = 'done'
                        and category_id in (select public.fin_category_tree(pg_temp.cat('heitor'))) and date >= date_trunc('month', current_date)), 'limite do Heitor inclui as subcategorias');

-- ---------------------------------------------------------------- importação de extratos
create temp table dup as select * from public.fin_find_duplicates(pg_temp.hid(), jsonb_build_array(
  jsonb_build_object('key','1','date','2026-11-22','amount',-25.10,'description','PINGO DOCE MATOSINHOS')));
select pg_temp.check((select source from dup limit 1) = 'purchase', 'extrato: deteta a compra já registada pela fatura');
select public.fin_import_movements(pg_temp.hid(), jsonb_build_object('file_name','extrato.csv','file_sha256','abc','account_id',pg_temp.acc('Conta Vitor')),
  jsonb_build_array(
    jsonb_build_object('key','1','date','2026-11-22','amount',-25.10,'description','PINGO DOCE','action','link','link_id',(select transaction_id from dup limit 1)),
    jsonb_build_object('key','2','date','2026-11-22','amount',-12.00,'description','GALP','action','create','nature','expense','category_id',pg_temp.cat('transportes.combustivel')),
    jsonb_build_object('key','3','date','2026-11-22','amount',900,'description','TRF VITOR SALARIO','action','create','nature','income','category_id',pg_temp.cat('income.salarios')),
    jsonb_build_object('key','4','date','2026-11-22','amount',-5,'description','REPETIDO','action','skip')));
select pg_temp.check((select account_id from public.fin_transactions where id = (select transaction_id from dup limit 1)) = pg_temp.acc('Conta Vitor'), 'linha associada completa a conta sem duplicar');
select pg_temp.check((select count(*) from public.fin_transactions where source = 'import') = 2, 'só as linhas confirmadas foram criadas');
select pg_temp.expect_error(format('select public.fin_import_movements(%L, %L::jsonb, %L::jsonb)', pg_temp.hid(),
  jsonb_build_object('file_sha256','abc','account_id',pg_temp.acc('Conta Vitor')), '[]'), 'IMPORT_ALREADY_DONE');
select pg_temp.expect_error(format('select public.fin_import_movements(%L, %L::jsonb, %L::jsonb)', pg_temp.hid(),
  jsonb_build_object('file_sha256','def','account_id',pg_temp.acc('Conta Vitor')),
  jsonb_build_array(jsonb_build_object('date','2026-11-22','amount',-100,'description','TRF 123','action','create'))), 'IMPORT_ROW_NEEDS_NATURE');

-- ---------------------------------------------------------------- permissões
select pg_temp.expect_error(format('insert into public.fin_transactions(household_id, nature, direction, amount, date, description) values (%L, %L, %L, 1, current_date, %L)',
  pg_temp.hid(), 'income', 'in', 'x'), 'permission denied');
select pg_temp.login('eve@example.com');
select pg_temp.check((select count(*) from public.fin_transactions where household_id = (select hid from f)) = 0, 'outra casa não vê movimentos');
select pg_temp.check((select count(*) from public.fin_account_balances where household_id = (select hid from f)) = 0, 'outra casa não vê saldos');
select pg_temp.check((select count(*) from public.fin_heitor_transfers) = 0, 'outra casa não vê envios ao Heitor');
select pg_temp.expect_error(format('select public.fin_create_movement(%L, gen_random_uuid(), %L::jsonb)', (select hid from f), '{"type":"expense","amount":1,"description":"x"}'), 'FORBIDDEN');
select pg_temp.expect_error(format('insert into public.fin_accounts(household_id, name) values (%L, %L)', (select hid from f), 'x'), 'row-level security');
select pg_temp.expect_error(format('select public.fin_cancel_movement(%L)', (select id from ht)), 'FORBIDDEN');

reset role;
select 'TESTES FINANCEIROS: TODOS PASSARAM';
