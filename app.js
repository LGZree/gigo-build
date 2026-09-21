import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildPart } from './models/parametric.js';

const P = 9.2;
const state = { all: [], filter: 'search', query: '', placed: [], selected: null, gridSize: P, gridOn: true };
const $ = s => document.querySelector(s);
const container = $('#scene-container');

// ---------- theme ----------
$('#theme-btn').onclick = () => { const m = $('#theme-menu'); m.hidden = !m.hidden; };
document.querySelectorAll('#theme-menu button').forEach(b => b.onclick = () => {
  document.documentElement.dataset.theme = b.dataset.setTheme; $('#theme-menu').hidden = true;
});

// ---------- data ----------
async function loadData() {
  const files = ['straight', 'gears', 'connectors', 'shafts'];
  for (const f of files) {
    const r = await fetch(`data/${f}.json`); const j = await r.json();
    j.forEach(p => state.all.push(p));
  }
}
function catOf(p){ return p.kind==='straight'?'structure':p.kind==='connector'?'connector':p.kind==='gear'?'gear':'structure'; }

// ---------- panel ----------
const panel = $('#panel'), grid = $('#panel-grid'), catIcon = $('#panel-cat-icon');
const ICONS = { search: '', structure: '▥', connector: '▬', gear: '⚙' };
document.querySelectorAll('.rail-btn').forEach(b => b.onclick = () => {
  const m = b.dataset.menu;
  const was = b.classList.contains('active');
  document.querySelectorAll('.rail-btn').forEach(x => x.classList.remove('active'));
  if (was) { panel.hidden = true; state.filter = 'search'; return; }
  b.classList.add('active'); panel.hidden = false; state.filter = m;
  catIcon.textContent = ICONS[m] || '';
  renderCards();
});
$('#panel-search').oninput = e => { state.query = e.target.value.toLowerCase(); renderCards(); };
function filtered() {
  return state.all.filter(p => {
    if (state.filter !== 'search' && catOf(p) !== state.filter) return false;
    if (!state.query) return true;
    return (p.displayName + ' ' + p.code + ' ' + p.color).toLowerCase().includes(state.query);
  });
}
function renderCards() {
  grid.innerHTML = '';
  filtered().forEach(p => {
    const d = document.createElement('div'); d.className = 'card'; d.draggable = true;
    const cv = document.createElement('canvas'); cv.width = 260; cv.height = 150;
    const lb = document.createElement('div'); lb.className = 'lbl'; lb.textContent = p.displayName;
    d.append(cv, lb); grid.append(d);
    preview3D(cv, p);
    d.ondragstart = e => e.dataTransfer.setData('text/part', p.id);
    d.onclick = () => addPart(p.id);
  });
}
function preview3D(canvas, part) {
  const ren = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 1, 1000);
  cam.position.set(60, 50, 90); cam.lookAt(0, 0, 0);
  sc.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(50, 80, 60); sc.add(dl);
  const { group } = buildPart(part);
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3()); group.position.sub(c); sc.add(group);
  let rx = .5, ry = .6, drag = false, px = 0, py = 0;
  canvas.onpointerdown = e => { drag = true; px = e.clientX; py = e.clientY; };
  window.onpointerup = () => drag = false;
  canvas.onpointermove = e => { if (!drag) return; ry += (e.clientX - px) * .02; rx += (e.clientY - py) * .02; px = e.clientX; py = e.clientY; };
  (function loop(){ group.rotation.set(rx, ry, 0); ren.render(sc, cam); requestAnimationFrame(loop); })();
}

// ---------- main 3D ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
container.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
camera.position.set(120, 110, 150);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(100, 160, 120); scene.add(dl);
let gridHelper = new THREE.GridHelper(400, 400 / P, 0x999999, 0xcccccc);
scene.add(gridHelper);
const tc = new TransformControls(camera, renderer.domElement);
tc.setTranslationSnap(P); tc.setRotationSnap(Math.PI / 2); scene.add(tc);
tc.addEventListener('dragging-changed', e => orbit.enabled = !e.value);
tc.addEventListener('objectChange', () => { if (!altHeld) snapSelectedToGrid(); });
tc.addEventListener('mouseUp', () => magneticSnap());
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container); resize();

let altHeld = false, shiftHeld = false;
window.addEventListener('keydown', e => { altHeld = e.altKey; shiftHeld = e.shiftKey; });
window.addEventListener('keyup', e => { altHeld = e.altKey; shiftHeld = e.shiftKey; });

