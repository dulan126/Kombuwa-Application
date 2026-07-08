-- ═══════════════════════════════════════════════════════════════════
-- Dummy data (Sinhala) for Chemistry (che) & Physics (ph)
--   • Topics per subject
--   • Pool questions (is_pp = false) and past-paper questions (is_pp = true),
--     5 options each, varied lengths to exercise the UI
--   • One published past paper per subject with its PP questions attached
--
-- Re-runnable: removes its own seed rows (slug 'seed-%', paper title 'SEED %',
-- and the seeded topic names) before re-inserting.
--
-- Apply:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/seed_dummy_data.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── Cleanup previous seed ──────────────────────────────────────────
DELETE FROM papers    WHERE title LIKE 'SEED %';          -- cascades paper_questions + practice_attempts
DELETE FROM questions WHERE slug  LIKE 'seed-%';          -- cascades paper_questions + question_media
DELETE FROM topics
 WHERE subject_id IN ('che','ph')
   AND name_si IN (
     'පදාර්ථයේ ස්වභාවය','පරමාණුක ව්‍යුහය','රසායනික බන්ධන','අම්ල, භෂ්ම හා ලවණ','කාබනික රසායන විද්‍යාව',
     'යාන්ත්‍ර විද්‍යාව','තාප විද්‍යාව','විද්‍යුතය හා චුම්බකත්වය','තරංග හා ශබ්දය','ආලෝකය'
   );

-- ── Topics (Sinhala) ───────────────────────────────────────────────
INSERT INTO topics (subject_id, name_si, sort_order) VALUES
  ('che','පදාර්ථයේ ස්වභාවය',1),
  ('che','පරමාණුක ව්‍යුහය',2),
  ('che','රසායනික බන්ධන',3),
  ('che','අම්ල, භෂ්ම හා ලවණ',4),
  ('che','කාබනික රසායන විද්‍යාව',5),
  ('ph','යාන්ත්‍ර විද්‍යාව',1),
  ('ph','තාප විද්‍යාව',2),
  ('ph','විද්‍යුතය හා චුම්බකත්වය',3),
  ('ph','තරංග හා ශබ්දය',4),
  ('ph','ආලෝකය',5);

-- ── Questions ──────────────────────────────────────────────────────
-- topic_id resolved by name; is_pp flags past-paper questions.
INSERT INTO questions
  (slug, subject_id, topic_id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, is_pp)
VALUES
-- Chemistry · pool (short)
('seed-che-001','che',(SELECT id FROM topics WHERE subject_id='che' AND name_si='පදාර්ථයේ ස්වභාවය' LIMIT 1),
 'ජලයේ රසායනික සූත්‍රය කුමක්ද?',
 'H₂O','CO₂','O₂','NaCl','H₂SO₄','A',
 'ජලය හයිඩ්‍රජන් පරමාණු දෙකක් සහ ඔක්සිජන් පරමාණුවකින් සමන්විත වේ.', false),

-- Chemistry · pool (medium)
('seed-che-002','che',(SELECT id FROM topics WHERE subject_id='che' AND name_si='පරමාණුක ව්‍යුහය' LIMIT 1),
 'පරමාණුවක න්‍යෂ්ටිය තුළ පවතින අංශු මොනවාද?',
 'ප්‍රෝටෝන සහ නියුට්‍රෝන','ඉලෙක්ට්‍රෝන පමණි','ප්‍රෝටෝන පමණි','නියුට්‍රෝන සහ ඉලෙක්ට්‍රෝන','ප්‍රෝටෝන, නියුට්‍රෝන සහ ඉලෙක්ට්‍රෝන','A',
 NULL, false),

-- Chemistry · pool (long stem — tests wrapping)
('seed-che-003','che',(SELECT id FROM topics WHERE subject_id='che' AND name_si='අම්ල, භෂ්ම හා ලවණ' LIMIT 1),
 'රසායනාගාරයක දී සිසුවෙකු අඥාත ද්‍රාවණයක් pH කඩදාසියක් භාවිතයෙන් පරීක්ෂා කළ විට කඩදාසිය රතු පැහැයට හැරුණි. මෙම නිරීක්ෂණය මත පදනම්ව එම ද්‍රාවණය පිළිබඳව පහත සඳහන් නිගමන අතුරින් වඩාත් නිවැරදි වන්නේ කුමක්ද?',
 'ද්‍රාවණය අම්ලීය වන අතර එහි pH අගය 7 ට වඩා අඩුය','ද්‍රාවණය භෂ්මික වන අතර එහි pH අගය 7 ට වඩා වැඩිය','ද්‍රාවණය උදාසීන වන අතර pH අගය හරියටම 7 වේ','ද්‍රාවණයේ pH අගය 14 ට වැඩිය','ලබාගත් තොරතුරු මත pH අගය තීරණය කළ නොහැක','A',
 'රතු පැහැයට හැරීම අම්ලීය බව පෙන්නුම් කරයි (pH < 7).', false),

