import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About LocZ',
  description:
    'LocZ is a location-first local discovery platform for India — free classifieds, jobs, offers and services near you.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <h1 className="page-title">About LocZ</h1>

      <p>
        LocZ is a location-first place to buy, sell and find things near you — used goods, local
        jobs, offers from nearby shops, services, rooms to rent and businesses in your area. It is
        built for India, starting with Telangana and Andhra Pradesh.
      </p>

      <h2>Posting is free</h2>
      <p>
        Creating an ad, a job vacancy, an offer or a business profile costs nothing, and it will
        stay that way. We may add paid promotion later for businesses that want more visibility, but
        the ability to post and to be found is not something we intend to charge for.
      </p>

      <h2>Local first</h2>
      <p>
        Everything on LocZ is anchored to a place. You can browse a whole city, narrow to a
        locality, or search within one, three, five, ten, twenty-five or fifty kilometres of where
        you are. Sharing your precise location is optional — city-level browsing works just as well.
      </p>

      <h2>Your language</h2>
      <p>
        LocZ is available in English, Telugu and Hindi. You can change language at any time from the
        menu in the header.
      </p>

      <h2>Keeping it clean</h2>
      <p>
        Free posting attracts spam, so every new account&rsquo;s first ads are reviewed by a person
        before they go live, and anything our checks flag goes to the same queue. Read more about{' '}
        <a href="/safety">staying safe on LocZ</a>.
      </p>
    </>
  );
}
