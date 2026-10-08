import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeInsights } from '../src/domain/guidance.js';

const mk = (kind) => ({ kind, text: kind, tone: 'neutral' });

test('insights sobre distribuição entre matérias: fica só o mais específico', () => {
  const out = dedupeInsights([mk('hours'), mk('focus'), mk('attention'), mk('pending'), mk('balance'), mk('exam')]);
  assert.deepEqual(out.map((i) => i.kind), ['hours', 'balance', 'exam']);
});

test('sem concentração, vale "matérias sem horas" e some o resto do grupo', () => {
  const out = dedupeInsights([mk('focus'), mk('attention'), mk('pending')]);
  assert.deepEqual(out.map((i) => i.kind), ['attention']);
});

test('insights fora do grupo nunca são removidos', () => {
  const out = dedupeInsights([mk('hours'), mk('trend'), mk('reviews'), mk('consolidated'), mk('streak'), mk('routine'), mk('exam')]);
  assert.equal(out.length, 7);
});

test('lista vazia continua vazia', () => {
  assert.deepEqual(dedupeInsights([]), []);
});
