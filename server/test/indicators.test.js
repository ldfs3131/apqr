/**
 * FASES 4–5 — Central da professora, indicadores, diagnósticos e ranking.
 * Parte 1: funções puras (fórmulas documentadas em docs/METRICAS.md).
 * Parte 2: API — isolamento (aluno, monitor, outro ambiente) e consistência dos números.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeIndicators, diagnose, rank, NEW_STUDENT_DAYS } from '../src/domain/indicators.js';
import { addDays } from '../src/lib/util.js';
import { resetRateLimits, setup, agent, login, createPlatformAdmin, createTenantWithClass, createActiveStudent, tokenFromUrl, PASSWORD } from './helpers.js';

const T = '2026-09-30';
const SETTINGS = { inactivity_days: 7 };
const raw = (over = {}) => ({
  enrollment_id: 'e1', student_id: 's1', edital_id: 'ed', edital_name: 'Edital', name: 'Aluno', email: 'a@x', last_login_at: null,
  extra_reviews_allowed: false, enrolled_at: `${addDays(T, -60)}T12:00:00Z`, topics_total: 20, subjects_total: 4,
  status: [], consolidated_past: 0, reviewed_past: 0, reviewed_now: 0, activity: [], events: [], last_activity: null,
  backlog: 0, material_idle: 0, subject_hours: [], ...over,
});
const days = (list) => list.map((d) => ({ date: addDays(T, d), study_seconds: 3600, questions: 0, correct: 0, productions: 0, reviews: 0 }));

describe('fórmulas (funções puras)', () => {
  test('consolidação = consolidados ÷ conteúdos ativos; evolução = diferença em p.p. vs. 28 dias atrás', () => {
    const ind = computeIndicators(raw({ status: [{ status: 'consolidated', n: 5, locked: 0 }, { status: 'review', n: 3, locked: 1 }], consolidated_past: 2 }), { today: T });
    assert.equal(ind.consolidation_pct, 25);
    assert.equal(ind.consolidation_past_pct, 10);
    assert.equal(ind.evolution_pp, 15);
    assert.equal(ind.consolidated_delta, 3);
    assert.equal(ind.counts.not_started, 12);
    assert.equal(ind.locked, 1);
  });

  test('constância: teto de 5 dias por semana, 4 semanas', () => {
    // 7 dias ativos em todas as 4 semanas → 100 (não passa de 100)
    const all = computeIndicators(raw({ activity: days(Array.from({ length: 28 }, (_, i) => -i)) }), { today: T });
    assert.equal(all.constancy, 100);
    // 2 dias por semana → 2*4 / 20 = 40
    const two = computeIndicators(raw({ activity: days([0, -1, -7, -8, -14, -15, -21, -22]) }), { today: T });
    assert.equal(two.constancy, 40);
    // mudança de etapa conta como dia ativo
    const ev = computeIndicators(raw({ events: [{ date: T, type: 'status_change' }] }), { today: T });
    assert.equal(ev.active_days_28, 1);
  });

  test('aluno com 2 semanas é avaliado só sobre as semanas em que estava matriculado', () => {
    const ind = computeIndicators(raw({ enrolled_at: `${addDays(T, -13)}T12:00:00Z`, activity: days([0, -1, -2, -7, -8]) }), { today: T });
    // semanas contadas: 2 (as duas mais recentes) → (3 + 2) / 10 = 50
    assert.equal(ind.weeks.filter((w) => w.counted).length, 2);
    assert.equal(ind.constancy, 50);
  });

  test(`aluno novo (< ${NEW_STUDENT_DAYS} dias) não tem constância/evolução e fica fora das posições`, () => {
    const ind = computeIndicators(raw({ enrolled_at: `${addDays(T, -3)}T12:00:00Z` }), { today: T });
    assert.equal(ind.is_new, true);
    assert.equal(ind.constancy, null);
    assert.equal(ind.evolution_pp, null);
    const { ranked, unranked } = rank([{ ...ind, name: 'Novo' }]);
    assert.equal(ranked.length, 0);
    assert.equal(unranked.length, 1);
  });

  test('diagnósticos: parado usa o limite configurado; nunca começou; queda de frequência; acerto em queda', () => {
    const stopped = computeIndicators(raw({ activity: days([-10, -11]), last_activity: addDays(T, -10) }), { today: T });
    assert.equal(diagnose(stopped, SETTINGS)[0].code, 'inactive');
    assert.equal(diagnose(stopped, SETTINGS)[0].severity, 'serious');
    assert.equal(diagnose(stopped, { inactivity_days: 5 })[0].severity, 'critical'); // 10 ≥ 2×5
    assert.equal(diagnose(stopped, { inactivity_days: 15 }).some((g) => g.code === 'inactive'), false);

    const never = computeIndicators(raw({ enrolled_at: `${addDays(T, -9)}T12:00:00Z` }), { today: T });
    assert.equal(diagnose(never, SETTINGS)[0].code, 'never_started');

    const drop = computeIndicators(raw({ activity: days([0, -30, -31, -32, -33, -34, -35, -36, -37, -38, -39]), last_activity: T }), { today: T });
    assert.ok(diagnose(drop, SETTINGS).some((g) => g.code === 'frequency_drop'));

    const acc = computeIndicators(raw({
      last_activity: T,
      activity: [
        { date: T, study_seconds: 0, questions: 50, correct: 25, productions: 0, reviews: 1 },
        { date: addDays(T, -35), study_seconds: 0, questions: 50, correct: 40, productions: 0, reviews: 1 },
      ],
    }), { today: T });
    const g = diagnose(acc, SETTINGS).find((x) => x.code === 'accuracy_drop');
    assert.ok(g, 'acerto em queda');
    assert.match(g.facts, /50%.*80%/);
  });

  test('parado não recebe rótulos positivos (evoluindo/constante)', () => {
    const ind = computeIndicators(raw({ status: [{ status: 'consolidated', n: 10, locked: 0 }], consolidated_past: 0, activity: days([-9]), last_activity: addDays(T, -9) }), { today: T });
    const codes = diagnose(ind, SETTINGS).map((g) => g.code);
    assert.ok(codes.includes('inactive'));
    assert.ok(!codes.includes('improving'));
  });

  test('ranking é determinístico: desempate pelos outros indicadores e nome; empate exato = mesma posição', () => {
    const rows = [
      { name: 'Bia', is_new: false, consolidation_pct: 50, evolution_pp: 5, constancy: 80 },
      { name: 'Ana', is_new: false, consolidation_pct: 50, evolution_pp: 5, constancy: 80 },
      { name: 'Caio', is_new: false, consolidation_pct: 50, evolution_pp: 10, constancy: 20 },
      { name: 'Davi', is_new: false, consolidation_pct: 20, evolution_pp: 0, constancy: 100 },
    ];
    const a = rank(rows.map((r) => ({ ...r })), 'consolidation').ranked;
    assert.deepEqual(a.map((r) => [r.name, r.position]), [['Caio', 1], ['Ana', 2], ['Bia', 2], ['Davi', 4]]);
    const b = rank(rows.map((r) => ({ ...r })).reverse(), 'consolidation').ranked;
    assert.deepEqual(b.map((r) => r.name), a.map((r) => r.name));
    const c = rank(rows.map((r) => ({ ...r })), 'constancy').ranked;
    assert.equal(c[0].name, 'Davi');
  });
});

describe('API da central, ranking e Raio-X', () => {
  let admin, A, B;
  before(async () => {
    await setup();
    admin = await createPlatformAdmin();
    A = await createTenantWithClass(admin.agent, { slug: 'central-a', students: 3 });
    B = await createTenantWithClass(admin.agent, { slug: 'central-b', students: 1 });
  });
  beforeEach(() => resetRateLimits());

  test('central lista os alunos do ambiente com indicadores e diagnósticos', async () => {
    const s = A.students[0];
    const topic = A.structure[0].topics[0];
    await s.agent.post(`/api/enrollments/${s.enrollments[0].id}/topics/${topic.id}/status`).send({ status: 'assimilation' }).expect(200);
    const r = await A.teacher.get('/api/teacher/central').expect(200);
    assert.equal(r.body.students.length, 3);
    assert.equal(r.body.scope, 'student');
    assert.equal(r.body.kpis.studied_today, 1);
    assert.equal(r.body.pulse.length, 14);
    const me = r.body.students.find((x) => x.student_id === s.studentId);
    assert.equal(me.days_since_activity, 0);
    assert.ok(Array.isArray(me.diagnostics));
    // outro ambiente não aparece
    assert.ok(!r.body.students.some((x) => x.student_id === B.students[0].studentId));
  });

  test('aluno em dois editais: visão geral soma a atividade; visão por edital separa', async () => {
    // segundo edital com um conteúdo; aluno 1 vinculado aos dois, estuda só no primeiro
    const ed2 = (await A.teacher.post('/api/teacher/editais').send({ name: 'Segundo edital' }).expect(201)).body.edital;
    await A.teacher.post(`/api/teacher/editais/${ed2.id}/subjects`).send({ name: 'SUS', topics: ['Lei 8.080'] }).expect(201);
    const s = A.students[0];
    await A.teacher.post(`/api/teacher/students/${s.studentId}/enrollments`).send({ edital_id: ed2.id }).expect(201);
    const geral = await A.teacher.get('/api/teacher/central').expect(200);
    assert.equal(geral.body.scope, 'student');
    const row = geral.body.students.find((x) => x.student_id === s.studentId);
    assert.equal(row.editais.length, 2, 'uma linha por aluno, com os dois editais');
    assert.equal(row.days_since_activity, 0, 'atividade soma os editais');
    assert.ok(!row.diagnostics.some((g) => ['inactive', 'never_started', 'new_student'].includes(g.code) && g.severity !== 'info'), 'não aparece como parado');
    assert.equal(geral.body.students.filter((x) => x.student_id === s.studentId).length, 1);
    const soB = await A.teacher.get(`/api/teacher/central?edital_id=${ed2.id}`).expect(200);
    assert.equal(soB.body.scope, 'edital');
    const rowB = soB.body.students.find((x) => x.student_id === s.studentId);
    assert.equal(rowB.last_activity, null, 'no edital B, sem registros');
    assert.equal(rowB.editais[0].edital_name, 'Segundo edital');
  });

  test('aluno não acessa central, ranking nem Raio-X', async () => {
    const s = A.students[1];
    await s.agent.get('/api/teacher/central').expect(403);
    await s.agent.get(`/api/teacher/ranking?edital_id=${A.edital.id}`).expect(403);
    await s.agent.get(`/api/teacher/students/${A.students[0].studentId}/xray`).expect(403);
  });

  test('professora de outro ambiente não vê o ranking nem o Raio-X', async () => {
    await B.teacher.get(`/api/teacher/ranking?edital_id=${A.edital.id}`).expect(404);
    await B.teacher.get(`/api/teacher/students/${A.students[0].studentId}/xray`).expect(404);
    const c = await B.teacher.get(`/api/teacher/central?edital_id=${A.edital.id}`).expect(200);
    assert.equal(c.body.students.length, 0);
  });

  test('monitor não acessa central, ranking nem Raio-X; coordenadora acessa', async () => {
    const mk = async (role, email) => {
      const res = await A.teacher.post('/api/teacher/team').send({ name: 'Pessoa Equipe', email, role }).expect(201);
      const a = agent();
      await a.post(`/api/auth/invite/${tokenFromUrl(res.body.invite.url)}`).send({ password: PASSWORD }).expect(201);
      return a;
    };
    const m = await mk('mentor', `mon-${Date.now()}@oneup.test`);
    await m.get('/api/teacher/central').expect(403);
    await m.get(`/api/teacher/ranking?edital_id=${A.edital.id}`).expect(403);
    await m.get(`/api/teacher/students/${A.students[2].studentId}/xray`).expect(403);
    const c = await mk('coordinator', `coord-${Date.now()}@oneup.test`);
    await c.get('/api/teacher/central').expect(200);
    await c.get(`/api/teacher/students/${A.students[2].studentId}/xray`).expect(200);
    await c.put('/api/teacher/settings').send({ settings: { min_questions_per_review: 30 }, reason: 'teste', confirm: true }).expect(403);
  });

  test('ranking: alunos recém-matriculados ficam sem posição; método documentado na resposta', async () => {
    const r = await A.teacher.get(`/api/teacher/ranking?edital_id=${A.edital.id}&metric=constancy`).expect(200);
    assert.equal(r.body.metric, 'constancy');
    assert.equal(r.body.ranked.length, 0); // todos matriculados hoje
    assert.equal(r.body.unranked.length, 3);
    assert.ok(r.body.method.constancy.includes('dias ativos'));
  });

  test('Raio-X traz indicadores por edital, CPF mascarado e fica auditado', async () => {
    const s = A.students[0];
    const r = await A.teacher.get(`/api/teacher/students/${s.studentId}/xray`).expect(200);
    assert.equal(r.body.indicators.length, 2); // um bloco por edital (o aluno está em dois)
    assert.match(r.body.student.cpf, /\*/);
    const audit = await A.teacher.get('/api/teacher/audit').expect(200);
    assert.ok(audit.body.audit.some((a) => a.action === 'student.view_xray' && a.target_id === s.studentId));
  });

  test('admin ONE UP operando o ambiente acessa a central (auditado); sem ambiente, não', async () => {
    await admin.agent.get('/api/teacher/central').expect(403);
    const r = await admin.agent.raw.get('/api/teacher/central').set('X-Tenant-Id', A.tenant.id).expect(200);
    assert.equal(r.body.students.length, 3);
  });
});

void login;

describe('ranking: horas, questões e % de acerto', () => {
  test('acerto só ranqueia com amostra mínima; horas e questões ordenam por volume', async () => {
    const { rank, ACCURACY_MIN_QUESTIONS } = await import('../src/domain/indicators.js');
    const mk = (name, secs, q, acc) => ({ name, is_new: false, study_seconds_28: secs, questions_28: q, accuracy_28: acc, consolidation_pct: 0 });
    const rows = () => [mk('Ana', 3600, 100, 70), mk('Bia', 7200, 10, 100), mk('Caio', 1800, ACCURACY_MIN_QUESTIONS, 80)];
    assert.deepEqual(rank(rows(), 'hours').ranked.map((r) => r.name), ['Bia', 'Ana', 'Caio']);
    assert.deepEqual(rank(rows(), 'questions').ranked.map((r) => r.name), ['Ana', 'Caio', 'Bia']);
    const acc = rank(rows(), 'accuracy');
    assert.deepEqual(acc.ranked.map((r) => r.name), ['Caio', 'Ana']);
    assert.deepEqual(acc.unranked.map((r) => r.name), ['Bia']);        // 10 questões: sem posição de nota
  });
});
