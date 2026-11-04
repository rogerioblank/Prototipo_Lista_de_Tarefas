# 📋 Controle de Tarefas Diárias — Documento de Planejamento

> Documento consolidado: Persona, História do Usuário, Escopo, Priorização MoSCoW e Próximos Passos.

---

## 📑 Sumário

1. [Persona](#persona)
2. [História do Usuário](#historia)
3. [Escopo](#escopo)
4. [Priorização MoSCoW](#moscow)
5. [Resumo Visual](#resumo)
6. [Próximos Passos](#proximos)

---

<a id="persona"></a>
## 1. 👤 Persona

**Nome:** Mariana Souza
**Idade:** 34 anos
**Ocupação:** Analista administrativa (CLT) + voluntária em ONG do bairro
**Perfil:** Casada, 2 filhos, mora em apartamento. Usa celular como principal dispositivo.

### Comportamento
- Começa o dia no automático, esquece tarefas pequenas.
- Sente sobrecarga mental ao tentar lembrar de tudo.

### Dores
- *"Não sei o que preciso fazer hoje"* (paralisia inicial).
- Tarefas de áreas diferentes (trabalho, casa, comunidade) misturadas mentalmente.
- Esquece compromissos recorrentes.
- Falta de senso de progresso ao final do dia.

### Objetivos
- Ter uma visão clara e única do dia.
- Separar contextos (trabalho / casa / comunidade / pessoal).
- Sentir-se realizado ao marcar tarefas como concluídas.

### Frase
> *"Quero abrir um lugar e saber exatamente o que fazer hoje, sem precisar pensar muito."*

### Necessidade única
> Abrir, ver o que fazer hoje, marcar como feito, seguir o dia.

---

<a id="historia"></a>
## 2. 📖 História do Usuário

> **Como** Mariana (pessoa com múltiplos contextos de vida),
> **Quero** anotar minhas tarefas do dia e vê-las numa lista simples, separadas por área,
> **Para que** eu saiba o que fazer hoje sem precisar pensar muito.

### Critérios de Aceitação (mínimos)

- ✅ **CA1 – Criar tarefa:** adicionar uma tarefa informando título + área.
- ✅ **CA2 – Listar:** ver a lista única do dia.
- ✅ **CA3 – Concluir:** marcar tarefa como feita (some da lista ativa ou fica riscada).
- ✅ **CA4 – Filtrar:** filtrar por área (Trabalho / Casa / Comunidade / Pessoal).
- ✅ **CA5 – Acessar:** entrar com e-mail e senha ou criar uma conta para salvar os dados no banco.

> Sem prioridade ou recorrência na V1. O agendamento de data e horário é opcional.

---

<a id="escopo"></a>
## 3. 🎯 Escopo

### ✅ Dentro do escopo

| O que | Como |
|---|---|
| **Criar tarefa** | Título + área (4 fixas) |
| **Agendar** | Data e horário opcionais, no formato `dd/mm/aaaa` e `HH:mm` |
| **Listar** | Lista única, incluindo tarefas agendadas |
| **Concluir** | Marcar como feita (riscada ou some) |
| **Filtrar** | Por área (opcional, um clique) |
| **Acessar** | Login e cadastro com senha protegida |
| **Persistir** | Salvar contas, tarefas e interações em banco SQLite |

### 🚫 Fora do escopo (nem pensar agora)

- Prioridade, recorrência
- Notificações, sincronização em nuvem
- Subtarefas, anexos
- Gamificação
- App nativo

### 📌 Regras simples

- **4 áreas fixas:** Trabalho, Casa, Comunidade, Pessoal.
- **Tarefa concluída** = riscada (ou escondida — você decide).
- **Agendamento:** opcional; tarefas com data e horário aparecem na lista ordenadas pelo horário programado.
- **Login obrigatório:** cada pessoa acessa somente as próprias tarefas.
- **Banco de dados:** usuários, tarefas, sessões e ações são registrados no SQLite.

---

<a id="moscow"></a>
## 4. 🎯 Priorização MoSCoW

> Regra de ouro: **Must** deve caber em ~60% do esforço; o resto se distribui.

### 🟥 MUST HAVE (essencial — sem isso não é produto)

| # | Funcionalidade | Justificativa |
|---|---|---|
| M1 | **Criar tarefa** (título + área) | Sem isso não há lista. Núcleo do produto. |
| M2 | **Listar tarefas do dia** | É a resposta à dor principal: "o que fazer hoje?". |
| M3 | **Marcar tarefa como concluída** | Fecha o ciclo de uso e gera sensação de progresso. |
| M4 | **4 áreas fixas** (Trabalho, Casa, Comunidade, Pessoal) | A separação por contexto é parte da dor da persona. |
| M5 | **Persistência no SQLite** | Mantém os dados da conta entre sessões. |
| M6 | **Excluir tarefa** | Erro de digitação ou tarefa cancelada precisa sair da lista. |
| M7 | **Agendar tarefa** (data e horário opcionais) | Ajuda a organizar tarefas para outro dia sem perder a visão da lista. |

> ✅ M1–M6 formam o **MVP**. Se tudo isso funcionar, o produto já resolve a dor.

### 🟨 SHOULD HAVE (importante — pode esperar a V1.1)

| # | Funcionalidade | Justificativa |
|---|---|---|
| S1 | **Filtrar por área** | Útil, mas a lista única já resolve o essencial. |
| S2 | **Contador de progresso** ("3 de 7 feitas hoje") | Motiva, mas não é bloqueante. |
| S3 | **Editar tarefa** | Corrigir título/área sem excluir e recriar. |
| S4 | **Ocultar concluídas** (em vez de só riscar) | Limpa a visão do dia. |

### 🟩 COULD HAVE (desejável — se sobrar tempo/energia)

| # | Funcionalidade | Justificativa |
|---|---|---|
| C1 | **Prioridade** (Alta/Média/Baixa) | Ajuda a decidir ordem, mas a persona já filtra por área. |
| C2 | **Recorrência** (diária/semanal) | Bom para tarefas repetitivas, mas adiciona complexidade. |
| C4 | **Áreas customizáveis** | As 4 fixas cobrem 90% dos casos. |
| C5 | **Tema claro/escuro** | Conforto, não necessidade. |

### ⬜ WON'T HAVE (fora desta versão — decisão explícita)

| # | Funcionalidade | Motivo de exclusão |
|---|---|---|
| W3 | Notificações push | Fora do escopo "abrir e ver". |
| W4 | Subtarefas / checklists | Complexidade desnecessária agora. |
| W5 | Integração com calendário | Dependência externa. |
| W6 | Gamificação / streaks | "Nice to have" distante. |
| W7 | App mobile nativo | Web responsivo basta. |
| W8 | IA para sugerir tarefas | Fora do conceito enxuto. |

---

<a id="resumo"></a>
## 5. 📊 Resumo Visual

```
MUST     ██████████████████  (7 itens)  ← MVP
SHOULD   ████████          (4 itens)  ← V1.1
COULD    █████             (4 itens)  ← se sobrar
WON'T    ░░░░░░░░░░░░░░░░  (6 itens)  ← não agora
```

### Contagem

| Categoria | Itens |
|---|---|
| Must Have | 7 |
| Should Have | 4 |
| Could Have | 4 |
| Won't Have | 6 |
| **Total** | **21** |

---

<a id="proximos"></a>
## 6. 🧭 Próximos Passos

### Caminho de construção sugerido

1. **Sprint 1 (MVP):** M1 → M2 → M3 → M4 → M5 → M6 → M7
2. **Sprint 2:** S1 → S2 → S3 → S4
3. **Reavaliar** se C1–C5 valem a pena depois de usar o MVP por alguns dias.

### Decisões pendentes

- [x] **Stack tecnológica** — HTML, CSS e JavaScript puro.
- [x] **Modelo de dados** — usuários, sessões, tarefas e histórico de interações no SQLite.
- [ ] **Wireframe** — layout da tela única.
- [ ] **Comportamento ao concluir** — riscar ou esconder?

### Ordem sugerida de trabalho

1. Definir modelo de dados.
2. Desenhar wireframe da tela única.
3. Executar `npm.cmd start` no Windows e testar o fluxo no navegador.

---

## 7. Estrutura atual do projeto

O sistema usa HTML, CSS e JavaScript puro, sem dependências externas. O servidor Node.js está organizado no padrão MVC: `models` acessam o banco SQLite, `controllers` validam e executam as operações, `routes` encaminham as rotas da API e `views` entrega as páginas HTML e os arquivos estáticos.

```text
index.html
server.js
package.json
pages/
└── details.html
assets/
├── css/
│   ├── details.css
│   └── styles.css
└── js/
    ├── auth.js
    ├── app.js
    └── details.js
src/
├── config/
│   └── database.js
├── controllers/
│   ├── authController.js
│   └── taskController.js
├── models/
│   ├── interactionModel.js
│   ├── sessionModel.js
│   ├── taskModel.js
│   └── userModel.js
├── routes/
│   └── apiRoutes.js
├── utils/
│   └── http.js
└── views/
    └── staticController.js
tests/
└── server.test.js
```

Use Node.js 22.5 ou superior. No Windows, inicie o servidor com `npm.cmd start` (ou `node server.js`); nos demais ambientes, use `npm start`. Abra `http://localhost:3000` no navegador. A tela de cadastro é separada da tela de login; após criar a conta, entre com seu e-mail e senha. Não abra os arquivos HTML diretamente: autenticação e tarefas dependem do servidor.

O arquivo `data/meu-dia.sqlite` é criado automaticamente e guarda usuários, sessões, tarefas e o registro de ações. No primeiro cadastro, tarefas antigas salvas no navegador são importadas para a nova conta. Cada conta acessa somente as próprias tarefas. Senhas são armazenadas com derivação criptográfica e as sessões usam cookies `HttpOnly`. Faça cópias de segurança do diretório `data` para preservar os registros.