function snapStep() { return state.gridOn && !altHeld ? state.gridSize : 0; }
function snapSelectedToGrid() {
  const o = tc.object; if (!o) return; const s = snapStep(); if (!s) return;
  o.position.set(Math.round(o.position.x / s) * s, Math.round(o.position.y / s) * s, Math.round(o.position.z / s) * s);
}
function worldSockets(obj) {
  return (obj.userData.sockets || []).map(s => obj.localToWorld(s.pos.clone()));
}
function magneticSnap() {
  const o = tc.object; if (!o) return; snapSelectedToGrid(); updateBOM();
  const tol = P * 0.45; let best = null;
  const mine = worldSockets(o);
  for (const other of state.placed) {
    if (other === o) continue;
    for (const a of mine) for (const b of worldSockets(other)) {
      const d = a.distanceTo(b); if (d < tol && (!best || d < best.d)) best = { d, off: b.clone().sub(a) };
    }
  }
  if (best) { o.position.add(best.off); snapSelectedToGrid(); }
  // overlap warn: bounding boxes intersect
  updateBOM();
}
function addPart(id, pos, rot) {
  const part = state.all.find(p => p.id === id); if (!part) return;
  const { group, sockets } = buildPart(part);
  group.userData.sockets = sockets;
  group.position.copy(pos || new THREE.Vector3((Math.random() - .5) * 40, 20, (Math.random() - .5) * 40));
  if (rot) group.rotation.copy(rot);
  scene.add(group); state.placed.push(group);
  tc.attach(group); state.selected = group; updateBOM();
}
renderer.domElement.addEventListener('dragover', e => e.preventDefault());
renderer.domElement.addEventListener('drop', e => {
  e.preventDefault(); const id = e.dataTransfer.getData('text/part'); if (id) addPart(id);
});
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.target !== renderer.domElement) return;
  const ray = new THREE.Raycaster();
  const m = new THREE.Vector2((e.offsetX / renderer.domElement.clientWidth) * 2 - 1, -(e.offsetY / renderer.domElement.clientHeight) * 2 + 1);
  ray.setFromCamera(m, camera);
  const hit = ray.intersectObjects(state.placed, true)[0];
  if (hit) { let o = hit.object; while (o.parent && !state.placed.includes(o)) o = o.parent; tc.attach(o); state.selected = o; }
});
// toolbar
document.querySelectorAll('[data-grid]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-grid]').forEach(x => x.classList.remove('on')); b.classList.add('on');
  state.gridSize = b.dataset.grid === 'S' ? P / 2 : b.dataset.grid === 'L' ? P * 2 : P;
  tc.setTranslationSnap(state.gridSize);
});
$('#grid-toggle').onclick = e => { state.gridOn = !state.gridOn; e.target.classList.toggle('on', state.gridOn); gridHelper.visible = state.gridOn; };
$('#mode-move').onclick = () => { tc.setMode('translate'); $('#mode-move').classList.add('on'); $('#mode-rot').classList.remove('on'); };
$('#mode-rot').onclick = () => { tc.setMode('rotate'); $('#mode-rot').classList.add('on'); $('#mode-move').classList.remove('on'); };
document.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => {
  const ax = b.dataset.lock; const on = b.classList.toggle('on');
  if (ax === 'x') tc.showX = !on; if (ax === 'y') tc.showY = !on; if (ax === 'z') tc.showZ = !on;
});
$('#delete-part').onclick = () => { if (state.selected) { scene.remove(state.selected); state.placed = state.placed.filter(o => o !== state.selected); tc.detach(); state.selected = null; updateBOM(); } };
$('#clear-all').onclick = () => { state.placed.forEach(o => scene.remove(o)); state.placed = []; tc.detach(); state.selected = null; updateBOM(); };

// ---------- BOM + save/import ----------
function updateBOM() {
  const bom = $('#bom'), list = $('#bom-list'), warn = $('#bom-warn');
  if (!state.placed.length) { bom.hidden = true; return; }
  bom.hidden = false;
  const counts = {}; state.placed.forEach(o => { const n = o.userData.part.displayName; counts[n] = (counts[n] || 0) + 1; });
  $('#bom-count').textContent = `(${state.placed.length})`;
  list.innerHTML = Object.entries(counts).map(([k, v]) => `<li><span>${k}</span><b>×${v}</b></li>`).join('');
  let overlap = false;
  for (let i = 0; i < state.placed.length && !overlap; i++) for (let j = i + 1; j < state.placed.length && !overlap; j++) {
    const a = new THREE.Box3().setFromObject(state.placed[i]), b = new THREE.Box3().setFromObject(state.placed[j]);
    if (a.intersectsBox(b)) overlap = true;
  }
  warn.textContent = overlap ? '⚠ Overlap detected — check fit.' : 'Socket snap always ON • grid S/M/L aids layout.';
}
$('#btn-save').onclick = () => {
  const data = { app: 'gigo-build-v1', parts: state.placed.map(o => ({ id: o.userData.part.id, pos: o.position.toArray(), rot: [o.rotation.x, o.rotation.y, o.rotation.z] })) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'gigo-build.json'; a.click();
  const img = document.createElement('a'); img.href = renderer.domElement.toDataURL('image/png'); img.download = 'gigo-build.png'; img.click();
};
$('#btn-import').onclick = () => $('#file-import').click();
$('#file-import').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try {
    const j = JSON.parse(r.result);
    state.placed.forEach(o => scene.remove(o)); state.placed = []; tc.detach();
    j.parts.forEach(p => addPart(p.id, new THREE.Vector3(...p.pos), new THREE.Euler(...p.rot)));
    updateBOM();
  } catch { alert('Bad file'); } };
  r.readAsText(f);
};
$('#logo').onclick = e => { e.preventDefault(); tc.detach(); panel.hidden = true; document.querySelectorAll('.rail-btn').forEach(x => x.classList.remove('active')); };

(function loop(){ orbit.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
await loadData();
