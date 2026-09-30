export type detection = {
    score: number;
    label: string;
    box: { xmin: number; xmax: number; ymin: number; ymax: number };
};

export type imageMetadata = {
    width: number;
    height: number;
};

export type textBox = {
    text: string;
    confidence: number;
    box: { x: number; y: number; width: number; height: number };
};

export type ocrResult = {
    lines: Array<Array<textBox>>;
};

export type ocrReading = {
    value: number;
    confidence: number;
};

export type confidenceLevel = 'high' | 'medium' | 'low';

export type odometerReading = {
    reading: number;
    unit: 'kilometres' | 'miles';
    confidence: confidenceLevel;
};
