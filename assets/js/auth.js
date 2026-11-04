(() => {
  const authScreen = document.getElementById("auth-screen");
  const appContent = document.getElementById("app-content");
  const authNotice = document.getElementById("auth-notice");
  const loginScreen = document.getElementById("login-screen");
  const registerScreen = document.getElementById("register-screen");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const logoutButton = document.getElementById("logout-button");
  const userLabel = document.getElementById("user-label");
  let currentUser = null;

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && currentUser) {
      currentUser = null;
      showAuth("Sua sessão expirou. Entre novamente.");
    }
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a solicitação.");
    return data;
  }

  window.apiFetch = apiFetch;

  function showAuth(message = "") {
    authScreen.hidden = false;
    appContent.hidden = true;
    userLabel.hidden = true;
    logoutButton.hidden = true;
    if (message) showAuthNotice(message, "error");
  }

  function showAuthNotice(message, kind = "") {
    authNotice.textContent = message;
    authNotice.dataset.kind = kind;
  }

  function showLogin() {
    loginScreen.hidden = false;
    registerScreen.hidden = true;
    showAuthNotice("");
    document.getElementById("login-email").focus();
  }

  function showRegister() {
    loginScreen.hidden = true;
    registerScreen.hidden = false;
    showAuthNotice("");
    document.getElementById("register-name").focus();
  }

  function enterApp(user, metadata = {}) {
    currentUser = user;
    authScreen.hidden = true;
    appContent.hidden = false;
    userLabel.textContent = user.name;
    userLabel.hidden = false;
    logoutButton.hidden = false;
    showAuthNotice("");
    window.dispatchEvent(new CustomEvent("auth:ready", { detail: { user, ...metadata } }));
  }

  document.getElementById("show-register").addEventListener("click", showRegister);
  document.getElementById("show-login").addEventListener("click", showLogin);

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("login-email").value,
          password: document.getElementById("login-password").value
        })
      });
      loginForm.reset();
      enterApp(result.user);
    } catch (error) {
      showAuthNotice(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = registerForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      let legacyTasks = [];
      let hasLegacyTasks = false;
      try {
        const storedTasks = localStorage.getItem("meu-dia-tarefas-v1");
        if (storedTasks !== null) {
          const parsedTasks = JSON.parse(storedTasks);
          if (!Array.isArray(parsedTasks)) throw new Error("Os dados antigos não estão no formato esperado.");
          legacyTasks = parsedTasks;
          hasLegacyTasks = true;
        }
      } catch (error) {
        console.error("Não foi possível preparar a importação das tarefas antigas.", error);
        throw new Error("Não foi possível ler as tarefas salvas neste navegador.");
      }
      const result = await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("register-name").value,
          email: document.getElementById("register-email").value,
          password: document.getElementById("register-password").value,
          legacyTasks
        })
      });
      const registeredEmail = document.getElementById("register-email").value.trim();
      registerForm.reset();
      document.getElementById("login-email").value = registeredEmail;
      if (hasLegacyTasks) {
        try {
          localStorage.removeItem("meu-dia-tarefas-v1");
        } catch (error) {
          console.error("A cópia antiga das tarefas não pôde ser removida.", error);
        }
      }
      loginScreen.hidden = false;
      registerScreen.hidden = true;
      const importedMessage = result.importedTasks
        ? ` ${result.importedTasks} ${result.importedTasks === 1 ? "tarefa antiga foi importada." : "tarefas antigas foram importadas."}`
        : "";
      showAuthNotice(`Cadastro concluído! Agora entre com seu e-mail e senha.${importedMessage}`, "success");
      document.getElementById("login-password").focus();
    } catch (error) {
      showAuthNotice(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await apiFetch("/api/logout", { method: "POST", body: JSON.stringify({}) });
      currentUser = null;
      showAuth();
      showLogin();
      showAuthNotice("Você saiu da sua conta.", "success");
    } catch (error) {
      showAuthNotice(error.message, "error");
    } finally {
      logoutButton.disabled = false;
    }
  });

  apiFetch("/api/me")
    .then(({ user }) => enterApp(user))
    .catch((error) => {
      showAuth();
      showLogin();
      if (!error.message.includes("Faça login")) showAuthNotice(error.message, "error");
    });
})();
