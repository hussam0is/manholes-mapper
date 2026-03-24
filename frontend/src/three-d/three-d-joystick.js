/**
 * 3D View — Virtual Joystick overlay.
 * Renders a 2D canvas with a base circle + thumb knob + sprint zone.
 * Called by FPSControls via callbacks — touch events are handled on the parent.
 *
 * Visual improvements for PUBG spectator feel:
 *   - Higher opacity base ring for visibility in dark scenes
 *   - Sprint zone indicator (outer ring glows when in sprint zone)
 *   - Directional tick marks (N/S/E/W)
 *   - Knob glow effect when active
 */

const BASE_RADIUS = 60;
const KNOB_RADIUS = 24;
const SPRINT_ZONE = 0.82; // normalized threshold matching FPSControls
const SIZE = BASE_RADIUS * 2 + 20; // canvas size with padding

export class VirtualJoystick {
  /**
   * @param {HTMLElement} container - The 3D overlay canvas container
   */
  constructor(container) {
    this._container = container;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'three-d-joystick';
    this._canvas.width = SIZE * 2;  // HiDPI
    this._canvas.height = SIZE * 2;
    this._canvas.style.width = SIZE + 'px';
    this._canvas.style.height = SIZE + 'px';
    this._canvas.style.display = 'none';

    this._ctx = this._canvas.getContext('2d');
    container.appendChild(this._canvas);

    this._originX = 0;
    this._originY = 0;
    this._knobX = 0;
    this._knobY = 0;
    this._visible = false;
    this._isSprinting = false;
  }

  /** Show joystick at the touch origin position. */
  show(screenX, screenY) {
    // Position relative to container
    const rect = this._container.getBoundingClientRect();
    this._originX = screenX - rect.left;
    this._originY = screenY - rect.top;

    this._canvas.style.left = (this._originX - SIZE / 2) + 'px';
    this._canvas.style.top = (this._originY - SIZE / 2) + 'px';
    this._canvas.style.display = 'block';

    this._knobX = 0;
    this._knobY = 0;
    this._isSprinting = false;
    this._visible = true;
    this._draw();
  }

  /** Update knob position. dx/dy relative to origin, max = max travel. */
  move(dx, dy, max) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, max);
    if (dist > 0.001) {
      this._knobX = (dx / dist) * clamped * (BASE_RADIUS / max);
      this._knobY = (dy / dist) * clamped * (BASE_RADIUS / max);
      // Check sprint zone
      this._isSprinting = (clamped / max) >= SPRINT_ZONE;
    } else {
      this._knobX = 0;
      this._knobY = 0;
      this._isSprinting = false;
    }
    this._draw();
  }

  /** Hide the joystick. */
  hide() {
    this._visible = false;
    this._isSprinting = false;
    this._canvas.style.display = 'none';
  }

  /** Remove from DOM. */
  dispose() {
    this._canvas.remove();
  }

  _draw() {
    const ctx = this._ctx;
    const s = 2; // HiDPI scale
    const cx = SIZE * s / 2;
    const cy = SIZE * s / 2;

    ctx.clearRect(0, 0, SIZE * s, SIZE * s);

    // Sprint zone outer ring (glows orange when sprinting)
    if (this._isSprinting) {
      ctx.beginPath();
      ctx.arc(cx, cy, (BASE_RADIUS + 4) * s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.6)';
      ctx.lineWidth = 3 * s;
      ctx.stroke();

      // Subtle outer glow
      ctx.beginPath();
      ctx.arc(cx, cy, (BASE_RADIUS + 6) * s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.2)';
      ctx.lineWidth = 4 * s;
      ctx.stroke();
    }

    // Base circle
    ctx.beginPath();
    ctx.arc(cx, cy, BASE_RADIUS * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = this._isSprinting ? 'rgba(251, 146, 60, 0.5)' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // Sprint zone dashed ring (shows the activation boundary)
    ctx.beginPath();
    ctx.arc(cx, cy, BASE_RADIUS * SPRINT_ZONE * s, 0, Math.PI * 2);
    ctx.setLineDash([4 * s, 6 * s]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.setLineDash([]);

    // Directional tick marks (N/S/E/W)
    const tickLen = 6 * s;
    const tickDist = (BASE_RADIUS - 2) * s;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5 * s;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      const tx = cx + Math.cos(angle) * tickDist;
      const ty = cy + Math.sin(angle) * tickDist;
      const tx2 = cx + Math.cos(angle) * (tickDist - tickLen);
      const ty2 = cy + Math.sin(angle) * (tickDist - tickLen);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();
    }

    // Knob
    const knobCx = cx + this._knobX * s;
    const knobCy = cy + this._knobY * s;

    // Knob glow when active (moving)
    const knobDist = Math.sqrt(this._knobX * this._knobX + this._knobY * this._knobY);
    if (knobDist > 2) {
      ctx.beginPath();
      ctx.arc(knobCx, knobCy, (KNOB_RADIUS + 4) * s, 0, Math.PI * 2);
      const glowColor = this._isSprinting ? 'rgba(251, 146, 60, 0.15)' : 'rgba(255, 255, 255, 0.1)';
      ctx.fillStyle = glowColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(knobCx, knobCy, KNOB_RADIUS * s, 0, Math.PI * 2);
    ctx.fillStyle = this._isSprinting ? 'rgba(251, 146, 60, 0.45)' : 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.strokeStyle = this._isSprinting ? 'rgba(251, 146, 60, 0.7)' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // Knob center dot
    ctx.beginPath();
    ctx.arc(knobCx, knobCy, 3 * s, 0, Math.PI * 2);
    ctx.fillStyle = this._isSprinting ? 'rgba(251, 146, 60, 0.8)' : 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
  }
}
