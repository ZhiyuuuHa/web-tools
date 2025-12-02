/**
 * script.js - 书架模块脚本 v2.0
 * 功能：
 * 1. 书籍数据管理与渲染
 * 2. 格式筛选与搜索
 * 3. EPUB 浏览器内阅读器（增强版）
 *    - 阅读进度保存
 *    - 多主题支持
 *    - 字体/行距/边距调节
 *    - 触摸滑动翻页
 *    - 全屏模式
 *    - 键盘快捷键
 */

// =========================================
// 书籍数据配置 (在这里添加你的书籍)
// =========================================
const booksData = [
    {
        title: "阿里巴巴Java开发手册-1.7.1-黄山版",
        author: "全球 Java 社区开发者",
        format: "pdf",
        cover: "",
        file: "books/阿里巴巴Java开发手册.pdf",
        description: "阿里巴巴集团技术团队的集体智慧结晶"
    },
    {
        title: "深入理解Java虚拟机（第3版）",
        author: "周志明",
        format: "pdf",
        cover: "",
        file: "books/深入理解Java虚拟机：JVM高级特性与最佳实践（第3版）周志明.pdf",
        description: "全面讲解JVM原理与性能调优"
    },
    {
        title: "MySQL技术内幕：InnoDB存储引擎",
        author: "姜承尧",
        format: "mobi",
        cover: "",
        file: "books/MySQL技术内幕：InnoDB存储引擎(第2版) (数据库技术丛书).mobi",
        description: "深入剖析InnoDB存储引擎实现原理"
    },
    {
        title: "Java并发编程的艺术",
        author: "方腾飞, 魏鹏, 程晓明",
        format: "pdf",
        cover: "",
        file: "books/Java并发编程的艺术 (方腾飞, 魏鹏, 程晓明).pdf",
        description: "Java并发编程核心技术详解"
    },
    {
        title: "网络是怎样连接的",
        author: "户根勤",
        format: "pdf",
        cover: "",
        file: "books/网络是怎样连接的 (户根勤).pdf",
        description: "图解网络连接全过程"
    },
    {
        title: "码农翻身",
        author: "刘欣",
        format: "epub",
        cover: "",
        file: "books/码农翻身 (刘欣).epub",
        description: "用故事讲解技术的好书"
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
// EPUB 阅读器配置
// =========================================
const STORAGE_KEY_PREFIX = 'epub_reader_';

// 默认阅读设置
const defaultSettings = {
    theme: 'light',
    fontSize: 100,
    lineHeight: 1.6,
    margin: 'medium',
    fontFamily: 'system'
};

// 当前阅读器状态
let currentBook = null;
let currentRendition = null;
let currentBookFile = null;
let readerSettings = { ...defaultSettings };
let isFullscreen = false;
let touchStartX = 0;
let touchStartY = 0;

// 阅读器 DOM 元素
const readerModal = document.getElementById('readerModal');
const readerTitle = document.getElementById('readerTitle');
const readerContent = document.getElementById('readerContent');
const readerLoading = document.getElementById('readerLoading');
const readerToolbar = document.getElementById('readerToolbar');
const readerFooter = document.getElementById('readerFooter');
const tocSidebar = document.getElementById('tocSidebar');
const tocContent = document.getElementById('tocContent');
const settingsPanel = document.getElementById('settingsPanel');
const progressSlider = document.getElementById('progressSlider');
const progressText = document.getElementById('progressText');
const chapterInfo = document.getElementById('chapterInfo');
const pageInfo = document.getElementById('pageInfo');

// =========================================
// 工具函数
// =========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getBookStorageKey(bookFile) {
    return STORAGE_KEY_PREFIX + btoa(encodeURIComponent(bookFile));
}

function saveReadingProgress(bookFile, cfi) {
    try {
        localStorage.setItem(getBookStorageKey(bookFile) + '_progress', cfi);
    } catch (e) {
        console.warn('无法保存阅读进度:', e);
    }
}

function getReadingProgress(bookFile) {
    try {
        return localStorage.getItem(getBookStorageKey(bookFile) + '_progress');
    } catch (e) {
        return null;
    }
}

function saveReaderSettings() {
    try {
        localStorage.setItem(STORAGE_KEY_PREFIX + 'settings', JSON.stringify(readerSettings));
    } catch (e) {
        console.warn('无法保存阅读设置:', e);
    }
}

function loadReaderSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'settings');
        if (saved) {
            readerSettings = { ...defaultSettings, ...JSON.parse(saved) };
        }
    } catch (e) {
        readerSettings = { ...defaultSettings };
    }
}

