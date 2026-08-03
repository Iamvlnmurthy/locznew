-- Somewhere to post a packet of tea powder.
--
-- The taxonomy was an OLX tree: phones, cars, furniture, plus jobs, services and property.
-- Only eight categories accepted a PRODUCT listing and all eight were second-hand goods, so
-- a kirana shop had nowhere to list what it actually sells. Meanwhile 3.4 million businesses
-- sit in the directory with no way to name a single item on their shelves.
--
-- The 46 imported directory categories are deliberately not reused for this: they are
-- `isDirectoryOnly`, kept out of the posting flow so that somebody listing a used phone is
-- never shown "hospitals and clinics". This is the postable tree, and it is separate.
--
-- Two levels, not three. A third level is where a category list stops being read.
-- Individual products are not categories — "tea powder" is a listing title inside
-- "Tea, Coffee & Beverages", and `searchTerms` is what makes it findable in any of the
-- three languages.
INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Groceries & Provisions','కిరాణా సామాగ్రి','किराना सामान','groceries-provisions',ARRAY['kirana','grocery','provisions','ration'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],100,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Rice & Grains','బియ్యం మరియు ధాన్యాలు','चावल और अनाज','rice-grains',ARRAY['rice','biyyam','chawal','sona masoori','basmati'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Pulses & Dals','పప్పులు','दालें','pulses-dals',ARRAY['dal','pappu','toor','moong','chana'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Cooking Oil & Ghee','వంట నూనె మరియు నెయ్యి','खाना पकाने का तेल और घी','cooking-oil-ghee',ARRAY['oil','nune','tel','ghee','neyyi','sunflower oil'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Spices & Masalas','మసాలాలు','मसाले','spices-masalas',ARRAY['masala','spices','chilli','turmeric','haldi','karam'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Tea, Coffee & Beverages','టీ, కాఫీ మరియు పానీయాలు','चाय, कॉफ़ी और पेय','tea-coffee-beverages',ARRAY['tea','tea powder','chai','coffee','juice','soft drink'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Flour & Atta','పిండి','आटा','flour-atta',ARRAY['atta','flour','maida','pindi','rava','sooji'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Sugar, Salt & Jaggery','చక్కెర, ఉప్పు మరియు బెల్లం','चीनी, नमक और गुड़','sugar-salt-jaggery',ARRAY['sugar','chakkera','salt','uppu','jaggery','bellam','gud'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],60,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Dry Fruits & Nuts','డ్రై ఫ్రూట్స్','सूखे मेवे','dry-fruits-nuts',ARRAY['dry fruits','badam','almond','cashew','kaju'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],70,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Snacks & Namkeen','స్నాక్స్','स्नैक्स और नमकीन','snacks-namkeen',ARRAY['snacks','namkeen','chips','biscuits','mixture'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],80,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Pickles & Papads','ఊరగాయలు మరియు అప్పడాలు','अचार और पापड़','pickles-papads',ARRAY['pickle','achar','uragaya','papad','appadam'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],90,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Ready to Cook & Instant','రెడీ టు కుక్','रेडी टू कुक','ready-to-cook',ARRAY['instant','ready to cook','noodles','vermicelli','semiya'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],100,true,now(),now()
FROM categories p WHERE p.slug='groceries-provisions' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Fruits & Vegetables','పండ్లు మరియు కూరగాయలు','फल और सब्ज़ियाँ','fruits-vegetables',ARRAY['vegetables','fruits','kuragayalu','sabzi'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],110,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Fresh Vegetables','తాజా కూరగాయలు','ताज़ी सब्ज़ियाँ','fresh-vegetables',ARRAY['vegetables','kuragayalu','sabzi','tomato','onion','potato'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='fruits-vegetables' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Fresh Fruits','తాజా పండ్లు','ताज़े फल','fresh-fruits',ARRAY['fruits','pandlu','phal','mango','banana','apple'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='fruits-vegetables' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Leafy Greens & Herbs','ఆకుకూరలు','पत्तेदार सब्ज़ियाँ','leafy-greens',ARRAY['greens','akukura','palak','coriander','kothimeera'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='fruits-vegetables' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Organic Produce','సేంద్రియ ఉత్పత్తులు','जैविक उत्पाद','organic-produce',ARRAY['organic','sendriya','natural farming'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='fruits-vegetables' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Dairy, Bakery & Eggs','పాలు, బేకరీ మరియు గుడ్లు','डेयरी, बेकरी और अंडे','dairy-bakery-eggs',ARRAY['milk','dairy','bakery','eggs','palu','doodh'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],120,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Milk, Curd & Butter','పాలు మరియు పెరుగు','दूध और दही','milk-curd',ARRAY['milk','palu','doodh','curd','perugu','dahi','butter'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='dairy-bakery-eggs' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Paneer & Cheese','పనీర్ మరియు చీజ్','पनीर और चीज़','paneer-cheese',ARRAY['paneer','cheese'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='dairy-bakery-eggs' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Bread & Buns','బ్రెడ్ మరియు బన్స్','ब्रेड और बन','bread-buns',ARRAY['bread','bun','pav','rusk'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='dairy-bakery-eggs' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Cakes & Pastries','కేకులు మరియు పేస్ట్రీలు','केक और पेस्ट्री','cakes-pastries',ARRAY['cake','pastry','birthday cake','cookies'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='dairy-bakery-eggs' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Sweets & Mithai','స్వీట్లు','मिठाई','sweets-mithai',ARRAY['sweets','mithai','laddu','mysore pak','halwa'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='dairy-bakery-eggs' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Eggs','గుడ్లు','अंडे','eggs',ARRAY['eggs','gudlu','ande'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='dairy-bakery-eggs' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Meat, Fish & Poultry','మాంసం, చేపలు మరియు కోడి','मांस, मछली और मुर्गी','meat-fish-poultry',ARRAY['meat','chicken','fish','mutton','chepalu'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],130,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Chicken','చికెన్','चिकन','chicken',ARRAY['chicken','kodi','murgi','broiler','country chicken'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='meat-fish-poultry' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Mutton & Goat','మటన్','मटन','mutton',ARRAY['mutton','goat','meka','bakra'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='meat-fish-poultry' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Fish & Seafood','చేపలు మరియు సముద్ర ఆహారం','मछली और समुद्री भोजन','fish-seafood',ARRAY['fish','chepa','machli','prawns','royyalu','crab'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='meat-fish-poultry' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Processed & Frozen Meat','ప్రాసెస్డ్ మాంసం','प्रसंस्कृत मांस','processed-meat',ARRAY['frozen','sausage','kebab','cold cuts'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='meat-fish-poultry' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Health & Personal Care','ఆరోగ్యం మరియు వ్యక్తిగత సంరక్షణ','स्वास्थ्य और व्यक्तिगत देखभाल','health-personal-care',ARRAY['medicine','health','personal care','medical'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],140,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Medicines & Pharmacy','మందులు','दवाइयाँ','medicines-pharmacy',ARRAY['medicine','tablets','pharmacy','mandulu','dawai','medical store'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Ayurveda & Herbal','ఆయుర్వేదం','आयुर्वेद','ayurveda-herbal',ARRAY['ayurveda','herbal','churna','kashayam'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Skin Care','చర్మ సంరక్షణ','त्वचा की देखभाल','skin-care',ARRAY['cream','lotion','face wash','soap','sunscreen'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Hair Care','జుట్టు సంరక్షణ','बालों की देखभाल','hair-care',ARRAY['shampoo','hair oil','conditioner'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Bath & Body','స్నానం మరియు శరీర సంరక్షణ','स्नान और शरीर','bath-body',ARRAY['soap','body wash','talc','deodorant'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Oral Care','దంత సంరక్షణ','मौखिक देखभाल','oral-care',ARRAY['toothpaste','toothbrush','mouthwash'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Health Devices','ఆరోగ్య పరికరాలు','स्वास्थ्य उपकरण','health-devices',ARRAY['bp monitor','thermometer','glucometer','nebulizer','wheelchair'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],60,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Supplements & Nutrition','పోషక సప్లిమెంట్లు','पोषण अनुपूरक','supplements',ARRAY['protein','vitamins','health drink','supplement'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],70,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Sanitary & Hygiene','పరిశుభ్రత ఉత్పత్తులు','स्वच्छता उत्पाद','sanitary-hygiene',ARRAY['sanitary pads','diapers','hand wash','sanitizer','mask'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],80,true,now(),now()
FROM categories p WHERE p.slug='health-personal-care' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Beauty & Cosmetics','అందం మరియు సౌందర్య సాధనాలు','सौंदर्य और कॉस्मेटिक्स','beauty-cosmetics',ARRAY['cosmetics','beauty','makeup'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],150,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Makeup','మేకప్','मेकअप','makeup',ARRAY['makeup','lipstick','kajal','foundation','nail polish'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='beauty-cosmetics' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Perfumes & Fragrances','పరిమళాలు','इत्र और सुगंध','fragrances',ARRAY['perfume','attar','deodorant','scent'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='beauty-cosmetics' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Grooming','గ్రూమింగ్','ग्रूमिंग','grooming',ARRAY['shaving','razor','trimmer','beard oil'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='beauty-cosmetics' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Salon & Spa Products','సెలూన్ ఉత్పత్తులు','सैलून उत्पाद','salon-supplies',ARRAY['salon','spa','hair colour','mehendi'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='beauty-cosmetics' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Clothing & Footwear','దుస్తులు మరియు పాదరక్షలు','कपड़े और जूते','clothing-footwear',ARRAY['clothes','dress','footwear','battalu','kapde'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],160,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Mens Clothing','పురుషుల దుస్తులు','पुरुषों के कपड़े','mens-clothing',ARRAY['shirt','pant','tshirt','kurta','dhoti','lungi'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Womens Clothing','మహిళల దుస్తులు','महिलाओं के कपड़े','womens-clothing',ARRAY['kurti','dress','top','leggings','nighty'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Sarees & Ethnic Wear','చీరలు మరియు సాంప్రదాయ దుస్తులు','साड़ी और पारंपरिक परिधान','sarees-ethnic',ARRAY['saree','cheera','lehenga','salwar','half saree','langa voni'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Kids Clothing','పిల్లల దుస్తులు','बच्चों के कपड़े','kids-clothing',ARRAY['kids wear','baby clothes','school uniform'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Footwear','పాదరక్షలు','जूते-चप्पल','footwear',ARRAY['shoes','chappal','sandals','slippers','cheppulu'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Bags & Luggage','సంచులు మరియు లగేజ్','बैग और सामान','bags-luggage',ARRAY['bag','backpack','suitcase','trolley','handbag'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Watches & Accessories','వాచీలు మరియు యాక్సెసరీలు','घड़ियाँ और सहायक उपकरण','watches-accessories',ARRAY['watch','belt','wallet','sunglasses','cap'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],60,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Jewellery & Imitation','ఆభరణాలు','आभूषण','jewellery',ARRAY['jewellery','gold','silver','imitation','bangles','gajulu'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],70,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Fabric & Tailoring Material','వస్త్రం మరియు టైలరింగ్','कपड़ा और सिलाई सामग्री','fabric-tailoring',ARRAY['cloth','fabric','tailoring','thread','button'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],80,true,now(),now()
FROM categories p WHERE p.slug='clothing-footwear' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Home & Kitchen','ఇల్లు మరియు వంటగది','घर और रसोई','home-kitchen',ARRAY['home','kitchen','household','illu','ghar'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],170,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Cookware & Utensils','వంట పాత్రలు','बर्तन','cookware-utensils',ARRAY['utensils','cooker','kadai','patralu','bartan','steel vessels'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Storage & Containers','నిల్వ డబ్బాలు','भंडारण डिब्बे','storage-containers',ARRAY['container','dabba','storage box','jar'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Cleaning & Detergents','శుభ్రత సామాగ్రి','सफ़ाई का सामान','cleaning-supplies',ARRAY['detergent','soap','phenyl','broom','cleaning'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Home Decor','గృహ అలంకరణ','घर की सजावट','home-decor',ARRAY['decor','wall art','showpiece','photo frame','vase'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Bedding & Curtains','పరుపులు మరియు కర్టెన్లు','बिस्तर और पर्दे','bedding-curtains',ARRAY['bedsheet','pillow','mattress','curtain','blanket'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Lighting & Electricals','లైటింగ్ మరియు ఎలక్ట్రికల్స్','रोशनी और बिजली का सामान','lighting-electricals',ARRAY['bulb','led','tube light','switch','wire','fan'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Gas Stoves & Cylinders','గ్యాస్ స్టవ్‌లు','गैस चूल्हा','gas-stoves',ARRAY['gas stove','cylinder','regulator','induction'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],60,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Plastic & Steelware','ప్లాస్టిక్ మరియు స్టీల్ సామాను','प्लास्टिक और स्टील का सामान','plastic-steel-ware',ARRAY['bucket','mug','tub','steel plate','tiffin'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],70,true,now(),now()
FROM categories p WHERE p.slug='home-kitchen' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Books, Stationery & Office','పుస్తకాలు మరియు స్టేషనరీ','किताबें और स्टेशनरी','books-stationery',ARRAY['books','stationery','office','pustakalu'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],180,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Books','పుస్తకాలు','किताबें','books',ARRAY['books','novel','textbook','competitive exam','pustakam'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='books-stationery' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'School Supplies','పాఠశాల సామాగ్రి','स्कूल का सामान','school-supplies',ARRAY['notebook','pen','pencil','school bag','geometry box'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='books-stationery' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Office Stationery','ఆఫీస్ స్టేషనరీ','कार्यालय स्टेशनरी','office-stationery',ARRAY['file','register','paper','stapler','printer paper'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='books-stationery' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Art & Craft','కళలు మరియు క్రాఫ్ట్','कला और शिल्प','art-craft',ARRAY['paint','brush','craft','colours','drawing'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='books-stationery' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Printing & Xerox Material','ప్రింటింగ్ సామాగ్రి','प्रिंटिंग सामग्री','printing-supplies',ARRAY['xerox','printing','cartridge','ink','lamination'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='books-stationery' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Sports, Fitness & Outdoors','క్రీడలు మరియు ఫిట్‌నెస్','खेल और फिटनेस','sports-fitness',ARRAY['sports','fitness','gym','cricket','games'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],190,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Sports Equipment','క్రీడా పరికరాలు','खेल उपकरण','sports-equipment',ARRAY['cricket bat','ball','badminton','football','volleyball'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='sports-fitness' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Fitness & Gym Equipment','ఫిట్‌నెస్ పరికరాలు','फिटनेस उपकरण','fitness-gym',ARRAY['dumbbell','treadmill','yoga mat','gym equipment'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='sports-fitness' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Cycles & Accessories','సైకిళ్లు','साइकिल','cycles',ARRAY['cycle','bicycle','helmet','cycle parts'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='sports-fitness' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Outdoor & Camping','అవుట్‌డోర్ మరియు క్యాంపింగ్','आउटडोर और कैंपिंग','outdoor-camping',ARRAY['tent','camping','trekking','fishing'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='sports-fitness' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Toys, Baby & Kids','బొమ్మలు మరియు పిల్లల సామాగ్రి','खिलौने और बच्चों का सामान','toys-baby-kids',ARRAY['toys','baby','kids','bommalu'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],200,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Toys & Games','బొమ్మలు మరియు ఆటలు','खिलौने और खेल','toys-games',ARRAY['toys','games','puzzle','board game','bommalu'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='toys-baby-kids' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Baby Gear','శిశు సామాగ్రి','शिशु उपकरण','baby-gear',ARRAY['pram','stroller','cradle','walker','baby cot'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='toys-baby-kids' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Baby Food & Diapers','శిశు ఆహారం మరియు డైపర్లు','शिशु आहार और डायपर','baby-food-diapers',ARRAY['diapers','baby food','wipes','feeding bottle'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='toys-baby-kids' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Pets & Pet Supplies','పెంపుడు జంతువులు','पालतू जानवर और सामान','pets-supplies',ARRAY['pets','dog','cat','pet food'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],210,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Pet Food','పెంపుడు జంతువుల ఆహారం','पालतू भोजन','pet-food',ARRAY['dog food','cat food','pet food'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='pets-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Pet Accessories','పెట్ యాక్సెసరీలు','पालतू सहायक सामान','pet-accessories',ARRAY['leash','collar','pet bed','cage','aquarium'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='pets-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Pets & Livestock','పెంపుడు జంతువులు మరియు పశువులు','पालतू और पशुधन','pets-livestock',ARRAY['dog','puppy','cat','birds','cow','buffalo','goat'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='pets-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Farm, Garden & Agriculture','వ్యవసాయం మరియు తోట','खेती और बागवानी','farm-garden',ARRAY['farming','agriculture','vyavasayam','kheti','garden'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],220,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Seeds & Saplings','విత్తనాలు మరియు మొక్కలు','बीज और पौधे','seeds-saplings',ARRAY['seeds','vittanalu','beej','sapling','nursery'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='farm-garden' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Fertilizers & Pesticides','ఎరువులు మరియు పురుగుమందులు','खाद और कीटनाशक','fertilizers-pesticides',ARRAY['fertilizer','eruvulu','khad','pesticide','urea'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='farm-garden' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Farm Tools & Machinery','వ్యవసాయ పరికరాలు','कृषि उपकरण','farm-tools',ARRAY['tractor','plough','sprayer','farm tools','pump set'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='farm-garden' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Plants & Nursery','మొక్కలు మరియు నర్సరీ','पौधे और नर्सरी','plants-nursery',ARRAY['plants','mokkalu','pot','nursery','indoor plants'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='farm-garden' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Garden Supplies','తోట సామాగ్రి','बागवानी का सामान','garden-supplies',ARRAY['garden','manure','pot','hose','gardening tools'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='farm-garden' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Farm Produce (Bulk)','వ్యవసాయ ఉత్పత్తులు','कृषि उपज','farm-produce-bulk',ARRAY['paddy','dhanyam','cotton','chilli','turmeric','bulk grain'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='farm-garden' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Hardware, Tools & Building','హార్డ్‌వేర్ మరియు నిర్మాణ సామాగ్రి','हार्डवेयर और निर्माण सामग्री','hardware-tools',ARRAY['hardware','tools','building material','construction'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],230,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Hand Tools','చేతి పనిముట్లు','हाथ के औज़ार','hand-tools',ARRAY['hammer','screwdriver','spanner','tools','pliers'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='hardware-tools' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Power Tools','పవర్ టూల్స్','बिजली के औज़ार','power-tools',ARRAY['drill','grinder','welding','power tools','cutter'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='hardware-tools' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Paints & Finishes','పెయింట్లు','पेंट','paints',ARRAY['paint','primer','varnish','distemper','brush'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='hardware-tools' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Plumbing & Sanitary','ప్లంబింగ్ మరియు శానిటరీ','नलसाजी और सैनिटरी','plumbing-sanitary',ARRAY['pipe','tap','sanitary','bathroom fittings','closet'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='hardware-tools' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Cement, Steel & Building Materials','సిమెంట్ మరియు నిర్మాణ సామాగ్రి','सीमेंट और निर्माण सामग्री','building-materials',ARRAY['cement','steel','bricks','sand','tiles','marble'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='hardware-tools' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Electrical Supplies','ఎలక్ట్రికల్ సామాగ్రి','बिजली का सामान','electrical-supplies',ARRAY['wire','mcb','switch board','motor','inverter','stabilizer'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],50,true,now(),now()
FROM categories p WHERE p.slug='hardware-tools' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Industrial & Business Supplies','పారిశ్రామిక సామాగ్రి','औद्योगिक और व्यापारिक आपूर्ति','industrial-supplies',ARRAY['industrial','wholesale','business supplies','bulk'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],240,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Packaging Material','ప్యాకేజింగ్ సామాగ్రి','पैकेजिंग सामग्री','packaging',ARRAY['packaging','carton','tape','cover','polythene'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='industrial-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Safety Equipment','భద్రతా పరికరాలు','सुरक्षा उपकरण','safety-equipment',ARRAY['helmet','gloves','safety shoes','fire extinguisher'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='industrial-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Machinery & Equipment','యంత్రాలు','मशीनरी','machinery',ARRAY['machine','generator','compressor','industrial equipment'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='industrial-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Hotel & Restaurant Supplies','హోటల్ సామాగ్రి','होटल और रेस्तरां आपूर्ति','hotel-restaurant-supplies',ARRAY['commercial kitchen','bulk utensils','catering','hotel supplies'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],30,true,now(),now()
FROM categories p WHERE p.slug='industrial-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Raw Materials','ముడి పదార్థాలు','कच्चा माल','raw-materials',ARRAY['raw material','chemicals','scrap','metal','timber'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],40,true,now(),now()
FROM categories p WHERE p.slug='industrial-supplies' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Musical Instruments & Hobby','సంగీత వాయిద్యాలు మరియు హాబీ','वाद्य यंत्र और शौक','music-hobby',ARRAY['music','instrument','hobby','collectibles'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],250,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Musical Instruments','సంగీత వాయిద్యాలు','वाद्य यंत्र','musical-instruments',ARRAY['guitar','keyboard','tabla','veena','drums','flute'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='music-hobby' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Handicrafts & Handmade','చేతివృత్తులు','हस्तशिल्प','handicrafts',ARRAY['handicraft','handmade','kalamkari','bamboo','pottery'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='music-hobby' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Collectibles & Antiques','సేకరణ వస్తువులు','संग्रहणीय वस्तुएँ','collectibles',ARRAY['antique','coins','stamps','collectible'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='music-hobby' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),NULL,'Religious & Festive','పూజా మరియు పండుగ సామాగ్రి','धार्मिक और त्योहार सामग्री','religious-festive',ARRAY['pooja','festival','religious','panduga'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],260,true,now(),now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Pooja Items','పూజా సామాగ్రి','पूजा सामग्री','pooja-items',ARRAY['pooja','agarbatti','camphor','kumkum','diya','idol'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],0,true,now(),now()
FROM categories p WHERE p.slug='religious-festive' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Festival Decorations','పండుగ అలంకరణలు','त्योहार सजावट','festival-decor',ARRAY['decoration','lights','rangoli','toran','flowers'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],10,true,now(),now()
FROM categories p WHERE p.slug='religious-festive' ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (id,"parentId",name,"nameTe","nameHi",slug,"searchTerms","isDirectoryOnly","listingTypes","sortOrder","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(),p.id,'Gifts & Novelties','బహుమతులు','उपहार','gifts',ARRAY['gift','return gift','greeting card','hamper'],false,ARRAY['CLASSIFIED','PRODUCT','BUYER_REQUIREMENT']::"ListingType"[],20,true,now(),now()
FROM categories p WHERE p.slug='religious-festive' ON CONFLICT (slug) DO NOTHING;
