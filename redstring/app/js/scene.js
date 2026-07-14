// Scene: the detective's office. A true-3D cork board (beveled wooden frame,
// speckled cork slab), lit by a warm desk lamp with soft shadows, dust motes
// drifting through the beam, a slightly angled low-FOV camera.

import * as THREE from '../vendor/three.module.min.js';
import { corkTexture, corkBump, woodTexture, dustSprite } from './textures.js';

export const BOARD = { w: 48, h: 27, cork: 0.6, frame: 1.5 };

export function createScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#17120d');
  // depth fog sells the "room" beyond the board without modeling one
  scene.fog = new THREE.Fog('#17120d', 70, 140);

  // ── Camera: low FOV = near-flat but alive; slight angle = premium.
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 300);
  camera.position.set(1.6, -1.2, 62);
  camera.lookAt(0, 0, 0);

  // ── Board group ──
  const board = new THREE.Group();
  scene.add(board);

  const cork = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD.w, BOARD.h, BOARD.cork),
    new THREE.MeshStandardMaterial({
      map: corkTexture(), bumpMap: corkBump(), bumpScale: 0.35,
      roughness: 0.94, metalness: 0,
    })
  );
  cork.receiveShadow = true;
  cork.position.z = -BOARD.cork / 2;   // cork face sits at z=0
  board.add(cork);

  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTexture(), roughness: 0.62, metalness: 0.05,
  });
  const f = BOARD.frame, W = BOARD.w + f * 2, H = BOARD.h + f * 2;
  const rails = [
    [0,  BOARD.h / 2 + f / 2, W, f],   // top
    [0, -BOARD.h / 2 - f / 2, W, f],   // bottom
    [-BOARD.w / 2 - f / 2, 0, f, BOARD.h],
    [ BOARD.w / 2 + f / 2, 0, f, BOARD.h],
  ];
  for (const [rx, ry, rw, rh] of rails) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 1.5), woodMat);
    rail.position.set(rx, ry, -0.15);
    rail.castShadow = rail.receiveShadow = true;
    board.add(rail);
  }

  // wall behind the board
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 220),
    new THREE.MeshStandardMaterial({ color: '#241b12', roughness: 1 })
  );
  wall.position.z = -2.4;
  wall.receiveShadow = true;
  scene.add(wall);

  // ── Lighting: warm key "desk lamp" from upper-left, cool-ish fill, ambient.
  const lamp = new THREE.SpotLight('#ffd9a3', 1400, 220, Math.PI / 3.6, 0.55, 1.7);
  lamp.position.set(-26, 26, 46);
  lamp.target.position.set(4, -3, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0006;
  lamp.shadow.radius = 5;
  scene.add(lamp, lamp.target);

  const fill = new THREE.DirectionalLight('#8fa3c0', 0.5);
  fill.position.set(30, -10, 40);
  scene.add(fill);
  scene.add(new THREE.AmbientLight('#5a4a38', 0.85));

  // ── Dust motes drifting through the lamp beam.
  const dust = makeDust();
  scene.add(dust.points);

  // ── Resize ──
  function resize() {
    const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
    if (canvasEl.width !== w * renderer.getPixelRatio() || canvasEl.height !== h * renderer.getPixelRatio()) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  return { renderer, scene, camera, board, dust, resize };
}

function makeDust(count = 130) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = -30 + Math.random() * 55;
    pos[i * 3 + 1] = -16 + Math.random() * 36;
    pos[i * 3 + 2] = 2 + Math.random() * 30;
    speed[i] = 0.15 + Math.random() * 0.5;
    phase[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: dustSprite(), size: 0.55, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  let t = 0;
  function update(dt) {
    t += dt;
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i * 3] += Math.sin(t * speed[i] + phase[i]) * 0.004;
      p[i * 3 + 1] += dt * speed[i] * 0.35;                 // slow rise
      if (p[i * 3 + 1] > 20) p[i * 3 + 1] = -16;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points, update };
}