// =========================================
// 渲染书籍卡片
// =========================================
function renderBooks() {
    const filteredBooks = booksData.filter(book => {
        const formatToMatch = currentFilter === 'other' 
            ? !['pdf', 'epub'].includes(book.format)
            : currentFilter === 'all' || book.format === currentFilter;

        const searchLower = currentSearch.toLowerCase();
        const matchSearch = !currentSearch ||
            book.title.toLowerCase().includes(searchLower) ||
            book.author.toLowerCase().includes(searchLower) ||
            book.description.toLowerCase().includes(searchLower);

        return formatToMatch && matchSearch;
    });

    booksGrid.innerHTML = '';

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

function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.setAttribute('data-format', book.format);

    const formatIcons = {
        pdf: '📕',
        epub: '📗',
        mobi: '📙',
        other: '📓'
    };

    const coverHTML = book.cover
        ? `<img src="${book.cover}" alt="${book.title}" loading="lazy">`
        : `<span class="default-cover">${formatIcons[book.format] || '📚'}</span>`;

    const isEpub = book.format === 'epub';
    const hasProgress = isEpub && getReadingProgress(book.file);
    const actionText = isEpub ? '📖 在线阅读' : '📥 下载 / 预览';
    const actionClass = isEpub ? 'download-btn read-online' : 'download-btn';

    card.innerHTML = `
        <div class="book-cover">
            ${coverHTML}
            <span class="format-badge ${book.format}">${book.format.toUpperCase()}</span>
            ${isEpub ? '<span class="online-badge">支持在线阅读</span>' : ''}
            ${hasProgress ? '<span class="progress-badge">继续阅读</span>' : ''}
        </div>
        <div class="book-info">
            <h3 class="book-title">${escapeHtml(book.title)}</h3>
            <p class="book-author">${escapeHtml(book.author)}</p>
            <p class="book-desc">${escapeHtml(book.description)}</p>
            <div class="${actionClass}">
                <span>${actionText}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', function(e) {
        e.preventDefault();
        if (isEpub) {
            openEpubReader(book);
        } else {
            window.open(book.file, '_blank');
        }
    });

    return card;
}

// =========================================
// EPUB 阅读器核心功能
// =========================================

function openEpubReader(book) {
    // 显示模态框和加载状态
    readerModal.classList.add('active');
    readerLoading.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 设置标题和下载链接
    readerTitle.textContent = book.title;
    document.getElementById('downloadEpub').href = book.file;
    currentBookFile = book.file;

    // 加载设置
    loadReaderSettings();
    applySettingsToUI();

    // 清理之前的实例
    if (currentBook) {
        currentBook.destroy();
    }

    // 清空阅读器容器
    const viewer = document.getElementById('epubViewer');
    viewer.innerHTML = '';

    // 创建新的 EPUB 实例
    currentBook = ePub(book.file);

    // 计算合适的宽度
    const contentWidth = readerContent.clientWidth;
    const marginSize = getMarginSize(readerSettings.margin);

    // 渲染配置
    currentRendition = currentBook.renderTo('epubViewer', {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
        manager: 'continuous',
        snap: true
    });

    // 获取保存的进度
    const savedProgress = getReadingProgress(book.file);

    // 显示内容
    const displayPromise = savedProgress 
        ? currentRendition.display(savedProgress)
        : currentRendition.display();

    displayPromise.then(() => {
        readerLoading.style.display = 'none';
        applyAllSettings();
        setupRenditionEvents();
    }).catch(err => {
        console.error('EPUB 加载失败:', err);
        showLoadingError(book.file);
    });

    // 加载目录
    currentBook.loaded.navigation.then(nav => {
        renderToc(nav.toc);
    });

    // 生成位置信息（用于进度条）
    currentBook.ready.then(() => {
        // 使用较大的分块以加快生成速度
        return currentBook.locations.generate(2048);
    }).then((locations) => {
        console.log('位置信息生成完成，共', locations.length, '个位置点');
        updateProgress();
    }).catch(err => {
        console.warn('位置信息生成失败:', err);
    });

    // 绑定事件
    bindReaderEvents();
}

function closeEpubReader() {
    // 保存进度
    if (currentRendition && currentBookFile) {
        const location = currentRendition.currentLocation();
        if (location && location.start) {
            saveReadingProgress(currentBookFile, location.start.cfi);
        }
    }

    readerModal.classList.remove('active');
    document.body.style.overflow = '';
    
    // 退出全屏
    if (isFullscreen) {
        exitFullscreen();
    }

    // 关闭面板
    tocSidebar.classList.remove('active');
    settingsPanel.classList.remove('active');

    // 移除事件监听
    document.removeEventListener('keydown', handleKeydown);

    if (currentBook) {
        currentBook.destroy();
        currentBook = null;
        currentRendition = null;
    }

    currentBookFile = null;

    // 重置加载状态
    resetLoadingState();

    // 刷新书籍列表（更新"继续阅读"标记）
    renderBooks();
}

function showLoadingError(bookFile) {
    readerLoading.innerHTML = `
        <div class="loading-error">
            <p>📚 加载失败</p>
            <p style="font-size: 0.9rem; opacity: 0.7;">请检查文件是否存在或尝试下载后阅读</p>
            <a href="${bookFile}" class="error-download-btn" download>📥 下载书籍</a>
        </div>
    `;
}

function resetLoadingState() {
    readerLoading.style.display = 'flex';
    readerLoading.innerHTML = `
        <div class="loading-spinner"></div>
        <p>正在加载书籍...</p>
        <p class="loading-tip">首次加载可能需要几秒钟</p>
    `;
}

// =========================================
// 阅读器事件处理
// =========================================

function setupRenditionEvents() {
    if (!currentRendition) return;

    // 位置变化
    currentRendition.on('relocated', (location) => {
        updateProgress();
        updatePageInfo(location);
        
        // 保存进度
        if (currentBookFile && location.start) {
            saveReadingProgress(currentBookFile, location.start.cfi);
        }
    });

    // 点击事件（显示/隐藏工具栏）
    currentRendition.on('click', () => {
        // 在移动端点击中间区域切换工具栏
    });

    // 键盘事件（在 iframe 内）
    currentRendition.on('keydown', handleKeydown);
}

function bindReaderEvents() {
    // 键盘事件
    document.addEventListener('keydown', handleKeydown);

    // 触摸事件
    readerContent.addEventListener('touchstart', handleTouchStart, { passive: true });
    readerContent.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function handleKeydown(e) {
    if (!readerModal.classList.contains('active')) return;

    switch(e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            currentRendition?.prev();
            break;
        case 'ArrowRight':
        case ' ':
            e.preventDefault();
            currentRendition?.next();
            break;
        case 'Escape':
            closeEpubReader();
            break;
        case 't':
        case 'T':
            toggleToc();
            break;
        case 's':
        case 'S':
            toggleSettings();
            break;
        case 'f':
        case 'F':
            toggleFullscreen();
            break;
    }
}

function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}

function handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    
    // 水平滑动超过50px且垂直滑动不超过100px
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 100) {
        if (diffX > 0) {
            currentRendition?.prev();
        } else {
            currentRendition?.next();
        }
    }
}

// =========================================
// 进度与页面信息
// =========================================

function updateProgress() {
    if (!currentBook || !currentRendition) return;

    try {
        const location = currentRendition.currentLocation();
        if (!location || !location.start) return;

        // 使用 locations 计算进度
        if (currentBook.locations && currentBook.locations.length() > 0) {
            const percent = currentBook.locations.percentageFromCfi(location.start.cfi);
            const percentage = Math.round(percent * 100);
            
            if (progressSlider) {
                progressSlider.value = percentage;
            }
            if (progressText) {
                progressText.textContent = `${percentage}%`;
            }
        }
    } catch (e) {
        console.warn('更新进度失败:', e);
    }
}

function updatePageInfo(location) {
    if (!location) return;

    // 更新页面信息
    if (location.start && location.start.displayed) {
        const { page, total } = location.start.displayed;
        pageInfo.textContent = `${page} / ${total}`;
    }

    // 更新章节信息
    if (currentBook && currentBook.navigation) {
        const chapter = currentBook.navigation.get(location.start.href);
        if (chapter) {
            chapterInfo.textContent = chapter.label;
        }
    }
}

// =========================================
// 目录功能
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
            
            // 高亮当前章节
            document.querySelectorAll('.toc-item a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');
            
            // 移动端自动关闭目录
            if (window.innerWidth <= 768) {
                tocSidebar.classList.remove('active');
            }
        });
        
        li.appendChild(link);
        
        if (item.subitems && item.subitems.length > 0) {
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
    toc.forEach(item => {
        ul.appendChild(createTocItem(item));
    });
    tocContent.appendChild(ul);
}

function toggleToc() {
    console.log('切换目录显示');
    if (tocSidebar) {
        tocSidebar.classList.toggle('active');
        // 关闭设置面板
        if (settingsPanel) {
            settingsPanel.classList.remove('active');
        }
    }
}

// =========================================
// 设置功能
// =========================================

function toggleSettings() {
    console.log('切换设置面板显示');
    if (settingsPanel) {
        settingsPanel.classList.toggle('active');
        // 关闭目录面板
        if (tocSidebar) {
            tocSidebar.classList.remove('active');
        }
    }
}

function applySettingsToUI() {
    // 主题
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === readerSettings.theme);
    });

    // 字体大小
    document.getElementById('fontSizeSlider').value = readerSettings.fontSize;
    document.getElementById('fontSizeValue').textContent = `${readerSettings.fontSize}%`;

    // 行距
    document.getElementById('lineHeightSlider').value = readerSettings.lineHeight;
    document.getElementById('lineHeightValue').textContent = readerSettings.lineHeight;

    // 边距
    document.querySelectorAll('.margin-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.margin === readerSettings.margin);
    });
    const marginLabels = { small: '窄', medium: '中等', large: '宽' };
    document.getElementById('marginValue').textContent = marginLabels[readerSettings.margin];

    // 字体
    document.getElementById('fontFamilySelect').value = readerSettings.fontFamily;
}

function applyAllSettings() {
    applyTheme(readerSettings.theme);
    applyFontSize(readerSettings.fontSize);
    applyLineHeight(readerSettings.lineHeight);
    applyMargin(readerSettings.margin);
    applyFontFamily(readerSettings.fontFamily);
}

function applyTheme(theme) {
    readerSettings.theme = theme;
    
    const themes = {
        light: {
            body: { 
                background: '#ffffff', 
                color: '#333333'
            },
            'a': { color: '#4a90e2' },
            'p': { color: '#333333' },
            'h1, h2, h3, h4, h5, h6': { color: '#222222' }
        },
        dark: {
            body: { 
                background: '#1a1a2e', 
                color: '#e0e0e0'
            },
            'a': { color: '#64b5f6' },
            'p': { color: '#e0e0e0' },
            'h1, h2, h3, h4, h5, h6': { color: '#ffffff' }
        },
        sepia: {
            body: { 
                background: '#f4ecd8', 
                color: '#5b4636'
            },
            'a': { color: '#8b6914' },
            'p': { color: '#5b4636' },
            'h1, h2, h3, h4, h5, h6': { color: '#3d2914' }
        }
    };
    
    if (currentRendition) {
        currentRendition.themes.register(theme, themes[theme]);
        currentRendition.themes.select(theme);
    }
    
    readerContent.setAttribute('data-theme', theme);
    saveReaderSettings();
}

function applyFontSize(size) {
    readerSettings.fontSize = size;
    
    if (currentRendition) {
        currentRendition.themes.fontSize(`${size}%`);
    }
    
    document.getElementById('fontSizeValue').textContent = `${size}%`;
    saveReaderSettings();
}

function applyLineHeight(height) {
    readerSettings.lineHeight = height;
    
    if (currentRendition) {
        currentRendition.themes.override('line-height', `${height}`);
    }
    
    document.getElementById('lineHeightValue').textContent = height;
    saveReaderSettings();
}

function getMarginSize(margin) {
    const sizes = { small: 20, medium: 60, large: 100 };
    return sizes[margin] || 60;
}

function applyMargin(margin) {
    readerSettings.margin = margin;
    
    const size = getMarginSize(margin);
    if (currentRendition) {
        currentRendition.themes.override('padding', `20px ${size}px`);
    }
    
    const marginLabels = { small: '窄', medium: '中等', large: '宽' };
    document.getElementById('marginValue').textContent = marginLabels[margin];
    saveReaderSettings();
}

function applyFontFamily(family) {
    readerSettings.fontFamily = family;
    
    const fonts = {
        system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        serif: '"Noto Serif SC", "Source Han Serif CN", "Songti SC", SimSun, serif',
        'sans-serif': '"Noto Sans SC", "Source Han Sans CN", "PingFang SC", "Microsoft YaHei", sans-serif',
        kai: '"Kaiti SC", STKaiti, KaiTi, serif'
    };
    
    if (currentRendition) {
        currentRendition.themes.override('font-family', fonts[family]);
    }
    
    saveReaderSettings();
}

// =========================================
// 全屏功能
// =========================================

function toggleFullscreen() {
    if (!isFullscreen) {
        enterFullscreen();
    } else {
        exitFullscreen();
    }
}

function enterFullscreen() {
    const elem = readerModal;
    
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }
    
    isFullscreen = true;
    readerModal.classList.add('fullscreen');
}

function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
    
    isFullscreen = false;
    readerModal.classList.remove('fullscreen');
}

// 监听全屏变化
document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
    readerModal.classList.toggle('fullscreen', isFullscreen);
});

// =========================================
// 事件绑定
// =========================================

// 格式筛选
filterTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        filterTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentFilter = this.getAttribute('data-filter');
        renderBooks();
    });
});

// 搜索
if (searchInput) {
    searchInput.addEventListener('input', function(e) {
        currentSearch = e.target.value.trim();
        renderBooks();
    });
}

// 阅读器控制
document.getElementById('readerClose')?.addEventListener('click', closeEpubReader);
document.getElementById('prevPage')?.addEventListener('click', () => currentRendition?.prev());
document.getElementById('nextPage')?.addEventListener('click', () => currentRendition?.next());

// 目录按钮 - 打开目录
const toggleTocBtn = document.getElementById('toggleToc');
if (toggleTocBtn) {
    toggleTocBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleToc();
    });
}

// 目录关闭按钮
const tocCloseBtn = document.getElementById('tocClose');
if (tocCloseBtn) {
    tocCloseBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        tocSidebar.classList.remove('active');
    });
}

// 设置按钮
const toggleSettingsBtn = document.getElementById('toggleSettings');
if (toggleSettingsBtn) {
    toggleSettingsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSettings();
    });
}

// 设置关闭按钮
const settingsCloseBtn = document.getElementById('settingsClose');
if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        settingsPanel.classList.remove('active');
    });
}

document.getElementById('toggleFullscreen')?.addEventListener('click', toggleFullscreen);

// 进度条拖动
if (progressSlider) {
    // 拖动中实时更新显示
    progressSlider.addEventListener('input', function() {
        const percent = parseInt(this.value);
        if (progressText) {
            progressText.textContent = `${percent}%`;
        }
    });
    
    // 拖动结束后跳转
    progressSlider.addEventListener('change', function() {
        const percent = parseInt(this.value) / 100;
        if (currentBook && currentBook.locations && currentBook.locations.length() > 0) {
            const cfi = currentBook.locations.cfiFromPercentage(percent);
            if (cfi && currentRendition) {
                currentRendition.display(cfi);
            }
        }
    });
}

// 点击翻页区域
document.getElementById('clickZoneLeft')?.addEventListener('click', () => currentRendition?.prev());
document.getElementById('clickZoneRight')?.addEventListener('click', () => currentRendition?.next());

// 主题选择
document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyTheme(this.dataset.theme);
    });
});

// 字体大小
document.getElementById('fontSizeSlider')?.addEventListener('input', function() {
    applyFontSize(parseInt(this.value));
});
document.getElementById('fontDecrease')?.addEventListener('click', () => {
    const slider = document.getElementById('fontSizeSlider');
    const newValue = Math.max(70, parseInt(slider.value) - 10);
    slider.value = newValue;
    applyFontSize(newValue);
});
document.getElementById('fontIncrease')?.addEventListener('click', () => {
    const slider = document.getElementById('fontSizeSlider');
    const newValue = Math.min(150, parseInt(slider.value) + 10);
    slider.value = newValue;
    applyFontSize(newValue);
});

// 行距
document.getElementById('lineHeightSlider')?.addEventListener('input', function() {
    applyLineHeight(parseFloat(this.value));
});

// 边距
document.querySelectorAll('.margin-option').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.margin-option').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyMargin(this.dataset.margin);
    });
});

// 字体选择
document.getElementById('fontFamilySelect')?.addEventListener('change', function() {
    applyFontFamily(this.value);
});

// 点击模态框外部关闭
readerModal?.addEventListener('click', (e) => {
    if (e.target === readerModal) {
        closeEpubReader();
    }
});

// =========================================
// 初始化
// =========================================
document.addEventListener('DOMContentLoaded', function() {
    loadReaderSettings();
    renderBooks();
});
