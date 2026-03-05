/**
 * Utility to reduce GeoJSON file size by:
 * 1. Rounding coordinates to specified precision (default 3 decimals)
 * 2. Minifying the JSON output
 * 3. (Optional) Stripping properties
 * 
 * Usage:
 *   node scripts/slim_geojson.js <input_file> <output_file> [precision]
 */

import fs from 'fs';
import path from 'path';

const inputFile = process.argv[2];
const outputFile = process.argv[3];
const precision = parseInt(process.argv[4] || '3', 10);
const whitelist = process.argv[5] ? process.argv[5].split(',') : null;

if (!inputFile || !outputFile) {
  console.log('Usage: node scripts/slim_geojson.js <input_file> <output_file> [precision] [whitelist_keys_comma_separated]');
  process.exit(1);
}

function roundCoords(coords, p) {
  if (typeof coords === 'number') {
    return Math.round(coords * Math.pow(10, p)) / Math.pow(10, p);
  }
  if (Array.isArray(coords)) {
    return coords.map(c => roundCoords(c, p));
  }
  return coords;
}

try {
  console.log(`Reading ${inputFile}...`);
  const rawData = fs.readFileSync(inputFile, 'utf-8');
  const geojson = JSON.parse(rawData);

  if (geojson.type !== 'FeatureCollection' || !geojson.features) {
    throw new Error('Not a FeatureCollection');
  }

  console.log(`Processing ${geojson.features.length} features...`);
  
  geojson.features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.geometry.coordinates = roundCoords(feature.geometry.coordinates, precision);
    }
    
    // Filter properties: remove null, undefined, empty strings, or just whitespace
    if (feature.properties) {
      Object.keys(feature.properties).forEach(key => {
        if (whitelist && !whitelist.includes(key)) {
          delete feature.properties[key];
          return;
        }
        const val = feature.properties[key];
        if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
          delete feature.properties[key];
        }
      });
    }
  });

  // Remove metadata if it exists to save space
  if (geojson.metadata) {
    delete geojson.metadata;
  }

  console.log(`Writing minified output to ${outputFile}...`);
  fs.writeFileSync(outputFile, JSON.stringify(geojson), 'utf-8');

  const oldSize = fs.statSync(inputFile).size / (1024 * 1024);
  const newSize = fs.statSync(outputFile).size / (1024 * 1024);

  console.log(`\nSuccess!`);
  console.log(`Original size: ${oldSize.toFixed(2)} MB`);
  console.log(`New size:      ${newSize.toFixed(2)} MB`);
  console.log(`Reduction:     ${((1 - newSize / oldSize) * 100).toFixed(1)}%`);

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
