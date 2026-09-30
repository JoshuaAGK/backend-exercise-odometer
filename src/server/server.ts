import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import { loadOdometerReader } from "../odometer/odometer-reader.ts";
import { InvalidImageError } from "../odometer/pipeline-image.ts";
import { base64DataUrlPrefix, errorMessages, maxUploadBytes } from "../config/constants.ts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes } });

const initServer = async (): Promise<Express> => {
    const readOdometer = await loadOdometerReader();
    const app = express();

    app.use(express.json({ limit: maxUploadBytes }));

    app.post('/odometer/reading', upload.single('image'), async (request: Request, response: Response): Promise<void> => {
        try {
            const odometerReading = await readOdometer(getImage(request));

            if (odometerReading) {
                response.status(200).json(odometerReading);
                return;
            }

            response.status(422).json({
                'error': 'UNREADABLE_IMAGE',
                'message': errorMessages.unreadableImage
            });
        } catch (error) {
            sendError(response, error);
        }
    });

    app.use((error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
        sendError(response, error);
    });

    return app;
}

const getImage = (request: Request): Buffer => {
    if (request.file) {
        return request.file.buffer;
    }

    const image = request.body?.image;
    if (typeof image === 'string' && image.length > 0) {
        return Buffer.from(image.replace(base64DataUrlPrefix, ""), "base64");
    }

    throw new InvalidImageError('MISSING_IMAGE', errorMessages.missingImage);
}

const sendError = (response: Response, error: unknown): void => {
    if (error instanceof InvalidImageError) {
        response.status(400).json({ error: error.code, message: error.message });
        return;
    }

    if (isTooLarge(error)) {
        response.status(413).json({ error: 'IMAGE_TOO_LARGE', message: errorMessages.imageTooLarge });
        return;
    }

    if (error instanceof multer.MulterError || error instanceof SyntaxError) {
        response.status(400).json({ error: 'INVALID_REQUEST', message: errorMessages.invalidRequest });
        return;
    }

    console.error(error);
    response.status(500).json({ error: 'INTERNAL_ERROR', message: errorMessages.internalError });
}

const isTooLarge = (error: unknown): boolean => {
    if (error instanceof multer.MulterError) {
        return error.code === 'LIMIT_FILE_SIZE';
    }
    return typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
}

export default initServer;
