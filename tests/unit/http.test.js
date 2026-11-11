const test = require("node:test");
const assert = require("node:assert/strict");
const { respond, parseCookies, readBody } = require("../../src/utils/http");
const { fakeRequest, fakeResponse } = require("../helpers/unit");

test("respond: grava status, JSON e cabeçalhos de segurança", () => {
  const res = fakeResponse();
  respond(res, 201, { ok: true });
  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { ok: true });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.match(res.headers["content-type"], /^application\/json/);
});

test("respond: cabeçalhos extras sobrescrevem os padrões", () => {
  const res = fakeResponse();
  respond(res, 200, {}, { "Cache-Control": "max-age=10" });
  assert.equal(res.headers["cache-control"], "max-age=10");
});

test("parseCookies: lê vários cookies e decodifica URL-encoding", () => {
  const cookies = parseCookies({ headers: { cookie: "a=1; session=abc%20def; b=x=y" } });
  assert.deepEqual(cookies, { a: "1", session: "abc def", b: "x=y" });
});

test("parseCookies: sem cabeçalho retorna objeto vazio", () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

test("parseCookies: ignora partes malformadas e encoding inválido", () => {
  const cookies = parseCookies({ headers: { cookie: "semigual; ruim=%E0%A4%A; ok=1" } });
  assert.deepEqual(cookies, { ok: "1" });
});

test("readBody: faz parse de objeto JSON válido", async () => {
  assert.deepEqual(await readBody(fakeRequest({ body: { a: 1 } })), { a: 1 });
});

test("readBody: corpo vazio vira {}", async () => {
  assert.deepEqual(await readBody(fakeRequest()), {});
});

for (const [nome, corpo] of [["JSON inválido", "{nao-json"], ["array", "[1,2]"], ["null", "null"], ["número", "42"]]) {
  test(`readBody: rejeita ${nome} com status 400`, async () => {
    await assert.rejects(readBody(fakeRequest({ body: corpo })), (e) => e.status === 400);
  });
}

test("readBody: corpo acima de 16 KB é rejeitado com 413", async () => {
  const grande = JSON.stringify({ texto: "x".repeat(20_000) });
  await assert.rejects(readBody(fakeRequest({ body: grande })), (e) => e.status === 413);
});

test("readBody: corpo no limite (≤ 16 KB) é aceito", async () => {
  const ok = JSON.stringify({ texto: "x".repeat(16_000) });
  assert.equal((await readBody(fakeRequest({ body: ok }))).texto.length, 16_000);
});
