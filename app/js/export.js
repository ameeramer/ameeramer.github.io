// PNG export + clipboard copy. Renders through the same render() pipeline
// at the requested pixel scale — never a screenshot of the preview.

import { render, outputSize } from './renderer.js';
import { state } from './state.js';

function renderToCanvas(pixelScale, st = state) {
  const c = document.createElement('canvas');
  render(st, c, pixelScale);
  return c;
}

// Render `st`, encode, and trigger a download. Shared by single + pack export.
async function downloadFrom(st, pixelScale, format) {
  let c = renderToCanvas(pixelScale, st);
  if (format === 'jpeg') {
    // JPEG has no alpha channel — flatten onto white so transparent
    // backgrounds don't render black.
    const flat = document.createElement('canvas');
    flat.width = c.width;
    flat.height = c.height;
    const fx = flat.getContext('2d');
    fx.fillStyle = '#ffffff';
    fx.fillRect(0, 0, flat.width, flat.height);
    fx.drawImage(c, 0, 0);
    c = flat;
  }
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise(res => c.toBlob(res, mime, 0.92));
  if (!blob) throw new Error('Export failed — canvas too large for this browser.');
  const { w, h } = outputSize(st);
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  // Include the platform label so exporting one shot for several targets
  // (og / x / linkedin …) yields self-describing, non-colliding filenames.
  const preset = st.canvas.preset;
  const slug = (preset && preset !== 'auto' && preset !== 'custom') ? `${preset}-` : '';
  const name = `moonshot-${slug}${w * pixelScale}x${h * pixelScale}.${ext}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}

export const exportImage = (pixelScale = 2, format = 'png') =>
  downloadFrom(state, pixelScale, format);

export const exportPNG = (pixelScale) => exportImage(pixelScale, 'png');

// The curated "social pack": design once, export the sizes people actually
// post to. Renders each from a shallow state copy so the live preview and the
// user's chosen canvas are never disturbed.
export const PACK_PRESETS = ['x-post', 'og', 'linkedin', 'ig-square', 'story'];

export async function exportPack(pixelScale = 2, format = 'png') {
  const names = [];
  for (const preset of PACK_PRESETS) {
    const st = { ...state, canvas: { ...state.canvas, preset } };
    names.push(await downloadFrom(st, pixelScale, format));
    // Stagger downloads so the browser doesn't drop or block them.
    await new Promise(r => setTimeout(r, 450));
  }
  return names;
}

export async function copyToClipboard(pixelScale = 2) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Clipboard images are not supported in this browser — use Export instead.');
  }
  // Safari requires the ClipboardItem promise pattern; Chrome accepts both.
  const item = new ClipboardItem({
    'image/png': new Promise(async (resolve, reject) => {
      const c = renderToCanvas(pixelScale);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Render failed'))), 'image/png');
    }),
  });
  await navigator.clipboard.write([item]);
}
