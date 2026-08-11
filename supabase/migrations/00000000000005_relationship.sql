-- One question instead of two.
--
-- `proximity` asked how far apart two people live. The question people actually
-- want to answer is what they are to each other — and the answer to that mostly
-- implies the distance anyway. Long distance is a kind of relationship before it
-- is a measurement.
--
-- The set is deliberately wide. A couple app that only recognises "boyfriend and
-- girlfriend, dating, serious" tells everyone else the app is not for them, and
-- a situationship is a real thing two people might want a shared space for.

alter table couples add column relationship_type text
  check (relationship_type in (
    'together',       -- same city, same life
    'long_distance',  -- different cities or countries
    'situationship',  -- undefined on purpose, and that is allowed
    'friends',        -- not romantic, and that is allowed too
    'complicated'     -- the honest option, and the one that stops people lying
  ));

-- Carry across whatever the old column captured. `nearby` and `varies` both
-- collapse to `together`: neither described a relationship, only a commute.
update couples set relationship_type = case proximity
  when 'long_distance' then 'long_distance'
  when 'together' then 'together'
  when 'nearby' then 'together'
  when 'varies' then 'together'
  else null
end
where proximity is not null;

alter table couples drop column proximity;

comment on column couples.relationship_type is
  'Changes the words the app uses, never which features it offers. Nothing is '
  'gated on this.';
