-- V3.0 — Turmas (links de WhatsApp, materiais), jornada da consultoria (diagnóstico, plano, relatório), bônus,
-- Fila da Coordenação e Ajuste de Rota. Configurações privadas do ambiente em tenants.config.

ALTER TABLE tenants ADD COLUMN config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE content_items ADD COLUMN cohort text;          -- nulo = todos; preenchido = só alunos dessa turma

CREATE TABLE cohorts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  name                  text NOT NULL,
  whatsapp_notices_url  text,                              -- grupo de avisos
  whatsapp_students_url text,                              -- grupo de alunos
  created_at            timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL,
  UNIQUE (tenant_id, name)
);

-- Jornada de uma consultoria (um registro por acesso do tipo consultoria).
CREATE TABLE consult_journeys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  access_id       uuid UNIQUE REFERENCES accesses(id) ON DELETE CASCADE,
  paid_on         date,
  scheduled_on    date,
  session_link    text,
  done_on         date,                                    -- encontro realizado
  plan_published_at timestamptz,
  report_due_on   date,
  continued       boolean,
  note            text,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL
);
CREATE INDEX consult_journeys_student_idx ON consult_journeys (student_id);

CREATE TABLE diagnostics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES consult_journeys(id) ON DELETE SET NULL,
  answers       jsonb NOT NULL,
  consent       boolean NOT NULL CHECK (consent),          -- sem a caixa, não há diagnóstico
  consent_at    timestamptz NOT NULL,
  terms_version text,
  ip            text,
  created_at    timestamptz NOT NULL
);
CREATE INDEX diagnostics_student_idx ON diagnostics (student_id);

CREATE TABLE action_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES consult_journeys(id) ON DELETE SET NULL,
  title         text NOT NULL,
  published_at  timestamptz,                               -- o aluno só vê depois de publicado
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL
);
CREATE INDEX action_plans_student_idx ON action_plans (student_id);
CREATE TABLE action_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  plan_id     uuid NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text        text NOT NULL,
  due_on      date,
  position    integer NOT NULL DEFAULT 0,
  done_at     timestamptz
);
CREATE INDEX action_items_plan_idx ON action_items (plan_id, position);

-- Relatório de 30 dias: fatos calculados + texto da professora; só chega ao aluno depois de aprovado.
CREATE TABLE consult_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES consult_journeys(id) ON DELETE SET NULL,
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  facts         jsonb NOT NULL,
  body          text,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL
);
CREATE INDEX consult_reports_student_idx ON consult_reports (student_id);

-- Bônus de Execução: medição automática, aplicação manual (desconto na compra, nunca dinheiro).
CREATE TABLE bonuses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  student_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  journey_id     uuid REFERENCES consult_journeys(id) ON DELETE SET NULL,
  report_id      uuid REFERENCES consult_reports(id) ON DELETE SET NULL,
  medal          text NOT NULL CHECK (medal IN ('bronze','prata','ouro')),
  discount_cents integer NOT NULL CHECK (discount_cents >= 0),
  metrics        jsonb NOT NULL,
  issued_on      date NOT NULL,
  valid_until    date NOT NULL,
  applied_by     uuid REFERENCES users(id),
  applied_at     timestamptz,
  applied_note   text,
  created_at     timestamptz NOT NULL
);
CREATE INDEX bonuses_student_idx ON bonuses (student_id);

-- Fila da Coordenação: o que é "feito" (as listas em si são calculadas dos dados).
CREATE TABLE coord_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  ref         text NOT NULL DEFAULT '',
  done_by     uuid REFERENCES users(id),
  done_at     timestamptz NOT NULL,
  note        text,
  UNIQUE (student_id, kind, ref)
);

-- Ajuste de Rota: retrato quinzenal por regras do método (sem IA).
CREATE TABLE route_adjustments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  student_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id  uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  period_from    date NOT NULL,
  period_to      date NOT NULL,
  facts          jsonb NOT NULL,
  suggestions    jsonb NOT NULL,
  accepted_at    timestamptz,
  created_at     timestamptz NOT NULL,
  UNIQUE (enrollment_id, period_from)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cohorts','consult_journeys','diagnostics','action_plans','action_items','consult_reports','bonuses','coord_actions','route_adjustments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant())', t);
  END LOOP;
END $$;

-- Turmas já existentes nos alunos viram registros de turma.
INSERT INTO cohorts (tenant_id, name, created_at, updated_at)
SELECT DISTINCT tenant_id, cohort, now(), now() FROM students WHERE cohort IS NOT NULL AND btrim(cohort) <> '' ON CONFLICT DO NOTHING;
