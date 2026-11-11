// Testes de PONTA A PONTA (E2E / UI): navegador real → front → API → SQLite.
// Cobrem a jornada da persona (Mariana) e os critérios de aceitação CA1–CA5.
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("../helpers/server");
const { launchBrowser, futureForm, MeuDia } = require("../helpers/e2e");

let srv, browser;
test.before(async () => { srv = await startServer(); browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); await srv?.stop(); });

let n = 0;
const novaConta = () => { n += 1; return { name: `Mariana ${n}`, email: `mariana${n}-${Date.now()}@example.com`, password: "senha-segura-123" }; };

// Cria contexto isolado (cookies/localStorage próprios) e devolve helpers.
async function sessao(opts = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const app = new MeuDia(page, srv.baseUrl);
  return { context, page, app };
}
// Cadastra via UI e entra.
async function cadastrarEEntrar(app, conta) {
  await app.open();
  await app.register(conta);
  await app.page.waitForSelector("#login-screen:not([hidden])");
  await app.login(conta);
  await app.page.waitForSelector("#app-content:not([hidden])");
}

test.describe("CA5 – Acesso (cadastro, login, logout)", () => {
  test("visitante anônimo vê a tela de login, não as tarefas", async () => {
    const { context, page, app } = await sessao();
    await app.open();
    await page.waitForSelector("#login-screen:not([hidden])");
    assert.equal(await page.locator("#app-content").isHidden(), true);
    assert.match(await page.locator("#login-title").textContent(), /Acesse sua conta/);
    await context.close();
  });

  test("login com senha errada mostra erro e permanece na tela de login", async () => {
    const { context, page, app } = await sessao();
    await app.open();
    await app.login({ email: "ninguem@example.com", password: "senha-errada" });
    await page.waitForFunction(() => document.getElementById("auth-notice").textContent.trim() !== "");
    assert.match(await page.locator("#auth-notice").textContent(), /incorretos/i);
    assert.equal(await page.locator("#app-content").isHidden(), true);
    await context.close();
  });

  test("cadastro → mensagem de sucesso → e-mail preenchido → login → app mostra o nome", async () => {
    const { context, page, app } = await sessao();
    const conta = novaConta();
    await app.open();
    await app.register(conta);
    await page.waitForSelector("#login-screen:not([hidden])");
    assert.match(await page.locator("#auth-notice").textContent(), /Cadastro concluído/);
    assert.equal(await page.inputValue("#login-email"), conta.email);
    await page.fill("#login-password", conta.password);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#app-content:not([hidden])");
    assert.equal(await page.locator("#user-label").textContent(), conta.name);
    assert.match(await page.locator("#page-title").textContent(), /Minhas tarefas/);
    await context.close();
  });

  test("cadastro com e-mail já usado mostra mensagem de erro", async () => {
    const { context, page, app } = await sessao();
    const conta = novaConta();
    await srv.request("/api/register", { method: "POST", body: conta });
    await app.open();
    await app.register(conta);
    await page.waitForFunction(() => /já possui cadastro/i.test(document.getElementById("auth-notice").textContent));
    await context.close();
  });

  test("sessão persiste após recarregar a página; 'Sair' encerra e bloqueia o app", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await page.reload();
    await page.waitForSelector("#app-content:not([hidden])");
    await page.click("#logout-button");
    await page.waitForSelector("#login-screen:not([hidden])");
    assert.match(await page.locator("#auth-notice").textContent(), /saiu da sua conta/i);
    await page.reload();
    await page.waitForSelector("#login-screen:not([hidden])");
    assert.equal(await page.locator("#app-content").isHidden(), true);
    await context.close();
  });
});

