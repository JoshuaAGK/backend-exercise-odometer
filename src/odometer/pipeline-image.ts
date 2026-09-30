import sharp from "sharp";
import type { Region } from "sharp";
import type { detection, imageMetadata } from "../types/types.ts";
import type { ImageProcessor } from "ppu-ocv";
import PpuOcv from "../vision/ppu-ocv.ts";
import { blurSettings, cropSettings, darkBackgroundMeanThreshold, errorMessages } from "../config/constants.ts";

export class InvalidImageError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

class PipelineImage {
    private buffer: Buffer;
    private metadata: imageMetadata;
    private ocv: PpuOcv | undefined;

    constructor(buffer: Buffer, metadata: imageMetadata) {
        this.buffer = buffer;
        this.metadata = metadata;
    }

    static async fromBuffer(imageBuffer: Buffer): Promise<PipelineImage> {
        const { format } = await sharp(imageBuffer).metadata().catch(throwInvalidImage);
        if (format !== 'jpeg' && format !== 'png') {
            throw new InvalidImageError('UNSUPPORTED_FILE_TYPE', errorMessages.unsupportedFileType);
        }

        const normalizedBuffer = await sharp(imageBuffer).rotate().toBuffer().catch(throwInvalidImage);
        return new PipelineImage(normalizedBuffer, await sharp(normalizedBuffer).metadata());
    }

    toBuffer(): Buffer {
        return this.buffer;
    }

    async cropForDetection(detection: detection | null): Promise<PipelineImage> {
        if (!detection) {
            console.log('Unable to locate odometer region in image. Proceeding with full image.');
            return this;
        }

        console.log('Located odometer region in image.');
        const croppedBuffer = await sharp(this.buffer).extract(this.getCropForDetection(detection)).png().toBuffer();
        return new PipelineImage(croppedBuffer, await sharp(croppedBuffer).metadata());
    }

    async isDarkBackground(): Promise<boolean> {
        const stats = await sharp(this.buffer).stats();
        return (stats.channels[0]?.mean ?? 0) < darkBackgroundMeanThreshold;
    }

    private getCropForDetection({ label, box }: detection): Region {
        const boxWidth = box.xmax - box.xmin;
        const boxHeight = box.ymax - box.ymin;

        // Speedometer dials usually contain more than just the odometer, which
        // tends to be at the lower-middle of the box, so crop down to that bit
        if (label.includes(cropSettings.speedometerLabelKeyword) || boxWidth > cropSettings.speedometerMinBoxWidth) {
            const region = cropSettings.speedometerRegion;
            return {
                left: Math.floor(box.xmin + boxWidth * region.left),
                top: Math.floor(box.ymin + boxHeight * region.top),
                width: Math.floor(boxWidth * region.width),
                height: Math.floor(boxHeight * region.height),
            };
        }

        const padX = boxWidth * cropSettings.paddingRatio;
        const padY = boxHeight * cropSettings.paddingRatio;
        const left = Math.max(0, Math.floor(box.xmin - padX));
        const top = Math.max(0, Math.floor(box.ymin - padY));
        const right = Math.min(this.metadata.width, Math.ceil(box.xmax + padX));
        const bottom = Math.min(this.metadata.height, Math.ceil(box.ymax + padY));
        const width = right - left;
        const height = bottom - top;

        return { left, top, width, height };
    }

    async grayscale(): Promise<void> {
        await this.applyOcv((processor) => processor.grayscale());
    }

    async equalize(): Promise<void> {
        await this.applyOcv((processor) => processor.equalize());
    }

    async invert(): Promise<void> {
        await this.applyOcv((processor) => processor.invert());
    }

    async blur(): Promise<void> {
        const sharpness = await measureSharpness(this.buffer);
        const kernelSize = getBlurKernelSize(sharpness, this.metadata);
        await this.applyOcv((processor) => processor.blur({ size: [kernelSize, kernelSize] }));
    }

    dispose(): void {
        this.ocv?.destroy();
    }

    // The OpenCV processor is created once and reused, so each operation stacks on the last
    private async applyOcv(operation: (processor: ImageProcessor) => void): Promise<void> {
        if (!this.ocv) {
            this.ocv = await PpuOcv.create(this.buffer);
        }

        const result = this.ocv.apply(operation);
        if (result) {
            this.buffer = result;
        }
    }
}

export default PipelineImage;

const throwInvalidImage = (): never => {
    throw new InvalidImageError('INVALID_IMAGE', errorMessages.invalidImage);
}

export const getBlurKernelSize = (sharpness: number, { width, height }: imageMetadata): number => {
    if (sharpness <= blurSettings.sharpnessThreshold) {
        return blurSettings.defaultKernelSize;
    }

    let kernelSize = Math.round(Math.min(width, height) * blurSettings.kernelSizeRatio);
    if (kernelSize % 2 === 0) {
        kernelSize += 1;
    }
    return Math.max(blurSettings.minKernelSize, Math.min(blurSettings.maxKernelSize, kernelSize));
}

// Fully borrowed from StackOverflow but very effective! :)
async function measureSharpness(imageBuffer: Buffer): Promise<number> {
  const { data, info } = await sharp(imageBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      const center = data[idx];
      const left   = data[idx - 1];
      const right  = data[idx + 1];
      const top    = data[idx - width];
      const bottom = data[idx + width];

      const lapValue = top! + left! + right! + bottom! - (4 * center!);

      sum += lapValue;
      sumSq += lapValue * lapValue;
      count++;
    }
  }

  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}