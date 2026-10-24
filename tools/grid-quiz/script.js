(function () {
    'use strict';

    const $ = function (id) { return document.getElementById(id); };
    const tokenKey = 'web-tools-grid-quiz-token';
    const bankKey = 'web-tools-grid-quiz-bank';
    const bankCache = new Map();
    const modeNames = { ordered: '顺序练习', random: '随机练习', wrong: '错题重练', favorites: '收藏练习' };
    const typeNames = { single: '单选题', multiple: '多选题', judge: '判断题' };
    const statRows = [
        ['single', '单选题'], ['multiple', '多选题'], ['multiple_partial', '非全选'],
        ['multiple_all', '全选'], ['judge', '判断题'], ['judge_true', '答案为对'], ['judge_false', '答案为错']
    ];
    let token = localStorage.getItem(tokenKey) || '';
    let bank = null;
    let bankId = localStorage.getItem(bankKey) || 'sgcc-public-2027';
    let questions = new Map();
    let state = null;
    let position = 0;
    let memorize = false;
    let memoryRound = null;
    let memoryPosition = 0;
    let busy = false;
    let currentView = 'practice';
    let wrongPage = 0;
    const wrongPageSize = 20;
    let swipeStart = null;

    // Display only: keep the original chapter value for filtering and saved rounds.
    function chapterLabel(chapter) {
        return chapter.replace(/\s*\/\s*练习题\s*$/, '');
    }

    function showView(view) {
        currentView = view;
        const copy = {
            practice: ['题库练习', '从一道题开始，把知识慢慢变成把握。'],
            wrong: ['错题本', '找到还不熟悉的知识，再认真练习一次。'],
            stats: ['学习统计', '看见已经走过的路，安排下一步的学习。']
        };
        document.querySelectorAll('[data-view]').forEach(function (button) {
            if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        ['practice', 'wrong', 'stats'].forEach(function (name) { $(name + 'View').hidden = name !== view; });
        updateActionBarSpace();
        $('viewTitle').textContent = copy[view][0];
        $('viewDescription').textContent = copy[view][1];
        if (view === 'wrong' && state) renderWrongList();
    }

    function renderWrongList() {
        const items = scoped().filter(function (q) { return state.latest[q.id] === false; });
        const pages = Math.max(1, Math.ceil(items.length / wrongPageSize));
        wrongPage = Math.min(wrongPage, pages - 1);
        $('wrongScope').textContent = chapterLabel($('chapter').value || $('subject').value || '全部章节') +
            ' · ' + $('kind').selectedOptions[0].textContent + ' · ' + items.length + ' 道待巩固';
        $('reviewWrong').textContent = memorize ? '开始错题背题' : '开始错题练习';
        const list = $('wrongList');
        list.replaceChildren();
        if (!items.length) {
            const empty = document.createElement('li');
            empty.className = 'wrong-empty';
            const title = document.createElement('strong');
            title.textContent = '当前范围没有错题';
            empty.append(title, '可以调整筛选范围，或继续练习新的题目。');
            list.append(empty);
        }
        items.slice(wrongPage * wrongPageSize, (wrongPage + 1) * wrongPageSize).forEach(function (q) {
            const item = document.createElement('li');
            item.className = 'wrong-item';
            const meta = document.createElement('div');
            meta.className = 'question-meta';
            const title = document.createElement('span');
            title.textContent = '第 ' + q.id + ' 题 · ' + typeNames[q.type];
            const status = document.createElement('span');
            status.className = 'wrong-tag';
            status.textContent = '× 待巩固';
            meta.append(title, status);
            const text = document.createElement('p');
            text.textContent = q.text || '本题含插图，请进入练习查看完整题目。';
            const chapter = document.createElement('p');
            chapter.className = 'muted';
            chapter.textContent = chapterLabel(q.chapter);
            item.append(meta, text, chapter);
            list.append(item);
        });
        $('wrongPageLabel').textContent = items.length ? '第 ' + (wrongPage + 1) + ' / ' + pages + ' 页 · 共 ' + items.length + ' 题' : '';
        $('wrongPrevious').disabled = wrongPage === 0;
        $('wrongNext').disabled = wrongPage + 1 >= pages;
        $('wrongPrevious').hidden = $('wrongNext').hidden = pages <= 1;
    }

    function notify(message) {
        $('message').textContent = message;
        $('message').hidden = !message;
    }

    async function api(route, body) {
        let query = '';
        if (route === 'state') {
            query = '?bank=' + encodeURIComponent(bankId);
            const cached = bankCache.get(bankId);
            if (cached && cached.version) query += '&bank_version=' + encodeURIComponent(cached.version);
        }
        const response = await fetch('/api/grid-quiz/' + route + query, {
            method: body ? 'POST' : 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
            body: body ? JSON.stringify(Object.assign({}, body, { bank: bankId })) : undefined,
            signal: AbortSignal.timeout(20000)
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401 && route !== 'login') {
                token = '';
                localStorage.removeItem(tokenKey);
                $('workspace').hidden = true;
                $('loginPanel').hidden = false;
                $('logout').hidden = true;
                $('accountName').textContent = '';
                $('todaySummary').hidden = true;
            }
            throw new Error(data.error || '请求失败，请重试');
        }
        return data;
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        document.body.dataset.busy = 'true';
        $('syncStatus').textContent = '正在同步…';
        const buttons = Array.from(document.querySelectorAll('button'));
        const selects = Array.from(document.querySelectorAll('select'));
        const answerInputs = Array.from(document.querySelectorAll('#options input'));
        const answerDisabled = answerInputs.map(function (input) { return input.disabled; });
        const disabled = buttons.map(function (button) { return button.disabled; });
        buttons.forEach(function (button) { button.disabled = true; });
        selects.forEach(function (select) { select.disabled = true; });
        answerInputs.forEach(function (input) { input.disabled = true; });
        notify('');
        try { await action(); } catch (error) { notify(error.message || '连接失败，请稍后重试'); }
        finally {
            buttons.forEach(function (button, i) { button.disabled = disabled[i]; });
            selects.forEach(function (select) { select.disabled = false; });
            answerInputs.forEach(function (input, i) { input.disabled = answerDisabled[i]; });
            busy = false;
            document.body.dataset.busy = 'false';
            $('syncStatus').textContent = state ? '记录自动保存' : '学习记录随账号保存';
            if (state) {
                renderScope();
                updateNavigationButtons();
            }
        }
    }

    function matches(q, kind, chapter) {
        if (chapter && q.chapter !== chapter) return false;
        if (kind === 'all' || kind === q.type) return true;
        if (q.type === 'multiple') return kind === (q.answer.length === q.options.length ? 'multiple_all' : 'multiple_partial');
        if (q.type === 'judge') {
            const truth = q.options.find(function (option) { return option.key === q.answer[0]; }).text === '正确';
            return kind === (truth ? 'judge_true' : 'judge_false');
        }
        return false;
    }

    function scoped(kind) {
        return bank.questions.filter(function (q) {
            return (!$('subject').value || q.subject === $('subject').value) &&
                matches(q, kind || $('kind').value, $('chapter').value);
        });
    }

    function populateChapters(selected) {
        $('chapter').replaceChildren(new Option('全部章节', ''));
        Array.from(new Set(bank.questions.filter(function (q) {
            return !$('subject').value || q.subject === $('subject').value;
        }).map(function (q) { return q.chapter; }))).forEach(function (chapter) {
            $('chapter').append(new Option(chapterLabel(chapter), chapter));
        });
        $('chapter').value = selected || '';
    }

    function renderContent(target, plain, html) {
        target.replaceChildren();
        if (!html) { target.textContent = plain || ''; return; }
        const documentFragment = new DOMParser().parseFromString(html, 'text/html');
        const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'SUB', 'SUP', 'SPAN',
            'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'PRE', 'CODE', 'IMG']);
        function appendSafe(source, parent) {
            if (source.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(source.textContent)); return; }
            if (source.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(source.tagName)) return;
            const element = allowed.has(source.tagName) ? document.createElement(source.tagName.toLowerCase()) : parent;
            if (source.tagName === 'IMG') {
                const src = source.getAttribute('src') || '';
                if (!/^\/tools\/grid-quiz\/media\/[a-f0-9]+\.(png|jpg|jpeg|gif|webp)$/.test(src)) return;
                element.src = src;
                element.alt = source.getAttribute('alt') || '题目插图';
                element.loading = 'lazy';
            }
            if (['TD', 'TH'].includes(source.tagName)) {
                ['colspan', 'rowspan'].forEach(function (attribute) {
                    const count = Number(source.getAttribute(attribute));
                    if (Number.isInteger(count) && count > 0 && count < 100) element.setAttribute(attribute, count);
                });
            }
            Array.from(source.childNodes).forEach(function (child) { appendSafe(child, element); });
            if (element !== parent) parent.append(element);
        }
        Array.from(documentFragment.body.childNodes).forEach(function (node) { appendSafe(node, target); });
    }

    function answeredCount(round) {
        return round.answers.filter(Boolean).length;
    }

    function firstUnanswered(round) {
        const index = round.queue.findIndex(function (id, i) { return !round.answers[i]; });
        return index === -1 ? round.queue.length : index;
    }

    function isFavorite(id) {
        return (state.favorites || []).includes(id);
    }

    function updateFavoriteButton() {
        const round = memorize ? memoryRound : state.round;
        const cursor = memorize ? memoryPosition : position;
        const favorite = Boolean(round && isFavorite(round.queue[cursor]));
        $('favoriteQuestion').textContent = favorite ? '★ 已收藏' : '☆ 收藏本题';
        $('favoriteQuestion').setAttribute('aria-pressed', String(favorite));
        $('favoriteQuestion').title = favorite ? '取消收藏本题' : '收藏本题';
    }

    function updateNavigationButtons() {
        const round = memorize ? memoryRound : state.round;
        const cursor = memorize ? memoryPosition : position;
        $('previousQuestion').disabled = !round || cursor === 0;
    }

    function updateActionBarSpace() {
        const height = Math.ceil($('questionActions').getBoundingClientRect().height);
        document.documentElement.style.setProperty('--quiz-action-bar-height', height + 'px');
    }

    function navigateTo(target) {
        if (busy) return;
        function showTarget() {
            if ($('questionMapDialog').open) $('questionMapDialog').close();
            renderQuestion(true);
        }
        if (memorize) {
            memoryPosition = target;
            showTarget();
            return;
        }
        run(async function () {
            const result = await api('navigate', { round_id: state.round.id, position: target });
            state = result.state;
            position = state.round.position;
            renderDashboard();
            showTarget();
        });
    }

    // Display-only: writes the same "a · b · c" text as before, one span per part, so a line
    // only breaks between parts and never between a number and its label.
    function showSegments(target, parts) {
        target.replaceChildren();
        parts.forEach(function (text, i) {
            const part = document.createElement('span');
            part.textContent = i < parts.length - 1 ? text + ' ·' : text;
            if (i) target.append(' ');
            target.append(part);
        });
    }

    function renderScope() {
        const scope = scoped();
        const wrong = scope.filter(function (q) { return state.latest[q.id] === false; }).length;
        const done = scope.filter(function (q) { return Object.hasOwn(state.latest, q.id); }).length;
        const favorites = scope.filter(function (q) { return isFavorite(q.id); }).length;
        showSegments($('scopeCount'), ['当前范围 ' + scope.length + ' 题', '已刷 ' + done, '错题 ' + wrong, '收藏 ' + favorites]);
        $('favoriteStart').textContent = (memorize ? '只背收藏' : '只刷收藏') + '（' + favorites + '）';
        $('favoriteStart').disabled = !favorites;
        document.querySelectorAll('[data-start="wrong"]').forEach(function (button) { button.disabled = !wrong; });
        if (currentView === 'wrong') renderWrongList();
        $('statsScope').textContent = chapterLabel($('chapter').value || $('subject').value || '全部章节') + '；细分项包含在对应题型中。';
        $('typeStats').replaceChildren();
        statRows.forEach(function (entry) {
            const items = scoped(entry[0]);
            const done = items.filter(function (q) { return Object.hasOwn(state.latest, q.id); }).length;
            const row = document.createElement('tr');
            if (entry[0].includes('_')) row.className = 'subtype';
            [entry[1], items.length, done,
                items.filter(function (q) { return state.latest[q.id] === false; }).length].forEach(function (value) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
            });
            // Display-only completion column: done / total of the same row.
            const percent = items.length ? Math.round(done / items.length * 100) : 0;
            const coverage = document.createElement('td');
            coverage.className = 'stat-coverage';
            const bar = document.createElement('span');
            bar.className = 'stat-coverage__bar';
            bar.setAttribute('aria-hidden', 'true');
            bar.style.setProperty('--value', percent + '%');
            coverage.append(bar, items.length ? percent + '%' : '—');
            row.append(coverage);
            $('typeStats').append(row);
        });
    }

    function renderDashboard() {
        $('todaySummary').hidden = !token;
        $('todayCount').textContent = state.today_attempts;
        $('totalCount').textContent = bank.questions.length;
        $('chapterCount').textContent = '道题 · ' + new Set(bank.questions.map(function (q) { return q.chapter; })).size + ' 个章节';
        $('doneCount').textContent = Object.keys(state.latest).length;
        $('wrongCount').textContent = Object.values(state.latest).filter(function (correct) { return !correct; }).length;
        $('wrongNavCount').textContent = $('wrongCount').textContent;
        $('coverageProgress').max = bank.questions.length;
        $('coverageProgress').value = Object.keys(state.latest).length;
        $('coverageText').textContent = Object.keys(state.latest).length + ' / ' + bank.questions.length + ' 题';
        $('accuracy').textContent = '累计作答 ' + state.attempts + ' 次 · 正确率 ' +
            (state.attempts ? Math.round(state.correct_attempts / state.attempts * 100) + '%' : '—');
        $('continue').hidden = memorize || !state.round || answeredCount(state.round) === state.round.queue.length;
        renderScope();
        $('history').replaceChildren();
        if (!state.history.length) {
            const empty = document.createElement('li');
            empty.className = 'muted';
            empty.textContent = '还没有答题记录。选个范围，开始第一题吧。';
            $('history').append(empty);
        }
        state.history.forEach(function (item) {
            const q = questions.get(item.question_id);
            if (!q) return;
            const li = document.createElement('li');
            li.className = 'history-item';
            li.dataset.correct = item.correct;
            const icon = document.createElement('span');
            icon.textContent = item.correct ? '✓' : '×';
            const content = document.createElement('div');
            const title = document.createElement('p');
            title.textContent = '第 ' + q.id + ' 题 · ' + q.text.slice(0, 42) + (q.text.length > 42 ? '…' : '');
            const detail = document.createElement('small');
            showSegments(detail, [item.correct ? '答对' : '答错', '选择 ' + item.selected.join('、'), modeNames[item.mode],
                new Date(item.created * 1000).toLocaleString('zh-CN', { hour12: false })]);
            content.append(title, detail);
            li.append(icon, content);
            $('history').append(li);
        });
    }

    function renderQuestion(focus) {
        swipeStart = null;
        const round = memorize ? memoryRound : state.round;
        const cursor = memorize ? memoryPosition : position;
        if (focus) {
            showView('practice');
            if (window.matchMedia('(max-width: 760px)').matches) $('studySetup').open = false;
        }
        $('practiceEmpty').hidden = Boolean(round);
        $('practice').hidden = !round || cursor >= round.queue.length;
        $('completion').hidden = !round || cursor < round.queue.length;
        $('repeatMemory').hidden = !memorize;
        updateActionBarSpace();
        if (!round) return;
        if (cursor >= round.queue.length) {
            if (focus) $('completion').scrollIntoView({ block: 'start' });
            // Display-only: same wording as before. One span per sentence lets lines break between sentences;
            // \u00a0 (no-break space) keeps each count with its label and unit.
            const showSentences = function (summary, hint) {
                $('completionText').replaceChildren();
                [summary, hint].forEach(function (text) {
                    const sentence = document.createElement('span');
                    sentence.textContent = text;
                    $('completionText').append(sentence);
                });
            };
            if (memorize) {
                showSentences('本轮已浏览\u00a0' + round.queue.length + '\u00a0题。', '背题不计入答题统计，可以再背一遍或更换范围。');
                return;
            }
            const correct = round.answers.filter(function (answer) { return answer && answer.correct; }).length;
            showSentences(modeNames[round.mode] + ' · 共\u00a0' + round.queue.length + '\u00a0题，答对\u00a0' + correct +
                '\u00a0题，答错\u00a0' + (round.queue.length - correct) + '\u00a0题。', '可按当前筛选范围继续巩固错题。');
            return;
        }
        const q = questions.get(round.queue[cursor]);
        updateFavoriteButton();
        const answer = memorize ? null : round.answers[cursor];
        $('answerState').textContent = memorize ? '背题 · 已显示答案' : (answer ? (answer.correct ? '✓ 回答正确' : '× 回答错误') : '○ 未作答');
        $('answerState').dataset.state = memorize ? 'memorize' : (answer ? (answer.correct ? 'correct' : 'wrong') : 'idle');
        $('answerHint').hidden = true;
        $('roundLabel').textContent = (memorize ? '背题模式 · ' : '') + modeNames[round.mode] + ' · ' + chapterLabel(round.chapter || round.subject || '全部章节');
        $('roundProgress').textContent = (cursor + 1) + ' / ' + round.queue.length;
        $('roundProgress').setAttribute('aria-label', '第 ' + (cursor + 1) + ' 题，共 ' + round.queue.length + ' 题，点击查看全部题号');
        $('progress').max = round.queue.length;
        $('progress').value = memorize ? cursor + 1 : answeredCount(round);
        const typeTag = document.createElement('span');
        typeTag.className = 'type-tag';
        typeTag.dataset.type = q.type;
        typeTag.textContent = typeNames[q.type];
        const questionNumber = document.createElement('span');
        questionNumber.className = 'question-id';
        questionNumber.textContent = '第 ' + q.id + ' 题';
        const questionChapter = document.createElement('span');
        questionChapter.className = 'question-chapter';
        questionChapter.textContent = chapterLabel(q.chapter);
        questionChapter.title = chapterLabel(q.chapter);
        $('questionMeta').replaceChildren(typeTag, questionNumber, questionChapter);
        renderContent($('questionText'), q.text, q.text_html);
        $('multipleHelp').hidden = memorize || q.type !== 'multiple';
        $('options').replaceChildren();
        q.options.forEach(function (option) {
            const label = document.createElement('label');
            label.className = 'answer-option';
            const input = document.createElement('input');
            input.type = q.type === 'multiple' ? 'checkbox' : 'radio';
            input.name = 'answer';
            input.value = option.key;
            input.disabled = memorize || Boolean(answer);
            input.checked = memorize ? q.answer.includes(option.key) : Boolean(answer && answer.selected.includes(option.key));
            const text = document.createElement('span');
            text.className = 'option-body';
            const key = document.createElement('span');
            key.className = 'option-key';
            key.textContent = option.key;
            const content = document.createElement('span');
            content.className = 'option-content';
            renderContent(content, option.text, option.html);
            text.append(key, content);
            label.append(input, text);
            if ((memorize || answer) && q.answer.includes(option.key)) {
                label.classList.add('is-correct');
                const mark = document.createElement('span');
                mark.className = 'answer-mark';
                const missed = !memorize && q.type === 'multiple' && !answer.selected.includes(option.key);
                label.classList.toggle('is-missed', missed);
                mark.textContent = memorize ? '✓ 答案' : (missed ? '✓ 正确 · 漏选' : '✓ 正确答案');
                label.append(mark);
            } else if (answer && answer.selected.includes(option.key)) {
                label.classList.add('is-wrong');
                const mark = document.createElement('span');
                mark.className = 'answer-mark';
                mark.textContent = '× 错选';
                label.append(mark);
            } else if (!memorize && !answer) {
                const mark = document.createElement('span');
                mark.className = 'answer-mark answer-mark--selected';
                mark.textContent = '已选择';
                label.append(mark);
            }
            $('options').append(label);
        });
        $('sourcePage').textContent = q.page ? '题库 PDF · 第 ' + q.page + ' 页' : '天行电力 · 原题号 ' + q.source_id;
        $('feedback').hidden = !memorize && !answer;
        if (memorize) {
            $('feedback').dataset.correct = 'true';
            $('feedback').textContent = '正确答案：' + q.answer.join('、') +
                (q.type === 'judge' ? '（' + q.options.find(function (option) { return option.key === q.answer[0]; }).text + '）' : '');
        } else if (answer) {
            $('feedback').dataset.correct = answer.correct;
            $('feedback').textContent = (answer.correct ? '回答正确 ✓' : '回答错误 · 已记入错题本') +
                '\n正确答案：' + q.answer.join('、');
        }
        $('explanation').hidden = (!memorize && !answer) || (!q.explanation && !q.explanation_html);
        renderContent($('explanationContent'), q.explanation, q.explanation_html);
        $('previousQuestion').hidden = false;
        updateNavigationButtons();
        $('submitAnswer').hidden = memorize || Boolean(answer) || q.type !== 'multiple';
        $('nextQuestion').hidden = false;
        $('nextQuestion').classList.toggle('button--primary', memorize || Boolean(answer));
        $('nextQuestion').classList.toggle('button--quiet', !memorize && !answer);
        $('nextQuestion').textContent = cursor + 1 === round.queue.length ?
            (memorize ? '完成背题' : (answeredCount(round) === round.queue.length ? '查看本轮结果' : '返回未做题')) : '下一题 →';
        updateActionBarSpace();
        if (focus) {
            const question = $('questionText');
            question.focus({ preventScroll: true });
            const bounds = question.getBoundingClientRect();
            const readingTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
            // Keep a visible question in place; only bring an off-screen stem below the header.
            const readingBottom = $('questionActions').getBoundingClientRect().top;
            if (bounds.top < readingTop || bounds.bottom > readingBottom) {
                window.scrollBy({ top: bounds.top - readingTop, behavior: 'instant' });
            }
        }
    }

    function showQuestionMap() {
        const round = memorize ? memoryRound : state.round;
        if (!round) return;
        const cursor = memorize ? memoryPosition : position;
        const current = round.queue[cursor];
        const counts = { unanswered: 0, correct: 0, wrong: 0 };
        const names = { unanswered: '未做', correct: '正确', wrong: '错误' };
        const grid = $('questionMapGrid');
        const fragment = document.createDocumentFragment();
        round.queue.map(function (id, index) { return { id: id, index: index }; })
            .sort(function (a, b) { return Number(a.id) - Number(b.id); }).forEach(function (entry) {
            const id = entry.id;
            const status = Object.hasOwn(state.latest, id) ? (state.latest[id] ? 'correct' : 'wrong') : 'unanswered';
            counts[status] += 1;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'question-number';
            item.dataset.status = status;
            item.dataset.position = entry.index;
            const marker = document.createElement('span');
            marker.setAttribute('aria-hidden', 'true');
            marker.textContent = { unanswered: '○', correct: '✓', wrong: '×' }[status];
            item.append(marker, document.createTextNode(id));
            const label = '第 ' + id + ' 题，' + names[status] + (id === current ? '，当前题' : '');
            item.setAttribute('aria-label', label);
            item.title = label;
            if (id === current) item.setAttribute('aria-current', 'true');
            const listItem = document.createElement('div');
            listItem.setAttribute('role', 'listitem');
            listItem.append(item);
            fragment.append(listItem);
        });
        grid.replaceChildren(fragment);
        $('mapUnanswered').textContent = counts.unanswered;
        $('mapCorrect').textContent = counts.correct;
        $('mapWrong').textContent = counts.wrong;
        $('questionMapDialog').showModal();
        const currentItem = grid.querySelector('[aria-current="true"]');
        if (currentItem) currentItem.scrollIntoView({ block: 'nearest' });
    }

    function startMemory(mode) {
        const queue = scoped().filter(function (q) {
            return (mode !== 'wrong' || state.latest[q.id] === false) && (mode !== 'favorites' || isFavorite(q.id));
        })
            .map(function (q) { return q.id; });
        if (!queue.length) {
            notify(mode === 'wrong' ? '当前范围没有错题' : (mode === 'favorites' ? '当前范围没有收藏题目' : '当前筛选范围没有题目'));
            return false;
        }
        if (mode === 'random') {
            for (let i = queue.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                const item = queue[i];
                queue[i] = queue[j];
                queue[j] = item;
            }
        }
        memoryRound = { queue: queue, mode: mode, kind: $('kind').value, chapter: $('chapter').value, subject: $('subject').value };
        memoryPosition = 0;
        return true;
    }

    function setMemorize(enabled) {
        memorize = enabled;
        $('memorizeMode').checked = enabled;
        document.querySelector('[data-start="ordered"]').textContent = enabled ? '顺序背题' : '顺序刷题';
        document.querySelector('[data-start="random"]').textContent = enabled ? '打乱背题' : '打乱刷题';
        $('wrongStart').textContent = enabled ? '只背错题' : '只刷错题';
        renderDashboard();
        renderQuestion(false);
    }

    function confirmAction(text) {
        return new Promise(function (resolve) {
            const dialog = $('confirmDialog');
            $('confirmText').textContent = text;
            dialog.returnValue = '';
            $('cancelConfirm').onclick = function () { dialog.close('cancel'); };
            $('acceptConfirm').onclick = function () { dialog.close('confirm'); };
            dialog.addEventListener('close', function () { resolve(dialog.returnValue === 'confirm'); }, { once: true });
            dialog.showModal();
        });
    }

    async function load() {
        const data = await api('state');
        const cached = bankCache.get(bankId);
        const loaded = data.bank || (cached && cached.bank);
        if (!loaded || loaded.id !== bankId) throw new Error('题库加载失败，请刷新重试');
        bankCache.set(bankId, { bank: loaded, version: data.bank_version });
        bank = loaded;
        bankId = bank.id;
        localStorage.setItem(bankKey, bankId);
        state = data.state;
        questions = new Map(bank.questions.map(function (q) { return [q.id, q]; }));
        $('bankSelect').replaceChildren();
        data.banks.forEach(function (item) {
            $('bankSelect').append(new Option(item.name + '（' + item.count + ' 题）', item.id));
        });
        $('bankSelect').value = bankId;
        $('subject').replaceChildren(new Option('全部科目', ''));
        const subjects = Array.from(new Set(bank.questions.map(function (q) { return q.subject; }).filter(Boolean)));
        subjects.forEach(function (subject) { $('subject').append(new Option(subject, subject)); });
        $('subjectFilter').hidden = !subjects.length;
        $('subject').value = state.round ? state.round.subject : '';
        populateChapters(state.round ? state.round.chapter : '');
        $('bankDescription').textContent = bank.name + ' · 进度、错题和记录单独保存，切换题库会自动保留。';
        $('setupBankName').textContent = bank.name;
        $('bankSource').textContent = bank.source || '题库按所提供 PDF 的题目与答案收录。';
        $('loginPanel').hidden = true;
        $('connectionPanel').hidden = true;
        $('workspace').hidden = false;
        $('logout').hidden = false;
        $('accountName').textContent = data.username;
        $('kind').value = 'all';
        position = 0;
        if (state.round) {
            $('kind').value = state.round.kind;
            $('chapter').value = state.round.chapter;
            position = Number.isInteger(state.round.position) ? state.round.position : firstUnanswered(state.round);
        }
        memoryRound = null;
        setMemorize(false);
        if (state.round && window.matchMedia('(max-width: 760px)').matches) $('studySetup').open = false;
    }

    async function connect() {
        $('connectionPanel').hidden = true;
        try {
            const health = await api('health');
            if (!health.ok) throw new Error('服务未就绪');
        } catch (error) {
            $('loginPanel').hidden = true;
            $('connectionPanel').hidden = false;
            return;
        }
        if (token) await load();
        else $('loginPanel').hidden = false;
    }

    $('loginForm').addEventListener('submit', function (event) {
        event.preventDefault();
        const route = event.submitter && event.submitter.id === 'register' ? 'register' : 'login';
        run(async function () {
            const result = await api(route, { username: $('username').value, password: $('password').value });
            token = result.token;
            localStorage.setItem(tokenKey, token);
            $('password').value = '';
            await load();
        });
    });
    document.querySelectorAll('[data-start]').forEach(function (button) {
        button.addEventListener('click', async function () {
            if (busy) return;
            if (memorize) {
                notify('');
                if (startMemory(button.dataset.start)) renderQuestion(true);
                return;
            }
            if (state.round && answeredCount(state.round) < state.round.queue.length &&
                !await confirmAction('开始新一轮会替换未完成的练习进度。已提交的答题记录和错题会保留。继续吗？')) return;
            run(async function () {
                const result = await api('start', { mode: button.dataset.start, kind: $('kind').value, chapter: $('chapter').value, subject: $('subject').value });
                state = result.state;
                position = 0;
                renderDashboard();
                renderQuestion(true);
            });
        });
    });
    $('favoriteQuestion').addEventListener('click', function () {
        if (busy) return;
        const round = memorize ? memoryRound : state.round;
        const cursor = memorize ? memoryPosition : position;
        if (!round || cursor >= round.queue.length) return;
        const id = round.queue[cursor];
        const favorite = !isFavorite(id);
        run(async function () {
            const result = await api('favorite', { question_id: id, favorite: favorite });
            state.favorites = result.favorites;
            renderDashboard();
            updateFavoriteButton();
        });
    });
    $('submitAnswer').addEventListener('click', function () {
        if (busy || memorize || !state || !state.round || state.round.answers[position]) return;
        const selected = Array.from(document.querySelectorAll('#options input:checked')).map(function (input) { return input.value; });
        if (!selected.length) {
            $('answerHint').textContent = '请先选择答案，再提交。';
            $('answerHint').hidden = false;
            document.querySelector('#options input').focus();
            return;
        }
        run(async function () {
            let result;
            try {
                result = await api('answer', { round_id: state.round.id, position: position, selected: selected });
            } catch (error) {
                // Keep the selection and allow retrying the same answer after a failed request.
                $('submitAnswer').hidden = false;
                updateActionBarSpace();
                throw error;
            }
            state = result.state;
            renderDashboard();
            renderQuestion(false);
        });
    });
    $('nextQuestion').addEventListener('click', function () {
        const round = memorize ? memoryRound : state.round;
        const cursor = memorize ? memoryPosition : position;
        let target = cursor + 1;
        if (!memorize && target === round.queue.length && answeredCount(round) < round.queue.length) {
            target = firstUnanswered(round);
            if (target === cursor) { notify('本题还未作答，提交后即可查看本轮结果。'); return; }
        }
        navigateTo(target);
    });
    $('previousQuestion').addEventListener('click', function () {
        const cursor = memorize ? memoryPosition : position;
        if (cursor > 0) navigateTo(cursor - 1);
    });

    // Touch navigation delegates to the existing buttons, preserving all round/boundary rules.
    const swipeSurface = $('practice');
    let suppressTapUntil = 0;
    function canSwipe() {
        return !busy && state && currentView === 'practice' && !swipeSurface.hidden &&
            window.matchMedia('(max-width: 760px)').matches && !document.querySelector('dialog[open]') &&
            (!window.visualViewport || window.visualViewport.scale <= 1.01) &&
            (!window.getSelection() || window.getSelection().isCollapsed);
    }
    swipeSurface.addEventListener('touchstart', function (event) {
        swipeStart = null;
        if (!canSwipe() || event.touches.length !== 1 ||
            event.target.closest('.question-actions, button, input, select, textarea, a, img, table, pre, [contenteditable="true"]')) return;
        const touch = event.touches[0];
        // Leave the screen edges to the browser's back/forward gestures.
        if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
        swipeStart = { x: touch.clientX, y: touch.clientY, id: touch.identifier, time: performance.now() };
    }, { passive: true });
    swipeSurface.addEventListener('touchmove', function (event) {
        if (!swipeStart) return;
        if (!canSwipe() || event.touches.length !== 1) { swipeStart = null; return; }
        const touch = event.touches[0];
        const dx = Math.abs(touch.clientX - swipeStart.x);
        const dy = Math.abs(touch.clientY - swipeStart.y);
        if (dy > 12 && dy > dx) { swipeStart = null; return; }
        // Only claim a clear horizontal gesture; vertical scrolling and pinch zoom stay native.
        if (dx > 16 && dx > dy * 1.75 && event.cancelable) event.preventDefault();
    }, { passive: false });
    swipeSurface.addEventListener('touchcancel', function () { swipeStart = null; }, { passive: true });
    swipeSurface.addEventListener('touchend', function (event) {
        const start = swipeStart;
        swipeStart = null;
        if (!start || !canSwipe() || event.touches.length || performance.now() - start.time > 800) return;
        const touch = Array.from(event.changedTouches).find(function (item) { return item.identifier === start.id; });
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.75) return;
        if (event.cancelable) event.preventDefault();
        suppressTapUntil = performance.now() + 400;
        const round = memorize ? memoryRound : state.round;
        const cursor = memorize ? memoryPosition : position;
        if (!memorize && !round.answers[cursor] && document.querySelector('#options input:checked')) {
            $('answerHint').textContent = '已选择但尚未提交。请先提交答案，或使用翻题按钮跳过。';
            $('answerHint').hidden = false;
            return;
        }
        const button = dx < 0 ? $('nextQuestion') : $('previousQuestion');
        if (!button.disabled && !button.hidden) button.click();
    }, { passive: false });
    swipeSurface.addEventListener('click', function (event) {
        if (event.isTrusted && event.detail && event.target.closest('.answer-option') && performance.now() < suppressTapUntil) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);
    $('roundProgress').addEventListener('click', showQuestionMap);
    $('completionMap').addEventListener('click', showQuestionMap);
    $('questionMapGrid').addEventListener('click', function (event) {
        const button = event.target.closest('button[data-position]');
        if (button) navigateTo(Number(button.dataset.position));
    });
    $('closeQuestionMap').addEventListener('click', function () { $('questionMapDialog').close(); });
    $('repeatMemory').addEventListener('click', function () { memoryPosition = 0; renderQuestion(true); });
    $('memorizeMode').addEventListener('change', function () {
        if (busy) { $('memorizeMode').checked = memorize; return; }
        notify('');
        if ($('memorizeMode').checked) {
            const round = state.round;
            if (round && position < round.queue.length && round.kind === $('kind').value && round.chapter === $('chapter').value && (round.subject || '') === $('subject').value) {
                memoryRound = { queue: round.queue.slice(), mode: round.mode, kind: round.kind, chapter: round.chapter, subject: round.subject };
                memoryPosition = position;
            } else if (!startMemory('ordered')) {
                $('memorizeMode').checked = false;
                return;
            }
        }
        setMemorize($('memorizeMode').checked);
    });
    $('continue').addEventListener('click', function () { navigateTo(state.round.position); });
    function openSetup() {
        $('studySetup').open = true;
        $('kind').focus();
        $('kind').scrollIntoView({ block: 'center' });
    }
    $('backToFilters').addEventListener('click', openSetup);
    $('openSetup').addEventListener('click', openSetup);
    $('options').addEventListener('change', function () {
        if (busy || memorize || !state || !state.round || state.round.answers[position]) return;
        const count = document.querySelectorAll('#options input:checked').length;
        $('answerState').textContent = count ? '已选择 ' + count + ' 项 · 待提交' : '○ 未作答';
        $('answerState').dataset.state = count ? 'selected' : 'idle';
        $('answerHint').hidden = true;
        const q = questions.get(state.round.queue[position]);
        if (count && (q.type === 'single' || q.type === 'judge')) $('submitAnswer').click();
    });
    document.querySelectorAll('[data-view]').forEach(function (button) {
        button.addEventListener('click', function () { if (!busy) showView(button.dataset.view); });
    });
    function changeWrongPage(step) {
        wrongPage += step;
        renderWrongList();
        $('wrongView').scrollIntoView({ block: 'start' });
        $('wrongTitle').focus({ preventScroll: true });
    }
    $('wrongPrevious').addEventListener('click', function () { changeWrongPage(-1); });
    $('wrongNext').addEventListener('click', function () { changeWrongPage(1); });
    function scopeChanged() { wrongPage = 0; renderScope(); }
    $('kind').addEventListener('change', scopeChanged);
    $('chapter').addEventListener('change', scopeChanged);
    $('subject').addEventListener('change', function () { populateChapters(''); scopeChanged(); });
    $('bankSelect').addEventListener('change', function () {
        if (busy) { $('bankSelect').value = bankId; return; }
        const previous = bankId;
        bankId = $('bankSelect').value;
        run(async function () {
            try { await load(); }
            catch (error) { bankId = previous; $('bankSelect').value = previous; throw error; }
        });
    });
    $('reset').addEventListener('click', async function () {
        if (busy || !await confirmAction('将清空你在“' + bank.name + '”中的答题记录、错题和练习进度，所有章节都会重新开始。收藏会保留，其他题库和其他账号的记录也会保留。此操作不能撤销。')) return;
        run(async function () {
            const result = await api('reset', { confirm: '清空我的记录' });
            state = result.state;
            position = 0;
            memoryRound = null;
            setMemorize(false);
            notify('当前题库的刷题记录已清空，可以重新开始。');
        });
    });
    $('logout').addEventListener('click', function () {
        run(async function () {
            await api('logout', {});
            token = '';
            localStorage.removeItem(tokenKey);
            memoryRound = null;
            setMemorize(false);
            state = null;
            $('todaySummary').hidden = true;
            showView('practice');
            $('studySetup').open = true;
            $('workspace').hidden = true;
            $('loginPanel').hidden = false;
            $('logout').hidden = true;
            $('accountName').textContent = '';
        });
    });
    $('reconnect').addEventListener('click', function () { run(connect); });
    new ResizeObserver(updateActionBarSpace).observe($('questionActions'));
    run(connect);
}());
