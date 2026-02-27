/**
 * 3D View — Free-cam (spectator) controls.
 * PUBG spectator-style: fly freely through the scene, no gravity.
 * Mobile: left joystick (move XZ) + right area (look).
 * Desktop: WASD (move XZ) + Space/Ctrl (up/down) + pointer lock mouse look.
 *
 * No Three.js dependency — manipulates camera.position.{x,y,z} and
 * camera.rotation via plain trig. Expects Euler order 'YXZ'.
 */

const BASE_SPEED = 5;     // m/s at 1× multiplier
const SPRINT_FACTOR = 3;  // sprint = base × this
const LOOK_SENSITIVITY = 0.003;
const TOUCH_LOOK_SENSITIVITY = 0.004;
const PITCH_LIMIT = (85 * Math.PI) / 180; // ±85°
const JOYSTICK_THRESHOLD = 8; // px deadzone

// Speed multiplier presets (scroll wheel steps through these)
const SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16];
const DEFAULT_SPEED_INDEX = 2; // 1×

export class FPSControls {
  /**
   * @param {object} camera - Three.js camera (only .position and .rotation used)
   * @param {HTMLElement} domElement - The canvas or container for events
   * @param {{ onJoystickStart?: Function, onJoystickMove?: Function, onJoystickEnd?: Function, onSpeedChange?: Function }} [callbacks]
   */
  constructor(camera, domElement, callbacks = {}) {
    this._camera = camera;
    this._dom = domElement;
    this._cb = callbacks;
    this._enabled = false;
    this._disposed = false;

    // Speed multiplier
    this._speedIndex = DEFAULT_SPEED_INDEX;
    this._speedMultiplier = SPEED_STEPS[DEFAULT_SPEED_INDEX];

    // Movement state (−1..1)
    this._moveForward = 0;
    this._moveRight = 0;
    this._moveUp = 0;   // vertical (Space/Ctrl)
    this._sprint = false;

    // Look state (radians)
    this._yaw = 0;
    this._pitch = 0;

    // Touch tracking
    this._joystickTouchId = null;
    this._lookTouchId = null;
    this._joystickOrigin = null;
    this._lookPrev = null;

    // Desktop key state
    this._keys = {};

    // Bound handlers (for removal)
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onClick = this._handleClick.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onWheel = this._handleWheel.bind(this);
  }

  /** Current speed multiplier (read-only). */
  get speedMultiplier() { return this._speedMultiplier; }

  /** Set speed multiplier to a specific value in SPEED_STEPS. */
  setSpeedIndex(idx) {
    this._speedIndex = Math.max(0, Math.min(SPEED_STEPS.length - 1, idx));
    this._speedMultiplier = SPEED_STEPS[this._speedIndex];
    this._cb.onSpeedChange?.(this._speedMultiplier);
  }

  /** Step speed up/down by one notch. */
  stepSpeed(delta) {
    this.setSpeedIndex(this._speedIndex + delta);
  }

  /** Extract initial yaw/pitch from the camera's current rotation. */
  initFromCamera() {
    const r = this._camera.rotation;
    // Ensure Euler order is YXZ for FPS
    if (r.order !== 'YXZ') r.order = 'YXZ';
    this._yaw = r.y;
    this._pitch = r.x;
  }

  enable() {
    if (this._enabled || this._disposed) return;
    this._enabled = true;

    // Desktop
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this._dom.addEventListener('click', this._onClick);

    // Mobile
    this._dom.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this._dom.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this._dom.addEventListener('touchend', this._onTouchEnd);
    this._dom.addEventListener('touchcancel', this._onTouchEnd);

    // Scroll wheel → speed control
    this._dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this._dom.removeEventListener('click', this._onClick);

    this._dom.removeEventListener('touchstart', this._onTouchStart);
    this._dom.removeEventListener('touchmove', this._onTouchMove);
    this._dom.removeEventListener('touchend', this._onTouchEnd);
    this._dom.removeEventListener('touchcancel', this._onTouchEnd);
    this._dom.removeEventListener('wheel', this._onWheel);

    // Exit pointer lock
    if (document.pointerLockElement === this._dom) {
      document.exitPointerLock();
    }

    this._resetMovement();
  }

  dispose() {
    this.disable();
    this._disposed = true;
  }

