// Redstring — boot & orchestration. Fixed-step physics for the ropes, a
// render loop for everything else, a toolbar of evidence types, connect mode,
// undo/redo, persistence, and the Pro gate.

import * as THREE from '../vendor/three.module.min.js';
import { createScene } from './scene.js';
import { CameraRig } from './camera.js';
import { Rope } from './rope.js';
import { RopeMesh, YARN_COLORS } from './ropeMesh.js';
import { createItem } from './items.js';
import { Interact } from './interact.js';
import { state, uid, execute, undo, redo, save, load, clearSaved, fileToDataURL } from './store.js';
import { sampleCase } from './sample.js';
import { initPro, isPro, openProModal, onProChange } from './pro.js';

const $ = s => document.querySelector(s);
const FREE_MAX_ITEMS = 12;

const canvasEl = $('#stage');
const { renderer, scene, camera, board, dust, resize } = createScene(canvasEl);
const rig = new CameraRig(camera, canvasEl);

// runtime registries
const items = new Map();   // id → item instance
const ropes = new Map();   // id → { data, rope, mesh, grow }

// ═══ instantiate / destroy (used by commands and boot) ═══
async function addItemInstance(data) {
  const item = await createItem(data);
  items.set(data.id, item);
  board.add(item.group);
  return item;
}
function removeItemInstance(id) {
  const item = items.get(id);
  if (!item) return;
  board.remove(item.group);
  item.dispose();
  items.delete(id);
}
function addRopeInstance(data, animate = false) {
  const a = items.get(data.a), b = items.get(data.b);
  if (!a || !b) return null;
  const rope = new Rope(a.pinWorld(), b.pinWorld());
  const mesh = new RopeMesh(rope, data.color || 'red');
  const entry = { data, rope, mesh, grow: animate ? 0 : 1 };
  if (animate) mesh.setGrowth(0);
  ropes.set(data.id, entry);
  board.add(mesh.mesh);
  return entry;
}
function removeRopeInstance(id) {
  const r = ropes.get(id);
  if (!r) return;
  board.remove(r.mesh.mesh);
  r.mesh.dispose();
  ropes.delete(id);
}

// ═══ commands (undo/redo aware) ═══
function cmdAddItem(data) {
  execute({
    do: () => { state.items.push(data); addItemInstance(data); },
    undo: () => {
      state.items = state.items.filter(i => i.id !== data.id);
      removeItemInstance(data.id);
    },
  });
}
function cmdDeleteItem(id) {
  const data = state.items.find(i => i.id === id);
  const attached = state.ropes.filter(r => r.a === id || r.b === id);
  execute({
    do: () => {
      state.items = state.items.filter(i => i.id !== id);
      state.ropes = state.ropes.filter(r => r.a !== id && r.b !== id);
      attached.forEach(r => removeRopeInstance(r.id));
      removeItemInstance(id);
    },
    undo: async () => {
      state.items.push(data);
      await addItemInstance(data);
      for (const r of attached) { state.ropes.push(r); addRopeInstance(r); }
    },
  });
}
function cmdMoveItem(id, from, to) {
  execute({
    do: () => {
      const d = state.items.find(i => i.id === id);
      if (d) { d.x = to.x; d.y = to.y; }
      const item = items.get(id);
      if (item) item.group.position.set(to.x, to.y, item.group.position.z);
      retensionFor(id);
    },
    undo: () => {
      const d = state.items.find(i => i.id === id);
      if (d) { d.x = from.x; d.y = from.y; }
      const item = items.get(id);
      if (item) item.group.position.set(from.x, from.y, item.group.position.z);
      retensionFor(id);
    },
  });
}
function cmdConnect(aId, bId, color) {
  const data = { id: uid('r'), a: aId, b: bId, color, created: Date.now() };
  execute({
    do: () => { state.ropes.push(data); addRopeInstance(data, true); },
    undo: () => {
      state.ropes = state.ropes.filter(r => r.id !== data.id);
      removeRopeInstance(data.id);
    },
  });
}
function cmdEditItem(id, patch) {
  const d = state.items.find(i => i.id === id);
  const before = { ...d };
  execute({
    do: async () => {
      Object.assign(d, patch);
      removeItemInstance(id);
      await addItemInstance(d);
      retensionFor(id);
    },
    undo: async () => {
      Object.assign(d, before);
      removeItemInstance(id);
      await addItemInstance(d);
      retensionFor(id);
    },
  });
}

function retensionFor(itemId) {
  for (const r of ropes.values()) {
    if (r.data.a === itemId || r.data.b === itemId) r.rope.retension();
  }
}

