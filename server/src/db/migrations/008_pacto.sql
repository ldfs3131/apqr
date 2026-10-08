-- V3.0 — Pacto de Estudo (semanal) e histórico de pausas.
CREATE TABLE pactos (
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_start  date NOT NULL,                 -- segunda-feira (fuso do aluno)
  minutes     integer NOT NULL CHECK (minutes >= 30 AND minutes <= 6000),
  days        smallint NOT NULL CHECK (days BETWEEN 1 AND 127), -- máscara de dias: bit 0 = segunda ... bit 6 = domingo
  set_on      date NOT NULL,                 -- dia (local) em que o aluno definiu
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  PRIMARY KEY (student_id, week_start)
);
ALTER TABLE pactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pactos USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());

CREATE TABLE access_pauses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  access_id   uuid NOT NULL REFERENCES accesses(id) ON DELETE CASCADE,
  from_date   date NOT NULL,
  to_date     date                           -- nulo = pausa em andamento
);
CREATE INDEX access_pauses_student_idx ON access_pauses (student_id);
ALTER TABLE access_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_pauses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON access_pauses USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());
-- Pausas já em andamento (se houver) ganham o registro.
INSERT INTO access_pauses (tenant_id, student_id, access_id, from_date)
SELECT tenant_id, student_id, id, paused_from FROM accesses WHERE paused_from IS NOT NULL;
