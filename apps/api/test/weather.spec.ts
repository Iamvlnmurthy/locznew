import { mapWeather } from '../src/weather/weather.mapper';

describe('weather mapper', () => {
  it('maps a valid OpenWeather payload', () => {
    const result = mapWeather({
      name: 'Hyderabad',
      main: { temp: 29.6, feels_like: 32.1 },
      weather: [{ main: 'Clouds', description: 'broken clouds', icon: '04d' }],
    });
    expect(result).toEqual({
      tempC: 30,
      feelsLikeC: 32,
      condition: 'Clouds',
      description: 'broken clouds',
      icon: '04d',
      place: 'Hyderabad',
    });
  });

  it('returns null (never invented values) when essentials are missing', () => {
    expect(mapWeather({ main: {} })).toBeNull();
    expect(mapWeather({ weather: [{ main: 'Rain' }] })).toBeNull();
    expect(mapWeather({})).toBeNull();
  });
});