// ═══ connect mode ═══
let connectMode = false, connectFirst = null;
function setConnectMode(on) {
  connectMode = on;
  connectFirst = null;
  $('#btn-connect').classList.toggle('active', on);
  $('#hint').textContent = on ? 'Connect: click the first item…' : '';
  canvasEl.style.cursor = on ? 'crosshair' : 'default';
}

// ═══ interactions ═══
const interact = new Interact({
  dom: canvasEl, camera, rig, items,
  callbacks: {
    isConnectMode: () => connectMode,
    onConnectPick(item) {
      if (!connectFirst) {
        connectFirst = item;
        item.setEmissive(true);
        $('#hint').textContent = 'Connect: …now click the second item';
      } else if (item !== connectFirst) {
        connectFirst.setEmissive(false);
        cmdConnect(connectFirst.id, item.id, currentYarn());
        setConnectMode(false);
        toast('Connected — red string tells the story');
      }
    },
    onMoveEnd(item) {
      const d = state.items.find(i => i.id === item.id);
      const from = { x: d.x, y: d.y };
      const to = { x: item.group.position.x, y: item.group.position.y };
      if (Math.hypot(to.x - from.x, to.y - from.y) > 0.05) {
        // record without double-applying: position is already live
        d.x = to.x; d.y = to.y;
        pushMoveUndo(item.id, from, to);
        save();
      }
      retensionFor(item.id);
    },
    onSelect(item) {
      $('#btn-delete').disabled = !item;
    },
    onEdit(item) {
      if (item.type === 'sticky') openEditor(item, 'text', 'What does the note say?');
      else if (item.type === 'card') openEditor(item, 'body', 'Card text…');
      else if (item.type === 'clipping') openEditor(item, 'title', 'Headline…');
    },
  },
});

// move undo that doesn't re-apply on first do()
function pushMoveUndo(id, from, to) {
  execute({
    do: () => {
      const d = state.items.find(i => i.id === id);
      if (!d) return;
      if (d.x !== to.x || d.y !== to.y) {
        d.x = to.x; d.y = to.y;
        const it = items.get(id);
        if (it) { it.group.position.x = to.x; it.group.position.y = to.y; retensionFor(id); }
      }
    },
    undo: () => {
      const d = state.items.find(i => i.id === id);
      if (!d) return;
      d.x = from.x; d.y = from.y;
      const it = items.get(id);
      if (it) { it.group.position.x = from.x; it.group.position.y = from.y; retensionFor(id); }
    },
  });
}

// ═══ toolbar ═══
function guardCount() {
  if (!isPro() && state.items.length >= FREE_MAX_ITEMS) {
    toast(`Free boards hold ${FREE_MAX_ITEMS} items — Pro is unlimited`, true);
    openProModal();
    return false;
  }
  return true;
}
function dropPoint() {
  // place new items near the camera focus with a little scatter
  return {
    x: camera.position.x + (Math.random() - 0.5) * 6,
    y: camera.position.y + (Math.random() - 0.5) * 4,
  };
}

$('#btn-photo').addEventListener('click', () => { if (guardCount()) $('#file-input').click(); });
$('#file-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataURL = await fileToDataURL(file);
    const p = dropPoint();
    cmdAddItem({ id: uid('i'), type: 'photo', x: p.x, y: p.y, pin: 'red', img: dataURL, label: file.name.replace(/\.[^.]+$/, '').slice(0, 32) });
  } catch { toast('Couldn’t read that image', true); }
});
$('#btn-sticky').addEventListener('click', () => {
  if (!guardCount()) return;
  const p = dropPoint();
  cmdAddItem({ id: uid('i'), type: 'sticky', x: p.x, y: p.y, pin: 'yellow', text: 'double-click to write…', color: ['#f7e06e', '#7ed6a5', '#f4a9c0', '#8fc7ef'][Math.random() * 4 | 0] });
});
$('#btn-card').addEventListener('click', () => {
  if (!guardCount()) return;
  const p = dropPoint();
  cmdAddItem({ id: uid('i'), type: 'card', x: p.x, y: p.y, pin: 'blue', kind: 'NOTE', title: 'New lead', body: 'double-click to edit' });
});
$('#btn-clipping').addEventListener('click', () => {
  if (!guardCount()) return;
  const p = dropPoint();
  cmdAddItem({ id: uid('i'), type: 'clipping', x: p.x, y: p.y, pin: 'black', title: 'FRESH HEADLINE SURFACES IN CASE' });
});
$('#btn-print').addEventListener('click', () => {
  if (!guardCount()) return;
  const p = dropPoint();
  cmdAddItem({ id: uid('i'), type: 'fingerprint', x: p.x, y: p.y, pin: 'black', label: `PRINT #${state.items.length + 1}` });
});
$('#btn-connect').addEventListener('click', () => setConnectMode(!connectMode));
$('#btn-delete').addEventListener('click', () => {
  if (interact.selected) { cmdDeleteItem(interact.selected.id); interact.clearSelection(); }
});
$('#btn-undo').addEventListener('click', () => undo() || toast('Nothing to undo'));
$('#btn-redo').addEventListener('click', () => redo() || toast('Nothing to redo'));

