feat: implementar sistema de relatórios e dashboard administrativo

Implementa sistema completo de relatórios em PDF, dashboard administrativo
com métricas e visualizações, e modais de detalhes financeiros.

## Novos Módulos

- Sistema de Relatórios (API + Manager)
  - Geração de relatórios em PDF (16 tipos)
  - Relatórios financeiros detalhados
  - Filtros por período e cache de 5 minutos

- Dashboard Administrativo
  - Manager com métricas, gráficos e atualização automática
  - Validator para testes de qualidade
  - Cache com TTL e debounce

- Modais de Detalhes Financeiros
  - CMV-Pedido: custos e margem de lucro
  - Venda-Pedido: receita e pagamentos
  - Movimentação: detalhes completos

- Templates de Recorrência
  - Templates centralizados para modais

## Melhorias

- Padronização de parâmetros de API
- Melhorias em gerenciadores administrativos
- Tratamento de erros aprimorado

