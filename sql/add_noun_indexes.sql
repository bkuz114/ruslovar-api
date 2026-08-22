-- Add indexes to nouns_morf to match the ruslovar-api reference setup.
-- Run after importing the upstream Sshra dump into the runouns database.

USE runouns;

CREATE INDEX code_idx ON nouns_morf (code);
CREATE INDEX code_parent_idx ON nouns_morf (code_parent);
CREATE INDEX word_idx ON nouns_morf (word(5));
