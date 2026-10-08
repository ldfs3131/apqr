-- V2.3 — Agenda da professora: aulas ao vivo, reuniões, plantões, datas de prova e lembretes.
-- Conteúdo da professora para os alunos (NÃO é agenda automática de revisões).
CREATE TABLE agenda_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  kind        text NOT NULL CHECK (kind IN ('aula','reuniao','plantao','prova','lembrete','outro')),
  title       text NOT NULL,
  description text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  all_day     boolean NOT NULL DEFAULT false,
  link        text,
  audience    text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','cohort','edital','student')),
  cohort      text,
  edital_id   uuid REFERENCES editais(id),
  student_id  uuid REFERENCES students(id),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CHECK ((audience = 'all') OR (audience = 'cohort' AND cohort IS NOT NULL) OR (audience = 'edital' AND edital_id IS NOT NULL) OR (audience = 'student' AND student_id IS NOT NULL))
);
CREATE INDEX agenda_events_idx ON agenda_events (tenant_id, starts_at);
ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agenda_events USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());
