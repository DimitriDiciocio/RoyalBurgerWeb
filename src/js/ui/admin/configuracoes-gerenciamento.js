/**
 * Gerenciamento de Configurações - Painel Administrativo
 * Modal genérica para definir/editar configurações
 */

import { abrirModal, fecharModal } from "../modais.js";
import { showSuccess, showError } from "../alerts.js";
import { getAllSettings, updateSettings } from "../../api/settings.js";
import { getStoreHours, bulkUpdateStoreHours } from "../../api/store.js";
import { debounce } from "../../utils/performance-utils.js";
import { escapeHTML } from "../../utils/html-sanitizer.js";
import {
  validateCNPJ,
  validatePhone,
  validateEmail,
} from "../../utils/validators.js";

/**
 * Gerenciador de configurações
 */
class ConfiguracoesManager {
  constructor() {
    this.currentConfig = null;
    this.configHandlers = new Map();
    this.settings = null; // Armazena configurações atuais
    this._validationTimeout = null; // Timeout para debounce de validação
    this.init();
  }

  /**
   * Inicializar gerenciador
   */
  async init() {
    this.initElements();
    this.attachEvents();
    this.setupConfigHandlers();
    await this.loadSettings();
  }

  /**
   * Carregar configurações atuais da API
   */
  async loadSettings() {
    try {
      // Carregar configurações gerais
      const result = await getAllSettings();
      if (result.success) {
        this.settings = result.data || {};
        this.updateUIWithSettings();
      } else {
        // Log apenas em desenvolvimento
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.warn("Erro ao carregar configurações:", result.error);
        }
        // Continua com configurações vazias
        this.settings = {};
      }

      // Carregar horários de funcionamento
      await this.loadStoreHours();
    } catch (error) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar configurações:", error);
      }
      this.settings = {};
    }
  }

  /**
   * Carregar horários de funcionamento da API
   */
  async loadStoreHours() {
    try {
      const result = await getStoreHours();
      if (result.success) {
        this.storeHours = result.data || [];
        this.updateStoreHoursUI();
      } else {
        // Log apenas em desenvolvimento
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.warn("Erro ao carregar horários:", result.error);
        }
        // Inicializar com estrutura padrão se não houver dados
        this.storeHours = this.getDefaultStoreHours();
        this.updateStoreHoursUI();
      }
    } catch (error) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar horários:", error);
      }
      this.storeHours = this.getDefaultStoreHours();
      this.updateStoreHoursUI();
    }
  }

  /**
   * Retorna estrutura padrão de horários (se não houver dados)
   */
  getDefaultStoreHours() {
    const dayNames = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
    return dayNames.map((name, index) => ({
      day_of_week: index,
      day_name: name,
      opening_time: null,
      closing_time: null,
      is_open: true,
    }));
  }

  /**
   * Mapear chave do frontend para chave do backend
   * @param {string} frontendKey - Chave do frontend
   * @returns {string} Chave do backend
   */
  getBackendKey(frontendKey) {
    const keyMap = {
      "meta-receita-mensal": "meta_receita_mensal",
      "meta-pedidos-mensais": "meta_pedidos_mensais",
      "prazo-iniciacao-pedido": "prazo_iniciacao",
      "prazo-preparo-pedido": "prazo_preparo",
      "prazo-envio-pedido": "prazo_envio",
      "prazo-entrega-pedido": "prazo_entrega",
      "taxa-entrega": "taxa_entrega",
      "taxa-conversao-ganho-clube": "taxa_conversao_ganho_clube",
      "taxa-conversao-resgate-clube": "taxa_conversao_resgate_clube",
      "taxa-expiracao-pontos": "taxa_expiracao_pontos_clube",
      // ALTERAÇÃO: Taxas financeiras adicionadas
      "taxa-cartao-credito": "taxa_cartao_credito",
      "taxa-cartao-debito": "taxa_cartao_debito",
      "taxa-pix": "taxa_pix",
      "taxa-ifood": "taxa_ifood",
      "taxa-uber-eats": "taxa_uber_eats",
      "nome-fantasia": "nome_fantasia",
      "razao-social": "razao_social",
      cnpj: "cnpj",
      "endereco-empresa": "endereco",
      "telefone-empresa": "telefone",
      "email-empresa": "email",
    };
    return keyMap[frontendKey] || frontendKey;
  }

  /**
   * Obter valor atual de uma configuração
   * @param {string} frontendKey - Chave do frontend
   * @returns {any} Valor da configuração ou null
   */
  getCurrentValue(frontendKey) {
    if (!this.settings) return null;
    const backendKey = this.getBackendKey(frontendKey);
    return this.settings[backendKey] ?? null;
  }

  /**
   * Atualizar UI com valores das configurações carregadas
   */
  updateUIWithSettings() {
    if (!this.settings) return;

    const secaoConfiguracoes = document.getElementById("secao-configuracoes");
    if (!secaoConfiguracoes) return;

    // Atualizar valores nos elementos .info com botão "Definir"
    // Cache do querySelectorAll para melhor performance
    const infoElements = secaoConfiguracoes.querySelectorAll(".info");
    infoElements.forEach((infoElement) => {
      const configLabel = infoElement
        .querySelector(".config")
        ?.textContent?.trim();
      if (!configLabel) return;

      const configKey = this.getConfigKeyFromLabel(configLabel);
      if (!configKey) return;

      const backendKey = this.getBackendKey(configKey);
      const value = this.settings[backendKey];
      const button = infoElement.querySelector("button");

      // Ignorar botões com IDs específicos (como "btn-categorias", "btn-grupos-adicionais")
      if (button && button.id && button.id !== "") {
        return;
      }

      // Verificar se é um elemento com .tempo (prazos) ou .valor (taxas)
      const hasTempo = infoElement.querySelector(".tempo");
      const hasValor = infoElement.querySelector(".valor");

      // Buscar handler para formatação
      const handler = this.configHandlers.get(configKey);

      // Se for elemento com .tempo (prazos) ou .valor (taxas), tratar de forma diferente
      if (hasTempo || hasValor) {
        const containerElement = hasTempo
          ? infoElement.querySelector(".tempo")
          : infoElement.querySelector(".valor");

        if (value !== null && value !== undefined) {
          // Há valor: exibir no container (.tempo ou .valor) com ícone de edição
          containerElement.style.display = "";

          let containerP = containerElement.querySelector("p");
          if (!containerP) {
            containerP = document.createElement("p");
            containerElement.insertBefore(
              containerP,
              containerElement.firstChild
            );
          }

          if (handler && handler.formatter) {
            containerP.textContent = handler.formatter(String(value));
          } else {
            // Formatação padrão
            if (hasTempo) {
              containerP.textContent = String(value) + " min";
            } else {
              containerP.textContent = String(value);
            }
          }

          // Garantir ícone de edição
          let editIcon = containerElement.querySelector("i.fa-pen-to-square");
          if (!editIcon) {
            editIcon = document.createElement("i");
            editIcon.className = "fa-solid fa-pen-to-square";
            containerElement.appendChild(editIcon);

            editIcon.addEventListener("click", () => {
              const containerText = containerP?.textContent?.trim() || "";
              let currentValue = containerText;

              // Para elementos .tempo, remover "min" apenas para number inputs
              if (hasTempo && handler && handler.inputType === "number") {
                currentValue = containerText.replace(/\D/g, "");
              }

              this.openModal(configKey, currentValue, infoElement);
            });
          }

          // Remover botão "Definir" quando há valor (apenas o ícone será usado para editar)
          if (button) {
            button.remove();
          }
        } else {
          // Não há valor: ocultar container e mostrar botão "Definir"
          if (containerElement) {
            containerElement.style.display = "none";
          }

          // Criar ou atualizar botão para "Definir"
          if (!button && configKey) {
            button = document.createElement("button");
            infoElement.appendChild(button);
          }
          if (button) {
            button.textContent = "Definir";
            button.classList.remove("btn-editar-config");

            // Garantir que tem evento de clique
            const hasListener =
              button.getAttribute("data-has-listener") === "true";
            if (!hasListener) {
              button.addEventListener("click", () => {
                this.openModal(configKey, null, infoElement);
              });
              button.setAttribute("data-has-listener", "true");
            }
          }
        }
        return; // Não processar como elemento normal
      }

      // Processamento para elementos sem .tempo (Metas, Taxas, Informações)
      if (value !== null && value !== undefined) {
        // Há valor salvo: exibir valor e mudar botão para "Editar"

        // Verificar se já existe elemento de valor
        let valueElement = infoElement.querySelector(".config-value");

        if (!valueElement) {
          // Criar elemento para exibir o valor
          valueElement = document.createElement("div");
          valueElement.className = "config-value";

          // Inserir após a descrição ou no info-content
          const infoContent = infoElement.querySelector(".info-content");
          const descElement = infoElement.querySelector(".descricao");
          if (infoContent) {
            infoContent.appendChild(valueElement);
          } else if (descElement) {
            descElement.parentNode.insertBefore(
              valueElement,
              descElement.nextSibling
            );
          }
        }

        // Formatar e exibir o valor
        let displayValue = String(value);
        if (handler && handler.formatter) {
          // Usar formatter do handler (já inclui explicações detalhadas para taxa-conversao-clube)
          displayValue = handler.formatter(displayValue);
        } else {
          // Formatação padrão baseada no tipo
          const num = parseFloat(value);
          const isNumber = !isNaN(num);

          if (isNumber && num !== 0) {
            // Valores numéricos
            if (
              configKey.includes("meta-receita") ||
              (configKey.includes("taxa") &&
                configKey !== "taxa-expiracao-pontos" &&
                !configKey.includes("taxa-conversao") &&
                !configKey.includes("taxa-cartao") &&
                !configKey.includes("taxa-pix") &&
                !configKey.includes("taxa-ifood") &&
                !configKey.includes("taxa-uber"))
            ) {
              displayValue =
                "R$ " +
                num.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
            } else if (
              configKey === "taxa-cartao-credito" ||
              configKey === "taxa-cartao-debito" ||
              configKey === "taxa-pix" ||
              configKey === "taxa-ifood" ||
              configKey === "taxa-uber-eats"
            ) {
              // ALTERAÇÃO: Formatação para taxas financeiras (percentual)
              displayValue = num.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) + "%";
            } else if (configKey === "taxa-expiracao-pontos") {
              // Formatação especial para expiração (mostrar em dias)
              displayValue = `${num} ${num === 1 ? "dia" : "dias"}`;
            } else if (configKey.includes("taxa-conversao")) {
              // Formatação especial para taxas de conversão (usar formatter do handler)
              // Não precisa fazer nada aqui, já será formatado pelo handler.formatter
            } else if (configKey.includes("meta-pedidos")) {
              displayValue = num.toLocaleString("pt-BR");
            } else {
              displayValue = num.toLocaleString("pt-BR");
            }
          } else if (!isNumber) {
            // Valores de texto - aplicar formatação específica
            if (configKey === "cnpj" && value.length === 14) {
              displayValue = value.replace(
                /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                "$1.$2.$3/$4-$5"
              );
            } else if (configKey === "telefone-empresa") {
              const phone = value.replace(/\D/g, "");
              if (phone.length === 11) {
                displayValue = phone.replace(
                  /^(\d{2})(\d{5})(\d{4})$/,
                  "($1) $2-$3"
                );
              } else if (phone.length === 10) {
                displayValue = phone.replace(
                  /^(\d{2})(\d{4})(\d{4})$/,
                  "($1) $2-$3"
                );
              } else {
                displayValue = value;
              }
            } else {
              displayValue = value;
            }
          }
        }

        // Criar elementos separadamente para poder adicionar event listeners
        // Usar textContent para segurança XSS (em vez de innerHTML)
        while (valueElement.firstChild) {
          valueElement.removeChild(valueElement.firstChild);
        }
        valueElement.style.display = "flex";
        valueElement.style.alignItems = "flex-start"; // Alinhar no topo para múltiplas linhas
        valueElement.style.gap = "8px";
        valueElement.style.marginTop = "4px";
        valueElement.style.color = "var(--color-texto-black)";

        // Verificar se o displayValue tem múltiplas partes (indicado por |)
        const hasMultipleParts = displayValue.includes(" | ");

        // Container para o conteúdo (texto)
        const contentContainer = document.createElement("div");
        contentContainer.style.display = "flex";
        contentContainer.style.flexDirection = "column";
        contentContainer.style.flex = "1";
        contentContainer.style.gap = "4px";

        if (hasMultipleParts) {
          // Dividir em partes para exibir melhor
          const parts = displayValue.split(" | ");

          parts.forEach((part, index) => {
            const partSpan = document.createElement("span");
            partSpan.className = "value-text";
            partSpan.textContent = part;
            partSpan.style.fontSize = index === 0 ? "0.95rem" : "0.85rem"; // Primeira parte maior
            partSpan.style.fontWeight = index === 0 ? "600" : "400"; // Primeira parte negrito
            partSpan.style.color =
              index === 0
                ? "var(--color-texto-black)"
                : "var(--color-texto-erased)";
            partSpan.style.lineHeight = "1.4";
            contentContainer.appendChild(partSpan);
          });
        } else {
          // Valor simples em uma linha
          const valueText = document.createElement("span");
          valueText.className = "value-text";
          valueText.textContent = displayValue;
          valueText.style.fontSize = "0.9rem";
          valueText.style.fontWeight = "500";
          contentContainer.appendChild(valueText);
        }

        valueElement.appendChild(contentContainer);

        // Criar ícone de edição
        const editIcon = document.createElement("i");
        editIcon.className = "fa-solid fa-pen-to-square config-edit-icon";
        editIcon.title = "Editar";
        editIcon.style.cursor = "pointer";
        editIcon.style.color = "var(--color-texto-erased)";
        editIcon.style.fontSize = "0.85rem";
        editIcon.style.flexShrink = "0"; // Não encolher
        editIcon.style.marginTop = "2px"; // Alinhar com o topo do texto

        // Adicionar event listeners
        editIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openModal(configKey, String(value), infoElement);
        });
        editIcon.addEventListener("mouseenter", () => {
          editIcon.style.color = "var(--color-texto-black)";
        });
        editIcon.addEventListener("mouseleave", () => {
          editIcon.style.color = "var(--color-texto-erased)";
        });

        valueElement.appendChild(editIcon);

        // Remover botão quando há valor (apenas o ícone será usado para editar)
        if (button) {
          button.remove();
        }
      } else {
        // Não há valor: ocultar elemento de valor
        const valueElement = infoElement.querySelector(".config-value");
        if (valueElement) {
          valueElement.style.display = "none";
        }

        // Criar ou atualizar botão
        if (!button && configKey) {
          button = document.createElement("button");
          infoElement.appendChild(button);
        }

        if (button) {
          button.textContent = "Definir";
          button.classList.remove("btn-editar-config");
        }
      }
    });
  }

  /**
   * Inicializar elementos DOM
   */
  initElements() {
    this.el = {
      modal: document.getElementById("modal-configuracao"),
      titulo: document.getElementById("titulo-modal-configuracao"),
      configLabel: document.getElementById("config-label-modal"),
      configDescricao: document.getElementById("config-descricao-modal"),
      labelInput: document.getElementById("label-input-configuracao"),
      input: document.getElementById("input-configuracao"),
      btnSalvar: document.getElementById("btn-salvar-configuracao"),
      // Modal de horários de funcionamento
      modalHorarios: document.getElementById("modal-horarios-funcionamento"),
      tableBodyHorarios: document.getElementById("horarios-table-body"),
      btnSalvarHorarios: document.getElementById("btn-salvar-horarios"),
    };

    // Armazenar horários carregados
    this.storeHours = [];
  }

  /**
   * Configurar handlers específicos para cada tipo de configuração
   */
  setupConfigHandlers() {
    // Configurações de Metas Financeiras
    this.registerHandler("meta-receita-mensal", {
      configKey: "meta-receita-mensal",
      title: "Definir Meta de Receita Mensal",
      label: "Meta de Receita Mensal",
      inputLabel: "Valor (R$)",
      inputType: "text", // Usar text para permitir formatação visual
      placeholder: "Digite o valor da meta (ex: 50.000,00)",
      validator: (value) => {
        const num = this.parseCurrency(value);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        // Formatar para exibição: R$ 50.000,00
        const num = this.parseCurrency(value);
        if (isNaN(num) || num === 0) return "";
        return num.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      },
      parser: (value) => {
        // Converter para número puro (remover formatação)
        return this.parseCurrency(value).toString();
      },
      onSave: async (value) => {
        const num = this.parseCurrency(value);
        return await this.saveConfig("meta_receita_mensal", num);
      },
    });

    this.registerHandler("meta-pedidos-mensais", {
      configKey: "meta-pedidos-mensais",
      title: "Definir Meta de Pedidos Mensais",
      label: "Meta de Pedidos Mensais",
      inputLabel: "Quantidade",
      inputType: "number",
      placeholder: "Digite a quantidade de pedidos (ex: 1000)",
      validator: (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
      },
      onSave: async (value) => {
        return await this.saveConfig(
          "meta_pedidos_mensais",
          parseInt(value, 10)
        );
      },
    });

    // Configurações de Prazos
    this.registerHandler("prazo-iniciacao-pedido", {
      configKey: "prazo-iniciacao-pedido",
      title: "Definir Prazo de Iniciação",
      label: "Prazo de iniciação de pedido",
      inputLabel: "Tempo (minutos)",
      inputType: "number",
      placeholder: "Digite o tempo em minutos (ex: 10)",
      validator: (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        return value ? `${value} min` : "";
      },
      parser: (value) => {
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig("prazo_iniciacao", parseInt(value, 10));
      },
    });

    this.registerHandler("prazo-preparo-pedido", {
      configKey: "prazo-preparo-pedido",
      title: "Definir Prazo de Preparo",
      label: "Prazo de preparo de pedido",
      inputLabel: "Tempo (minutos)",
      inputType: "number",
      placeholder: "Digite o tempo em minutos (ex: 30)",
      validator: (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        return value ? `${value} min` : "";
      },
      parser: (value) => {
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig("prazo_preparo", parseInt(value, 10));
      },
    });

    this.registerHandler("prazo-envio-pedido", {
      configKey: "prazo-envio-pedido",
      title: "Definir Prazo de Envio",
      label: "Prazo de envio de pedido",
      inputLabel: "Tempo (minutos)",
      inputType: "number",
      placeholder: "Digite o tempo em minutos (ex: 15)",
      validator: (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        return value ? `${value} min` : "";
      },
      parser: (value) => {
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig("prazo_envio", parseInt(value, 10));
      },
    });

    this.registerHandler("prazo-entrega-pedido", {
      configKey: "prazo-entrega-pedido",
      title: "Definir Prazo de Entrega",
      label: "Prazo de entrega de pedido",
      inputLabel: "Tempo (minutos)",
      inputType: "number",
      placeholder: "Digite o tempo em minutos (ex: 30)",
      validator: (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        return value ? `${value} min` : "";
      },
      parser: (value) => {
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig("prazo_entrega", parseInt(value, 10));
      },
    });

    // Configurações de Taxas
    this.registerHandler("taxa-entrega", {
      configKey: "taxa-entrega",
      title: "Definir Taxa de Entrega",
      label: "Taxa de entrega",
      inputLabel: "Valor (R$)",
      inputType: "text", // Usar text para permitir formatação visual
      placeholder: "Digite o valor da taxa (ex: 5,50)",
      validator: (value) => {
        const num = this.parseCurrency(value);
        return !isNaN(num) && num >= 0;
      },
      formatter: (value) => {
        // Formatar para exibição: R$ 5,50
        const num = this.parseCurrency(value);
        if (isNaN(num) || num === 0) return "";
        return num.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      },
      parser: (value) => {
        // Converter para número puro (remover formatação)
        return this.parseCurrency(value).toString();
      },
      onSave: async (value) => {
        const num = this.parseCurrency(value);
        return await this.saveConfig("taxa_entrega", num);
      },
    });

    // Handler para taxa de conversão de ganho
    this.registerHandler("taxa-conversao-ganho-clube", {
      configKey: "taxa-conversao-ganho-clube",
      title: "Configurar Taxa de Conversão de Ganho",
      label: "Taxa de conversão de ganho do clube",
      description:
        "Quanto o cliente precisa gastar para ganhar 1 ponto. Exemplo: R$ 0,10 = 1 ponto | R$ 1,00 = 10 pontos",
      inputLabel: "Valor para ganhar 1 ponto (R$)",
      inputType: "text",
      placeholder: "Digite o valor (ex: 0,10)",
      validator: (value) => {
        const num = this.parseCurrency(value);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        const num = this.parseCurrency(value);
        if (isNaN(num) || num === 0) return "";
        const formattedValue = num.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const pontosPorReal = num > 0 ? Math.round(1 / num) : 0;
        return `${formattedValue} para 1 ponto | R$ 1,00 = ${pontosPorReal} pontos`;
      },
      parser: (value) => {
        return this.parseCurrency(value).toString();
      },
      onSave: async (value) => {
        const num = this.parseCurrency(value);
        const finalValue = num > 0 ? Number(Number(num).toFixed(4)) : num;
        return await this.saveConfig("taxa_conversao_ganho_clube", finalValue);
      },
    });

    // Handler para taxa de conversão de resgate
    this.registerHandler("taxa-conversao-resgate-clube", {
      configKey: "taxa-conversao-resgate-clube",
      title: "Configurar Taxa de Conversão de Resgate",
      label: "Taxa de conversão de resgate do clube",
      description:
        "Quanto cada ponto vale de desconto. Exemplo: R$ 0,01 = 1 ponto | 100 pontos = R$ 1,00",
      inputLabel: "Valor por ponto de desconto (R$)",
      inputType: "text",
      placeholder: "Digite o valor (ex: 0,01)",
      validator: (value) => {
        const num = this.parseCurrency(value);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        const num = this.parseCurrency(value);
        if (isNaN(num) || num === 0) return "";
        const formattedValue = num.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const desconto100Pontos = (num * 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        return `${formattedValue} por ponto | 100 pontos = ${desconto100Pontos}`;
      },
      parser: (value) => {
        return this.parseCurrency(value).toString();
      },
      onSave: async (value) => {
        const num = this.parseCurrency(value);
        const finalValue = num > 0 ? Number(Number(num).toFixed(4)) : num;
        return await this.saveConfig(
          "taxa_conversao_resgate_clube",
          finalValue
        );
      },
    });

    this.registerHandler("taxa-expiracao-pontos", {
      configKey: "taxa-expiracao-pontos",
      title: "Configurar Prazo de Expiração de Pontos",
      label: "Taxa de expiração de pontos do clube",
      description:
        "Período em dias após o qual os pontos acumulados expiram se o cliente não realizar nenhuma compra. Por exemplo, se configurar 60 dias, os pontos do cliente expiram após 60 dias sem compras. A cada nova compra, o prazo de expiração é renovado automaticamente.",
      inputLabel: "Prazo (dias)",
      inputType: "number",
      placeholder: "Digite o prazo em dias (ex: 60)",
      validator: (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
      },
      formatter: (value) => {
        // Formatar para exibição: "60 dias"
        const num = parseInt(value, 10);
        if (isNaN(num) || num === 0) return "";
        return `${num} ${num === 1 ? "dia" : "dias"}`;
      },
      parser: (value) => {
        // Remover "dias" e extrair apenas o número
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig(
          "taxa_expiracao_pontos_clube",
          parseInt(value, 10)
        );
      },
    });

    // ALTERAÇÃO: Handlers para taxas financeiras adicionados
    // Taxa de Cartão de Crédito
    this.registerHandler("taxa-cartao-credito", {
      configKey: "taxa-cartao-credito",
      title: "Definir Taxa de Cartão de Crédito",
      label: "Taxa de Cartão de Crédito (%)",
      description:
        "Percentual cobrado pela operadora de cartão de crédito sobre o valor da venda. Este valor será automaticamente deduzido como despesa quando um pedido for pago com cartão de crédito. Deixe em branco para não configurar.",
      inputLabel: "Taxa (%)",
      inputType: "text",
      placeholder: "Digite a taxa percentual (ex: 2,5) ou deixe em branco",
      isOptional: true, // ALTERAÇÃO: Campo opcional para permitir null
      validator: (value) => {
        // Permitir vazio (null)
        if (!value || value.trim() === "") return true;
        const num = parseFloat(value.replace(",", "."));
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = parseFloat(value);
        if (isNaN(num)) return "";
        return num.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%";
      },
      parser: (value) => {
        if (!value || value.trim() === "") return "";
        return value.replace(/[^\d,.-]/g, "").replace(",", ".");
      },
      onSave: async (value) => {
        // ALTERAÇÃO: Permitir null se valor vazio ou 0
        if (!value || value.trim() === "") {
          return await this.saveConfig("taxa_cartao_credito", null);
        }
        const num = parseFloat(value.replace(",", "."));
        // Salvar 0 como 0, não como null
        return await this.saveConfig("taxa_cartao_credito", isNaN(num) ? null : num);
      },
    });

    // Taxa de Cartão de Débito
    this.registerHandler("taxa-cartao-debito", {
      configKey: "taxa-cartao-debito",
      title: "Definir Taxa de Cartão de Débito",
      label: "Taxa de Cartão de Débito (%)",
      description:
        "Percentual cobrado pela operadora de cartão de débito sobre o valor da venda. Este valor será automaticamente deduzido como despesa quando um pedido for pago com cartão de débito. Deixe em branco para não configurar.",
      inputLabel: "Taxa (%)",
      inputType: "text",
      placeholder: "Digite a taxa percentual (ex: 1,5) ou deixe em branco",
      isOptional: true, // ALTERAÇÃO: Campo opcional para permitir null
      validator: (value) => {
        // Permitir vazio (null)
        if (!value || value.trim() === "") return true;
        const num = parseFloat(value.replace(",", "."));
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = parseFloat(value);
        if (isNaN(num)) return "";
        return num.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%";
      },
      parser: (value) => {
        if (!value || value.trim() === "") return "";
        return value.replace(/[^\d,.-]/g, "").replace(",", ".");
      },
      onSave: async (value) => {
        // ALTERAÇÃO: Permitir null se valor vazio
        if (!value || value.trim() === "") {
          return await this.saveConfig("taxa_cartao_debito", null);
        }
        const num = parseFloat(value.replace(",", "."));
        return await this.saveConfig("taxa_cartao_debito", isNaN(num) ? null : num);
      },
    });

    // Taxa de PIX
    this.registerHandler("taxa-pix", {
      configKey: "taxa-pix",
      title: "Definir Taxa de PIX",
      label: "Taxa de PIX (%)",
      description:
        "Percentual cobrado sobre o valor da venda quando o pagamento é feito via PIX. Geralmente é 0% pois o PIX não possui taxa de transação. Deixe em branco para não configurar.",
      inputLabel: "Taxa (%)",
      inputType: "text",
      placeholder: "Digite a taxa percentual (ex: 0) ou deixe em branco",
      isOptional: true, // ALTERAÇÃO: Campo opcional para permitir null
      validator: (value) => {
        // Permitir vazio (null)
        if (!value || value.trim() === "") return true;
        const num = parseFloat(value.replace(",", "."));
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = parseFloat(value);
        if (isNaN(num)) return "";
        return num.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%";
      },
      parser: (value) => {
        if (!value || value.trim() === "") return "";
        return value.replace(/[^\d,.-]/g, "").replace(",", ".");
      },
      onSave: async (value) => {
        // ALTERAÇÃO: Permitir null se valor vazio
        if (!value || value.trim() === "") {
          return await this.saveConfig("taxa_pix", null);
        }
        const num = parseFloat(value.replace(",", "."));
        return await this.saveConfig("taxa_pix", isNaN(num) ? null : num);
      },
    });

    // Taxa do iFood
    this.registerHandler("taxa-ifood", {
      configKey: "taxa-ifood",
      title: "Definir Taxa do iFood",
      label: "Taxa do iFood (%)",
      description:
        "Percentual cobrado pela plataforma iFood sobre o valor total do pedido. Este valor será automaticamente deduzido como despesa quando um pedido vier do iFood. Deixe em branco para não configurar.",
      inputLabel: "Taxa (%)",
      inputType: "text",
      placeholder: "Digite a taxa percentual (ex: 15) ou deixe em branco",
      isOptional: true, // ALTERAÇÃO: Campo opcional para permitir null
      validator: (value) => {
        // Permitir vazio (null)
        if (!value || value.trim() === "") return true;
        const num = parseFloat(value.replace(",", "."));
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = parseFloat(value);
        if (isNaN(num)) return "";
        return num.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%";
      },
      parser: (value) => {
        if (!value || value.trim() === "") return "";
        return value.replace(/[^\d,.-]/g, "").replace(",", ".");
      },
      onSave: async (value) => {
        // ALTERAÇÃO: Permitir null se valor vazio
        if (!value || value.trim() === "") {
          return await this.saveConfig("taxa_ifood", null);
        }
        const num = parseFloat(value.replace(",", "."));
        return await this.saveConfig("taxa_ifood", isNaN(num) ? null : num);
      },
    });

    // Taxa do Uber Eats
    this.registerHandler("taxa-uber-eats", {
      configKey: "taxa-uber-eats",
      title: "Definir Taxa do Uber Eats",
      label: "Taxa do Uber Eats (%)",
      description:
        "Percentual cobrado pela plataforma Uber Eats sobre o valor total do pedido. Este valor será automaticamente deduzido como despesa quando um pedido vier do Uber Eats. Deixe em branco para não configurar.",
      inputLabel: "Taxa (%)",
      inputType: "text",
      placeholder: "Digite a taxa percentual (ex: 30) ou deixe em branco",
      isOptional: true, // ALTERAÇÃO: Campo opcional para permitir null
      validator: (value) => {
        // Permitir vazio (null)
        if (!value || value.trim() === "") return true;
        const num = parseFloat(value.replace(",", "."));
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = parseFloat(value);
        if (isNaN(num)) return "";
        return num.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%";
      },
      parser: (value) => {
        if (!value || value.trim() === "") return "";
        return value.replace(/[^\d,.-]/g, "").replace(",", ".");
      },
      onSave: async (value) => {
        // ALTERAÇÃO: Permitir null se valor vazio
        if (!value || value.trim() === "") {
          return await this.saveConfig("taxa_uber_eats", null);
        }
        const num = parseFloat(value.replace(",", "."));
        return await this.saveConfig("taxa_uber_eats", isNaN(num) ? null : num);
      },
    });

    // Informações da Empresa
    this.registerHandler("nome-fantasia", {
      configKey: "nome-fantasia",
      title: "Definir Nome Fantasia",
      label: "Nome Fantasia",
      inputLabel: "Nome",
      inputType: "text",
      placeholder: "Digite o nome fantasia da empresa",
      validator: (value) => {
        return value && value.trim().length > 0;
      },
      onSave: async (value) => {
        return await this.saveConfig("nome_fantasia", value.trim());
      },
    });

    this.registerHandler("razao-social", {
      configKey: "razao-social",
      title: "Definir Razão Social",
      label: "Razão Social",
      inputLabel: "Razão Social",
      inputType: "text",
      placeholder: "Digite a razão social da empresa",
      validator: (value) => {
        return value && value.trim().length > 0;
      },
      onSave: async (value) => {
        return await this.saveConfig("razao_social", value.trim());
      },
    });

    this.registerHandler("cnpj", {
      configKey: "cnpj",
      title: "Definir CNPJ",
      label: "CNPJ",
      inputLabel: "CNPJ",
      inputType: "text",
      placeholder: "00.000.000/0000-00",
      validator: (value) => {
        const cnpj = value.replace(/\D/g, "");
        const validation = validateCNPJ(cnpj);
        return validation.valid;
      },
      formatter: (value) => {
        const cnpj = value.replace(/\D/g, "");
        if (cnpj.length <= 14) {
          if (cnpj.length <= 2) {
            return cnpj;
          } else if (cnpj.length <= 5) {
            return cnpj.replace(/^(\d{2})(\d+)$/, "$1.$2");
          } else if (cnpj.length <= 8) {
            return cnpj.replace(/^(\d{2})(\d{3})(\d+)$/, "$1.$2.$3");
          } else if (cnpj.length <= 12) {
            return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/, "$1.$2.$3/$4");
          } else {
            return cnpj.replace(
              /^(\d{2})(\d{3})(\d{3})(\d{4})(\d+)$/,
              "$1.$2.$3/$4-$5"
            );
          }
        }
        return value;
      },
      parser: (value) => {
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig("cnpj", value.replace(/\D/g, ""));
      },
    });

    this.registerHandler("endereco-empresa", {
      configKey: "endereco-empresa",
      title: "Definir Endereço",
      label: "Endereço",
      inputLabel: "Endereço completo",
      inputType: "text",
      placeholder: "Digite o endereço completo da empresa",
      validator: (value) => {
        return value && value.trim().length > 0;
      },
      onSave: async (value) => {
        return await this.saveConfig("endereco", value.trim());
      },
    });

    this.registerHandler("telefone-empresa", {
      configKey: "telefone-empresa",
      title: "Definir Telefone",
      label: "Telefone",
      inputLabel: "Telefone",
      inputType: "text",
      placeholder: "(00) 00000-0000",
      validator: (value) => {
        const validation = validatePhone(value);
        return validation.valid;
      },
      formatter: (value) => {
        const phone = value.replace(/\D/g, "");
        if (phone.length <= 11) {
          if (phone.length <= 2) {
            return phone.length > 0 ? `(${phone}` : phone;
          } else if (phone.length <= 7) {
            return phone.replace(/^(\d{2})(\d+)$/, "($1) $2");
          } else if (phone.length <= 10) {
            return phone.replace(/^(\d{2})(\d{4})(\d+)$/, "($1) $2-$3");
          } else {
            return phone.replace(/^(\d{2})(\d{5})(\d+)$/, "($1) $2-$3");
          }
        }
        return value;
      },
      parser: (value) => {
        return value.replace(/\D/g, "");
      },
      onSave: async (value) => {
        return await this.saveConfig("telefone", value.replace(/\D/g, ""));
      },
    });

    this.registerHandler("email-empresa", {
      configKey: "email-empresa",
      title: "Definir E-mail",
      label: "E-mail",
      inputLabel: "E-mail",
      inputType: "email",
      placeholder: "contato@exemplo.com",
      validator: (value) => {
        const validation = validateEmail(value);
        return validation.valid;
      },
      onSave: async (value) => {
        return await this.saveConfig("email", value.trim().toLowerCase());
      },
    });
  }

  /**
   * Salvar configuração na API
   * @param {string} backendKey - Chave do backend
   * @param {any} value - Valor a ser salvo
   * @returns {Promise<boolean>} True se salvo com sucesso
   */
  async saveConfig(backendKey, value) {
    try {
      // Garantir que valores numéricos sejam enviados como número, não string
      // Isso é especialmente importante para valores decimais menores que 1
      let finalValue = value;
      if (typeof value === "number") {
        // Manter o número como está, mas garantir precisão para decimais
        // Para valores menores que 1, garantir que não seja convertido incorretamente
        finalValue = value;
      } else if (typeof value === "string") {
        // Tentar converter para número se for string numérica
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          finalValue = parsed;
        }
      }

      const settingsData = {
        [backendKey]: finalValue,
      };

      // Log apenas em desenvolvimento (evitar exposição de dados sensíveis em produção)
      if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development"
      ) {
        console.log("Enviando para API:", { backendKey, final: finalValue });
      }

      const result = await updateSettings(settingsData);

      if (result.success) {
        // Atualizar configurações locais com o valor final
        if (!this.settings) {
          this.settings = {};
        }
        this.settings[backendKey] = finalValue;

        // Atualizar UI imediatamente
        this.updateUIWithSettings();

        return true;
      } else {
        showError(result.error || "Erro ao salvar configuração");
        return false;
      }
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      showError(
        "Erro ao salvar configuração: " + (error.message || "Erro desconhecido")
      );
      return false;
    }
  }

  /**
   * Registrar handler para um tipo de configuração
   * @param {string} configKey - Chave da configuração
   * @param {Object} handler - Handler com validação, formatação e callback de salvamento
   */
  registerHandler(configKey, handler) {
    this.configHandlers.set(configKey, handler);
  }

  /**
   * Anexar eventos
   */
  attachEvents() {
    // Evento de salvar
    if (this.el.btnSalvar) {
      this.el.btnSalvar.addEventListener("click", () => this.handleSave());
    }

    // Eventos do input (usar delegação para funcionar mesmo quando o input muda)
    if (this.el.modal) {
      // Enter para salvar
      this.el.modal.addEventListener("keypress", (e) => {
        if (e.target === this.el.input && e.key === "Enter") {
          e.preventDefault();
          this.handleSave();
        }
      });

      // Formatação e validação em tempo real
      this.el.modal.addEventListener("input", (e) => {
        if (e.target === this.el.input) {
          const handler = this.currentConfig?.handler;
          if (!handler) return;

          const input = e.target;
          let value = input.value;

          // Formatação especial para campos monetários
          if (
            handler.configKey === "meta-receita-mensal" ||
            handler.configKey === "taxa-entrega" ||
            handler.configKey === "taxa-conversao-ganho-clube" ||
            handler.configKey === "taxa-conversao-resgate-clube"
          ) {
            value = this.formatCurrencyInput(value, input);
          }
          // Aplicar parser e formatação em tempo real para outros campos text que precisam de formatação
          else if (
            input.type === "text" &&
            handler.formatter &&
            handler.parser
          ) {
            const parsed = handler.parser(value);
            const formatted = handler.formatter(parsed);

            if (formatted !== value) {
              const cursorPosition = input.selectionStart;
              input.value = formatted;

              // Restaurar posição do cursor
              try {
                if (
                  input.setSelectionRange &&
                  typeof cursorPosition === "number" &&
                  cursorPosition >= 0
                ) {
                  // Calcular nova posição considerando caracteres adicionados/removidos
                  const oldLength = value.length;
                  const newLength = formatted.length;
                  const diff = newLength - oldLength;
                  const newPosition = Math.max(
                    0,
                    Math.min(cursorPosition + diff, formatted.length)
                  );
                  input.setSelectionRange(newPosition, newPosition);
                }
              } catch (error) {
                // Ignorar silenciosamente
              }
            }
          }

          // Evitar validações excessivas durante digitação rápida
          if (!this._debouncedValidate) {
            this._debouncedValidate = debounce(() => {
              this.validateInput();
            }, 300);
          }
          this._debouncedValidate();
        }
      });

      // Formatação ao perder foco (para valores monetários)
      this.el.modal.addEventListener(
        "blur",
        (e) => {
          if (e.target === this.el.input) {
            const handler = this.currentConfig?.handler;
            if (
              handler &&
              (handler.configKey === "meta-receita-mensal" ||
                handler.configKey === "taxa-entrega" ||
                handler.configKey === "taxa-conversao-ganho-clube" ||
                handler.configKey === "taxa-conversao-resgate-clube")
            ) {
              // Aplicar formatação completa ao perder foco
              const value = e.target.value;
              if (value) {
                const formatted = handler.formatter(value);
                if (formatted && formatted !== value) {
                  e.target.value = formatted;
                }
              }
            }
            this.validateInput();
          }
        },
        true
      );

      // Ao focar em campo monetário, limpar formatação para edição fácil
      this.el.modal.addEventListener(
        "focus",
        (e) => {
          if (e.target === this.el.input) {
            const handler = this.currentConfig?.handler;
            if (
              handler &&
              (handler.configKey === "meta-receita-mensal" ||
                handler.configKey === "taxa-entrega" ||
                handler.configKey === "taxa-conversao-ganho-clube" ||
                handler.configKey === "taxa-conversao-resgate-clube")
            ) {
              // Remover formatação temporariamente para facilitar edição
              const value = e.target.value;
              if (value) {
                const num = this.parseCurrency(value);
                if (!isNaN(num) && num > 0) {
                  // Mostrar número sem formatação durante edição
                  e.target.value = num.toFixed(2).replace(".", ",");
                }
              }
            }
          }
        },
        true
      );
    }

    // Fechar modal ao clicar no overlay
    if (this.el.modal) {
      const overlay = this.el.modal.querySelector(".div-overlay");
      if (overlay) {
        overlay.addEventListener("click", () => this.closeModal());
      }
    }

    // Conectar botões "Definir" e ícones de edição
    this.connectConfigButtons();

    // Eventos da modal de horários de funcionamento
    if (this.el.btnSalvarHorarios) {
      this.el.btnSalvarHorarios.addEventListener("click", () =>
        this.handleSaveStoreHours()
      );
    }

    // Fechar modal de horários ao clicar no overlay
    if (this.el.modalHorarios) {
      const overlay = this.el.modalHorarios.querySelector(".div-overlay");
      if (overlay) {
        overlay.addEventListener("click", () => this.closeStoreHoursModal());
      }
    }
  }

  /**
   * Conectar botões "Definir" e ícones de edição aos handlers
   * Cria os botões dinamicamente se não existirem
   */
  connectConfigButtons() {
    const secaoConfiguracoes = document.getElementById("secao-configuracoes");
    if (!secaoConfiguracoes) return;

    // Criar botões para elementos .info que podem ter configurações
    const infoElements = secaoConfiguracoes.querySelectorAll(".info");
    infoElements.forEach((infoElement) => {
      // Verificar se já existe botão
      let button = infoElement.querySelector("button");
      const configLabel = infoElement
        .querySelector(".config")
        ?.textContent?.trim();

      if (!configLabel) return;

      const configKey = this.getConfigKeyFromLabel(configLabel);

      // Verificar se é elemento com .tempo (prazos) - eles serão gerenciados em updateUIWithSettings
      const hasTempo = infoElement.querySelector(".tempo");
      if (hasTempo) {
        // Para elementos .tempo, criar botão "Definir" apenas se não existir
        // O updateUIWithSettings vai atualizar para "Editar" quando houver valor
        if (!button && configKey) {
          button = document.createElement("button");
          button.textContent = "Definir";
          infoElement.appendChild(button);

          button.addEventListener("click", () => {
            this.openModal(configKey, null, infoElement);
          });
        }
        return;
      }

      // Botões especiais (categorias e grupos-adicionais)
      if (configLabel === "Categorias do cardápio") {
        if (!button) {
          button = document.createElement("button");
          button.id = "btn-categorias";
          button.textContent = "Acessar";
          infoElement.appendChild(button);
        }
        // Manter funcionalidade existente se houver outro script
        return;
      }

      if (configLabel === "Grupos de adicionais de produtos do cardápio") {
        if (!button) {
          button = document.createElement("button");
          button.id = "btn-grupos-adicionais";
          button.textContent = "Acessar";
          infoElement.appendChild(button);
        }
        // Manter funcionalidade existente se houver outro script
        return;
      }

      // Botão especial para Horários de Funcionamento (abre modal especial)
      if (configLabel === "Horário de funcionamento") {
        if (!button) {
          button = document.createElement("button");
          button.textContent = "Gerenciar";
          infoElement.appendChild(button);
        }

        // Conectar evento para abrir modal de horários
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener("click", () => {
          this.openStoreHoursModal();
        });
        return;
      }

      // Para outros elementos .info, criar botão "Definir" se não existir
      if (!button && configKey) {
        button = document.createElement("button");
        button.textContent = "Definir";
        infoElement.appendChild(button);
      }

      // Conectar evento ao botão (evitar múltiplos listeners)
      if (button && configKey) {
        // Remover listener anterior se existir (usando cloneNode para remover todos)
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        newButton.addEventListener("click", () => {
          this.openModal(configKey, null, infoElement);
        });
      }
    });

    // Criar ícones de edição nos elementos .tempo e conectar eventos
    const tempoElements = secaoConfiguracoes.querySelectorAll(".tempo");
    tempoElements.forEach((tempoDiv) => {
      const infoDiv = tempoDiv.closest(".info");
      if (!infoDiv) return;

      const configLabel = infoDiv.querySelector(".config")?.textContent?.trim();
      if (!configLabel) return;

      const configKey = this.getConfigKeyFromLabel(configLabel);
      if (!configKey) return;

      // Verificar se já existe ícone
      let editIcon = tempoDiv.querySelector("i.fa-pen-to-square");

      if (!editIcon) {
        // Criar ícone de edição
        editIcon = document.createElement("i");
        editIcon.className = "fa-solid fa-pen-to-square";
        tempoDiv.appendChild(editIcon);
      }

      // Conectar evento
      editIcon.addEventListener("click", () => {
        // Extrair valor atual do tempo
        const tempoText =
          tempoDiv.querySelector("p")?.textContent?.trim() || "";
        const currentValue = tempoText.replace(/\D/g, "");
        this.openModal(configKey, currentValue, infoDiv);
      });
    });
  }

  /**
   * Obter chave de configuração a partir do label
   * @param {string} label - Texto do label
   * @returns {string|null} Chave da configuração ou null
   */
  getConfigKeyFromLabel(label) {
    const labelMap = {
      "Meta de Receita Mensal": "meta-receita-mensal",
      "Meta de Pedidos Mensais": "meta-pedidos-mensais",
      "Prazo de iniciação de pedido": "prazo-iniciacao-pedido",
      "Prazo de preparo de pedido": "prazo-preparo-pedido",
      "Prazo de envio de pedido": "prazo-envio-pedido",
      "Prazo de entrega de pedido": "prazo-entrega-pedido",
      "Taxa de entrega": "taxa-entrega",
      "Taxa de conversão de ganho do clube": "taxa-conversao-ganho-clube",
      "Taxa de conversão de resgate do clube": "taxa-conversao-resgate-clube",
      "Taxa de expiração de pontos do clube": "taxa-expiracao-pontos",
      // ALTERAÇÃO: Mapeamentos para taxas financeiras adicionados
      "Taxa de Cartão de Crédito (%)": "taxa-cartao-credito",
      "Taxa de Cartão de Débito (%)": "taxa-cartao-debito",
      "Taxa de PIX (%)": "taxa-pix",
      "Taxa do iFood (%)": "taxa-ifood",
      "Taxa do Uber Eats (%)": "taxa-uber-eats",
      "Nome Fantasia": "nome-fantasia",
      "Razão Social": "razao-social",
      CNPJ: "cnpj",
      Endereço: "endereco-empresa",
      Telefone: "telefone-empresa",
      "E-mail": "email-empresa",
    };

    return labelMap[label] || null;
  }

  /**
   * Abrir modal de configuração
   * @param {string} configKey - Chave da configuração
   * @param {string|null} currentValue - Valor atual (null para nova configuração)
   * @param {HTMLElement|null} sourceElement - Elemento de origem para atualizar após salvar
   */
  openModal(configKey, currentValue = null, sourceElement = null) {
    const handler = this.configHandlers.get(configKey);
    if (!handler) {
      console.error(`Handler não encontrado para configuração: ${configKey}`);
      return;
    }

    if (!this.el.modal) {
      console.error("Modal não encontrada");
      return;
    }

    // Se não houver valor fornecido, buscar das configurações carregadas
    if (currentValue === null || currentValue === "") {
      const savedValue = this.getCurrentValue(configKey);
      if (savedValue !== null && savedValue !== undefined) {
        currentValue = String(savedValue);
      }
    }

    // Se o valor atual contém "min" (vindo de .tempo), extrair apenas o número
    if (
      currentValue &&
      typeof currentValue === "string" &&
      currentValue.includes("min")
    ) {
      // Extrair apenas os dígitos
      currentValue = currentValue.replace(/\D/g, "");
    }

    // Garantir que o input único esteja visível e os duplos ocultos (padrão)
    const divInputUnico = document.getElementById("div-input-unico");
    const divInputsDuplos = document.getElementById("div-inputs-duplos");
    if (divInputUnico) divInputUnico.style.display = "block";
    if (divInputsDuplos) divInputsDuplos.style.display = "none";

    // Armazenar contexto atual
    this.currentConfig = {
      key: configKey,
      handler: handler,
      currentValue: currentValue,
      sourceElement: sourceElement,
    };

    // Configurar título
    if (this.el.titulo) {
      this.el.titulo.textContent = handler.title || "Configurar";
    }

    // Configurar label e descrição
    if (this.el.configLabel) {
      this.el.configLabel.textContent = handler.label || "";
    }

    // Buscar descrição: primeiro do handler, depois do elemento de origem
    let descricao = handler.description || "";
    if (!descricao && sourceElement) {
      const descElement = sourceElement.querySelector(".descricao");
      if (descElement) {
        descricao = descElement.textContent.trim();
      }
    }

    if (this.el.configDescricao) {
      this.el.configDescricao.textContent = descricao;
      this.el.configDescricao.style.display = descricao ? "block" : "none";
      // Estilizar descrição para melhor legibilidade
      if (descricao) {
        this.el.configDescricao.style.lineHeight = "1.5";
        this.el.configDescricao.style.marginTop = "4px";
      }
    }

    // Configurar input
    if (this.el.labelInput) {
      this.el.labelInput.textContent = handler.inputLabel || "Valor";
    }

    if (this.el.input) {
      this.el.input.type = handler.inputType || "text";
      this.el.input.placeholder = handler.placeholder || "";

      // Configurar atributos HTML baseados no tipo de campo
      this.configureInputAttributes(handler);

      // Limpar validação customizada
      this.el.input.setCustomValidity("");

      // Definir valor inicial
      let initialValue = currentValue || "";

      // Se o input for do tipo number, garantir que o valor é apenas numérico
      if (handler.inputType === "number" && initialValue) {
        // Remover caracteres não numéricos (exceto ponto e vírgula para decimais)
        initialValue = initialValue
          .toString()
          .replace(/[^\d,.-]/g, "")
          .replace(",", ".");
        // Se estiver vazio após limpeza, usar vazio
        if (initialValue === "" || initialValue === ".") {
          initialValue = "";
        }
      } else if (initialValue && handler.inputType === "text") {
        // Para campos monetários (text), se o valor vem como número do backend
        if (
          handler.configKey === "meta-receita-mensal" ||
          handler.configKey === "taxa-entrega" ||
          handler.configKey === "taxa-conversao-ganho-clube" ||
          handler.configKey === "taxa-conversao-resgate-clube"
        ) {
          // Se é número, converter para formato brasileiro para edição
          const num =
            typeof initialValue === "number"
              ? initialValue
              : this.parseCurrency(String(initialValue));
          if (!isNaN(num) && num > 0) {
            // Mostrar formato brasileiro para edição (0,01)
            initialValue = num.toFixed(2).replace(".", ",");
          } else {
            initialValue = "";
          }
        } else if (handler.formatter) {
          // Para outros campos text com formatter
          initialValue = handler.formatter(initialValue);
        }
      }

      // Definir o valor no input
      if (initialValue !== "") {
        this.el.input.value = initialValue;
      } else {
        this.el.input.value = "";
      }

      // Limpar classes de estado
      this.el.input.classList.remove("error", "success");

      // Focar no input
      setTimeout(() => {
        this.el.input.focus();
        // select() funciona bem para inputs text, mas pode causar problemas em number
        // Tentar selecionar apenas se for input text ou se o método estiver disponível
        if (this.el.input.type === "text") {
          try {
            this.el.input.select();
          } catch (error) {
            // Ignorar erro silenciosamente
          }
        }
      }, 100);
    }

    // Abrir modal
    abrirModal("modal-configuracao");
  }

  /**
   * Fechar modal
   */
  closeModal() {
    fecharModal("modal-configuracao");
    this.currentConfig = null;

    // Limpar timeout de validação pendente
    if (this._validationTimeout) {
      clearTimeout(this._validationTimeout);
      this._validationTimeout = null;
    }

    if (this.el.input) {
      this.el.input.value = "";
      this.el.input.classList.remove("error", "success");
    }
  }

  /**
   * Converter valor formatado para número
   * @param {string|number} value - Valor formatado (ex: "R$ 1.234,56" ou "1234,56" ou 0.01)
   * @returns {number} Valor numérico
   */
  parseCurrency(value) {
    // Se já é número, retornar direto (garantir precisão)
    if (typeof value === "number") {
      return value;
    }

    // Se vazio ou null, retornar 0
    if (!value || value === "") return 0;

    // Converter para string se necessário
    const strValue = String(value).trim();
    if (strValue === "" || strValue === "0") return 0;

    // Remover símbolos de moeda, espaços e separadores de milhar
    let cleaned = strValue
      .replace(/[R$\s]/g, "") // Remove R$, espaços
      .trim();

    // Verificar se tem vírgula (formato brasileiro) ou ponto (formato internacional)
    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");

    if (hasComma && hasDot) {
      // Formato brasileiro: 1.234,56
      // Remove pontos (milhares) e substitui vírgula por ponto
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (hasComma && !hasDot) {
      // Apenas vírgula: 0,01 (formato brasileiro)
      cleaned = cleaned.replace(",", ".");
    }
    // Se tem apenas ponto ou nenhum, usar direto (já está no formato correto)

    const num = parseFloat(cleaned);
    // Usar toFixed e parseFloat para garantir precisão correta para valores decimais
    if (isNaN(num)) return 0;

    // Para valores menores que 1, garantir que não seja arredondado
    // Exemplo: 0.01 deve permanecer 0.01, não 0
    return num;
  }

  /**
   * Formatar input de moeda em tempo real durante digitação
   * @param {string} value - Valor atual do input
   * @param {HTMLInputElement} input - Elemento input
   * @returns {string} Valor formatado
   */
  formatCurrencyInput(value, input) {
    // Remover tudo exceto dígitos
    const digits = value.replace(/\D/g, "");

    if (!digits) {
      input.value = "";
      return "";
    }

    // Converter centavos para reais
    const num = parseInt(digits, 10) / 100;

    // Formatar com separadores
    const formatted = num.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const cursorPosition = input.selectionStart;
    input.value = formatted;

    // Restaurar posição do cursor (ajustada para formatação)
    try {
      if (
        input.setSelectionRange &&
        typeof cursorPosition === "number" &&
        cursorPosition >= 0
      ) {
        // Calcular posição ajustada (cada dígito adicionado aumenta a posição)
        const digitsBefore = value
          .substring(0, cursorPosition)
          .replace(/\D/g, "").length;
        const newPosition = Math.min(
          formatted.length,
          cursorPosition + (formatted.length - value.length)
        );
        input.setSelectionRange(newPosition, newPosition);
      }
    } catch (error) {
      // Ignorar silenciosamente
    }

    return formatted;
  }

  /**
   * Configurar atributos HTML do input baseado no handler
   * @param {Object} handler - Handler da configuração
   */
  configureInputAttributes(handler) {
    if (!this.el.input || !handler) return;

    // Remover atributos anteriores que podem interferir
    this.el.input.removeAttribute("min");
    this.el.input.removeAttribute("max");
    this.el.input.removeAttribute("minlength");
    this.el.input.removeAttribute("maxlength");
    this.el.input.removeAttribute("step");
    this.el.input.removeAttribute("required");
    this.el.input.removeAttribute("pattern");

    // Configurar baseado no tipo de input
    if (handler.inputType === "number") {
      // Campos numéricos (prazos, pedidos)
      if (
        handler.configKey?.includes("prazo") ||
        handler.configKey === "meta-pedidos-mensais"
      ) {
        // Valores inteiros (prazos e pedidos): min 1, step 1
        this.el.input.min = "1";
        this.el.input.step = "1";
        this.el.input.max = "9999"; // Limite razoável
      } else if (
        handler.configKey?.includes("taxa") &&
        handler.configKey !== "taxa-expiracao-pontos"
      ) {
        // Taxas monetárias: min 0, step 0.01
        this.el.input.min = "0";
        this.el.input.step = "0.01";
      } else if (handler.configKey === "taxa-expiracao-pontos") {
        // Taxa de expiração em dias: min 1, step 1
        this.el.input.min = "1";
        this.el.input.step = "1";
        this.el.input.max = "365"; // Máximo de 1 ano
      }
    } else if (handler.inputType === "text") {
      // Campos de texto
      if (
        handler.configKey === "meta-receita-mensal" ||
        handler.configKey === "taxa-entrega" ||
        handler.configKey === "taxa-conversao-ganho-clube" ||
        handler.configKey === "taxa-conversao-resgate-clube"
      ) {
        // Campos monetários: aceitar apenas números e formatação
        this.el.input.maxLength = "20"; // Limite razoável para valores monetários
      } else if (handler.configKey === "cnpj") {
        // CNPJ: 14 dígitos
        this.el.input.maxLength = "18"; // Com formatação: 00.000.000/0000-00
        this.el.input.pattern =
          "[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}\\/[0-9]{4}-[0-9]{2}";
      } else if (handler.configKey === "telefone-empresa") {
        // Telefone: 10 ou 11 dígitos
        this.el.input.maxLength = "15"; // Com formatação: (00) 00000-0000
        this.el.input.pattern = "\\([0-9]{2}\\) [0-9]{4,5}-[0-9]{4}";
      } else if (handler.configKey === "email-empresa") {
        // Email: padrão HTML5 de email
        this.el.input.maxLength = "255";
        // O tipo 'email' já valida o formato
      } else if (
        handler.configKey === "nome-fantasia" ||
        handler.configKey === "razao-social"
      ) {
        // Nomes: até 255 caracteres
        this.el.input.maxLength = "255";
        this.el.input.minLength = "1";
      } else if (handler.configKey === "endereco-empresa") {
        // Endereço: até 500 caracteres
        this.el.input.maxLength = "500";
        this.el.input.minLength = "1";
      }
    } else if (handler.inputType === "email") {
      // Email: maxlength padrão
      this.el.input.maxLength = "255";
    }

    // Campo obrigatório por padrão, exceto se for opcional
    // ALTERAÇÃO: Campos opcionais não são required (permite null)
    if (!handler.isOptional) {
      this.el.input.required = true;
    } else {
      this.el.input.required = false;
    }
  }

  /**
   * Validar valor do input
   * @returns {boolean} True se válido
   */
  validateInput() {
    if (!this.currentConfig) return false;

    const value = this.el.input.value.trim();
    const handler = this.currentConfig.handler;

    // ALTERAÇÃO: Se campo for opcional e valor vazio, considerar válido (permite null)
    if (handler.isOptional && (!value || value.trim() === "")) {
      return true;
    }

    // Validar
    let valueToValidate = value;
    if (handler.parser) {
      valueToValidate = handler.parser(value);
    }

    const isValid = handler.validator
      ? handler.validator(valueToValidate)
      : value.length > 0;

    // Mensagens de erro personalizadas
    let errorMessage = "";
    if (!isValid && value) {
      // Validar novamente para obter mensagem específica
      let validation = null;
      if (handler.configKey === "cnpj") {
        const cnpj = value.replace(/\D/g, "");
        validation = validateCNPJ(cnpj);
        errorMessage = validation.message || "CNPJ inválido";
      } else if (handler.configKey === "telefone-empresa") {
        validation = validatePhone(value);
        errorMessage = validation.message || "Telefone inválido";
      } else if (handler.configKey === "email-empresa") {
        validation = validateEmail(value);
        errorMessage = validation.message || "Digite um e-mail válido";
      } else if (handler.inputType === "number") {
        errorMessage = "Digite um valor válido";
      } else {
        errorMessage = "Valor inválido";
      }
    } else if (!value && this.el.input.required && !handler.isOptional) {
      // ALTERAÇÃO: Não exigir valor se campo for opcional
      errorMessage = "Este campo é obrigatório";
    }

    // Atualizar validação customizada
    if (this.el.input) {
      this.el.input.setCustomValidity(errorMessage);
      this.el.input.classList.remove("error", "success");

      if (value && !isValid) {
        this.el.input.classList.add("error");
      } else if (value && isValid) {
        this.el.input.classList.add("success");
      }
    }

    return isValid;
  }

  /**
   * Processar salvamento
   */
  async handleSave() {
    if (!this.currentConfig) {
      showError("Nenhuma configuração selecionada");
      return;
    }

    const value = this.el.input.value.trim();
    // ALTERAÇÃO: Permitir valores vazios se campo for opcional (permite null)
    const handler = this.currentConfig?.handler;
    if (!value && (!handler || !handler.isOptional)) {
      showError("Por favor, preencha o valor");
      this.el.input.classList.add("error");
      return;
    }

    // Validar
    if (!this.validateInput()) {
      showError("Valor inválido. Verifique os dados informados.");
      return;
    }

    // Processar valor (aplicar parser se disponível)
    let valueToSave = value;
    if (this.currentConfig.handler.parser) {
      valueToSave = this.currentConfig.handler.parser(value);
    }

    // Desabilitar botão durante salvamento
    if (this.el.btnSalvar) {
      this.el.btnSalvar.disabled = true;
      const originalText = this.el.btnSalvar.innerHTML;
      this.el.btnSalvar.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> <span>Salvando...</span>';

      try {
        // Chamar callback de salvamento
        const success = await this.currentConfig.handler.onSave(valueToSave);

        if (success) {
          showSuccess("Configuração salva com sucesso!");

          // Atualizar elemento de origem se disponível
          if (this.currentConfig.sourceElement) {
            this.updateSourceElement(value, this.currentConfig.sourceElement);
          }

          this.closeModal();
        } else {
          showError("Erro ao salvar configuração. Tente novamente.");
        }
      } catch (error) {
        console.error("Erro ao salvar configuração:", error);
        showError(
          "Erro ao salvar configuração: " +
            (error.message || "Erro desconhecido")
        );
      } finally {
        // Restaurar botão
        this.el.btnSalvar.disabled = false;
        this.el.btnSalvar.innerHTML = originalText;
      }
    }
  }

  /**
   * Atualizar elemento de origem após salvar
   * @param {string} value - Valor salvo
   * @param {HTMLElement} sourceElement - Elemento de origem
   */
  updateSourceElement(value, sourceElement) {
    if (!sourceElement || !this.currentConfig) return;

    const handler = this.currentConfig.handler;

    // Se for um tempo (prazo), atualizar o texto
    const tempoDiv = sourceElement.querySelector(".tempo");
    if (tempoDiv && handler.formatter) {
      const formattedValue = handler.formatter(value);
      const tempoP = tempoDiv.querySelector("p");
      if (tempoP) {
        tempoP.textContent = formattedValue;
      }
    }

    // TODO: Atualizar outros tipos de elementos conforme necessário
  }

  /**
   * Atualizar UI com horários de funcionamento carregados
   */
  updateStoreHoursUI() {
    const secaoConfiguracoes = document.getElementById("secao-configuracoes");
    if (!secaoConfiguracoes) return;

    const infoElement = Array.from(
      secaoConfiguracoes.querySelectorAll(".info")
    ).find((el) => {
      const configLabel = el.querySelector(".config")?.textContent?.trim();
      return configLabel === "Horário de funcionamento";
    });

    if (!infoElement) return;

    const valorDiv = infoElement.querySelector(".valor");
    if (!valorDiv) return;

    // Se há horários configurados, exibir resumo
    const hasConfiguredHours =
      this.storeHours &&
      this.storeHours.some(
        (h) => h.is_open && (h.opening_time || h.closing_time)
      );

    if (hasConfiguredHours) {
      // Criar resumo dos horários
      const summary = this.formatStoreHoursSummary();

      // Limpar e atualizar conteúdo
      while (valorDiv.firstChild) {
        valorDiv.removeChild(valorDiv.firstChild);
      }

      const summaryText = document.createElement("span");
      summaryText.className = "value-text";
      summaryText.textContent = summary;
      summaryText.style.fontSize = "0.9rem";
      summaryText.style.fontWeight = "500";
      summaryText.style.color = "var(--color-texto-black)";

      valorDiv.appendChild(summaryText);
      valorDiv.style.display = "flex";
      valorDiv.style.alignItems = "center";
      valorDiv.style.gap = "8px";

      // Adicionar ícone de edição
      const editIcon = document.createElement("i");
      editIcon.className = "fa-solid fa-pen-to-square config-edit-icon";
      editIcon.title = "Editar";
      editIcon.style.cursor = "pointer";
      editIcon.style.color = "var(--color-texto-erased)";
      editIcon.style.fontSize = "0.85rem";
      editIcon.style.marginTop = "2px";
      editIcon.addEventListener("click", () => {
        this.openStoreHoursModal();
      });
      editIcon.addEventListener("mouseenter", () => {
        editIcon.style.color = "var(--color-texto-black)";
      });
      editIcon.addEventListener("mouseleave", () => {
        editIcon.style.color = "var(--color-texto-erased)";
      });
      valorDiv.appendChild(editIcon);

      // Remover botão "Gerenciar" se existir
      const button = infoElement.querySelector("button");
      if (button && button.textContent === "Gerenciar") {
        button.remove();
      }
    } else {
      // Não há horários configurados, mostrar botão "Gerenciar"
      valorDiv.style.display = "none";
    }
  }

  /**
   * Formatar resumo dos horários para exibição
   */
  formatStoreHoursSummary() {
    if (!this.storeHours || this.storeHours.length === 0) {
      return "Não configurado";
    }

    const openDays = this.storeHours.filter(
      (h) => h.is_open && (h.opening_time || h.closing_time)
    );

    if (openDays.length === 0) {
      return "Loja fechada";
    }

    // Agrupar dias com mesmos horários
    const groups = {};
    openDays.forEach((day) => {
      const key = `${day.opening_time || "--"}-${day.closing_time || "--"}`;
      if (!groups[key]) {
        groups[key] = {
          opening_time: day.opening_time,
          closing_time: day.closing_time,
          days: [],
        };
      }
      groups[key].days.push(day.day_name);
    });

    // Criar texto resumido
    const summaries = Object.values(groups).map((group) => {
      const days =
        group.days.length === 7
          ? "Todos os dias"
          : group.days.length === 5 &&
            group.days.includes("Segunda-feira") &&
            group.days.includes("Sexta-feira")
          ? "Segunda a Sexta"
          : group.days.join(", ");
      const time = `${group.opening_time || "--:--"} às ${
        group.closing_time || "--:--"
      }`;
      return `${days}: ${time}`;
    });

    return summaries.join(" | ");
  }

  /**
   * Abrir modal de horários de funcionamento
   */
  async openStoreHoursModal() {
    if (!this.el.modalHorarios || !this.el.tableBodyHorarios) {
      console.error("Elementos da modal de horários não encontrados");
      return;
    }

    // Recarregar horários antes de abrir
    await this.loadStoreHours();

    // Renderizar tabela
    this.renderStoreHoursTable();

    // Abrir modal
    abrirModal("modal-horarios-funcionamento");
  }

  /**
   * Renderizar tabela de horários
   */
  renderStoreHoursTable() {
    if (!this.el.tableBodyHorarios) return;

    // Limpar tabela
    this.el.tableBodyHorarios.innerHTML = "";

    // Garantir que temos 7 dias (0-6)
    const dayNames = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
    const allDays = [];

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      // Buscar horário existente ou criar padrão
      let dayData = this.storeHours.find((h) => h.day_of_week === dayOfWeek);

      if (!dayData) {
        dayData = {
          day_of_week: dayOfWeek,
          day_name: dayNames[dayOfWeek],
          opening_time: null,
          closing_time: null,
          is_open: true,
        };
      }

      allDays.push(dayData);
    }

    // Renderizar cada dia
    allDays.forEach((dayData) => {
      const row = document.createElement("tr");

      // Coluna: Nome do dia
      const tdDia = document.createElement("td");
      tdDia.className = "dia-nome";
      tdDia.textContent = dayData.day_name;
      row.appendChild(tdDia);

      // Coluna: Checkbox "Aberto"
      const tdCheckbox = document.createElement("td");
      tdCheckbox.className = "checkbox-cell";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = dayData.is_open !== false;
      checkbox.dataset.dayOfWeek = dayData.day_of_week;
      checkbox.addEventListener("change", (e) => {
        const isOpen = e.target.checked;
        const dayOfWeek = parseInt(e.target.dataset.dayOfWeek);
        this.toggleDayHours(dayOfWeek, isOpen);
      });
      tdCheckbox.appendChild(checkbox);
      row.appendChild(tdCheckbox);

      // Coluna: Horário de abertura
      const tdAbertura = document.createElement("td");
      tdAbertura.className = "horario-input-cell";
      const inputAbertura = document.createElement("input");
      inputAbertura.type = "time";
      inputAbertura.value = dayData.opening_time || "";
      inputAbertura.dataset.dayOfWeek = dayData.day_of_week;
      inputAbertura.dataset.type = "opening";
      inputAbertura.disabled = !checkbox.checked;
      inputAbertura.addEventListener("change", (e) => {
        const dayOfWeek = parseInt(e.target.dataset.dayOfWeek);
        const time = e.target.value;
        this.updateDayHour(dayOfWeek, "opening_time", time);
      });
      tdAbertura.appendChild(inputAbertura);
      row.appendChild(tdAbertura);

      // Coluna: Horário de fechamento
      const tdFechamento = document.createElement("td");
      tdFechamento.className = "horario-input-cell";
      const inputFechamento = document.createElement("input");
      inputFechamento.type = "time";
      inputFechamento.value = dayData.closing_time || "";
      inputFechamento.dataset.dayOfWeek = dayData.day_of_week;
      inputFechamento.dataset.type = "closing";
      inputFechamento.disabled = !checkbox.checked;
      inputFechamento.addEventListener("change", (e) => {
        const dayOfWeek = parseInt(e.target.dataset.dayOfWeek);
        const time = e.target.value;
        this.updateDayHour(dayOfWeek, "closing_time", time);
      });
      tdFechamento.appendChild(inputFechamento);
      row.appendChild(tdFechamento);

      this.el.tableBodyHorarios.appendChild(row);
    });
  }

  /**
   * Alternar estado de aberto/fechado de um dia
   */
  toggleDayHours(dayOfWeek, isOpen) {
    const dayData = this.storeHours.find((h) => h.day_of_week === dayOfWeek);

    if (dayData) {
      dayData.is_open = isOpen;
    } else {
      const dayNames = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ];
      this.storeHours.push({
        day_of_week: dayOfWeek,
        day_name: dayNames[dayOfWeek],
        opening_time: null,
        closing_time: null,
        is_open: isOpen,
      });
    }

    // Atualizar inputs de horário
    const checkbox = this.el.tableBodyHorarios.querySelector(
      `input[data-day-of-week="${dayOfWeek}"][type="checkbox"]`
    );
    if (checkbox) {
      const row = checkbox.closest("tr");
      if (row) {
        const inputs = row.querySelectorAll('input[type="time"]');
        inputs.forEach((input) => {
          input.disabled = !isOpen;
        });
      }
    }
  }

  /**
   * Atualizar horário de um dia
   */
  updateDayHour(dayOfWeek, field, time) {
    const dayData = this.storeHours.find((h) => h.day_of_week === dayOfWeek);

    if (dayData) {
      dayData[field] = time || null;
    } else {
      const dayNames = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ];
      this.storeHours.push({
        day_of_week: dayOfWeek,
        day_name: dayNames[dayOfWeek],
        opening_time: field === "opening_time" ? time : null,
        closing_time: field === "closing_time" ? time : null,
        is_open: true,
      });
    }
  }

  /**
   * Salvar horários de funcionamento
   */
  async handleSaveStoreHours() {
    if (!this.el.btnSalvarHorarios) return;

    // Validar horários
    const validationErrors = this.validateStoreHours();
    if (validationErrors.length > 0) {
      showError(validationErrors.join("\n"));
      return;
    }

    // Preparar dados para envio
    const hoursData = this.storeHours.map((day) => ({
      day_of_week: day.day_of_week,
      opening_time: day.is_open ? day.opening_time || null : null,
      closing_time: day.is_open ? day.closing_time || null : null,
      is_open: day.is_open !== false,
    }));

    // Desabilitar botão durante salvamento
    this.el.btnSalvarHorarios.disabled = true;
    const originalText = this.el.btnSalvarHorarios.innerHTML;
    this.el.btnSalvarHorarios.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> <span>Salvando...</span>';

    try {
      const result = await bulkUpdateStoreHours(hoursData);

      if (result.success) {
        showSuccess("Horários de funcionamento salvos com sucesso!");

        // Recarregar horários
        await this.loadStoreHours();

        // Fechar modal
        this.closeStoreHoursModal();
      } else {
        showError(result.error || "Erro ao salvar horários de funcionamento");
      }
    } catch (error) {
      console.error("Erro ao salvar horários:", error);
      showError(
        "Erro ao salvar horários: " + (error.message || "Erro desconhecido")
      );
    } finally {
      // Restaurar botão
      this.el.btnSalvarHorarios.disabled = false;
      this.el.btnSalvarHorarios.innerHTML = originalText;
    }
  }

  /**
   * Validar horários antes de salvar
   * Permite horários que atravessam a meia-noite (ex: fecha 01h, abre 05h)
   */
  validateStoreHours() {
    const errors = [];
    const missingTimes = [];
    const invalidTimes = [];

    this.storeHours.forEach((day) => {
      if (day.is_open) {
        if (!day.opening_time || !day.closing_time) {
          missingTimes.push(day.day_name);
        } else {
          const opening = this.timeToMinutes(day.opening_time);
          const closing = this.timeToMinutes(day.closing_time);

          // Validação permite horários que atravessam a meia-noite
          // Exemplos válidos:
          // - Horário normal: 10h abre, 22h fecha (opening < closing)
          // - Atravessa meia-noite: 05h abre, 01h fecha (closing < opening, fecha até 12h do dia seguinte)
          // - Atravessa meia-noite: 18h abre, 02h fecha (closing < opening, fecha até 12h do dia seguinte)

          // Casos inválidos:
          // - opening < closing mas closing < opening (impossível matematicamente, mas serve como checagem)
          // - closing < opening mas closing > 720 (fecha muito tarde >12h após meia-noite) - provável erro
          // - opening < closing mas closing < 360 (fecha antes das 6h no mesmo dia) - provável erro

          // Validação principal
          let isValid = false;

          if (opening < closing) {
            // Horário normal: abre e fecha no mesmo dia
            // Fechamento deve ser após 6h (360min) para evitar casos como "10h abre, 8h fecha"
            if (closing >= 360) {
              isValid = true;
            }
          } else if (closing < opening) {
            // Atravessa meia-noite: fecha no dia seguinte
            // Exemplos válidos:
            // - 05h abre, 01h fecha (abre 5h, fecha 1h do dia seguinte)
            // - 18h abre, 02h fecha (abre 18h, fecha 2h do dia seguinte)
            //
            // Para ser válido:
            // - Fechamento deve ser até 12h (720min) do dia seguinte
            // - E (abertura >= 12h OU (abertura < 12h mas closing <= opening em valor absoluto))
            //
            // Isso permite casos como:
            // - 05h-01h (válido: fecha cedo no dia seguinte)
            // - 18h-02h (válido: fecha cedo no dia seguinte)
            // Mas rejeita casos como:
            // - 10h-08h (erro: 8h vem antes de 10h no mesmo dia)

            if (closing <= 720) {
              // Se abertura é após 12h, sempre válido (ex: 18h-02h)
              if (opening >= 720) {
                isValid = true;
              }
              // Se abertura é antes de 12h, verificar se fechamento é realmente do dia seguinte
              // (closing < opening já garante isso, mas adicionar verificação extra para evitar erros)
              else if (opening < 720 && closing < opening) {
                // Permitir se fechamento é muito cedo (até 6h), indicando que fecha de madrugada
                // E abertura é antes de fechamento em minutos, mas fechamento vem depois em horas do dia
                if (closing <= 360) {
                  // Fecha até 6h da manhã
                  isValid = true;
                }
              }
            }
          }

          if (!isValid) {
            invalidTimes.push(day.day_name);
          }
        }
      }
    });

    // Construir mensagens agrupadas e mais concisas
    if (missingTimes.length > 0) {
      if (missingTimes.length === 1) {
        errors.push(`${missingTimes[0]}: Horários obrigatórios.`);
      } else if (missingTimes.length <= 3) {
        errors.push(`${missingTimes.join(", ")}: Horários obrigatórios.`);
      } else {
        errors.push(
          `${missingTimes.length} dias sem horários: ${missingTimes
            .slice(0, 2)
            .join(", ")} e mais.`
        );
      }
    }

    if (invalidTimes.length > 0) {
      if (invalidTimes.length === 1) {
        errors.push(
          `${invalidTimes[0]}: Horário inválido. Verifique os horários.`
        );
      } else if (invalidTimes.length <= 3) {
        errors.push(`${invalidTimes.join(", ")}: Horários inválidos.`);
      } else {
        errors.push(
          `${invalidTimes.length} dias com horários inválidos: ${invalidTimes
            .slice(0, 2)
            .join(", ")} e mais.`
        );
      }
    }

    return errors;
  }

  /**
   * Converter horário HH:MM para minutos
   */
  timeToMinutes(time) {
    if (!time) return 0;
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Fechar modal de horários
   */
  closeStoreHoursModal() {
    fecharModal("modal-horarios-funcionamento");
  }
}

// Inicializar quando DOM estiver pronto
let configuracoesManager = null;

function initConfiguracoes() {
  const secaoConfiguracoes = document.getElementById("secao-configuracoes");
  if (secaoConfiguracoes && !configuracoesManager) {
    configuracoesManager = new ConfiguracoesManager();
  }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initConfiguracoes);
} else {
  initConfiguracoes();
}

// Exportar para uso externo
export { ConfiguracoesManager };
