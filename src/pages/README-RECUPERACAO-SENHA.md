# Sistema de Recuperação de Senha - Royal Burger

## 📋 Fluxo Completo

### 1. Solicitar Recuperação
**Página:** `esqueceu-senha.html`

O usuário:
1. Clica em "Esqueceu a senha?" no login
2. Insere seu e-mail cadastrado
3. Clica em "Enviar Link de Recuperação"
4. Recebe e-mail com link de recuperação

### 2. Redefinir Senha
**Página:** `redefinir-senha.html?token=xxxxx`

O usuário:
1. Clica no link recebido por e-mail
2. Define nova senha (com validação de segurança)
3. Confirma a nova senha
4. É redirecionado para o login

## 🔧 Arquivos Criados

### API (`src/js/api/user.js`)
```javascript
// Solicitar reset de senha
requestPasswordReset(email)

// Redefinir senha com token
resetPassword(token, new_password)
```

### Páginas HTML
- `src/pages/esqueceu-senha.html` - Solicitar recuperação
- `src/pages/redefinir-senha.html` - Nova senha com token

### JavaScript
- `src/js/ui/esqueceu-senha.js` - Lógica de solicitação
- `src/js/ui/redefinir-senha.js` - Lógica de redefinição

## 🎨 Design

Ambas as páginas seguem o mesmo padrão visual da verificação de e-mail:
- Card centralizado
- Ícone Royal Burger com cores da marca
- Campos com validação em tempo real
- Botões com gradiente amarelo
- Responsivo (mobile, tablet, desktop)

## ✅ Funcionalidades

### Página de Solicitação
- ✅ Validação de e-mail em tempo real
- ✅ Botão desabilitado até email válido
- ✅ Mensagem genérica de segurança (não revela se email existe)
- ✅ Redirecionamento automático após envio

### Página de Redefinição
- ✅ Validação de token na URL
- ✅ Requisitos de senha forte (maiúscula, número, especial, 8+ chars)
- ✅ Indicadores visuais dos requisitos
- ✅ Toggle para mostrar/ocultar senha
- ✅ Validação de senhas coincidentes
- ✅ Feedback visual (bordas vermelhas para erros)
- ✅ Redirecionamento para login após sucesso

## 🔒 Segurança

- Token único por solicitação
- Mensagens genéricas para não expor usuários existentes
- Requisitos fortes de senha
- Links com expiração (controlado pelo backend)
- Todas requisições usam `skipAuth: true` (usuário não está logado)

## 🚀 Uso

### Link no Login
O link "Esqueceu a senha?" já está configurado para redirecionar para `esqueceu-senha.html`

### Rotas Backend
```python
POST /api/users/request-password-reset
Body: { "email": "user@example.com" }

POST /api/users/reset-password
Body: { "token": "xxxxx", "new_password": "NewPass123!" }
```

## 📱 Responsividade

Todas as páginas são totalmente responsivas:
- Desktop: Cards largos e espaçosos
- Tablet: Ajuste de tamanhos
- Mobile: Layout otimizado para tela pequena
