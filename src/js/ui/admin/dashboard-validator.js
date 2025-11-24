/**
 * Dashboard Validator - Utilitário de Validação do Dashboard
 * Script auxiliar para executar validações do dashboard no console do navegador
 * 
 * @module DashboardValidator
 * @example
 * // No console do navegador:
 * import { runDashboardValidation } from './dashboard-validator.js';
 * await runDashboardValidation();
 */

/**
 * Executa validação completa do dashboard
 * Pode ser chamado no console do navegador após o dashboard estar carregado
 * 
 * @returns {Promise<void>}
 * @example
 * // No console do navegador:
 * await runDashboardValidation();
 */
export async function runDashboardValidation() {
    // ALTERAÇÃO: Verificar se DashboardManager está disponível
    if (!window.adminPanel || !window.adminPanel.managers || !window.adminPanel.managers.dashboard) {
        console.error('❌ DashboardManager não está disponível. Certifique-se de que o dashboard foi inicializado.');
        return;
    }

    const dashboard = window.adminPanel.managers.dashboard;

    console.log('🧪 Iniciando validação do dashboard...\n');

    try {
        // ALTERAÇÃO: Executar todas as validações
        const results = await dashboard.runAllValidations();

        // ALTERAÇÃO: Exibir resultados
        console.log('📊 Resultados da Validação:');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`📅 Data/Hora: ${new Date(results.timestamp).toLocaleString('pt-BR')}`);
        console.log(`✅ Score Geral: ${results.overall.score.toFixed(1)}%`);
        console.log(`📈 Testes Passados: ${results.overall.passedTests}/${results.overall.totalTests}`);
        console.log(`🎯 Status: ${results.overall.isValid ? '✅ APROVADO' : '❌ REPROVADO'}`);
        console.log('═══════════════════════════════════════════════════════\n');

        // ALTERAÇÃO: Validação Funcional
        console.log('🔍 Validação Funcional:');
        if (results.functional.isValid) {
            console.log('  ✅ Dashboard está funcional');
        } else {
            console.log('  ❌ Dashboard tem problemas funcionais:');
            results.functional.errors.forEach(error => {
                console.log(`    - ${error}`);
            });
        }
        if (results.functional.warnings.length > 0) {
            console.log('  ⚠️ Avisos:');
            results.functional.warnings.forEach(warning => {
                console.log(`    - ${warning}`);
            });
        }
        console.log('');

        // ALTERAÇÃO: Validação de Performance
        console.log('⚡ Validação de Performance:');
        if (results.performance.isValid) {
            console.log('  ✅ Performance está dentro do esperado');
        } else {
            console.log('  ⚠️ Performance pode ser melhorada:');
        }
        console.log(`  ⏱️ Tempo de Carregamento: ${results.performance.metrics.loadTime?.toFixed(2) || 'N/A'}ms`);
        console.log(`  📊 Tempo de Renderização de Gráficos: ${results.performance.metrics.chartsRenderTime?.toFixed(2) || 'N/A'}ms`);
        if (results.performance.metrics.memoryUsage) {
            const memoryMB = (results.performance.metrics.memoryUsage.used / 1024 / 1024).toFixed(2);
            console.log(`  💾 Uso de Memória: ${memoryMB}MB`);
        }
        if (results.performance.warnings.length > 0) {
            console.log('  ⚠️ Avisos:');
            results.performance.warnings.forEach(warning => {
                console.log(`    - ${warning}`);
            });
        }
        console.log('');

        // ALTERAÇÃO: Validação de Responsividade
        console.log('📱 Validação de Responsividade:');
        if (results.responsiveness.isValid) {
            console.log('  ✅ Dashboard é responsivo');
        } else {
            console.log('  ⚠️ Problemas de responsividade detectados:');
        }
        const breakpoint = results.responsiveness.breakpoints.desktop ? 'Desktop' :
                          results.responsiveness.breakpoints.tablet ? 'Tablet' : 'Mobile';
        console.log(`  📐 Breakpoint Atual: ${breakpoint}`);
        if (results.responsiveness.warnings.length > 0) {
            console.log('  ⚠️ Avisos:');
            results.responsiveness.warnings.forEach(warning => {
                console.log(`    - ${warning}`);
            });
        }
        console.log('');

        // ALTERAÇÃO: Validação de Tratamento de Erros
        console.log('🚨 Validação de Tratamento de Erros:');
        if (results.errorHandling.isValid) {
            console.log('  ✅ Tratamento de erros está implementado');
        } else {
            console.log('  ⚠️ Melhorias no tratamento de erros:');
        }
        console.log(`  🔌 Tratamento de API Offline: ${results.errorHandling.tests.offlineHandling ? '✅' : '❌'}`);
        console.log(`  📭 Tratamento de Dados Vazios: ${results.errorHandling.tests.emptyDataHandling ? '✅' : '❌'}`);
        console.log(`  💬 Mensagens de Erro: ${results.errorHandling.tests.errorMessages ? '✅' : '❌'}`);
        console.log(`  ⏳ Loading States: ${results.errorHandling.tests.loadingStates ? '✅' : '❌'}`);
        if (results.errorHandling.warnings.length > 0) {
            console.log('  ⚠️ Avisos:');
            results.errorHandling.warnings.forEach(warning => {
                console.log(`    - ${warning}`);
            });
        }
        console.log('');

        // ALTERAÇÃO: Resumo final
        console.log('═══════════════════════════════════════════════════════');
        if (results.overall.isValid) {
            console.log('✅ Dashboard está funcionando corretamente!');
        } else {
            console.log('⚠️ Dashboard precisa de ajustes. Verifique os avisos acima.');
        }
        console.log('═══════════════════════════════════════════════════════');

        // ALTERAÇÃO: Retornar resultados para uso programático
        return results;

    } catch (error) {
        console.error('❌ Erro ao executar validação:', error);
        throw error;
    }
}

