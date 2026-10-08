/** V2.3 — Agenda: criação só pela professora, público (todos/turma/edital/aluno), isolamento, .ics. */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetRateLimits, setup, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { addDays, today } from '../src/lib/util.js';

const T = today();
let admin, A, B;
before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'ag-a', students: 2 });
  B = await createTenantWithClass(admin.agent, { slug: 'ag-b', students: 1 });
});
beforeEach(() => resetRateLimits());
const ev = (o = {}) => ({ kind: 'aula', title: 'Aula de Farmacologia', date: addDays(T, 3), start_time: '19:30', end_time: '21:00', link: 'https://meet.google.com/abc', ...o });
const titles = async (s) => (await s.agent.get('/api/me/agenda')).body.events.map((e) => e.title);

describe('agenda', () => {
  test('professora cria; aluno vê o evento para todos; validações', async () => {
    const ok = await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'Aula para todos' }));
    assert.equal(ok.status, 201);
    assert.ok((await titles(A.students[0])).includes('Aula para todos'));
    assert.equal((await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'ab' }))).status, 400);
    assert.equal((await A.teacher.post('/api/teacher/agenda').send(ev({ link: 'javascript:alert(1)' }))).status, 400);
    assert.equal((await A.teacher.post('/api/teacher/agenda').send(ev({ start_time: '25:00' }))).status, 400);
    assert.equal((await A.teacher.post('/api/teacher/agenda').send(ev({ end_time: '18:00' }))).status, 400);
  });

  test('horário de Brasília vira UTC (19:30 → 22:30Z)', async () => {
    await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'Fuso' }));
    const e = (await A.teacher.get('/api/teacher/agenda')).body.events.find((x) => x.title === 'Fuso');
    assert.match(e.starts_at, /T22:30:00/);
  });

  test('público: aluno específico, edital e turma', async () => {
    const [s1, s2] = A.students;
    await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'Só do aluno 1', audience: 'student', student_id: s1.studentId }));
    assert.ok((await titles(s1)).includes('Só do aluno 1'));
    assert.ok(!(await titles(s2)).includes('Só do aluno 1'));
    await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'Do edital', audience: 'edital', edital_id: A.edital.id }));
    assert.ok((await titles(s2)).includes('Do edital'));
    const solo = await createActiveStudent(A.teacher, { edital_ids: [] });
    assert.ok(!(await titles(solo)).includes('Do edital'));
    await A.teacher.post('/api/teacher/roster/import').send({ csv: `nome;email;turma\r\nTurma Aluno;turma-ag@x.test;ANVISA\r\n` });
    await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'Da turma ANVISA', audience: 'cohort', cohort: 'ANVISA' }));
    assert.ok(!(await titles(s1)).includes('Da turma ANVISA'));
  });

  test('aluno não cria; outro ambiente não vê; filtro por período; .ics', async () => {
    assert.equal((await A.students[0].agent.post('/api/teacher/agenda').send(ev())).status, 403);
    assert.ok(!(await titles(B.students[0])).includes('Aula para todos'));
    const far = (await A.students[0].agent.get(`/api/me/agenda?from=${addDays(T, 200)}&to=${addDays(T, 210)}`)).body.events;
    assert.equal(far.length, 0);
    const ics = await A.students[0].agent.get('/api/me/agenda.ics');
    assert.equal(ics.status, 200);
    assert.match(ics.text, /BEGIN:VCALENDAR/);
    assert.match(ics.text, /SUMMARY:Aula ao vivo: Aula para todos/);
    assert.match(ics.text, /DTSTART:\d{8}T223000Z/);
  });

  test('editar e excluir', async () => {
    const id = (await A.teacher.post('/api/teacher/agenda').send(ev({ title: 'Editável' }))).body.id;
    assert.equal((await A.teacher.put(`/api/teacher/agenda/${id}`).send(ev({ title: 'Editado', start_time: '08:00' }))).status, 200);
    assert.ok((await titles(A.students[0])).includes('Editado'));
    assert.equal((await A.teacher.delete(`/api/teacher/agenda/${id}`)).status, 200);
    assert.ok(!(await titles(A.students[0])).includes('Editado'));
  });
});
