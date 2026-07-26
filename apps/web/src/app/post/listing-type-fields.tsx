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
  labels: Record<string, string>;
}

function fieldClass(errors: Record<string, string> | undefined, name: string): string {
  return `field${errors?.[name] ? ' field--error' : ''}`;
}

function FieldError({ errors, name }: { errors?: Record<string, string>; name: string }) {
  return errors?.[name] ? <p className="field__error">{errors[name]}</p> : null;
}

export function ListingTypeFields({ type, errors, labels }: FieldProps & { type: ListingType }) {
  switch (type) {
    case 'JOB':
      return <JobFields errors={errors} labels={labels} />;
    case 'OFFER':
      return <OfferFields errors={errors} labels={labels} />;
    case 'SERVICE':
      return <ServiceFields errors={errors} labels={labels} />;
    case 'RENTAL':
      return <RentalFields errors={errors} labels={labels} />;
    case 'EVENT':
      return <EventFields errors={errors} labels={labels} />;
    case 'BUYER_REQUIREMENT':
      return <BuyerRequirementFields errors={errors} labels={labels} />;
    default:
      return <MarketplaceFields errors={errors} labels={labels} />;
  }
}

function MarketplaceFields({ errors, labels: l }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'price')}>
        <label htmlFor="price">{l.price}</label>
        <input id="price" name="price" type="number" min="0" inputMode="numeric" placeholder="0" />
        <FieldError errors={errors} name="price" />

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="isFree" style={{ width: 'auto', minHeight: 'auto' }} />
          {l.giveAwayFree}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="isNegotiable" style={{ width: 'auto', minHeight: 'auto' }} />
          {l.negotiable}
        </label>
      </div>

      <div className="field">
        <label htmlFor="condition">{l.condition}</label>
        <select id="condition" name="condition" defaultValue="GOOD">
          <option value="NEW">{l.conditionNew}</option>
          <option value="LIKE_NEW">{l.conditionLikeNew}</option>
          <option value="GOOD">{l.conditionGood}</option>
          <option value="FAIR">{l.conditionFair}</option>
          <option value="FOR_PARTS">{l.conditionParts}</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="brand">{l.brandOptional}</label>
        <input id="brand" name="brand" type="text" maxLength={120} />
      </div>
    </>
  );
}

function JobFields({ errors, labels: l }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'companyName')}>
        <label htmlFor="companyName">{l.companyName}</label>
        <input id="companyName" name="companyName" type="text" required maxLength={180} />
        <FieldError errors={errors} name="companyName" />
      </div>

      <div className="field">
        <label htmlFor="employmentType">{l.employmentType}</label>
        <select id="employmentType" name="employmentType" defaultValue="FULL_TIME">
          <option value="FULL_TIME">{l.fullTime}</option>
          <option value="PART_TIME">{l.partTime}</option>
          <option value="CONTRACT">{l.contract}</option>
          <option value="INTERNSHIP">{l.internship}</option>
          <option value="FREELANCE">{l.freelance}</option>
          <option value="TEMPORARY">{l.temporary}</option>
          <option value="DAILY_WAGE">{l.dailyWage}</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="workplaceType">{l.workplaceType}</label>
        <select id="workplaceType" name="workplaceType" defaultValue="ON_SITE">
          <option value="ON_SITE">{l.onSite}</option>
          <option value="HYBRID">{l.hybrid}</option>
          <option value="REMOTE">{l.remote}</option>
        </select>
      </div>

      <div className={fieldClass(errors, 'salaryMax')}>
        <label htmlFor="salaryMin">{l.salaryRange}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="salaryMin"
            name="salaryMin"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={l.minimum}
          />
          <input
            name="salaryMax"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={l.maximum}
            aria-label={l.maximumSalary}
          />
        </div>
        <FieldError errors={errors} name="salaryMax" />
        {/* Stated rather than assumed: hidden salaries measurably reduce applications,
            so the default is to show it and the opt-out is explicit. */}
        <p className="field__hint">{l.salaryHint}</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            name="isSalaryVisible"
            defaultChecked
            style={{ width: 'auto', minHeight: 'auto' }}
          />
          {l.showSalary}
        </label>
      </div>

      <div className="field">
        <label htmlFor="openings">{l.openings}</label>
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
        <label htmlFor="applyMethod">{l.applyMethod}</label>
        <select id="applyMethod" name="applyMethod" defaultValue="IN_APP">
          <option value="IN_APP">{l.applyInApp}</option>
          <option value="WALK_IN">{l.applyWalkIn}</option>
          <option value="PHONE">{l.applyPhone}</option>
          <option value="EXTERNAL_LINK">{l.applyWebsite}</option>
        </select>
        <input
          name="externalApplyUrl"
          type="url"
          placeholder={l.websitePlaceholder}
          style={{ marginTop: 8 }}
        />
        <FieldError errors={errors} name="externalApplyUrl" />
        <textarea
          name="walkInDetails"
          rows={2}
          placeholder={l.walkInPlaceholder}
          style={{ marginTop: 8 }}
        />
      </div>
    </>
  );
}

