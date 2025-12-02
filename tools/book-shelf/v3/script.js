/**
 * script.js - 书架模块脚本 v2.0
 * 功能：书籍管理、EPUB阅读器、书签、进度保存、自定义设置
 */

// =========================================
// 书籍数据配置
// =========================================
const booksData = [
    {
        title: "阿里巴巴Java开发手册-1.7.1-黄山版",
        author: "全球 Java 社区开发者",
        format: "pdf",
        cover: "",
        file: "books/阿里巴巴Java开发手册.pdf",
        description: "Java开发规范指南"
    },
    {
        title: "深入理解Java虚拟机（第3版）",
        author: "周志明",
        format: "pdf",
        cover: "",
        file: "books/深入理解Java虚拟机：JVM高级特性与最佳实践（第3版）周志明.pdf",
        description: "JVM高级特性与最佳实践"
    },
    {
        title: "MySQL技术内幕：InnoDB存储引擎",
        author: "姜承尧",
        format: "mobi",
        cover: "",
        file: "books/MySQL技术内幕：InnoDB存储引擎(第2版) (数据库技术丛书).mobi",
        description: "深入InnoDB存储引擎原理"
    },
    {
        title: "Java并发编程的艺术",
        author: "方腾飞, 魏鹏, 程晓明",
        format: "pdf",
        cover: "",
        file: "books/Java并发编程的艺术 (方腾飞, 魏鹏, 程晓明).pdf",
        description: "Java并发编程深入讲解"
    },
    {
        title: "网络是怎样连接的",
        author: "户根勤",
        format: "pdf",
        cover: "",
        file: "books/网络是怎样连接的 (户根勤).pdf",
        description: "图解网络连接原理"
    },
    {
        title: "码农翻身",
        author: "刘欣",
        format: "epub",
        cover: "",
        file: "books/码农翻身 (刘欣).epub",
        description: "用故事讲技术的编程书籍"
    },
];

