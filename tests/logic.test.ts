import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOdometerReading, getConfidenceLevel } from '../src/odometer/odometer-reader.ts';
import { getBlurKernelSize } from '../src/odometer/pipeline-image.ts';

const box = (text: string, confidence: number, x = 0, width = 100, y = 0, height = 50) =>
    ({ text, confidence, box: { x, y, width, height } });

test('extractOdometerReading takes the value and confidence from the same box', () => {
    const result = extractOdometerReading({
        lines: [
            [box('111 MILES TO E', 0.88, 145, 765, 821, 125)],
            [box('6', 0.78, 341, 57, 949, 61), box('62690.5 mi', 0.99, 344, 565, 921, 120)]
        ],
    });

    assert.deepEqual(result, { value: 62690.5, confidence: 0.99 });
});

test('extractOdometerReading does not join neighbouring boxes into one number', () => {
    const result = extractOdometerReading({
        lines: [
            [box('40', 1, 0, 40), box('100', 1, 150, 60), box('120', 1, 320, 60)],
            [box('ODO 205265', 0.87, 63, 207, 84, 40)]
        ]
    });

    assert.deepEqual(result, { value: 205265, confidence: 0.87 });
});

test('extractOdometerReading joins a number that OCR split in two', () => {
    const result = extractOdometerReading({
        lines: [
            [box('1336', 1, 344, 243, 383, 113)],
            [box('165', 0.99, 578, 181, 312, 108)],
            [box('10miles', 0.99, 547, 221, 385, 113)],
            [box('260', 1, 767, 122, 131, 67), box('160', 1, 864, 147, 162, 103)],
        ],
    });

    assert.deepEqual(result, { value: 133610, confidence: 0.99 });
});

test('extractOdometerReading returns null when there are no numbers', () => {
    assert.equal(extractOdometerReading({ lines: [] }), null);
    assert.equal(extractOdometerReading({ lines: [[box('BRAKE', 1), box('0', 1)]] }), null);
});

test('getConfidenceLevel maps a score to high, medium or low', () => {
    assert.equal(getConfidenceLevel(0.95), 'high');
    assert.equal(getConfidenceLevel(0.8), 'medium');
    assert.equal(getConfidenceLevel(0.3), 'low');
});

test('getBlurKernelSize scales with image size, stays odd, and is capped', () => {
    assert.equal(getBlurKernelSize(2000, { width: 400, height: 300 }), 9);
    assert.equal(getBlurKernelSize(2000, { width: 4000, height: 4000 }), 15);
});
