-- V2.3 — Financeiro: vendas recebidas por webhook (qualquer checkout), importação/lançamento manual e painel.
--
--  * O checkout NÃO precisa estar definido: cada endereço de recebimento (webhook_endpoints) aceita qualquer carga
--    e guarda o conteúdo bruto em webhook_inbox. O leitor genérico entende nomes comuns de campo (inglês/português);
--    se o checkout usar nomes diferentes, a carga fica guardada e pode ser reprocessada depois.
--  * Venda = modelo neutro (sales). Status só avança (pending → approved → refunded/chargeback; pending → canceled).
--  * Valores em centavos (inteiro). Nunca em ponto flutuante.

CREATE TABLE finance_settings (
  tenant_id       uuid PRIMARY KEY REFERENCES tenants(id),
  auto_access     boolean NOT NULL DEFAULT false,  -- compra aprovada de produto que "libera acesso" cria/renova o aluno
  end_on_refund   boolean NOT NULL DEFAULT true,   -- reembolso/chargeback encerra o plano concedido pela venda
  notify_email    text,                            -- avisa por e-mail a cada compra/reembolso (vazio = não avisa)
  updated_at      timestamptz NOT NULL
);

CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'outro' CHECK (kind IN ('curso','mentoria','outro')),
  external_ref  text,                              -- código do produto no checkout (opcional)
  price_cents   integer CHECK (price_cents IS NULL OR price_cents >= 0),
  grants_access boolean NOT NULL DEFAULT false,    -- compra libera acesso à plataforma
  plan_days     integer CHECK (plan_days IS NULL OR plan_days BETWEEN 1 AND 3650),
  edital_id     uuid REFERENCES editais(id),       -- matrícula automática ao liberar acesso
  cohort        text,
  auto_created  boolean NOT NULL DEFAULT false,    -- criado sozinho a partir de uma venda (revisar)
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);
CREATE UNIQUE INDEX products_ref_uq ON products (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX products_name_uq ON products (tenant_id, lower(name));

CREATE TABLE webhook_endpoints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  label            text NOT NULL,                   -- ex.: "Proluno", "Hotmart"
  token            text NOT NULL UNIQUE,            -- segredo no endereço de recebimento
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  last_received_at timestamptz
);

CREATE TABLE sales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  source               text NOT NULL,               -- rótulo do endereço, 'manual' ou 'importacao'
  external_id          text NOT NULL,               -- identificador da venda no checkout (ou chave gerada)
  product_id           uuid REFERENCES products(id),
  product_name         text,
  buyer_name           text,
  buyer_email          text,
  buyer_phone          text,
  buyer_cpf            text,
  amount_cents         integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency             text NOT NULL DEFAULT 'BRL',
  payment_method       text,
  installments         integer,
  coupon               text,
  status               text NOT NULL CHECK (status IN ('pending','approved','refunded','chargeback','canceled')),
  paid_at              timestamptz,
  student_id           uuid REFERENCES students(id),
  access_granted_until date,                         -- plano concedido por esta venda
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);
CREATE UNIQUE INDEX sales_ext_uq ON sales (tenant_id, source, external_id);
CREATE INDEX sales_date_idx ON sales (tenant_id, created_at DESC);
CREATE INDEX sales_email_idx ON sales (tenant_id, lower(buyer_email));

CREATE TABLE sale_events (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  sale_id   uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  status    text NOT NULL,
  origin    text NOT NULL,                          -- webhook | manual | importacao
  note      text,
  at        timestamptz NOT NULL
);
CREATE INDEX sale_events_sale_idx ON sale_events (sale_id, at);

CREATE TABLE webhook_inbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  endpoint_id uuid REFERENCES webhook_endpoints(id),
  received_at timestamptz NOT NULL,
  payload     text NOT NULL,                        -- corpo bruto (limitado)
  result      text NOT NULL CHECK (result IN ('processed','ignored','error')),
  detail      text,
  sale_id     uuid REFERENCES sales(id) ON DELETE SET NULL
);
CREATE INDEX webhook_inbox_idx ON webhook_inbox (tenant_id, received_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','webhook_endpoints','sales','sale_events','webhook_inbox','finance_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_platform() OR tenant_id = app_tenant()) WITH CHECK (app_platform() OR tenant_id = app_tenant())', t);
  END LOOP;
END $$;
