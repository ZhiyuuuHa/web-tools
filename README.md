# 🛠️ Web Tools Hub - 个人在线工具箱开发文档

## 1. 项目简介
这是一个轻量级、模块化的 Web 工具集合平台。它采用纯静态 HTML/CSS/JS 构建，无需后端服务器，支持部署在 GitHub Pages 或任何静态托管服务上。

**核心功能：**
* **仪表盘主页**：展示所有工具，支持实时搜索过滤。
* **夜间模式**：全站支持深色/浅色主题切换，并自动记忆用户偏好。
* **模块化架构**：工具之间相互独立，通过统一的资源文件保持风格一致。
* **响应式设计**：适配桌面端与移动端。

---

## 2. 目录结构
项目采用了标准的模块化目录结构，确保易于扩展和维护。

```text
my-web-tools/
├── index.html              # [入口] 工具箱主页（仪表盘）
├── assets/                 # [公共资源] 所有工具共用的文件
│   ├── css/
│   │   └── global.css      # 全局样式（定义变量、导航栏、按钮、夜间模式）
│   └── js/
│       └── main.js         # 全局脚本（搜索逻辑、夜间模式切换逻辑）
└── tools/                  # [工具目录] 所有的子工具都放在这里
    ├── sticker-slicer/     # 工具示例：表情包裁切
    │   ├── index.html
    │   ├── style.css
    │   └── script.js
    └── [new-tool-name]/    # 未来添加的新工具...
```

---

## 3. 开发指南：如何添加新工具

不需要修改复杂的逻辑，只需遵循“**新建文件夹 -> 复制模板 -> 注册入口**”的三步流程。

### 第一步：创建目录
在 `tools/` 目录下新建一个文件夹，例如 `tools/color-picker/`。

### 第二步：使用标准模板
在新建文件夹内创建 `index.html`，并使用以下**标准模板**（已包含导航栏、夜间模式支持和资源引用）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>工具名称 - Web Tools</title>
    
    <link rel="stylesheet" href="../../assets/css/global.css">
    
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <nav class="navbar">
        <a href="../../index.html" class="logo">🔙 返回工具箱</a>
        
        <div class="nav-links" style="display: flex; align-items: center;">
            <span>工具名称 v1.0</span>
            
            <button id="themeToggle" class="theme-toggle-btn" title="切换模式">
                <span>🌞</span>
            </button>
        </div>
    </nav>

    <div class="main-container">
        <h1>我的新工具</h1>
        <p>这里是工具的功能区域...</p>
    </div>

    <script src="../../assets/js/main.js"></script>
    
    <script src="script.js"></script>
</body>
</html>
```

### 第三步：在主页注册
打开根目录的 `index.html`，在 `.tools-grid` 容器内添加一个新的卡片链接：

```html
<a href="tools/color-picker/index.html" class="tool-card">
    <div class="tool-icon">🎨</div> 
    <h3>颜色提取器</h3>
    <p>这里写一句话简短的功能描述。</p>
</a>
```

---

## 4. 样式开发规范 (CSS)

为了保证新工具完美支持**夜间模式**，在编写新工具的 `style.css` 时，**请勿直接使用固定的颜色值**（如 `#ffffff`, `#000000`），而是使用 `global.css` 中定义的 CSS 变量。

| 变量名 | 描述 | 亮色模式 (默认) | 深色模式 (自动) |
| :--- | :--- | :--- | :--- |
| `--primary-color` | 主色调 (按钮/高亮) | 蓝色 | 浅蓝色 |
| `--bg-color` | 网页大背景 | 浅灰 | 深灰 |
| `--card-bg` | 容器/卡片背景 | 白色 | 深灰色 |
| `--text-color` | 主要文字 | 深黑 | 白色 |
| `--text-secondary` | 次要文字/说明 | 灰色 | 浅灰 |
| `--border-color` | 边框线条 | 浅灰 | 深灰 |

**✅ 正确示例：**
```css
.my-box {
    background-color: var(--card-bg); /* 自动适配黑白模式 */
    color: var(--text-color);         
    border: 1px solid var(--border-color);
}
```

**❌ 错误示例：**
```css
.my-box {
    background-color: #ffffff;        /* 夜间模式下会很刺眼 */
    color: #333333;                   /* 夜间模式下看不清 */
}
```

---

## 5. 常见问题 (FAQ)

### Q: 为什么切换按钮变形了？
**A:** 请检查 `assets/css/global.css` 中的 `.theme-toggle-btn` 类。必须包含以下核心属性，防止被具体工具页面的通用 Button 样式覆盖或挤压：
```css
min-width: 0 !important;
padding: 0 !important;
flex-shrink: 0;
```

### Q: 添加新工具需要修改 JS 吗？
**A:** 不需要。`assets/js/main.js` 是通用的。只要你按照模板添加了 HTML 结构（特别是 ID 为 `themeToggle` 的按钮），全局脚本就会自动接管夜间模式和搜索功能。

### Q: 如何修改全站的主题色？
**A:** 只需修改 `assets/css/global.css` 文件顶部的 `:root` 变量区域即可，改动会立即应用到所有页面。