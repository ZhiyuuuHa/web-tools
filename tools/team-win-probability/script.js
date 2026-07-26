(function () {
    'use strict';

    const TEAM_SIZE = 5;
    const DEFAULT_RED_NAMES = ['一号', '二号', '三号', '四号', '五号'];
    const DEFAULT_BLUE_NAMES = ['a', 'b', 'c', 'd', 'e'];
    const DEFAULT_PROBABILITY = 50;

    const matrixBody = document.getElementById('matrixBody');
    const blueHeaders = document.getElementById('blueHeaders');
    const resultPanel = document.getElementById('resultPanel');
    const resultValue = document.getElementById('resultValue');
    const blueResultValue = document.getElementById('blueResultValue');
    const expectedWinsValue = document.getElementById('expectedWinsValue');
    const matchupCountValue = document.getElementById('matchupCountValue');
    const probabilityRangeValue = document.getElementById('probabilityRangeValue');
    const errorMessage = document.getElementById('errorMessage');
    const calculateButton = document.getElementById('calculateButton');
    const equalButton = document.getElementById('equalButton');

    function createNameInput(team, index, value, label) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'member-name-input';
        input.dataset.team = team;
        input.dataset.index = String(index);
        input.value = value;
        input.maxLength = 12;
        input.setAttribute('aria-label', label);
        return input;
    }

    function buildMatrix() {
        DEFAULT_BLUE_NAMES.forEach(function (name, index) {
            const header = document.createElement('th');
            header.scope = 'col';
            header.appendChild(createNameInput('blue', index, name, '蓝队第 ' + (index + 1) + ' 名成员名称'));
            blueHeaders.appendChild(header);
        });

        for (let redIndex = 0; redIndex < TEAM_SIZE; redIndex += 1) {
            const row = document.createElement('tr');
            const header = document.createElement('th');
            header.scope = 'row';
            header.appendChild(
                createNameInput('red', redIndex, DEFAULT_RED_NAMES[redIndex], '红队第 ' + (redIndex + 1) + ' 名成员名称')
            );
            row.appendChild(header);

            for (let blueIndex = 0; blueIndex < TEAM_SIZE; blueIndex += 1) {
                const cell = document.createElement('td');
                const field = document.createElement('label');
                field.className = 'probability-field';

                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'probability-input';
                input.min = '0';
                input.max = '100';
                input.step = '0.1';
                input.inputMode = 'decimal';
                input.dataset.red = String(redIndex);
                input.dataset.blue = String(blueIndex);
                input.value = String(DEFAULT_PROBABILITY);
                input.setAttribute(
                    'aria-label',
                    DEFAULT_RED_NAMES[redIndex] + '战胜蓝队' + DEFAULT_BLUE_NAMES[blueIndex] + '的胜率（百分比）'
                );

                const suffix = document.createElement('span');
                suffix.textContent = '%';

                field.appendChild(input);
                field.appendChild(suffix);
                cell.appendChild(field);
                row.appendChild(cell);
            }

            matrixBody.appendChild(row);
        }
    }

    function updateAccessibleLabels() {
        const redNames = getMemberNames('red');
        const blueNames = getMemberNames('blue');

        document.querySelectorAll('.probability-input').forEach(function (input) {
            const redIndex = Number(input.dataset.red);
            const blueIndex = Number(input.dataset.blue);
            input.setAttribute(
                'aria-label',
                redNames[redIndex] + '战胜' + blueNames[blueIndex] + '的胜率（百分比）'
            );
        });
    }

    function getMemberNames(team) {
        return Array.from(document.querySelectorAll('.member-name-input[data-team="' + team + '"]')).map(function (input, index) {
            return input.value.trim() || (team === 'red' ? '红队成员' : '蓝队成员') + (index + 1);
        });
    }

    function readMatrix() {
        const matrix = Array.from({ length: TEAM_SIZE }, function () {
            return new Array(TEAM_SIZE);
        });
        let firstInvalidInput = null;

        document.querySelectorAll('.probability-input').forEach(function (input) {
            const value = Number(input.value);
            const isValid = input.value.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100;
            input.classList.toggle('invalid', !isValid);

            if (!isValid && !firstInvalidInput) firstInvalidInput = input;
            if (isValid) matrix[Number(input.dataset.red)][Number(input.dataset.blue)] = value / 100;
        });

        if (firstInvalidInput) {
            firstInvalidInput.focus();
            throw new RangeError('请检查标红的输入框，胜率必须是 0 到 100 之间的数字。');
        }

        return matrix;
    }

    function formatPercent(probability) {
        return (probability * 100).toFixed(4) + '%';
    }

    function calculate() {
        try {
            const matrix = readMatrix();
            const result = window.TeamWinCalculator.calculateTeamWinProbability(matrix);

            resultValue.textContent = formatPercent(result.winProbability);
            blueResultValue.textContent = formatPercent(1 - result.winProbability);
            expectedWinsValue.textContent = result.expectedWins.toFixed(3) + ' 局';
            matchupCountValue.textContent = result.matchupCount + ' 种';
            probabilityRangeValue.textContent =
                formatPercent(result.minMatchupProbability) + ' ～ ' + formatPercent(result.maxMatchupProbability);
            errorMessage.textContent = '';
            resultPanel.classList.remove('has-error');
        } catch (error) {
            errorMessage.textContent = error.message;
            resultPanel.classList.add('has-error');
        }
    }

    function fillMatrix(matrix) {
        document.querySelectorAll('.probability-input').forEach(function (input) {
            input.value = String(matrix[Number(input.dataset.red)][Number(input.dataset.blue)]);
            input.classList.remove('invalid');
        });
    }

    buildMatrix();

    calculateButton.addEventListener('click', calculate);
    equalButton.addEventListener('click', function () {
        fillMatrix(Array.from({ length: TEAM_SIZE }, function () {
            return new Array(TEAM_SIZE).fill(50);
        }));
        calculate();
    });
    document.querySelectorAll('.member-name-input').forEach(function (input) {
        input.addEventListener('input', updateAccessibleLabels);
    });
    document.querySelectorAll('.probability-input').forEach(function (input) {
        input.addEventListener('input', function () {
            input.classList.remove('invalid');
        });
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') calculate();
        });
    });

    calculate();
})();
