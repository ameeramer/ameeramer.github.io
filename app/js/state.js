// Central state + tiny pub/sub. The renderer treats state as read-only input.

const STORAGE_KEY = 'moonshot_state_v1';

export const state = {
  // image bitmap lives outside serialized state (see setImage)
  image: null,          // ImageBitmap | HTMLCanvasElement | null
  imageMeta: { w: 0, h: 0, name: 'sample' },

  canvas: { preset: 'auto', w: 1400, h: 900 },

  background: {
    mode: 'gradient',   // gradient | solid | transparent
    gradientId: 'lunar-gold',
    solid: '#111318',
    noise: 0.12,        // 0..0.4
  },

  frame: {
    type: 'macos',      // none | macos | browser | phone
    theme: 'dark',      // dark | light
    url: 'moonshot.app',
  },

  layout: {
    padding: 72,        // logical px at 1x
    scale: 1,           // 0.4..1.4 multiplier on fitted size
    radius: 14,         // px corner radius of content
    rotation: 0,        // degrees -10..10
    shadow: 55,         // 0..100 intensity
    offsetY: 0,         // -40..40 vertical nudge (% of free space)
  },

  text: {
    heading: '',
    sub: '',
    position: 'top',    // top | bottom
    color: 'auto',      // auto | #hex
  },

  pro: false,
  licenseKey: '',
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(scope = 'all') {
  for (const fn of listeners) fn(scope);
}

// Shallow-merge a section then notify. set('layout', {padding: 80})
export function set(section, patch) {
  Object.assign(state[section], patch);
  persist();
  notify(section);
}

export function setImage(bitmap, w, h, name = 'image') {
  // Release the previous decoded bitmap — they're large and GC is lazy.
  if (state.image && state.image !== bitmap
      && typeof state.image.close === 'function') {
    try { state.image.close(); } catch { /* already closed */ }
  }
  state.image = bitmap;
  state.imageMeta = { w, h, name };
  notify('image');
}

export function setPro(on, key = '') {
  state.pro = on;
  state.licenseKey = key;
  try {
    if (on) localStorage.setItem('moonshot_license', key);
    else localStorage.removeItem('moonshot_license');
  } catch { /* private mode */ }
  notify('pro');
}

function persist() {
  try {
    const { image, pro, licenseKey, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch { /* quota/private mode — non-fatal */ }
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const k of ['canvas', 'background', 'frame', 'layout', 'text']) {
        if (saved[k]) Object.assign(state[k], saved[k]);
      }
      if (saved.imageMeta) state.imageMeta = saved.imageMeta;
    }
    const key = localStorage.getItem('moonshot_license');
    if (key) { state.pro = true; state.licenseKey = key; }
  } catch { /* corrupted storage — start fresh */ }
}
