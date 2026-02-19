/**
 * TSC3 Survey Point Parser
 * Parses text lines from a Trimble TSC3 controller into survey point objects.
 * Supports auto-detection of delimiters and column order.
 */

/**
 * Detect the delimiter used in a CSV/TSV line.
 * @param {string} line - A data line
 * @returns {string} The detected delimiter character
 */
export function detectDelimiter(line) {
  if (line.includes('\t')) return '\t';
  if (line.includes(',')) return ',';
  return ' ';
}

/**
 * Detect whether the format is NEN (name,easting,northing,elev)
 * or NNE (name,northing,easting,elev) using ITM range heuristics.
 * ITM easting: ~100k-300k, northing: ~400k-800k
 * @param {number} val1 - First numeric value
 * @param {number} val2 - Second numeric value
 * @returns {'NEN'|'NNE'} Detected format
 */
export function detectFormat(val1, val2) {
  const isVal1Easting = val1 >= 100000 && val1 <= 300000;
  const isVal1Northing = val1 >= 400000 && val1 <= 800000;
  const isVal2Easting = val2 >= 100000 && val2 <= 300000;
  const isVal2Northing = val2 >= 400000 && val2 <= 800000;

  if (isVal1Easting && isVal2Northing) return 'NEN';
  if (isVal1Northing && isVal2Easting) return 'NNE';

  // Fallback: if val1 < val2, assume NEN (easting < northing in Israel ITM)
  if (val1 < val2) return 'NEN';
  return 'NNE';
}

/**
 * Parse a single survey data line into a point object.
 * @param {string} line - A single trimmed line of text
 * @returns {{ pointName: string, easting: number, northing: number, elevation: number }|null}
 */
export function parseSurveyLine(line) {
  if (!line || typeof line !== 'string') return null;

  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return null;

  const delimiter = detectDelimiter(trimmed);
  const fields = delimiter === ' '
    ? trimmed.split(/\s+/)
    : trimmed.split(delimiter).map(f => f.trim());

  if (fields.length < 3) return null;

  const name = fields[0];
  const num1 = parseFloat(fields[1]);
  const num2 = parseFloat(fields[2]);
  const num3 = fields.length >= 4 ? parseFloat(fields[3]) : 0;

  // Skip header lines where field[1] is non-numeric
  if (isNaN(num1)) return null;
  if (isNaN(num2)) return null;

  const format = detectFormat(num1, num2);

  if (format === 'NEN') {
    return {
      pointName: name,
      easting: num1,
      northing: num2,
      elevation: isNaN(num3) ? 0 : num3,
    };
  } else {
    return {
      pointName: name,
      easting: num2,
      northing: num1,
      elevation: isNaN(num3) ? 0 : num3,
    };
  }
}

/**
 * Create a fresh parser state for streaming data.
 * @returns {{ buffer: string }}
 */
export function createParserState() {
  return { buffer: '' };
}

/**
 * Process a chunk of data that may contain partial lines.
 * Buffers incomplete trailing data for the next chunk.
 * @param {string} chunk - Raw data chunk
 * @param {{ buffer: string }} state - Parser state (mutated in place)
 * @returns {Array<{ pointName: string, easting: number, northing: number, elevation: number }>}
 */
export function processDataChunk(chunk, state) {
  const points = [];

  state.buffer += chunk;

  // Split on newlines (handle both \r\n and \n)
  const lines = state.buffer.split(/\r?\n/);

  // Last element may be an incomplete line — keep it in the buffer
  state.buffer = lines.pop() || '';

  for (const line of lines) {
    const point = parseSurveyLine(line);
    if (point) {
      points.push(point);
    }
  }

  return points;
}
