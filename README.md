# Odometer Reading Service

A small Express + TypeScript service that reads the mileage from a photo of a car odometer.

## Setup

Requires Node.js 23.6 or newer (the TypeScript is run directly by Node, no build step). Developed on Node 24.21.0.

```
npm install
npm run start
```

No accounts or API keys are needed, since everything runs locally.
The first run downloads the OWL-ViT and PaddleOCR models, so it takes a little longer to start.

## Usage

`POST /odometer/reading` accepts a JPEG or PNG as either:

**multipart/form-data (via Postman):**

1. Set the method to `POST` and enter `http://localhost:3000/odometer/reading`.
2. Open **Body** and select **form-data**.
3. Add a row with key `image`, change its type from **Text** to **File**, and choose a JPEG or PNG.
4. Select **Send**. Postman sets the multipart content type for you.

**Base64 in JSON:**
```
{
    "image": "data:image/jpeg;base64,/..."
}
```

**Success response:**

```json
{
  "reading": 161967,
  "unit": "miles",
  "confidence": "medium"
}
```

**Error responses:**

| Case | Status | `error` |
|---|---|---|
| No image | 400 | `MISSING_IMAGE` |
| Not a JPEG/PNG | 400 | `UNSUPPORTED_FILE_TYPE` |
| Corrupt image | 400 | `INVALID_IMAGE` |
| Malformed body / wrong upload field | 400 | `INVALID_REQUEST` |
| Image over 50MB | 413 | `IMAGE_TOO_LARGE` |
| No reading found | 422 | `UNREADABLE_IMAGE` |
| Anything else | 500 | `INTERNAL_ERROR` |

## Tests

```
npm run test
```

There are two test files:

- `tests/logic.test.ts` tests the pure application logic. It runs in about a second.
- `tests/odometer.test.ts` starts the server and POSTs each of the sample images, and tests a few failure cases. It loads the OWL-ViT and PaddleOCR models, so the first run may download them and takes a while.


## How it works

1. Locate the odometer with OWL-ViT (zero-shot object detection) and crop to it. If nothing is found, the whole image is used.
2. Pre-process the image for OCR with OpenCV (via ppu-ocv): grayscale, boost contrast, blur, and invert on dark backgrounds.
3. OCR with PaddleOCR, then take the largest number.

Code layout:

- `server/` handles server stuff
- `odometer/` holds the reading workflow and the image being processed
- `vision/` wraps the model libraries
- `config/` holds constant values

## Known limitations

- OWL-ViT only finds the odometer in 3 of the 7 sample images. The rest fallback to OCR on the full image, which works.
- "Largest number wins" could fail if the odometer wasn't the largest number in the photo.

## Things I've skipped because it's just a demo

- No authorization / JWT
- Linting
- JSDoc
- console.logs are added for convenience of testers, I would use an actual observability solution in production


This application was developed with the assistance of AI. A transcript of my conversation with ChatGPT has been attached in ai-transcript.txt.