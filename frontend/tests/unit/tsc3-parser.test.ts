import { describe, it, expect } from 'vitest';
import {
  parseSurveyLine,
  processDataChunk,
  createParserState,
  detectDelimiter,
  detectFormat,
} from '../../src/survey/tsc3-parser.js';

describe('tsc3-parser', () => {
  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      expect(detectDelimiter('1,182456.789,654321.123,45.67')).toBe(',');
    });

    it('should detect tab delimiter', () => {
      expect(detectDelimiter('1\t182456.789\t654321.123\t45.67')).toBe('\t');
    });

    it('should detect space delimiter', () => {
      expect(detectDelimiter('1 182456.789 654321.123 45.67')).toBe(' ');
    });

    it('should prefer tab over space', () => {
      expect(detectDelimiter('name 1\t182456.789\t654321.123')).toBe('\t');
    });
  });

  describe('detectFormat', () => {
    it('should detect NEN when first value is easting range', () => {
      expect(detectFormat(182456, 654321)).toBe('NEN');
    });

    it('should detect NNE when first value is northing range', () => {
      expect(detectFormat(654321, 182456)).toBe('NNE');
    });

    it('should fall back to NEN when val1 < val2', () => {
      expect(detectFormat(50000, 90000)).toBe('NEN');
    });

    it('should fall back to NNE when val1 > val2', () => {
      expect(detectFormat(90000, 50000)).toBe('NNE');
    });
  });

  describe('parseSurveyLine', () => {
    it('should parse a standard CSV line (NEN format)', () => {
      const result = parseSurveyLine('1,182456.789,654321.123,45.67');
      expect(result).toEqual({
        pointName: '1',
        easting: 182456.789,
        northing: 654321.123,
        elevation: 45.67,
      });
    });

    it('should parse NNE format (northing first)', () => {
      const result = parseSurveyLine('MH5,654321.123,182456.789,45.67');
      expect(result).toEqual({
        pointName: 'MH5',
        easting: 182456.789,
        northing: 654321.123,
        elevation: 45.67,
      });
    });

    it('should parse tab-delimited data', () => {
      const result = parseSurveyLine('1\t182456.789\t654321.123\t45.67');
      expect(result).toEqual({
        pointName: '1',
        easting: 182456.789,
        northing: 654321.123,
        elevation: 45.67,
      });
    });

    it('should parse space-delimited data', () => {
      const result = parseSurveyLine('1 182456.789 654321.123 45.67');
      expect(result).toEqual({
        pointName: '1',
        easting: 182456.789,
        northing: 654321.123,
        elevation: 45.67,
      });
    });

    it('should handle lines with only 3 fields (no elevation)', () => {
      const result = parseSurveyLine('1,182456.789,654321.123');
      expect(result).toEqual({
        pointName: '1',
        easting: 182456.789,
        northing: 654321.123,
        elevation: 0,
      });
    });

    it('should ignore extra trailing fields', () => {
      const result = parseSurveyLine('1,182456.789,654321.123,45.67,CODE,description text');
      expect(result).toEqual({
        pointName: '1',
        easting: 182456.789,
        northing: 654321.123,
        elevation: 45.67,
      });
    });

    it('should skip comment lines starting with #', () => {
      expect(parseSurveyLine('# This is a comment')).toBeNull();
    });

    it('should skip comment lines starting with !', () => {
      expect(parseSurveyLine('! Remark')).toBeNull();
    });

    it('should skip blank lines', () => {
      expect(parseSurveyLine('')).toBeNull();
      expect(parseSurveyLine('   ')).toBeNull();
    });

    it('should skip header lines where field[1] is non-numeric', () => {
      expect(parseSurveyLine('Name,Easting,Northing,Elevation')).toBeNull();
      expect(parseSurveyLine('ID,X,Y,Z')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(parseSurveyLine(null as any)).toBeNull();
      expect(parseSurveyLine(undefined as any)).toBeNull();
    });

    it('should handle lines with fewer than 3 fields', () => {
      expect(parseSurveyLine('1,182456')).toBeNull();
    });

    it('should return null when easting is outside ITM range', () => {
      // Easting 99999 is below the 100,000 floor — typical Bluetooth noise value
      expect(parseSurveyLine('MH1,99999,654321.123,45.67')).toBeNull();
      // Easting 300001 is above the 300,000 ceiling
      expect(parseSurveyLine('MH2,300001,654321.123,45.67')).toBeNull();
    });

    it('should return null when northing is outside ITM range', () => {
      // Northing 349999 is below the 350,000 floor (south of Eilat)
      expect(parseSurveyLine('MH3,182456.789,349999,45.67')).toBeNull();
      // Northing 800001 is above the 800,000 ceiling
      expect(parseSurveyLine('MH4,182456.789,800001,45.67')).toBeNull();
    });

    it('should accept coordinates exactly at ITM boundary values', () => {
      // Lower easting boundary with valid northing
      const low = parseSurveyLine('BL1,100000,350000,0');
      expect(low).not.toBeNull();
      expect(low!.easting).toBe(100000);
      expect(low!.northing).toBe(350000);

      // Upper easting boundary with valid northing
      const high = parseSurveyLine('BH1,300000,800000,0');
      expect(high).not.toBeNull();
      expect(high!.easting).toBe(300000);
      expect(high!.northing).toBe(800000);
    });

    it('should accept Eilat-area survey points (northing ~380k–400k)', () => {
      // Eilat is around ITM northing 380,000–395,000 — previously rejected
      const eilat = parseSurveyLine('EI1,185000,385000,12.5');
      expect(eilat).not.toBeNull();
      expect(eilat!.easting).toBe(185000);
      expect(eilat!.northing).toBe(385000);
    });
  });

  describe('processDataChunk', () => {
    it('should parse complete lines from a chunk', () => {
      const state = createParserState();
      const points = processDataChunk('1,182456.789,654321.123,45.67\n2,182500.000,654400.000,46.0\n', state);
      expect(points).toHaveLength(2);
      expect(points[0].pointName).toBe('1');
      expect(points[1].pointName).toBe('2');
    });

    it('should buffer partial lines across chunks', () => {
      const state = createParserState();

      // First chunk: one complete line + partial
      const points1 = processDataChunk('1,182456.789,654321.123,45.67\n2,1825', state);
      expect(points1).toHaveLength(1);
      expect(points1[0].pointName).toBe('1');

      // Second chunk: rest of the partial line
      const points2 = processDataChunk('00.000,654400.000,46.0\n', state);
      expect(points2).toHaveLength(1);
      expect(points2[0].pointName).toBe('2');
      expect(points2[0].easting).toBe(182500.000);
    });

    it('should handle CRLF line endings', () => {
      const state = createParserState();
      const points = processDataChunk('1,182456.789,654321.123,45.67\r\n2,182500.000,654400.000,46.0\r\n', state);
      expect(points).toHaveLength(2);
    });

    it('should skip comments and blanks in stream', () => {
      const state = createParserState();
      const points = processDataChunk('# header\n\n1,182456.789,654321.123,45.67\n', state);
      expect(points).toHaveLength(1);
      expect(points[0].pointName).toBe('1');
    });

    it('should skip header lines in stream', () => {
      const state = createParserState();
      const points = processDataChunk('Name,Easting,Northing,Elevation\n1,182456.789,654321.123,45.67\n', state);
      expect(points).toHaveLength(1);
      expect(points[0].pointName).toBe('1');
    });

    it('should handle an empty chunk', () => {
      const state = createParserState();
      const points = processDataChunk('', state);
      expect(points).toHaveLength(0);
    });

    it('should handle a chunk with no complete lines', () => {
      const state = createParserState();
      const points = processDataChunk('1,182456.789', state);
      expect(points).toHaveLength(0);
      expect(state.buffer).toBe('1,182456.789');
    });

    it('should handle multiple partial chunks assembling one line', () => {
      const state = createParserState();
      expect(processDataChunk('1,', state)).toHaveLength(0);
      expect(processDataChunk('182456.', state)).toHaveLength(0);
      expect(processDataChunk('789,654321.123,45.67\n', state)).toHaveLength(1);
    });
  });
});
