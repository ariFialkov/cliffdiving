import { Renderer } from './render.js';
import { UI } from './ui.js';
import { InputController } from './input.js';
import { Game } from './game.js';

const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas);
const ui = new UI();
const input = new InputController(document.getElementById('app'), {});
const game = new Game({ renderer, ui, input });

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 150));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.draw(game.world, dt);
  requestAnimationFrame(frame);
}
game.boot();
requestAnimationFrame(frame);

// PWA: register the service worker (no-op on file:// or unsupported browsers).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

// Expose for debugging / tests.
window.__cliffdiving = { game, renderer, ui, input };
