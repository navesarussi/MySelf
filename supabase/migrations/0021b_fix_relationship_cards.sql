INSERT INTO myself.relationships (name, project_id, reminder_days, notes)
SELECT v.name, '46322b60-573d-4fcd-996e-e43883f773ee'::uuid, 7, 'נוסף דרך הבוט — שמירת קשר'
FROM (VALUES
  ('אראל אלייאש'),
  ('קוה לוי'),
  ('ישי אסרף'),
  ('אברהם סילברג'),
  ('פורת יהודאי'),
  ('נעם ביאליק'),
  ('מידד מיזל'),
  ('אבא'),
  ('אמא')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM myself.relationships r WHERE r.name = v.name
);

DELETE FROM myself.tasks
WHERE source = 'manual'
  AND status = 'open'
  AND priority = 'high'
  AND title LIKE 'לדבר עם %';
