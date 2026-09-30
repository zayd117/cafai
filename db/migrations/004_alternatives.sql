-- L9 "Show alternatives" (plan §24 SHOULD HAVE): other eligible offerings for the same capability, stored as ids and bands.
ALTER TABLE recommendations ADD COLUMN alternatives jsonb NOT NULL DEFAULT '[]'::jsonb;