// yarn color (Pro beyond red)
function currentYarn() { return $('#yarn-color').value; }
$('#yarn-color').addEventListener('change', e => {
  if (!isPro() && e.target.value !== 'red') {
    e.target.value = 'red';
    toast('Extra yarn colors are Pro', true);
    openProModal();
  }
});

// export board PNG (Pro)
$('#btn-export').addEventListener('click', () => {
  if (!isPro()) { toast('Board export is Pro', true); openProModal(); return; }
  renderer.render(scene, camera);
  canvasEl.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.name.replace(/[^\w-]+/g, '-').toLowerCase()}-board.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Board exported');
  });
});

// new board
$('#btn-new').addEventListener('click', () => {
  if (!confirm('Start a fresh board? The current one is cleared.')) return;
  for (const id of [...ropes.keys()]) removeRopeInstance(id);
  for (const id of [...items.keys()]) removeItemInstance(id);
  state.items = []; state.ropes = []; state.name = 'Case #001';
  $('#board-name').value = state.name;
  clearSaved(); save();
});

$('#board-name').addEventListener('input', e => { state.name = e.target.value; save(); });
$('#btn-help').addEventListener('click', () => $('#help-modal').showModal());
$('#btn-pro').addEventListener('click', openProModal);

// keyboard
addEventListener('keydown', e => {
  const inField = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
  if (inField) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (interact.selected) { e.preventDefault(); cmdDeleteItem(interact.selected.id); interact.clearSelection(); }
  }
  else if (e.key === 'Escape') { setConnectMode(false); interact.clearSelection(); }
  else if (e.key === 'c' || e.key === 'C') setConnectMode(!connectMode);
});

// ═══ editor overlay (sticky/card/clipping text) ═══
let editing = null;
function openEditor(item, field, placeholder) {
  editing = { item, field };
  const ta = $('#edit-text');
  ta.value = item.data[field] || '';
  ta.placeholder = placeholder;
  $('#edit-modal').showModal();
  ta.focus(); ta.select();
}
$('#edit-save').addEventListener('click', () => {
  if (editing) cmdEditItem(editing.item.id, { [editing.field]: $('#edit-text').value.slice(0, 400) });
  editing = null;
  $('#edit-modal').close();
});
$('#edit-cancel').addEventListener('click', () => { editing = null; $('#edit-modal').close(); });

// ═══ toast ═══
let toastT;
function toast(msg, accent = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('accent', accent);
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

// ═══ main loops: fixed-step physics + render ═══
const clock = new THREE.Clock();
let acc = 0;
const STEP = 1 / 60;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  acc += dt;

  resize();
  rig.update(dt);
  interact.update(dt);
  dust.update(dt);

  // rope endpoints follow their pins every render frame (cheap), physics at 60Hz
  for (const r of ropes.values()) {
    const a = items.get(r.data.a), b = items.get(r.data.b);
    if (a && b) { r.rope.setPinA(a.pinWorld()); r.rope.setPinB(b.pinWorld()); }
    if (r.grow < 1) {
      r.grow = Math.min(1, r.grow + dt * 1.6);
      r.mesh.setGrowth(easeOut(r.grow));
    }
  }
  while (acc >= STEP) {
    for (const r of ropes.values()) r.rope.step(STEP);
    acc -= STEP;
  }
  for (const r of ropes.values()) r.mesh.update();

  renderer.render(scene, camera);
}
const easeOut = t => 1 - Math.pow(1 - t, 3);

// ═══ boot ═══
(async function boot() {
  try { await document.fonts.load('44px Caveat'), await document.fonts.load('28px "Special Elite"'); } catch {}
  try { await document.fonts.ready; } catch {}

  initPro();
  onProChange(pro => {
    $('#pro-badge').hidden = !pro;
    $('#btn-pro').hidden = pro;
  });

  if (!load()) {
    const s = sampleCase();
    state.name = s.name;
    state.items = s.items;
    state.ropes = s.ropes;
    save();
  }
  $('#board-name').value = state.name;

  for (const d of state.items) await addItemInstance(d);
  for (const r of state.ropes) addRopeInstance(r);

  $('#loading').classList.add('done');
  frame();
  if (location.hash === '#pro') openProModal();

  // dev introspection hook (harmless in prod; no secrets, board data only)
  window.__rs = { items, ropes, interact, camera, state, renderer, scene };
})();
