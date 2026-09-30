import { CanvasProcessor, ImageProcessor } from "ppu-ocv";

class PpuOcv {
    private processor: ImageProcessor;

    constructor(processor: ImageProcessor) {
        this.processor = processor;
    }

    static async create(image: Buffer): Promise<PpuOcv> {
        const canvas = await CanvasProcessor.prepareCanvas(Uint8Array.from(image).buffer);
        await ImageProcessor.initRuntime();

        return new PpuOcv(new ImageProcessor(canvas));
    }

    apply(operation: (processor: ImageProcessor) => void): Buffer | undefined {
        operation(this.processor);
        return this.processor.toCanvas().toBuffer?.('image/png');
    }

    // OpenCV is not garbage collected
    destroy(): void {
        this.processor.destroy();
    }
}

export default PpuOcv;
