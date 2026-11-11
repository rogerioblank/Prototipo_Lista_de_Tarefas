// Utilitários de E2E: abre o Chromium (Playwright) contra o servidor real.
// Navegador: usa PW_CHROMIUM_PATH se definido; senão o Chromium instalado por
// `npx playwright install chromium`.
const { chromium } = require("playwright");

async function launchBrowser() {
  const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
  return chromium.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
}

const pad = (n) => String(n).padStart(2, "0");
// Data/hora futura no formato aceito pelo formulário (dd/mm/aaaa e HH:mm).
function futureForm(daysAhead = 2, hour = 14, minute = 30) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return { date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${pad(hour)}:${pad(minute)}` };
}

// Page Object mínimo para reutilizar nos testes.
class MeuDia {
  constructor(page, baseUrl) { this.page = page; this.baseUrl = baseUrl; }
  open(p = "/") { return this.page.goto(`${this.baseUrl}${p}`); }
  async register({ name, email, password }) {
    await this.page.click("#show-register");
    await this.page.fill("#register-name", name);
    await this.page.fill("#register-email", email);
    await this.page.fill("#register-password", password);
    await this.page.click("#register-form button[type=submit]");
  }
  async login({ email, password }) {
    await this.page.fill("#login-email", email);
    await this.page.fill("#login-password", password);
    await this.page.click("#login-form button[type=submit]");
  }
  async addTask(title, area, { date, time } = {}) {
    await this.page.fill("#task-title", title);
    await this.page.selectOption("#task-area", area);
    if (date) await this.page.fill("#task-schedule-date", date);
    if (time) await this.page.fill("#task-schedule-time", time);
    await this.page.click("#task-form button[type=submit]");
  }
  row(title) { return this.page.locator(".task-row", { hasText: title }); }
}

module.exports = { launchBrowser, futureForm, MeuDia };
