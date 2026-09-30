import { loadOdometerDetector } from "../vision/owlvit.ts";
import { loadOcr } from "../vision/paddle-ocr.ts";
import PipelineImage from "./pipeline-image.ts";
import { confidenceThresholds, convertToMetric, kilometresPerMile } from "../config/constants.ts";
import type { confidenceLevel, odometerReading, ocrReading, ocrResult, textBox } from "../types/types.ts";

export const loadOdometerReader = async (): Promise<(imageBuffer: Buffer) => Promise<odometerReading | null>> => {
    const detectOdometer = await loadOdometerDetector();
    const recognizeText = await loadOcr();

    return async (imageBuffer: Buffer): Promise<odometerReading | null> => {
        const image = await PipelineImage.fromBuffer(imageBuffer);

        console.log('Locating odometer with OWL-ViT...');
        const odometerImage = await image.cropForDetection(await detectOdometer(image.toBuffer()));

        try {
            await preprocessForOcr(odometerImage);

            console.log('Performing OCR on processed image...');
            const ocrResult = await recognizeText(odometerImage.toBuffer());
            const ocrReading = extractOdometerReading(ocrResult);
            if (!ocrReading) {
                return null;
            }

            return {
                reading: convertToMetric ? ocrReading.value * kilometresPerMile : ocrReading.value,
                unit: convertToMetric ? 'kilometres' : 'miles',
                confidence: getConfidenceLevel(ocrReading.confidence),
            };
        } finally {
            odometerImage.dispose();
        }
    };
};

const preprocessForOcr = async (image: PipelineImage): Promise<void> => {
    console.log('Pre-processing image for OCR...');
    await image.grayscale();
    await image.equalize();
    const darkBackground = await image.isDarkBackground();
    await image.blur();
    if (darkBackground) {
        await image.invert();
    }
};

export const extractOdometerReading = (result: ocrResult): ocrReading | null => {
    let best: ocrReading | null = null;
    for (const box of joinSplitNumbers(result.lines.flat())) {
        const value = Number(box.text.replace(/[^0-9.]/g, '')) || 0;
        if (value > 0 && (!best || value > best.value)) {
            best = { value, confidence: box.confidence };
        }
    }
    return best;
};

// A seven-segment "1" only uses the right two segments, so it looks like a gap.
// e.g. "133610" comes back as "1336" and "10".
const joinSplitNumbers = (boxes: textBox[]): textBox[] => {
    const sorted = [...boxes].sort((a, b) => a.box.x - b.box.x);
    const joined: textBox[] = [];

    for (const box of sorted) {
        const index = joined.findIndex((previous) => isSameRow(previous, box) && gapBetween(previous, box) < Math.min(previous.box.height, box.box.height));
        const previous = joined[index];
        if (!previous) {
            joined.push(box);
            continue;
        }

        const overlap = Math.min(rightEdge(previous), rightEdge(box)) - box.box.x;
        if (overlap > Math.min(previous.box.width, box.box.width) / 2) {
            joined[index] = previous.box.width >= box.box.width ? previous : box;
        } else {
            joined[index] = joinBoxes(previous, box);
        }
    }

    return joined;
};

const joinBoxes = (left: textBox, right: textBox): textBox => {
    const top = Math.min(left.box.y, right.box.y);
    const bottom = Math.max(left.box.y + left.box.height, right.box.y + right.box.height);
    return {
        text: left.text + right.text,
        confidence: Math.min(left.confidence, right.confidence),
        box: { x: left.box.x, y: top, width: Math.max(rightEdge(left), rightEdge(right)) - left.box.x, height: bottom - top },
    };
};

const isSameRow = (a: textBox, b: textBox): boolean => {
    const overlap = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
    return overlap >= Math.min(a.box.height, b.box.height) * 0.7;
};

const gapBetween = (left: textBox, right: textBox): number => right.box.x - rightEdge(left);

const rightEdge = (textBox: textBox): number => textBox.box.x + textBox.box.width;

export const getConfidenceLevel = (score: number): confidenceLevel => {
    if (score >= confidenceThresholds.high) {
        return 'high';
    }
    if (score >= confidenceThresholds.medium) {
        return 'medium';
    }
    return 'low';
};
