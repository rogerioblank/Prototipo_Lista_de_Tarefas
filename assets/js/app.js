(() => {
      const STORAGE_KEY = "meu-dia-tarefas-v1";
      const AREAS = ["Trabalho", "Casa", "Comunidade", "Pessoal"];
      const form = document.getElementById("task-form");
      const titleInput = document.getElementById("task-title");
      const areaInput = document.getElementById("task-area");
      const taskList = document.getElementById("task-list");
      const emptyState = document.getElementById("empty-state");
      const notice = document.getElementById("notice");
      const filterButtons = [...document.querySelectorAll(".filter-button")];
      let activeFilter = "Todas";
      let tasks = [];

      const isValidTask = (task) =>
        task && typeof task.id === "string" &&
        typeof task.title === "string" && task.title.trim().length > 0 &&
        AREAS.includes(task.area) && typeof task.completed === "boolean" &&
        (task.completedAt === undefined || task.completedAt === null ||
          (typeof task.completedAt === "string" && Number.isFinite(Date.parse(task.completedAt))));

      function showNotice(message, kind = "") {
        notice.textContent = message;
        notice.dataset.kind = kind;
      }

      function saveTasks() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
          showNotice("Alterações salvas neste dispositivo.", "success");
        } catch (error) {
          console.error("Não foi possível salvar as tarefas no navegador.", error);
          showNotice("Não foi possível salvar. Verifique o espaço disponível e as permissões do navegador.", "error");
        }
      }

      function loadTasks() {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored === null) return;
          const parsed = JSON.parse(stored);
          if (!Array.isArray(parsed) || !parsed.every(isValidTask)) {
            throw new Error("Os dados salvos não correspondem ao formato esperado.");
          }
          tasks = parsed;
        } catch (error) {
          console.error("Não foi possível carregar as tarefas salvas.", error);
          showNotice("Não foi possível carregar os dados salvos. As tarefas atuais não foram recuperadas.", "error");
        }
      }

      function render() {
        const completedTasks = tasks.filter((task) => task.completed);
        const completed = completedTasks.length;
        const pending = tasks.length - completed;
        const percentage = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
        document.getElementById("pending-count").textContent = `${pending} ${pending === 1 ? "tarefa" : "tarefas"}`;
        document.getElementById("progress-count").textContent = `${completed} de ${tasks.length} concluídas`;
        document.getElementById("progress-fill").style.width = `${percentage}%`;
        const progressTrack = document.getElementById("progress-track");
        progressTrack.setAttribute("aria-valuemax", String(tasks.length));
        progressTrack.setAttribute("aria-valuenow", String(completed));
        document.getElementById("visible-count").textContent = String(
          tasks.filter((task) => activeFilter === "Todas" || task.area === activeFilter).length
        );

        taskList.replaceChildren();
        const visibleTasks = tasks.filter((task) => activeFilter === "Todas" || task.area === activeFilter);
        for (const task of visibleTasks) {
          const row = document.createElement("li");
          row.className = `task-row${task.completed ? " is-complete" : ""}`;

          const checkbox = document.createElement("input");
          checkbox.className = "task-checkbox";
          checkbox.type = "checkbox";
          checkbox.checked = task.completed;
          checkbox.setAttribute("aria-label", `${task.completed ? "Reabrir" : "Concluir"} tarefa: ${task.title}`);
          checkbox.addEventListener("change", () => {
            task.completed = checkbox.checked;
            task.completedAt = task.completed ? new Date().toISOString() : null;
            saveTasks();
            render();
          });

          const title = document.createElement("span");
          title.className = "task-title";
          title.textContent = task.title;

          const area = document.createElement("span");
          area.className = "area-tag";
          area.dataset.area = task.area;
          area.textContent = task.area;

          const remove = document.createElement("button");
          remove.className = "delete-button";
          remove.type = "button";
          remove.setAttribute("aria-label", `Excluir tarefa: ${task.title}`);
          remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
          remove.addEventListener("click", () => {
            tasks = tasks.filter((item) => item.id !== task.id);
            saveTasks();
            render();
          });

          row.append(checkbox, title, area, remove);
          taskList.append(row);
        }

        const isEmpty = visibleTasks.length === 0;
        emptyState.hidden = !isEmpty;
        taskList.hidden = isEmpty;
        if (isEmpty && activeFilter !== "Todas") {
          document.getElementById("empty-title").textContent = `Nenhuma tarefa de ${activeFilter.toLowerCase()}`;
          document.getElementById("empty-description").textContent = "Tente outro filtro ou adicione uma tarefa nesta área.";
        } else if (isEmpty && tasks.length > 0) {
          document.getElementById("empty-title").textContent = "Tudo concluído por aqui!";
          document.getElementById("empty-description").textContent = "Você já marcou todas as tarefas desta lista. Aproveite essa sensação.";
        } else {
          document.getElementById("empty-title").textContent = "Um dia novinho em folha";
          document.getElementById("empty-description").textContent = "Adicione sua primeira tarefa e deixe o dia mais leve. Você consegue!";
        }
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
          showNotice("Escreva o nome da tarefa antes de adicionar.", "error");
          titleInput.focus();
          return;
        }
        tasks.unshift({
          id: window.crypto && typeof window.crypto.randomUUID === "function"
            ? window.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title,
          area: areaInput.value,
          completed: false
        });
        saveTasks();
        render();
        form.reset();
        titleInput.focus();
      });

      document.getElementById("filters").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-filter]");
        if (!button) return;
        activeFilter = button.dataset.filter;
        for (const filterButton of filterButtons) {
          filterButton.setAttribute("aria-pressed", String(filterButton === button));
        }
        render();
      });

      const today = new Date();
      const dateElement = document.getElementById("today-date");
      dateElement.dateTime = today.toISOString().slice(0, 10);
      dateElement.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "short", day: "numeric", month: "long", year: "numeric"
      }).format(today).replace(".", "");

      loadTasks();
      render();
    })();
