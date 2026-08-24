-- ==========================================================================
-- Ruslovar API — Database Verification Script
--
-- Run this script to verify that the runouns database is correctly set up.
--
-- Usage:
--   mysql -u root -p runouns < verify_database.sql
-- ==========================================================================

USE runouns;

-- --------------------------------------------------------------------------
-- 1. Row count check
-- --------------------------------------------------------------------------
SELECT 'ROW COUNT' AS check_name,
       CASE WHEN COUNT(*) = 767694 THEN 'PASS' ELSE 'FAIL' END AS status,
       COUNT(*) AS actual_count
FROM nouns_morf;

-- --------------------------------------------------------------------------
-- 2. Index checks
-- --------------------------------------------------------------------------
SELECT 'INDEX code_idx' AS check_name,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'runouns'
  AND TABLE_NAME = 'nouns_morf'
  AND INDEX_NAME = 'code_idx';

SELECT 'INDEX code_parent_idx' AS check_name,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'runouns'
  AND TABLE_NAME = 'nouns_morf'
  AND INDEX_NAME = 'code_parent_idx';

SELECT 'INDEX word_idx' AS check_name,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'runouns'
  AND TABLE_NAME = 'nouns_morf'
  AND INDEX_NAME = 'word_idx';

-- --------------------------------------------------------------------------
-- 3. Data fix check: дети should be linked to both дитя and ребенок
-- --------------------------------------------------------------------------
SELECT 'DATA FIX дети -> дитя' AS check_name,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM nouns_morf c
JOIN nouns_morf p ON p.code = c.code_parent
WHERE c.word = 'дети'
  AND p.word = 'дитя';

SELECT 'DATA FIX дети -> ребенок' AS check_name,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM nouns_morf c
JOIN nouns_morf p ON p.code = c.code_parent
WHERE c.word = 'дети'
  AND p.word = 'ребенок';

-- --------------------------------------------------------------------------
-- Summary
-- --------------------------------------------------------------------------
SELECT 'All checks complete.' AS summary;
