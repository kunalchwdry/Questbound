-- Incremental hardening and completion integration. No destructive data changes.
CREATE TABLE IF NOT EXISTS public.community_rate_limits (
 user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 bucket varchar(40) NOT NULL, window_start timestamptz NOT NULL, hits integer NOT NULL DEFAULT 1,
 PRIMARY KEY(user_id,bucket)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','sessions','quests','completions','items','inventory','checkins','companion_messages','ai_configs','community_posts','community_comments','community_reactions','community_tags','community_post_tags','community_saved_posts','guilds','guild_members','guild_invites','guild_quests','guild_quest_participants','community_challenges','community_challenge_participants','community_reputation_transactions','community_reports','user_blocks','notifications','leaderboard_rank_snapshots','guild_quest_contributions','community_challenge_contributions','community_rate_limits'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 -- All writes are through cookie-authenticated Next server routes. In particular,
 -- RLS does not protect TRUNCATE, so do not leave that privilege on browser roles.
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.questbound_user_id() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT id FROM public.users WHERE auth_id=(SELECT auth.uid())::text LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.questbound_user_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.questbound_user_id() TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='questbound_own_notifications') THEN
 CREATE POLICY questbound_own_notifications ON public.notifications FOR SELECT TO authenticated USING (user_id=(SELECT public.questbound_user_id()));
END IF; END $$;

CREATE INDEX IF NOT EXISTS completions_time_user_idx ON public.completions(completed_at,user_id);
CREATE INDEX IF NOT EXISTS community_posts_author_time_idx ON public.community_posts(author_id,created_at DESC);
CREATE INDEX IF NOT EXISTS community_comments_author_time_idx ON public.community_comments(author_id,created_at DESC);

-- Defense in depth: contribution rows must reference a real completion by the same hero.
CREATE OR REPLACE FUNCTION public.questbound_validate_contribution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.completions WHERE id=NEW.source_completion_id AND user_id=NEW.user_id) THEN
 RAISE EXCEPTION 'Contribution requires an owned, server-recorded completion'; END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='questbound_guild_source') THEN
 CREATE TRIGGER questbound_guild_source BEFORE INSERT ON public.guild_quest_contributions FOR EACH ROW EXECUTE FUNCTION public.questbound_validate_contribution(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='questbound_challenge_source') THEN
 CREATE TRIGGER questbound_challenge_source BEFORE INSERT ON public.community_challenge_contributions FOR EACH ROW EXECUTE FUNCTION public.questbound_validate_contribution(); END IF;
END $$;

