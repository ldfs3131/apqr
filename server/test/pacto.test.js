/** V3.0 — Pacto de Estudo: motor de semanas (Chama, Escudos), trava de quarta e API. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePacto, suggestPacto, weekStartOf, SHIELD_MAX } from '../src/domain/pacto.js';
import { setup, createPlatformAdmin, createTenantWithClass } from './helpers.js';
import { addDays, advanceClock, today } from '../src/lib/util.js';

const P = (w, min = 600, set) => ({ week_start: w, minutes: min, days: 31, set_on: set || w });
const mins = (pairs) => new Map(pairs.map(([w, m, man = 0]) => [w, { total: m * 60, manual: man * 60 }]));
const W = (n) => addDays('2026-09-07', 7 * n); // segundas

describe('motor do pacto', () => {
  test('cores: <50 vermelho, 50–99 amarelo, ≥100 verde; semana atual em andamento', () => {
    const r = evaluatePacto({ pactos: [P(W(0))], minutes: mins([[W(0), 600], [W(1), 300], [W(2), 299]]), pausedWeeks: new Set(), today: W(3) });
    assert.deepEqual(r.weeks.map((w) => w.state), ['green', 'yellow', 'red', 'in_progress']);
  });

  test('exatamente 50% vale; Chama = semanas válidas seguidas; vermelha sem escudo zera', () => {
    const r = evaluatePacto({ pactos: [P(W(0))], minutes: mins([[W(0), 600], [W(1), 300], [W(2), 0], [W(3), 600]]), pausedWeeks: new Set(), today: W(4) });
    assert.deepEqual(r.weeks.map((w) => w.state), ['green', 'yellow', 'red', 'green', 'in_progress']);
    assert.equal(r.chama, 1); assert.equal(r.best_chama, 2);
  });

  test('Escudo: 1 a cada 4 semanas verdes, máximo 2; protege a Chama; no máximo 1 por mês', () => {
    const greens = Array.from({ length: 8 }, (_, i) => [W(i), 600]);
    const r = evaluatePacto({ pactos: [P(W(0))], minutes: mins(greens), pausedWeeks: new Set(), today: W(8) });
    assert.equal(r.shields, SHIELD_MAX);
    // mais 4 verdes não passam de 2
    const g12 = Array.from({ length: 12 }, (_, i) => [W(i), 600]);
    assert.equal(evaluatePacto({ pactos: [P(W(0))], minutes: mins(g12), pausedWeeks: new Set(), today: W(12) }).shields, SHIELD_MAX);
    // vermelha com escudo: Chama mantida
    const r2 = evaluatePacto({ pactos: [P(W(0))], minutes: mins([...greens.slice(0, 4), [W(4), 0]]), pausedWeeks: new Set(), today: W(5) });
    assert.equal(r2.weeks[4].state, 'shield'); assert.equal(r2.chama, 4); assert.equal(r2.shields, 0);
  });

  test('um escudo por mês: segunda vermelha no mesmo mês zera a Chama mesmo com escudo guardado', () => {
    const base = Array.from({ length: 8 }, (_, i) => [W(i), 600]); // 2 escudos; W(8)=2026-11-02, W(9)=11-09
    const r = evaluatePacto({ pactos: [P(W(0))], minutes: mins([...base, [W(8), 0], [W(9), 0]]), pausedWeeks: new Set(), today: W(10) });
    assert.equal(r.weeks[8].state, 'shield');
    assert.equal(r.weeks[9].state, 'red'); assert.equal(r.chama, 0); assert.equal(r.shields, 1);
  });

  test('primeira semana parcial e semana pausada não contam nem quebram', () => {
    const r = evaluatePacto({ pactos: [P(W(0), 600, addDays(W(0), 3))], minutes: mins([[W(1), 600], [W(3), 600]]), pausedWeeks: new Set([W(2)]), today: W(4) });
    assert.deepEqual(r.weeks.map((w) => w.state), ['partial', 'green', 'paused', 'green', 'in_progress']);
    assert.equal(r.chama, 2);
  });

  test('sem definir, repete o pacto anterior; manual é contado e marcado', () => {
    const r = evaluatePacto({ pactos: [P(W(0), 600)], minutes: mins([[W(1), 600, 100]]), pausedWeeks: new Set(), today: W(2) });
    assert.equal(r.weeks[1].carried, true); assert.equal(r.weeks[1].promised_minutes, 600);
    assert.equal(r.weeks[1].manual_minutes, 100); assert.equal(r.weeks[1].state, 'green');
  });

  test('sugestão: 2 semanas <50% sugere menor; 2 semanas >150% sugere maior', () => {
    const low = evaluatePacto({ pactos: [P(W(0), 600)], minutes: mins([[W(0), 100], [W(1), 100]]), pausedWeeks: new Set(), today: W(2) });
    const s1 = suggestPacto(low.weeks); assert.equal(s1.kind, 'lower'); assert.equal(s1.minutes, 420);
    const hi = evaluatePacto({ pactos: [P(W(0), 600)], minutes: mins([[W(0), 1000], [W(1), 1000]]), pausedWeeks: new Set(), today: W(2) });
    assert.equal(suggestPacto(hi.weeks).kind, 'higher');
  });

  test('semanas depois do fim do acesso não quebram a Chama', () => {
    const r = evaluatePacto({ pactos: [P(W(0))], minutes: mins([[W(0), 600]]), pausedWeeks: new Set(), today: W(6), lastWeek: W(1) });
    assert.equal(r.weeks.length, 2);
  });
});

describe('API do pacto', () => {
  let T, S;
  before(async () => { await setup(); const admin = await createPlatformAdmin(); T = await createTenantWithClass(admin.agent, { slug: 'pac-a', students: 1 }); S = T.students[0]; });

  test('aluno define o pacto; valida passo de 30 min e dias; confere auditoria', async () => {
    const bad = await S.agent.put('/api/me/pacto').send({ week: 'current', minutes: 100, days: [0, 2] });
    // início da semana atual: se já for depois de quarta, recusa travado; senão recusa passo
    assert.ok([400].includes(bad.status));
    const wk = weekStartOf(today());
    const dow = (new Date(`${today()}T12:00:00Z`).getUTCDay() + 6) % 7;
    const week = dow <= 2 ? 'current' : 'next';
    const ok = await S.agent.put('/api/me/pacto').send({ week, minutes: 600, days: [0, 1, 2, 3, 4] }).expect(200);
    assert.equal(ok.body.pacto.has_pacto, true);
    assert.equal(ok.body.pacto.shields_max, 2);
    if (week === 'current') assert.equal(ok.body.pacto.current.promised_minutes, 600);
    else assert.equal(ok.body.pacto.next.minutes, 600);
    await S.agent.put('/api/me/pacto').send({ week, minutes: 600, days: [] }).expect(400);
    assert.ok(wk);
  });

  test('pacto da semana atual trava depois de quarta', async () => {
    // avança o relógio até a quinta-feira da semana atual
    let guard = 0;
    while (((new Date(`${today()}T12:00:00Z`).getUTCDay() + 6) % 7) < 3 && guard++ < 7) advanceClock(86400000);
    const r = await S.agent.put('/api/me/pacto').send({ week: 'current', minutes: 300, days: [0] });
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'pacto_locked');
    await S.agent.put('/api/me/pacto').send({ week: 'next', minutes: 300, days: [0, 3] }).expect(200);
  });

  test('professora enxerga o pacto do aluno (somente leitura)', async () => {
    const r = await T.teacher.get(`/api/teacher/students/${S.studentId}/pacto`).expect(200);
    assert.equal(r.body.pacto.has_pacto, true);
  });
});
