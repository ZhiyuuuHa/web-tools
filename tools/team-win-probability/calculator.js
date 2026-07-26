(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.TeamWinCalculator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 返回数组中所有排列。五人队伍只有 120 种排列，可以直接精确枚举。
     * @param {number[]} values
     * @returns {number[][]}
     */
    function permutations(values) {
        if (values.length <= 1) return [values.slice()];

        const result = [];

        values.forEach(function (value, index) {
            const rest = values.slice(0, index).concat(values.slice(index + 1));
            permutations(rest).forEach(function (permutation) {
                result.push([value].concat(permutation));
            });
        });

        return result;
    }

    /**
     * 计算一组相互独立、但胜率可以不同的对局中，至少获胜 winsRequired 局的概率。
     * @param {number[]} gameProbabilities 0 到 1 之间的胜率
     * @param {number} winsRequired
     * @returns {number}
     */
    function probabilityOfAtLeastWins(gameProbabilities, winsRequired) {
        const distribution = new Array(gameProbabilities.length + 1).fill(0);
        distribution[0] = 1;

        gameProbabilities.forEach(function (probability, gameIndex) {
            for (let wins = gameIndex + 1; wins >= 0; wins -= 1) {
                const loseContribution = (distribution[wins] || 0) * (1 - probability);
                const winContribution = wins > 0 ? distribution[wins - 1] * probability : 0;
                distribution[wins] = loseContribution + winContribution;
            }
        });

        return distribution.slice(winsRequired).reduce(function (sum, value) {
            return sum + value;
        }, 0);
    }

    function validateMatrix(matrix) {
        if (!Array.isArray(matrix) || matrix.length === 0) {
            throw new TypeError('胜率矩阵不能为空');
        }

        const size = matrix.length;

        matrix.forEach(function (row, rowIndex) {
            if (!Array.isArray(row) || row.length !== size) {
                throw new TypeError('胜率矩阵必须是方阵');
            }

            row.forEach(function (value, columnIndex) {
                if (!Number.isFinite(value) || value < 0 || value > 1) {
                    throw new RangeError(
                        '第 ' + (rowIndex + 1) + ' 行第 ' + (columnIndex + 1) + ' 列的胜率必须在 0 到 1 之间'
                    );
                }
            });
        });
    }

    /**
     * 双方出战顺序都均匀随机时，蓝队相对红队形成的配对是 n! 种完美匹配之一。
     * 对每种匹配计算系列赛获胜概率再取平均，即为精确结果。
     *
     * @param {number[][]} matrix matrix[i][j] 为红队 i 战胜蓝队 j 的概率
     * @returns {{winProbability: number, expectedWins: number, matchupCount: number, minMatchupProbability: number, maxMatchupProbability: number}}
     */
    function calculateTeamWinProbability(matrix) {
        validateMatrix(matrix);

        const teamSize = matrix.length;
        const winsRequired = Math.floor(teamSize / 2) + 1;
        const blueOrders = permutations(Array.from({ length: teamSize }, function (_, index) {
            return index;
        }));

        let probabilitySum = 0;
        let expectedWinsSum = 0;
        let minMatchupProbability = 1;
        let maxMatchupProbability = 0;

        blueOrders.forEach(function (blueOrder) {
            const gameProbabilities = blueOrder.map(function (blueIndex, redIndex) {
                return matrix[redIndex][blueIndex];
            });
            const matchupProbability = probabilityOfAtLeastWins(gameProbabilities, winsRequired);

            probabilitySum += matchupProbability;
            expectedWinsSum += gameProbabilities.reduce(function (sum, probability) {
                return sum + probability;
            }, 0);
            minMatchupProbability = Math.min(minMatchupProbability, matchupProbability);
            maxMatchupProbability = Math.max(maxMatchupProbability, matchupProbability);
        });

        return {
            winProbability: probabilitySum / blueOrders.length,
            expectedWins: expectedWinsSum / blueOrders.length,
            matchupCount: blueOrders.length,
            minMatchupProbability: minMatchupProbability,
            maxMatchupProbability: maxMatchupProbability
        };
    }

    return {
        calculateTeamWinProbability: calculateTeamWinProbability,
        probabilityOfAtLeastWins: probabilityOfAtLeastWins,
        validateMatrix: validateMatrix
    };
});
