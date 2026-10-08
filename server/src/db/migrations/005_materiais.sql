-- V2.3 — Materiais: marcação "já vi/li" por aluno.
CREATE TABLE content_progress (
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  student_id uuid NOT NULL REFERENCES students(id),
  content_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  done_at    timestamptz NOT NULL,
  PRIMARY KEY (student_id, content_id)
);
ALTER TABLE content_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON content_progress USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());