function OfferFields({ errors, labels: l }: FieldProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className={fieldClass(errors, 'offerPrice')}>
        <label htmlFor="originalPrice">{l.prices}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="originalPrice"
            name="originalPrice"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={l.usualPrice}
          />
          <input
            name="offerPrice"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={l.offerPrice}
            aria-label={l.offerPrice}
          />
        </div>
        <FieldError errors={errors} name="offerPrice" />
        {/* The discount is computed by the API from these two numbers, so a listing can
            never advertise a percentage its own prices contradict. */}
        <p className="field__hint">{l.discountHint}</p>
      </div>

      <div className={fieldClass(errors, 'endsAt')}>
        <label htmlFor="startsAt">{l.validDates}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="startsAt" name="startsAt" type="date" required defaultValue={today} />
          <input name="endsAt" type="date" required aria-label={l.offerEndDate} />
        </div>
        <FieldError errors={errors} name="endsAt" />
      </div>

      <div className="field">
        <label htmlFor="couponCode">{l.couponOptional}</label>
        <input id="couponCode" name="couponCode" type="text" maxLength={40} placeholder="LOCZ30" />
      </div>

      <div className="field">
        <label htmlFor="redemptionInstructions">{l.claimMethod}</label>
        <textarea
          id="redemptionInstructions"
          name="redemptionInstructions"
          rows={2}
          maxLength={1000}
          placeholder={l.claimPlaceholder}
        />
      </div>
    </>
  );
}

function ServiceFields({ errors, labels: l }: FieldProps) {
  return (
    <>
      <div className="field">
        <label htmlFor="serviceType">{l.serviceType}</label>
        <input
          id="serviceType"
          name="serviceType"
          type="text"
          maxLength={120}
          placeholder={l.servicePlaceholder}
        />
      </div>

      <div className={fieldClass(errors, 'priceFrom')}>
        <label htmlFor="priceFrom">{l.charges}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="priceFrom" name="priceFrom" type="number" min="0" placeholder={l.from} />
          <input
            name="priceTo"
            type="number"
            min="0"
            placeholder={l.to}
            aria-label={l.maximumCharge}
          />
        </div>
        <input
          name="pricingUnit"
          type="text"
          maxLength={40}
          placeholder={l.pricingUnit}
          style={{ marginTop: 8 }}
        />
        <FieldError errors={errors} name="priceFrom" />
      </div>

      <div className="field">
        <label htmlFor="experienceYears">{l.experienceYears}</label>
        <input id="experienceYears" name="experienceYears" type="number" min="0" max="60" />
      </div>

      <div className="field">
        <label htmlFor="availability">{l.availability}</label>
        <input
          id="availability"
          name="availability"
          type="text"
          maxLength={180}
          placeholder={l.availabilityPlaceholder}
        />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="servesAtHome" style={{ width: 'auto', minHeight: 'auto' }} />
          {l.visitCustomer}
        </label>
      </div>
    </>
  );
}

