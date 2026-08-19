import { mapMetNo, mapWeather } from '../src/weather/weather.mapper';

describe('met.no mapper', () => {
  it('maps a met.no forecast (Celsius, friendly condition)', () => {
    const result = mapMetNo({
      properties: {
        timeseries: [
          {
            data: {
              instant: { details: { air_temperature: 30.4 } },
              next_1_hours: { summary: { symbol_code: 'partlycloudy_day' } },
            },
          },
        ],
      },
    });
    expect(result).toEqual({
      tempC: 30,
      feelsLikeC: 30,
      condition: 'partlycloudy',
      description: 'Partly cloudy',
      icon: 'partlycloudy_day',
      place: null,
    });
  });

  it('returns null when the payload has no temperature', () => {
    expect(mapMetNo({ properties: { timeseries: [] } })).toBeNull();
    expect(mapMetNo({})).toBeNull();
  });
});

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
