// Render GPS accuracy circle using position accuracy
const accuracyCircle = L.circle([
  parseFloat(nmeaData.latitude),
  parseFloat(nmeaData.longitude)
], {
  radius: calculateAccuracyRadius(nmeaData.HDOP, nmeaData.satellites)
}).addTo(map);

function calculateAccuracyRadius(HDOP, satellites) {
  // Calculate radius based on HDOP (Horizontal Dilution of Precision)
  // Formula: radius = HDOP * 1000 * (satellites / 10)
  // This provides a more realistic accuracy representation
  return HDOP * 1000 * (satellites / 10);
}