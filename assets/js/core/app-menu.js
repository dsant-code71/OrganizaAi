(function () {
    'use strict';

    function init() {
        var toggle = document.getElementById('appMenuToggle');
        var menu = document.getElementById('appMenu');
        var backdrop = document.getElementById('appMenuBackdrop');
        var closeButton = document.getElementById('appMenuClose');

        if (!toggle || !menu || !backdrop) {
            return;
        }

        function abrir() {
            menu.hidden = false;
            backdrop.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');

            var destino = menu.querySelector('.app-menu-item:not(.is-current)')
                || menu.querySelector('.app-menu-item');

            if (destino) {
                destino.focus();
            }
        }

        function fechar(devolverFoco) {
            menu.hidden = true;
            backdrop.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');

            if (devolverFoco) {
                toggle.focus();
            }
        }

        toggle.addEventListener('click', function () {
            if (menu.hidden) {
                abrir();
            } else {
                fechar(true);
            }
        });

        backdrop.addEventListener('click', function () {
            fechar(true);
        });

        if (closeButton) {
            closeButton.addEventListener('click', function () {
                fechar(true);
            });
        }

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !menu.hidden) {
                fechar(true);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
