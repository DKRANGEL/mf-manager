// ===================== MF ALERTS — Wrapper SweetAlert2 =====================
// Substitui alert(), confirm() e prompt() nativos por modais e toasts estilizados
// com o tema dark do sistema.

const MF = (() => {
    const BASE = {
        background: '#121214',
        color: '#e0e0e0',
        customClass: {
            popup:          'mf-popup',
            title:          'mf-title',
            htmlContainer:  'mf-html',
            confirmButton:  'mf-btn-confirm',
            cancelButton:   'mf-btn-cancel',
            input:          'mf-input',
        }
    };

    // ── TOAST (sucesso / info — não bloqueia) ──
    function toast(msg, icon = 'success', timer = 2800) {
        return Swal.fire({
            ...BASE,
            toast: true,
            position: 'bottom-end',
            icon,
            title: msg,
            showConfirmButton: false,
            timer,
            timerProgressBar: true,
            customClass: {
                popup: 'mf-toast',
                title: 'mf-toast-title',
                timerProgressBar: 'mf-progress',
            },
        });
    }

    // ── ALERT (erro / aviso — bloqueia) ──
    function alert(msg, icon = 'error', title = null) {
        const iconToTitle = { error: 'Erro', warning: 'Atenção', info: 'Aviso', success: 'Pronto' };
        return Swal.fire({
            ...BASE,
            icon,
            title: title || iconToTitle[icon] || 'Aviso',
            text: msg,
            confirmButtonText: 'OK',
            showCancelButton: false,
        });
    }

    // ── CONFIRM (pergunta sim/não) ──
    async function confirm(msg, { title = 'Confirmar?', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
        const result = await Swal.fire({
            ...BASE,
            icon: danger ? 'warning' : 'question',
            title,
            text: msg,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            showCancelButton: true,
            reverseButtons: true,
            customClass: {
                ...BASE.customClass,
                confirmButton: danger ? 'mf-btn-danger' : 'mf-btn-confirm',
            },
        });
        return result.isConfirmed;
    }

    // ── PROMPT (input de texto) ──
    async function prompt(msg, defaultValue = '', placeholder = '') {
        const result = await Swal.fire({
            ...BASE,
            title: msg,
            input: 'text',
            inputValue: defaultValue,
            inputPlaceholder: placeholder || defaultValue,
            confirmButtonText: 'OK',
            cancelButtonText: 'Cancelar',
            showCancelButton: true,
            reverseButtons: true,
        });
        return result.isConfirmed ? result.value : null;
    }

    return { toast, alert, confirm, prompt };
})();

// CSS injetado dinamicamente para combinar com o tema dark do sistema
(function injectStyles() {
    const css = `
        .mf-popup {
            background: #121214 !important;
            border: 1px solid #29292e !important;
            border-radius: 16px !important;
            box-shadow: 0 24px 80px rgba(0,0,0,0.8) !important;
            font-family: 'DM Sans', sans-serif !important;
            padding: 32px 28px 24px !important;
            width: auto !important;
            min-width: 340px !important;
            max-width: 480px !important;
        }
        .mf-title {
            color: #fff !important;
            font-size: 17px !important;
            font-weight: 700 !important;
            padding: 0 0 4px !important;
            margin-bottom: 4px !important;
        }
        .mf-html {
            color: #777 !important;
            font-size: 13px !important;
            padding: 0 !important;
            margin-top: 4px !important;
        }
        /* Área dos botões */
        .mf-popup .swal2-actions {
            margin-top: 24px !important;
            gap: 10px !important;
            padding: 0 !important;
            width: 100% !important;
            justify-content: flex-end !important;
        }
        /* Área do input */
        .mf-popup .swal2-input-label { display: none !important; }
        .mf-popup .swal2-input {
            margin-top: 16px !important;
        }
        .mf-btn-confirm {
            background: #fff !important;
            color: #000 !important;
            font-weight: 700 !important;
            border-radius: 8px !important;
            padding: 10px 22px !important;
            font-size: 13px !important;
            box-shadow: none !important;
            font-family: 'DM Sans', sans-serif !important;
        }
        .mf-btn-confirm:hover { background: #e0e0e0 !important; }
        .mf-btn-danger {
            background: #ef4444 !important;
            color: #fff !important;
            font-weight: 700 !important;
            border-radius: 8px !important;
            padding: 10px 22px !important;
            font-size: 13px !important;
            box-shadow: none !important;
            font-family: 'DM Sans', sans-serif !important;
        }
        .mf-btn-danger:hover { background: #dc2626 !important; }
        .mf-btn-cancel {
            background: transparent !important;
            color: #777 !important;
            border: 1px solid #2a2a30 !important;
            font-weight: 600 !important;
            border-radius: 8px !important;
            padding: 10px 22px !important;
            font-size: 13px !important;
            box-shadow: none !important;
            font-family: 'DM Sans', sans-serif !important;
        }
        .mf-btn-cancel:hover { color: #ccc !important; border-color: #555 !important; background: #1a1a1e !important; }
        .mf-input {
            background: #1a1a1e !important;
            border: 1px solid #2a2a30 !important;
            border-radius: 8px !important;
            color: #fff !important;
            font-size: 14px !important;
            font-family: 'DM Sans', sans-serif !important;
            padding: 11px 14px !important;
            height: auto !important;
            width: 100% !important;
            margin: 0 !important;
        }
        .mf-input:focus { border-color: #555 !important; box-shadow: none !important; outline: none !important; }

        /* Toast */
        .mf-toast {
            background: #1a1a1e !important;
            border: 1px solid #29292e !important;
            border-radius: 10px !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
            padding: 12px 16px !important;
        }
        .mf-toast-title {
            color: #e0e0e0 !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            font-family: 'DM Sans', sans-serif !important;
        }
        .mf-progress { background: rgba(255,255,255,0.15) !important; }

        /* Ícones Swal */
        .swal2-icon { border-color: #333 !important; }
        .swal2-icon.swal2-warning { border-color: #fbbf24 !important; color: #fbbf24 !important; }
        .swal2-icon.swal2-error   { border-color: #ef4444 !important; color: #ef4444 !important; }
        .swal2-icon.swal2-success { border-color: #4ade80 !important; }
        .swal2-icon.swal2-success [class^='swal2-success-line'] { background: #4ade80 !important; }
        .swal2-icon.swal2-success .swal2-success-ring { border-color: rgba(74,222,128,0.3) !important; }
        .swal2-icon.swal2-question { border-color: #60a5fa !important; color: #60a5fa !important; }

        /* Container — garante centralização em qualquer tela */
        .swal2-container {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            padding: 20px !important;
        }
        /* Backdrop */
        .swal2-backdrop-show { backdrop-filter: blur(4px) !important; background: rgba(0,0,0,0.75) !important; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
})();
