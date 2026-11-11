// Utilitários para testes de UNIDADE (sem rede, sem processo filho).
// Cada arquivo de teste roda em um processo separado no node:test,
// então definir DATA_DIR antes do require isola o banco SQLite.
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

function useTempDatabase() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "meu-dia-unit-"));
  process.env.DATA_DIR = dir;
  return {
    dir,
    cleanup() {
      try { require("../../src/config/database").db.close(); } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

// Simula http.IncomingMessage (somente o que os controllers usam).
function fakeRequest({ body, headers = {}, method = "POST" } = {}) {
  const payload = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const stream = Readable.from(payload ? [payload] : []);
  stream.headers = headers;
  stream.method = method;
  return stream;
}

// Simula http.ServerResponse capturando status, headers e corpo.
function fakeResponse() {
  const res = {
    status: null, headers: {}, rawBody: "", headersSent: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers = {}) {
      this.status = status;
      for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = v;
      this.headersSent = true;
      return this;
    },
    end(chunk = "") { this.rawBody += chunk; return this; },
    get json() { return this.rawBody ? JSON.parse(this.rawBody) : null; }
  };
  return res;
}

const futureIso = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();

module.exports = { useTempDatabase, fakeRequest, fakeResponse, futureIso };
