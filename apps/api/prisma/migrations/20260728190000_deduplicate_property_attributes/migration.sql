-- Removes the category attributes that duplicate columns on `rental_details`.
--
-- `property_type`, `bedrooms` and `furnishing` existed in two places at once: as typed,
-- indexed columns on `rental_details`, and as rows in `category_attributes`. Two homes for
-- one fact can disagree, and here they would have disagreed visibly — the attribute filter
-- reads one while the listing page renders the other, so a search for two-bedroom flats
-- would omit every listing that recorded its bedrooms in the other place.
--
-- The seed no longer creates them, but the seed only upserts: it has no way to remove what a
-- previous run wrote, so production would keep them forever without this.
--
-- Safe to run now and expensive later. No listing has ever recorded a value for any of the
-- three, because the API rejected every request carrying attributes until today (the DTO's
-- `value` property had no validator and the global pipe runs with `forbidNonWhitelisted`).
-- The cascade below is therefore a formality — but it is written to be correct rather than
-- to rely on that remaining true.

DELETE FROM listing_attribute_values
WHERE "attributeId" IN (
  SELECT a.id
  FROM category_attributes a
  JOIN categories c ON c.id = a."categoryId"
  WHERE c.slug = 'real-estate-rentals'
    AND a.key IN ('property_type', 'bedrooms', 'furnishing')
);

DELETE FROM category_attributes
WHERE id IN (
  SELECT a.id
  FROM category_attributes a
  JOIN categories c ON c.id = a."categoryId"
  WHERE c.slug = 'real-estate-rentals'
    AND a.key IN ('property_type', 'bedrooms', 'furnishing')
);
