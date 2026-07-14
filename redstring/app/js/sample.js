// First-run sample case — "The Missing Moon Rock". Six pinned items and five
// ropes so the very first frame already looks like a case in progress and
// begs to be dragged. The "photo" is drawn procedurally (an empty museum
// display case at night) so no assets ship with the app.

export function sampleCase() {
  return {
    name: 'The Missing Moon Rock',
    items: [
      { id: 's_clip', type: 'clipping', x: -16.5, y: 6.5, rot: -0.05, pin: 'red',
        title: 'MOON ROCK VANISHES FROM CITY MUSEUM' },
      { id: 's_photo', type: 'photo', x: -4, y: 7, rot: 0.03, pin: 'red',
        img: sceneDataURL(), label: 'display case — 2:14 AM' },
      { id: 's_suspect', type: 'card', x: 9.5, y: 6, rot: 0.04, pin: 'blue', kind: 'SUSPECT',
        title: 'The Night Curator',
        body: 'Keys to every hall. Claims he was “reorganizing meteorites.” Nobody reorganizes meteorites at 2 AM.' },
      { id: 's_dock', type: 'card', x: -11, y: -6.5, rot: -0.03, pin: 'blue', kind: 'LOCATION',
        title: 'Loading Dock B',
        body: 'Camera dark for exactly 11 minutes. A coffee cup on the ledge — still warm when security arrived.' },
      { id: 's_sticky', type: 'sticky', x: 16.5, y: -2.5, rot: 0.06, pin: 'yellow',
        text: 'Why was the alarm off for exactly 11 minutes??', color: '#f7e06e' },
      { id: 's_print', type: 'fingerprint', x: 2.5, y: -7, rot: 0.02, pin: 'black',
        label: 'PARTIAL — CASE GLASS' },
    ],
    ropes: [
      { id: 'r1', a: 's_clip', b: 's_photo', color: 'red' },
      { id: 'r2', a: 's_photo', b: 's_suspect', color: 'red' },
      { id: 'r3', a: 's_dock', b: 's_photo', color: 'red' },
      { id: 'r4', a: 's_print', b: 's_suspect', color: 'red' },
      { id: 'r5', a: 's_suspect', b: 's_sticky', color: 'red' },
    ],
  };
}

// Moody procedural "crime scene photo": an empty, spotlit museum display case.
function sceneDataURL() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 460;
  const x = c.getContext('2d');
  // night room
  const bg = x.createLinearGradient(0, 0, 0, 460);
  bg.addColorStop(0, '#0d1220');
  bg.addColorStop(1, '#1a1410');
  x.fillStyle = bg;
  x.fillRect(0, 0, 640, 460);
  // spotlight cone
  const spot = x.createRadialGradient(320, 90, 10, 320, 300, 330);
  spot.addColorStop(0, 'rgba(255,220,160,0.50)');
  spot.addColorStop(0.5, 'rgba(255,210,150,0.12)');
  spot.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = spot;
  x.fillRect(0, 0, 640, 460);
  // pedestal
  x.fillStyle = '#2b2620';
  x.fillRect(250, 290, 140, 120);
  x.fillStyle = '#3a332a';
  x.fillRect(240, 280, 160, 14);
  // empty glass case (the crime!)
  x.strokeStyle = 'rgba(190,210,230,0.55)';
  x.lineWidth = 3;
  x.strokeRect(258, 170, 124, 110);
  x.fillStyle = 'rgba(160,190,220,0.08)';
  x.fillRect(258, 170, 124, 110);
  // glass glint
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.beginPath(); x.moveTo(268, 180); x.lineTo(296, 208); x.stroke();
  // small "exhibit" placard
  x.fillStyle = '#d8cfae';
  x.fillRect(296, 300, 48, 20);
  x.fillStyle = '#413a2c';
  x.font = '10px monospace';
  x.textAlign = 'center';
  x.fillText('APOLLO 17', 320, 313);
  // dust in the beam
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(255,230,180,${Math.random() * 0.25})`;
    x.fillRect(200 + Math.random() * 240, 100 + Math.random() * 240, 1.6, 1.6);
  }
  // vignette
  const vg = x.createRadialGradient(320, 230, 140, 320, 230, 420);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = vg;
  x.fillRect(0, 0, 640, 460);
  return c.toDataURL('image/jpeg', 0.85);
}