test.describe("CA1–CA4 – Tarefas", () => {
  test("estado vazio inicial convida a adicionar a primeira tarefa", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    assert.equal(await page.locator("#empty-state").isVisible(), true);
    assert.match(await page.locator("#empty-title").textContent(), /novinho em folha/i);
    assert.equal(await page.locator("#pending-count").textContent(), "0 tarefas");
    await context.close();
  });

  test("CA1/CA2: criar tarefa com título + área aparece na lista com contadores atualizados", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Enviar relatório mensal", "Trabalho");
    await app.row("Enviar relatório mensal").waitFor();
    assert.equal(await app.row("Enviar relatório mensal").locator(".area-tag").textContent(), "Trabalho");
    assert.equal(await page.locator("#pending-count").textContent(), "1 tarefa");
    assert.equal(await page.locator("#progress-count").textContent(), "0 de 1 concluídas");
    assert.equal(await page.locator("#visible-count").textContent(), "1");
    assert.match(await page.locator("#notice").textContent(), /salva no banco/i);
    assert.equal(await page.inputValue("#task-title"), "", "formulário deve ser limpo após adicionar");
    await context.close();
  });

  test("CA2: tarefas persistem após recarregar (vêm do banco, não do navegador)", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Pagar conta de luz", "Casa");
    await app.row("Pagar conta de luz").waitFor();
    await page.reload();
    await app.row("Pagar conta de luz").waitFor();
    await context.close();
  });

  test("CA3: concluir risca a tarefa, atualiza progresso e barra; reabrir desfaz", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Ligar para a escola", "Pessoal");
    const row = app.row("Ligar para a escola");
    await row.waitFor();
    await row.locator(".task-checkbox").check();
    await page.waitForFunction(() => document.getElementById("progress-count").textContent.startsWith("1 de 1"));
    assert.match(await row.getAttribute("class"), /is-complete/);
    assert.equal(await page.locator("#progress-track").getAttribute("aria-valuenow"), "1");
    assert.match(await page.locator("#progress-fill").getAttribute("style"), /width:\s*100%/);
    assert.equal(await page.locator("#pending-count").textContent(), "0 tarefas");
    await page.reload();
    assert.match(await app.row("Ligar para a escola").getAttribute("class"), /is-complete/);
    await app.row("Ligar para a escola").locator(".task-checkbox").uncheck();
    await page.waitForFunction(() => document.getElementById("progress-count").textContent.startsWith("0 de 1"));
    await context.close();
  });

  test("CA4: filtro por área mostra só a área escolhida, com estado vazio e contagem", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Reunião de equipe", "Trabalho"); await app.row("Reunião de equipe").waitFor();
    await app.addTask("Lavar louça", "Casa"); await app.row("Lavar louça").waitFor();
    await app.addTask("Mutirão da ONG", "Comunidade"); await app.row("Mutirão da ONG").waitFor();

    await page.click('[data-filter="Casa"]');
    assert.equal(await page.locator(".task-row").count(), 1);
    assert.equal(await page.locator('[data-filter="Casa"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-filter="Todas"]').getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#visible-count").textContent(), "1");

    await page.click('[data-filter="Pessoal"]');
    assert.equal(await page.locator("#empty-state").isVisible(), true);
    assert.match(await page.locator("#empty-title").textContent(), /Nenhuma tarefa de pessoal/i);

    await page.click('[data-filter="Todas"]');
    assert.equal(await page.locator(".task-row").count(), 3);
    await context.close();
  });

  test("excluir tarefa remove da lista e do banco", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Tarefa descartável", "Casa");
    await app.row("Tarefa descartável").waitFor();
    await app.row("Tarefa descartável").locator(".delete-button").click();
    await page.waitForFunction(() => document.getElementById("task-list").children.length === 0);
    assert.match(await page.locator("#notice").textContent(), /excluída/i);
    await page.reload();
    await page.waitForSelector("#empty-state:not([hidden])");
    await context.close();
  });

  test("tarefas de uma conta não aparecem em outra conta (isolamento na UI)", async () => {
    const a = await sessao(), b = await sessao();
    await cadastrarEEntrar(a.app, novaConta());
    await a.app.addTask("Segredo da A", "Pessoal");
    await a.app.row("Segredo da A").waitFor();
    await cadastrarEEntrar(b.app, novaConta());
    assert.equal(await b.page.locator(".task-row").count(), 0);
    await a.context.close(); await b.context.close();
  });

  test("título só com espaços não cria tarefa e avisa o usuário", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await page.fill("#task-title", "     ");
    await page.click("#task-form button[type=submit]");
    await page.waitForFunction(() => /Escreva o nome da tarefa/.test(document.getElementById("notice").textContent));
    assert.equal(await page.locator(".task-row").count(), 0);
    await context.close();
  });

  test("título vazio é bloqueado pela validação nativa (campo obrigatório)", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await page.click("#task-form button[type=submit]");
    assert.equal(await page.$eval("#task-title", (el) => el.validity.valueMissing), true);
    assert.equal(await page.locator(".task-row").count(), 0);
    await context.close();
  });

  test("segurança: HTML no título é exibido como texto e não executa script", async () => {
    const { context, page, app } = await sessao();
    let dialogo = false;
    page.on("dialog", async (d) => { dialogo = true; await d.dismiss(); });
    await cadastrarEEntrar(app, novaConta());
    const xss = '<img src=x onerror="alert(1)">';
    await app.addTask(xss, "Casa");
    await app.row("img src=x").waitFor();
    assert.equal(await page.locator(".task-title img").count(), 0);
    await page.waitForTimeout(300);
    assert.equal(dialogo, false);
    await context.close();
  });
});

