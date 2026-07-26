'use strict';

const assert = require('node:assert/strict');
const calculator = require('./calculator.js');

const exampleMatrix = [
    [0.5, 0.5, 0.3, 0.95, 1],
    [0.3, 0.3, 0.7, 0.6, 0.7],
    [0.8, 0.1, 0, 0.8, 0.6],
    [0.2, 0.5, 0.1, 0.4, 0.5],
    [0.7, 0, 0.2, 0.8, 0.9]
];

const exampleResult = calculator.calculateTeamWinProbability(exampleMatrix);
assert.equal(exampleResult.matchupCount, 120);
assert.ok(Math.abs(exampleResult.winProbability - 0.4901395) < 1e-12);
assert.ok(Math.abs(exampleResult.winDistribution.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
assert.ok(Math.abs(exampleResult.winDistribution.slice(3).reduce((sum, value) => sum + value, 0) - exampleResult.winProbability) < 1e-12);

const fairResult = calculator.calculateTeamWinProbability(
    Array.from({ length: 5 }, function () {
        return new Array(5).fill(0.5);
    })
);
assert.ok(Math.abs(fairResult.winProbability - 0.5) < 1e-12);
assert.ok(Math.abs(fairResult.expectedWins - 2.5) < 1e-12);
assert.deepEqual(
    fairResult.winDistribution.map((value) => Number(value.toFixed(6))),
    [0.03125, 0.15625, 0.3125, 0.3125, 0.15625, 0.03125]
);

const certainWinResult = calculator.calculateTeamWinProbability(
    Array.from({ length: 5 }, function () {
        return new Array(5).fill(1);
    })
);
assert.equal(certainWinResult.winProbability, 1);
assert.deepEqual(certainWinResult.winDistribution, [0, 0, 0, 0, 0, 1]);

assert.throws(function () {
    calculator.calculateTeamWinProbability([[1, 0], [0, 1.1]]);
}, RangeError);

console.log('All team win probability tests passed.');
