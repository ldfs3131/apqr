-- ONE UP · Método APQR — schema V2 (PostgreSQL >= 15)
--
-- Convenções
--  * Todas as chaves são UUID (não revelam volume nem permitem enumeração).
--  * Toda tabela de dados de um ambiente (tenant) tem tenant_id e Row-Level Security:
--    o banco recusa linhas de outro ambiente mesmo que o código esqueça o filtro.
--  * Datas de calendário (dia de estudo) = DATE no fuso do aluno; instantes = TIMESTAMPTZ.
--  * Dado de estudo nunca é apagado fisicamente: usa-se voided_at / archived_at.
--  * A estrutura do edital é ÚNICA (da professora); o aluno tem apenas progresso (topic_progress).

-- ───────────── Contexto de segurança (preenchido por transação pela aplicação) ─────────────
CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_platform() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.platform', true), '') = 'on' $$;

-- ───────────── Ambientes (professores/clientes da ONE UP) ─────────────
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  brand       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- display_name, primary_color, logo_file_id
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- limites operacionais (ex.: relatórios de IA/dia). Regras APQR: methodology_configs
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);

-- ───────────── Configuração da metodologia APQR (versionada) ─────────────
-- Cada alteração cria uma NOVA versão (append-only). A versão ativa é a de maior número.
-- Revisões gravam a versão e os valores usados, então mudar a regra nunca reescreve o passado.
CREATE TABLE methodology_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  methodology  text NOT NULL DEFAULT 'apqr' CHECK (methodology = 'apqr'),
  version      integer NOT NULL CHECK (version >= 1),
  params       jsonb NOT NULL,           -- validado na aplicação (domain/settings.js)
  reason       text,
  created_by   uuid,                     -- usuário que alterou (FK omitida: users é criada depois)
  created_at   timestamptz NOT NULL,
  UNIQUE (tenant_id, methodology, version)
);
-- Versões são imutáveis: o banco recusa alterar ou apagar uma versão já gravada.
CREATE OR REPLACE FUNCTION methodology_configs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'methodology_configs é somente inclusão: crie uma nova versão em vez de alterar a versão %', OLD.version;
END $$;
CREATE TRIGGER methodology_configs_no_update BEFORE UPDATE OR DELETE ON methodology_configs
  FOR EACH ROW EXECUTE FUNCTION methodology_configs_immutable();

-- ───────────── Identidade ─────────────
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id),
  email          text NOT NULL,
  password_hash  text,
  name           text NOT NULL,
  role           text NOT NULL CHECK (role IN ('platform_admin','teacher','mentor','student')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
  timezone       text NOT NULL DEFAULT 'America/Sao_Paulo',
  failed_logins  integer NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL,
  last_login_at  timestamptz,
  CHECK ((role = 'platform_admin') = (tenant_id IS NULL))
);
-- V2: e-mail único na plataforma (login sem escolher ambiente). Ver docs/ARQUITETURA.md.
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE INDEX users_tenant_idx ON users (tenant_id, role);

CREATE TABLE students (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  user_id               uuid NOT NULL UNIQUE REFERENCES users(id),
  cpf                   text,                    -- só dígitos
  phone                 text,
  postal_code           text,
  address_line          text,
  address_number        text,
  address_complement    text,
  district              text,
  city                  text,
  state                 text,
  goal                  text,
  onboarding_done       boolean NOT NULL DEFAULT false,
  extra_reviews_allowed boolean NOT NULL DEFAULT false,  -- liberação da professora (revisões além do limite do ciclo)
  access_until          date,
  terms_version         text,
  terms_accepted_at     timestamptz,
  created_at            timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL
);
CREATE UNIQUE INDEX students_cpf_uq ON students (tenant_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX students_tenant_idx ON students (tenant_id);

-- Monitor/assistente (role = mentor) enxerga apenas os alunos atribuídos.
CREATE TABLE staff_assignments (
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  staff_id    uuid NOT NULL REFERENCES users(id),
  student_id  uuid NOT NULL REFERENCES students(id),
  PRIMARY KEY (staff_id, student_id)
);
CREATE INDEX staff_assignments_student_idx ON staff_assignments (student_id);

CREATE TABLE sessions (
  token_hash    text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id),
  tenant_id     uuid REFERENCES tenants(id),
  created_at    timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL,
  ip            text,
  user_agent    text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE password_resets (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  tenant_id   uuid REFERENCES tenants(id),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- Convite pessoal: a professora cadastra o aluno (nome, e-mail) e o aluno conclui o cadastro.
CREATE TABLE invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  token_hash  text NOT NULL UNIQUE,
  created_by  uuid REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL
);
CREATE INDEX invites_user_idx ON invites (user_id);

-- ───────────── Edital → Matérias → Conteúdos (estrutura única) ─────────────
CREATE TABLE editais (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  name         text NOT NULL,
  role_title   text,
  board        text,
  exam_date    date,
  description  text,
  plan_notes   text,
  archived_at  timestamptz,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL
);
CREATE INDEX editais_tenant_idx ON editais (tenant_id);

CREATE TABLE subjects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  edital_id    uuid NOT NULL REFERENCES editais(id),
  name         text NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  priority     integer,                               -- Plano Global (1 = mais prioritária)
  relevance    text NOT NULL DEFAULT 'media' CHECK (relevance IN ('alta','media','baixa')),
  plan_note    text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL
);
CREATE INDEX subjects_edital_idx ON subjects (edital_id);