test.describe("Agendamento (data e horário opcionais)", () => {
  test("tarefa agendada mostra 'Programada para…' e vem ordenada antes das sem data", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Sem data", "Casa"); await app.row("Sem data").waitFor();
    const longe = futureForm(5), perto = futureForm(1);
    await app.addTask("Agendada longe", "Trabalho", longe); await app.row("Agendada longe").waitFor();
    await app.addTask("Agendada perto", "Trabalho", perto); await app.row("Agendada perto").waitFor();
    const titulos = await page.locator(".task-row .task-title").allTextContents();
    assert.deepEqual(titulos, ["Agendada perto", "Agendada longe", "Sem data"]);
    assert.match(await app.row("Agendada perto").locator(".task-schedule").textContent(), /Programada para .*14:30/);
    await context.close();
  });

  // A validação usa a API nativa do navegador (setCustomValidity): o envio é
  // bloqueado antes do 'submit', então checamos a mensagem de validação do campo.
  const invalidos = [
    ["data inexistente (31/02)", { date: "31/02/2099", time: "10:00" }, "#task-schedule-date", /data válida/i],
    ["formato errado de data", { date: "2099-01-01", time: "10:00" }, "#task-schedule-date", /data válida/i],
    ["horário inválido (25:99)", { date: futureForm(2).date, time: "25:99" }, "#task-schedule-time", /horário válido/i],
    ["data sem horário", { date: futureForm(2).date, time: "" }, "#task-schedule-time", /horário/i],
    ["horário sem data", { date: "", time: "10:00" }, "#task-schedule-date", /data/i],
    ["data no passado", { date: "01/01/2020", time: "10:00" }, "#task-schedule-date", /futuros/i]
  ];
  for (const [nome, sched, campo, mensagem] of invalidos) {
    test(`rejeita ${nome}: campo fica inválido e a tarefa não é criada`, async () => {
      const { context, page, app } = await sessao();
      await cadastrarEEntrar(app, novaConta());
      await app.addTask("Não deve existir", "Casa", sched);
      await page.waitForTimeout(300);
      assert.match(await page.$eval(campo, (el) => el.validationMessage), mensagem);
      assert.equal(await page.locator(".task-row").count(), 0);
      assert.equal((await srv.queryDb("SELECT COUNT(*) AS n FROM tasks WHERE title = 'Não deve existir'"))[0].n, 0);
      await context.close();
    });
  }
});

test.describe("Página de detalhes (tarefas executadas)", () => {
  test("fluxo: concluir tarefas → 'Ver detalhes' → histórico, totais, filtro por categoria e voltar", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Feita no trabalho", "Trabalho"); await app.row("Feita no trabalho").waitFor();
    await app.addTask("Feita em casa", "Casa"); await app.row("Feita em casa").waitFor();
    await app.addTask("Ainda pendente", "Casa"); await app.row("Ainda pendente").waitFor();
    await app.row("Feita no trabalho").locator(".task-checkbox").check();
    await page.waitForFunction(() => document.getElementById("progress-count").textContent.startsWith("1 de 3"));
    await app.row("Feita em casa").locator(".task-checkbox").check();
    await page.waitForFunction(() => document.getElementById("progress-count").textContent.startsWith("2 de 3"));

    await page.click("a.details-button");
    await page.waitForURL(/pages\/details\.html$/);
    await page.waitForSelector("#app-content:not([hidden])");
    await page.waitForFunction(() => document.getElementById("completed-total").textContent === "2");
    assert.match(await page.locator("#page-title").textContent(), /Tarefas executadas/);
    const concluidas = await page.locator("#completed-list .completed-title").allTextContents();
    assert.deepEqual(concluidas.sort(), ["Feita em casa", "Feita no trabalho"]);
    assert.ok(!concluidas.includes("Ainda pendente"));
    assert.equal(await page.locator("#active-categories").textContent(), "2 categorias");
    assert.equal(await page.locator("#category-chart .category-row").count(), 4);

    await page.selectOption("#category-filter", "Casa");
    await page.waitForFunction(() => document.getElementById("completed-total").textContent === "1");
    assert.deepEqual(await page.locator("#completed-list .completed-title").allTextContents(), ["Feita em casa"]);

    await page.selectOption("#category-filter", "Pessoal");
    await page.waitForSelector("#history-empty:not([hidden])");

    await page.click("a.back-button");
    await page.waitForURL(/index\.html$|\/$/);
    await page.waitForSelector("#app-content:not([hidden])");
    await context.close();
  });

  test("filtro de período: 'Todo o período' inclui tudo; os 4 períodos existem", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Concluída hoje", "Pessoal"); await app.row("Concluída hoje").waitFor();
    await app.row("Concluída hoje").locator(".task-checkbox").check();
    await page.waitForFunction(() => document.getElementById("progress-count").textContent.startsWith("1 de 1"));
    await app.open("/pages/details.html");
    await page.waitForSelector("#app-content:not([hidden])");
    const opcoes = await page.locator("#period-filter option").evaluateAll((o) => o.map((x) => x.value));
    assert.deepEqual(opcoes, ["7", "30", "90", "all"]);
    for (const periodo of opcoes) {
      await page.selectOption("#period-filter", periodo);
      await page.waitForFunction(() => document.getElementById("completed-total").textContent === "1");
    }
    await context.close();
  });

  test("detalhes sem login mostra a tela de login (rota protegida)", async () => {
    const { context, page, app } = await sessao();
    await app.open("/pages/details.html");
    await page.waitForSelector("#login-screen:not([hidden])");
    assert.equal(await page.locator("#app-content").isHidden(), true);
    await context.close();
  });
});

