// PNG export + clipboard copy. Renders through the same render() pipeline
// at the requested pixel scale — never a screenshot of the preview.

import { render, outputSize } from './renderer.js';
import { state } from './state.js';

function renderToCanvas(pixelScale) {
  const c = document.createElement('canvas');
  render(state, c, pixelScale);
  return c;
}

export async function exportPNG(pixelScale = 2) {
  const c = renderToCanvas(pixelScale);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Export failed — canvas too large for this browser.');
  const { w, h } = outputSize(state);
  const name = `moonshot-${w * pixelScale}x${h * pixelScale}.png`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
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
