# 📚 书架模块 - 使用说明

## 添加书籍

1. 将书籍文件（PDF/EPUB/MOBI）放入 `tools/book-shelf/books/` 目录

2. 如有封面图片，放入 `tools/book-shelf/covers/` 目录

3. 编辑 `tools/book-shelf/script.js`，在 `booksData` 数组中添加书籍信息：

```javascript
{
    title: "书籍名称",
    author: "作者",
    format: "pdf",           // pdf / epub / mobi / other
    cover: "covers/xxx.jpg", // 封面路径，留空使用默认图标
    file: "books/xxx.pdf",   // 文件路径
    description: "简短描述"
}
```

## 目录结构

```
tools/book-shelf/
├── index.html      # 页面
├── style.css       # 样式
├── script.js       # 脚本（书籍数据在此配置）
├── books/          # 存放书籍文件
└── covers/         # 存放封面图片（可选）
```

## 功能特性

- ✅ 支持 PDF、EPUB、MOBI 等格式
- ✅ 格式分类筛选
- ✅ 实时搜索（标题/作者/描述）
- ✅ 完美支持夜间模式
- ✅ 响应式设计，适配移动端
