import { PaddleOcrService, V6_MEDIUM_MODEL } from "ppu-paddle-ocr";
import type { ocrResult } from "../types/types.ts";

export const loadOcr = async (): Promise<(image: Buffer) => Promise<ocrResult>> => {
    const service = new PaddleOcrService({
        model: V6_MEDIUM_MODEL,
        recognition: {
            strategy: "per-box",
            charactersDictionary: [],
        },
    });
    await service.initialize();

    return (image: Buffer): Promise<ocrResult> => service.recognize(Uint8Array.from(image).buffer);
};
