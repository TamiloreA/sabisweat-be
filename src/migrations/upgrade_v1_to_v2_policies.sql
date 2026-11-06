-- ==============================================================================
-- SabiSweat: Master RLS Policies Migration (V1 -> V2)
-- Target Database: dmrpnarmvqxlxqhkowhj
-- Sets up complete Row Level Security (RLS) policies from migrations 003 to 022
-- ==============================================================================

BEGIN;

-- 1. Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Daily Steps
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own daily steps" ON public.daily_steps;
DROP POLICY IF EXISTS "Users can insert their own daily steps" ON public.daily_steps;
DROP POLICY IF EXISTS "Users can update their own daily steps" ON public.daily_steps;
DROP POLICY IF EXISTS "Service role full access daily_steps" ON public.daily_steps;

CREATE POLICY "Users can view their own daily steps"
  ON public.daily_steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily steps"
  ON public.daily_steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily steps"
  ON public.daily_steps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access daily_steps"
  ON public.daily_steps FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Community Posts, Likes, Comments, and Storage
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posts are publicly readable" ON public.community_posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON public.community_posts;
DROP POLICY IF EXISTS "Service role full access community_posts" ON public.community_posts;

CREATE POLICY "Posts are publicly readable"
  ON public.community_posts FOR SELECT USING (true);

CREATE POLICY "Users can create their own posts"
  ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Service role full access community_posts"
  ON public.community_posts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Likes are publicly readable" ON public.community_likes;
DROP POLICY IF EXISTS "Users can like posts" ON public.community_likes;
DROP POLICY IF EXISTS "Users can unlike posts" ON public.community_likes;
DROP POLICY IF EXISTS "Service role full access community_likes" ON public.community_likes;

CREATE POLICY "Likes are publicly readable"
  ON public.community_likes FOR SELECT USING (true);

CREATE POLICY "Users can like posts"
  ON public.community_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts"
  ON public.community_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access community_likes"
  ON public.community_likes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Comments are publicly readable" ON public.community_comments;
DROP POLICY IF EXISTS "Users can comment on posts" ON public.community_comments;
DROP POLICY IF EXISTS "Service role full access community_comments" ON public.community_comments;

CREATE POLICY "Comments are publicly readable"
  ON public.community_comments FOR SELECT USING (true);

CREATE POLICY "Users can comment on posts"
  ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access community_comments"
  ON public.community_comments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Community images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload community images" ON storage.objects;

CREATE POLICY "Community images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-images');

CREATE POLICY "Users can upload community images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'community-images');

-- 4. Clubs & Club Members
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clubs are publicly readable" ON public.clubs;
DROP POLICY IF EXISTS "Service role full access clubs" ON public.clubs;

CREATE POLICY "Clubs are publicly readable"
  ON public.clubs FOR SELECT USING (true);

CREATE POLICY "Service role full access clubs"
  ON public.clubs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Club members are publicly readable" ON public.club_members;
DROP POLICY IF EXISTS "Service role full access club_members" ON public.club_members;

CREATE POLICY "Club members are publicly readable"
  ON public.club_members FOR SELECT USING (true);

CREATE POLICY "Service role full access club_members"
  ON public.club_members FOR ALL USING (true) WITH CHECK (true);

-- 5. News, Comments, Likes, Polls
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news publicly readable" ON public.news;
DROP POLICY IF EXISTS "news insert allowed" ON public.news;
DROP POLICY IF EXISTS "Service role full access news" ON public.news;

CREATE POLICY "news publicly readable" ON public.news FOR SELECT USING (true);
CREATE POLICY "news insert allowed" ON public.news FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access news" ON public.news FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "news likes publicly readable" ON public.news_likes;
DROP POLICY IF EXISTS "news likes insert allowed" ON public.news_likes;
DROP POLICY IF EXISTS "news likes delete allowed" ON public.news_likes;
DROP POLICY IF EXISTS "Service role full access news_likes" ON public.news_likes;

CREATE POLICY "news likes publicly readable" ON public.news_likes FOR SELECT USING (true);
CREATE POLICY "news likes insert allowed" ON public.news_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "news likes delete allowed" ON public.news_likes FOR DELETE USING (true);
CREATE POLICY "Service role full access news_likes" ON public.news_likes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "news comments publicly readable" ON public.news_comments;
DROP POLICY IF EXISTS "news comments insert allowed" ON public.news_comments;
DROP POLICY IF EXISTS "Service role full access news_comments" ON public.news_comments;

