/**
 * 3D View — Free-cam (spectator) controls.
 * PUBG spectator-style: fly freely through the scene, no gravity.
 * Mobile: left joystick (move XZ) + right area (look).
 * Desktop: WASD (move XZ) + Space/Ctrl (up/down) + pointer lock mouse look.
 *
 * Features:
 *   - Velocity-based movement with inertia (smooth start/stop)
 *   - Look smoothing via lerp (cinematic "film camera" feel)
 *   - Joystick sprint zone (outer ring activates sprint)
 *   - Speed ramping on sustained input
 *
 * No Three.js dependency — manipulates camera.position.{x,y,z} and
 * camera.rotation via plain trig. Expects Euler order 'YXZ'.
 */

const BASE_SPEED = 5;     // m/s at 1x multiplier
const SPRINT_FACTOR = 3;  // sprint = base * this
const LOOK_SENSITIVITY = 0.003;
const TOUCH_LOOK_SENSITIVITY = 0.004;
const PITCH_LIMIT = (85 * Math.PI) / 180; // +/-85 deg
const JOYSTICK_THRESHOLD = 10; // px deadzone (slightly larger for mobile comfort)
const JOYSTICK_SPRINT_THRESHOLD = 0.82; // normalized distance to activate sprint

// Inertia/smoothing constants
const MOVE_ACCEL = 8.0;      // acceleration rate (units/s^2 factor)
const MOVE_FRICTION = 5.0;   // friction when no input (higher = stops faster)
const LOOK_SMOOTH = 0.20;    // lerp factor per frame for look smoothing (0-1, lower = smoother)

// Speed multiplier presets (scroll wheel steps through these)
const SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16];
const DEFAULT_SPEED_INDEX = 2; // 1x

