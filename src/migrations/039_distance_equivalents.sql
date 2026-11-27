-- Migration 039: Distance Equivalents remote config & per-user weekly selections
-- Replaces food/drink calorie equivalents on Weekly Reports with real-world distance comparisons.

CREATE TABLE IF NOT EXISTS distance_equivalents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phrase TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  country_codes TEXT[] NOT NULL DEFAULT '{}',
  region TEXT NOT NULL,
  distance_m NUMERIC NOT NULL CHECK (distance_m > 0),
  card TEXT NOT NULL CHECK (card IN ('photo', 'compact')),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distance_equivalents_active
  ON distance_equivalents (active);

CREATE INDEX IF NOT EXISTS idx_distance_equivalents_country_codes
  ON distance_equivalents USING GIN (country_codes);

-- Stores each member's fixed selection per reporting week so reopening the same report
-- shows the same comparison and consecutive weeks avoid repeating the previous entry.
CREATE TABLE IF NOT EXISTS user_weekly_distance_equivalents (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  equivalent_id TEXT NOT NULL REFERENCES distance_equivalents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_user_weekly_distance_equivalents_user_week
  ON user_weekly_distance_equivalents (user_id, week_start_date DESC);

-- Seed the 20 launch comparisons (15 places + 5 global races).
-- All 15 place photos are licensed 1200x675 (<200KB) JPEGs hosted in Supabase Storage (community-images/distance-equivalents/).
INSERT INTO distance_equivalents (id, name, phrase, city, country_codes, region, distance_m, card, image_url, active)
VALUES
  ('lekki_ikoyi_link_bridge', 'Lekki-Ikoyi Link Bridge', 'the length of the Lekki-Ikoyi Link Bridge', 'Lagos', ARRAY['NG'], 'Africa', 1360, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/lekki_ikoyi_link_bridge.jpg', TRUE),
  ('third_mainland_bridge', 'Third Mainland Bridge', 'the length of the Third Mainland Bridge', 'Lagos', ARRAY['NG'], 'Africa', 11800, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/third_mainland_bridge.jpg', TRUE),
  ('6th_october_bridge', '6th October Bridge', 'the length of the 6th October Bridge', 'Cairo', ARRAY['EG'], 'Africa', 20500, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/6th_october_bridge.jpg', TRUE),
  ('victoria_falls_bridge', 'Victoria Falls Bridge', 'the length of the Victoria Falls Bridge', 'Zambia / Zimbabwe', ARRAY['ZM', 'ZW'], 'Africa', 198, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/victoria_falls_bridge.jpg', TRUE),
  ('dubai_marina_walk', 'Dubai Marina Walk', 'the full Dubai Marina Walk', 'Dubai', ARRAY['AE'], 'Middle East', 7000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/dubai_marina_walk.jpg', TRUE),
  ('doha_corniche', 'Doha Corniche', 'the full Doha Corniche', 'Doha', ARRAY['QA'], 'Middle East', 7000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/doha_corniche.jpg', TRUE),
  ('tower_bridge', 'Tower Bridge', 'the length of Tower Bridge', 'London', ARRAY['GB'], 'Europe', 244, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/tower_bridge.jpg', TRUE),
  ('champs_elysees', 'Champs-Élysées', 'the length of the Champs-Élysées', 'Paris', ARRAY['FR'], 'Europe', 1910, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/champs_elysees.jpg', TRUE),
  ('la_rambla', 'La Rambla', 'the length of La Rambla', 'Barcelona', ARRAY['ES'], 'Europe', 1200, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/la_rambla.jpg', TRUE),
  ('english_channel_narrowest', 'English Channel at its narrowest', 'the length of the English Channel at its narrowest', 'Dover to Calais', ARRAY['GB', 'FR'], 'Europe', 33300, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/english_channel_narrowest.jpg', TRUE),
  ('marina_bay_waterfront_promenade', 'Marina Bay Waterfront Promenade', 'the Marina Bay Waterfront Promenade', 'Singapore', ARRAY['SG'], 'Asia', 3500, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/marina_bay_waterfront_promenade.jpg', TRUE),
  ('bandra_worli_sea_link', 'Bandra-Worli Sea Link', 'the length of the Bandra-Worli Sea Link', 'Mumbai', ARRAY['IN'], 'Asia', 5600, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/bandra_worli_sea_link.jpg', TRUE),
  ('golden_gate_bridge', 'Golden Gate Bridge', 'the length of the Golden Gate Bridge', 'San Francisco', ARRAY['US'], 'North America', 2737, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/golden_gate_bridge.jpg', TRUE),
  ('copacabana_beach', 'Copacabana Beach', 'the length of Copacabana Beach', 'Rio de Janeiro', ARRAY['BR'], 'South America', 4000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/copacabana_beach.jpg', TRUE),
  ('bondi_to_coogee_coastal_walk', 'Bondi to Coogee Coastal Walk', 'the Bondi to Coogee Coastal Walk', 'Sydney', ARRAY['AU'], 'Oceania', 6000, 'photo', 'https://dmrpnarmvqxlxqhkowhj.supabase.co/storage/v1/object/public/community-images/distance-equivalents/bondi_to_coogee_coastal_walk.jpg', TRUE),
  ('race_5k', '5K', 'a 5K', 'Global', '{}', 'Race', 5000, 'compact', NULL, TRUE),
  ('race_10k', '10K', 'a 10K', 'Global', '{}', 'Race', 10000, 'compact', NULL, TRUE),
  ('race_half_marathon', 'Half marathon', 'a half marathon', 'Global', '{}', 'Race', 21097.5, 'compact', NULL, TRUE),
  ('race_marathon', 'Marathon', 'a marathon', 'Global', '{}', 'Race', 42195, 'compact', NULL, TRUE),
  ('race_100k', '100K', 'a 100K', 'Global', '{}', 'Race', 100000, 'compact', NULL, TRUE)
ON CONFLICT (id) DO UPDATE
SET
  image_url = COALESCE(EXCLUDED.image_url, distance_equivalents.image_url),
  updated_at = NOW();
