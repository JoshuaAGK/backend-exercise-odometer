import { writeFile } from 'node:fs/promises';
import { pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import { CanvasProcessor, ImageProcessor } from 'ppu-ocv';
import { PaddleOcrService, V6_MEDIUM_MODEL } from 'ppu-paddle-ocr';

/**
 * Calculates the Laplacian Variance of an image buffer to measure sharpness/focus.
 * Lower scores (<100) indicate blurry/noisy images; higher scores (>300) indicate crisp focus.
 */
async function measureSharpness(imageBuffer) {
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

      // 3x3 Laplacian convolution kernel
      const center = data[idx];
      const left   = data[idx - 1];
      const right  = data[idx + 1];
      const top    = data[idx - width];
      const bottom = data[idx + width];

      const lapValue = top + left + right + bottom - (4 * center);

      sum += lapValue;
      sumSq += lapValue * lapValue;
      count++;
    }
  }

  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}

async function extractOdometerPipeline(imagePath) {
  console.log('Loading OWL-ViT detector...');
  const detector = await pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch32');

  // Normalize EXIF orientation once, reuse the same buffer for detection and cropping
  const inputBuffer = await sharp(imagePath).rotate().toBuffer();
  const metadata = await sharp(inputBuffer).metadata();
  const rawImage = await RawImage.read(new Blob([inputBuffer]));

  // Step 1: Detect the display screen or gauge cluster location
  console.log('Step 1: Locating odometer display screen with OWL-ViT...');
  const candidate_labels = [
    'digital odometer screen with numbers',
    'odometer display with numbers',
    'number display',
    'speedometer cluster display',
    'center numeric display screen',
  ];

  const detections = await detector(rawImage, candidate_labels, { threshold: 0.05 });

  let cropBuffer = inputBuffer; // fallback: whole (rotated) image
  let activeWidth = metadata.width;
  let activeHeight = metadata.height;


  if (detections && detections.length > 0) {    
    detections.sort((a, b) => b.score - a.score);
    const bestMatch = detections[0];

    console.log('Best match:', bestMatch.label);

    console.log(`Detected region: "\({bestMatch.label}" with score\){bestMatch.score.toFixed(2)}`);

    const { xmin, ymin, xmax, ymax } = bestMatch.box;
    const boxWidth = xmax - xmin;
    const boxHeight = ymax - ymin;

    let left, top, width, height;

    if (bestMatch.label.includes('speedometer') || boxWidth > 300) {
      console.log('Large gauge dial detected. Sub-cropping to lower-center LCD region...');
      left = Math.floor(xmin + boxWidth * 0.15);
      top = Math.floor(ymin + boxHeight * 0.52);
      width = Math.floor(boxWidth * 0.70);
      height = Math.floor(boxHeight * 0.38);
    } else {
      const padX = boxWidth * 0.10;
      const padY = boxHeight * 0.10;
      left = Math.max(0, Math.floor(xmin - padX));
      top = Math.max(0, Math.floor(ymin - padY));
      width = Math.min(metadata.width - left, Math.ceil(boxWidth + padX * 2));
      height = Math.min(metadata.height - top, Math.ceil(boxHeight + padY * 2));
    }

    console.log(`Cropping region: { left: \({left}, top:\){top}, width: \({width}, height:\){height} }`);

    activeWidth = width;
    activeHeight = height;

    cropBuffer = await sharp(inputBuffer)
      .extract({ left, top, width, height })
      .jpeg({ quality: 95 })
      .toBuffer();

    await writeFile('./odometer-crop.jpg', cropBuffer);
    console.log('Saved crop to ./odometer-crop.jpg');
  } else {
    console.log('No specific display box detected. Passing full image to OCR...');
  }

  // Step 2: Preprocess the crop with ppu-ocv, then read it with PaddleOCR
  console.log('Step 2: Preprocessing crop and reading text with PaddleOCR...');

  // 1. Inversion Check: Calculate average brightness
  const stats = await sharp(cropBuffer).stats();
  const averageBrightness = stats.channels[0].mean;
  const isDarkBackground = averageBrightness < 128;

  const dimension = Math.min(activeWidth, activeHeight);

  console.log({activeWidth, activeHeight});

  // 2. Focus Check: Calculate Laplacian variance score
  const sharpness = await measureSharpness(cropBuffer);
  console.log(`Measured Sharpness Score: ${sharpness.toFixed(2)}`);


  let blurSize = 5;

  if (sharpness > 800) {
    blurSize = Math.round(dimension * 0.025); 
    if (blurSize % 2 === 0) {
        blurSize += 1;
    }

    blurSize = Math.min(15, blurSize);
    blurSize = Math.max(5, blurSize);
  }

    console.log('Blur size:', blurSize);


  await ImageProcessor.initRuntime();
  const canvas = await CanvasProcessor.prepareCanvas(cropBuffer);
  const processor = new ImageProcessor(canvas);

  processor
    .grayscale()
    .equalize();

  if (blurSize > 0) {
    processor.blur({ size: [blurSize, blurSize] });
  }

  if (isDarkBackground) {
    processor.invert();
  }

  const resultCanvas = processor.toCanvas();

  const processedImageBuffer = resultCanvas.toBuffer('image/jpeg');
  await writeFile('./debug-processed.jpg', processedImageBuffer);
  console.log('Saved processed image to ./debug-processed.jpg');

  const service = new PaddleOcrService({
    model: V6_MEDIUM_MODEL,
    recognition: { strategy: 'per-box' },
  });
  await service.initialize();

  const result = await service.recognize(resultCanvas);
  console.log('OCR Result (flat text):', result.text);

//   console.log('Full result JSON:');
//   console.log(JSON.stringify(result));

  let confidenceScore = 'High';
  if (result.confidence < 0.7) {
    confidenceScore = 'Low';
  } else if (result.confidence < 0.9) {
    confidenceScore = 'Medium';
  }

  console.log('Confidence:', `${confidenceScore} (${result.confidence})`);


  processor.destroy();
  await service.destroy();

  const mileage = extractOdometerReading(result);
  console.log('Extracted Odometer Value:', mileage);

  return mileage;
}

