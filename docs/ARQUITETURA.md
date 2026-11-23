# LAR. — Arquitetura

> **LAR.** — *A vida da casa, em equilíbrio.* Plataforma privada de gestão doméstica e financeira da família.

## Identidade visual

| Cor | Hex | Uso |
|---|---|---|
| Azul profundo | `#14263D` | Estrutura: botões principais, navegação, entradas nos gráficos |
| Vinho | `#642C40` | Personalidade: “+ Novo movimento”, saídas nos gráficos, destaques |
| Ameixa | `#806071` | Complemento: Heitor, slogan |
| Champanhe | `#F4EDE5` | Fundos secundários |
| Taupe | `#CBB99F` | Detalhes subtis |
| Branco | `#FFFFFF` | Cartões e superfícies |

Verde, amarelo e vermelho só para estados (sucesso, atenção, alerta). Tipografia: Manrope.
Logótipo oficial: casa em contorno linear com abertura no canto inferior esquerdo e quatro janelas 2 × 2
(`app/src/components/Logo.tsx`; ficheiros em `docs/marca/`: a cores, monocromático para fundos claros e para fundos escuros).
Ícone da app e favicon: só o símbolo.

## Tecnologias

| Camada | Escolha | Porquê |
|---|---|---|
| Interface | React 19 + TypeScript + Tailwind CSS (Vite) | Rápida, tipada, mobile-first |
| App instalável | PWA (vite-plugin-pwa / Workbox) | Instala no ecrã inicial do iPhone sem App Store |
| Base de dados | Supabase / PostgreSQL | Relacional, transações, RLS, gratuito para 2 pessoas |
| Contas | Supabase Auth (e-mail + palavra-passe) | Recuperação de palavra-passe e sessão persistente incluídas |
| Sincronização | Supabase Realtime (postgres_changes, respeita RLS) | Alterações de um membro aparecem de imediato no outro |
| Ficheiros | Supabase Storage (baldes privados, URLs assinados de 1 h) | Faturas nunca públicas |
| Leitura de faturas | Supabase Edge Function `parse-receipt` + API Anthropic (configurável) | Chave só no servidor; troca de fornecedor isolada em `parser.ts` |
| Offline | TanStack Query persistido em IndexedDB + fila de operações | Consulta sem internet; movimentos sincronizados depois |
| Alojamento | Vercel (estático) | Grátis, HTTPS, publicação automática a partir do GitHub |

**Leitura de faturas sem OCR separado:** o modelo lê diretamente a imagem/PDF (visão), o que é mais fiável em
talões térmicos do que OCR + interpretação em dois passos. O resultado passa sempre por validação determinística
(`supabase/functions/_shared/receipt-logic.ts`): IDs de produtos inventados são ignorados, preços unitários
incoerentes geram aviso, nada é estimado, e os totais são conciliados.

## Estrutura de pastas

```
app/                         aplicação web (Vercel → Root Directory = app)
  src/lib/                   tipos, formatação pt-PT, estatísticas, fila offline, exportação
  src/hooks/                 autenticação/casa, consultas, tempo real, mutações
  src/components/            UI base, folhas de movimento, painel de supermercados
  src/pages/                 ecrãs
  src/test/                  testes unitários (Vitest)
supabase/
  migrations/                esquema, lógica transacional, segurança (aplicar por ordem)
  functions/parse-receipt/   Edge Function de leitura de faturas
  functions/_shared/         lógica pura partilhada (associação, saneamento, conciliação)
  tests/                     testes de integração SQL (PostgreSQL local)
docs/                        instalação, arquitetura, testes
```

## Modelo de dados

`profiles`, `households`, `household_members`, `household_invites`, `categories`, `locations`, `products`,
`inventory_lots`, `stock_movements`, `shopping_lists`, `shopping_list_items`, `receipts`, `receipt_items`,
`purchases`, `purchase_items`, `monthly_budgets`, `notifications`, `notification_reads`, `audit_log`.
Vistas: `price_history`, `expiring_lots`. (`users` é o `auth.users` do Supabase.)

Todas as tabelas têm UUID, `created_at`/`updated_at`, chaves estrangeiras e `household_id` para isolamento.

### Regras de integridade principais

- **Stock só muda por movimentos.** A coluna `products.quantity` não pode ser alterada pela app (sem permissão de UPDATE);
  muda apenas em `record_movement`, `confirm_purchase`, `void_purchase` e `create_product`, todas transacionais,
  com bloqueio da linha (`FOR UPDATE`) — dois telemóveis em simultâneo nunca perdem atualizações.
- **Idempotência:** movimentos e compras levam um ID gerado no dispositivo. Reenviar (rede instável, modo offline,
  duplo toque) devolve o registo original em vez de duplicar.
- **Stock negativo** exige `p_allow_negative = true`, que a app só envia após confirmação explícita.
- **Faturas duplicadas:** (1) o mesmo ficheiro (SHA-256) não entra duas vezes; (2) o mesmo nº de documento/ATCUD na
  mesma cadeia é bloqueado; (3) mesma loja + data + total exige confirmação explícita; (4) uma fatura só gera uma compra confirmada.
- **Confirmação de compra** (`confirm_purchase`) numa única transação: valida, cria a compra e linhas, cria produtos novos,
  adiciona stock (com validade, se indicada), aprende o nome da fatura como alias, retira da lista os produtos comprados,
  recalcula preços, marca a fatura como confirmada, verifica alertas de orçamento e regista auditoria.