export class FPSControls {
  /**
   * @param {object} camera - Three.js camera (only .position and .rotation used)
   * @param {HTMLElement} domElement - The canvas or container for events
   * @param {{ onJoystickStart?: Function, onJoystickMove?: Function, onJoystickEnd?: Function, onSpeedChange?: Function, onSprintChange?: Function }} [callbacks]
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

    // Input state (-1..1) — raw desired direction
    this._inputForward = 0;
    this._inputRight = 0;
    this._inputUp = 0;   // vertical (Space/Ctrl)
    this._sprint = false;

    // Velocity state (smoothed, in m/s along camera-relative axes)
    this._velForward = 0;
    this._velRight = 0;
    this._velUp = 0;

    // Look state (radians) — current (smoothed) and target
    this._yaw = 0;
    this._pitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;

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
    this._targetYaw = r.y;
    this._targetPitch = r.x;
    // Reset velocity for clean start
    this._velForward = 0;
    this._velRight = 0;
    this._velUp = 0;
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

    // Scroll wheel -> speed control
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

    // ── 1. Compute desired input direction from keys + joystick ──
    let inputFwd = this._inputForward;
    let inputRight = this._inputRight;
    let inputUp = this._inputUp;

    if (this._keys['KeyW'] || this._keys['ArrowUp']) inputFwd = Math.min(inputFwd + 1, 1);
    if (this._keys['KeyS'] || this._keys['ArrowDown']) inputFwd = Math.max(inputFwd - 1, -1);
    if (this._keys['KeyA'] || this._keys['ArrowLeft']) inputRight = Math.max(inputRight - 1, -1);
    if (this._keys['KeyD'] || this._keys['ArrowRight']) inputRight = Math.min(inputRight + 1, 1);
    if (this._keys['Space']) inputUp = Math.min(inputUp + 1, 1);
    if (this._keys['ControlLeft'] || this._keys['ControlRight'] || this._keys['KeyQ']) inputUp = Math.max(inputUp - 1, -1);
    if (this._keys['KeyE']) inputUp = Math.min(inputUp + 1, 1);

    const sprint = this._sprint || this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const targetSpeed = BASE_SPEED * this._speedMultiplier * (sprint ? SPRINT_FACTOR : 1);

    // ── 2. Velocity-based movement with inertia ──
    // Target velocity based on input
    const targetVelFwd = inputFwd * targetSpeed;
    const targetVelRight = inputRight * targetSpeed;
    const targetVelUp = inputUp * targetSpeed;

    // Check if there is active input
    const hasInput = Math.abs(inputFwd) > 0.01 || Math.abs(inputRight) > 0.01 || Math.abs(inputUp) > 0.01;

    if (hasInput) {
      // Accelerate toward target velocity (smooth ramp-up)
      const accelFactor = 1 - Math.exp(-MOVE_ACCEL * dt);
      this._velForward += (targetVelFwd - this._velForward) * accelFactor;
      this._velRight += (targetVelRight - this._velRight) * accelFactor;
      this._velUp += (targetVelUp - this._velUp) * accelFactor;
    } else {
      // Apply friction/damping (smooth coast-down)
      const frictionFactor = Math.exp(-MOVE_FRICTION * dt);
      this._velForward *= frictionFactor;
      this._velRight *= frictionFactor;
      this._velUp *= frictionFactor;

      // Snap to zero when very slow to avoid perpetual drift
      if (Math.abs(this._velForward) < 0.01) this._velForward = 0;
      if (Math.abs(this._velRight) < 0.01) this._velRight = 0;
      if (Math.abs(this._velUp) < 0.01) this._velUp = 0;
    }

    // ── 3. Look smoothing via lerp ──
    // Smoothly interpolate current yaw/pitch toward target
    // Use a high lerp factor for responsive feel with slight smoothing
    const smoothFactor = Math.min(1, LOOK_SMOOTH * 60 * dt); // ~0.2 at 60fps
    this._yaw += (this._targetYaw - this._yaw) * smoothFactor;
    this._pitch += (this._targetPitch - this._pitch) * smoothFactor;

    // Snap when very close to avoid perpetual lerp
    if (Math.abs(this._targetYaw - this._yaw) < 0.0001) this._yaw = this._targetYaw;
    if (Math.abs(this._targetPitch - this._pitch) < 0.0001) this._pitch = this._targetPitch;

    // ── 4. Apply velocity to position ──
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
    pos.x += (fwdX * this._velForward + rightX * this._velRight) * dt;
    pos.y += (fwdY * this._velForward + this._velUp) * dt;
    pos.z += (fwdZ * this._velForward + rightZ * this._velRight) * dt;

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

    // Write to target (smoothed in update())
    this._targetYaw -= e.movementX * LOOK_SENSITIVITY;
    this._targetPitch -= e.movementY * LOOK_SENSITIVITY;
    this._targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetPitch));
  }

  _handleClick() {
    if (!this._enabled) return;
    if (document.pointerLockElement !== this._dom) {
      this._dom.requestPointerLock?.();
    }
  }

  _handlePointerLockChange() {
    // No action needed -- movement continues regardless
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
          this._inputForward = 0;
          this._inputRight = 0;
          this._setSprint(false);
          this._cb.onJoystickMove?.(0, 0, 1);
        } else {
          const maxDist = 60; // max joystick travel px
          const clamped = Math.min(dist, maxDist);
          const norm = clamped / maxDist;
          this._inputForward = -(dy / dist) * norm; // up = forward
          this._inputRight = (dx / dist) * norm;
          this._cb.onJoystickMove?.(dx, dy, maxDist);

          // Sprint zone: activate sprint when joystick pushed beyond threshold
          this._setSprint(norm >= JOYSTICK_SPRINT_THRESHOLD);
        }
      }

      if (touch.identifier === this._lookTouchId && this._lookPrev) {
        e.preventDefault();
        const dx = touch.clientX - this._lookPrev.x;
        const dy = touch.clientY - this._lookPrev.y;

        // Write to target (smoothed in update())
        this._targetYaw -= dx * TOUCH_LOOK_SENSITIVITY;
        this._targetPitch -= dy * TOUCH_LOOK_SENSITIVITY;
        this._targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetPitch));

        this._lookPrev = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  _handleTouchEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this._joystickTouchId) {
        this._joystickTouchId = null;
        this._joystickOrigin = null;
        this._inputForward = 0;
        this._inputRight = 0;
        this._setSprint(false);
        this._cb.onJoystickEnd?.();
      }
      if (touch.identifier === this._lookTouchId) {
        this._lookTouchId = null;
        this._lookPrev = null;
      }
    }
  }

  /** Set sprint state and notify callback on change. */
  _setSprint(val) {
    if (val !== this._sprint) {
      this._sprint = val;
      this._cb.onSprintChange?.(val);
    }
  }

  _resetMovement() {
    this._inputForward = 0;
    this._inputRight = 0;
    this._inputUp = 0;
    this._sprint = false;
    this._velForward = 0;
    this._velRight = 0;
    this._velUp = 0;
    this._keys = {};
    this._joystickTouchId = null;
    this._lookTouchId = null;
    this._joystickOrigin = null;
    this._lookPrev = null;
  }
}
