import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { css3dScene } from './renderer.js';

export function createPanel(position, content) {
  const div = document.createElement('div');
  div.className = 'ouroboros-panel';
  div.innerHTML = content;

  Object.assign(div.style, {
    background: 'rgba(20, 12, 4, 0.88)',
    border: '1px solid rgba(245, 166, 35, 0.3)',
    color: '#fff5e6',
    padding: '16px',
    borderRadius: '8px',
    width: '240px',
    fontFamily: 'sans-serif',
    fontSize: '14px',
    pointerEvents: 'none',
  });

  const panel = new CSS3DObject(div);
  panel.position.copy(position);
  // Scale down — CSS3D works in pixel space, so we scale to match Three.js units
  panel.scale.setScalar(0.05);

  css3dScene.add(panel);
  return panel;
}
