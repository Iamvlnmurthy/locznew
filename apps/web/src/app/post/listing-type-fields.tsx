'use client';

import type { ListingType } from '@locz/shared-types';

/**
 * The type-specific half of the posting form.
 *
 * Each block mirrors one API detail payload. Kept in a single component keyed by type
 * rather than as separate routes: the shared half (title, description, category, city,
 * contact) is identical for all of them, and splitting would duplicate it eight times.
 */

interface FieldProps {
  errors?: Record<string, string>;
}

function fieldClass(errors: Record<string, string> | undefined, name: string): string {
  return `field${errors?.[name] ? ' field--error' : ''}`;
}

function FieldError({ errors, name }: { errors?: Record<string, string>; name: string }) {
  return errors?.[name] ? <p className="field__error">{errors[name]}</p> : null;
}

export function ListingTypeFields({ type, errors }: FieldProps & { type: ListingType }) {
  switch (type) {
    case 'JOB':
      return <JobFields errors={errors} />;
    case 'OFFER':
      return <OfferFields errors={errors} />;
    case 'SERVICE':
      return <ServiceFields errors={errors} />;
    case 'RENTAL':
      return <RentalFields errors={errors} />;
    case 'EVENT':
      return <EventFields errors={errors} />;
    case 'BUYER_REQUIREMENT':
      return <BuyerRequirementFields errors={errors} />;
    default:
      return <MarketplaceFields errors={errors} />;
  }
}

function MarketplaceFields({ errors }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'price')}>
        <label htmlFor="price">Price (₹)</label>
        <input id="price" name="price" type="number" min="0" inputMode="numeric" placeholder="0" />
        <FieldError errors={errors} name="price" />

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="isFree" style={{ width: 'auto', minHeight: 'auto' }} />
          I&rsquo;m giving this away free
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="isNegotiable" style={{ width: 'auto', minHeight: 'auto' }} />
          Price is negotiable
        </label>
      </div>

      <div className="field">
        <label htmlFor="condition">Condition</label>
        <select id="condition" name="condition" defaultValue="GOOD">
          <option value="NEW">New</option>
          <option value="LIKE_NEW">Like new</option>
          <option value="GOOD">Good</option>
          <option value="FAIR">Fair</option>
          <option value="FOR_PARTS">For parts</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="brand">Brand (optional)</label>
        <input id="brand" name="brand" type="text" maxLength={120} />
      </div>
    </>
  );
}

function JobFields({ errors }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'companyName')}>
        <label htmlFor="companyName">Company name</label>
        <input id="companyName" name="companyName" type="text" required maxLength={180} />
        <FieldError errors={errors} name="companyName" />
      </div>

      <div className="field">
        <label htmlFor="employmentType">Employment type</label>
        <select id="employmentType" name="employmentType" defaultValue="FULL_TIME">
          <option value="FULL_TIME">Full-time</option>
          <option value="PART_TIME">Part-time</option>
          <option value="CONTRACT">Contract</option>
          <option value="INTERNSHIP">Internship</option>
          <option value="FREELANCE">Freelance</option>
          <option value="TEMPORARY">Temporary</option>
          <option value="DAILY_WAGE">Daily wage</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="workplaceType">Where is the work?</label>
        <select id="workplaceType" name="workplaceType" defaultValue="ON_SITE">
          <option value="ON_SITE">On-site</option>
          <option value="HYBRID">Hybrid</option>
          <option value="REMOTE">Remote</option>
        </select>
      </div>

      <div className={fieldClass(errors, 'salaryMax')}>
        <label htmlFor="salaryMin">Salary range (₹ per month)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="salaryMin"
            name="salaryMin"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Minimum"
          />
          <input
            name="salaryMax"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Maximum"
            aria-label="Maximum salary"
          />
        </div>
        <FieldError errors={errors} name="salaryMax" />
        {/* Stated rather than assumed: hidden salaries measurably reduce applications,
            so the default is to show it and the opt-out is explicit. */}
        <p className="field__hint">
          Jobs that show a salary get far more applicants. Untick only if you must.
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            name="isSalaryVisible"
            defaultChecked
            style={{ width: 'auto', minHeight: 'auto' }}
          />
          Show the salary on the listing
        </label>
      </div>

      <div className="field">
        <label htmlFor="openings">Number of openings</label>
        <input
          id="openings"
          name="openings"
          type="number"
          min="1"
          defaultValue="1"
          inputMode="numeric"
        />
      </div>

      <div className={fieldClass(errors, 'externalApplyUrl')}>
        <label htmlFor="applyMethod">How should people apply?</label>
        <select id="applyMethod" name="applyMethod" defaultValue="IN_APP">
          <option value="IN_APP">Message me on LocZ</option>
          <option value="WALK_IN">Walk in</option>
          <option value="PHONE">Call me</option>
          <option value="EXTERNAL_LINK">Apply on our website</option>
        </select>
        <input
          name="externalApplyUrl"
          type="url"
          placeholder="https://… (only for website applications)"
          style={{ marginTop: 8 }}
        />
        <FieldError errors={errors} name="externalApplyUrl" />
        <textarea
          name="walkInDetails"
          rows={2}
          placeholder="Walk-in address and timings (only for walk-in)"
          style={{ marginTop: 8 }}
        />
      </div>
    </>
  );
}

