// 获取 DOM 元素
const imageInput = document.getElementById('imageInput');
const fileNameDisplay = document.getElementById('fileName');
const rowsInput = document.getElementById('rowsInput');
const colsInput = document.getElementById('colsInput');
const processBtn = document.getElementById('processBtn');
const downloadBtn = document.getElementById('downloadBtn');
const previewContainer = document.getElementById('previewContainer');
const statusMessage = document.getElementById('statusMessage');

let loadedImage = null;
let croppedImagesData = []; // 存储裁切后的图片Base64数据

// 监听文件选择
imageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        fileNameDisplay.textContent = file.name;
        statusMessage.textContent = "正在加载图片...";

        const reader = new FileReader();
        reader.onload = function(event) {
            loadedImage = new Image();
            loadedImage.onload = function() {
                statusMessage.textContent = `图片加载成功! 尺寸: ${loadedImage.naturalWidth}x${loadedImage.naturalHeight}`;
                processBtn.disabled = false;
                downloadBtn.disabled = true;
                previewContainer.innerHTML = ''; // 清空预览
                previewContainer.classList.add('hidden');
            };
            loadedImage.onerror = function() {
                 statusMessage.textContent = "错误：无法加载图片，请检查文件格式。";
            }
            loadedImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        fileNameDisplay.textContent = "未选择文件";
        processBtn.disabled = true;
    }
});

// 监听裁切按钮点击
processBtn.addEventListener('click', function() {
    if (!loadedImage) return;

    statusMessage.textContent = "正在处理裁切...";
    previewContainer.innerHTML = '';
    croppedImagesData = [];

    const rows = parseInt(rowsInput.value) || 4;
    const cols = parseInt(colsInput.value) || 6;

    const imgWidth = loadedImage.naturalWidth;
    const imgHeight = loadedImage.naturalHeight;

    // 计算每个单元格的宽度和高度 (使用浮点数以提高精度)
    const cellWidth = imgWidth / cols;
    const cellHeight = imgHeight / rows;

    // 创建一个离屏 Canvas 用于裁切操作
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = cellWidth;
    canvas.height = cellHeight;

    let count = 0;
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            // 清除画布
            ctx.clearRect(0, 0, cellWidth, cellHeight);

            // 计算源图像的裁切坐标
            // 使用 Math.floor 确保源坐标是整数，避免抗锯齿导致的边缘模糊
            const sourceX = Math.floor(j * cellWidth);
            const sourceY = Math.floor(i * cellHeight);

            // 核心裁切代码：drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
            // 注意：这里我们使用计算出的浮点数 cellWidth/Height 作为源和目标的宽高，
            // 浏览器会自动处理非整数像素的插值。
            ctx.drawImage(
                loadedImage,
                sourceX, sourceY, cellWidth, cellHeight, // 源区域
                0, 0, cellWidth, cellHeight              // 目标画布区域
            );

            // 将 canvas 内容转换为 Base64 data URL
            const dataUrl = canvas.toDataURL('image/png');
            croppedImagesData.push({
                name: `sticker_${String(count + 1).padStart(2, '0')}.png`,
                data: dataUrl
            });

            // 创建预览图像并添加到页面
            const imgElement = document.createElement('img');
            imgElement.src = dataUrl;
            imgElement.className = 'preview-item';
            previewContainer.appendChild(imgElement);

            count++;
        }
    }

    previewContainer.classList.remove('hidden');
    downloadBtn.disabled = false;
    statusMessage.textContent = `成功裁切出 ${count} 张图片！请检查预览，然后点击下载 ZIP。`;
});


// 监听下载 ZIP 按钮点击
downloadBtn.addEventListener('click', function() {
    if (croppedImagesData.length === 0) return;

    statusMessage.textContent = "正在打包 ZIP...";

    // 创建一个新的 JSZip 实例
    const zip = new JSZip();
    const folder = zip.folder("stickers");

    // 将所有裁切好的图片数据添加到 ZIP 文件夹中
    croppedImagesData.forEach(imgData => {
        // 需要去掉 Base64 URL 的头部信息 (data:image/png;base64,)
        const base64Data = imgData.data.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
        folder.file(imgData.name, base64Data, {base64: true});
    });

    // 生成 ZIP 文件并触发下载
    zip.generateAsync({type:"blob"})
    .then(function(content) {
        // 使用 FileSaver.js 保存文件
        saveAs(content, "emoji_stickers.zip");
        statusMessage.textContent = "ZIP 文件下载已开始！";
    });
});