import { cleanAlertTitle, filterAlertsByArea, parseAlertsRss } from './local-alerts.service';

describe('cleanAlertTitle', () => {
  it('collapses the district-code list to the state and drops the issuer suffix', () => {
    const raw =
      'Thunderstorm accompanied with Lightning and Gusty winds (30-40 kmph) is very likely to ' +
      'occur at isolated places over ADL, BDDK, HNM, JGTL, WRGL districts of Telangana in next ' +
      '24 hours by TGiCCC.';
    expect(cleanAlertTitle(raw)).toBe(
      'Thunderstorm accompanied with Lightning and Gusty winds (30-40 kmph) is very likely to ' +
        'occur at isolated places over Telangana in next 24 hours',
    );
  });

  it('leaves a title with no district codes untouched', () => {
    const raw = 'Heavy rain very likely over Telangana in the next 3 hours';
    expect(cleanAlertTitle(raw)).toBe(raw);
  });
});

const SAMPLE = `<rss><channel>
  <item>
    <title>Heavy rain very likely over Telangana in the next 3 hours</title>
    <category>Met</category>
    <pubDate>Wed, 19 Aug 2026 10:35:18 GMT</pubDate>
  </item>
  <item>
    <title>Thunderstorm warning for Hyderabad &amp; Rangareddy districts</title>
    <category>Met</category>
    <pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Cyclone alert for coastal Odisha</title>
    <category>Met</category>
    <pubDate>Wed, 19 Aug 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('parseAlertsRss', () => {
  it('extracts title, category and iso date, decoding entities', () => {
    const alerts = parseAlertsRss(SAMPLE);
    expect(alerts).toHaveLength(3);
    expect(alerts[1]).toEqual({
      title: 'Thunderstorm warning for Hyderabad & Rangareddy districts',
      category: 'Met',
      publishedAt: '2026-08-19T10:00:00.000Z',
    });
  });
});

describe('filterAlertsByArea', () => {
  const alerts = parseAlertsRss(SAMPLE);

  it('keeps alerts whose text names the area (city or state)', () => {
    const forHyderabad = filterAlertsByArea(alerts, ['Hyderabad', 'Telangana'], 4);
    expect(forHyderabad.map((a) => a.title)).toEqual([
      'Heavy rain very likely over Telangana in the next 3 hours',
      'Thunderstorm warning for Hyderabad & Rangareddy districts',
    ]);
  });

  it('excludes alerts for other areas', () => {
    expect(
      filterAlertsByArea(alerts, ['Hyderabad'], 4).some((a) => a.title.includes('Odisha')),
    ).toBe(false);
  });

  it('ignores terms shorter than 3 chars and returns nothing with no usable terms', () => {
    expect(filterAlertsByArea(alerts, ['', 'ab'], 4)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(filterAlertsByArea(alerts, ['a'], 4)).toEqual([]); // 'a' too short → no terms
    expect(filterAlertsByArea(alerts, ['warning', 'over', 'for'], 1)).toHaveLength(1);
  });
});
