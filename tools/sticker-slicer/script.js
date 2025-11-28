document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素 ---
    const imageInput = document.getElementById('imageInput');
    const editorContainer = document.getElementById('editorContainer');
    const downloadZipBtn = document.getElementById('downloadZipBtn');

    // 控件
    const rowsInput = document.getElementById('rowsInput');
    const colsInput = document.getElementById('colsInput');
    const rowsVal = document.getElementById('rowsVal');
    const colsVal = document.getElementById('colsVal');
    const gridColorInput = document.getElementById('gridColor');
    const gridWidthInput = document.getElementById('gridWidth');
    const presetBtns = document.querySelectorAll('.preset-btn');

    // 导出
    const prefixInput = document.getElementById('prefixInput');
    const formatSelect = document.getElementById('formatSelect');
    const qualityInput = document.getElementById('qualityInput');
    const qualityVal = document.getElementById('qualityVal');

    // 模态框
    const modal = document.getElementById('singlePreviewModal');
    const singlePreviewImg = document.getElementById('singlePreviewImg');
    const singleDownloadBtn = document.getElementById('singleDownloadBtn');
    const toggleDisableBtn = document.getElementById('toggleDisableBtn');
    const modalHintText = document.getElementById('modalHintText');
    const singlePreviewIndexSpan = document.getElementById('singlePreviewIndex');
    const closeModalElements = document.querySelectorAll('.close-modal, .close-modal-btn');

    // --- 状态 ---
    let loadedImage = null;
    let disabledCells = new Set();
    let currentPreviewIndex = -1;

    // --- 初始化 ---
    initEmptyState();

    // --- 事件监听 ---
    const closeModal = () => modal.classList.add('hidden');
    closeModalElements.forEach(el => el.onclick = closeModal);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // 模态框内部操作
    singleDownloadBtn.onclick = downloadSingleImage;
    toggleDisableBtn.onclick = toggleDisableFromModal;

    // 上传
    document.getElementById('dropZone').addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    const workspace = document.querySelector('.workspace-container');
    workspace.addEventListener('dragover', (e) => e.preventDefault());
    workspace.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    // 设置更新
    function setupInput(input, display) {
        input.addEventListener('input', (e) => {
            if (display) display.textContent = e.target.value;
            updateGrid();
        });
    }

    setupInput(rowsInput, rowsVal);
    setupInput(colsInput, colsVal);
    gridColorInput.addEventListener('input', updateGridStyle);
    gridWidthInput.addEventListener('input', (e) => {
        document.getElementById('gridWidthVal').textContent = e.target.value + 'px';
        updateGridStyle();
    });
    qualityInput.addEventListener('input', (e) => qualityVal.textContent = e.target.value + '%');

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            rowsInput.value = btn.dataset.r;
            colsInput.value = btn.dataset.c;
            rowsVal.textContent = btn.dataset.r;
            colsVal.textContent = btn.dataset.c;
            updateGrid();
        });
    });

    downloadZipBtn.addEventListener('click', exportZip);

    // --- 核心函数 ---

    function initEmptyState() {
        editorContainer.className = 'editor-container';
        editorContainer.innerHTML = `
            <div class="empty-placeholder" onclick="document.getElementById('imageInput').click()">
                <div class="icon">🖼️</div>
                <h3>请先上传图片</h3>
                <p>点击这里或将图片拖拽至此</p>
            </div>
        `;
        downloadZipBtn.disabled = true;
    }

    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            loadedImage = new Image();
            loadedImage.onload = () => {
                disabledCells.clear();
                renderMainCanvas();
                updateGrid();
                document.getElementById('fileNameDisplay').textContent = file.name;
                document.getElementById('fileSizeDisplay').textContent = `${loadedImage.naturalWidth}x${loadedImage.naturalHeight}`;
                document.getElementById('fileInfo').classList.remove('hidden');
                downloadZipBtn.disabled = false;
            };
            loadedImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function renderMainCanvas() {
        editorContainer.innerHTML = '';
        editorContainer.classList.add('has-image');
        const img = loadedImage.cloneNode();
        img.className = 'editor-img';
        editorContainer.appendChild(img);
        const gridOverlay = document.createElement('div');
        gridOverlay.className = 'grid-overlay';
        gridOverlay.id = 'gridOverlay';
        editorContainer.appendChild(gridOverlay);
    }

    // 更新主网格 (现在的点击事件改为打开模态框)
    function updateGrid() {
        if (!loadedImage) return;
        const rows = parseInt(rowsInput.value);
        const cols = parseInt(colsInput.value);
        const gridOverlay = document.getElementById('gridOverlay');

        gridOverlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        gridOverlay.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        gridOverlay.innerHTML = '';

        const totalCells = rows * cols;
        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.id = `cell-${i}`; // 给每个格子一个ID方便查找

            if (disabledCells.has(i)) cell.classList.add('disabled');

            cell.title = "点击查看详情/禁用";

            // 关键：点击不再直接禁用，而是打开预览页
            cell.onclick = () => openSinglePreview(i);

            gridOverlay.appendChild(cell);
        }
        updateGridStyle();
    }

    function updateGridStyle() {
        const color = gridColorInput.value;
        const width = gridWidthInput.value + 'px';
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.style.borderColor = color;
            cell.style.borderWidth = width;
        });
    }

    // --- 打开详情模态框 ---
    function openSinglePreview(index) {
        if (!loadedImage) return;
        currentPreviewIndex = index;
        singlePreviewIndexSpan.textContent = index + 1;

        // 计算裁切区域
        const rows = parseInt(rowsInput.value);
        const cols = parseInt(colsInput.value);
        const cellW = loadedImage.naturalWidth / cols;
        const cellH = loadedImage.naturalHeight / rows;
        const rowIndex = Math.floor(index / cols);
        const colIndex = index % cols;
        const srcX = colIndex * cellW;
        const srcY = rowIndex * cellH;

        // 生成高清预览图
        const canvas = document.createElement('canvas');
        canvas.width = cellW;
        canvas.height = cellH;
        const ctx = canvas.getContext('2d');

        const format = formatSelect.value;
        if (format === 'jpeg') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cellW, cellH);
        }
        ctx.drawImage(loadedImage, srcX, srcY, cellW, cellH, 0, 0, cellW, cellH);
        singlePreviewImg.src = canvas.toDataURL(`image/${format === 'jpeg' ? 'jpeg' : 'png'}`);

        // 更新按钮状态
        updateModalButtonsState();

        modal.classList.remove('hidden');
    }

    // 更新模态框内的按钮和文字状态
    function updateModalButtonsState() {
        if (disabledCells.has(currentPreviewIndex)) {
            // 当前已禁用
            toggleDisableBtn.textContent = "✅ 启用此图";
            toggleDisableBtn.classList.remove('danger');
            toggleDisableBtn.classList.add('primary'); // 或者其他颜色
            modalHintText.textContent = "状态: 已禁用 (不会导出)";
            modalHintText.style.color = "#ff4d4f";
            singlePreviewImg.style.opacity = "0.5";
            singleDownloadBtn.disabled = true;
        } else {
            // 当前正常
            toggleDisableBtn.textContent = "🚫 禁用此图";
            toggleDisableBtn.classList.add('danger');
            toggleDisableBtn.classList.remove('primary');
            modalHintText.textContent = "状态: 正常导出";
            modalHintText.style.color = "var(--text-secondary)";
            singlePreviewImg.style.opacity = "1";
            singleDownloadBtn.disabled = false;
        }
    }

    // 在模态框中点击禁用/启用
    function toggleDisableFromModal() {
        if (currentPreviewIndex === -1) return;

        const cell = document.getElementById(`cell-${currentPreviewIndex}`);

        if (disabledCells.has(currentPreviewIndex)) {
            disabledCells.delete(currentPreviewIndex);
            if (cell) cell.classList.remove('disabled');
        } else {
            disabledCells.add(currentPreviewIndex);
            if (cell) cell.classList.add('disabled');
        }

        // 立即刷新模态框里的按钮状态
        updateModalButtonsState();
    }

    function downloadSingleImage() {
        if (currentPreviewIndex === -1 || !singlePreviewImg.src) return;
        const prefix = prefixInput.value || 'emoji';
        const format = formatSelect.value;
        const ext = format === 'jpeg' ? 'jpg' : format;
        const fileName = `${prefix}_${String(currentPreviewIndex + 1).padStart(2, '0')}.${ext}`;
        fetch(singlePreviewImg.src).then(res => res.blob()).then(blob => saveAs(blob, fileName));
    }

    // --- 打包下载 ---
    function exportZip() {
        if (!loadedImage) return;
        const zip = new JSZip();
        const folder = zip.folder("stickers");
        const rows = parseInt(rowsInput.value);
        const cols = parseInt(colsInput.value);
        const format = formatSelect.value;
        const prefix = prefixInput.value || 'emoji';
        const cellW = loadedImage.naturalWidth / cols;
        const cellH = loadedImage.naturalHeight / rows;
        const canvas = document.createElement('canvas');
        canvas.width = cellW;
        canvas.height = cellH;
        const ctx = canvas.getContext('2d');

        let count = 0;
        const promises = [];
        downloadZipBtn.textContent = "打包中...";
        downloadZipBtn.disabled = true;

        for (let i = 0; i < rows * cols; i++) {
            if (disabledCells.has(i)) continue;
            const rowIndex = Math.floor(i / cols);
            const colIndex = i % cols;
            const srcX = colIndex * cellW;
            const srcY = rowIndex * cellH;

            ctx.clearRect(0, 0, cellW, cellH);
            if (format === 'jpeg') {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, cellW, cellH);
            }
            ctx.drawImage(loadedImage, srcX, srcY, cellW, cellH, 0, 0, cellW, cellH);

            const p = new Promise(resolve => {
                canvas.toBlob(blob => {
                    const ext = format === 'jpeg' ? 'jpg' : format;
                    folder.file(`${prefix}_${String(count + 1).padStart(2, '0')}.${ext}`, blob);
                    count++;
                    resolve();
                }, `image/${format}`, parseInt(qualityInput.value) / 100);
            });
            promises.push(p);
        }
        Promise.all(promises).then(() => {
            zip.generateAsync({type: "blob"}).then(content => {
                saveAs(content, `${prefix}_stickers.zip`);
                downloadZipBtn.textContent = "📦 导出 ZIP 压缩包";
                downloadZipBtn.disabled = false;
            });
        });
    }
});