  /** Call every frame with delta time in seconds. */
  update(dt) {
    if (!this._enabled) return;

    // Compute movement from keys (desktop) — merge with touch joystick
    let fwd = this._moveForward;
    let right = this._moveRight;
    let up = this._moveUp;

    if (this._keys['KeyW'] || this._keys['ArrowUp']) fwd = Math.min(fwd + 1, 1);
    if (this._keys['KeyS'] || this._keys['ArrowDown']) fwd = Math.max(fwd - 1, -1);
    if (this._keys['KeyA'] || this._keys['ArrowLeft']) right = Math.max(right - 1, -1);
    if (this._keys['KeyD'] || this._keys['ArrowRight']) right = Math.min(right + 1, 1);
    if (this._keys['Space']) up = Math.min(up + 1, 1);
    if (this._keys['ControlLeft'] || this._keys['ControlRight'] || this._keys['KeyQ']) up = Math.max(up - 1, -1);
    if (this._keys['KeyE']) up = Math.min(up + 1, 1);

    const sprint = this._sprint || this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const speed = BASE_SPEED * this._speedMultiplier * (sprint ? SPRINT_FACTOR : 1);

    // Spectator free-cam: forward vector follows camera pitch (fly toward where you look)
    const sinY = Math.sin(this._yaw);
    const cosY = Math.cos(this._yaw);
    const sinP = Math.sin(this._pitch);
    const cosP = Math.cos(this._pitch);

    // Full 3D forward direction (includes pitch)
    const fwdX = -sinY * cosP;
    const fwdY = sinP;
    const fwdZ = -cosY * cosP;

    // Right is always horizontal
    const rightX = cosY;
    const rightZ = -sinY;

    const pos = this._camera.position;
    pos.x += (fwdX * fwd + rightX * right) * speed * dt;
    pos.y += (fwdY * fwd + up) * speed * dt;
    pos.z += (fwdZ * fwd + rightZ * right) * speed * dt;

    // Apply rotation
    this._camera.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
  }

  // ── Desktop handlers ─────────────────────────────────────────────────────

  _handleKeyDown(e) {
    if (!this._enabled) return;
    // Don't intercept Escape (handled by overlay)
    if (e.code === 'Escape') return;
    // Prevent Space from scrolling
    if (e.code === 'Space') e.preventDefault();
    this._keys[e.code] = true;
  }

  _handleKeyUp(e) {
    this._keys[e.code] = false;
  }

  _handleMouseMove(e) {
    if (!this._enabled) return;
    if (document.pointerLockElement !== this._dom) return;

    this._yaw -= e.movementX * LOOK_SENSITIVITY;
    this._pitch -= e.movementY * LOOK_SENSITIVITY;
    this._pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._pitch));
  }

  _handleClick() {
    if (!this._enabled) return;
    if (document.pointerLockElement !== this._dom) {
      this._dom.requestPointerLock?.();
    }
  }

  _handlePointerLockChange() {
    // No action needed — movement continues regardless
  }

  _handleWheel(e) {
    if (!this._enabled) return;
    e.preventDefault();
    // Scroll up = faster, scroll down = slower
    this.stepSpeed(e.deltaY < 0 ? 1 : -1);
  }

  // ── Touch handlers (PUBG spectator-style) ─────────────────────────────────

  _handleTouchStart(e) {
    if (!this._enabled) return;
    const w = this._dom.clientWidth;
    const joystickZone = w * 0.35; // left 35% = joystick

    for (const touch of e.changedTouches) {
      const x = touch.clientX;

      if (x < joystickZone && this._joystickTouchId == null) {
        // Joystick touch
        e.preventDefault();
        this._joystickTouchId = touch.identifier;
        this._joystickOrigin = { x: touch.clientX, y: touch.clientY };
        this._cb.onJoystickStart?.(touch.clientX, touch.clientY);
      } else if (this._lookTouchId == null) {
        // Look touch (anywhere else)
        e.preventDefault();
        this._lookTouchId = touch.identifier;
        this._lookPrev = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  _handleTouchMove(e) {
    if (!this._enabled) return;

    for (const touch of e.changedTouches) {
      if (touch.identifier === this._joystickTouchId && this._joystickOrigin) {
        e.preventDefault();
        const dx = touch.clientX - this._joystickOrigin.x;
        const dy = touch.clientY - this._joystickOrigin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < JOYSTICK_THRESHOLD) {
          this._moveForward = 0;
          this._moveRight = 0;
          this._cb.onJoystickMove?.(0, 0, 1);
        } else {
          const maxDist = 60; // max joystick travel px
          const clamped = Math.min(dist, maxDist);
          const norm = clamped / maxDist;
          this._moveForward = -(dy / dist) * norm; // up = forward
          this._moveRight = (dx / dist) * norm;
          this._cb.onJoystickMove?.(dx, dy, maxDist);
        }
      }

      if (touch.identifier === this._lookTouchId && this._lookPrev) {
        e.preventDefault();
        const dx = touch.clientX - this._lookPrev.x;
        const dy = touch.clientY - this._lookPrev.y;

        this._yaw -= dx * TOUCH_LOOK_SENSITIVITY;
        this._pitch -= dy * TOUCH_LOOK_SENSITIVITY;
        this._pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._pitch));

        this._lookPrev = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  _handleTouchEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this._joystickTouchId) {
        this._joystickTouchId = null;
        this._joystickOrigin = null;
        this._moveForward = 0;
        this._moveRight = 0;
        this._cb.onJoystickEnd?.();
      }
      if (touch.identifier === this._lookTouchId) {
        this._lookTouchId = null;
        this._lookPrev = null;
      }
    }
  }

  _resetMovement() {
    this._moveForward = 0;
    this._moveRight = 0;
    this._moveUp = 0;
    this._sprint = false;
    this._keys = {};
    this._joystickTouchId = null;
    this._lookTouchId = null;
    this._joystickOrigin = null;
    this._lookPrev = null;
  }
}
