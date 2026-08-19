import { mapAdzuna } from './local-jobs.service';

describe('mapAdzuna', () => {
  const results = [
    {
      title: 'Senior <b>Flutter</b> Engineer',
      company: { display_name: 'Acme Labs' },
      location: { display_name: 'Hyderabad, Telangana' },
      redirect_url: 'https://adzuna.example/job/1',
      created: '2026-08-19T06:00:00Z',
      salary_min: 1800000.4,
      salary_max: 2500000,
    },
    { title: 'Delivery Partner', redirect_url: 'https://adzuna.example/job/2' },
  ];

  it('maps the displayed fields and strips HTML from the title', () => {
    const [first] = mapAdzuna(results, 6);
    expect(first).toEqual({
      title: 'Senior Flutter Engineer',
      company: 'Acme Labs',
      location: 'Hyderabad, Telangana',
      url: 'https://adzuna.example/job/1',
      postedAt: '2026-08-19T06:00:00Z',
      salaryMin: 1800000,
      salaryMax: 2500000,
    });
  });

  it('defaults missing company/location/salary to null', () => {
    const second = mapAdzuna(results, 6)[1]!;
    expect(second.company).toBeNull();
    expect(second.location).toBeNull();
    expect(second.salaryMin).toBeNull();
    expect(second.salaryMax).toBeNull();
    expect(second.url).toBe('https://adzuna.example/job/2');
  });

  it('respects the limit', () => {
    expect(mapAdzuna(results, 1)).toHaveLength(1);
  });
});
