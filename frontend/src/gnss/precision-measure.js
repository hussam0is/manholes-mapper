/**
 * Precision-Gated Measurement Module
 * Collects GNSS position epochs and auto-stores when precision criteria are met.
 * Works with ANY adapter (TMM, browser, Bluetooth, mock).
 *
 * Replicates Trimble Access "Measure Topo Point" behavior:
 * - Occupation time countdown
 * - HRMS/VRMS precision convergence
 * - Auto-store when all criteria met
 * - Accept Early option
 */

import { gnssState } from './gnss-state.js';

// Default precision thresholds (configurable per-project)
export const DEFAULT_MEASURE_CONFIG = {
  hrmsThreshold: 0.015,      // 15mm horizontal RMS
  vrmsThreshold: 0.020,      // 20mm vertical RMS
  minEpochs: 5,              // minimum position epochs to collect
  maxEpochs: 60,             // maximum epochs before forcing decision
  occupationTimeSec: 5,      // minimum occupation time in seconds
  autoStoreEnabled: true,    // auto-store when all criteria met
  requireFixQuality: 4,      // minimum fix quality (4 = RTK Fixed)
};

/**
 * PrecisionMeasurement
 * Collects position epochs from gnssState, computes running statistics,
 * and resolves when auto-store criteria are met (or user accepts early / cancels).
 */
export class PrecisionMeasurement {
  /**
   * @param {object} [config] - Override defaults from DEFAULT_MEASURE_CONFIG
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_MEASURE_CONFIG, ...config };
    this.epochs = [];
    this.startTime = null;
    this.isCollecting = false;
    this._positionListener = null;

    // Callbacks (set by caller before or after start)
    this.onProgress = null;    // called each epoch with stats
    this.onAutoStore = null;   // called when auto-store criteria met
    this.onTimeout = null;     // called when maxEpochs reached
  }

  /**
   * Start epoch collection.
   * Subscribes to gnssState position events.
   * @returns {{ promise: Promise<MeasureResult>, cancel: Function, acceptEarly: Function }}
   */
  start() {
    this.epochs = [];
    this.startTime = Date.now();
    this.isCollecting = true;

    let resolvePromise, rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this._positionListener = (position) => {
      if (!this.isCollecting) return;

      this._recordEpoch(position);

      const stats = this.getStats();
      if (this.onProgress) this.onProgress(stats);

      // Check auto-store criteria
      if (this.config.autoStoreEnabled && this._allCriteriaMet(stats)) {
        this.stop();
        const result = this._buildResult(stats, 'auto');
        if (this.onAutoStore) this.onAutoStore(result);
        resolvePromise(result);
        return;
      }

      // Check max epochs
      if (this.epochs.length >= this.config.maxEpochs) {
        this.stop();
        const stats2 = this.getStats();
        const result = this._buildResult(stats2, 'max_epochs');
        if (this.onTimeout) this.onTimeout(result);
        resolvePromise(result);
      }
    };

    gnssState.on('position', this._positionListener);

    const cancel = () => {
      this.stop();
      rejectPromise(new Error('Measurement cancelled'));
    };

    const acceptEarly = () => {
      this.stop();
      const stats = this.getStats();
      if (this.epochs.length === 0) {
        rejectPromise(new Error('No epochs collected'));
        return;
      }
      const result = this._buildResult(stats, 'early_accept');
      resolvePromise(result);
    };

    return { promise, cancel, acceptEarly };
  }

  /**
   * Stop epoch collection and unsubscribe.
   */
  stop() {
    this.isCollecting = false;
    if (this._positionListener) {
      gnssState.off('position', this._positionListener);
      this._positionListener = null;
    }
  }

  /**
   * Record a single epoch from a position update.
   * @param {object} position
   */
  _recordEpoch(position) {
    if (!position.isValid) return;

    this.epochs.push({
      lat: position.lat,
      lon: position.lon,
      alt: position.alt,
      hrms: position.hrms ?? null,
      vrms: position.vrms ?? null,
      accuracy: position.accuracy ?? null,
      hdop: position.hdop,
      fixQuality: position.fixQuality,
      fixLabel: position.fixLabel,
      satellites: position.satellites,
      diffAge: position.diffAge ?? null,
      timestamp: position.timestamp || Date.now(),
    });
  }

