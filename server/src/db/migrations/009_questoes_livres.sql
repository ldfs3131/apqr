-- Questões livres: por matéria (sem tema) e simulados (misto). Nunca mudam a etapa APQR.
ALTER TABLE question_logs ALTER COLUMN topic_id DROP NOT NULL;
ALTER TABLE question_logs ADD COLUMN subject_id uuid REFERENCES subjects(id);
ALTER TABLE question_logs ADD COLUMN simulado_name text;
ALTER TABLE question_logs DROP CONSTRAINT IF EXISTS question_logs_source_check;
ALTER TABLE question_logs ADD CONSTRAINT question_logs_source_check CHECK (source IN ('review','practice','general','simulado'));
ALTER TABLE question_logs ADD CONSTRAINT question_logs_target_check CHECK (
  (source IN ('review','practice') AND topic_id IS NOT NULL)
  OR (source = 'general' AND subject_id IS NOT NULL)
  OR source = 'simulado');
CREATE INDEX question_logs_subject_idx ON question_logs (subject_id) WHERE subject_id IS NOT NULL;