CREATE POLICY "news comments publicly readable" ON public.news_comments FOR SELECT USING (true);
CREATE POLICY "news comments insert allowed" ON public.news_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access news_comments" ON public.news_comments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "poll options publicly readable" ON public.news_poll_options;
DROP POLICY IF EXISTS "poll options insert allowed" ON public.news_poll_options;
DROP POLICY IF EXISTS "Service role full access news_poll_options" ON public.news_poll_options;

CREATE POLICY "poll options publicly readable" ON public.news_poll_options FOR SELECT USING (true);
CREATE POLICY "poll options insert allowed" ON public.news_poll_options FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access news_poll_options" ON public.news_poll_options FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "poll votes publicly readable" ON public.news_poll_votes;
DROP POLICY IF EXISTS "poll votes insert allowed" ON public.news_poll_votes;
DROP POLICY IF EXISTS "poll votes delete allowed" ON public.news_poll_votes;
DROP POLICY IF EXISTS "Service role full access news_poll_votes" ON public.news_poll_votes;

CREATE POLICY "poll votes publicly readable" ON public.news_poll_votes FOR SELECT USING (true);
CREATE POLICY "poll votes insert allowed" ON public.news_poll_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "poll votes delete allowed" ON public.news_poll_votes FOR DELETE USING (true);
CREATE POLICY "Service role full access news_poll_votes" ON public.news_poll_votes FOR ALL USING (true) WITH CHECK (true);

-- 6. Life Happens Redemptions
ALTER TABLE public.life_happens_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own redemptions" ON public.life_happens_redemptions;
DROP POLICY IF EXISTS "Users can read own redemptions" ON public.life_happens_redemptions;
DROP POLICY IF EXISTS "Users can insert their own redemptions" ON public.life_happens_redemptions;
DROP POLICY IF EXISTS "Service role full access on redemptions" ON public.life_happens_redemptions;

CREATE POLICY "Users can view their own redemptions"
  ON public.life_happens_redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own redemptions"
  ON public.life_happens_redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on redemptions"
  ON public.life_happens_redemptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Community Polls and Club Events / RSVPs
ALTER TABLE public.community_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Poll options publicly readable" ON public.community_poll_options;
DROP POLICY IF EXISTS "Service role full access community_poll_options" ON public.community_poll_options;

CREATE POLICY "Poll options publicly readable"
  ON public.community_poll_options FOR SELECT USING (true);

CREATE POLICY "Service role full access community_poll_options"
  ON public.community_poll_options FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Poll votes publicly readable" ON public.community_poll_votes;
DROP POLICY IF EXISTS "Users can vote in community polls" ON public.community_poll_votes;
DROP POLICY IF EXISTS "Service role full access community_poll_votes" ON public.community_poll_votes;

CREATE POLICY "Poll votes publicly readable"
  ON public.community_poll_votes FOR SELECT USING (true);

CREATE POLICY "Users can vote in community polls"
  ON public.community_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access community_poll_votes"
  ON public.community_poll_votes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Club events publicly readable" ON public.club_events;
DROP POLICY IF EXISTS "Service role full access club_events" ON public.club_events;

CREATE POLICY "Club events publicly readable"
  ON public.club_events FOR SELECT USING (true);

CREATE POLICY "Service role full access club_events"
  ON public.club_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Club event RSVPs publicly readable" ON public.club_event_rsvps;
DROP POLICY IF EXISTS "Users can manage own event rsvps" ON public.club_event_rsvps;
DROP POLICY IF EXISTS "Service role full access club_event_rsvps" ON public.club_event_rsvps;

CREATE POLICY "Club event RSVPs publicly readable"
  ON public.club_event_rsvps FOR SELECT USING (true);

CREATE POLICY "Users can manage own event rsvps"
  ON public.club_event_rsvps FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access club_event_rsvps"
  ON public.club_event_rsvps FOR ALL USING (true) WITH CHECK (true);

-- 8. Club Join Requests
ALTER TABLE public.club_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own join requests" ON public.club_join_requests;
DROP POLICY IF EXISTS "Users can insert their own join requests" ON public.club_join_requests;
DROP POLICY IF EXISTS "Service role full access club_join_requests" ON public.club_join_requests;

CREATE POLICY "Users can see their own join requests"
  ON public.club_join_requests FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own join requests"
  ON public.club_join_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access club_join_requests"
  ON public.club_join_requests FOR ALL USING (true) WITH CHECK (true);

