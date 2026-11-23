# Casa em Stock — Guia de instalação e publicação

Este guia leva a aplicação do código até um endereço próprio na internet, instalada no iPhone e partilhada com o Vitor.
São precisos cerca de **30–45 minutos**. Não é preciso saber programar: basta copiar e colar.

> Nada disto depende do Claude. Depois de concluído, a aplicação funciona sozinha: o código é seu (GitHub),
> a base de dados é sua (Supabase), o alojamento é seu (Vercel) e a chave de leitura de faturas é sua (Anthropic).

---

## 0. O que vai precisar

| Conta | Para quê | Custo |
|---|---|---|
| GitHub (já tem: `vitort2t/repo-ex`) | Guardar o código | Grátis |
| [Supabase](https://supabase.com) | Base de dados, contas, ficheiros, sincronização | Grátis (plano Free) |
| [Vercel](https://vercel.com) | Publicar a aplicação num endereço próprio | Grátis (plano Hobby) |
| [Anthropic Console](https://console.anthropic.com) | Leitura automática de faturas | Pago por utilização (cêntimos por fatura) |

A leitura de faturas é **opcional**: sem a chave da Anthropic, a aplicação funciona na mesma e os dados das faturas introduzem-se à mão no ecrã de revisão.

---

## 1. Criar o projeto Supabase

1. Entre em <https://supabase.com/dashboard> → **New project**.
2. Nome: `casa-em-stock`. Região: **West EU (Ireland)** ou **Central EU (Frankfurt)** — fica perto de Portugal.
3. Defina uma *Database password* forte e **guarde-a** num gestor de palavras-passe.
4. Aguarde 1–2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas (base de dados)

**Opção A — sem instalar nada (recomendada):**

1. No Supabase, abra **SQL Editor** → **New query**.
2. Copie o conteúdo de `supabase/migrations/20261123000001_schema.sql`, cole e carregue em **Run**.
3. Repita, **por esta ordem**, para:
   - `supabase/migrations/20261123000002_logic.sql`
   - `supabase/migrations/20261123000003_security.sql`
4. Cada execução deve terminar com "Success. No rows returned".

**Opção B — com a linha de comandos do Supabase:**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <REF_DO_PROJETO>     # o REF está no URL do painel
supabase db push
```

O que fica criado: todas as tabelas, as regras de segurança (RLS) que isolam cada casa, as funções que atualizam
o stock de forma transacional, os dois "baldes" privados de ficheiros (`receipts` e `product-photos`) e a
sincronização em tempo real.

## 3. Configurar a autenticação

No Supabase → **Authentication**:

1. **Sign In / Providers → Email**: ativo. Mantenha **Confirm email** ligado (recomendado).
2. **URL Configuration**:
   - *Site URL*: o endereço final da aplicação (ex.: `https://casa-em-stock.vercel.app`). Pode voltar aqui depois do passo 6.
   - *Redirect URLs*: adicione `https://casa-em-stock.vercel.app/**` e, para testes locais, `http://localhost:5173/**`.
3. (Opcional) **Emails → Templates**: traduza os e-mails de confirmação e recuperação para português.
4. Nota: o envio de e-mails incluído no Supabase tem um limite baixo por hora. Para duas pessoas chega;
   se precisar de mais, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.

## 4. Obter as chaves públicas

No Supabase → **Project Settings → API** (ou **Data API**), copie:

- **Project URL** → será `VITE_SUPABASE_URL`
- **anon / public key** (ou *publishable key*) → será `VITE_SUPABASE_ANON_KEY`

Estas duas chaves são públicas por natureza (vão para o browser); os dados estão protegidos pelas regras RLS.
**Nunca** use a `service_role` key no frontend nem a coloque no Vercel.

## 5. Configurar a leitura de faturas (opcional, recomendado)

1. Em <https://console.anthropic.com> crie uma conta, adicione um método de pagamento e crie uma **API key**.
   Defina um limite mensal de gastos (ex.: 5 €) em *Billing → Limits*.
2. Instale a linha de comandos do Supabase (ver 2B) e, na pasta do projeto:

```bash
supabase link --project-ref <REF_DO_PROJETO>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...            # a sua chave — fica só no servidor
supabase secrets set ALLOWED_ORIGINS=https://casa-em-stock.vercel.app
# opcional: escolher outro modelo (por omissão: claude-opus-5-5)
# supabase secrets set RECEIPT_AI_MODEL=claude-haiku-5-5
supabase functions deploy parse-receipt
```

A chave fica guardada nos segredos da Edge Function e nunca chega ao telemóvel.
Para mudar de fornecedor de IA no futuro, basta implementar outro `ReceiptParser` em
`supabase/functions/parse-receipt/parser.ts` e definir `RECEIPT_AI_PROVIDER`.

## 6. Publicar no Vercel

1. Entre em <https://vercel.com> com a conta do GitHub → **Add New… → Project** → importe `vitort2t/repo-ex`.
2. **Root Directory**: `app`. Framework: **Vite** (detetado automaticamente).
3. **Environment Variables**:
   - `VITE_SUPABASE_URL` = Project URL do passo 4
   - `VITE_SUPABASE_ANON_KEY` = anon key do passo 4
4. **Deploy**. Em ~1 minuto recebe um endereço do tipo `https://casa-em-stock.vercel.app`.
5. Para o **link definitivo**: em *Settings → Domains* pode mudar o nome do subdomínio `.vercel.app` (grátis)
   ou ligar um domínio próprio (ex.: `casaemstock.pt`, ~10–15 €/ano no registador).
6. Volte ao passo 3 e confirme que *Site URL* e *Redirect URLs* usam este endereço final.

Atualizações futuras: cada alteração enviada para o ramo principal do GitHub é publicada automaticamente.
Os dados estão no Supabase, por isso **atualizar a aplicação nunca apaga dados**.

## 7. Criar a sua conta e a casa

1. Abra o endereço no iPhone, em **Safari**.
2. **Criar conta** → nome, e-mail e palavra-passe → confirme o e-mail recebido.
3. Ao entrar, crie a casa **"A Nossa Casa"**. As categorias e localizações base são criadas automaticamente.

## 8. Instalar no ecrã inicial do iPhone

1. No Safari, com a aplicação aberta, toque em **Partilhar** (quadrado com seta).
2. **Adicionar ao ecrã principal** → **Adicionar**.
3. Abra a partir do ícone "Casa em Stock": abre em ecrã inteiro, como uma aplicação normal, e mantém a sessão.

No Android (Chrome): menu ⋮ → **Instalar aplicação**. No computador (Chrome/Edge): ícone de instalar na barra de endereço.

## 9. Convidar o Vitor

1. Na aplicação: **Mais → A Nossa Casa → Convidar** → e-mail do Vitor → **Criar convite**.
2. Envie a ligação (WhatsApp, SMS, e-mail) pela folha de partilha do iPhone.
3. O Vitor abre a ligação, cria a conta **com esse mesmo e-mail**, confirma o e-mail e aceita o convite.
4. A partir daí veem os dois o mesmo stock, lista, faturas e relatórios, com sincronização em tempo real.

O convite é válido 14 dias e só funciona com o e-mail indicado.

---

## Desenvolvimento local (opcional)

```bash
cd app
cp .env.example .env.local      # preencher com as chaves do passo 4
npm install
npm run dev                     # http://localhost:5173
npm test                        # testes unitários
```

Testes da base de dados (precisa de PostgreSQL 15+ local):

```bash
PGHOST=/var/run/postgresql PGPORT=5432 supabase/tests/run.sh
```

## Cópias de segurança e recuperação

- **Mais → Exportar dados → Exportar tudo (Excel)** gera uma cópia completa legível (inventário, movimentos, compras, artigos).
- No plano Free do Supabase não há cópias automáticas diárias com restauro; no plano Pro (25 $/mês) existem.
  Em alternativa gratuita: `supabase db dump -f backup.sql` periodicamente.
- Nada é apagado de forma destrutiva pela aplicação: produtos arquivam-se, compras anulam-se (ficam no histórico),
  faturas originais não podem ser apagadas pela app, e todas as operações importantes ficam no registo de auditoria (`audit_log`).
- Atenção: projetos Free do Supabase **pausam após 7 dias sem utilização**. Com uso diário isto não acontece;
  se acontecer, basta reativar no painel (os dados mantêm-se).
