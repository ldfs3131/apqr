-- v3.0.1: um bônus por consultoria (jornada) e índice para as medições por aluno.
CREATE UNIQUE INDEX IF NOT EXISTS bonuses_one_per_journey ON bonuses (journey_id) WHERE journey_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS question_logs_student_date_idx ON question_logs (student_id, date);