-- 9. Challenges & Participants
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Challenges are publicly readable" ON public.challenges;
DROP POLICY IF EXISTS "Service role full access challenges" ON public.challenges;

CREATE POLICY "Challenges are publicly readable"
  ON public.challenges FOR SELECT USING (true);

CREATE POLICY "Service role full access challenges"
  ON public.challenges FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Challenge participants are publicly readable" ON public.challenge_participants;
DROP POLICY IF EXISTS "Users can join challenges" ON public.challenge_participants;
DROP POLICY IF EXISTS "Users can update own challenge participation" ON public.challenge_participants;
DROP POLICY IF EXISTS "Service role full access challenge_participants" ON public.challenge_participants;

CREATE POLICY "Challenge participants are publicly readable"
  ON public.challenge_participants FOR SELECT USING (true);

CREATE POLICY "Users can join challenges"
  ON public.challenge_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own challenge participation"
  ON public.challenge_participants FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access challenge_participants"
  ON public.challenge_participants FOR ALL USING (true) WITH CHECK (true);

-- 10. Club Announcements & Reads
ALTER TABLE public.club_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club announcements are publicly readable" ON public.club_announcements;
DROP POLICY IF EXISTS "Service role full access club_announcements" ON public.club_announcements;

CREATE POLICY "Club announcements are publicly readable"
  ON public.club_announcements FOR SELECT USING (true);

CREATE POLICY "Service role full access club_announcements"
  ON public.club_announcements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Club announcement reads are readable by user" ON public.club_announcement_reads;
DROP POLICY IF EXISTS "Club announcement reads insertable by user" ON public.club_announcement_reads;
DROP POLICY IF EXISTS "Service role full access club_announcement_reads" ON public.club_announcement_reads;

CREATE POLICY "Club announcement reads are readable by user"
  ON public.club_announcement_reads FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Club announcement reads insertable by user"
  ON public.club_announcement_reads FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access club_announcement_reads"
  ON public.club_announcement_reads FOR ALL USING (true) WITH CHECK (true);

-- 11. Club Reports
ALTER TABLE public.club_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create club reports" ON public.club_reports;
DROP POLICY IF EXISTS "Users can read own club reports" ON public.club_reports;
DROP POLICY IF EXISTS "Service role full access club_reports" ON public.club_reports;

CREATE POLICY "Users can create club reports"
  ON public.club_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read own club reports"
  ON public.club_reports FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "Service role full access club_reports"
  ON public.club_reports FOR ALL USING (true) WITH CHECK (true);

-- 12. App Versions
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to app_versions" ON public.app_versions;
DROP POLICY IF EXISTS "Allow service and authenticated full access to app_versions" ON public.app_versions;

CREATE POLICY "Allow public read access to app_versions"
  ON public.app_versions FOR SELECT USING (true);

CREATE POLICY "Allow service and authenticated full access to app_versions"
  ON public.app_versions FOR ALL USING (true) WITH CHECK (true);

-- 13. User Achievements
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to user_achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Allow service and authenticated full access to user_achievements" ON public.user_achievements;

CREATE POLICY "Allow public read access to user_achievements"
  ON public.user_achievements FOR SELECT USING (true);

CREATE POLICY "Allow service and authenticated full access to user_achievements"
  ON public.user_achievements FOR ALL USING (true) WITH CHECK (true);

-- 14. Notifications v2 & User Devices
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Service role full access user_devices" ON public.user_devices;

CREATE POLICY "Users can manage own devices"
  ON public.user_devices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access user_devices"
  ON public.user_devices FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Service role full access preferences" ON public.notification_preferences;

CREATE POLICY "Users can view own preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access preferences"
  ON public.notification_preferences FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notification read state" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification read state"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access notifications"
  ON public.notifications FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own delivery attempts" ON public.notification_delivery_attempts;
DROP POLICY IF EXISTS "Service role full access delivery attempts" ON public.notification_delivery_attempts;

CREATE POLICY "Users can view own delivery attempts"
  ON public.notification_delivery_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access delivery attempts"
  ON public.notification_delivery_attempts FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own schedules" ON public.notification_schedules;
DROP POLICY IF EXISTS "Service role full access schedules" ON public.notification_schedules;

CREATE POLICY "Users can view own schedules"
  ON public.notification_schedules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access schedules"
  ON public.notification_schedules FOR ALL
  USING (true)
  WITH CHECK (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;
