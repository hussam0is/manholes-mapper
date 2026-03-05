/**
 * Parses NMEA degrees-minutes format (ddmm.mmmm) to decimal degrees.
 */
function parseCoordinate(coord, dir) {
  if (!coord) return null;
  const decimalIndex = coord.indexOf('.');
  if (decimalIndex === -1) return null;

  const degreeDigits = decimalIndex - 2;
  const degrees = parseFloat(coord.substring(0, degreeDigits));
  const minutes = parseFloat(coord.substring(degreeDigits));
  
  let decimal = degrees + minutes / 60;
  if (dir === 'S' || dir === 'W') decimal = -decimal;
  return decimal;
}

export const FIX_QUALITY = {
  0: 'No Fix',
  1: 'GPS (SPS)',
  2: 'DGPS',
  3: 'PPS',
  4: 'RTK Fixed',
  5: 'RTK Float',
  6: 'Estimated',
};

export function parseNmeaSentence(line) {
  if (!line.startsWith('$')) return null;
  
  const [data, checksum] = line.split('*');
  const parts = data.split(',');
  const type = parts[0];

  if (type.endsWith('GGA')) {
    // $--GGA,time,lat,N,lon,E,fix,sats,hdop,alt,M,geoid,M,age,ref*cs
    return {
      type: 'GGA',
      time: parts[1],
      lat: parseCoordinate(parts[2], parts[3]),
      lon: parseCoordinate(parts[4], parts[5]),
      fix: parseInt(parts[6]) || 0,
      sats: parseInt(parts[7]) || 0,
      hdop: parseFloat(parts[8]) || null,
      alt: parseFloat(parts[9]) || 0,
    };
  }

  if (type.endsWith('RMC')) {
    // $--RMC,time,status,lat,N,lon,E,spd,cog,date,mag,dir,mode*cs
    return {
      type: 'RMC',
      time: parts[1],
      status: parts[2],
      lat: parseCoordinate(parts[3], parts[4]),
      lon: parseCoordinate(parts[5], parts[6]),
      speed: parseFloat(parts[7]) * 1.852, // Knots to km/h
      course: parseFloat(parts[8]) || 0,
      date: parts[9],
    };
  }

  return null;
}
