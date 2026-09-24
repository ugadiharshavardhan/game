-- The old session server kept both leaderboards as one JSON blob in `session_boards`, and allowed
-- the anon key to overwrite it. Teams themselves were never persisted at all. The relational
-- schema below replaces it; the table was empty when this migration was written.
drop table if exists public.session_boards;
