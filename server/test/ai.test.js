/**
 * FASE 6 — Relatório com IA (fatos → diagnóstico → IA → validação), área "Estudar com IA" e arquivos.
 */
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetRateLimits, setup, agent, createPlatformAdmin, createTenantWithClass } from './helpers.js';
import { validateTemplate } from '../src/domain/ai/validate.js';
import { buildVariables } from '../src/domain/ai/facts.js';
import { deterministicNarrative, deterministicTemplate } from '../src/domain/ai/report.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apqr-files-'));
process.env.FILES_DIR = tmp;
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const FACTS = {
  data_de_referencia: '2026-09-30',
  edital: { nome: 'SES 2026', dias_para_prova: 90 },
  regras_vigentes: { versao: 1, minimo_questoes_por_revisao: 20, consolida_acima_de_percentual: 70, maximo_revisoes_por_ciclo: 4 },
  situacao_atual: { conteudos_no_edital: 20, consolidados: 5, em_revisao: 3, material_pronto: 2, em_assimilacao: 1, nao_iniciados: 9, aguardando_rodizio: 0, consolidacao_percentual: 25 },
  ultimas_4_semanas: { horas_estudadas: 12.5, dias_ativos: 14, dias_ativos_nas_4_semanas_anteriores: 10, questoes: 120, acertos: 87, percentual_acerto: 72.5, percentual_acerto_4_semanas_anteriores: null, materiais_produzidos: 3, constancia: 70, evolucao_pontos_percentuais: 10, conteudos_consolidados_no_periodo: 2, dias_desde_ultima_atividade: 0 },
  materias: [{ nome: 'Legislação SUS — Lei 8.080/1990', conteudos: 5, consolidados: 2, horas_4_semanas: 3, questoes_4_semanas: 40, percentual_acerto_4_semanas: 70, prioridade_plano_global: 1 }],
  conteudos_com_menor_resultado: [{ materia: 'Farmacologia', conteudo: 'Antibióticos', ultimo_percentual: 55, revisoes_no_ciclo: 2 }],
  conteudos_com_melhor_resultado: [],
  diagnosticos: [{ codigo: 'inactive', severidade: 'serious', titulo: 'Parado', fatos: 'Sem nenhum registro há 9 dias (último em 21/09/2026).' }],
};
const VARS = buildVariables(FACTS);
const good = {
  resumo: 'O aluno tem {consolidados} de {conteudos_no_edital} conteúdos consolidados ({consolidacao_pct}). Nas últimas quatro semanas foram {dias_ativos_4sem} dias ativos e {acerto_4sem_pct} de acerto.',
  pontos_fortes: ['Constância de {constancia}.'], pontos_de_atencao: ['{conteudo_fraco_1} com {conteudo_fraco_1_pct}.', '{diagnostico_1}.'], recomendacoes: ['Revisar {materia_1}.'], mensagem_ao_aluno: 'Siga firme nas revisões.',
};

describe('validação do texto da IA (marcadores)', () => {
  test('aceita modelo só com marcadores e preenche com os valores da plataforma (nomes com dígitos inclusive)', () => {
    const v = validateTemplate(good, VARS);
    assert.equal(v.ok, true, v.problems.join(' '));
    assert.match(v.narrative.resumo, /5 de 20 conteúdos consolidados \(25%\)/);
    assert.match(v.narrative.resumo, /72,5% de acerto/);
    assert.match(v.narrative.recomendacoes[0], /Lei 8\.080\/1990/);
    assert.match(v.narrative.pontos_de_atencao[1], /21\/09\/2026/);
    assert.equal(v.placeholders, 10);
  });
  test('reprova qualquer número digitado pela IA — mesmo um número que existe nos dados', () => {
    const a = validateTemplate({ ...good, resumo: 'O aluno tem 5 conteúdos consolidados.' }, VARS);
    assert.equal(a.ok, false);
    assert.match(a.problems.join(' '), /escrito diretamente/);
    assert.equal(validateTemplate({ ...good, pontos_fortes: ['Fez a R2 com sucesso.'] }, VARS).ok, false);
    assert.equal(validateTemplate({ ...good, pontos_fortes: ['Estudou nas últimas 4 semanas.'] }, VARS).ok, false);
  });
  test('reprova data e mês inventados', () => {
    assert.equal(validateTemplate({ ...good, resumo: 'Última revisão em 12/09.' }, VARS).ok, false);
    assert.equal(validateTemplate({ ...good, resumo: 'Estudou bastante em setembro.' }, VARS).ok, false);
  });
  test('reprova marcador inexistente e marcador de valor nulo', () => {
    assert.match(validateTemplate({ ...good, resumo: 'Acerto de {acerto_total}.' }, VARS).problems.join(' '), /inexistentes/);
    assert.equal(validateTemplate({ ...good, resumo: 'Antes: {acerto_anterior_pct}.' }, VARS).ok, false);
  });
  test('reprova comparação com a turma, tema de saúde e promessa de aprovação', () => {
    assert.equal(validateTemplate({ ...good, resumo: 'Está acima da média da turma.' }, VARS).ok, false);
    assert.equal(validateTemplate({ ...good, resumo: 'Pode ser ansiedade.' }, VARS).ok, false);
    assert.equal(validateTemplate({ ...good, mensagem_ao_aluno: 'Aprovação garantida!' }, VARS).ok, false);
  });
  test('reprova formato inválido', () => {
    assert.equal(validateTemplate(null, VARS).ok, false);
    assert.equal(validateTemplate({ resumo: 'x' }, VARS).ok, false);
  });
  test('o relatório por regras usa os mesmos marcadores e passa na validação', () => {
    const v = validateTemplate(deterministicTemplate(FACTS, VARS), VARS);
    assert.equal(v.ok, true, v.problems.join(' '));
    assert.deepEqual(v.narrative, deterministicNarrative(FACTS));
  });
});

