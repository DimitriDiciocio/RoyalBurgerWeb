import { logout } from "../api/auth.js";
import { deleteMyCustomer, getMyCustomer } from "../api/user.js";
import { getStoredUser, logoutLocal } from "../api/api.js";
import { showConfirm, toastFromApiError, toastFromApiSuccess, setFlashMessage } from "./alerts.js";

$(document).ready(function () {
    // ====== Guarda de rota: somente clientes podem acessar esta página ======
    try {
        const u = getStoredUser();
        const role = u && (u.role || u.user_role || u.type);
        const isCustomer = String(role || '').toLowerCase() === 'customer';
        if (!isCustomer) {
            setFlashMessage({
                type: 'info',
                title: 'Acesso restrito',
                message: 'Você precisa estar logado como cliente para acessar seus dados.'
            });
            // Redireciona para a página inicial relativa a partir de src/pages/
            window.location.href = '../../index.html';
            return;
        }
    } catch (_e) {
        // Em qualquer falha, proteger a rota
        setFlashMessage({ type: 'info', title: 'Acesso restrito', message: 'Faça login como cliente para continuar.' });
        window.location.href = '../../index.html';
        return;
    }

    // mostra "dados da conta" ao entrar
    $("#dados-user").show();
    $("#enderecos, #config").hide();

    // já marca "Dados da conta" como selecionado
    $(".navega div:contains('Dados da conta')").addClass("select");

    // clique nos botões
    $(".navega div").click(function () {

        let texto = $(this).find("p").text().trim();

        // remove a classe de todos e adiciona só no clicado
        $(".navega div").removeClass("select");
        $(this).addClass("select");

        // esconde tudo
        $("#dados-user, #enderecos, #config").hide();

        // verifica qual botão foi clicado
        if (texto === "Dados da conta") {
            $("#dados-user").show();
        }
        else if (texto === "Endereços") {
            $("#enderecos").show();
        }
        else if (texto === "Configurações") {
            $("#config").show();
        }
    });

    // Logout
    const logoutBtn = document.querySelector('.logout button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm({
                title: 'Sair da conta',
                message: 'Deseja realmente sair da sua conta?',
                confirmText: 'Sair',
                cancelText: 'Cancelar',
                type: 'info'
            });
            if (!confirmed) return;
            try {
                await logout();
                toastFromApiSuccess({ msg: 'Logout realizado com sucesso.' });
            } catch (err) {
                // Mesmo se a API não tiver logout de servidor, garantimos o local
                logoutLocal();
                toastFromApiError(err, 'Você foi desconectado.');
            } finally {
                setTimeout(() => {
                    window.location.href = '../../index.html';
                }, 1200);
            }
        });
    }

    // Excluir conta (inativação)
    const deleteLink = document.querySelector('.logout p');
    if (deleteLink) {
        deleteLink.style.cursor = 'pointer';
        deleteLink.addEventListener('click', async () => {
            const confirmed = await showConfirm({
                title: 'Excluir conta',
                message: 'Tem certeza? Sua conta será inativada e você será desconectado.',
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                type: 'warning'
            });
            if (!confirmed) return;

            // Resolve ID do usuário logado
            async function resolveUserId() {
                const u = getStoredUser();
                const candidate = u && (u.id || u.user_id || u.customer_id || u.pk);
                if (candidate) return candidate;
                try {
                    const me = await getMyCustomer();
                    return me && (me.id || me.user_id || me.customer_id || me.pk);
                } catch (_e) {
                    return null;
                }
            }

            try {
                const userId = await resolveUserId();
                if (!userId) throw new Error('Não foi possível identificar o usuário.');
                const resp = await deleteMyCustomer(userId);
                toastFromApiSuccess(resp, 'Conta excluída com sucesso.');
            } catch (err) {
                toastFromApiError(err, 'Falha ao excluir sua conta.');
                return;
            }

            // Após exclusão, garantir logout local e redirecionar
            try { await logout(); } catch (_e) { logoutLocal(); }
            setTimeout(() => {
                window.location.href = '../../index.html';
            }, 1200);
        });
    }
});