function OfferFields({ errors }: FieldProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className={fieldClass(errors, 'offerPrice')}>
        <label htmlFor="originalPrice">Prices (₹)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="originalPrice"
            name="originalPrice"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Usual price"
          />
          <input
            name="offerPrice"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Offer price"
            aria-label="Offer price"
          />
        </div>
        <FieldError errors={errors} name="offerPrice" />
        {/* The discount is computed by the API from these two numbers, so a listing can
            never advertise a percentage its own prices contradict. */}
        <p className="field__hint">The discount percentage is worked out from these.</p>
      </div>

      <div className={fieldClass(errors, 'endsAt')}>
        <label htmlFor="startsAt">Valid from / until</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="startsAt" name="startsAt" type="date" required defaultValue={today} />
          <input name="endsAt" type="date" required aria-label="Offer end date" />
        </div>
        <FieldError errors={errors} name="endsAt" />
      </div>

      <div className="field">
        <label htmlFor="couponCode">Coupon code (optional)</label>
        <input id="couponCode" name="couponCode" type="text" maxLength={40} placeholder="LOCZ30" />
      </div>

      <div className="field">
        <label htmlFor="redemptionInstructions">How do people claim it?</label>
        <textarea
          id="redemptionInstructions"
          name="redemptionInstructions"
          rows={2}
          maxLength={1000}
          placeholder="Show this ad at the counter"
        />
      </div>
    </>
  );
}

function ServiceFields({ errors }: FieldProps) {
  return (
    <>
      <div className="field">
        <label htmlFor="serviceType">What service do you provide?</label>
        <input
          id="serviceType"
          name="serviceType"
          type="text"
          maxLength={120}
          placeholder="Plumbing, tuition, catering…"
        />
      </div>

      <div className={fieldClass(errors, 'priceFrom')}>
        <label htmlFor="priceFrom">Charges (₹)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="priceFrom" name="priceFrom" type="number" min="0" placeholder="From" />
          <input
            name="priceTo"
            type="number"
            min="0"
            placeholder="To"
            aria-label="Maximum charge"
          />
        </div>
        <input
          name="pricingUnit"
          type="text"
          maxLength={40}
          placeholder="per visit / per hour / per month"
          style={{ marginTop: 8 }}
        />
        <FieldError errors={errors} name="priceFrom" />
      </div>

      <div className="field">
        <label htmlFor="experienceYears">Years of experience</label>
        <input id="experienceYears" name="experienceYears" type="number" min="0" max="60" />
      </div>

      <div className="field">
        <label htmlFor="availability">When are you available?</label>
        <input
          id="availability"
          name="availability"
          type="text"
          maxLength={180}
          placeholder="Mon–Sat, 8am–8pm"
        />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="servesAtHome" style={{ width: 'auto', minHeight: 'auto' }} />
          I visit the customer
        </label>
      </div>
    </>
  );
}

