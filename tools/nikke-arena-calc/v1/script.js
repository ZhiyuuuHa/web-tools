/**
 * 竞技场积分计算器 - 主逻辑
 */

document.addEventListener('DOMContentLoaded', function() {
    
    // =========================================
    // 常量定义
    // =========================================
    
    // 各排名每小时积分
    const POINTS_PER_HOUR = {
        1: 600,
        2: 595,
        3: 590,
        4: 585,
        5: 580
    };
    
    // 默认玩家数量
    const DEFAULT_PLAYERS = 5;
    
    // =========================================
    // DOM 元素获取
    // =========================================
    
    const seasonDaysInput = document.getElementById('seasonDays');
    const currentDayInput = document.getElementById('currentDay');
    const playersContainer = document.getElementById('playersContainer');
    const calculateBtn = document.getElementById('calculateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const resultsPanel = document.getElementById('resultsPanel');
    const resultsContainer = document.getElementById('resultsContainer');
    const breakdownTable = document.getElementById('breakdownTable');
    const strategyPanel = document.getElementById('strategyPanel');
    const strategyContent = document.getElementById('strategyContent');
    
    // =========================================
    // 玩家数据结构
    // =========================================
    
    let players = [];
    
    // =========================================
    // 初始化
    // =========================================
    
    function init() {
        // 创建默认5个玩家
        for (let i = 1; i <= DEFAULT_PLAYERS; i++) {
            players.push({
                id: i,
                name: `玩家${i}`,
                mode: 'fixed', // 'fixed' 或 'custom'
                fixedRank: i,
                customHours: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
            });
        }
        
        renderPlayers();
        bindEvents();
    }
    
    // =========================================
    // 渲染玩家卡片
    // =========================================
    
    function renderPlayers() {
        playersContainer.innerHTML = '';
        
        players.forEach(player => {
            const card = createPlayerCard(player);
            playersContainer.appendChild(card);
        });
    }
    
    function createPlayerCard(player) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.playerId = player.id;
        
        // 计算当前每日积分
        const dailyPoints = calculateDailyPoints(player);
        
        card.innerHTML = `
            <div class="player-header">
                <input type="text" class="player-name-input" value="${player.name}" 
                       data-player-id="${player.id}" maxlength="10">
                <div class="player-mode">
                    <button class="mode-btn ${player.mode === 'fixed' ? 'active' : ''}" 
                            data-mode="fixed" data-player-id="${player.id}">固定排名</button>
                    <button class="mode-btn ${player.mode === 'custom' ? 'active' : ''}" 
                            data-mode="custom" data-player-id="${player.id}">自定义</button>
                </div>
            </div>
            
            <!-- 固定排名模式 -->
            <div class="fixed-rank-section" style="display: ${player.mode === 'fixed' ? 'block' : 'none'}">
                <select class="fixed-rank-select" data-player-id="${player.id}">
                    <option value="1" ${player.fixedRank === 1 ? 'selected' : ''}>🥇 第1名 (600/H)</option>
                    <option value="2" ${player.fixedRank === 2 ? 'selected' : ''}>🥈 第2名 (595/H)</option>
                    <option value="3" ${player.fixedRank === 3 ? 'selected' : ''}>🥉 第3名 (590/H)</option>
                    <option value="4" ${player.fixedRank === 4 ? 'selected' : ''}>4️⃣ 第4名 (585/H)</option>
                    <option value="5" ${player.fixedRank === 5 ? 'selected' : ''}>5️⃣ 第5名 (580/H)</option>
                </select>
            </div>
            
            <!-- 自定义时间模式 -->
            <div class="custom-time-section" style="display: ${player.mode === 'custom' ? 'block' : 'none'}">
                <div class="time-inputs-grid">
                    ${[1, 2, 3, 4, 5].map(rank => `
                        <div class="time-input-row">
                            <div class="rank-indicator">${rank}</div>
                            <label>第${rank}名</label>
                            <input type="number" class="hours-input" 
                                   data-player-id="${player.id}" data-rank="${rank}"
                                   value="${player.customHours[rank]}" min="0" max="24" step="0.5">
                            <span>小时</span>
                        </div>
                    `).join('')}
                </div>
                <div class="time-total">
                    <span class="label">每日总时间</span>
                    <span class="value ${getTotalHours(player) === 24 ? 'valid' : 'invalid'}" 
                          id="totalHours-${player.id}">${getTotalHours(player)}h / 24h</span>
                </div>
            </div>
            
            <!-- 每日积分显示 -->
            <div class="daily-points-display">
                <div class="label">每日积分</div>
                <div class="points-value" id="dailyPoints-${player.id}">${dailyPoints.toLocaleString()}</div>
            </div>
        `;
        
        return card;
    }
    
    // =========================================
    // 计算函数
    // =========================================
    
    function getTotalHours(player) {
        if (player.mode === 'fixed') return 24;
        return Object.values(player.customHours).reduce((sum, h) => sum + h, 0);
    }
    
    function calculateDailyPoints(player) {
        if (player.mode === 'fixed') {
            return POINTS_PER_HOUR[player.fixedRank] * 24;
        } else {
            let total = 0;
            for (let rank = 1; rank <= 5; rank++) {
                total += player.customHours[rank] * POINTS_PER_HOUR[rank];
            }
            return total;
        }
    }
    
    function calculateSeasonResults() {
        const seasonDays = parseInt(seasonDaysInput.value) || 14;
        
        const results = players.map(player => {
            const dailyPoints = calculateDailyPoints(player);
            const totalPoints = dailyPoints * seasonDays;
            
            return {
                id: player.id,
                name: player.name,
                dailyPoints: dailyPoints,
                totalPoints: totalPoints,
                mode: player.mode,
                fixedRank: player.fixedRank,
                customHours: { ...player.customHours }
            };
        });
        
        // 按总积分排序
        results.sort((a, b) => b.totalPoints - a.totalPoints);
        
        // 分配最终排名
        results.forEach((result, index) => {
            result.finalRank = index + 1;
        });
        
        return results;
    }
    
    // =========================================
    // 渲染结果
    // =========================================
    
    function renderResults(results) {
        const seasonDays = parseInt(seasonDaysInput.value) || 14;
        
        // 渲染结果卡片
        resultsContainer.innerHTML = results.map(result => `
            <div class="result-card rank-${result.finalRank}">
                <div class="final-rank">${result.finalRank}</div>
                <div class="player-name">${result.name}</div>
                <div class="total-points">${result.totalPoints.toLocaleString()}</div>
                <div class="points-label">赛季总积分</div>
            </div>
        `).join('');
        
        // 渲染每日明细表格
        renderBreakdownTable(results, seasonDays);
        
        // 显示结果面板
        resultsPanel.style.display = 'block';
        
        // 生成策略分析
        generateStrategy(results);
    }
    
    function renderBreakdownTable(results, seasonDays) {
        // 只显示关键天数：第1天、当前天、最后一天
        const currentDay = parseInt(currentDayInput.value) || 1;
        const keyDays = [...new Set([1, currentDay, seasonDays])].sort((a, b) => a - b);
        
        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>玩家</th>
                        <th>每日积分</th>
                        ${keyDays.map(day => `<th>第${day}天累计</th>`).join('')}
                        <th>最终排名</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        results.forEach(result => {
            tableHTML += `
                <tr>
                    <td><strong>${result.name}</strong></td>
                    <td>${result.dailyPoints.toLocaleString()}</td>
                    ${keyDays.map(day => `
                        <td>${(result.dailyPoints * day).toLocaleString()}</td>
                    `).join('')}
                    <td><strong>${result.finalRank}</strong></td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table>';
        breakdownTable.innerHTML = tableHTML;
    }
    
    // =========================================
    // 策略分析
    // =========================================
    
    function generateStrategy(results) {
        const seasonDays = parseInt(seasonDaysInput.value) || 14;
        const strategies = [];
        
        // 找出差距最小的相邻排名
        for (let i = 0; i < results.length - 1; i++) {
            const higher = results[i];
            const lower = results[i + 1];
            const gap = higher.totalPoints - lower.totalPoints;
            const dailyGap = higher.dailyPoints - lower.dailyPoints;
            
            if (gap > 0 && dailyGap !== 0) {
                // 计算追平需要的条件
                const daysToOvertake = Math.ceil(gap / Math.abs(dailyGap));
                
                if (dailyGap > 0) {
                    strategies.push({
                        type: 'info',
                        title: `${higher.name} vs ${lower.name}`,
                        content: `${higher.name} 每日多获得 ${dailyGap} 分，${seasonDays}天后领先 ${gap.toLocaleString()} 分`
                    });
                }
            }
        }
        
        // 检查是否有玩家总时间不等于24小时
        players.forEach(player => {
            if (player.mode === 'custom') {
                const totalHours = getTotalHours(player);
                if (totalHours !== 24) {
                    strategies.push({
                        type: 'warning',
                        title: `⚠️ ${player.name} 时间配置异常`,
                        content: `当前配置总时间为 ${totalHours} 小时，不等于24小时，请检查配置`
                    });
                }
            }
        });
        
        // 找出前三名的分界线
        if (results.length >= 3) {
            const thirdPlace = results[2];
            const fourthPlace = results[3];
            if (fourthPlace) {
                const gapTo3rd = thirdPlace.totalPoints - fourthPlace.totalPoints;
                strategies.push({
                    type: 'success',
                    title: '🏅 进入前三条件',
                    content: `第3名 (${thirdPlace.name}) 总积分 ${thirdPlace.totalPoints.toLocaleString()}，
                             第4名 (${fourthPlace.name}) 需要额外 ${gapTo3rd.toLocaleString()} 分才能超越`
                });
            }
        }
        
        // 渲染策略
        if (strategies.length > 0) {
            strategyContent.innerHTML = strategies.map(s => `
                <div class="strategy-item ${s.type}">
                    <div class="title">${s.title}</div>
                    <div class="content">${s.content}</div>
                </div>
            `).join('');
            strategyPanel.style.display = 'block';
        } else {
            strategyPanel.style.display = 'none';
        }
    }
    
    // =========================================
    // 事件绑定
    // =========================================
    
    function bindEvents() {
        // 计算按钮
        calculateBtn.addEventListener('click', function() {
            const results = calculateSeasonResults();
            renderResults(results);
            
            // 滚动到结果区域
            resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        
        // 重置按钮
        resetBtn.addEventListener('click', function() {
            players = [];
            for (let i = 1; i <= DEFAULT_PLAYERS; i++) {
                players.push({
                    id: i,
                    name: `玩家${i}`,
                    mode: 'fixed',
                    fixedRank: i,
                    customHours: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
                });
            }
            renderPlayers();
            resultsPanel.style.display = 'none';
            strategyPanel.style.display = 'none';
        });
        
        // 使用事件委托处理玩家卡片内的交互
        playersContainer.addEventListener('click', handlePlayerClick);
        playersContainer.addEventListener('change', handlePlayerChange);
        playersContainer.addEventListener('input', handlePlayerInput);
    }
    
    function handlePlayerClick(e) {
        // 模式切换按钮
        if (e.target.classList.contains('mode-btn')) {
            const playerId = parseInt(e.target.dataset.playerId);
            const mode = e.target.dataset.mode;
            const player = players.find(p => p.id === playerId);
            
            if (player) {
                player.mode = mode;
                
                // 如果切换到自定义模式，默认设置24小时在固定排名位置
                if (mode === 'custom') {
                    player.customHours = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                    player.customHours[player.fixedRank] = 24;
                }
                
                renderPlayers();
            }
        }
    }
    
    function handlePlayerChange(e) {
        // 固定排名选择
        if (e.target.classList.contains('fixed-rank-select')) {
            const playerId = parseInt(e.target.dataset.playerId);
            const rank = parseInt(e.target.value);
            const player = players.find(p => p.id === playerId);
            
            if (player) {
                player.fixedRank = rank;
                updateDailyPointsDisplay(player);
            }
        }
        
        // 玩家名称输入
        if (e.target.classList.contains('player-name-input')) {
            const playerId = parseInt(e.target.dataset.playerId);
            const player = players.find(p => p.id === playerId);
            
            if (player) {
                player.name = e.target.value || `玩家${playerId}`;
            }
        }
    }
    
    function handlePlayerInput(e) {
        // 自定义时间输入
        if (e.target.classList.contains('hours-input')) {
            const playerId = parseInt(e.target.dataset.playerId);
            const rank = parseInt(e.target.dataset.rank);
            const hours = parseFloat(e.target.value) || 0;
            const player = players.find(p => p.id === playerId);
            
            if (player) {
                player.customHours[rank] = Math.max(0, Math.min(24, hours));
                updateTotalHoursDisplay(player);
                updateDailyPointsDisplay(player);
            }
        }
        
        // 玩家名称输入
        if (e.target.classList.contains('player-name-input')) {
            const playerId = parseInt(e.target.dataset.playerId);
            const player = players.find(p => p.id === playerId);
            
            if (player) {
                player.name = e.target.value || `玩家${playerId}`;
            }
        }
    }
    
    function updateTotalHoursDisplay(player) {
        const totalEl = document.getElementById(`totalHours-${player.id}`);
        if (totalEl) {
            const total = getTotalHours(player);
            totalEl.textContent = `${total}h / 24h`;
            totalEl.className = `value ${total === 24 ? 'valid' : 'invalid'}`;
        }
    }
    
    function updateDailyPointsDisplay(player) {
        const pointsEl = document.getElementById(`dailyPoints-${player.id}`);
        if (pointsEl) {
            const dailyPoints = calculateDailyPoints(player);
            pointsEl.textContent = dailyPoints.toLocaleString();
        }
    }
    
    // =========================================
    // 启动
    // =========================================
    
    init();
});
