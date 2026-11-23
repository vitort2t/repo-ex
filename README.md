# Casa em Stock

Aplicação web instalável (PWA) para gerir o stock, a lista de compras, as faturas e as despesas de supermercado da casa —
partilhada entre os membros da família, com sincronização em tempo real.

- **Stock** com entradas/saídas, histórico, validades (consumir primeiro), localizações e categorias.
- **Lista de compras inteligente** alimentada pelo stock, com modo supermercado.
- **Leitura automática de faturas** (PDF ou fotografia) com revisão antes de confirmar e deteção de duplicados.
- **Despesas**, orçamento mensal com alertas, histórico de preços, relatórios mensais/anuais e
  **"Onde gastamos o nosso dinheiro?"** — comparação entre supermercados.
- Exportação CSV/Excel, funcionamento offline para consulta e movimentos.

Tecnologia: React + TypeScript + Tailwind (Vite, PWA) · Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions) · Vercel.

| Documento | Conteúdo |
|---|---|
| [docs/INSTALACAO.md](docs/INSTALACAO.md) | Passo a passo: Supabase, chaves, leitura de faturas, Vercel, iPhone, convidar |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Arquitetura, modelo de dados, segurança, offline, custos |
| [docs/TESTES.md](docs/TESTES.md) | Testes automáticos e estado dos 20 testes obrigatórios |