function RentalFields({ errors }: FieldProps) {
  return (
    <>
      <div className="field">
        <label htmlFor="propertyType">Property type</label>
        <select id="propertyType" name="propertyType" defaultValue="FLAT">
          <option value="ROOM">Room</option>
          <option value="FLAT">Flat</option>
          <option value="HOUSE">House</option>
          <option value="PG">PG / hostel</option>
          <option value="SHOP">Shop</option>
          <option value="OFFICE">Office</option>
        </select>
      </div>

      <div className={fieldClass(errors, 'rentAmount')}>
        <label htmlFor="rentAmount">Rent and deposit (₹)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="rentAmount"
            name="rentAmount"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Monthly rent"
          />
          <input
            name="depositAmount"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Deposit"
            aria-label="Deposit"
          />
        </div>
        <FieldError errors={errors} name="rentAmount" />
      </div>

      <div className="field">
        <label htmlFor="bedrooms">Bedrooms / bathrooms / area</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="bedrooms" name="bedrooms" type="number" min="0" max="20" placeholder="Beds" />
          <input
            name="bathrooms"
            type="number"
            min="0"
            max="20"
            placeholder="Baths"
            aria-label="Bathrooms"
          />
          <input
            name="areaSqft"
            type="number"
            min="1"
            placeholder="sq ft"
            aria-label="Area in square feet"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="furnishing">Furnishing</label>
        <select id="furnishing" name="furnishing" defaultValue="UNFURNISHED">
          <option value="UNFURNISHED">Unfurnished</option>
          <option value="SEMI">Semi-furnished</option>
          <option value="FULL">Fully furnished</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="preferredTenant">Preferred tenant</label>
        <input
          id="preferredTenant"
          name="preferredTenant"
          type="text"
          maxLength={60}
          placeholder="Family / bachelors / anyone"
        />
      </div>
    </>
  );
}

function EventFields({ errors }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'startsAt')}>
        <label htmlFor="startsAt">Starts / ends</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="startsAt" name="startsAt" type="datetime-local" required />
          <input name="endsAt" type="datetime-local" aria-label="Event end" />
        </div>
        <FieldError errors={errors} name="startsAt" />
      </div>

      <div className="field">
        <label htmlFor="venueName">Venue</label>
        <input id="venueName" name="venueName" type="text" maxLength={180} />
      </div>

      <div className="field">
        <label htmlFor="ticketPrice">Entry</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            name="isFreeEntry"
            defaultChecked
            style={{ width: 'auto', minHeight: 'auto' }}
          />
          Free entry
        </label>
        <input
          id="ticketPrice"
          name="ticketPrice"
          type="number"
          min="0"
          placeholder="Ticket price (₹)"
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="field">
        <label htmlFor="organiser">Organiser</label>
        <input id="organiser" name="organiser" type="text" maxLength={180} />
      </div>
    </>
  );
}

function BuyerRequirementFields({ errors }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'budgetMax')}>
        <label htmlFor="budgetMin">Your budget (₹)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="budgetMin" name="budgetMin" type="number" min="0" placeholder="From" />
          <input
            name="budgetMax"
            type="number"
            min="0"
            placeholder="Up to"
            aria-label="Maximum budget"
          />
        </div>
        <FieldError errors={errors} name="budgetMax" />
      </div>

      <div className="field">
        <label htmlFor="requiredBy">Needed by (optional)</label>
        <input id="requiredBy" name="requiredBy" type="date" />
      </div>

      <div className="field">
        <label htmlFor="preferredCondition">Condition you would accept</label>
        <select id="preferredCondition" name="preferredCondition" defaultValue="GOOD">
          <option value="NEW">New only</option>
          <option value="LIKE_NEW">Like new or better</option>
          <option value="GOOD">Good or better</option>
          <option value="FAIR">Anything working</option>
        </select>
      </div>
    </>
  );
}
