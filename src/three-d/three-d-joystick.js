/**
 * 3D View — Virtual Joystick overlay.
 * Renders a 2D canvas with a base circle + thumb knob.
 * Called by FPSControls via callbacks — touch events are handled on the parent.
 */

const BASE_RADIUS = 60;
const KNOB_RADIUS = 24;
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
    } else {
      this._knobX = 0;
      this._knobY = 0;
    }
    this._draw();
  }

  /** Hide the joystick. */
  hide() {
    this._visible = false;
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

    // Base circle
    ctx.beginPath();
    ctx.arc(cx, cy, BASE_RADIUS * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // Knob
    ctx.beginPath();
    ctx.arc(cx + this._knobX * s, cy + this._knobY * s, KNOB_RADIUS * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }
}
