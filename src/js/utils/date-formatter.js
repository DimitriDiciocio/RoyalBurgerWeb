/**
 * Utilitários de Formatação de Data
 * Formata datas para o formato esperado pela API (DD-MM-AAAA)
 */

/**
 * Formata uma data para o formato DD-MM-AAAA (formato esperado pela API)
 * @param {Date|string} date - Data a ser formatada
 * @returns {string} Data formatada no formato DD-MM-AAAA
 */
export function formatDateForAPI(date) {
    if (!date) return null;
    
    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else if (typeof date === 'string') {
        // Verificar se já está no formato DD-MM-AAAA
        const parts = date.split('-');
        if (parts.length === 3) {
            // Se já está no formato DD-MM-AAAA, retornar como está
            if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                // Validar se é realmente DD-MM-AAAA (dia <= 31, mês <= 12)
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
                    return date;
                }
            }
            // Se está no formato AAAA-MM-DD (input HTML5), converter
            if (parts[0].length === 4) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const day = parseInt(parts[2], 10);
                dateObj = new Date(year, month - 1, day);
            }
        }
        
        // Se ainda não foi parseado, tentar Date padrão
        if (!dateObj || isNaN(dateObj.getTime())) {
            dateObj = new Date(date);
        }
    } else {
        return null;
    }
    
    if (isNaN(dateObj.getTime())) {
        // ALTERAÇÃO: Removido console.warn - usar logger se necessário em produção
        return null;
    }
    
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    
    return `${day}-${month}-${year}`;
}

/**
 * Converte uma data do formato DD-MM-AAAA para Date object
 * @param {string} dateString - Data no formato DD-MM-AAAA
 * @returns {Date|null} Objeto Date ou null se inválido
 */
export function parseDateFromAPI(dateString) {
    if (!dateString) return null;
    
    const parts = dateString.split('-');
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexed
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    
    return date;
}

/**
 * Formata uma data para exibição (DD/MM/AAAA)
 * @param {Date|string} date - Data a ser formatada
 * @returns {string} Data formatada para exibição
 */
export function formatDateForDisplay(date) {
    if (!date) return '-';
    
    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else if (typeof date === 'string') {
        dateObj = parseDateFromAPI(date) || new Date(date);
    } else {
        return '-';
    }
    
    if (isNaN(dateObj.getTime())) return '-';
    
    return dateObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Formata uma data para formato ISO (AAAA-MM-DD) - usado para APIs que esperam formato ISO
 * @param {Date|string} date - Data a ser formatada
 * @returns {string|null} Data formatada no formato ISO (AAAA-MM-DD) ou null se inválida
 */
export function formatDateForISO(date) {
    if (!date) return null;
    
    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else if (typeof date === 'string') {
        // Se já está no formato ISO, retornar como está
        if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
            return date.split('T')[0]; // Pegar apenas a parte da data
        }
        // Se está no formato DD-MM-AAAA, converter
        const parts = date.split('-');
        if (parts.length === 3 && parts[0].length === 2) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            dateObj = new Date(year, month - 1, day);
        } else {
            dateObj = new Date(date);
        }
    } else {
        return null;
    }
    
    if (isNaN(dateObj.getTime())) {
        // ALTERAÇÃO: Removido console.warn - usar logger se necessário em produção
        // console.warn('Data inválida para ISO:', date);
        return null;
    }
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