-- Preserve the existing one-guild-per-hero / one-guild-quest-per-completion contract.
-- Oldest eligible joined quest receives a completion. Global challenges can each
-- receive it once. No retroactive enrollment credit, no client progress values.
CREATE OR REPLACE FUNCTION public.questbound_social_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE g record; ch record; amount integer; added integer;
BEGIN
 SELECT q.* INTO g FROM public.guild_quests q
 JOIN public.guild_quest_participants p ON p.guild_quest_id=q.id AND p.user_id=NEW.user_id
 JOIN public.guild_members m ON m.guild_id=q.guild_id AND m.user_id=NEW.user_id
 WHERE q.status='active' AND q.starts_at<=NEW.completed_at AND (q.ends_at IS NULL OR q.ends_at>NEW.completed_at)
 AND p.joined_at<=NEW.completed_at AND m.joined_at<=NEW.completed_at AND (q.attribute IS NULL OR q.attribute=NEW.attribute)
 ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE OF q;
 IF FOUND THEN
 INSERT INTO public.guild_quest_contributions(guild_quest_id,user_id,source_completion_id,units,guild_xp_awarded)
 VALUES(g.id,NEW.user_id,NEW.id,1,10) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 IF added>0 THEN
 UPDATE public.guild_quest_participants SET contributions=contributions+1,guild_xp_awarded=guild_xp_awarded+10 WHERE guild_quest_id=g.id AND user_id=NEW.user_id;
 UPDATE public.guild_members SET contribution_xp=contribution_xp+10 WHERE guild_id=g.guild_id AND user_id=NEW.user_id;
 UPDATE public.guilds SET xp=xp+10,level=1+(xp+10)/500,updated_at=now() WHERE id=g.guild_id;
 UPDATE public.guild_quests SET progress=least(target,progress+1),updated_at=now(),
 status=CASE WHEN progress+1>=target THEN 'completed'::public.guild_quest_status ELSE status END,
 completed_at=CASE WHEN progress+1>=target THEN now() ELSE NULL END WHERE id=g.id;
 IF g.progress+1>=g.target THEN
 UPDATE public.guilds SET xp=xp+g.reward_xp,level=1+(xp+g.reward_xp)/500 WHERE id=g.guild_id;
 INSERT INTO public.notifications(user_id,kind,title,body,href,dedupe_key)
 SELECT user_id,'guild_quest','Guild quest complete',g.title,'/guilds','guild-complete:'||g.id||':'||user_id FROM public.guild_quest_participants WHERE guild_quest_id=g.id ON CONFLICT DO NOTHING;
 END IF;
 END IF;
 END IF;
 FOR ch IN SELECT q.* FROM public.community_challenges q JOIN public.community_challenge_participants p ON p.challenge_id=q.id AND p.user_id=NEW.user_id
 WHERE q.status='active' AND q.starts_at<=NEW.completed_at AND q.ends_at>NEW.completed_at AND p.joined_at<=NEW.completed_at ORDER BY q.id FOR UPDATE OF q LOOP
 amount:=CASE WHEN ch.metric='xp' THEN NEW.xp ELSE 1 END;
 IF ch.metric='members' AND EXISTS(SELECT 1 FROM public.community_challenge_contributions WHERE challenge_id=ch.id AND user_id=NEW.user_id) THEN CONTINUE; END IF;
 IF ch.metric='streak_days' AND EXISTS(SELECT 1 FROM public.community_challenge_contributions co JOIN public.completions c ON c.id=co.source_completion_id WHERE co.challenge_id=ch.id AND co.user_id=NEW.user_id AND (c.completed_at AT TIME ZONE 'UTC')::date=(NEW.completed_at AT TIME ZONE 'UTC')::date) THEN CONTINUE; END IF;
 INSERT INTO public.community_challenge_contributions(challenge_id,user_id,source_completion_id,metric_delta) VALUES(ch.id,NEW.user_id,NEW.id,amount) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 IF added>0 THEN
 UPDATE public.community_challenge_participants SET contribution=contribution+amount WHERE challenge_id=ch.id AND user_id=NEW.user_id;
 UPDATE public.community_challenges SET progress=least(target,progress+amount),updated_at=now(),
 status=CASE WHEN progress+amount>=target THEN 'completed'::public.challenge_status ELSE status END,
 completed_at=CASE WHEN progress+amount>=target THEN now() ELSE NULL END WHERE id=ch.id;
 IF ch.progress+amount>=ch.target THEN
 INSERT INTO public.notifications(user_id,kind,title,body,href,dedupe_key)
 SELECT user_id,'challenge','Community challenge complete',ch.title,'/challenges','challenge-complete:'||ch.id||':'||user_id FROM public.community_challenge_participants WHERE challenge_id=ch.id ON CONFLICT DO NOTHING;
 END IF;
 END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='questbound_completion_social') THEN
 CREATE TRIGGER questbound_completion_social AFTER INSERT ON public.completions FOR EACH ROW EXECUTE FUNCTION public.questbound_social_completion();
END IF; END $$;
REVOKE ALL ON FUNCTION public.questbound_validate_contribution() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.questbound_social_completion() FROM PUBLIC,anon,authenticated;
-- Existing statistics view is server-only too; it is not an opt-out-aware public API.
DO $$ BEGIN IF to_regclass('public.community_stats') IS NOT NULL THEN
 REVOKE ALL ON public.community_stats FROM anon,authenticated;
END IF; END $$;