  /**
   * Compute current measurement statistics from collected epochs.
   * @returns {object}
   */
  getStats() {
    const n = this.epochs.length;
    if (n === 0) return this._emptyStats();

    const last = this.epochs[n - 1];
    const elapsed = (Date.now() - this.startTime) / 1000;

    // Compute averages
    const avgLat = this.epochs.reduce((s, e) => s + e.lat, 0) / n;
    const avgLon = this.epochs.reduce((s, e) => s + e.lon, 0) / n;
    const avgAlt = this.epochs.reduce((s, e) => s + (e.alt || 0), 0) / n;

    // HRMS: use TMM-reported hrms if available, otherwise fall back to accuracy
    const hasHrms = this.epochs.some(e => e.hrms != null);
    const currentHrms = hasHrms ? last.hrms : (last.accuracy || null);
    const avgHrms = hasHrms
      ? this.epochs.filter(e => e.hrms != null).reduce((s, e) => s + e.hrms, 0) /
        this.epochs.filter(e => e.hrms != null).length
      : this.epochs.filter(e => e.accuracy != null).reduce((s, e) => s + e.accuracy, 0) /
        Math.max(1, this.epochs.filter(e => e.accuracy != null).length);

    // VRMS: only available from TMM
    const hasVrms = this.epochs.some(e => e.vrms != null);
    const currentVrms = hasVrms ? last.vrms : null;
    const avgVrms = hasVrms
      ? this.epochs.filter(e => e.vrms != null).reduce((s, e) => s + e.vrms, 0) /
        this.epochs.filter(e => e.vrms != null).length
      : null;

    // Criterion checks
    const hrmsMet = currentHrms != null && currentHrms <= this.config.hrmsThreshold;
    const vrmsMet = currentVrms != null && currentVrms <= this.config.vrmsThreshold;
    const epochsMet = n >= this.config.minEpochs;
    const occupationMet = elapsed >= this.config.occupationTimeSec;
    const fixQualityMet = last.fixQuality >= this.config.requireFixQuality;

    return {
      epochCount: n,
      elapsedSec: elapsed,
      occupationProgress: Math.min(1, elapsed / this.config.occupationTimeSec),
      epochProgress: Math.min(1, n / this.config.minEpochs),
      hrmsProgress: currentHrms != null
        ? Math.min(1, (this.config.hrmsThreshold / Math.max(currentHrms, 0.001)))
        : 0,
      vrmsProgress: currentVrms != null
        ? Math.min(1, (this.config.vrmsThreshold / Math.max(currentVrms, 0.001)))
        : 1,
      currentHrms,
      currentVrms,
      avgHrms,
      avgVrms,
      avgLat,
      avgLon,
      avgAlt,
      currentFixQuality: last.fixQuality,
      currentFixLabel: last.fixLabel || 'No Fix',
      currentSatellites: last.satellites,
      currentHdop: last.hdop,
      currentDiffAge: last.diffAge,
      hrmsMet,
      vrmsMet,
      epochsMet,
      occupationMet,
      fixQualityMet,
      allCriteriaMet: hrmsMet && vrmsMet && epochsMet && occupationMet && fixQualityMet,
      // Config for overlay display
      config: this.config,
    };
  }

  /**
   * Check if all auto-store criteria are met.
   * @param {object} stats
   * @returns {boolean}
   */
  _allCriteriaMet(stats) {
    return stats.hrmsMet && stats.vrmsMet && stats.epochsMet
      && stats.occupationMet && stats.fixQualityMet;
  }

  /**
   * Build the final measurement result.
   * @param {object} stats
   * @param {'auto'|'early_accept'|'max_epochs'} reason
   * @returns {object}
   */
  _buildResult(stats, reason) {
    return {
      reason,
      position: {
        lat: stats.avgLat,
        lon: stats.avgLon,
        alt: stats.avgAlt,
        fixQuality: stats.currentFixQuality,
        fixLabel: stats.currentFixLabel,
        hdop: stats.currentHdop,
        satellites: stats.currentSatellites,
        accuracy: stats.avgHrms,
        hrms: stats.avgHrms,
        vrms: stats.avgVrms,
        timestamp: Date.now(),
        isValid: true,
      },
      epochs: this.epochs.length,
      elapsedSec: stats.elapsedSec,
    };
  }

  /**
   * @returns {object}
   */
  _emptyStats() {
    return {
      epochCount: 0,
      elapsedSec: 0,
      occupationProgress: 0,
      epochProgress: 0,
      hrmsProgress: 0,
      vrmsProgress: 1,
      currentHrms: null,
      currentVrms: null,
      avgHrms: null,
      avgVrms: null,
      avgLat: null,
      avgLon: null,
      avgAlt: null,
      currentFixQuality: 0,
      currentFixLabel: 'No Fix',
      currentSatellites: 0,
      currentHdop: null,
      currentDiffAge: null,
      hrmsMet: false,
      vrmsMet: false,
      epochsMet: false,
      occupationMet: false,
      fixQualityMet: false,
      allCriteriaMet: false,
      config: this.config,
    };
  }
}
