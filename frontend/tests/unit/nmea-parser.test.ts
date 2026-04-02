import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NMEAParser } from '../../src/gnss/nmea-parser.js';

describe('NMEAParser', () => {
  let parser: NMEAParser;

  beforeEach(() => {
    parser = new NMEAParser();
  });

  describe('parseSentence', () => {
    it('should parse a valid GPGGA sentence', () => {
      const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*4F';
      const result = parser.parseSentence(sentence);
      
      expect(result).toBe(true);
      const state = parser.getState();
      expect(state.lat).toBeCloseTo(48.1173);
      expect(state.lon).toBeCloseTo(11.5166);
      expect(state.alt).toBe(545.4);
      expect(state.fixQuality).toBe(1);
      expect(state.satellites).toBe(8);
      expect(state.isValid).toBe(true);
    });

    it('should parse a valid GNGGA sentence (GLONASS/GNSS)', () => {
      const sentence = '$GNGGA,172814.0,3723.46587704,N,12202.26957864,W,2,12,0.77,35.2,M,-28.6,M,,*74';
      const result = parser.parseSentence(sentence);
      
      expect(result).toBe(true);
      const state = parser.getState();
      expect(state.lat).toBeCloseTo(37.39109);
      expect(state.lon).toBeCloseTo(-122.03782);
      expect(state.fixQuality).toBe(2);
      expect(state.satellites).toBe(12);
    });

    it('should parse a valid GPRMC sentence', () => {
      const sentence = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A';
      const result = parser.parseSentence(sentence);
      
      expect(result).toBe(true);
      const state = parser.getState();
      expect(state.lat).toBeNull();
      expect(state.lon).toBeNull();
      expect(state.speed).toBeCloseTo(22.4 * 0.514444); // knots to m/s
      expect(state.course).toBe(84.4);
      expect(state.isValid).toBe(false); // No GGA yet
    });

    it('should reject RMC sentence with status V (warning)', () => {
      const sentence = '$GPRMC,123519,V,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*7B';
      const result = parser.parseSentence(sentence);
      
      expect(result).toBe(false);
      expect(parser.getState().isValid).toBe(false);
    });

    it('should NOT set isValid when GGA has fix=0 followed by RMC status A', () => {
      // GGA with fix quality 0 (no fix) — receiver stores last-known position but isValid=false
      const ggaNoFix = '$GPGGA,123519,4807.038,N,01131.000,E,0,00,99.9,0.0,M,0.0,M,,*3F';
      parser.parseSentence(ggaNoFix);
      expect(parser.getState().fixQuality).toBe(0);
      expect(parser.getState().isValid).toBe(false);

      // RMC status=A arrives — should NOT upgrade isValid because fixQuality is still 0
      const rmc = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A';
      parser.parseSentence(rmc);
      expect(parser.getState().isValid).toBe(false);
    });

    it('should reject sentence with invalid checksum', () => {
      const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*00';
      const result = parser.parseSentence(sentence);

      expect(result).toBe(false);
    });

    it('should reject sentence without checksum by default', () => {
      const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,';
      const result = parser.parseSentence(sentence);

      expect(result).toBe(false);
      expect(parser.getState().isValid).toBe(false);
    });

    it('should accept sentence without checksum when lenientChecksum is true', () => {
      const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,';
      const result = parser.parseSentence(sentence, { lenientChecksum: true });

      expect(result).toBe(true);
      const state = parser.getState();
      expect(state.lat).toBeCloseTo(48.1173);
      expect(state.lon).toBeCloseTo(11.5166);
      expect(state.fixQuality).toBe(1);
      expect(state.isValid).toBe(true);
    });
  });

  describe('processData (streaming)', () => {
    it('should handle partial data chunks', () => {
      const chunk1 = '$GPGGA,123519,48';
      const chunk2 = '07.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*4F\n';
      
      parser.processData(chunk1);
      expect(parser.getState().lat).toBeNull();
      
      parser.processData(chunk2);
      expect(parser.getState().lat).toBeCloseTo(48.1173);
    });

    it('should handle multiple sentences in one chunk', () => {
      const data = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*4F\n$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A\n';
      
      parser.processData(data);
      const state = parser.getState();
      expect(state.lat).toBeCloseTo(48.1173);
      expect(state.speed).toBeDefined();
    });
  });

  describe('parseCoordinate', () => {
    it('should parse latitude correctly', () => {
      // @ts-ignore - accessing private method for test
      expect(parser.parseCoordinate('4807.038', 'N')).toBeCloseTo(48.1173);
      // @ts-ignore
      expect(parser.parseCoordinate('4807.038', 'S')).toBeCloseTo(-48.1173);
    });

    it('should parse longitude correctly', () => {
      // @ts-ignore
      expect(parser.parseCoordinate('01131.000', 'E')).toBeCloseTo(11.51666);
      // @ts-ignore
      expect(parser.parseCoordinate('12202.269', 'W')).toBeCloseTo(-122.03781);
    });

    it('should return null for invalid coordinate formats', () => {
      // @ts-ignore
      expect(parser.parseCoordinate('', 'N')).toBeNull();
      // @ts-ignore
      expect(parser.parseCoordinate('invalid', 'N')).toBeNull();
      // @ts-ignore
      expect(parser.parseCoordinate('12', 'N')).toBeNull(); // too short
    });
  });

  describe('listeners', () => {
    it('should notify listeners on update', () => {
      const callback = vi.fn();
      parser.onUpdate(callback);
      
      const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*4F';
      parser.parseSentence(sentence);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        lat: expect.any(Number),
        isValid: true
      }));
    });

    it('should allow removing listeners', () => {
      const callback = vi.fn();
      parser.onUpdate(callback);
      parser.removeListener(callback);
      
      const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*4F';
      parser.parseSentence(sentence);
      
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
