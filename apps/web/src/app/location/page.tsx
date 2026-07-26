import type { Metadata } from 'next';
import Image from 'next/image';
import type { City } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';
import { LocationPicker } from './location-picker';

export const metadata: Metadata = {
  title: 'Choose your location',
  robots: { index: false, follow: true },
};

export default async function LocationPage() {
  const [locale, cities, current] = await Promise.all([
    getLocale(),
    apiSafe<City[]>('/locations/cities?limit=50', { revalidate: 3600 }),
    getSelectedCity(),
  ]);

  const t = getTranslator(locale);

  return (
    <main className="location-page">
      <div className="container location-page__inner">
        <section className="location-page__story">
          <span className="eyebrow">
            <i /> {t('location.pageEyebrow')}
          </span>
          <h1>{t('location.pageTitle')}</h1>
          <p>{t('location.pageSubtitle')}</p>

          <div className="location-page__benefits">
            <div>
              <span>
                <Icon name="location" width="20" height="20" />
              </span>
              <div>
                <strong>{t('location.benefitLocalTitle')}</strong>
                <small>{t('location.benefitLocalText')}</small>
              </div>
            </div>
            <div>
              <span>
                <Icon name="shield" width="20" height="20" />
              </span>
              <div>
                <strong>{t('location.benefitPrivateTitle')}</strong>
                <small>{t('location.benefitPrivateText')}</small>
              </div>
            </div>
          </div>

          <div className="location-page__art" aria-hidden="true">
            <Image
              src="/illustrations/empty-neighbourhood.webp"
              alt=""
              width="420"
              height="345"
              priority
            />
          </div>
        </section>

        <section className="location-page__picker">
          <div className="location-page__picker-head">
            <span>{t('location.stepLabel')}</span>
            <h2>{t('location.chooseArea')}</h2>
            <p>
              {current
                ? t('location.currentlyBrowsing', { city: current.name })
                : t('location.chooseHint')}
            </p>
          </div>
          <LocationPicker
            cities={cities ?? []}
            currentCityId={current?.id ?? null}
            labels={{
              useCurrent: t('location.useCurrent'),
              searchCity: t('location.searchCity'),
              detecting: t('location.detecting'),
              permissionDenied: t('location.permissionDenied'),
              outsideLaunchArea: t('location.outsideLaunchArea'),
              pincodeLabel: t('location.pincodeLabel'),
              pincodePlaceholder: t('location.pincodePlaceholder'),
              pincodeApply: t('location.pincodeApply'),
              pincodeUnknown: t('location.pincodeUnknown'),
              gpsHint: t('location.gpsHint'),
              pincodeHint: t('location.pincodePrivacyHint'),
              citiesLabel: t('location.popularCities'),
              liveNow: t('location.liveNow'),
              comingSoon: t('location.comingSoon'),
              selected: t('location.selected'),
              noCityMatches: t('location.noCityMatches'),
              openingArea: t('location.openingArea'),
            }}
          />
        </section>
      </div>
    </main>
  );
}
