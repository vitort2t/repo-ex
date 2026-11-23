-- =====================================================================
-- CASA EM STOCK — segurança: RLS, permissões, armazenamento, realtime
-- Princípio: cada casa só vê os seus dados; operações que mexem em
-- stock ou dinheiro passam obrigatoriamente pelas funções transacionais.
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.household_invites   enable row level security;
alter table public.categories          enable row level security;
alter table public.locations           enable row level security;
alter table public.products            enable row level security;
alter table public.inventory_lots      enable row level security;
alter table public.receipts            enable row level security;
alter table public.receipt_items       enable row level security;
alter table public.purchases           enable row level security;
alter table public.purchase_items      enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.shopping_lists      enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.monthly_budgets     enable row level security;
alter table public.notifications       enable row level security;
alter table public.notification_reads  enable row level security;
alter table public.audit_log           enable row level security;

-- Anónimos não têm acesso a nada.
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke all on all sequences in schema public from anon;

-- Base: utilizadores autenticados só leem; escrita concedida tabela a tabela.
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Perfis: o próprio e os colegas de casa
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.household_members a
    join public.household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Casas e membros
-- ---------------------------------------------------------------------
create policy households_select on public.households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));
grant update (name, budget_alert_thresholds, expiry_alert_days) on public.households to authenticated;

create policy members_select on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
-- O dono pode remover membros; qualquer membro pode sair.
create policy members_delete on public.household_members for delete to authenticated
  using (user_id = auth.uid() or (public.is_household_owner(household_id) and role <> 'owner'));
grant delete on public.household_members to authenticated;

create policy invites_select on public.household_invites for select to authenticated
  using (public.is_household_member(household_id));
create policy invites_update on public.household_invites for update to authenticated
  using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
grant update (revoked_at) on public.household_invites to authenticated;

-- ---------------------------------------------------------------------
-- Tabelas de catálogo (CRUD para membros)
-- ---------------------------------------------------------------------
create policy categories_all on public.categories for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
grant insert, update, delete on public.categories to authenticated;

create policy locations_all on public.locations for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
grant insert, update, delete on public.locations to authenticated;

-- Produtos: criados por função (create_product). A quantidade e os preços
-- só mudam através de movimentos/compras — não há permissão de UPDATE nessas colunas.
create policy products_select on public.products for select to authenticated
  using (public.is_household_member(household_id));
create policy products_update on public.products for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
grant update (name, brand, category_id, location_id, unit, min_quantity, ideal_quantity, auto_restock,
              package_size, package_unit, photo_path, notes, archived, aliases)
  on public.products to authenticated;
-- Produtos não se apagam (preserva o histórico): arquivam-se (archived = true).

create policy lots_select on public.inventory_lots for select to authenticated
  using (public.is_household_member(household_id));
-- Corrigir a data de validade de um lote é permitido; a quantidade não.
create policy lots_update on public.inventory_lots for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
grant update (expires_on) on public.inventory_lots to authenticated;

-- ---------------------------------------------------------------------
-- Movimentos, compras: só leitura direta (escrita por função)
-- ---------------------------------------------------------------------
create policy movements_select on public.stock_movements for select to authenticated
  using (public.is_household_member(household_id));
create policy purchases_select on public.purchases for select to authenticated
  using (public.is_household_member(household_id));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------
-- Faturas: o membro cria o registo do upload; a interpretação é feita no servidor.
-- ---------------------------------------------------------------------
create policy receipts_select on public.receipts for select to authenticated
  using (public.is_household_member(household_id));
create policy receipts_insert on public.receipts for insert to authenticated
  with check (public.is_household_member(household_id) and uploaded_by = auth.uid() and status = 'uploaded');
grant insert (id, household_id, file_path, file_sha256, mime_type, uploaded_by, status) on public.receipts to authenticated;

create policy receipt_items_select on public.receipt_items for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------
-- Lista de compras
-- ---------------------------------------------------------------------
create policy lists_select on public.shopping_lists for select to authenticated
  using (public.is_household_member(household_id));

create policy items_all on public.shopping_list_items for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id)
              and list_id in (select id from public.shopping_lists where household_id = shopping_list_items.household_id));
grant insert (id, list_id, household_id, product_id, custom_name, quantity, source, note, created_by)
  on public.shopping_list_items to authenticated;
grant update (quantity, status, checked, checked_by, checked_at, note, custom_name)
  on public.shopping_list_items to authenticated;
grant delete on public.shopping_list_items to authenticated;

-- ---------------------------------------------------------------------
-- Orçamentos
-- ---------------------------------------------------------------------
create policy budgets_all on public.monthly_budgets for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
grant insert, update, delete on public.monthly_budgets to authenticated;

-- ---------------------------------------------------------------------
-- Notificações e auditoria
-- ---------------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (public.is_household_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = auth.uid());
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------
-- Funções expostas à aplicação
-- ---------------------------------------------------------------------
grant execute on function
  public.is_household_member(uuid),
  public.create_household(text),
  public.create_invite(uuid, text),
  public.invite_info(text),
  public.accept_invite(text),
  public.create_product(uuid, text, text, uuid, uuid, text, numeric, numeric, numeric, date, text, numeric, text, boolean, text, uuid),
  public.record_movement(uuid, uuid, text, numeric, text, timestamptz, boolean, date, text),
  public.confirm_purchase(uuid, uuid, jsonb, uuid, boolean),
  public.void_purchase(uuid, text, boolean, boolean),
  public.update_purchase(uuid, text, date, numeric, text, text),
  public.discard_receipt(uuid),
  public.find_duplicate_purchases(uuid, text, date, numeric, text),
  public.refresh_expiry_notifications(uuid),
  public.mark_notifications_read(uuid[]),
  public.budget_for(uuid, date),
  public.default_list_id(uuid),
  public.norm_text(text),
  public.store_chain_of(text)
to authenticated;
-- As funções internas (_apply_movement, seed_household, audit, check_budget_alerts,
-- refresh_product_prices, products_after_change) NÃO são executáveis pela aplicação.

-- ---------------------------------------------------------------------
-- Armazenamento privado (faturas e fotografias)
-- Caminho obrigatório: <household_id>/<ficheiro>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']),
       ('product-photos', 'product-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy storage_household_read on storage.objects for select to authenticated
  using (bucket_id in ('receipts','product-photos')
         and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy storage_household_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('receipts','product-photos')
              and public.is_household_member(((storage.foldername(name))[1])::uuid));
-- Faturas não podem ser apagadas nem substituídas pela app (prova da despesa); fotos sim.
create policy storage_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy storage_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- Sincronização em tempo real (respeita RLS)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['products','stock_movements','shopping_list_items','purchases','receipts',
                             'inventory_lots','notifications','categories','locations','monthly_budgets',
                             'household_members']
    loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
