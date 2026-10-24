(function () {
    'use strict';

    const THEME_KEY = 'web-tools-theme';
    const LEGACY_THEME_KEY = 'theme';
    const DARK_THEME = 'dark';
    const LIGHT_THEME = 'light';

    function readStoredTheme() {
        try {
            const storedTheme = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
            return storedTheme === DARK_THEME || storedTheme === LIGHT_THEME ? storedTheme : null;
        } catch (error) {
            return null;
        }
    }

    function getPreferredTheme() {
        const storedTheme = readStoredTheme();
        if (storedTheme) return storedTheme;
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? DARK_THEME
            : LIGHT_THEME;
    }

    const initialTheme = getPreferredTheme();
    document.documentElement.dataset.theme = initialTheme;

    function writeStoredTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
            localStorage.setItem(LEGACY_THEME_KEY, theme);
        } catch (error) {
            // The UI still works when storage is unavailable.
        }
    }

    function updateThemeButtons(theme) {
        const isDark = theme === DARK_THEME;
        document.querySelectorAll('[data-theme-toggle], #themeToggle').forEach(function (button) {
            const icon = button.querySelector('[data-theme-icon], span');
            button.setAttribute('aria-pressed', String(isDark));
            button.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
            button.title = isDark ? '切换到浅色模式' : '切换到深色模式';
            if (icon) icon.textContent = isDark ? '🌙' : '☀️';
        });
    }

    function applyTheme(theme, persist) {
        document.documentElement.dataset.theme = theme;
        document.body.classList.toggle('dark-mode', theme === DARK_THEME);
        updateThemeButtons(theme);
        if (persist) writeStoredTheme(theme);

        document.dispatchEvent(new CustomEvent('webtools:themechange', {
            detail: { theme: theme }
        }));
    }

    function initializeTheme() {
        applyTheme(initialTheme, false);
        document.querySelectorAll('[data-theme-toggle], #themeToggle').forEach(function (button) {
            button.addEventListener('click', function () {
                const nextTheme = document.documentElement.dataset.theme === DARK_THEME
                    ? LIGHT_THEME
                    : DARK_THEME;
                applyTheme(nextTheme, true);
            });
        });
    }

    function initializeToolSearch() {
        const searchInput = document.querySelector('[data-tool-search], #toolSearch');
        if (!searchInput) return;

        const cards = Array.from(document.querySelectorAll('[data-tool-card], .tool-card'));
        const emptyState = document.querySelector('[data-search-empty]');

        searchInput.addEventListener('input', function () {
            const query = searchInput.value.toLocaleLowerCase('zh-CN').trim();
            let visibleCount = 0;

            cards.forEach(function (card) {
                const searchText = (card.dataset.search || card.textContent || '').toLocaleLowerCase('zh-CN');
                const matches = !query || searchText.includes(query);
                card.hidden = !matches;
                if (matches) visibleCount += 1;
            });

            if (emptyState) emptyState.hidden = visibleCount !== 0;
        });
    }

    function initialize() {
        initializeTheme();
        initializeToolSearch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
