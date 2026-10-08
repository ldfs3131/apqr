-- V3.0 — Acessos (várias vigências por conta), perfil Coordenadora, termos versionados.

-- 1) Novo papel: coordenadora (vê todos os alunos; sem financeiro/configurações).
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%role%' AND pg_get_constraintdef(oid) LIKE '%platform_admin%' AND pg_get_constraintdef(oid) LIKE '%mentor%' AND pg_get_constraintdef(oid) NOT LIKE '%IS NULL%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE users ADD CONSTRAINT users_role_chk CHECK (role IN ('platform_admin','teacher','coordinator','mentor','student'));

ALTER TABLE students DROP CONSTRAINT IF EXISTS students_plan_status_check;
ALTER TABLE students ADD CONSTRAINT students_plan_status_check CHECK (plan_status IN ('active','ended','paused'));

-- 2) Acessos: uma conta, várias vigências (turma, consultoria, só plataforma).
CREATE TABLE accesses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  student_id         uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('turma','consultoria','plataforma')),
  label              text,
  starts_on          date NOT NULL,
  ends_on            date,                       -- consultoria: nulo até o "encontro realizado" (aí vira encontro + 30 dias)
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled')),
  cancel_reason      text,
  canceled_at        timestamptz,
  pauses_used        integer NOT NULL DEFAULT 0,
  extra_pause_allowed boolean NOT NULL DEFAULT false, -- liberada somente pela professora
  paused_from        date,                       -- preenchido enquanto o acesso está pausado
  meeting_on         date,                       -- consultoria: data do encontro realizado
  sale_id            uuid,                       -- compra que originou o acesso (reembolso cancela este acesso)
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL
);
CREATE INDEX accesses_student_idx ON accesses (student_id);
ALTER TABLE accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accesses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON accesses USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());

-- Alunos que já têm validade ganham um acesso "Plataforma" equivalente (nada muda para eles).
INSERT INTO accesses (tenant_id, student_id, kind, label, starts_on, ends_on, status, canceled_at, created_at, updated_at)
SELECT tenant_id, id, 'plataforma', 'Acesso anterior', created_at::date, access_until,
       CASE WHEN plan_status = 'ended' AND (access_until IS NULL OR access_until >= CURRENT_DATE) THEN 'canceled' ELSE 'active' END,
       CASE WHEN plan_status = 'ended' AND (access_until IS NULL OR access_until >= CURRENT_DATE) THEN updated_at END,
       created_at, updated_at
  FROM students WHERE access_until IS NOT NULL;

-- 3) Termos versionados (texto + cópia em PDF) e aceite por aluno (versão, data/hora, IP).
CREATE TABLE terms_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  version     text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  drive_url   text,
  file_id     uuid REFERENCES files(id),         -- cópia em PDF guardada no sistema
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL,
  UNIQUE (tenant_id, version)
);
CREATE TABLE terms_acceptances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  version     text NOT NULL,
  accepted_at timestamptz NOT NULL,
  ip          text,
  UNIQUE (student_id, version)
);
ALTER TABLE terms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON terms_documents USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON terms_acceptances USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant());