CREATE TABLE topics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  edital_id    uuid NOT NULL REFERENCES editais(id),
  subject_id   uuid NOT NULL REFERENCES subjects(id),
  name         text NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL
);
CREATE INDEX topics_edital_idx ON topics (edital_id);
CREATE INDEX topics_subject_idx ON topics (subject_id);

CREATE TABLE enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  student_id   uuid NOT NULL REFERENCES students(id),
  edital_id    uuid NOT NULL REFERENCES editais(id),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL,
  archived_at  timestamptz,
  UNIQUE (student_id, edital_id)
);
CREATE INDEX enrollments_edital_idx ON enrollments (edital_id);
CREATE INDEX enrollments_tenant_idx ON enrollments (tenant_id);

-- Estado APQR do aluno em cada conteúdo. Criado na primeira interação (ausência = não iniciado).
CREATE TABLE topic_progress (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  enrollment_id      uuid NOT NULL REFERENCES enrollments(id),
  student_id         uuid NOT NULL REFERENCES students(id),
  topic_id           uuid NOT NULL REFERENCES topics(id),
  status             text NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','assimilation','production','review','consolidated')),
  started_at         date,
  material_done_at   date,
  review_started_at  date,
  consolidated_at    date,
  current_cycle      integer NOT NULL DEFAULT 1,
  cycle_locked_at    timestamptz,
  material_updates   integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  UNIQUE (enrollment_id, topic_id)
);
CREATE INDEX topic_progress_topic_idx ON topic_progress (topic_id);
CREATE INDEX topic_progress_status_idx ON topic_progress (enrollment_id, status);

-- ───────────── Atividade ─────────────
CREATE TABLE study_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  student_id        uuid NOT NULL REFERENCES students(id),
  enrollment_id     uuid NOT NULL REFERENCES enrollments(id),
  topic_id          uuid NOT NULL REFERENCES topics(id),
  activity          text NOT NULL DEFAULT 'study'
                    CHECK (activity IN ('study','assimilation','production','questions','review')),
  date              date NOT NULL,
  started_at        timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer NOT NULL CHECK (duration_seconds > 0),
  source            text NOT NULL CHECK (source IN ('timer','manual')),
  note              text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL,
  voided_at         timestamptz,
  voided_by         uuid REFERENCES users(id)
);
CREATE INDEX study_sessions_enr_date_idx ON study_sessions (enrollment_id, date) WHERE voided_at IS NULL;
CREATE INDEX study_sessions_student_date_idx ON study_sessions (student_id, date) WHERE voided_at IS NULL;
CREATE INDEX study_sessions_topic_idx ON study_sessions (topic_id);

CREATE TABLE active_timers (
  student_id           uuid PRIMARY KEY REFERENCES students(id),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  enrollment_id        uuid NOT NULL REFERENCES enrollments(id),
  topic_id             uuid NOT NULL REFERENCES topics(id),
  activity             text NOT NULL DEFAULT 'study',
  started_at           timestamptz NOT NULL,
  running_since        timestamptz,
  accumulated_seconds  integer NOT NULL DEFAULT 0
);