// =========================================
// DOM 元素
// =========================================
const booksGrid = document.getElementById('booksGrid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('bookSearch');
const filterTabs = document.querySelectorAll('.filter-tab');

let currentFilter = 'all';
let currentSearch = '';

// =========================================
// EPUB 阅读器状态
// =========================================
let currentBook = null;
let currentRendition = null;
let currentBookFile = '';
let readingStartTime = null;
let totalReadingTime = 0;

// 阅读器设置
const defaultSettings = {
    theme: 'light',
    font: 'system',
    fontSize: 100,
    lineHeight: 1.8,
    margin: 'medium',
    flow: 'paginated'
};

let readerSettings = { ...defaultSettings };

// 阅读器 DOM
const readerModal = document.getElementById('readerModal');
const readerTitle = document.getElementById('readerTitle');
const readerContent = document.getElementById('readerContent');
const readerLoading = document.getElementById('readerLoading');
const tocSidebar = document.getElementById('tocSidebar');
const tocContent = document.getElementById('tocContent');
const bookmarkSidebar = document.getElementById('bookmarkSidebar');
const bookmarkContent = document.getElementById('bookmarkContent');
const settingsPanel = document.getElementById('settingsPanel');
const pageIndicator = document.getElementById('pageIndicator');
const progressFill = document.getElementById('progressFill');
const chapterInfo = document.getElementById('chapterInfo');
const readingTimeEl = document.getElementById('readingTime');

// =========================================
// 本地存储工具
// =========================================
const Storage = {
    getBookData(bookFile) {
        try {
            const data = localStorage.getItem(`epub_${btoa(bookFile)}`);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    },
    
    saveBookData(bookFile, data) {
        try {
            const existing = this.getBookData(bookFile) || {};
            localStorage.setItem(`epub_${btoa(bookFile)}`, JSON.stringify({ ...existing, ...data }));
        } catch {}
    },
    
    getSettings() {
        try {
            const data = localStorage.getItem('epub_reader_settings');
            return data ? JSON.parse(data) : defaultSettings;
        } catch { return defaultSettings; }
    },
    
    saveSettings(settings) {
        try {
            localStorage.setItem('epub_reader_settings', JSON.stringify(settings));
        } catch {}
    }
};

// =========================================
// 渲染书籍卡片
// =========================================
function renderBooks() {
    const filteredBooks = booksData.filter(book => {
        const formatMatch = currentFilter === 'all' || 
            (currentFilter === 'other' ? !['pdf', 'epub'].includes(book.format) : book.format === currentFilter);
        
        const searchLower = currentSearch.toLowerCase();
        const searchMatch = !currentSearch ||
            book.title.toLowerCase().includes(searchLower) ||
            book.author.toLowerCase().includes(searchLower) ||
            book.description.toLowerCase().includes(searchLower);

        return formatMatch && searchMatch;
    });

    booksGrid.innerHTML = '';

    if (filteredBooks.length === 0) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        filteredBooks.forEach(book => {
            booksGrid.appendChild(createBookCard(book));
        });
    }
}

function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.setAttribute('data-format', book.format);

    const formatIcons = { pdf: '📕', epub: '📗', mobi: '📙', other: '📓' };
    const isEpub = book.format === 'epub';
    
    // 检查阅读进度
    const bookData = Storage.getBookData(book.file);
    const progress = bookData?.progress || 0;
    const hasProgress = progress > 0;

    const coverHTML = book.cover
        ? `<img src="${book.cover}" alt="${book.title}" loading="lazy">`
        : `<span class="default-cover">${formatIcons[book.format] || '📚'}</span>`;

    card.innerHTML = `
        <div class="book-cover">
            ${coverHTML}
            <span class="format-badge ${book.format}">${book.format.toUpperCase()}</span>
            ${isEpub ? '<span class="online-badge">在线阅读</span>' : ''}
            ${hasProgress ? `<span class="progress-badge">${Math.round(progress * 100)}%</span>` : ''}
        </div>
        <div class="book-info">
            <h3 class="book-title">${escapeHtml(book.title)}</h3>
            <p class="book-author">${escapeHtml(book.author)}</p>
            <p class="book-desc">${escapeHtml(book.description)}</p>
            <div class="download-btn ${isEpub ? 'read-online' : ''}">
                <span>${isEpub ? '📖 开始阅读' : '📥 下载'}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        if (isEpub) {
            openEpubReader(book);
        } else {
            window.open(book.file, '_blank');
        }
    });

    return card;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================
// EPUB 阅读器核心
// =========================================
function openEpubReader(book) {
    readerModal.classList.add('active');
    readerLoading.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    currentBookFile = book.file;
    readerTitle.textContent = book.title;
    document.getElementById('downloadEpub').href = book.file;

    // 加载设置
    readerSettings = Storage.getSettings();
    applySettingsToUI();

    // 清理旧实例
    if (currentBook) {
        currentBook.destroy();
    }

    document.getElementById('epubViewer').innerHTML = '';

    // 创建新实例
    currentBook = ePub(book.file);

    // 渲染配置
    const marginMap = { small: 20, medium: 50, large: 100 };
    
    currentRendition = currentBook.renderTo('epubViewer', {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: readerSettings.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
        manager: readerSettings.flow === 'scrolled' ? 'continuous' : 'default'
    });

    // 恢复阅读位置
    const bookData = Storage.getBookData(book.file);
    const startLocation = bookData?.location || undefined;

    currentRendition.display(startLocation).then(() => {
        readerLoading.style.display = 'none';
        applyReaderTheme(readerSettings.theme);
        applyFont(readerSettings.font);
        applyFontSize(readerSettings.fontSize);
        applyLineHeight(readerSettings.lineHeight);
        applyMargin(readerSettings.margin);
        
        // 开始计时
        readingStartTime = Date.now();
        totalReadingTime = bookData?.readingTime || 0;
        updateReadingTime();
    }).catch(err => {
        console.error('EPUB 加载失败:', err);
        readerLoading.innerHTML = `
            <div class="loading-error">
                <p>📚 加载失败</p>
                <p class="loading-tip">请检查文件是否存在</p>
                <a href="${book.file}" class="error-download-btn" download>📥 下载书籍</a>
            </div>
        `;
    });

    // 加载目录
    currentBook.loaded.navigation.then(nav => {
        renderToc(nav.toc);
    });

    // 监听位置变化
    currentRendition.on('relocated', location => {
        updateProgress(location);
        saveReadingProgress(location);
        updateBookmarkIcon();
    });

    // iframe 内键盘事件
    currentRendition.on('keydown', handleKeyDown);
    
    // 加载书签
    renderBookmarks();
}

function closeEpubReader() {
    // 保存阅读时间
    if (readingStartTime) {
        const sessionTime = Math.floor((Date.now() - readingStartTime) / 1000 / 60);
        totalReadingTime += sessionTime;
        Storage.saveBookData(currentBookFile, { readingTime: totalReadingTime });
    }

    readerModal.classList.remove('active');
    document.body.style.overflow = '';
    closeSidebars();

    if (currentBook) {
        currentBook.destroy();
        currentBook = null;
        currentRendition = null;
    }

    // 重置加载状态
    readerLoading.style.display = 'flex';
    readerLoading.innerHTML = `
        <div class="loading-spinner"></div>
        <p>正在加载书籍...</p>
        <p class="loading-tip">首次加载可能需要几秒钟</p>
    `;

    // 刷新书籍列表显示进度
    renderBooks();
}

// =========================================
// 进度与位置
// =========================================
function updateProgress(location) {
    if (!location || !currentBook) return;

    // 页面进度
    const progress = currentBook.locations.percentageFromCfi(location.start.cfi);
    const percent = Math.round((progress || 0) * 100);
    
    pageIndicator.textContent = `${percent}%`;
    progressFill.style.width = `${percent}%`;

    // 章节信息
    const currentSection = currentBook.spine.get(location.start.index);
    if (currentSection) {
        currentBook.loaded.navigation.then(nav => {
            const chapter = findChapter(nav.toc, location.start.href);
            chapterInfo.textContent = chapter?.label || `第 ${location.start.index + 1} 章`;
        });
    }
}

function findChapter(toc, href) {
    for (const item of toc) {
        if (href.includes(item.href.split('#')[0])) {
            return item;
        }
        if (item.subitems?.length) {
            const found = findChapter(item.subitems, href);
            if (found) return found;
        }
    }
    return null;
}

function saveReadingProgress(location) {
    if (!location || !currentBookFile) return;
    
    const progress = currentBook.locations.percentageFromCfi(location.start.cfi) || 0;
    
    Storage.saveBookData(currentBookFile, {
        location: location.start.cfi,
        progress: progress,
        lastRead: Date.now()
    });
}

function updateReadingTime() {
    if (!readingStartTime) return;
    
    const sessionMinutes = Math.floor((Date.now() - readingStartTime) / 1000 / 60);
    const total = totalReadingTime + sessionMinutes;
    
    if (total < 60) {
        readingTimeEl.textContent = `阅读 ${total} 分钟`;
    } else {
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        readingTimeEl.textContent = `阅读 ${hours}小时${mins}分钟`;
    }
}

// 每分钟更新阅读时间
setInterval(updateReadingTime, 60000);

// =========================================
// 目录
// =========================================
function renderToc(toc) {
    tocContent.innerHTML = '';
    
    function createTocItem(item, level = 0) {
        const li = document.createElement('li');
        li.className = 'toc-item';
        
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = item.label;
        link.style.paddingLeft = `${20 + level * 15}px`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            currentRendition.display(item.href);
            if (window.innerWidth <= 768) closeSidebars();
        });
        
        li.appendChild(link);
        
        if (item.subitems?.length) {
            const sublist = document.createElement('ul');
            item.subitems.forEach(sub => {
                sublist.appendChild(createTocItem(sub, level + 1));
            });
            li.appendChild(sublist);
        }
        
        return li;
    }
    
    const ul = document.createElement('ul');
    ul.className = 'toc-list';
    toc.forEach(item => ul.appendChild(createTocItem(item)));
    tocContent.appendChild(ul);
}

// =========================================
// 书签
// =========================================
function getBookmarks() {
    const data = Storage.getBookData(currentBookFile);
    return data?.bookmarks || [];
}

function saveBookmarks(bookmarks) {
    Storage.saveBookData(currentBookFile, { bookmarks });
}

function addCurrentBookmark() {
    if (!currentRendition) return;
    
    const location = currentRendition.currentLocation();
    if (!location) return;
    
    const bookmarks = getBookmarks();
    const cfi = location.start.cfi;
    
    // 检查是否已存在
    if (bookmarks.some(b => b.cfi === cfi)) {
        showToast('此位置已有书签');
        return;
    }
    
    // 获取章节名
    currentBook.loaded.navigation.then(nav => {
        const chapter = findChapter(nav.toc, location.start.href);
        
        bookmarks.push({
            cfi: cfi,
            chapter: chapter?.label || '未知章节',
            progress: Math.round((currentBook.locations.percentageFromCfi(cfi) || 0) * 100),
            time: Date.now()
        });
        
        saveBookmarks(bookmarks);
        renderBookmarks();
        updateBookmarkIcon();
        showToast('书签已添加');
    });
}

function removeBookmark(cfi) {
    const bookmarks = getBookmarks().filter(b => b.cfi !== cfi);
    saveBookmarks(bookmarks);
    renderBookmarks();
    updateBookmarkIcon();
}

function renderBookmarks() {
    const bookmarks = getBookmarks();
    
    if (bookmarks.length === 0) {
        bookmarkContent.innerHTML = '<p class="empty-hint">暂无书签</p>';
        return;
    }
    
    bookmarkContent.innerHTML = '';
    
    // 按时间倒序
    bookmarks.sort((a, b) => b.time - a.time).forEach(bookmark => {
        const item = document.createElement('div');
        item.className = 'bookmark-item';
        item.innerHTML = `
            <div class="bookmark-info" data-cfi="${bookmark.cfi}">
                <span class="bookmark-chapter">${escapeHtml(bookmark.chapter)}</span>
                <span class="bookmark-progress">${bookmark.progress}%</span>
            </div>
            <button class="bookmark-delete" data-cfi="${bookmark.cfi}" title="删除">✕</button>
        `;
        
        item.querySelector('.bookmark-info').addEventListener('click', () => {
            currentRendition.display(bookmark.cfi);
            if (window.innerWidth <= 768) closeSidebars();
        });
        
        item.querySelector('.bookmark-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmark(bookmark.cfi);
        });
        
        bookmarkContent.appendChild(item);
    });
}

function updateBookmarkIcon() {
    if (!currentRendition) return;
    
    const location = currentRendition.currentLocation();
    if (!location) return;
    
    const bookmarks = getBookmarks();
    const isBookmarked = bookmarks.some(b => b.cfi === location.start.cfi);
    
    const icon = document.getElementById('bookmarkIcon');
    if (isBookmarked) {
        icon.setAttribute('fill', 'currentColor');
    } else {
        icon.setAttribute('fill', 'none');
    }
}

// =========================================
// 阅读器设置
// =========================================
const themeStyles = {
    light: { body: { background: '#ffffff', color: '#333333' }, 'a': { color: '#4a90e2' } },
    dark: { body: { background: '#1a1a2e', color: '#d4d4d4' }, 'a': { color: '#64b5f6' } },
    sepia: { body: { background: '#f4ecd8', color: '#5b4636' }, 'a': { color: '#8b6914' } },
    green: { body: { background: '#c7edcc', color: '#2d4a32' }, 'a': { color: '#1a5928' } }
};

const fontFamilies = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: '"Songti SC", "SimSun", "宋体", serif',
    'noto-serif': '"Noto Serif SC", "Source Han Serif SC", serif',
    'lxgw': '"LXGW WenKai", cursive'
};

function applyReaderTheme(theme) {
    readerSettings.theme = theme;
    Storage.saveSettings(readerSettings);
    
    if (currentRendition) {
        currentRendition.themes.register(theme, themeStyles[theme]);
        currentRendition.themes.select(theme);
    }
    
    readerContent.setAttribute('data-theme', theme);
    
    // 更新按钮状态
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

function applyFont(font) {
    readerSettings.font = font;
    Storage.saveSettings(readerSettings);
    
    if (currentRendition) {
        currentRendition.themes.font(fontFamilies[font]);
    }
    
    document.querySelectorAll('.font-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.font === font);
    });
}

function applyFontSize(size) {
    readerSettings.fontSize = Math.max(70, Math.min(150, size));
    Storage.saveSettings(readerSettings);
    
    if (currentRendition) {
        currentRendition.themes.fontSize(`${readerSettings.fontSize}%`);
    }
    
    document.getElementById('fontSizeValue').textContent = `${readerSettings.fontSize}%`;
    document.getElementById('fontSizeSlider').value = readerSettings.fontSize;
}

function applyLineHeight(height) {
    readerSettings.lineHeight = height;
    Storage.saveSettings(readerSettings);
    
    if (currentRendition) {
        currentRendition.themes.override('line-height', height);
    }
    
    document.getElementById('lineHeightValue').textContent = height;
    document.getElementById('lineHeightSlider').value = height;
}

function applyMargin(margin) {
    readerSettings.margin = margin;
    Storage.saveSettings(readerSettings);
    
    readerContent.setAttribute('data-margin', margin);
    
    document.querySelectorAll('.margin-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.margin === margin);
    });
}

function applyFlow(flow) {
    readerSettings.flow = flow;
    Storage.saveSettings(readerSettings);
    
    // 需要重新渲染
    if (currentBook && currentRendition) {
        const location = currentRendition.currentLocation()?.start?.cfi;
        
        document.getElementById('epubViewer').innerHTML = '';
        
        currentRendition = currentBook.renderTo('epubViewer', {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
            manager: flow === 'scrolled' ? 'continuous' : 'default'
        });
        
        currentRendition.display(location).then(() => {
            applyReaderTheme(readerSettings.theme);
            applyFont(readerSettings.font);
            applyFontSize(readerSettings.fontSize);
            applyLineHeight(readerSettings.lineHeight);
        });
        
        currentRendition.on('relocated', location => {
            updateProgress(location);
            saveReadingProgress(location);
            updateBookmarkIcon();
        });
        
        currentRendition.on('keydown', handleKeyDown);
    }
    
    document.querySelectorAll('.flow-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.flow === flow);
    });
}

function applySettingsToUI() {
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === readerSettings.theme);
    });
    document.querySelectorAll('.font-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.font === readerSettings.font);
    });
    document.querySelectorAll('.margin-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.margin === readerSettings.margin);
    });
    document.querySelectorAll('.flow-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.flow === readerSettings.flow);
    });
    
    document.getElementById('fontSizeSlider').value = readerSettings.fontSize;
    document.getElementById('fontSizeValue').textContent = `${readerSettings.fontSize}%`;
    document.getElementById('lineHeightSlider').value = readerSettings.lineHeight;
    document.getElementById('lineHeightValue').textContent = readerSettings.lineHeight;
}

// =========================================
// 侧边栏控制
// =========================================
function closeSidebars() {
    tocSidebar.classList.remove('active');
    bookmarkSidebar.classList.remove('active');
    settingsPanel.classList.remove('active');
}

function toggleSidebar(sidebar) {
    const isActive = sidebar.classList.contains('active');
    closeSidebars();
    if (!isActive) {
        sidebar.classList.add('active');
    }
}

// =========================================
// 全屏
// =========================================
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        readerModal.requestFullscreen?.() || 
        readerModal.webkitRequestFullscreen?.() ||
        readerModal.msRequestFullscreen?.();
    } else {
        document.exitFullscreen?.() ||
        document.webkitExitFullscreen?.() ||
        document.msExitFullscreen?.();
    }
}

// =========================================
// 键盘控制
// =========================================
function handleKeyDown(e) {
    if (!currentRendition || !readerModal.classList.contains('active')) return;
    
    switch(e.key) {
        case 'ArrowLeft':
            if (e.shiftKey) {
                goToPrevChapter();
            } else {
                currentRendition.prev();
            }
            break;
        case 'ArrowRight':
            if (e.shiftKey) {
                goToNextChapter();
            } else {
                currentRendition.next();
            }
            break;
        case 'Escape':
            closeEpubReader();
            break;
        case 't':
        case 'T':
            toggleSidebar(tocSidebar);
            break;
        case 'b':
        case 'B':
            toggleSidebar(bookmarkSidebar);
            break;
        case 's':
        case 'S':
            toggleSidebar(settingsPanel);
            break;
        case 'f':
        case 'F':
            toggleFullscreen();
            break;
    }
}

function goToPrevChapter() {
    if (!currentBook || !currentRendition) return;
    const loc = currentRendition.currentLocation();
    if (loc?.start?.index > 0) {
        currentRendition.display(currentBook.spine.get(loc.start.index - 1).href);
    }
}

function goToNextChapter() {
    if (!currentBook || !currentRendition) return;
    const loc = currentRendition.currentLocation();
    if (loc?.start?.index < currentBook.spine.length - 1) {
        currentRendition.display(currentBook.spine.get(loc.start.index + 1).href);
    }
}

// =========================================
// 触摸手势
// =========================================
let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
    if (!currentRendition || readerSettings.flow === 'scrolled') return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    
    // 水平滑动超过50px且垂直滑动小于水平的一半
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < Math.abs(diffX) / 2) {
        if (diffX > 0) {
            currentRendition.prev();
        } else {
            currentRendition.next();
        }
    }
}

// =========================================
// Toast 提示
// =========================================
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// =========================================
// 事件绑定
// =========================================

// 筛选
filterTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        filterTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentFilter = this.dataset.filter;
        renderBooks();
    });
});

// 搜索
searchInput?.addEventListener('input', e => {
    currentSearch = e.target.value.trim();
    renderBooks();
});

// 阅读器控制
document.getElementById('readerClose')?.addEventListener('click', closeEpubReader);
document.getElementById('prevPage')?.addEventListener('click', () => currentRendition?.prev());
document.getElementById('nextPage')?.addEventListener('click', () => currentRendition?.next());
document.getElementById('prevChapter')?.addEventListener('click', goToPrevChapter);
document.getElementById('nextChapter')?.addEventListener('click', goToNextChapter);

// 侧边栏
document.getElementById('toggleToc')?.addEventListener('click', () => toggleSidebar(tocSidebar));
document.getElementById('tocClose')?.addEventListener('click', closeSidebars);
document.getElementById('toggleBookmark')?.addEventListener('click', () => toggleSidebar(bookmarkSidebar));
document.getElementById('bookmarkClose')?.addEventListener('click', closeSidebars);
document.getElementById('toggleSettings')?.addEventListener('click', () => toggleSidebar(settingsPanel));
document.getElementById('settingsClose')?.addEventListener('click', closeSidebars);

// 书签
document.getElementById('addBookmark')?.addEventListener('click', addCurrentBookmark);

// 全屏
document.getElementById('toggleFullscreen')?.addEventListener('click', toggleFullscreen);

// 设置控制
document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => applyReaderTheme(btn.dataset.theme));
});

document.querySelectorAll('.font-option').forEach(btn => {
    btn.addEventListener('click', () => applyFont(btn.dataset.font));
});

document.getElementById('fontSizeSlider')?.addEventListener('input', e => {
    applyFontSize(parseInt(e.target.value));
});

document.getElementById('fontDecrease')?.addEventListener('click', () => {
    applyFontSize(readerSettings.fontSize - 10);
});

document.getElementById('fontIncrease')?.addEventListener('click', () => {
    applyFontSize(readerSettings.fontSize + 10);
});

document.getElementById('lineHeightSlider')?.addEventListener('input', e => {
    applyLineHeight(parseFloat(e.target.value));
});

document.querySelectorAll('.margin-option').forEach(btn => {
    btn.addEventListener('click', () => applyMargin(btn.dataset.margin));
});

document.querySelectorAll('.flow-option').forEach(btn => {
    btn.addEventListener('click', () => applyFlow(btn.dataset.flow));
});

// 点击翻页
document.getElementById('clickZoneLeft')?.addEventListener('click', () => currentRendition?.prev());
document.getElementById('clickZoneRight')?.addEventListener('click', () => currentRendition?.next());

// 触摸手势
readerContent?.addEventListener('touchstart', handleTouchStart, { passive: true });
readerContent?.addEventListener('touchend', handleTouchEnd, { passive: true });

// 键盘
document.addEventListener('keydown', handleKeyDown);

// 点击空白关闭侧边栏
readerContent?.addEventListener('click', (e) => {
    if (e.target === readerContent || e.target.id === 'epubViewer') {
        closeSidebars();
    }
});

// =========================================
// 初始化
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    renderBooks();
    
    // 生成位置信息（用于进度）
    if (typeof ePub !== 'undefined') {
        // epub.js 已加载
    }
});
