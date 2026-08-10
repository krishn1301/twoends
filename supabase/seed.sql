-- Seed data for local development.
--
-- Prompts only. No fake couples, no fake photographs: the app's own onboarding
-- is the fastest way to make a pair, and seeded people have a habit of turning
-- into fixtures that outlive their usefulness and confuse a real test run.
--
-- These are the `core` pack. They are deliberately specific — "what did you
-- almost tell me today" gets a real answer where "how was your day" gets
-- "fine". A prompt that can be answered in one word is a prompt that will be.

insert into prompts (body, pack, kind) values
  ('What did you almost tell me about today, and then didn''t?', 'core', 'conversation'),
  ('What is something small I do that you would miss?', 'core', 'conversation'),
  ('Where were you happiest this week, and who was there?', 'core', 'conversation'),
  ('What do you need more of from me right now?', 'core', 'conversation'),
  ('What is a thing you changed your mind about recently?', 'core', 'conversation'),
  ('What were you like at sixteen?', 'core', 'conversation'),
  ('What is the last thing that made you laugh out loud?', 'core', 'conversation'),
  ('What are you quietly worried about?', 'core', 'conversation'),
  ('Describe today in one photograph you did not take.', 'core', 'conversation'),
  ('What would a perfectly ordinary good day together look like?', 'core', 'conversation'),
  ('What is something you want to be better at by next year?', 'core', 'conversation'),
  ('Which of our plans are you most impatient for?', 'core', 'conversation'),
  ('What do you think I am wrong about?', 'core', 'conversation'),
  ('When did you last feel proud of yourself?', 'core', 'conversation'),
  ('What is a smell that takes you straight back somewhere?', 'core', 'conversation');
