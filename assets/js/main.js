/**
 * main.js - 全局通用脚本
 * 功能：
 * 1. 工具搜索过滤
 * 2. 夜间模式 (Dark Mode) 切换与状态记忆
 */

document.addEventListener('DOMContentLoaded', function() {

    // =========================================
    // 1. 搜索功能 (Search Functionality)
    // =========================================

    // 获取搜索框元素
    const searchInput = document.getElementById('toolSearch');

    // 只有当页面上存在搜索框时才执行 (避免在工具详情页报错)
    if (searchInput) {
        // 获取所有工具卡片
        const toolCards = document.querySelectorAll('.tool-card');

        // 监听输入事件
        searchInput.addEventListener('input', function(e) {
            // 获取用户输入并转为小写，去除首尾空格
            const searchText = e.target.value.toLowerCase().trim();

            toolCards.forEach(card => {
                // 获取每个卡片的标题和描述
                const title = card.querySelector('h3').innerText.toLowerCase();
                const desc = card.querySelector('p').innerText.toLowerCase();

                // 检查是否包含搜索词
                if (title.includes(searchText) || desc.includes(searchText)) {
                    card.style.display = 'flex'; // 显示 (flex 保持布局)
                } else {
                    card.style.display = 'none'; // 隐藏
                }
            });
        });
    }

    // =========================================
    // 2. 夜间模式 (Dark Mode Toggle)
    // =========================================

    const themeToggleBtn = document.getElementById('themeToggle');
    const body = document.body;
    // 获取按钮里的 span 图标元素 (如果按钮不存在则为 null)
    const iconSpan = themeToggleBtn ? themeToggleBtn.querySelector('span') : null;

    // --- A. 初始化检查 ---
    // 从浏览器缓存 (localStorage) 中读取上次保存的主题
    const savedTheme = localStorage.getItem('theme');

    // 如果之前保存的是 'dark'，则立即应用
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        if (iconSpan) iconSpan.textContent = '🌙'; // 设置为月亮图标
    }

    // --- B. 点击切换事件 ---
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', function() {
            // 切换 body 的 class
            body.classList.toggle('dark-mode');

            // 判断当前是否处于暗黑模式
            const isDark = body.classList.contains('dark-mode');

            if (isDark) {
                // 如果是暗黑模式：保存状态，切换图标
                localStorage.setItem('theme', 'dark');
                iconSpan.textContent = '🌙';
            } else {
                // 如果是亮色模式：保存状态，切换图标
                localStorage.setItem('theme', 'light');
                iconSpan.textContent = '🌞';
            }
        });
    }
});