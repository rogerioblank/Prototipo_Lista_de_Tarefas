# Pirâmide de testes — Meu Dia (lista de tarefas)

```
            ▲  E2E / UI            29 testes   navegador real (Playwright + Chromium)
           ╱ ╲
          ╱   ╲  Integração / API   57 testes   HTTP real → rotas → controllers → SQLite
         ╱     ╲
        ╱───────╲ Unidade          100 testes   funções, models e controllers isolados
```

Mais rápidos e numerosos na base; mais lentos e focados em jornadas no topo.
Todos usam **somente** o `node:test` nativo (Node ≥ 22.5) — a única dependência
extra é o `playwright`, usado só no E2E. Cada execução cria um banco SQLite
temporário (`DATA_DIR`), então **nunca toca em `data/meu-dia.sqlite`**.

## Como rodar

```bash
npm install                      # instala o playwright (devDependency)
npx playwright install chromium  # baixa o navegador (só para o E2E)

npm run test:unit          # camada 1 — base da pirâmide
npm run test:integration   # camada 2
npm run test:e2e           # camada 3 — topo
npm test                   # unit + integração + teste legado (sem navegador)
npm run test:all           # as três camadas
```

Se já houver um Chromium na máquina, aponte para ele com
`PW_CHROMIUM_PATH=/caminho/do/chrome npm run test:e2e`.

## O que cada camada cobre

### 1. Unidade — `tests/unit/` (sem rede, sem processo filho)
| Arquivo | Alvo | Exemplos |
|---|---|---|
| `http.test.js` | `src/utils/http.js` | `respond`, `parseCookies` (malformado/encoding), `readBody` (JSON inválido, array, limite 16 KB → 413) |
| `models.test.js` | `src/models/*` | CRUD, ordenação, isolamento por usuário, sessão expirada, `ROLLBACK` no cadastro duplicado, `ON DELETE CASCADE` |
| `authController.test.js` | `authController` | validação de cadastro (18 casos), hash scrypt + salt, normalização de e-mail, cookie `HttpOnly/SameSite/Secure`, token só como hash, login sem enumeração de contas, logout idempotente |
| `taskController.test.js` | `taskController` | validação de título/área/data, trim, limite de 120, agendamento futuro, `completed` booleano, tarefa de outro usuário → 404, trilha de interações |
| `staticController.test.js` | `staticController` | MIME, HEAD, lista de arquivos públicos, 404/400, **path traversal** |

### 2. Integração / API — `tests/integration/`
Sobe o `server.js` real em porta livre e fala HTTP de verdade.
- `api.test.js`: proteções gerais (401, 404, 415, 413, 400, Origin/CSRF), cadastro, sessão, CRUD de tarefas, as 4 áreas, agendamento, **isolamento entre usuários**, senha/token nunca em texto puro, trilha de auditoria em `interactions`, **persistência após reiniciar o servidor**.
- `static.test.js`: páginas/assets servidos, referências `<script>/<link>` sem 404, `405` em POST, bloqueio de `server.js`, `src/`, `data/*.sqlite*`, `Readme.md`, etc.

### 3. E2E / UI — `tests/e2e/jornada.test.js` (Playwright)
Cobre a persona e os critérios de aceitação do Readme:
- **CA5** cadastro → login → nome no topo; senha errada; e-mail duplicado; sessão após reload; logout.
- **CA1/CA2** criar e listar (contadores, formulário limpo, persistência após reload).
- **CA3** concluir/reabrir (riscado, barra de progresso, `aria-valuenow`).
- **CA4** filtro por área (`aria-pressed`, estado vazio, contagem).
- Agendamento: ordenação, "Programada para…", 6 entradas inválidas bloqueadas.
- Página de detalhes: histórico, totais, gráfico, filtros de período/categoria, voltar, rota protegida.
- Migração do `localStorage` antigo no cadastro (e `localStorage` corrompido).
- XSS (título com `<img onerror>`), mobile 375×667 sem rolagem horizontal, rótulos/ARIA.

## ⚠️ Resultado atual: 8 testes falham de propósito (bug real encontrado)

Todos os testes `SEGURANÇA: … path traversal …` (4 em unidade + 4 em integração)
**falham** porque o projeto tem uma vulnerabilidade de *path traversal* em
`src/views/staticController.js`:

```
GET /assets/..%2fserver.js                      → 200 (devolve o código-fonte do servidor)
GET /assets/..%2fsrc/config/database.js         → 200
GET /pages/..%2fsrc/controllers/authController.js → 200
```

O `%2f` não é normalizado pelo parser de URL, mas o controller o decodifica
(`decodeURIComponent`) *depois* de checar o prefixo `/assets/` ou `/pages/`; o
caminho então resolve para fora da pasta pública, ainda dentro de `ROOT`
(passa na checagem `startsWith(ROOT)`). Arquivos `.js/.html/.css/.svg` de
qualquer pasta ficam expostos (a lista `PUBLIC_FILES`/prefixos não vale mais).

**Correção sugerida:** depois de resolver `filePath`, exigir que ele esteja
dentro de uma das pastas públicas (`ROOT/assets`, `ROOT/pages`) ou seja
exatamente `ROOT/index.html`, em vez de apenas dentro de `ROOT`.
Quando corrigido, os 8 testes passam sem alteração.

## Observações adicionais (não são falhas)
- Mensagem de erro de agendamento: o formulário usa `setCustomValidity`, então o
  navegador bloqueia o envio **antes** do `submit`; o `showNotice(...)` de
  "Escolha uma data e horário futuros" em `app.js` nunca chega a executar. Os
  testes verificam a mensagem nativa (`validationMessage`).
- `legacyTasks` com mais de 1000 itens (limite do `authController`) é inalcançável:
  o limite de 16 KB do corpo (413) dispara antes. Há teste cobrindo esse efeito.
- O servidor não aplica sanitização de HTML no título; o escape é feito no front
  (`textContent`). O E2E garante que não há XSS.
- `npm test` antigo (`node --test`) passaria a executar também os testes E2E;
  por isso o script `test` foi redefinido (veja `package.json`).
