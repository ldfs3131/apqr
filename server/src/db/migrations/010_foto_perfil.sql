-- Foto de perfil do aluno: uso interno (equipe e o próprio aluno), nunca pública.
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check CHECK (purpose IN ('content','logo','photo'));
ALTER TABLE students ADD COLUMN photo_file_id uuid REFERENCES files(id);
