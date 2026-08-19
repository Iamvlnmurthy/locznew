import { CdpBrowser } from './acceptance-browser.mjs';

const browser = new CdpBrowser();
const cards = [
  ['Printing & stationery', 'The Mosel 9', 'Jubilee Hills, Hyderabad', 'business'],
  ['Electrical stores', 'Philips Lighting · Light Lounge & Studio', 'Gachibowli, Hyderabad', 'phones'],
  ['Hotels & stays', 'OYO 41994 Hotel Wall Street', 'Madhapur, Hyderabad', 'food'],
  ['Professional services', 'Tata Capital Housing Finance', 'Banjara Hills, Hyderabad', 'services'],
];

const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const pin = icon('M12 21s7-5.7 7-12a7 7 0 1 0-14 0c0 6.3 7 12 7 12Zm0-9.7A2.3 2.3 0 1 0 12 6.7a2.3 2.3 0 0 0 0 4.6Z');
const nav = icon('m20 4-7 16-2.2-6.8L4 11l16-7Z');
const arrow = icon('m9 18 6-6-6-6');

const markup = `<main style="max-width:1240px;margin:auto;padding:44px 24px 72px">
  <div style="margin-bottom:24px"><span style="color:#e65c43;font-size:.74rem;font-weight:600">Nearby businesses</span><h1 style="margin:7px 0 8px;font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.06">Useful places, close to you.</h1><p style="margin:0;color:#64706b;font-size:.92rem">Premium local recommendations, sorted by distance.</p></div>
  <section class="search-businesses"><div class="search-businesses__grid">${cards.map(([category,name,place,art], index) => `<article class="search-business-card"><span class="search-business-card__link"></span><div class="search-business-card__visual"><img class="search-business-card__art" src="/icons/categories/${art}-premium.webp" alt=""><span>${name[0]}</span></div><div class="search-business-card__content"><div class="search-business-card__head"><span class="search-business-card__category">${category}</span><span class="search-business-card__claim">Claim</span></div><strong class="search-business-card__name">${name}</strong><span class="search-business-card__place">${pin}${place}</span><div class="search-business-card__meta"><span>${nav}${314 + index * 32} m</span><span>${12 - index * 2} listings</span></div><div class="search-business-card__actions"><span class="search-business-card__profile">View profile ${arrow}</span><span class="search-business-card__directions">${nav} Directions</span></div></div></article>`).join('')}</div></section>
</main>`;

try {
  await browser.start();
  await browser.navigate('/');
  for (const [width, height, filename] of [[1440, 900, 'premium-icons-desktop.png'], [390, 844, 'premium-icons-mobile.png']]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await browser.evaluate(`document.body.innerHTML = ${JSON.stringify(markup)}`);
    await browser.waitFor(`Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)`, 'premium icons', 10_000);
    const report = await browser.evaluate(`JSON.stringify({ content: document.body.innerText.trim().length > 0, overlay: Boolean(document.querySelector('[data-nextjs-dialog]')), icons: Array.from(document.querySelectorAll('.search-business-card__art')).map(image => [image.naturalWidth, image.naturalHeight]), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })`);
    console.log(filename, report);
    await browser.screenshot(filename);
  }
} finally {
  browser.close();
}
