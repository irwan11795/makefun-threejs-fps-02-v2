// Procedural canvas textures: the yard's surfaces, drawn once at boot from a
// seeded random so every run looks the same. No network, no image assets —
// THREE.CanvasTexture over plain 2D canvases. world.js maps these onto the
// containers, the ground and the crates.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function speckle(ctx, random, w, h, count, base, spread) {
  for (let i = 0; i < count; i += 1) {
    const shade = base + Math.floor(random() * spread);
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
    ctx.fillRect(Math.floor(random() * w), Math.floor(random() * h), 2, 2);
  }
}

// A shipping container side: vertical corrugation, stencil letters and a
// number, rust streaks running down from the top edge.
export function containerTexture(base, label, code) {
  const random = mulberry32(base.length * 7919 + code.length * 131);
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + 8, 0, 4, 256);
  }
  // Rust streaks.
  for (let i = 0; i < 14; i += 1) {
    const x = Math.floor(random() * 256);
    const len = 30 + Math.floor(random() * 120);
    const grad = ctx.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(60,30,12,0.35)');
    grad.addColorStop(1, 'rgba(60,30,12,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 3 + Math.floor(random() * 4), len);
  }
  // Stencil lettering, worn.
  ctx.fillStyle = 'rgba(236,231,219,0.55)';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 108);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(236,231,219,0.4)';
  ctx.fillText(code, 128, 142);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.repeat.set(2, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Asphalt yard floor: noise, faded lane dashes, oil stains, tyre arcs.
export function asphaltTexture() {
  const random = mulberry32(20261115);
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 512, 512, 9000, 46, 26);
  // Oil stains.
  for (let i = 0; i < 12; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 12 + random() * 30;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(10,10,12,0.5)');
    grad.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tyre arcs.
  ctx.strokeStyle = 'rgba(12,12,14,0.28)';
  ctx.lineWidth = 7;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(random() * 512, random() * 512, 60 + random() * 90, random() * 3, random() * 2 + 1);
    ctx.stroke();
  }
  // Faded yard lane dashes.
  ctx.strokeStyle = 'rgba(236,231,219,0.2)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 18]);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.lineTo(512, 256);
  ctx.stroke();
  ctx.setLineDash([]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 5);
  texture.anisotropy = 4;
  return texture;
}

// A wooden crate face: planks, nails, edge trim, stencil code.
export function crateTexture(code) {
  const random = mulberry32(77 + code.length * 17);
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#6d5136';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y, 128, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y + 3, 128, 2);
  }
  speckle(ctx, random, 128, 128, 500, 90, 30);
  ctx.strokeStyle = 'rgba(30,18,8,0.8)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.fillStyle = 'rgba(236,231,219,0.5)';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(code, 64, 70);
  return new THREE.CanvasTexture(canvas);
}

// Dusk sky gradient: deep blue top, violet middle, amber horizon glow.
export function skyTexture() {
  const [canvas, ctx] = makeCanvas(16, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#141b2e');
  grad.addColorStop(0.45, '#2c3350');
  grad.addColorStop(0.72, '#5a3f5e');
  grad.addColorStop(0.88, '#c96a3a');
  grad.addColorStop(1, '#ffb37a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 512);
  // A low sun glow smear near the horizon.
  const glow = ctx.createRadialGradient(8, 470, 4, 8, 470, 120);
  glow.addColorStop(0, 'rgba(255,190,120,0.9)');
  glow.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 340, 16, 172);
  return new THREE.CanvasTexture(canvas);
}