describe('API do relatório com IA', () => {
  let admin, A, B, eid;
  before(async () => {
    await setup();
    admin = await createPlatformAdmin();
    A = await createTenantWithClass(admin.agent, { slug: 'ia-a', students: 1 });
    B = await createTenantWithClass(admin.agent, { slug: 'ia-b', students: 0 });
    eid = A.students[0].enrollments[0].id;
    const topic = A.structure[0].topics[0];
    await A.students[0].agent.post(`/api/enrollments/${eid}/topics/${topic.id}/status`).send({ status: 'review' }).expect(200);
    await A.students[0].agent.post(`/api/enrollments/${eid}/topics/${topic.id}/reviews`).send({ questions: 30, correct: 25 }).expect(201);
  });
  beforeEach(() => { resetRateLimits(); delete process.env.AI_PROVIDER; delete process.env.AI_DAILY_LIMIT_PER_TENANT; });

  test('sem IA configurada: relatório determinístico, sem custo, com fatos sem dados pessoais', async () => {
    const r = await A.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({}).expect(201);
    assert.equal(r.body.report.status, 'deterministic');
    assert.equal(r.body.report.provider, 'none');
    const factsText = JSON.stringify(r.body.report.facts);
    assert.ok(!factsText.includes('@'), 'sem e-mail');
    assert.ok(!factsText.includes('Aluno Teste'), 'sem nome');
    assert.equal(r.body.report.facts.situacao_atual.consolidados, 1);
    assert.ok(r.body.report.narrative.resumo.includes('1 de 6'));
  });

  test('com provedor (mock): gera, valida, registra custo; mesmos fatos → cache; force → nova geração', async () => {
    process.env.AI_PROVIDER = 'mock';
    const first = await A.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({ force: true }).expect(201);
    assert.equal(first.body.report.status, 'ok');
    assert.equal(first.body.report.provider, 'mock');
    assert.equal(first.body.report.validation.ok, true);
    const again = await A.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({}).expect(200);
    assert.equal(again.body.cached, true);
    assert.equal(again.body.report.id, first.body.report.id);
    const forced = await A.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({ force: true }).expect(201);
    assert.notEqual(forced.body.report.id, first.body.report.id);
    const list = await A.teacher.get(`/api/teacher/enrollments/${eid}/ai-reports`).expect(200);
    assert.ok(list.body.reports.length >= 3);
    const st = await A.teacher.get('/api/teacher/ai/status').expect(200);
    assert.equal(st.body.provider, 'mock');
    assert.ok(st.body.used_today >= 2);
  });

  test('IA que digita um número por conta própria é reprovada e a tela mostra a versão por regras', async () => {
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_MOCK_RESPONSE = JSON.stringify({ resumo: 'O aluno consolidou 3 conteúdos em setembro.', pontos_fortes: [], pontos_de_atencao: [], recomendacoes: [], mensagem_ao_aluno: 'Siga.' });
    try {
      const r = await A.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({ force: true }).expect(201);
      assert.equal(r.body.report.status, 'rejected');
      assert.match(r.body.report.validation.problems.join(' '), /escrito diretamente/);
      assert.ok(r.body.report.narrative.resumo.includes('1 de 6'), 'exibe o relatório por regras');
    } finally { delete process.env.AI_MOCK_RESPONSE; }
  });

  test('limite diário por ambiente: excedido → relatório por regras, sem chamar a IA', async () => {
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_DAILY_LIMIT_PER_TENANT = '1';
    const r = await A.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({ force: true }).expect(201);
    assert.equal(r.body.limit_reached, true);
    assert.equal(r.body.report.status, 'deterministic');
  });

  test('isolamento: aluno não gera; outra professora não acessa', async () => {
    await A.students[0].agent.post(`/api/teacher/enrollments/${eid}/ai-report`).send({}).expect(403);
    await B.teacher.post(`/api/teacher/enrollments/${eid}/ai-report`).send({}).expect(404);
    await B.teacher.get(`/api/teacher/enrollments/${eid}/ai-reports`).expect(404);
  });
});

