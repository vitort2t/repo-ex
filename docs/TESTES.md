# LAR. — Testes

## Testes automáticos incluídos

| Conjunto | Como correr | O que cobre |
|---|---|---|
| Base de dados — inventário (44 verificações + 18 recusas) | `supabase/tests/run.sh` (PostgreSQL local) | Contas e perfis, casa, convites, permissões, movimentos, idempotência, stock negativo, lista automática, notificações, isolamento entre casas, confirmação de faturas, duplicados, orçamento, anulação, correção, validades (FEFO) |
| Base de dados — finanças (47 verificações + 11 recusas) | `supabase/tests/run.sh` | Regras contabilísticas, transferências e poupança, cartão de crédito, Heitor (câmbio guardado), faturas sem duplicar, recorrências, orçamentos e alertas, objetivos, importação e duplicados, isolamento entre casas |
| Unitários (41) | `cd app && npm test` | Períodos e estatísticas por supermercado, associação de artigos ao inventário, saneamento do resultado da IA, conciliação, quantidade sugerida, CSV |
| Renderização | build de produção + Playwright com backend simulado | Todos os ecrãs principais renderizam em iPhone 14 sem erros de JavaScript |

## Os 20 testes obrigatórios — estado

Legenda: ✅ verificado nesta entrega · 🟡 lógica verificada; falta confirmar no ambiente real · ⏳ só possível com as suas contas/dispositivos

| # | Teste | Estado | Notas |
|---|---|---|---|
| 1 | Criar uma conta | 🟡 | Perfil automático testado na BD; o registo real depende do Supabase Auth do seu projeto |
| 2 | Convidar o segundo utilizador | ✅ BD / ⏳ real | Convite, e-mail errado recusado, só o administrador convida |
| 3 | Mesma casa nos dois telemóveis | ✅ BD / ⏳ real | Ambos os membros veem os mesmos dados |
| 4 | Criar um produto | ✅ | Com stock inicial e movimento "Stock inicial" |
| 5 | Registar uma entrada | ✅ | |
| 6 | Registar uma saída | ✅ | Com motivo, data, utilizador |
| 7 | Confirmar sincronização | 🟡 | Dados partilhados e consistentes (BD); tempo real entre dois telemóveis só testável com o projeto Supabase ativo |
| 8 | Adicionar produtos à lista de compras | ✅ | Automática (mínimo/esgotado) e manual |
| 9 | Importar fatura em PDF | ⏳ | Fluxo implementado; requer chave Anthropic e uma fatura real |
| 10 | Importar fotografia de fatura | ⏳ | Idem; a imagem é reduzida no telemóvel antes do envio |
| 11 | Corrigir os dados extraídos | 🟡 | Ecrã de revisão verificado com dados simulados |
| 12 | Confirmar a compra | ✅ | Transação única |
| 13 | Verificar atualização do stock | ✅ | |
| 14 | Verificar atualização das despesas | ✅ | Inclui painel "Onde gastamos o nosso dinheiro?" |
| 15 | Importar a mesma fatura novamente | ✅ | Mesmo ficheiro, mesmo ATCUD, mesma loja/data/total |
| 16 | Confirmar que não existe duplicação | ✅ | |
| 17 | Consultar relatórios mensais | 🟡 | Cálculos testados; ecrã verificado com dados simulados |
| 18 | Testar permissões de acesso | ✅ | Outra casa não vê nem altera nada; funções internas bloqueadas |
| 19 | Utilização em telemóvel | 🟡 | Ecrãs verificados em viewport de iPhone; falta experimentar no seu iPhone |
| 20 | Sem internet e sincronização posterior | 🟡 | Fila offline idempotente implementada; testar no telemóvel (modo de avião → retirar produto → voltar a ligar) |

## Roteiro de aceitação (para fazer com o Vitor, ~15 min)

1. Ambos entram nas respetivas contas (iPhone instalado no ecrã inicial).
2. Ana cria "Leite meio-gordo", stock 6, mínimo 2, ideal 6. → Vitor vê-o em segundos.
3. Vitor retira 4 → Ana vê 2 e o leite aparece na lista de compras.
4. Vitor abre "No supermercado", marca o leite → Ana vê-o marcado.
5. Ana fotografa uma fatura real → revê → confirma. Stock sobe, a despesa aparece em Despesas e no painel por supermercado.
6. Tenta importar a mesma fotografia/PDF → aviso de fatura já importada.
7. Modo de avião no iPhone: retirar 1 iogurte → desligar o modo de avião → o movimento aparece no outro telemóvel.
8. Despesas → Relatórios → exportar Excel.
9. Despesas → abrir a compra → "Anular ou corrigir" → os gráficos deixam de a contar.

## Módulo financeiro — estado

| Funcionalidade | Estado |
|---|---|
| Entradas, saídas, previsto/pendente/realizado, confirmação | ✅ BD + ecrã |
| Contas e saldos real/disponível/pendente/reservado/consolidado | ✅ BD + ecrã |
| Transferências e poupança (sem contar como despesa) | ✅ BD |
| Cartão de crédito sem dupla contagem | ✅ BD |
| Heitor: EUR/BRL, taxa guardada, relatórios | ✅ BD + ecrã |
| Faturas de supermercado nas despesas sem duplicar | ✅ BD |
| Recorrências e alertas de vencimento | ✅ BD + ecrã |
| Orçamentos (total/categoria/pessoa) e alertas 50/75/90/100% | ✅ BD + ecrã |
| Objetivos | ✅ BD + ecrã |
| Importação CSV | ✅ unitário + BD |
| Importação PDF | ⏳ requer a chave da IA e um extrato real |
| Relatórios Excel / PDF | 🟡 implementados; confirmar no dispositivo |
| Tempo real entre os dois telemóveis | ⏳ requer o projeto Supabase ativo |
