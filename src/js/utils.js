// src/js/utils.js

/**
 * Função para gerenciar o estado dos inputs e selects
 * Controla a animação dos labels e cores baseado no foco e valor
 */
export function gerenciarEstadoInputs() {
    // Selecionar todos os inputs e selects dentro de formulários
    const inputs = document.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
        // Função para verificar se o input tem valor ou placeholder nativo
        function temValorOuPlaceholder() {
            // Para SELECT, manter o label sempre ativo para não conflitar com o option visível
            if (input.tagName === 'SELECT') {
                return true;
            }
            const valor = (input.value || '').trim();
            const temPlaceholder = input.placeholder && input.placeholder !== '';
            const tipoComPlaceholder = ['date', 'time', 'datetime-local', 'month', 'week'].includes(input.type);
            return valor !== '' || temPlaceholder || tipoComPlaceholder;
        }
        
        // Função para atualizar o estado do label
        function atualizarEstadoLabel() {
            const label = input.closest('.div-input')?.querySelector('label');
            if (!label) return;
            
            const temValor = temValorOuPlaceholder();
            const estaFocado = document.activeElement === input;
            
            // Adicionar/remover classe 'active' baseado no valor
            if (temValor) {
                label.classList.add('active');
            } else {
                label.classList.remove('active');
            }
            
            // Adicionar/remover classe 'focused' baseado no foco
            if (estaFocado) {
                label.classList.add('focused');
            } else {
                label.classList.remove('focused');
            }
        }
        
        // Eventos para inputs de texto, email, tel, etc.
        if (['text', 'email', 'tel', 'password', 'search', 'url'].includes(input.type)) {
            input.addEventListener('input', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
        }
        
        // Eventos para selects
        if (input.tagName === 'SELECT') {
            input.addEventListener('change', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
        }
        
        // Eventos para textareas
        if (input.tagName === 'TEXTAREA') {
            input.addEventListener('input', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
        }
        
        // Eventos para inputs com placeholder nativo (date, time, etc.)
        if (['date', 'time', 'datetime-local', 'month', 'week', 'number'].includes(input.type)) {
            input.addEventListener('change', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
            input.addEventListener('input', atualizarEstadoLabel);
        }
        
        // Verificar estado inicial
        atualizarEstadoLabel();

        // Observa mudanças programáticas do value (inputs e selects)
        try {
            let ultimoValor = input.value;
            const intervalo = setInterval(() => {
                if (!document.body.contains(input)) {
                    clearInterval(intervalo);
                    return;
                }
                if (input.value !== ultimoValor) {
                    ultimoValor = input.value;
                    atualizarEstadoLabel();
                }
            }, 250);
        } catch (_e) { }
    });
}

/**
 * Função para inicializar o gerenciamento de inputs em uma página específica
 * @param {string} seletor - Seletor CSS para o container dos inputs (opcional)
 */
export function inicializarGerenciamentoInputs(seletor = null) {
    // Aguardar o DOM estar pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (seletor) {
                const container = document.querySelector(seletor);
                if (container) {
                    gerenciarEstadoInputs();
                }
            } else {
                gerenciarEstadoInputs();
            }
        });
    } else {
        if (seletor) {
            const container = document.querySelector(seletor);
            if (container) {
                gerenciarEstadoInputs();
            }
        } else {
            gerenciarEstadoInputs();
        }
    }
}

/**
 * Função para reaplicar o gerenciamento após mudanças dinâmicas no DOM
 * Útil quando novos inputs são adicionados via JavaScript
 */
export function reaplicarGerenciamentoInputs() {
    gerenciarEstadoInputs();
}

/**
 * Função para gerenciar inputs específicos
 * @param {NodeList|Array} inputs - Lista de inputs para gerenciar
 */
export function gerenciarInputsEspecificos(inputs) {
    if (!inputs || inputs.length === 0) return;
    
    inputs.forEach(input => {
        // Aplicar a mesma lógica da função principal
        function temValorOuPlaceholder() {
            const valor = input.value.trim();
            const temPlaceholder = input.placeholder && input.placeholder !== '';
            const tipoComPlaceholder = ['date', 'time', 'datetime-local', 'month', 'week'].includes(input.type);
            
            return valor !== '' || temPlaceholder || tipoComPlaceholder;
        }
        
        function atualizarEstadoLabel() {
            const label = input.closest('.div-input')?.querySelector('label');
            if (!label) return;
            
            const temValor = temValorOuPlaceholder();
            const estaFocado = document.activeElement === input;
            
            if (temValor) {
                label.classList.add('active');
            } else {
                label.classList.remove('active');
            }
            
            if (estaFocado) {
                label.classList.add('focused');
            } else {
                label.classList.remove('focused');
            }
        }
        
        // Adicionar eventos baseado no tipo
        if (['text', 'email', 'tel', 'password', 'search', 'url'].includes(input.type)) {
            input.addEventListener('input', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
        }
        
        if (input.tagName === 'SELECT') {
            input.addEventListener('change', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
        }
        
        if (input.tagName === 'TEXTAREA') {
            input.addEventListener('input', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
        }
        
        if (['date', 'time', 'datetime-local', 'month', 'week', 'number'].includes(input.type)) {
            input.addEventListener('change', atualizarEstadoLabel);
            input.addEventListener('focus', atualizarEstadoLabel);
            input.addEventListener('blur', atualizarEstadoLabel);
            input.addEventListener('input', atualizarEstadoLabel);
        }
        
        atualizarEstadoLabel();
    });
}

// Auto-inicializar quando o módulo for carregado
if (typeof window !== 'undefined') {
    inicializarGerenciamentoInputs();
}