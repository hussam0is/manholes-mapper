// map.test.ts
import { createAccuracyCircle } from '../src/map/user-location';
import L from 'leaflet';

describe('GPS Accuracy Circle', () => {
  it('should create accuracy circle with correct color based on accuracy', () => {
    const map = L.map('map').setView([51.505, -0.09], 13);
    const circle = createAccuracyCircle(map, { lat: 51.505, lng: -0.09, accuracy: 3 });
    expect(circle).toBeDefined();
    expect(circle.options.color).toBe('green');
  });

  it('should create red circle for high accuracy', () => {
    const map = L.map('map').setView([51.505, -0.09], 13);
    const circle = createAccuracyCircle(map, { lat: 51.505, lng: -0.09, accuracy: 6 });
    expect(circle).toBeDefined();
    expect(circle.options.color).toBe('red');
  });

  it('should calculate radius correctly', () => {
    const map = L.map('map').setView([51.505, -0.09], 13);
    const circle = createAccuracyCircle(map, { lat: 51.505, lng: -0.09, accuracy: 5 });
    expect(circle).toBeDefined();
    expect(circle.options.radius).toBe(5000);
  });
});