CREATE TABLE reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  student_id      uuid NOT NULL REFERENCES students(id),
  enrollment_id   uuid NOT NULL REFERENCES enrollments(id),
  topic_id        uuid NOT NULL REFERENCES topics(id),
  progress_id     uuid NOT NULL REFERENCES topic_progress(id),
  cycle           integer NOT NULL,
  number          integer NOT NULL CHECK (number >= 1),
  date            date NOT NULL,
  questions       integer NOT NULL CHECK (questions > 0),
  correct         integer NOT NULL CHECK (correct >= 0 AND correct <= questions),
  threshold_used      integer NOT NULL,      -- % de consolidação vigente no momento do registro
  min_questions_used  integer NOT NULL,      -- mínimo de questões vigente no momento do registro
  config_version      integer NOT NULL,      -- versão de methodology_configs usada
  consolidated    boolean NOT NULL DEFAULT false,
  extra           boolean NOT NULL DEFAULT false,  -- revisão além do limite (liberação da professora)
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL,
  voided_at       timestamptz,
  voided_by       uuid REFERENCES users(id),
  void_reason     text
);
CREATE UNIQUE INDEX reviews_slot_uq ON reviews (progress_id, cycle, number) WHERE voided_at IS NULL;
CREATE INDEX reviews_enr_date_idx ON reviews (enrollment_id, date) WHERE voided_at IS NULL;

-- Questões: de revisão (ligadas à revisão) ou avulsas (treino). Nunca mudam a etapa sozinhas.
CREATE TABLE question_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  student_id     uuid NOT NULL REFERENCES students(id),
  enrollment_id  uuid NOT NULL REFERENCES enrollments(id),
  topic_id       uuid NOT NULL REFERENCES topics(id),
  review_id      uuid UNIQUE REFERENCES reviews(id),
  source         text NOT NULL CHECK (source IN ('review','practice')),
  date           date NOT NULL,
  questions      integer NOT NULL CHECK (questions > 0),
  correct        integer NOT NULL CHECK (correct >= 0 AND correct <= questions),
  note           text,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL,
  voided_at      timestamptz,
  voided_by      uuid REFERENCES users(id)
);
CREATE INDEX question_logs_enr_date_idx ON question_logs (enrollment_id, date) WHERE voided_at IS NULL;
CREATE INDEX question_logs_topic_idx ON question_logs (topic_id);

-- Produção de material (P do APQR): resumo, mapa mental etc. Registrar produção NÃO muda a etapa.
CREATE TABLE production_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  student_id     uuid NOT NULL REFERENCES students(id),
  enrollment_id  uuid NOT NULL REFERENCES enrollments(id),
  topic_id       uuid NOT NULL REFERENCES topics(id),
  kind           text NOT NULL CHECK (kind IN ('resumo','mapa_mental','esquema','flashcards','anotacoes','outro')),
  is_update      boolean NOT NULL DEFAULT false,   -- atualização do material na fase Q+R
  note           text,
  date           date NOT NULL,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL,
  voided_at      timestamptz,
  voided_by      uuid REFERENCES users(id)
);
CREATE INDEX production_logs_enr_date_idx ON production_logs (enrollment_id, date) WHERE voided_at IS NULL;

-- Eventos de aprendizagem (append-only): toda mudança relevante, com ator e payload.
CREATE TABLE learning_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  student_id     uuid NOT NULL REFERENCES students(id),
  enrollment_id  uuid NOT NULL REFERENCES enrollments(id),
  topic_id       uuid REFERENCES topics(id),
  type           text NOT NULL,
  from_status    text,
  to_status      text,
  date           date NOT NULL,
  payload        jsonb,
  actor_user_id  uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL
);
CREATE INDEX learning_events_enr_idx ON learning_events (enrollment_id, date, created_at);
CREATE INDEX learning_events_topic_idx ON learning_events (topic_id, created_at);

-- Mapa de rotina semanal do aluno.
CREATE TABLE routine_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  student_id  uuid NOT NULL REFERENCES students(id),
  weekday     integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min   integer NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min     integer NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  category    text NOT NULL CHECK (category IN ('trabalho','deslocamento','familia','alimentacao','descanso','estudo','atividade_fisica','outros')),
  label       text,
  CHECK (end_min > start_min)
);
CREATE INDEX routine_blocks_student_idx ON routine_blocks (student_id, weekday);

