import { pipeline, RawImage } from '@huggingface/transformers';
import type { ZeroShotObjectDetectionPipeline } from '@huggingface/transformers';
import { DEFAULT_ODOMETER_LABELS, detectionThreshold, odometerDetectorModel } from '../config/constants.ts';
import type { detection } from '../types/types.ts';

export const loadOdometerDetector = async (): Promise<(image: Buffer) => Promise<detection | null>> => {
    let detector: ZeroShotObjectDetectionPipeline;
    try {
        detector = await pipeline('zero-shot-object-detection', odometerDetectorModel, { local_files_only: true });
    } catch {
        console.log(`Downloading Hugging Face model ${odometerDetectorModel} (approx 800MB)...`);
        detector = await pipeline('zero-shot-object-detection', odometerDetectorModel);
    }

    return async (image: Buffer): Promise<detection | null> => {
        const rawImage = await RawImage.read(new Blob([Uint8Array.from(image)]));
        const detections: detection[] = await detector(rawImage, DEFAULT_ODOMETER_LABELS, { threshold: detectionThreshold });

        let best: detection | null = null;
        for (const detection of detections) {
            if (!best || detection.score > best.score) {
                best = detection;
            }
        }
        return best;
    };
};
