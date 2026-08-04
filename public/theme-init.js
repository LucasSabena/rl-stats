/**
 * Applies the persisted theme before first paint.
 *
 * This has to be an external file rather than an inline <script>: the Tauri
 * CSP is `script-src 'self'`, which blocks inline scripts outright. Loaded
 * synchronously from <head> so there is no light/dark flash on startup.
 */
(function () {
  try {
    var stored = localStorage.getItem("rl-theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    var root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
