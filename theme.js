(function () {
  "use strict";

  var STORAGE_KEY = "organizai-theme";
  var root = document.documentElement;

  function systemPrefersDark() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function readPref() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        return saved;
      }
    } catch (error) {
      /* localStorage indisponível */
    }
    return "system";
  }

  function resolve(pref) {
    if (pref === "system") {
      return systemPrefersDark() ? "dark" : "light";
    }
    return pref;
  }

  function updateButtons(theme) {
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var isDark = theme === "dark";
      var label = isDark ? "Ativar modo claro" : "Ativar modo escuro";
      button.setAttribute("aria-pressed", isDark ? "true" : "false");
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    }
  }

  function apply(pref) {
    var theme = resolve(pref);
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-theme-pref", pref);
    root.style.colorScheme = theme;
    updateButtons(theme);
  }

  function toggle() {
    var current = resolve(readPref());
    var next = current === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      /* ignora falha de persistência */
    }
    apply(next);
  }

  // Aplica antes da pintura para evitar "flash" de tema errado.
  apply(readPref());

  // Acompanha o sistema enquanto a preferência for "system".
  if (window.matchMedia) {
    var query = window.matchMedia("(prefers-color-scheme: dark)");
    var onSystemChange = function () {
      if (readPref() === "system") {
        apply("system");
      }
    };
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onSystemChange);
    } else if (typeof query.addListener === "function") {
      query.addListener(onSystemChange);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    apply(readPref());

    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", toggle);
    }
  });
})();