describe('Estudar com IA — conteúdos e arquivos', () => {
  let admin, A, B;
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  const upload = (a, buf, name, purpose = 'content') => a.raw.post(`/api/files?purpose=${purpose}&name=${encodeURIComponent(name)}`).set('X-Requested-With', 'apqr').set('Content-Type', 'application/octet-stream').send(buf);
  before(async () => {
    await setup();
    admin = await createPlatformAdmin();
    A = await createTenantWithClass(admin.agent, { slug: 'cont-a', students: 1 });
    B = await createTenantWithClass(admin.agent, { slug: 'cont-b', students: 1 });
  });
  beforeEach(() => resetRateLimits());

  test('upload identifica o tipo pelos bytes e recusa tipos perigosos', async () => {
    const ok = await upload(A.teacher, PDF, 'guia.pdf').expect(201);
    assert.equal(ok.body.file.mime, 'application/pdf');
    await upload(A.teacher, Buffer.from('<svg onload="alert(1)"></svg>'), 'x.svg').expect(400);
    await upload(A.teacher, Buffer.from('MZ\x90\x00binario'), 'x.pdf').expect(400);
    await upload(A.students[0].agent, PDF, 'a.pdf').expect(403);
  });

  test('aluno só vê e baixa conteúdo publicado do próprio ambiente', async () => {
    const f = (await upload(A.teacher, PDF, 'Guia de prompts.pdf').expect(201)).body.file;
    const item = (await A.teacher.post('/api/teacher/contents').send({ kind: 'file', title: 'Guia de prompts', file_id: f.id, published: false }).expect(201)).body.item;
    const s = A.students[0].agent;
    assert.equal((await s.get('/api/me/contents').expect(200)).body.items.length, 0);
    await s.get(`/api/files/${f.id}`).expect(404);
    await A.teacher.patch(`/api/teacher/contents/${item.id}`).send({ published: true }).expect(200);
    assert.equal((await s.get('/api/me/contents').expect(200)).body.items.length, 1);
    const dl = await s.get(`/api/files/${f.id}`).expect(200);
    assert.equal(dl.headers['content-type'], 'application/pdf');
    assert.match(dl.headers['content-security-policy'], /sandbox/);
    // outro ambiente não enxerga
    await B.students[0].agent.get(`/api/files/${f.id}`).expect(404);
    await B.teacher.get(`/api/files/${f.id}`).expect(404);
    await B.teacher.patch(`/api/teacher/contents/${item.id}`).send({ published: false }).expect(404);
    // arquivar tira do aluno
    await A.teacher.patch(`/api/teacher/contents/${item.id}`).send({ archived: true }).expect(200);
    await s.get(`/api/files/${f.id}`).expect(404);
  });

  test('validações: link precisa ser https; vídeo precisa de link; texto precisa de corpo', async () => {
    await A.teacher.post('/api/teacher/contents').send({ kind: 'link', title: 'Site', url: 'http://inseguro.com' }).expect(400);
    await A.teacher.post('/api/teacher/contents').send({ kind: 'video', title: 'Aula' }).expect(400);
    await A.teacher.post('/api/teacher/contents').send({ kind: 'text', title: 'Texto' }).expect(400);
    await A.teacher.post('/api/teacher/contents').send({ kind: 'video', title: 'Aula sobre IA', url: 'https://www.youtube.com/watch?v=abc123', published: true }).expect(201);
  });

  test('logotipo: só imagem, gravado no próprio ambiente e servido publicamente', async () => {
    const f = (await upload(A.teacher, PNG, 'logo.png', 'logo').expect(201)).body.file;
    await upload(A.teacher, PDF, 'logo.pdf', 'logo').expect(400);
    await A.teacher.put('/api/teacher/branding').send({ logo_file_id: f.id, primary_color: '#123456' }).expect(200);
    const logo = await agent().get('/api/public/logo/cont-a').expect(200);
    assert.equal(logo.headers['content-type'], 'image/png');
    // outra professora não consegue usar o arquivo de A
    await B.teacher.put('/api/teacher/branding').send({ logo_file_id: f.id }).expect(404);
    await agent().get('/api/public/logo/cont-b').expect(404);
    const me = await A.teacher.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.tenant.brand.primary_color, '#123456');
  });
});
