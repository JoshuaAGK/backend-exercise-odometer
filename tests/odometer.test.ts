import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import initServer from '../src/server/server.ts';
import { maxUploadBytes } from '../src/config/constants.ts';

const expectedMileage: Record<string, number> = {
    '33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg': 62690.5,
    '3ae9d173-8895-409e-844c-77b5841138d7.jpeg': 161967,
    'd621e37e-7c0f-49a4-8a19-d628b1e82a33.jpeg': 154510,
    'dbab9932-823e-49ed-80db-1e898d836d5e.jpeg': 205265,
    'img5.jpeg':                                 133610,
    'img6.jpeg':                                 91308,
    'img7.jpeg':                                 235977
};

let server: Server;
let url: string;

before(async () => {
    const app = await initServer();
    server = app.listen(0);
    url = `http://localhost:${(server.address() as AddressInfo).port}/odometer/reading`;
});

after(() => {
    server.close();
});

const postJson = (body: unknown): Promise<Response> => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
});

const readImage = (fileName: string): Buffer => readFileSync(new URL(`../images/${fileName}`, import.meta.url));

test('accepts a multipart/form-data upload', async () => {
    const form = new FormData();
    form.append('image', new Blob([Uint8Array.from(readImage('3ae9d173-8895-409e-844c-77b5841138d7.jpeg'))]), 'odometer.jpeg');
    const response = await fetch(url, { method: 'POST', body: form });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).reading, 161967);
});

test('returns 400 when no image is provided', async () => {
    const response = await postJson({});

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'MISSING_IMAGE');
});

test('returns 400 for a file type other than JPEG or PNG', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer();
    const response = await postJson({ image: gif.toString('base64') });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'UNSUPPORTED_FILE_TYPE');
});

test('returns 422 when no reading can be found', async () => {
    const blank = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#fff' } }).png().toBuffer();
    const response = await postJson({ image: blank.toString('base64') });

    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, 'UNREADABLE_IMAGE');
});

test('returns 413 when the JSON body is too large', async () => {
    const response = await postJson({ image: 'A'.repeat(maxUploadBytes) });

    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'IMAGE_TOO_LARGE');
});

test('returns 413 when the uploaded file is too large', async () => {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(maxUploadBytes + 1)]), 'huge.jpeg');
    const response = await fetch(url, { method: 'POST', body: form });

    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'IMAGE_TOO_LARGE');
});

for (const [fileName, mileage] of Object.entries(expectedMileage)) {
    test(`reads ${mileage} miles from ${fileName}`, async () => {
        const response = await postJson({ image: readImage(fileName).toString('base64') });

        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.reading, mileage);
        assert.equal(body.unit, 'miles');
    });
}