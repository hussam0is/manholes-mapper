/**
 * Worker Manager — manages the data-processor Web Worker lifecycle.
 *
 * Provides a promise-based API for offloading computation to the worker.
 * Handles worker creation, message routing, and graceful degradation
 * (falls back to main-thread execution if workers are unavailable).
 */

let _worker = null;
let _requestId = 0;
/** @type {Map<number, {resolve: Function, reject: Function}>} */
const _pending = new Map();
let _workerSupported = typeof Worker !== 'undefined';

/**
 * Get or create the shared worker instance.
 * @returns {Worker|null}
 */
function getWorker() {
  if (!_workerSupported) return null;

  if (!_worker) {
    try {
      _worker = new Worker(
        new URL('./data-processor.worker.js', import.meta.url),
        { type: 'module' }
      );

      _worker.onmessage = (e) => {
        const { id, type, payload, error } = e.data;
        const pending = _pending.get(id);
        if (!pending) return;
        _pending.delete(id);

        if (type === 'error') {
          pending.reject(new Error(error));
        } else {
          pending.resolve(payload);
        }
      };

      _worker.onerror = (e) => {
        console.warn('[WorkerManager] Worker error, falling back to main thread:', e.message);
        _workerSupported = false;
        _worker = null;
        // Reject all pending requests
        for (const [id, { reject }] of _pending) {
          reject(new Error('Worker crashed'));
          _pending.delete(id);
        }
      };
    } catch (err) {
      console.warn('[WorkerManager] Failed to create worker:', err.message);
      _workerSupported = false;
      return null;
    }
  }

  return _worker;
}

/**
 * Send a task to the worker and return a promise for the result.
 * @param {string} type - Message type (matches worker switch cases)
 * @param {object} payload - Data to send (must be structured-cloneable)
 * @returns {Promise<any>}
 */
export function postTask(type, payload) {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    if (!worker) {
      reject(new Error('Worker not available'));
      return;
    }

    const id = ++_requestId;
    _pending.set(id, { resolve, reject });
    worker.postMessage({ type, id, payload });
  });
}

/**
 * Check if the worker is available and operational.
 * @returns {boolean}
 */
export function isWorkerAvailable() {
  return _workerSupported;
}

/**
 * Terminate the worker (useful for cleanup).
 */
export function terminateWorker() {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
  // Reject any pending requests
  for (const [, { reject }] of _pending) {
    reject(new Error('Worker terminated'));
  }
  _pending.clear();
}