-- ───────────── Mentoria ─────────────
CREATE TABLE teacher_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  student_id  uuid NOT NULL REFERENCES students(id),
  author_id   uuid NOT NULL REFERENCES users(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL,
  deleted_at  timestamptz
);
CREATE INDEX teacher_notes_student_idx ON teacher_notes (student_id, created_at);

-- ───────────── Arquivos e Conteúdos (área "Estudar com IA") ─────────────
CREATE TABLE files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  owner_user_id  uuid REFERENCES users(id),
  purpose        text NOT NULL CHECK (purpose IN ('content','logo')),
  original_name  text NOT NULL,
  mime           text NOT NULL,
  size_bytes     integer NOT NULL,
  storage_key    text NOT NULL,
  sha256         text NOT NULL,
  created_at     timestamptz NOT NULL,
  deleted_at     timestamptz
);

CREATE TABLE content_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  kind         text NOT NULL CHECK (kind IN ('text','video','link','file')),
  category     text NOT NULL DEFAULT 'geral',
  title        text NOT NULL,
  summary      text,
  body         text,
  url          text,
  file_id      uuid REFERENCES files(id),
  published    boolean NOT NULL DEFAULT false,
  position     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL,
  archived_at  timestamptz
);
CREATE INDEX content_items_tenant_idx ON content_items (tenant_id, published, position);

-- ───────────── Relatórios com IA ─────────────
CREATE TABLE ai_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  student_id     uuid NOT NULL REFERENCES students(id),
  enrollment_id  uuid NOT NULL REFERENCES enrollments(id),
  requested_by   uuid REFERENCES users(id),
  status         text NOT NULL CHECK (status IN ('ok','deterministic','rejected','error')),
  provider       text,
  model          text,
  input_hash     text NOT NULL,
  facts          jsonb NOT NULL,
  narrative      jsonb,
  validation     jsonb,
  tokens_in      integer,
  tokens_out     integer,
  cost_usd       numeric(10,5),
  duration_ms    integer,
  error          text,
  created_at     timestamptz NOT NULL
);
CREATE INDEX ai_reports_student_idx ON ai_reports (student_id, created_at);
CREATE INDEX ai_reports_tenant_day_idx ON ai_reports (tenant_id, created_at);

-- ───────────── Auditoria ─────────────
CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id),
  actor_user_id  uuid REFERENCES users(id),
  action         text NOT NULL,
  target_type    text,
  target_id      text,
  payload        jsonb,
  ip             text,
  created_at     timestamptz NOT NULL
);
CREATE INDEX audit_log_tenant_idx ON audit_log (tenant_id, created_at);

-- ───────────── Atividade diária (derivada; nunca fica inconsistente) ─────────────
CREATE VIEW daily_activity WITH (security_invoker = true) AS
  SELECT tenant_id, student_id, enrollment_id, date,
         sum(study_seconds)::integer AS study_seconds,
         sum(sessions_count)::integer AS sessions_count,
         sum(questions)::integer AS questions,
         sum(correct)::integer AS correct,
         sum(productions)::integer AS productions,
         sum(reviews)::integer AS reviews
  FROM (
    SELECT tenant_id, student_id, enrollment_id, date, duration_seconds AS study_seconds, 1 AS sessions_count, 0 AS questions, 0 AS correct, 0 AS productions, 0 AS reviews
      FROM study_sessions WHERE voided_at IS NULL
    UNION ALL
    SELECT tenant_id, student_id, enrollment_id, date, 0, 0, questions, correct, 0, CASE WHEN source = 'review' THEN 1 ELSE 0 END
      FROM question_logs WHERE voided_at IS NULL
    UNION ALL
    SELECT tenant_id, student_id, enrollment_id, date, 0, 0, 0, 0, 1, 0
      FROM production_logs WHERE voided_at IS NULL
  ) x
  GROUP BY tenant_id, student_id, enrollment_id, date;

-- ───────────── Row-Level Security ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'methodology_configs','users','students','staff_assignments','sessions','password_resets','invites',
    'editais','subjects','topics','enrollments','topic_progress',
    'study_sessions','active_timers','reviews','question_logs','production_logs','learning_events',
    'routine_blocks','teacher_notes','files','content_items','ai_reports','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant())', t);
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants USING (app_platform() OR id = app_tenant()) WITH CHECK (app_platform());
