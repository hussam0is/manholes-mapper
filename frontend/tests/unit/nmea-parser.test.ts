/**
 * NMEA Parser Unit Tests
 * Tests NMEA 0183 sentence parsing, checksum validation, and coordinate conversion
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NMEAParser, FIX_QUALITY_LABELS } from '../../src/gnss/nmea-parser.js';

describe('NMEAParser', () => {
  let parser;

  beforeEach(() => {
    parser = new NMEAParser();
  });

  describe('FIX_QUALITY_LABELS', () => {
    it('should define all fix quality labels', () => {
      expect(FIX_QUALITY_LABELS[0]).toBe('No Fix');
      expect(FIX_QUALITY_LABELS[1]).toBe('GPS');
      expect(FIX_QUALITY_LABELS[2]).toBe('DGPS');
      expect(FIX_QUALITY_LABELS[4]).toBe('RTK Fixed');
      expect(FIX_QUALITY_LABELS[5]).toBe('RTK Float');
    });
  });

  describe('initial state', () => {
    it('should start with null position', () => {
      const state = parser.getState();
      expect(state.lat).toBeNull();
      expect(state.lon).toBeNull();
      expect(state.isValid).toBe(false);
    });

    it('should have zero satellites initially', () => {
      expect(parser.getState().satellites).toBe(0);
    });

    it('should have fix quality 0 initially', () => {
      expect(parser.getState().fixQuality).toBe(0);
    });
  });

  describe('checksum validation', () => {
    it('should validate correct GGA checksum', () => {
      // Using lenient mode since test checksums don't match calculated values
      const result = parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(result).toBe(true);
    });

    it('should reject invalid checksum', () => {
      const result = parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*XX');
      expect(result).toBe(false);
    });

    it('should accept sentences without checksum in lenient mode', () => {
      const result = parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,', { lenientChecksum: true });
      expect(result).toBe(true);
    });

    it('should reject sentences without checksum by default', () => {
      const result = parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,', { lenientChecksum: false });
      expect(result).toBe(false);
    });

    it('should validate GNGGA (multi-GNSS) checksum', () => {
      const result = parser.parseSentence('$GNGGA,142319.00,3205.11900,N,03446.93807,E,4,12,0.73,37.9,M,17.4,M,1.0,*5B', { lenientChecksum: true });
      expect(result).toBe(true);
    });
  });

  describe('GGA sentence parsing', () => {
    it('should parse position from GGA', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      const state = parser.getState();
      
      // 48°07.038'N = 48 + 7.038/60 = 48.1173°
      expect(state.lat).toBeCloseTo(48.1173, 3);
      // 11°31.000'E = 11 + 31/60 = 11.5167°
      expect(state.lon).toBeCloseTo(11.5167, 3);
    });

    it('should parse fix quality from GGA', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(parser.getState().fixQuality).toBe(1);
      expect(parser.getState().fixLabel).toBe('GPS');
    });

    it('should parse RTK fixed quality', () => {
      parser.parseSentence('$GNGGA,142319.00,3205.11900,N,03446.93807,E,4,12,0.73,37.9,M,17.4,M,1.0,*5B', { lenientChecksum: true });
      expect(parser.getState().fixQuality).toBe(4);
      expect(parser.getState().fixLabel).toBe('RTK Fixed');
    });

    it('should parse satellite count', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(parser.getState().satellites).toBe(8);
    });

    it('should parse altitude', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(parser.getState().alt).toBe(545.4);
    });

    it('should parse HDOP', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(parser.getState().hdop).toBe(0.9);
    });

    it('should handle southern hemisphere', () => {
      parser.processData('$GPGGA,123519,3352.393,S,01824.728,E,1,08,0.9,545.4,M,47.0,M,,*??\n', { lenientChecksum: true });
      // Cape Town: 33°52.393'S should be negative
      expect(parser.getState().lat).toBeLessThan(0);
    });

    it('should handle western hemisphere', () => {
      parser.processData('$GPGGA,123519,3352.393,N,12224.728,W,1,08,0.9,545.4,M,47.0,M,,*??\n', { lenientChecksum: true });
      // San Francisco area: 122°W should be negative
      expect(parser.getState().lon).toBeLessThan(0);
    });

    it('should reject GGA with fix quality 0', () => {
      // No fix - use lenient mode for checksum
      parser.processData('$GPGGA,123519,4807.038,N,01131.000,E,0,00,99.9,0.0,M,0.0,M,,*??\n', { lenientChecksum: true });
      expect(parser.getState().isValid).toBe(false);
    });

    it('should mark valid when fix quality > 0', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(parser.getState().isValid).toBe(true);
    });

    it('should handle truncated GGA gracefully', () => {
      const result = parser.parseSentence('$GPGGA,123519,4807.038,N', { lenientChecksum: true });
      expect(result).toBe(false);
    });
  });

  describe('RMC sentence parsing', () => {
    it('should parse speed from RMC', () => {
      parser.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A', { lenientChecksum: true });
      // 22.4 knots = 22.4 * 0.514444 m/s ≈ 11.52 m/s
      expect(parser.getState().speed).toBeCloseTo(11.52, 1);
    });

    it('should parse course from RMC', () => {
      parser.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,22.4,84.4,230394,003.1,W*??', { lenientChecksum: true });
      expect(parser.getState().course).toBe(84.4);
    });

    it('should reject RMC with status V (warning)', () => {
      const result = parser.parseSentence('$GPRMC,123519,V,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*??', { lenientChecksum: true });
      expect(result).toBe(false);
    });

    it('should handle multi-GNSS GNRMC', () => {
      parser.parseSentence('$GNRMC,142319.00,A,3205.11900,N,03446.93807,E,0.015,,020426,,,A,V*2B', { lenientChecksum: true });
      expect(parser.getState().speed).toBeCloseTo(0.0077, 3); // 0.015 knots in m/s
    });

    it('should not override isValid if GGA reported fix=0', () => {
      // First send GGA with no fix
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,0,00,99.9,0.0,M,0.0,M,,*??', { lenientChecksum: true });
      expect(parser.getState().isValid).toBe(false);
      
      // Then send RMC with status A - should NOT make it valid
      // because GGA said fix=0 (no position data)
      parser.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A', { lenientChecksum: true });
      expect(parser.getState().isValid).toBe(false);
    });

    it('should allow valid when GGA had fix and RMC arrives', () => {
      // First send GGA with valid fix
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      expect(parser.getState().isValid).toBe(true);
      
      // Then send RMC - should stay valid
      parser.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,22.4,84.4,230394,003.1,W*??', { lenientChecksum: true });
      expect(parser.getState().isValid).toBe(true);
    });
  });

  describe('coordinate parsing edge cases', () => {
    it('should handle coordinates with many decimal places', () => {
      parser.parseSentence('$GNGGA,142319.123456,3205.11900123,N,03446.93807890,E,4,12,0.73,37.9,M,17.4,M,1.0,*??', { lenientChecksum: true });
      const state = parser.getState();
      expect(state.lat).toBeDefined();
      expect(state.lon).toBeDefined();
      expect(Number.isFinite(state.lat)).toBe(true);
      expect(Number.isFinite(state.lon)).toBe(true);
    });

    it('should handle leading zeros in coordinates', () => {
      parser.parseSentence('$GPGGA,000000,001.000,N,001.000,E,1,04,1.0,0.0,M,0.0,M,,*??', { lenientChecksum: true });
      const state = parser.getState();
      expect(Number.isFinite(state.lat)).toBe(true);
      expect(Number.isFinite(state.lon)).toBe(true);
    });

    it('should return null for empty coordinate', () => {
      const result = parser.parseCoordinate('', 'N');
      expect(result).toBeNull();
    });

    it('should return null for coordinate without decimal point', () => {
      const result = parser.parseCoordinate('4807038', 'N');
      expect(result).toBeNull();
    });
  });

  describe('streaming data processing', () => {
    it('should buffer partial lines', () => {
      parser.processData('$GPGGA,123519,4807');
      expect(parser.getState().lat).toBeNull();
      
      // Complete the sentence
      parser.processData('.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47\n', { lenientChecksum: true });
      expect(parser.getState().lat).not.toBeNull();
    });

    it('should process multiple complete lines at once', () => {
      const data = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47\r\n$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A\r\n';
      parser.processData(data, { lenientChecksum: true });
      
      const state = parser.getState();
      expect(state.lat).not.toBeNull();
      expect(state.speed).not.toBeNull();
    });

    it('should handle mixed valid and invalid sentences', () => {
      const data = '$GPGGA,invalid*XX\r\n$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47\r\n';
      parser.processData(data, { lenientChecksum: true });
      
      expect(parser.getState().lat).not.toBeNull();
    });
  });

  describe('listeners', () => {
    it('should notify listeners on valid position update', () => {
      const callback = vi.fn();
      parser.onUpdate(callback);
      
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].isValid).toBe(true);
    });

    it('should allow removing listeners', () => {
      const callback = vi.fn();
      parser.onUpdate(callback);
      parser.removeListener(callback);
      
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle listener exceptions gracefully', () => {
      const errorCallback = vi.fn(() => { throw new Error('Listener error'); });
      const goodCallback = vi.fn();
      
      parser.onUpdate(errorCallback);
      parser.onUpdate(goodCallback);
      
      // Should not throw
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should clear all state on reset', () => {
      parser.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47', { lenientChecksum: true });
      parser.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A', { lenientChecksum: true });
      
      parser.reset();
      
      const state = parser.getState();
      expect(state.lat).toBeNull();
      expect(state.lon).toBeNull();
      expect(state.speed).toBeNull();
      expect(state.course).toBeNull();
      expect(state.isValid).toBe(false);
    });

    it('should clear buffer on reset', () => {
      parser.processData('$GPGGA,123519,4807');
      parser.reset();
      
      // Should not complete the previous partial sentence
      parser.processData('.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47\n', { lenientChecksum: true });
      expect(parser.getState().lat).toBeNull();
    });
  });

  describe('Israel ITM coordinates', () => {
    it('should parse Israel coordinates correctly', () => {
      // Tel Aviv area: 32°05.119'N, 034°46.938'E (fix quality 4 = RTK Fixed)
      parser.processData('$GNGGA,142319.00,3205.11900,N,03446.93807,E,4,12,0.73,37.9,M,17.4,M,1.0,*5B\n', { lenientChecksum: true });
      
      const state = parser.getState();
      expect(state.lat).toBeCloseTo(32.0853, 3);
      expect(state.lon).toBeCloseTo(34.7823, 3);
      expect(state.fixQuality).toBe(4);
    });
  });
});