-- Chemistry · past paper (medium)
('seed-che-pp-001','che',(SELECT id FROM topics WHERE subject_id='che' AND name_si='රසායනික බන්ධන' LIMIT 1),
 'සෝඩියම් ක්ලෝරයිඩ් (NaCl) හි පවතින බන්ධන වර්ගය කුමක්ද?',
 'අයනික බන්ධන','සහසංයුජ බන්ධන','ලෝහ බන්ධන','හයිඩ්‍රජන් බන්ධන','වැන්ඩර්වාල්ස් බල','A',
 'ලෝහයක් සහ අලෝහයක් අතර ඉලෙක්ට්‍රෝන පැවරීමෙන් අයනික බන්ධන සෑදේ.', true),

-- Chemistry · past paper (long options — tests option wrapping)
('seed-che-pp-002','che',(SELECT id FROM topics WHERE subject_id='che' AND name_si='කාබනික රසායන විද්‍යාව' LIMIT 1),
 'කාබනික සංයෝගවල සමාවයවිකතාව (isomerism) පිළිබඳව පහත ප්‍රකාශ අතුරින් නිවැරදි ප්‍රකාශය තෝරන්න.',
 'එකම අණුක සූත්‍රයක් සහිත නමුත් වෙනස් ව්‍යුහාත්මක සැකැස්මක් සහිත සංයෝග සමාවයවික ලෙස හැඳින්වේ',
 'සමාවයවික සංයෝගවල අණුක ස්කන්ධ සෑම විටම වෙනස් වේ',
 'සමාවයවිකතාව හට ගන්නේ අකාබනික සංයෝගවල පමණි',
 'සියලුම සමාවයවික සංයෝගවල භෞතික සහ රසායනික ගුණ සමාන වේ',
 'සමාවයවික සංයෝගවලට එකිනෙකට පරිවර්තනය විය නොහැක',
 'A', 'සමාවයවික සංයෝගවලට එකම අණුක සූත්‍රය ඇති නමුත් ව්‍යුහය වෙනස් වේ.', true),

-- Chemistry · past paper (short)
('seed-che-pp-003','che',(SELECT id FROM topics WHERE subject_id='che' AND name_si='පදාර්ථයේ ස්වභාවය' LIMIT 1),
 'පහත අතුරින් මූලද්‍රව්‍යයක් නොවන්නේ කුමක්ද?',
 'ජලය','යකඩ','ඔක්සිජන්','කාබන්','රත්‍රන්','A',
 'ජලය සංයෝගයකි; අනෙක් සියල්ල මූලද්‍රව්‍ය වේ.', true),

-- Physics · pool (short)
('seed-ph-001','ph',(SELECT id FROM topics WHERE subject_id='ph' AND name_si='යාන්ත්‍ර විද්‍යාව' LIMIT 1),
 'ත්වරණයේ SI ඒකකය කුමක්ද?',
 'ms⁻²','ms⁻¹','m','N','kg','A',
 NULL, false),

-- Physics · pool (medium)
('seed-ph-002','ph',(SELECT id FROM topics WHERE subject_id='ph' AND name_si='විද්‍යුතය හා චුම්බකත්වය' LIMIT 1),
 'ඕම්ගේ නියමයට අනුව ප්‍රතිරෝධය (R), විභව අන්තරය (V) සහ ධාරාව (I) අතර සම්බන්ධය කුමක්ද?',
 'R = V / I','R = I / V','R = V × I','R = V + I','R = V − I','A',
 'ඕම්ගේ නියමය: V = IR, එබැවින් R = V/I.', false),

-- Physics · pool (long stem)
('seed-ph-003','ph',(SELECT id FROM topics WHERE subject_id='ph' AND name_si='යාන්ත්‍ර විද්‍යාව' LIMIT 1),
 'තිරස් තලයක් මත ස්ථානගත කර ඇති 2 kg ස්කන්ධයක් සහිත වස්තුවක් මත 10 N තිරස් බලයක් යොදන ලදී. තලයේ ඝර්ෂණය නොසලකා හරින විට එම වස්තුවේ ත්වරණය කොපමණද? (g = 10 ms⁻²)',
 '5 ms⁻²','2 ms⁻²','10 ms⁻²','20 ms⁻²','0.2 ms⁻²','A',
 'a = F/m = 10/2 = 5 ms⁻².', false),

