/**
 * Nikke Matrix Solver v2.6 (Auto Elimination)
 * 特性：
 * 1. 算法逻辑解耦，支持复用
 * 2. 新增“一键消除”功能，消除后自动递归计算
 */

// === 配置 ===
const ROWS = 16;
const COLS = 10;
const TARGET_SUM = 10;

// === 状态 ===
let gridData = [];
let isEditing = false;
let isDragging = false;
let startPos = {r: -1, c: -1};
let currentPos = {r: -1, c: -1};

// === DOM ===
const gridEl = document.getElementById('grid-container');
const txtInput = document.getElementById('matrix-input');
const btnImport = document.getElementById('btn-import');
const btnEdit = document.getElementById('btn-toggle-edit');
const btnSolve = document.getElementById('btn-solve');
const btnAutoEliminate = document.getElementById('btn-auto-eliminate'); // 新增
const btnClearHints = document.getElementById('btn-clear-hints');
const btnReset = document.getElementById('btn-reset');

// === 初始化 ===
document.addEventListener('DOMContentLoaded', () => {
    initGrid();
});

// === 事件绑定 ===
btnImport.addEventListener('click', importFromText);
btnEdit.addEventListener('click', toggleEditMode);
btnSolve.addEventListener('click', () => showHints(true));
btnAutoEliminate.addEventListener('click', eliminateAllHints); // 绑定新事件
btnClearHints.addEventListener('click', clearHints);
btnReset.addEventListener('click', () => {
    if (confirm("确定清空所有数据吗？")) {
        txtInput.value = '';
        initGrid();
    }
});

document.body.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        handleDragEnd();
    }
});

// === 1. 导入逻辑 ===
function importFromText() {
    const text = txtInput.value;
    if (!text.trim()) {
        alert("请先输入数据！");
        return;
    }
    const lines = text.trim().split(/\n+/);
    const newGridData = [];
    for (let r = 0; r < ROWS; r++) {
        let rowData = [];
        let numbersInLine = [];
        if (r < lines.length) numbersInLine = lines[r].match(/\d/g) || [];
        for (let c = 0; c < COLS; c++) {
            let val = 0;
            if (c < numbersInLine.length) val = parseInt(numbersInLine[c]);
            rowData.push({val: val});
        }
        newGridData.push(rowData);
    }
    initGrid(newGridData.map(row => row.map(cell => cell.val)));
    if (isEditing) toggleEditMode();

    // 导入后自动计算
    setTimeout(() => showHints(true), 300);
}

// === 2. Grid 基础 ===
function initGrid(initialData = null) {
    gridEl.innerHTML = '';
    gridData = [];

    for (let r = 0; r < ROWS; r++) {
        let rowData = [];
        for (let c = 0; c < COLS; c++) {
            let val = 0;
            if (initialData && initialData[r] && initialData[r][c] !== undefined) val = initialData[r][c];
            rowData.push({val: val});

            const cell = document.createElement('div');
            cell.className = 'cell';
            if (val === 0) cell.classList.add('empty');

            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.innerText = val === 0 ? '' : val;

            cell.addEventListener('mousedown', (e) => onCellDown(e, r, c));
            cell.addEventListener('mouseenter', (e) => onCellEnter(e, r, c));
            cell.addEventListener('click', (e) => onCellClick(e, r, c));
            gridEl.appendChild(cell);
        }
        gridData.push(rowData);
    }
}

function toggleEditMode() {
    isEditing = !isEditing;
    if (isEditing) {
        btnEdit.classList.add('active');
        btnEdit.innerText = "✅ 完成编辑";
        gridEl.classList.add('editing');
        clearHints();
    } else {
        btnEdit.classList.remove('active');
        btnEdit.innerText = "✏️ 手动微调";
        gridEl.classList.remove('editing');
    }
}

function onCellClick(e, r, c) {
    if (!isEditing) return;
    const input = prompt("修改数字", gridData[r][c].val || "");
    if (input !== null) {
        let num = parseInt(input);
        if (isNaN(num) || num < 1 || num > 9) num = 0;
        gridData[r][c].val = num;
        updateCellUI(r, c, num);
    }
}

function updateCellUI(r, c, val) {
    const cell = getCellDom(r, c);
    cell.className = 'cell'; // 重置样式
    cell.style = '';

    if (val === 0) {
        cell.innerText = '';
        cell.classList.add('empty');
    } else {
        cell.innerText = val;
    }
}

// === 3. 交互核心 ===
function onCellDown(e, r, c) {
    if (isEditing || e.button !== 0) return;
    isDragging = true;
    startPos = {r, c};
    currentPos = {r, c};
    renderDragSelection();
}

function onCellEnter(e, r, c) {
    if (!isDragging || isEditing) return;
    if (currentPos.r !== r || currentPos.c !== c) {
        currentPos = {r, c};
        renderDragSelection();
    }
}

function renderDragSelection() {
    document.querySelectorAll('.cell.selected').forEach(el => el.classList.remove('selected'));
    const {r1, c1, r2, c2} = getBounds();
    for (let i = r1; i <= r2; i++) {
        for (let j = c1; j <= c2; j++) {
            getCellDom(i, j).classList.add('selected');
        }
    }
}