- **Anulação** (`void_purchase`): reverte o stock (opcional), exclui a compra de todas as estatísticas e pode reabrir a fatura para correção.
- **Lista automática:** um trigger em `products` insere/remove itens quando o stock cruza o mínimo; dispensar um item
  automático mantém-no fora até o produto ser reposto.
- **Validades (FEFO):** as saídas consomem primeiro os lotes que expiram mais cedo.

### Segurança

- RLS em todas as tabelas: cada pedido só vê linhas de casas de que o utilizador é membro (`is_household_member`).
- `anon` sem acesso a nada; `authenticated` só lê, com escrita concedida coluna a coluna onde faz sentido.
- Funções internas (`_apply_movement`, etc.) não são executáveis pela app.
- Storage: caminho `<household_id>/…`, política por membro; faturas não podem ser apagadas nem substituídas pela app.
- Segredos (chave da IA, service role) só nos segredos da Edge Function.
- A Edge Function verifica a sessão, lê a fatura com as permissões do utilizador (RLS) e só depois escreve com a chave de serviço.

## Módulo financeiro

Tabelas: `fin_people` (Ana, Vitor e beneficiários como o Heitor), `fin_accounts`, `fin_categories` (categorias e subcategorias),
`fin_transactions` (livro-razão único), `fin_heitor_transfers` (EUR, BRL, taxa aplicada, taxas), `fin_recurring`, `fin_budgets`,
`fin_goals`, `fin_imports`. Vistas: `fin_account_balances`, `fin_goal_progress`.

Regras contabilísticas (garantidas na base de dados e testadas em `supabase/tests/20_finance.sql`):

1. Só contam valores **realizados**; previstos e pendentes aparecem à parte em todos os ecrãs e relatórios.
2. **Transferências entre contas próprias** (incl. poupança e pagamento de cartão) são dois movimentos com o mesmo `transfer_group`,
   natureza `transfer` — nunca rendimento nem despesa. Anular uma anula as duas pernas.
3. **Cartão de crédito:** a compra é despesa na conta do cartão; o pagamento do cartão é transferência — nunca há dupla contagem.
4. **Supermercado:** cada compra confirmada gera automaticamente **um** movimento (`purchase_id` único) em Alimentação › Supermercado;
   corrigir/anular a compra atualiza/anula esse movimento.
5. **Heitor:** cada envio é despesa (apoio familiar) = valor enviado + taxas; a taxa de câmbio efetiva fica guardada e nunca é recalculada.
6. **Despesas partilhadas** são um único movimento, com quem pagou e o tipo (partilhada/individual).
7. **Extratos** (CSV lido no telemóvel; PDF pela Edge Function `parse-statement`) são revistos antes de gravar; duplicados
   (ex. a compra já registada pela fatura) são detetados e podem ser associados em vez de criados; transferências não são presumidas.
8. Escrita nos movimentos só por funções transacionais (`fin_create_movement`, `fin_update_movement`, `fin_confirm_movement`,
   `fin_cancel_movement`, `fin_import_movements`); todas as alterações às tabelas financeiras ficam no `audit_log` (antes/depois).

Saldos: **real** (saldo inicial + realizados), **disponível** (contas à ordem − reservado − previsto/pendente do mês),
**pendente**, **reservado** (valor marcado em cada conta + poupanças) e **consolidado** (EUR; BRL à parte).

## Sincronização e offline

- Ao abrir, a app subscreve as alterações da casa (Realtime). Cada alteração invalida as consultas afetadas e o ecrã atualiza.
- Ao reconectar, tudo é recarregado — não há versões divergentes: a fonte de verdade é sempre a base de dados.
- Os dados carregados ficam em IndexedDB (7 dias) para consulta sem internet.
- Sem internet podem fazer-se **entradas/saídas de stock** e **marcar artigos da lista**; ficam numa fila local e são
  enviados por ordem quando a ligação volta. Como os movimentos são deltas idempotentes, não há conflitos nem duplicações.
  Se algum for recusado (ex. stock insuficiente), o utilizador é avisado.
- Operações que exigem internet: importar faturas, confirmar compras, criar produtos, convites.

## Custos estimados (valores indicativos — confirme nos sites oficiais)

| Serviço | Plano | Custo |
|---|---|---|
| Supabase | Free (500 MB BD, 1 GB ficheiros) | 0 € — suficiente para anos de uso por 2 pessoas. Pro 25 $/mês se quiser cópias diárias automáticas e sem pausa por inatividade |
| Vercel | Hobby (uso pessoal) | 0 € |
| Anthropic API | por utilização | Com `claude-opus-5-5` (4 $/M tokens entrada, 20 $/M saída): ~0,03–0,10 € por fatura → **~0,50–1,50 €/mês** com 15 faturas. Com `claude-haiku-5-5` o custo é muito menor, com leitura possivelmente menos fiável |
| Domínio próprio | opcional | ~10–15 €/ano |

## Limitações conhecidas

- **Relatórios PDF** usam a impressão do sistema (“Guardar como PDF”), com layout de impressão próprio.
- **Acesso bancário direto** não existe (exigiria integração oficial e consentimento); usa-se a importação de extratos.
- **Notificações push** nos telemóveis não estão implementadas nesta versão (as notificações internas estão).
  No iPhone exigem iOS 16.4+, app instalada no ecrã inicial e um serviço de envio (Web Push com chaves VAPID) — é a próxima evolução natural.
- Os alertas de validade são gerados quando alguém abre a app (não há tarefa agendada no servidor).
- Uma conta pode pertencer a várias casas na base de dados, mas a interface mostra a casa a que aderiu mais recentemente.