-- Physics · past paper (medium)
('seed-ph-pp-001','ph',(SELECT id FROM topics WHERE subject_id='ph' AND name_si='තරංග හා ශබ්දය' LIMIT 1),
 'රික්තකයක් තුළ ශබ්දය ගමන් නොකරන්නේ ඇයි?',
 'ශබ්දය ගමන් කිරීමට මාධ්‍යයක් අවශ්‍ය බැවින්','ශබ්දය ආලෝකයට වඩා වේගවත් බැවින්','රික්තකයේ උෂ්ණත්වය අඩු බැවින්','ශබ්දය විද්‍යුත් චුම්බක තරංගයක් බැවින්','රික්තකයේ පීඩනය වැඩි බැවින්','A',
 'ශබ්දය යාන්ත්‍රික තරංගයකි; එයට මාධ්‍යයක් අවශ්‍ය වේ.', true),

-- Physics · past paper (long stem + long options)
('seed-ph-pp-002','ph',(SELECT id FROM topics WHERE subject_id='ph' AND name_si='තාප විද්‍යාව' LIMIT 1),
 'ලෝහ දණ්ඩක් රත් කළ විට එහි දිග වැඩි වේ. මෙම තාප ප්‍රසාරණය පිළිබඳ පහත ප්‍රකාශ කිහිපයක් දක්වා ඇත. ඒවා අතුරින් වඩාත් නිවැරදිව තාප ප්‍රසාරණය පැහැදිලි කරන ප්‍රකාශය කුමක්ද?',
 'උෂ්ණත්වය වැඩිවීමත් සමඟ අණුවල කම්පන ශක්තිය වැඩිවී අණු අතර සාමාන්‍ය දුර වැඩිවීම නිසා දිග වැඩි වේ',
 'උෂ්ණත්වය වැඩිවීමත් සමඟ අණු ගණන වැඩිවීම නිසා දිග වැඩි වේ',
 'රත් කිරීමේදී ලෝහයේ ස්කන්ධය වැඩිවීම නිසා දිග වැඩි වේ',
 'උෂ්ණත්වය වැඩිවීමත් සමඟ අණු කුඩා වීම නිසා දිග වැඩි වේ',
 'තාප ප්‍රසාරණය සිදුවන්නේ ද්‍රව හා වායු වල පමණක් වන අතර ඝන වල සිදු නොවේ',
 'A', 'උෂ්ණත්වය නිසා අණුවල කම්පනය වැඩිවී සාමාන්‍ය අන්තර-අණුක දුර වැඩි වේ.', true),

-- Physics · past paper (short)
('seed-ph-pp-003','ph',(SELECT id FROM topics WHERE subject_id='ph' AND name_si='ආලෝකය' LIMIT 1),
 'ආලෝකයේ වර්තනය සිදුවන්නේ කවර අවස්ථාවකදීද?',
 'ආලෝකය එක් මාධ්‍යයකින් තවත් මාධ්‍යයකට ගමන් කරන විට','ආලෝකය පරාවර්තනය වන විට','ආලෝකය අවශෝෂණය වන විට','ආලෝකය විසිරෙන විට','ආලෝකය සම්පූර්ණයෙන් අවහිර වන විට','A',
 'මාධ්‍ය දෙකක් අතර වේග වෙනස නිසා වර්තනය සිදු වේ.', true);

-- ── Past papers (one per subject) with their PP questions attached ──
-- Past papers carry no grade level (grade nullable). time_seconds 0 = no timer.
INSERT INTO papers (type, subject_id, grade, title, question_count, time_seconds, available_from, available_until, is_published)
VALUES
  ('pastpaper','che', NULL, 'SEED Chemistry Past Paper 2023', 0, 0, NOW(), NULL, TRUE),
  ('pastpaper','ph',  NULL, 'SEED Physics Past Paper 2023',   0, 0, NOW(), NULL, TRUE);

-- Attach each subject's PP questions in slug order.
INSERT INTO paper_questions (paper_id, question_id, sort_order)
SELECT p.id, q.id, ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY q.slug)
FROM papers p
JOIN questions q
  ON q.subject_id = p.subject_id AND q.is_pp = TRUE AND q.slug LIKE 'seed-%'
WHERE p.title LIKE 'SEED %';

-- Sync question_count.
UPDATE papers p SET question_count = (
  SELECT COUNT(*) FROM paper_questions pq WHERE pq.paper_id = p.id
) WHERE p.title LIKE 'SEED %';

COMMIT;

-- ── Summary ────────────────────────────────────────────────────────
SELECT 'topics' AS kind, subject_id, COUNT(*) FROM topics WHERE subject_id IN ('che','ph') GROUP BY subject_id
UNION ALL
SELECT 'questions (pool)', subject_id, COUNT(*) FROM questions WHERE slug LIKE 'seed-%' AND is_pp=FALSE GROUP BY subject_id
UNION ALL
SELECT 'questions (pp)', subject_id, COUNT(*) FROM questions WHERE slug LIKE 'seed-%' AND is_pp=TRUE GROUP BY subject_id
UNION ALL
SELECT 'past papers', subject_id, COUNT(*) FROM papers WHERE title LIKE 'SEED %' GROUP BY subject_id
ORDER BY kind, subject_id;
