feat: implementar sistema de relatórios e dashboard administrativo

Implementa sistema completo de relatórios em PDF, dashboard administrativo com métricas, e modais de detalhes financeiros.

## Funcionalidades Principais

- **Sistema de Relatórios**: API e gerenciador para geração de 16 tipos de relatórios em PDF e relatórios financeiros detalhados
- **Dashboard Administrativo**: Manager com métricas, gráficos, cache e atualização automática, além de validador de qualidade
- **Modais Financeiros**: CMV-Pedido, Venda-Pedido e Movimentação com detalhes completos
- **Templates de Recorrência**: Templates centralizados para modais de regras de recorrência

## Arquivos Novos

- `src/js/api/reports.js` - API de relatórios
- `src/js/ui/admin/dashboard-manager.js` - Gerenciador de dashboard
- `src/js/ui/admin/dashboard-validator.js` - Validador de dashboard
- `src/js/ui/admin/relatorios-manager.js` - Gerenciador de relatórios
- `src/js/utils/modal-content-cmv-pedido.js` - Modal CMV
- `src/js/utils/modal-content-venda-pedido.js` - Modal venda
- `src/js/utils/modal-content-movimentacao-detalhes.js` - Modal movimentação
- `src/js/utils/recurrence-modal-templates.js` - Templates de recorrência

## Melhorias

- Padronização de parâmetros de API e paginação
- Melhorias nos gerenciadores administrativos
- Tratamento de erros aprimorado

