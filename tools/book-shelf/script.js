/**
 * script.js - 书架模块脚本
 * 功能：
 * 1. 书籍数据管理与渲染
 * 2. 格式筛选
 * 3. 搜索过滤
 */

// =========================================
// 书籍数据配置 (在这里添加你的书籍)
// =========================================
const booksData = [
    // 示例数据 - 请根据实际情况修改
    {
        title: "阿里巴巴Java开发手册-1.7.1-黄山版",
        author: "全球 Java 社区开发者",
        format: "pdf",
        cover: "",  // 留空则使用默认封面
        file: "books/阿里巴巴Java开发手册.pdf",
        description: "..."
    },
    {
        title: "深入理解Java虚拟机（第3版）",
        author: "周志明",
        format: "pdf",
        cover: "",  // 留空则使用默认封面
        file: "books/深入理解Java虚拟机：JVM高级特性与最佳实践（第3版）周志明.pdf",
        description: "..."
    },
    {
        title: "MySQL技术内幕：InnoDB存储引擎",
        author: "姜承尧",
        format: "mobi",
        cover: "",  // 留空则使用默认封面
        file: "books/MySQL技术内幕：InnoDB存储引擎(第2版) (数据库技术丛书).mobi",
        description: "..."
    },
    {
        title: "Java并发编程的艺术",
        author: "方腾飞, 魏鹏, 程晓明",
        format: "pdf",
        cover: "",  // 留空则使用默认封面
        file: "books/Java并发编程的艺术 (方腾飞, 魏鹏, 程晓明).pdf",
        description: "..."
    },
    {
        title: "网络是怎样连接的",
        author: "户根勤",
        format: "pdf",
        cover: "",  // 留空则使用默认封面
        file: "books/网络是怎样连接的 (户根勤).pdf",
        description: "..."
    },
    {
        title: "码农翻身",
        author: "刘欣",
        format: "epub",
        cover: "",  // 留空则使用默认封面
        file: "books/码农翻身 (刘欣).epub",
        description: "..."
    },
    // 👇 在这里继续添加更多书籍...
];

// =========================================
// DOM 元素
// =========================================
const booksGrid = document.getElementById('booksGrid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('bookSearch');
const filterTabs = document.querySelectorAll('.filter-tab');

// 当前筛选状态
let currentFilter = 'all';
let currentSearch = '';

// =========================================
// 渲染书籍卡片
// =========================================
function renderBooks() {
    // 根据筛选条件过滤
    const filteredBooks = booksData.filter(book => {
        // 格式筛选
        const matchFormat = currentFilter === 'all' || book.format === currentFilter;

        // 搜索筛选 (标题、作者、描述)
        const searchLower = currentSearch.toLowerCase();
        const matchSearch = !currentSearch ||
            book.title.toLowerCase().includes(searchLower) ||
            book.author.toLowerCase().includes(searchLower) ||
            book.description.toLowerCase().includes(searchLower);

        return matchFormat && matchSearch;
    });

    // 清空网格
    booksGrid.innerHTML = '';

    // 显示空状态或书籍
    if (filteredBooks.length === 0) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';

        filteredBooks.forEach(book => {
            const card = createBookCard(book);
            booksGrid.appendChild(card);
        });
    }
}

// =========================================
// 创建单个书籍卡片
// =========================================
function createBookCard(book) {
    const card = document.createElement('a');
    card.className = 'book-card';
    card.href = book.file;
    card.target = '_blank';
    card.setAttribute('data-format', book.format);

    // 格式图标映射
    const formatIcons = {
        pdf: '📕',
        epub: '📗',
        mobi: '📙',
        other: '📓'
    };

    // 封面部分
    const coverHTML = book.cover
        ? `<img src="${book.cover}" alt="${book.title}" loading="lazy">`
        : `<span class="default-cover">${formatIcons[book.format] || '📚'}</span>`;

    card.innerHTML = `
        <div class="book-cover">
            ${coverHTML}
            <span class="format-badge ${book.format}">${book.format.toUpperCase()}</span>
        </div>
        <div class="book-info">
            <h3 class="book-title">${escapeHtml(book.title)}</h3>
            <p class="book-author">${escapeHtml(book.author)}</p>
            <p class="book-desc">${escapeHtml(book.description)}</p>
            <div class="download-btn">
                <span>📥</span>
                <span>下载 / 预览</span>
            </div>
        </div>
    `;

    return card;
}

// =========================================
// HTML 转义（防止 XSS）
// =========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================
// 事件监听
// =========================================

// 格式筛选标签点击
filterTabs.forEach(tab => {
    tab.addEventListener('click', function () {
        // 切换激活状态
        filterTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        // 更新筛选条件并重新渲染
        currentFilter = this.getAttribute('data-filter');
        renderBooks();
    });
});

// 搜索输入
if (searchInput) {
    searchInput.addEventListener('input', function (e) {
        currentSearch = e.target.value.trim();
        renderBooks();
    });
}

// =========================================
// 初始化
// =========================================
document.addEventListener('DOMContentLoaded', function () {
    renderBooks();
});
