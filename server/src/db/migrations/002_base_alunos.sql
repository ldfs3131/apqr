-- V2.2 — Base de alunos da mentoria (plano, turma e histórico vindos da plataforma antiga)
--
--  * plan_status: 'active' (plano em vigor) ou 'ended' (plano encerrado). Com plano ativo, o fim efetivo é access_until:
--    passou a data, o plano conta como encerrado (sem precisar de rotina noturna).
--  * cohort: turma / concurso foco (ex.: "ANVISA"); legacy_class: nome original da turma na plataforma antiga.
--  * legacy_last_login: último acesso registrado na plataforma antiga. O "último acesso" exibido é o mais recente entre
--    ele, o último login nesta plataforma e o último registro de estudo.
ALTER TABLE students ADD COLUMN plan_status text NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active','ended'));
ALTER TABLE students ADD COLUMN cohort text;
ALTER TABLE students ADD COLUMN legacy_class text;
ALTER TABLE students ADD COLUMN legacy_last_login date;
ALTER TABLE students ADD COLUMN origin text;            -- ex.: 'plataforma_anterior' (importação); NULL = cadastrado aqui
ALTER TABLE students ADD COLUMN imported_at timestamptz;
CREATE INDEX students_plan_idx ON students (tenant_id, plan_status, access_until);
CREATE INDEX students_cohort_idx ON students (tenant_id, cohort);
