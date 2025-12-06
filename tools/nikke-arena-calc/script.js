/**
 * 竞技场积分计算器 v2.0 - 支持5个玩家
 */
document.addEventListener('DOMContentLoaded', function() {
    const POINTS_PER_HOUR = { 1: 600, 2: 595, 3: 590, 4: 585, 5: 580 };
    const STORAGE_KEY = 'arenaCalculatorV2';
    const PLAYER_COUNT = 5;
    
    let appData = { currentSeason: null, historySeasons: [] };
    
    // DOM
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const currentSeasonNameEl = document.getElementById('currentSeasonName');
    const recordedDaysEl = document.getElementById('recordedDays');
    const leaderboardEl = document.getElementById('leaderboard');
    const daySelectEl = document.getElementById('daySelect');
    const dayStatusEl = document.getElementById('dayStatus');
    const playersInputGridEl = document.getElementById('playersInputGrid');
    const recordsHeadEl = document.getElementById('recordsHead');
    const recordsBodyEl = document.getElementById('recordsBody');
    const saveDayBtn = document.getElementById('saveDay');
    const clearDayBtn = document.getElementById('clearDay');
    const endSeasonBtn = document.getElementById('endSeason');
    const startNewSeasonBtn = document.getElementById('startNewSeason');
    const exportDataBtn = document.getElementById('exportData');
    const importDataBtn = document.getElementById('importData');
    const importFileInput = document.getElementById('importFile');
    const clearAllDataBtn = document.getElementById('clearAllData');
    const seasonNameInput = document.getElementById('seasonName');
    const seasonDaysInput = document.getElementById('seasonDays');
    const historyListEl = document.getElementById('historyList');
    const historyModal = document.getElementById('historyModal');
    const modalSeasonNameEl = document.getElementById('modalSeasonName');
    const modalBodyEl = document.getElementById('modalBody');
    const closeModalBtn = document.getElementById('closeModal');
    
    function init() {
        loadData();
        bindEvents();
        if (!appData.currentSeason) showNoSeasonState();
        else renderCurrentSeason();
        renderHistoryList();
    }
    
    function loadData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) appData = JSON.parse(saved);
        } catch (e) { console.error('加载失败:', e); }
    }
    
    function saveData() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }
        catch (e) { alert('保存失败'); }
    }
    
    function getPlayerNames() {
        const names = [];
        for (let i = 1; i <= PLAYER_COUNT; i++) {
            const input = document.getElementById(`playerName${i}`);
            names.push(input ? input.value.trim() || `玩家${i}` : `玩家${i}`);
        }
        return names;
    }
    
    function createNewSeason(name, days, playerNames) {
        return {
            id: Date.now(),
            name: name || `赛季 ${new Date().toLocaleDateString()}`,
            totalDays: days || 14,
            playerNames: playerNames || ['玩家1', '玩家2', '玩家3', '玩家4', '玩家5'],
            createdAt: new Date().toISOString(),
            records: {} // { day: { players: { 1: {hours: {1:x,...}, points: y}, ... } } }
        };
    }
    
    function startNewSeason() {
        const name = seasonNameInput.value.trim();
        const days = parseInt(seasonDaysInput.value) || 14;
        const playerNames = getPlayerNames();
        
        if (appData.currentSeason && Object.keys(appData.currentSeason.records).length > 0) {
            if (!confirm('当前赛季有记录，开始新赛季会覆盖。确定继续？')) return;
        }
        appData.currentSeason = createNewSeason(name, days, playerNames);
        saveData();
        renderCurrentSeason();
        switchTab('current');
        alert('新赛季已开始！');
    }
    
    function endCurrentSeason() {
        if (!appData.currentSeason) { alert('没有进行中的赛季'); return; }
        if (Object.keys(appData.currentSeason.records).length === 0) {
            alert('当前赛季没有记录，无法归档'); return;
        }
        if (!confirm('确定结束当前赛季并归档？')) return;
        
        const finalStats = calculateFinalStats();
        appData.currentSeason.endedAt = new Date().toISOString();
        appData.currentSeason.finalStats = finalStats;
        appData.historySeasons.unshift(appData.currentSeason);
        appData.currentSeason = null;
        saveData();
        showNoSeasonState();
        renderHistoryList();
        alert('赛季已归档！');
    }
    
    function calculateFinalStats() {
        const season = appData.currentSeason;
        const stats = {};
        for (let p = 1; p <= PLAYER_COUNT; p++) {
            stats[p] = { name: season.playerNames[p-1], totalPoints: 0 };
        }
        for (const day in season.records) {
            const dayData = season.records[day];
            for (let p = 1; p <= PLAYER_COUNT; p++) {
                if (dayData.players[p]) {
                    stats[p].totalPoints += dayData.players[p].points;
                }
            }
        }
        return stats;
    }
    
    function showNoSeasonState() {
        currentSeasonNameEl.textContent = '未开始';
        recordedDaysEl.textContent = '请在设置中开始新赛季';
        leaderboardEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">暂无数据</p>';
        daySelectEl.innerHTML = '<option>请先开始新赛季</option>';
        daySelectEl.disabled = true;
        dayStatusEl.textContent = '';
        playersInputGridEl.innerHTML = '';
        recordsHeadEl.innerHTML = '';
        recordsBodyEl.innerHTML = '<tr><td colspan="10" class="empty-row">请在「设置」中开始新赛季</td></tr>';
        saveDayBtn.disabled = true;
        clearDayBtn.disabled = true;
        endSeasonBtn.disabled = true;
    }
    
    function renderCurrentSeason() {
        const season = appData.currentSeason;
        if (!season) { showNoSeasonState(); return; }
        
        daySelectEl.disabled = false;
        saveDayBtn.disabled = false;
        clearDayBtn.disabled = false;
        endSeasonBtn.disabled = false;
        
        currentSeasonNameEl.textContent = season.name;
        const recordedCount = Object.keys(season.records).length;
        recordedDaysEl.textContent = `${recordedCount} / ${season.totalDays} 天`;
        
        renderLeaderboard();
        renderDaySelector();
        renderPlayersInputGrid();
        renderRecordsTable();
        loadDayData(parseInt(daySelectEl.value));
    }
    
    function renderLeaderboard() {
        const season = appData.currentSeason;
        const totals = [];
        for (let p = 1; p <= PLAYER_COUNT; p++) {
            let total = 0;
            for (const day in season.records) {
                if (season.records[day].players[p]) {
                    total += season.records[day].players[p].points;
                }
            }
            totals.push({ id: p, name: season.playerNames[p-1], points: total });
        }
        totals.sort((a, b) => b.points - a.points);
        
        leaderboardEl.innerHTML = totals.map((item, idx) => `
            <div class="leaderboard-item rank-${idx + 1}">
                <div class="leaderboard-rank">${idx + 1}</div>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${item.name}</div>
                    <div class="leaderboard-points">${item.points.toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    }
    
    function renderDaySelector() {
        const season = appData.currentSeason;
        daySelectEl.innerHTML = '';
        for (let day = 1; day <= season.totalDays; day++) {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = `第 ${day} 天${season.records[day] ? ' ✓' : ''}`;
            daySelectEl.appendChild(option);
        }
        let defaultDay = 1;
        for (let day = 1; day <= season.totalDays; day++) {
            if (!season.records[day]) { defaultDay = day; break; }
            defaultDay = day;
        }
        daySelectEl.value = defaultDay;
        updateDayStatus(defaultDay);
    }
    
    function updateDayStatus(day) {
        const season = appData.currentSeason;
        if (!season) return;
        if (season.records[day]) {
            dayStatusEl.textContent = '已记录';
            dayStatusEl.className = 'day-status recorded';
        } else {
            dayStatusEl.textContent = '未记录';
            dayStatusEl.className = 'day-status empty';
        }
    }
    
    function renderPlayersInputGrid() {
        const season = appData.currentSeason;
        let html = '';
        for (let p = 1; p <= PLAYER_COUNT; p++) {
            html += `
                <div class="player-input-card" data-player="${p}">
                    <div class="player-input-header">
                        <div class="player-avatar">${p}</div>
                        <div class="player-input-name">${season.playerNames[p-1]}</div>
                        <div class="player-input-points" id="playerPoints${p}">0</div>
                    </div>
                    <div class="time-inputs-mini">
                        ${[1,2,3,4,5].map(rank => `
                            <div class="time-input-mini">
                                <label>${rank}名</label>
                                <input type="number" class="player-hours" 
                                    data-player="${p}" data-rank="${rank}"
                                    id="p${p}r${rank}" value="0" min="0" max="24" step="0.5">
                            </div>
                        `).join('')}
                    </div>
                    <div class="player-input-footer">
                        <span class="time-total" id="playerTotal${p}">0h / 24h</span>
                    </div>
                </div>
            `;
        }
        playersInputGridEl.innerHTML = html;
        
        // 绑定输入事件
        document.querySelectorAll('.player-hours').forEach(input => {
            input.addEventListener('input', function() {
                const p = parseInt(this.dataset.player);
                updatePlayerSummary(p);
            });
        });
    }
    
    function updatePlayerSummary(playerId) {
        let totalHours = 0;
        const hours = {};
        for (let rank = 1; rank <= 5; rank++) {
            const input = document.getElementById(`p${playerId}r${rank}`);
            hours[rank] = parseFloat(input.value) || 0;
            totalHours += hours[rank];
        }
        const points = calculatePoints(hours);
        
        const totalEl = document.getElementById(`playerTotal${playerId}`);
        totalEl.textContent = `${totalHours}h / 24h`;
        totalEl.className = totalHours === 24 ? 'time-total valid' : 'time-total invalid';
        
        document.getElementById(`playerPoints${playerId}`).textContent = points.toLocaleString();
    }
    
    function calculatePoints(hours) {
        let total = 0;
        for (let rank = 1; rank <= 5; rank++) {
            total += (hours[rank] || 0) * POINTS_PER_HOUR[rank];
        }
        return total;
    }
    
    function loadDayData(day) {
        const season = appData.currentSeason;
        if (!season) return;
        
        const record = season.records[day];
        for (let p = 1; p <= PLAYER_COUNT; p++) {
            for (let rank = 1; rank <= 5; rank++) {
                const input = document.getElementById(`p${p}r${rank}`);
                if (input) {
                    input.value = record?.players?.[p]?.hours?.[rank] || 0;
                }
            }
            updatePlayerSummary(p);
        }
        updateDayStatus(day);
    }
    
    function saveDayRecord() {
        const season = appData.currentSeason;
        if (!season) { alert('请先开始新赛季'); return; }
        
        const day = parseInt(daySelectEl.value);
        const players = {};
        let hasInvalidTime = false;
        
        for (let p = 1; p <= PLAYER_COUNT; p++) {
            const hours = {};
            let totalHours = 0;
            for (let rank = 1; rank <= 5; rank++) {
                const input = document.getElementById(`p${p}r${rank}`);
                hours[rank] = parseFloat(input.value) || 0;
                totalHours += hours[rank];
            }
            if (totalHours !== 24 && totalHours !== 0) hasInvalidTime = true;
            players[p] = { hours, points: calculatePoints(hours) };
        }
        
        if (hasInvalidTime) {
            if (!confirm('有玩家的时间不等于24小时，确定保存？')) return;
        }
        
        season.records[day] = { players, savedAt: new Date().toISOString() };
        saveData();
        renderCurrentSeason();
        
        // 自动跳转下一天
        let nextDay = null;
        for (let d = 1; d <= season.totalDays; d++) {
            if (!season.records[d]) { nextDay = d; break; }
        }
        if (nextDay && nextDay !== day) {
            daySelectEl.value = nextDay;
            loadDayData(nextDay);
        }
    }
    
    function clearDayRecord() {
        const season = appData.currentSeason;
        if (!season) return;
        const day = parseInt(daySelectEl.value);
        
        if (!season.records[day]) {
            for (let p = 1; p <= PLAYER_COUNT; p++) {
                for (let rank = 1; rank <= 5; rank++) {
                    document.getElementById(`p${p}r${rank}`).value = 0;
                }
                updatePlayerSummary(p);
            }
            return;
        }
        if (!confirm(`确定删除第 ${day} 天的记录？`)) return;
        delete season.records[day];
        saveData();
        renderCurrentSeason();
        loadDayData(day);
    }
    
    function renderRecordsTable() {
        const season = appData.currentSeason;
        if (!season) return;
        
        // 表头
        let headHtml = '<tr><th>天数</th>';
        for (let p = 1; p <= PLAYER_COUNT; p++) {
            headHtml += `<th>${season.playerNames[p-1]}</th>`;
        }
        headHtml += '<th>操作</th></tr>';
        recordsHeadEl.innerHTML = headHtml;
        
        // 累计积分
        const cumulative = {};
        for (let p = 1; p <= PLAYER_COUNT; p++) cumulative[p] = 0;
        
        // 表体
        let bodyHtml = '';
        for (let day = 1; day <= season.totalDays; day++) {
            const record = season.records[day];
            if (record) {
                bodyHtml += `<tr><td class="day-col">第${day}天</td>`;
                for (let p = 1; p <= PLAYER_COUNT; p++) {
                    const pts = record.players[p]?.points || 0;
                    cumulative[p] += pts;
                    bodyHtml += `<td class="points-col">${pts.toLocaleString()}<br><small style="color:var(--text-secondary)">${cumulative[p].toLocaleString()}</small></td>`;
                }
                bodyHtml += `<td><button class="btn btn-sm btn-secondary edit-day-btn" data-day="${day}">编辑</button></td></tr>`;
            } else {
                bodyHtml += `<tr class="empty-row"><td class="day-col">第${day}天</td>`;
                for (let p = 1; p <= PLAYER_COUNT; p++) {
                    bodyHtml += `<td>-</td>`;
                }
                bodyHtml += `<td><button class="btn btn-sm btn-primary edit-day-btn" data-day="${day}">录入</button></td></tr>`;
            }
        }
        recordsBodyEl.innerHTML = bodyHtml;
        
        document.querySelectorAll('.edit-day-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const day = parseInt(this.dataset.day);
                daySelectEl.value = day;
                loadDayData(day);
                document.querySelector('.daily-input-panel').scrollIntoView({ behavior: 'smooth' });
            });
        });
    }
    
    function renderHistoryList() {
        if (appData.historySeasons.length === 0) {
            historyListEl.innerHTML = '<div class="empty-history"><div class="icon">📭</div><p>暂无历史赛季</p></div>';
            return;
        }
        
        historyListEl.innerHTML = appData.historySeasons.map((season, idx) => {
            const endDate = season.endedAt ? new Date(season.endedAt).toLocaleDateString() : '-';
            const stats = season.finalStats || {};
            const sorted = Object.values(stats).sort((a, b) => b.totalPoints - a.totalPoints);
            
            return `
                <div class="history-card">
                    <div class="history-header">
                        <h4>${season.name}</h4>
                        <span>结束于 ${endDate}</span>
                    </div>
                    <div class="history-rankings">
                        ${sorted.slice(0, 3).map((item, i) => `
                            <div class="history-rank-item">
                                <div class="history-rank-badge">${i + 1}</div>
                                <span>${item.name}: ${item.totalPoints.toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="history-actions">
                        <button class="btn btn-sm btn-secondary view-history-btn" data-index="${idx}">查看详情</button>
                        <button class="btn btn-sm btn-danger delete-history-btn" data-index="${idx}">删除</button>
                    </div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.view-history-btn').forEach(btn => {
            btn.addEventListener('click', function() { showHistoryDetail(parseInt(this.dataset.index)); });
        });
        document.querySelectorAll('.delete-history-btn').forEach(btn => {
            btn.addEventListener('click', function() { deleteHistory(parseInt(this.dataset.index)); });
        });
    }
    
    function showHistoryDetail(index) {
        const season = appData.historySeasons[index];
        if (!season) return;
        
        modalSeasonNameEl.textContent = season.name;
        
        // 最终排名
        const stats = season.finalStats || {};
        const sorted = Object.values(stats).sort((a, b) => b.totalPoints - a.totalPoints);
        
        let html = '<h4>最终排名</h4><div class="history-rankings" style="margin-bottom:1.5rem;">';
        sorted.forEach((item, i) => {
            html += `<div class="history-rank-item"><div class="history-rank-badge">${i+1}</div><span>${item.name}: ${item.totalPoints.toLocaleString()}</span></div>`;
        });
        html += '</div>';
        
        // 详细表格
        html += '<h4>每日明细</h4><table class="records-table"><thead><tr><th>天数</th>';
        season.playerNames.forEach(name => { html += `<th>${name}</th>`; });
        html += '</tr></thead><tbody>';
        
        const cumulative = {};
        for (let p = 1; p <= PLAYER_COUNT; p++) cumulative[p] = 0;
        
        for (let day = 1; day <= season.totalDays; day++) {
            const record = season.records[day];
            html += `<tr><td class="day-col">第${day}天</td>`;
            for (let p = 1; p <= PLAYER_COUNT; p++) {
                if (record?.players?.[p]) {
                    const pts = record.players[p].points;
                    cumulative[p] += pts;
                    html += `<td>${pts.toLocaleString()}<br><small>${cumulative[p].toLocaleString()}</small></td>`;
                } else {
                    html += '<td>-</td>';
                }
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        
        modalBodyEl.innerHTML = html;
        historyModal.classList.add('show');
    }
    
    function deleteHistory(index) {
        const season = appData.historySeasons[index];
        if (!confirm(`确定删除「${season.name}」？`)) return;
        appData.historySeasons.splice(index, 1);
        saveData();
        renderHistoryList();
    }
    
    function exportData() {
        const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `arena-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    }
    
    function importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                if (!confirm('导入将覆盖当前数据，确定？')) return;
                appData = imported;
                saveData();
                if (appData.currentSeason) renderCurrentSeason();
                else showNoSeasonState();
                renderHistoryList();
                alert('导入成功！');
            } catch (err) { alert('导入失败: ' + err.message); }
        };
        reader.readAsText(file);
    }
    
    function clearAllData() {
        if (!confirm('确定清除所有数据？')) return;
        if (!confirm('再次确认！')) return;
        appData = { currentSeason: null, historySeasons: [] };
        saveData();
        showNoSeasonState();
        renderHistoryList();
    }
    
    function switchTab(tabId) {
        tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
    }
    
    function bindEvents() {
        tabBtns.forEach(btn => btn.addEventListener('click', function() { switchTab(this.dataset.tab); }));
        daySelectEl.addEventListener('change', function() { loadDayData(parseInt(this.value)); });
        saveDayBtn.addEventListener('click', saveDayRecord);
        clearDayBtn.addEventListener('click', clearDayRecord);
        endSeasonBtn.addEventListener('click', endCurrentSeason);
        startNewSeasonBtn.addEventListener('click', startNewSeason);
        exportDataBtn.addEventListener('click', exportData);
        importDataBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', function() {
            if (this.files[0]) { importData(this.files[0]); this.value = ''; }
        });
        clearAllDataBtn.addEventListener('click', clearAllData);
        closeModalBtn.addEventListener('click', () => historyModal.classList.remove('show'));
        historyModal.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
    }
    
    init();
});
