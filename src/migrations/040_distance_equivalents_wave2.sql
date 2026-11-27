-- Migration 040: Add 30 additional global & African landmarks to distance_equivalents (Wave 2)
-- All 30 photos are licensed Creative Commons / Public Domain 1200x675 (<200KB) JPEGs hosted in Supabase Storage.

INSERT INTO distance_equivalents (id, name, phrase, city, country_codes, region, distance_m, card, image_url, active)
VALUES
  -- Africa
  ('black_star_square_accra', 'Black Star Square to Osu', 'the route from Black Star Square to Osu', 'Accra', ARRAY['GH'], 'Africa', 1800, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/black_star_square_accra.jpg', TRUE),
  ('adomi_bridge', 'Adomi Bridge', 'the length of Adomi Bridge', 'Atimpoku', ARRAY['GH'], 'Africa', 334, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/adomi_bridge.jpg', TRUE),
  ('karura_forest_trail', 'Karura Forest Waterfall Trail', 'the Karura Forest Waterfall Trail', 'Nairobi', ARRAY['KE'], 'Africa', 5000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/karura_forest_trail.jpg', TRUE),
  ('uhuru_park_nairobi', 'Uhuru Park Loop', 'the Uhuru Park Loop', 'Nairobi', ARRAY['KE'], 'Africa', 1600, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/uhuru_park_nairobi.jpg', TRUE),
  ('nelson_mandela_bridge', 'Nelson Mandela Bridge', 'the length of Nelson Mandela Bridge', 'Johannesburg', ARRAY['ZA'], 'Africa', 284, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/nelson_mandela_bridge.jpg', TRUE),
  ('chapmans_peak_drive', 'Chapman''s Peak Drive', 'the length of Chapman''s Peak Drive', 'Cape Town', ARRAY['ZA'], 'Africa', 9000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/chapmans_peak_drive.jpg', TRUE),
  ('kigali_boulevard', 'Kigali Car-Free Boulevard', 'the Kigali Car-Free Boulevard', 'Kigali', ARRAY['RW'], 'Africa', 1500, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/kigali_boulevard.jpg', TRUE),
  ('mohammed_vi_bridge', 'Mohammed VI Bridge', 'the length of Mohammed VI Bridge', 'Rabat', ARRAY['MA'], 'Africa', 950, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/mohammed_vi_bridge.jpg', TRUE),

  -- North America
  ('brooklyn_bridge', 'Brooklyn Bridge', 'the length of Brooklyn Bridge', 'New York', ARRAY['US'], 'North America', 1834, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/brooklyn_bridge.jpg', TRUE),
  ('central_park_loop', 'Central Park Outer Loop', 'the full Central Park Outer Loop', 'New York', ARRAY['US'], 'North America', 9700, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/central_park_loop.jpg', TRUE),
  ('santa_monica_venice_boardwalk', 'Santa Monica to Venice Boardwalk', 'the Santa Monica to Venice Boardwalk', 'Los Angeles', ARRAY['US'], 'North America', 4500, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/santa_monica_venice_boardwalk.jpg', TRUE),
  ('national_mall_dc', 'National Mall', 'the full length of the National Mall', 'Washington, D.C.', ARRAY['US'], 'North America', 3100, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/national_mall_dc.jpg', TRUE),
  ('las_vegas_strip', 'Las Vegas Strip', 'the full length of the Las Vegas Strip', 'Las Vegas', ARRAY['US'], 'North America', 6800, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/las_vegas_strip.jpg', TRUE),
  ('stanley_park_seawall', 'Stanley Park Seawall', 'the Stanley Park Seawall', 'Vancouver', ARRAY['CA'], 'North America', 9000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/stanley_park_seawall.jpg', TRUE),
  ('toronto_waterfront_trail', 'Martin Goodman Waterfront Trail', 'the downtown Martin Goodman Waterfront Trail', 'Toronto', ARRAY['CA'], 'North America', 10000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/toronto_waterfront_trail.jpg', TRUE),

  -- Europe
  ('millennium_bridge_london', 'Millennium Bridge', 'the length of Millennium Bridge', 'London', ARRAY['GB'], 'Europe', 325, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/millennium_bridge_london.jpg', TRUE),
  ('hyde_park_london', 'Hyde Park Perimeter', 'the full Hyde Park Perimeter', 'London', ARRAY['GB'], 'Europe', 6400, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/hyde_park_london.jpg', TRUE),
  ('charles_bridge_prague', 'Charles Bridge', 'the length of Charles Bridge', 'Prague', ARRAY['CZ'], 'Europe', 516, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/charles_bridge_prague.jpg', TRUE),
  ('vasco_da_gama_bridge', 'Vasco da Gama Bridge', 'the length of Vasco da Gama Bridge', 'Lisbon', ARRAY['PT'], 'Europe', 12345, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/vasco_da_gama_bridge.jpg', TRUE),
  ('oresund_bridge', 'Øresund Bridge', 'the length of the Øresund Bridge', 'Copenhagen to Malmö', ARRAY['DK', 'SE'], 'Europe', 7845, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/oresund_bridge.jpg', TRUE),

  -- Middle East
  ('wadi_hanifah_riyadh', 'Wadi Hanifah Trail', 'the Wadi Hanifah Trail', 'Riyadh', ARRAY['SA'], 'Middle East', 6000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/wadi_hanifah_riyadh.jpg', TRUE),
  ('jeddah_corniche', 'Jeddah Corniche Waterfront', 'the Jeddah Corniche Waterfront', 'Jeddah', ARRAY['SA'], 'Middle East', 4500, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/jeddah_corniche.jpg', TRUE),
  ('abu_dhabi_corniche', 'Abu Dhabi Corniche', 'the full Abu Dhabi Corniche', 'Abu Dhabi', ARRAY['AE'], 'Middle East', 8000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/abu_dhabi_corniche.jpg', TRUE),

  -- Asia & Oceania
  ('imperial_palace_loop_tokyo', 'Imperial Palace Running Loop', 'the Imperial Palace Running Loop', 'Tokyo', ARRAY['JP'], 'Asia', 5000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/imperial_palace_loop_tokyo.jpg', TRUE),
  ('sydney_harbour_bridge', 'Sydney Harbour Bridge', 'the length of Sydney Harbour Bridge', 'Sydney', ARRAY['AU'], 'Oceania', 1149, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/sydney_harbour_bridge.jpg', TRUE),
  ('akashi_kaikyo_bridge', 'Akashi Kaikyo Bridge', 'the length of Akashi Kaikyo Bridge', 'Kobe', ARRAY['JP'], 'Asia', 3911, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/akashi_kaikyo_bridge.jpg', TRUE),
  ('great_wall_mutianyu', 'Great Wall at Mutianyu', 'the restored Great Wall at Mutianyu', 'Beijing', ARRAY['CN'], 'Asia', 2250, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/great_wall_mutianyu.jpg', TRUE),
  ('the_bund_shanghai', 'The Bund Waterfront', 'the full length of The Bund Waterfront', 'Shanghai', ARRAY['CN'], 'Asia', 1500, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/the_bund_shanghai.jpg', TRUE),
  ('marine_drive_mumbai', 'Marine Drive', 'the full length of Marine Drive', 'Mumbai', ARRAY['IN'], 'Asia', 3600, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/marine_drive_mumbai.jpg', TRUE),
  ('hk_zhuhai_macau_bridge', 'Hong Kong–Zhuhai–Macau Bridge', 'the length of the Hong Kong–Zhuhai–Macau Bridge', 'Hong Kong / Macau', ARRAY['HK', 'MO'], 'Asia', 55000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/hk_zhuhai_macau_bridge.jpg', TRUE)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  phrase = EXCLUDED.phrase,
  city = EXCLUDED.city,
  country_codes = EXCLUDED.country_codes,
  region = EXCLUDED.region,
  distance_m = EXCLUDED.distance_m,
  card = EXCLUDED.card,
  image_url = EXCLUDED.image_url,
  active = EXCLUDED.active,
  updated_at = NOW();