/**
 * Executa validação rápida do dashboard (apenas funcional)
 * 
 * @returns {Object} Resultado da validação funcional
 */
export function runQuickValidation() {
    if (!window.adminPanel || !window.adminPanel.managers || !window.adminPanel.managers.dashboard) {
        console.error('❌ DashboardManager não está disponível.');
        return null;
    }

    const dashboard = window.adminPanel.managers.dashboard;
    const results = dashboard.validate();

    console.log('🔍 Validação Rápida do Dashboard:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Status: ${results.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
    
    if (results.errors.length > 0) {
        console.log('\n❌ Erros:');
        results.errors.forEach(error => {
            console.log(`  - ${error}`);
        });
    }

    if (results.warnings.length > 0) {
        console.log('\n⚠️ Avisos:');
        results.warnings.forEach(warning => {
            console.log(`  - ${warning}`);
        });
    }

    console.log('\n📊 Métricas:');
    console.log(`  💰 Financeiras: ${results.metrics.financial ? '✅' : '❌'}`);
    console.log(`  📦 Pedidos: ${results.metrics.orders ? '✅' : '❌'}`);
    console.log(`  📊 Outras: ${results.metrics.other ? '✅' : '❌'}`);
    console.log(`  📈 Gráficos: ${results.metrics.charts ? '✅' : '❌'}`);
    console.log(`  🛒 Pedidos Ativos: ${results.metrics.activeOrders ? '✅' : '❌'}`);
    console.log('═══════════════════════════════════════════════════════');

    return results;
}

/**
 * Exibe informações de performance do dashboard
 * 
 * @returns {Promise<void>}
 */
export async function showPerformanceInfo() {
    if (!window.adminPanel || !window.adminPanel.managers || !window.adminPanel.managers.dashboard) {
        console.error('❌ DashboardManager não está disponível.');
        return;
    }

    const dashboard = window.adminPanel.managers.dashboard;
    const results = await dashboard.validatePerformance();

    console.log('⚡ Informações de Performance:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`⏱️ Tempo de Carregamento: ${results.metrics.loadTime?.toFixed(2) || 'N/A'}ms`);
    console.log(`📊 Tempo de Renderização de Gráficos: ${results.metrics.chartsRenderTime?.toFixed(2) || 'N/A'}ms`);
    
    if (results.metrics.memoryUsage) {
        const usedMB = (results.metrics.memoryUsage.used / 1024 / 1024).toFixed(2);
        const totalMB = (results.metrics.memoryUsage.total / 1024 / 1024).toFixed(2);
        const limitMB = (results.metrics.memoryUsage.limit / 1024 / 1024).toFixed(2);
        console.log(`💾 Uso de Memória: ${usedMB}MB / ${totalMB}MB (Limite: ${limitMB}MB)`);
    }

    if (results.warnings.length > 0) {
        console.log('\n⚠️ Avisos:');
        results.warnings.forEach(warning => {
            console.log(`  - ${warning}`);
        });
    }
    console.log('═══════════════════════════════════════════════════════');
}

// ALTERAÇÃO: Tornar funções disponíveis globalmente para uso no console
if (typeof window !== 'undefined') {
    window.dashboardValidator = {
        runFull: runDashboardValidation,
        runQuick: runQuickValidation,
        showPerformance: showPerformanceInfo
    };
    
    console.log('✅ Dashboard Validator carregado!');
    console.log('💡 Use os seguintes comandos no console:');
    console.log('   - window.dashboardValidator.runFull() - Validação completa');
    console.log('   - window.dashboardValidator.runQuick() - Validação rápida');
    console.log('   - window.dashboardValidator.showPerformance() - Informações de performance');
}