// ---------------------------------------------------------------------------
// OCR Post-processing Functions
// ---------------------------------------------------------------------------

function extractDigitRuns(text) {
  const runs = [];
  const isLetter = (ch) => /[A-Za-z\u00C0-\u024F\u4e00-\u9fff]/.test(ch);
  const regex = /\d+(?:\.\d+)?/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const run = match[0];
    const digitOnlyLength = run.replace('.', '').length;
    const charBefore = match.index > 0 ? text[match.index - 1] : '';
    const charAfter = match.index + run.length < text.length ? text[match.index + run.length] : '';
    const gluedToLetter = isLetter(charBefore) || isLetter(charAfter);

    if (digitOnlyLength === 1 && gluedToLetter) continue;

    runs.push(run);
  }

  return runs;
}

function scoreLine(lineBoxes) {
    // console.log('Lineboxes:', lineBoxes);
    let parts = [];
    
  for (const box of lineBoxes) {
    parts.push(box.text);
  }

  const lineText = parts.join('');
  const lineNumber = lineText.replace(/[^0-9.]/g, "");
  let lineValue = 0;
  if (lineNumber.length > 0) {
    lineValue = Number(lineNumber);
  }

  return {
    text: lineText,
    value: lineValue,
  };
}

function extractOdometerReading(result) {
  const lines = result.lines || [];
  if (!Array.isArray(lines) || lines.length === 0) return 'No valid mileage match found';

  const scoredLines = lines.map(scoreLine);
//   const scoredLines = lines.map(scoreLine).filter((l) => l.digitCount > 0);
//   if (scoredLines.length === 0) return 'No valid mileage match found';

console.log(scoredLines);

  scoredLines.sort((a, b) => b.value - a.value);
  return scoredLines[0].value || 'No valid mileage match found'; // check what happens if this is 0
}

extractOdometerPipeline('./img7.jpeg');