function handleDragEnd() {
    const {r1, c1, r2, c2} = getBounds();
    let sum = 0;
    let hasNumbers = false;
    let coords = [];

    for (let i = r1; i <= r2; i++) {
        for (let j = c1; j <= c2; j++) {
            const val = gridData[i][j].val;
            sum += val;
            if (val > 0) hasNumbers = true;
            coords.push({r: i, c: j});
        }
    }

    if (hasNumbers && sum === TARGET_SUM) {
        coords.forEach(p => {
            gridData[p.r][p.c].val = 0;
            updateCellUI(p.r, p.c, 0);
            const cell = getCellDom(p.r, p.c);
            cell.classList.add('eliminated');
            setTimeout(() => cell.classList.remove('eliminated'), 300);
        });

        // 消除后自动计算下一波
        setTimeout(() => {
            showHints(false);
        }, 150);

    }
    document.querySelectorAll('.cell.selected').forEach(el => el.classList.remove('selected'));
}

function getBounds() {
    return {
        r1: Math.min(startPos.r, currentPos.r),
        r2: Math.max(startPos.r, currentPos.r),
        c1: Math.min(startPos.c, currentPos.c),
        c2: Math.max(startPos.c, currentPos.c)
    };
}

// =========================================================
// 🚀 4. 核心算法与自动化 (Refactored)
// =========================================================

/**
 * 纯逻辑：计算当前所有互不冲突的最优解
 * @returns {Array} solutions 数组
 */
function calculateSolutions() {
    // 1. 构建前缀和
    let P = Array(ROWS + 1).fill(0).map(() => Array(COLS + 1).fill(0));
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            P[r + 1][c + 1] = P[r][c + 1] + P[r + 1][c] - P[r][c] + gridData[r][c].val;
        }
    }
    const getSum = (r1, c1, r2, c2) => P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1];

    // 2. 寻找所有可行矩形
    let candidates = [];
    for (let r1 = 0; r1 < ROWS; r1++) {
        for (let c1 = 0; c1 < COLS; c1++) {
            for (let r2 = r1; r2 < ROWS; r2++) {
                for (let c2 = c1; c2 < COLS; c2++) {
                    if (getSum(r1, c1, r2, c2) === TARGET_SUM) {
                        let hasNum = false;
                        for (let i = r1; i <= r2; i++) {
                            for (let j = c1; j <= c2; j++) {
                                if (gridData[i][j].val > 0) {
                                    hasNum = true;
                                    break;
                                }
                            }
                            if (hasNum) break;
                        }
                        if (hasNum) candidates.push({r1, c1, r2, c2, area: (r2 - r1 + 1) * (c2 - c1 + 1)});
                    }
                }
            }
        }
    }

    // 3. 贪心筛选 (优先小区域)
    candidates.sort((a, b) => a.area - b.area);

    let solutions = [];
    let visited = Array(ROWS).fill(0).map(() => Array(COLS).fill(false));

    candidates.forEach(rect => {
        let conflict = false;
        // 检查冲突
        for (let i = rect.r1; i <= rect.r2; i++) {
            for (let j = rect.c1; j <= rect.c2; j++) {
                if (gridData[i][j].val > 0 && visited[i][j]) conflict = true;
            }
        }

        if (!conflict) {
            solutions.push(rect);
            // 标记占用
            for (let i = rect.r1; i <= rect.r2; i++) {
                for (let j = rect.c1; j <= rect.c2; j++) {
                    visited[i][j] = true;
                }
            }
        }
    });

    return solutions;
}

/**
 * 可视化：调用算法并绘制绿色边框
 */
function showHints(showAlert = true) {
    clearHints();
    const solutions = calculateSolutions();

    if (solutions.length === 0) {
        if (showAlert) alert("当前已无可消除区域！");
        return;
    }

    const BORDER_STYLE = '3px solid #28a745';

    solutions.forEach(sol => {
        for (let i = sol.r1; i <= sol.r2; i++) {
            for (let j = sol.c1; j <= sol.c2; j++) {
                const cell = getCellDom(i, j);
                cell.classList.add('hint-box');

                // 画大框边缘
                if (i === sol.r1) cell.style.borderTop = BORDER_STYLE;
                if (i === sol.r2) cell.style.borderBottom = BORDER_STYLE;
                if (j === sol.c1) cell.style.borderLeft = BORDER_STYLE;
                if (j === sol.c2) cell.style.borderRight = BORDER_STYLE;
            }
        }
    });

    btnSolve.classList.add('hidden');
    btnClearHints.classList.remove('hidden');
}

/**
 * ⚡ 一键消除：自动消除当前算出的所有可行解，然后计算下一波
 */
function eliminateAllHints() {
    // 1. 获取当前所有可行解
    const solutions = calculateSolutions();

    if (solutions.length === 0) {
        alert("没有可消除的区域了！");
        return;
    }

    // 2. 批量执行消除
    solutions.forEach(sol => {
        for (let i = sol.r1; i <= sol.r2; i++) {
            for (let j = sol.c1; j <= sol.c2; j++) {
                // 只有数字才需要置零，空格子本身就是0
                if (gridData[i][j].val > 0) {
                    gridData[i][j].val = 0;

                    // UI 更新
                    const cell = getCellDom(i, j);
                    updateCellUI(i, j, 0);

                    // 动画效果
                    cell.classList.add('eliminated');
                    setTimeout(() => cell.classList.remove('eliminated'), 300);
                }
            }
        }
    });

    // 3. 消除完后，延迟一下，自动显示下一波提示
    setTimeout(() => {
        // false 代表如果不剩余结果了，不要弹窗打扰用户
        showHints(false);
    }, 400);
}

function clearHints() {
    document.querySelectorAll('.hint-box').forEach(el => {
        el.classList.remove('hint-box');
        el.style = '';
    });
    btnSolve.classList.remove('hidden');
    btnClearHints.classList.add('hidden');
}

function getCellDom(r, c) {
    return gridEl.children[r * COLS + c];
}