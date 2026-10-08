/**
 * V2.2 — Base de alunos: importação (CSV) idempotente, plano/vencimento, engajamento, listas para baixar e permissões.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetRateLimits, setup, agent, login, createPlatformAdmin, createTenantWithClass, nextCpf, tokenFromUrl, profile, PASSWORD } from './helpers.js';
import { addDays, today } from '../src/lib/util.js';
import { parseCsv, readRosterCsv, engagementOf } from '../src/domain/roster.js';

const T = today();
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fmtCpf = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
let admin, A, B, uid = 0;
const em = (p) => `${p}-${++uid}-${Date.now()}@base.test`;

before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'base-a', students: 1 });
  B = await createTenantWithClass(admin.agent, { slug: 'base-b', students: 1 });
});
beforeEach(() => resetRateLimits());

function csv(rows) {
  const head = 'nome;email;celular;cpf;turma;turma_original;ultimo_login;fim_do_plano;situacao';
  return '﻿' + [head, ...rows.map((r) => [r.nome, r.email, r.celular ?? '(61) 99999-0000', r.cpf ?? '', r.turma ?? 'ANVISA', r.orig ?? '', r.login ?? '', r.fim ?? '', r.sit ?? ''].join(';'))].join('\r\n');
}

describe('leitura do CSV', () => {
  test('aspas, separador ; ou , e datas dd/mm/aaaa', () => {
    assert.deepEqual(parseCsv('a;b\r\n"x;1";"di""z"\n'), [['a', 'b'], ['x;1', 'di"z']]);
    assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
    const { records, errors } = readRosterCsv('Nome,E-mail,Fim do plano,Situação\nAna Lima,ANA@X.COM,05/03/2027,Ativo\nSem Email,,01/01/2027,ativo\nBia,b@x.com,31/02/2027,ativo\nCíntia,c@x.com,,cancelado', T);
    assert.equal(records.length, 2);
    assert.deepEqual([records[0].email, records[0].access_until, records[0].plan_status], ['ana@x.com', '2027-03-05', 'active']);
    assert.equal(records[1].plan_status, 'ended');
    assert.deepEqual(errors.map((e) => e.line), [3, 4]);
    assert.match(errors[1].reason, /fim do plano/);
  });

  test('sem coluna situação: plano ativo até a data de fim', () => {
    const { records } = readRosterCsv(`nome;email;fim_do_plano\nAna;a@x.com;${br(addDays(T, -1))}\nBia;b@x.com;${br(T)}\nCris;c@x.com;`, T);
    assert.deepEqual(records.map((r) => r.plan_status), ['ended', 'active', 'active']);
  });

  test('faixas de engajamento: 7 / 8 / 30 / 31 dias', () => {
    assert.deepEqual([0, 7, 8, 30, 31, null].map(engagementOf), ['active', 'active', 'attention', 'attention', 'inactive', 'never']);
  });

  test('arquivo sem nome/e-mail é recusado com mensagem clara', async () => {
    const r = await A.teacher.post('/api/teacher/roster/import').send({ csv: 'aluno;telefone\nAna;123', dry_run: true }).expect(400);
    assert.match(r.body.error.message, /"nome" e "email"/);
  });
});

describe('importação', () => {
  const people = {};
  test('prévia não grava; importação cria; reimportação atualiza sem duplicar', async () => {
    Object.assign(people, { ana: em('ana'), bia: em('bia'), cris: em('cris'), dani: em('dani'), edu: em('edu') });
    const cpf = nextCpf();
    const rows = [
      { nome: 'Ana Ativa', email: people.ana, cpf: fmtCpf(cpf), login: br(addDays(T, -2)), fim: br(addDays(T, 10)), sit: 'ativo', orig: 'Base ANVISA 2026' },
      { nome: 'Bia Atenção', email: people.bia, login: br(addDays(T, -8)), fim: br(addDays(T, 40)), sit: 'ativo', turma: 'SES-DF' },
      { nome: 'Cris Inativa', email: people.cris, login: br(addDays(T, -31)), fim: br(addDays(T, 5)), sit: 'ativo', turma: 'SES-DF' },
      { nome: 'Dani Encerrada', email: people.dani, login: br(addDays(T, -100)), fim: br(addDays(T, -20)), sit: 'encerrado' },
      { nome: 'Edu Sem Data', email: people.edu, login: '', fim: '', sit: 'encerrado', cpf: '111.111.111-11' },
      { nome: 'Repetido', email: people.ana, sit: 'ativo' },
      { nome: 'X', email: 'sem-arroba', sit: 'ativo' },
      { nome: 'Professora de outro ambiente', email: B.teacherEmail, sit: 'ativo' },
    ];
    const prev = (await A.teacher.post('/api/teacher/roster/import').send({ csv: csv(rows), dry_run: true }).expect(200)).body;
    assert.deepEqual([prev.dry_run, prev.created, prev.updated, prev.skipped, prev.active, prev.ended], [true, 5, 0, 3, 3, 2]);
    assert.ok(prev.errors.some((e) => /repetido/.test(e.reason)));
    assert.ok(prev.errors.some((e) => /outro ambiente/.test(e.reason)));
    assert.ok(prev.warnings.some((w) => /CPF ignorado/.test(w.reason)));
    let roster = (await A.teacher.get('/api/teacher/roster').expect(200)).body;
    assert.equal(roster.students.filter((s) => s.imported).length, 0, 'prévia não grava nada');

    const r = (await A.teacher.post('/api/teacher/roster/import').send({ csv: csv(rows) }).expect(200)).body;
    assert.deepEqual([r.created, r.updated, r.skipped], [5, 0, 3]);
    roster = (await A.teacher.get('/api/teacher/roster').expect(200)).body;
    const by = Object.fromEntries(roster.students.map((s) => [s.email, s]));
    assert.deepEqual([by[people.ana].plan, by[people.ana].engagement, by[people.ana].days_to_end, by[people.ana].cohort], ['active', 'active', 10, 'ANVISA']);
    assert.equal(by[people.bia].engagement, 'attention');
    assert.equal(by[people.cris].engagement, 'inactive');
    assert.deepEqual([by[people.dani].plan, by[people.edu].plan, by[people.edu].engagement], ['ended', 'ended', 'never']);
    assert.equal(roster.students.filter((s) => s.imported).length, 5);

    // Reimportação: atualiza turma/plano/acesso; o último login nunca volta no tempo.
    rows[0] = { ...rows[0], turma: 'ANVISA 2027', login: br(addDays(T, -60)), fim: br(addDays(T, 90)) };
    rows[3] = { ...rows[3], fim: br(addDays(T, 30)), sit: 'ativo' };
    const again = (await A.teacher.post('/api/teacher/roster/import').send({ csv: csv(rows) }).expect(200)).body;
    assert.deepEqual([again.created, again.updated], [0, 5]);
    roster = (await A.teacher.get('/api/teacher/roster').expect(200)).body;
    const by2 = Object.fromEntries(roster.students.map((s) => [s.email, s]));
    assert.deepEqual([by2[people.ana].cohort, by2[people.ana].days_to_end, by2[people.ana].engagement], ['ANVISA 2027', 90, 'active']);
    assert.equal(by2[people.dani].plan, 'active', 'renovada na planilha');
    assert.equal(roster.students.filter((s) => s.email === people.ana).length, 1);
  });

  test('resumo: indicadores, turmas, vencimentos e histórico', async () => {
    const d = (await A.teacher.get('/api/teacher/roster').expect(200)).body;
    const k = d.kpis;
    assert.equal(k.total, d.students.length);
    assert.equal(k.active + k.ended, k.total);
    assert.equal(k.engaged + k.attention + k.inactive + k.never, k.active);
    const sesdf = d.cohorts.find((c) => c.cohort === 'SES-DF');
    assert.deepEqual([sesdf.total, sesdf.active, sesdf.attention, sesdf.inactive], [2, 2, 1, 1]);
    assert.equal(d.expirations.length, 6);
    assert.ok(d.ended_by_year.some((y) => y.year === 'Sem data'));
    assert.ok(k.expiring_30 >= 2); // Cris (5 dias) e Dani (30 dias)
  });

  test('aluno importado: convite, cadastro e login; encerrado não entra até renovar', async () => {
    const d = (await A.teacher.get('/api/teacher/roster').expect(200)).body;
    const edu = d.students.find((s) => s.email === people.edu);
    const inv = (await A.teacher.post(`/api/teacher/students/${edu.id}/invite`).expect(200)).body.invite;
    const a = agent();
    await a.post(`/api/auth/invite/${tokenFromUrl(inv.url)}`).send(profile()).expect(201);
    const blockedAgent = agent();
    await login(blockedAgent, people.edu);
    assert.equal((await blockedAgent.get('/api/me/enrollments').expect(403)).body.error.code, 'access_expired');
    // Renovação: nova data de fim no futuro reabre o plano.
    const ch = (await A.teacher.patch(`/api/teacher/students/${edu.id}`).send({ access_until: addDays(T, 60) }).expect(200)).body.changes;
    assert.equal(ch.plan_status, 'active');
    const s = agent();
    await login(s, people.edu);
    // Encerrar plano derruba as sessões.
    await A.teacher.patch(`/api/teacher/students/${edu.id}`).send({ plan_status: 'ended' }).expect(200);
    await s.get('/api/me/enrollments').expect(401);
  });
});

describe('listas para baixar', () => {
  test('CSV para Excel: filtros, sem CPF, proteção contra fórmula e auditoria', async () => {
    const evil = em('evil');
    await A.teacher.post('/api/teacher/roster/import').send({ csv: csv([{ nome: '=HYPERLINK("x")', email: evil, login: br(addDays(T, -20)), fim: br(addDays(T, 3)), sit: 'ativo' }]) }).expect(200);
    const res = await A.teacher.get('/api/teacher/roster/export.csv?plan=active&no_access_over=7&name=Sem acesso 7').expect(200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /sem-acesso-7-\d{4}-\d{2}-\d{2}\.csv/);
    const text = res.text;
    assert.ok(text.startsWith('﻿Nome;E-mail;Celular;Turma'));
    assert.ok(!/CPF/i.test(text.split('\r\n')[0]), 'sem CPF');
    const lines = text.trim().split('\r\n').slice(1);
    const d = (await A.teacher.get('/api/teacher/roster').expect(200)).body;
    const expected = d.students.filter((s) => s.plan === 'active' && (s.days_since_access == null || s.days_since_access > 7));
    assert.equal(lines.length, expected.length);
    assert.ok(lines.some((l) => l.startsWith(`"'=HYPERLINK(""x"")"`)), 'fórmula neutralizada');
    const venc = (await A.teacher.get('/api/teacher/roster/export.csv?expiring_within=7').expect(200)).text.trim().split('\r\n').slice(1);
    assert.ok(venc.every((l) => l.split(';')[4] === 'Ativo'));
    const audit = (await A.teacher.get('/api/teacher/audit').expect(200)).body.audit;
    assert.ok(audit.some((x) => x.action === 'roster.export' && x.payload.rows === lines.length));
    assert.ok(audit.some((x) => x.action === 'roster.import'));
  });
});

describe('permissões', () => {
  test('aluno não acessa; outro ambiente não vê; monitor não vê a base nem importa', async () => {
    await A.students[0].agent.get('/api/teacher/roster').expect(403);
    const bRoster = (await B.teacher.get('/api/teacher/roster').expect(200)).body;
    assert.ok(!bRoster.students.some((s) => s.email.endsWith('@base.test')));

    const mEmail = em('monitor');
    const m = (await A.teacher.post('/api/teacher/team').send({ name: 'Monitor Base', email: mEmail }).expect(201)).body;
    const mon = agent();
    await mon.post(`/api/auth/invite/${tokenFromUrl(m.invite.url)}`).send({ password: PASSWORD }).expect(201);
    await mon.get('/api/teacher/roster').expect(403);
    await mon.post('/api/teacher/roster/import').send({ csv: 'nome;email\nAna;ana@x.com' }).expect(403);
    await mon.patch(`/api/teacher/students/${A.students[0].studentId}`).send({ plan_status: 'ended' }).expect(403);
  });
});
