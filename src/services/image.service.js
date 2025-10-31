const fetch = require('node-fetch');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

/*
  Placeholder image processing function.
  - Accepts Buffer (or base64 string) and performs a lightweight transformation (example).
  - Does NOT persist locally.
  - Example shows: basic metadata extraction and a no-op transform; replace with Sharp or similar later.
*/

async function processAndUploadImage({ buffer, filename }) {
  // Example: derive an identifier, pretend to transform, POST to CDN upload endpoint
  const id = uuidv4();
  const ext = filename ? filename.split('.').pop() : 'jpg';
  const finalName = `${id}.${ext}`;

  // Simulate "processing" with a no-op pass-through
  const body = buffer; // replace with actual processed buffer

  // Example upload to CDN (replace with real signed upload / SDK)
  if (!config.cdnUploadUrl) {
    // If no CDN configured, return a temp data URL (for testing only)
    const base64 = Buffer.from(body).toString('base64');
    const url = `data:image/${ext};base64,${base64}`;
    return { url, key: finalName };
  }

  const res = await fetch(config.cdnUploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-filename': finalName },
    body
  });

  if (!res.ok) throw new Error('CDN upload failed');
  const data = await res.json();
  return { url: data.url || '', key: finalName };
}

module.exports = { processAndUploadImage };