test.describe("Migração do localStorage antigo no cadastro", () => {
  test("tarefas do navegador são importadas ao criar a conta e a cópia local é removida", async () => {
    const { context, page, app } = await sessao();
    await context.addInitScript(() => {
      if (!localStorage.getItem("__semeado")) {
        localStorage.setItem("meu-dia-tarefas-v1", JSON.stringify([
          { id: "1", title: "Tarefa do protótipo", area: "Comunidade", completed: false },
          { id: "2", title: "Outra antiga", area: "Casa", completed: true, completedAt: new Date().toISOString() }
        ]));
        localStorage.setItem("__semeado", "1");
      }
    });
    const conta = novaConta();
    await app.open();
    await app.register(conta);
    await page.waitForSelector("#login-screen:not([hidden])");
    assert.match(await page.locator("#auth-notice").textContent(), /2 tarefas antigas foram importadas/);
    assert.equal(await page.evaluate(() => localStorage.getItem("meu-dia-tarefas-v1")), null);
    await page.fill("#login-password", conta.password);
    await page.click("#login-form button[type=submit]");
    await app.row("Tarefa do protótipo").waitFor();
    await app.row("Outra antiga").waitFor();
    assert.equal(await page.locator("#progress-count").textContent(), "1 de 2 concluídas");
    await context.close();
  });

  test("localStorage corrompido bloqueia o cadastro com mensagem clara (sem perder dados)", async () => {
    const { context, page, app } = await sessao();
    await context.addInitScript(() => localStorage.setItem("meu-dia-tarefas-v1", "{corrompido"));
    await app.open();
    await app.register(novaConta());
    await page.waitForFunction(() => /Não foi possível ler as tarefas/.test(document.getElementById("auth-notice").textContent));
    assert.equal(await page.evaluate(() => localStorage.getItem("meu-dia-tarefas-v1")), "{corrompido");
    await context.close();
  });
});

test.describe("Mobile (persona usa o celular)", () => {
  test("em 375×667 o app não tem rolagem horizontal e o fluxo básico funciona", async () => {
    const { context, page, app } = await sessao({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await cadastrarEEntrar(app, novaConta());
    await app.addTask("Comprar pão", "Casa");
    await app.row("Comprar pão").waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `rolagem horizontal de ${overflow}px`);
    await app.row("Comprar pão").locator(".task-checkbox").check();
    await page.waitForFunction(() => document.getElementById("progress-count").textContent.startsWith("1 de 1"));
    await context.close();
  });
});

test.describe("Acessibilidade básica", () => {
  test("campos do formulário têm rótulos e a barra de progresso expõe role/aria", async () => {
    const { context, page, app } = await sessao();
    await cadastrarEEntrar(app, novaConta());
    assert.equal(await page.getByLabel("Tarefa", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("progressbar").count(), 1);
    assert.equal(await page.locator("html").getAttribute("lang"), "pt-BR");
    await app.addTask("Item acessível", "Casa");
    await app.row("Item acessível").waitFor();
    assert.match(await app.row("Item acessível").locator(".task-checkbox").getAttribute("aria-label"), /Concluir tarefa: Item acessível/);
    assert.match(await app.row("Item acessível").locator(".delete-button").getAttribute("aria-label"), /Excluir tarefa: Item acessível/);
    await context.close();
  });
});
