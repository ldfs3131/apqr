/**
 * Página de vendas estática /consultoria: servida fora do app React, com política de segurança própria,
 * sem alterar nada do app (login, rotas e cabeçalhos do APQR continuam iguais).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup } from './helpers.js';

let app;
before(async () => { app = await setup(); });

describe('página /consultoria', () => {
  test('sem a barra final, redireciona para /consultoria/ mantendo os parâmetros (UTM)', async () => {
    const r = await request(app).get('/consultoria').expect(301);
    assert.equal(r.headers.location, '/consultoria/');
    const u = await request(app).get('/consultoria?utm_source=instagram&utm_medium=bio').expect(301);
    assert.equal(u.headers.location, '/consultoria/?utm_source=instagram&utm_medium=bio');
  });

  test('entrega a página com a política de segurança da página de vendas', async () => {
    const r = await request(app).get('/consultoria/').expect(200);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.text, /Consultoria Individual Pollyana Lyra/);
    const csp = r.headers['content-security-policy'];
    assert.match(csp, /fonts\.googleapis\.com/);
    assert.match(csp, /script-src 'self' 'unsafe-inline'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(r.headers['x-frame-options'], 'DENY');
  });

  test('serve as imagens e responde 404 para imagem inexistente', async () => {
    const r = await request(app).get('/consultoria/img/hero.webp').expect(200);
    assert.match(r.headers['content-type'], /image\/webp/);
    await request(app).get('/consultoria/img/nao-existe.webp').expect(404);
  });

  test('o app do APQR continua com a política original', async () => {
    const r = await request(app).get('/login').expect(200);
    assert.doesNotMatch(r.text, /Consultoria Individual Pollyana Lyra/);
    const csp = r.headers['content-security-policy'];
    assert.match(csp, /script-src 'self';/);
    assert.doesNotMatch(csp, /fonts\.googleapis\.com/);
  });

  test('a API não é afetada', async () => {
    await request(app).get('/api/health/live').expect(200);
  });
});
