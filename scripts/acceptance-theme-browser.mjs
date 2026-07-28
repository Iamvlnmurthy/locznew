#!/usr/bin/env node

import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
process.env.LOCZ_SCREENSHOT_DIR ??= resolve(root, 'artifacts', 'theme-audit');

const { CdpBrowser } = await import('./acceptance-browser.mjs');

let passed = 0;

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
}

async function pageState(browser, headingSelector) {
  return browser.evaluate(`(() => {
    const parse = (value) => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (rgb) => {
      const channels = rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.03928
          ? channel / 12.92
          : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const bodyStyle = getComputedStyle(document.body);
    const foreground = luminance(parse(bodyStyle.color));
    const background = luminance(parse(bodyStyle.backgroundColor));
    const contrast = (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05);
    const heading = document.querySelector(${JSON.stringify(headingSelector)});
    const visibleToggle = Array.from(document.querySelectorAll('.theme-toggle'))
      .find((button) => getComputedStyle(button).display !== 'none');

    return {
      theme: document.documentElement.dataset.theme,
      storedTheme: localStorage.getItem('locz-theme'),
      headingSize: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
      contrast,
      hasContent: document.body.innerText.trim().length > 100,
      hasOverlay: Boolean(document.querySelector('[data-nextjs-dialog]')),
      hasVisibleToggle: Boolean(visibleToggle),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
}

async function mobileHeaderState(browser) {
  return browser.evaluate(`(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const brand = rect('.header__brand');
    const location = rect('.location-chip');
    const theme = rect('.theme-toggle--mobile');
    const search = rect('.header__row > .searchbar');
    const locationLabel = document.querySelector('.location-chip > span:first-of-type');

    return {
      controlsShareFirstRow: [brand, location, theme].every(Boolean) &&
        Math.max(brand.top, location.top, theme.top) <
          Math.min(brand.bottom, location.bottom, theme.bottom),
      brandHasCompactHitbox: Boolean(brand) && brand.width <= 48,
      searchUsesSecondRow: Boolean(search) &&
        search.top >= Math.max(brand?.bottom ?? 0, location?.bottom ?? 0, theme?.bottom ?? 0),
      searchFitsViewport: Boolean(search) && search.left >= 0 && search.right <= innerWidth,
      locationLabelVisible: Boolean(locationLabel) &&
        getComputedStyle(locationLabel).display !== 'none' &&
        locationLabel.getBoundingClientRect().width > 20,
    };
  })()`);
}

async function assertAccessible(browser, label) {
  const violations = await browser.accessibilityViolations();
  check(
    `${label} has no automated WCAG A/AA violations`,
    violations.length === 0,
    violations.map((violation) => `${violation.id}: ${violation.targets.join(' | ')}`).join(', '),
  );
}

async function main() {
  console.log('LocZ light/dark compact-theme browser acceptance');
  const browser = new CdpBrowser();

  try {
    await browser.start();
    await browser.viewport(1365, 900);
    await browser.navigate('/');
    await browser.evaluate(`
      localStorage.setItem('locz-theme', 'light');
    `);
    await browser.navigate('/?theme-audit=light');
    await browser.evaluate('window.scrollTo(0, 0)');

    let state = await pageState(browser, '.home-hero h1');
    check(
      'desktop light theme renders meaningful content',
      state.theme === 'light' && state.hasContent && !state.hasOverlay,
      `theme=${state.theme}`,
    );
    check('desktop exposes a visible theme control', state.hasVisibleToggle);
    check(
      'desktop compact display type stays below 54px',
      state.headingSize > 20 && state.headingSize <= 54,
    );
    check(
      'desktop light page has no horizontal overflow',
      state.overflow <= 1,
      `${state.overflow}px`,
    );
    check(
      'desktop light foreground contrast is at least 7:1',
      state.contrast >= 7,
      state.contrast.toFixed(2),
    );
    await assertAccessible(browser, 'desktop light home');
    await browser.screenshot('home-light-desktop.png');

    await browser.click('.header__actions .theme-toggle');
    await browser.evaluate('new Promise((resolve) => setTimeout(resolve, 250))');
    state = await pageState(browser, '.home-hero h1');
    check(
      'desktop toggle activates and stores dark theme',
      state.theme === 'dark' && state.storedTheme === 'dark',
    );
    check(
      'desktop dark foreground contrast is at least 7:1',
      state.contrast >= 7,
      state.contrast.toFixed(2),
    );
    await assertAccessible(browser, 'desktop dark home');
    await browser.screenshot('home-dark-desktop.png');

    await browser.navigate('/search?q=phone');
    await browser.evaluate('window.scrollTo(0, 0)');
    state = await pageState(browser, '.search-page__hero h1');
    check(
      'dark choice persists across navigation',
      state.theme === 'dark' && state.storedTheme === 'dark',
    );
    check('dark search has no horizontal overflow', state.overflow <= 1, `${state.overflow}px`);
    await assertAccessible(browser, 'desktop dark search');
    await browser.screenshot('search-dark-desktop.png');

    await browser.viewport(390, 844);
    await browser.evaluate(`
      localStorage.setItem('locz-theme', 'light');
    `);
    await browser.navigate('/?theme-audit=mobile-light');
    await browser.evaluate('window.scrollTo(0, 0)');
    state = await pageState(browser, '.home-hero h1');
    check(
      'mobile compact display type stays below 42px',
      state.headingSize > 20 && state.headingSize <= 42,
    );
    check(
      'mobile light page has no horizontal overflow',
      state.overflow <= 1,
      `${state.overflow}px`,
    );
    check('mobile exposes a visible theme control', state.hasVisibleToggle);
    let headerState = await mobileHeaderState(browser);
    check('mobile header keeps identity controls on its first row', headerState.controlsShareFirstRow);
    check('mobile logo does not reserve invisible desktop space', headerState.brandHasCompactHitbox);
    check('mobile search owns a complete second row', headerState.searchUsesSecondRow);
    check('mobile search stays inside the viewport', headerState.searchFitsViewport);
    check('mobile location remains readable', headerState.locationLabelVisible);
    await assertAccessible(browser, 'mobile light home');
    await browser.screenshot('home-light-mobile.png');

    await browser.click('.theme-toggle--mobile');
    await browser.evaluate('new Promise((resolve) => setTimeout(resolve, 250))');
    state = await pageState(browser, '.home-hero h1');
    check(
      'mobile toggle activates and stores dark theme',
      state.theme === 'dark' && state.storedTheme === 'dark',
    );
    check(
      'mobile dark page has no horizontal overflow',
      state.overflow <= 1,
      `${state.overflow}px`,
    );
    await assertAccessible(browser, 'mobile dark home');
    await browser.screenshot('home-dark-mobile.png');

    await browser.viewport(320, 720);
    await browser.navigate('/?theme-audit=narrow-mobile');
    headerState = await mobileHeaderState(browser);
    state = await pageState(browser, '.home-hero h1');
    check('320px header has no horizontal overflow', state.overflow <= 1, `${state.overflow}px`);
    check('320px search stays inside the viewport', headerState.searchFitsViewport);
    check('320px location remains readable', headerState.locationLabelVisible);

    check(
      'theme journeys emit no browser or server runtime errors',
      browser.errors.length === 0 && browser.httpErrors.length === 0,
      [...browser.errors, ...browser.httpErrors].join(' | '),
    );
  } finally {
    browser.close();
  }

  console.log(`\n${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(`\nTheme browser acceptance failed: ${error.message}`);
  process.exitCode = 1;
});
