export const serverPort = 3000;
export const maxUploadBytes = 50 * 1024 * 1024;
export const base64DataUrlPrefix = /^data:image\/\w+;base64,/;

export const odometerDetectorModel = 'Xenova/owlvit-base-patch32';
export const detectionThreshold = 0.05;
export const DEFAULT_ODOMETER_LABELS = [
    'digital odometer screen with numbers',
    'odometer display with numbers',
    'number display',
    'speedometer cluster display',
    'center numeric display screen',
];

export const cropSettings = {
    speedometerLabelKeyword: 'speedometer',
    speedometerMinBoxWidth: 300,
    speedometerRegion: { left: 0.15, top: 0.52, width: 0.7, height: 0.38 },
    paddingRatio: 0.1,
};
export const darkBackgroundMeanThreshold = 128;
export const blurSettings = {
    sharpnessThreshold: 800,
    defaultKernelSize: 5,
    kernelSizeRatio: 0.025,
    minKernelSize: 5,
    maxKernelSize: 15,
};

export const confidenceThresholds = {
    high: 0.9,
    medium: 0.7
}
export const convertToMetric = false; // Not strictly necessary but I wanted to include this for fun :)
export const kilometresPerMile = 1.60934;

export const errorMessages = {
    missingImage: `No image provided. Send a multipart/form-data "image" file or a JSON body with a base64 "image" string.`,
    invalidImage: 'The provided image could not be decoded.',
    unsupportedFileType: 'Unsupported file type. Please upload a JPEG or PNG image.',
    unreadableImage: convertToMetric
        ? 'Could not extract an odometer reading from the provided image'
        : 'Could not extract a mileage reading from the provided image',
    imageTooLarge: 'The image is too large. The maximum size is 50MB.',
    invalidRequest: 'The request body could not be parsed.',
    internalError: 'An unexpected error occurred while reading the odometer.',
};