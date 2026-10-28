(() => {
  const STORAGE_KEY = "meu-dia-tarefas-v1";
  const AREAS = ["Trabalho", "Casa", "Comunidade", "Pessoal"];
  const periodFilter = document.getElementById("period-filter");
  const categoryFilter = document.getElementById("category-filter");
  const completedList = document.getElementById("completed-list");
  const historyNotice = document.getElementById("history-notice");

  const isValidTask = (task) =>
    task && typeof task.id === "string" &&
    typeof task.title === "string" && task.title.trim().length > 0 &&
    AREAS.includes(task.area) && typeof task.completed === "boolean" &&
    (task.scheduledAt === undefined || task.scheduledAt === null ||
      (typeof task.scheduledAt === "string" && Number.isFinite(Date.parse(task.scheduledAt)))) &&
    (task.completedAt === undefined || task.completedAt === null ||
      (typeof task.completedAt === "string" && Number.isFinite(Date.parse(task.completedAt))));

  function loadCompletedTasks() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return [];
      const tasks = JSON.parse(stored);
      if (!Array.isArray(tasks) || !tasks.every(isValidTask)) {
        throw new Error("Os dados salvos não correspondem ao formato esperado.");
      }
      return tasks.filter((task) => task.completed);
    } catch (error) {
      console.error("Não foi possível carregar o histórico de tarefas.", error);
      historyNotice.textContent = "Não foi possível carregar os dados salvos. Verifique o armazenamento do navegador.";
      historyNotice.hidden = false;
      return [];
    }
  }

  function getPeriodStart(period, now) {
    if (period === "all") return null;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - Number(period) + 1);
    return start;
  }

  function formatCompletionDate(value) {
    if (!value) return "Data e hora não registradas";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long",
      timeStyle: "short",
      hourCycle: "h23"
    }).format(new Date(value));
  }

  function getFilteredTasks(tasks, now) {
    const period = periodFilter.value;
    const category = categoryFilter.value;
    const start = getPeriodStart(period, now);
    return tasks.filter((task) => {
      if (category !== "Todas" && task.area !== category) return false;
      if (!start) return true;
      if (!task.completedAt) return false;
      return new Date(task.completedAt) >= start && new Date(task.completedAt) <= now;
    }).sort((a, b) => {
      if (!a.completedAt) return 1;
      if (!b.completedAt) return -1;
      return new Date(b.completedAt) - new Date(a.completedAt);
    });
  }

  function renderCategoryChart(tasks) {
    const chart = document.getElementById("category-chart");
    chart.replaceChildren();
    const counts = AREAS.map((area) => ({
      area,
      count: tasks.filter((task) => task.area === area).length
    }));
    const maxCount = Math.max(1, ...counts.map((item) => item.count));

    for (const item of counts) {
      const row = document.createElement("div");
      row.className = "category-row";
      const name = document.createElement("span");
      name.className = "category-name";
      name.textContent = item.area;
      const track = document.createElement("span");
      track.className = "category-track";
      const fill = document.createElement("span");
      fill.className = "category-fill";
      fill.dataset.category = item.area;
      fill.style.width = `${(item.count / maxCount) * 100}%`;
      track.append(fill);
      const value = document.createElement("span");
      value.className = "category-value";
      value.textContent = String(item.count);
      row.append(name, track, value);
      chart.append(row);
    }
  }

  function getTimelineBuckets(period, tasks, now) {
    const start = getPeriodStart(period, now);
    if (period === "7") {
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        date.setDate(date.getDate() - (6 - index));
        return { date, label: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date) };
      });
    }

    if (period === "30" || period === "90") {
      const weeks = period === "30" ? 5 : 13;
      const periodStart = getPeriodStart(period, now);
      const firstBucket = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth(),
        periodStart.getDate() - periodStart.getDay()
      );
      return Array.from({ length: weeks }, (_, index) => {
        const bucketStart = new Date(firstBucket);
        bucketStart.setDate(bucketStart.getDate() + index * 7);
        return { date: bucketStart, label: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(bucketStart) };
      });
    }

    const datedTasks = tasks.filter((task) => task.completedAt).map((task) => new Date(task.completedAt));
    if (datedTasks.length === 0) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return Array.from({ length: 6 }, (_, index) => {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth() - (5 - index), 1);
        return { date, label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date) };
      });
    }
    const earliest = new Date(Math.min(...datedTasks.map((date) => date.getTime())));
    const firstMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const visibleStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const chartStart = firstMonth > visibleStart ? firstMonth : visibleStart;
    const months = Math.max(1, (now.getFullYear() - chartStart.getFullYear()) * 12 + now.getMonth() - chartStart.getMonth() + 1);
    return Array.from({ length: months }, (_, index) => {
      const date = new Date(chartStart.getFullYear(), chartStart.getMonth() + index, 1);
      return { date, label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date) };
    });
  }

  function renderTimelineChart(tasks, period, now) {
    const chart = document.getElementById("timeline-chart");
    chart.replaceChildren();
    const buckets = getTimelineBuckets(period, tasks, now);
    const counts = buckets.map((bucket, index) => {
      const next = buckets[index + 1];
      return tasks.filter((task) => {
        if (!task.completedAt) return false;
        const date = new Date(task.completedAt);
        if (period === "7") {
          return date.getFullYear() === bucket.date.getFullYear() &&
            date.getMonth() === bucket.date.getMonth() &&
            date.getDate() === bucket.date.getDate();
        }
        if (period === "all") {
          return date.getFullYear() === bucket.date.getFullYear() && date.getMonth() === bucket.date.getMonth();
        }
        return date >= bucket.date && (!next || date < next.date);
      }).length;
    });
    const maxCount = Math.max(1, ...counts);

    buckets.forEach((bucket, index) => {
      const column = document.createElement("div");
      column.className = "timeline-column";
      const value = document.createElement("span");
      value.className = "timeline-value";
      value.textContent = String(counts[index]);
      const track = document.createElement("span");
      track.className = "timeline-track";
      const fill = document.createElement("span");
      fill.className = "timeline-fill";
      fill.style.height = `${counts[index] === 0 ? 0 : Math.max(8, (counts[index] / maxCount) * 100)}%`;
      track.append(fill);
      const label = document.createElement("span");
      label.className = "timeline-label";
      label.textContent = bucket.label.replace(".", "");
      column.setAttribute("aria-label", `${bucket.label}: ${counts[index]} ${counts[index] === 1 ? "tarefa concluída" : "tarefas concluídas"}`);
      column.append(value, track, label);
      chart.append(column);
    });
    document.getElementById("timeline-caption").textContent =
      period === "7" ? "Conclusões por dia" :
      period === "all" ? "Conclusões por mês (últimos 12 meses)" :
      "Conclusões por semana";
  }

  function renderCompletedList(tasks) {
    completedList.replaceChildren();
    for (const task of tasks) {
      const row = document.createElement("li");
      row.className = "completed-row";
      const icon = document.createElement("span");
      icon.className = "completed-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✓";
      const info = document.createElement("div");
      info.className = "completed-info";
      const title = document.createElement("span");
      title.className = "completed-title";
      title.textContent = task.title;
      const time = document.createElement("time");
      time.className = "completed-time";
      if (task.completedAt) time.dateTime = task.completedAt;
      const completionText = `Concluída em ${formatCompletionDate(task.completedAt)}`;
      const scheduleText = task.scheduledAt ? `Programada para ${formatCompletionDate(task.scheduledAt)} · ` : "";
      time.textContent = `${task.area} · ${scheduleText}${completionText}`;
      const area = document.createElement("span");
      area.className = "area-tag";
      area.dataset.area = task.area;
      area.textContent = task.area;
      info.append(title, time);
      row.append(icon, info, area);
      completedList.append(row);
    }
    const empty = tasks.length === 0;
    completedList.hidden = empty;
    document.getElementById("history-empty").hidden = !empty;
  }

  function render() {
    const now = new Date();
    const period = periodFilter.value;
    const tasks = getFilteredTasks(loadCompletedTasks(), now);
    const categories = new Set(tasks.map((task) => task.area));
    const labels = { "7": "Nos últimos 7 dias", "30": "Nos últimos 30 dias", "90": "Nos últimos 90 dias", all: "Em todo o período" };
    document.getElementById("completed-total").textContent = String(tasks.length);
    document.getElementById("period-caption").textContent = labels[period];
    document.getElementById("active-categories").textContent = `${categories.size} ${categories.size === 1 ? "categoria" : "categorias"}`;
    document.getElementById("filtered-count").textContent = String(tasks.length);
    renderCategoryChart(tasks);
    renderTimelineChart(tasks, period, now);
    renderCompletedList(tasks);
  }

  periodFilter.addEventListener("change", render);
  categoryFilter.addEventListener("change", render);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) render();
  });
  render();
})();