function RentalFields({ errors, labels: l }: FieldProps) {
  return (
    <>
      <div className="field">
        <label htmlFor="propertyType">{l.propertyType}</label>
        <select id="propertyType" name="propertyType" defaultValue="FLAT">
          <option value="ROOM">{l.room}</option>
          <option value="FLAT">{l.flat}</option>
          <option value="HOUSE">{l.house}</option>
          <option value="PG">{l.pgHostel}</option>
          <option value="SHOP">{l.shop}</option>
          <option value="OFFICE">{l.office}</option>
        </select>
      </div>

      <div className={fieldClass(errors, 'rentAmount')}>
        <label htmlFor="rentAmount">{l.rentDeposit}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="rentAmount"
            name="rentAmount"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={l.monthlyRent}
          />
          <input
            name="depositAmount"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={l.deposit}
            aria-label={l.deposit}
          />
        </div>
        <FieldError errors={errors} name="rentAmount" />
      </div>

      <div className="field">
        <label htmlFor="bedrooms">{l.bedBathArea}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min="0"
            max="20"
            placeholder={l.beds}
          />
          <input
            name="bathrooms"
            type="number"
            min="0"
            max="20"
            placeholder={l.baths}
            aria-label={l.bathrooms}
          />
          <input
            name="areaSqft"
            type="number"
            min="1"
            placeholder={l.squareFeet}
            aria-label={l.areaSquareFeet}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="furnishing">{l.furnishing}</label>
        <select id="furnishing" name="furnishing" defaultValue="UNFURNISHED">
          <option value="UNFURNISHED">{l.unfurnished}</option>
          <option value="SEMI">{l.semiFurnished}</option>
          <option value="FULL">{l.fullyFurnished}</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="preferredTenant">{l.preferredTenant}</label>
        <input
          id="preferredTenant"
          name="preferredTenant"
          type="text"
          maxLength={60}
          placeholder={l.tenantPlaceholder}
        />
      </div>
    </>
  );
}

function EventFields({ errors, labels: l }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'startsAt')}>
        <label htmlFor="startsAt">{l.startsEnds}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="startsAt" name="startsAt" type="datetime-local" required />
          <input name="endsAt" type="datetime-local" aria-label={l.eventEnd} />
        </div>
        <FieldError errors={errors} name="startsAt" />
      </div>

      <div className="field">
        <label htmlFor="venueName">{l.venue}</label>
        <input id="venueName" name="venueName" type="text" maxLength={180} />
      </div>

      <div className="field">
        <label htmlFor="ticketPrice">{l.entry}</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            name="isFreeEntry"
            defaultChecked
            style={{ width: 'auto', minHeight: 'auto' }}
          />
          {l.freeEntry}
        </label>
        <input
          id="ticketPrice"
          name="ticketPrice"
          type="number"
          min="0"
          placeholder={l.ticketPrice}
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="field">
        <label htmlFor="organiser">{l.organiser}</label>
        <input id="organiser" name="organiser" type="text" maxLength={180} />
      </div>
    </>
  );
}

function BuyerRequirementFields({ errors, labels: l }: FieldProps) {
  return (
    <>
      <div className={fieldClass(errors, 'budgetMax')}>
        <label htmlFor="budgetMin">{l.yourBudget}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="budgetMin" name="budgetMin" type="number" min="0" placeholder={l.from} />
          <input
            name="budgetMax"
            type="number"
            min="0"
            placeholder={l.upTo}
            aria-label={l.maximumBudget}
          />
        </div>
        <FieldError errors={errors} name="budgetMax" />
      </div>

      <div className="field">
        <label htmlFor="requiredBy">{l.neededByOptional}</label>
        <input id="requiredBy" name="requiredBy" type="date" />
      </div>

      <div className="field">
        <label htmlFor="preferredCondition">{l.acceptedCondition}</label>
        <select id="preferredCondition" name="preferredCondition" defaultValue="GOOD">
          <option value="NEW">{l.newOnly}</option>
          <option value="LIKE_NEW">{l.likeNewBetter}</option>
          <option value="GOOD">{l.goodBetter}</option>
          <option value="FAIR">{l.anythingWorking}</option>
        </select>
      </div>
    </>
  );
}
