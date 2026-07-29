const enabledEl = document.getElementById("enabled");
const emptyStateEl = document.getElementById("emptyState");
const historyListEl = document.getElementById("historyList");
const clearAllEl = document.getElementById("clearAll");
const errorInfoEl = document.getElementById("errorInfo");
const errorTextEl = document.getElementById("errorText");
const dismissErrorEl = document.getElementById("dismissError");

const STATUS_LABEL = {
  passed: "✅ 테스트 통과",
  failed: "🔺 시도 중",
  unknown: "❔ 확인 불가",
};

const VISIBLE_COUNT = 5;

function buildHistoryItem(entry) {
  const item = document.createElement("div");
  item.className = `history-item ${entry.status || "unknown"}`;

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = `${STATUS_LABEL[entry.status] || STATUS_LABEL.unknown} · ${entry.title}`;
  item.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.textContent = new Date(entry.timestamp).toLocaleString();
  item.appendChild(meta);

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "dismiss-btn";
  dismissBtn.textContent = "×";
  dismissBtn.title = "이 기록 지우기";
  dismissBtn.addEventListener("click", () => dismissEntry(entry.id));
  item.appendChild(dismissBtn);

  return item;
}

async function getHistory() {
  const { runHistory } = await chrome.storage.local.get("runHistory");
  return Array.isArray(runHistory) ? runHistory : [];
}

async function dismissEntry(id) {
  const history = await getHistory();
  const next = history.filter((entry) => entry.id !== id);
  await chrome.storage.local.set({ runHistory: next });
  render();
}

async function clearAllHistory() {
  await chrome.storage.local.set({ runHistory: [] });
  render();
}

async function dismissError() {
  await chrome.storage.local.remove("lastError");
  render();
}

async function render() {
  const { enabled, lastError } = await chrome.storage.local.get(["enabled", "lastError"]);
  enabledEl.checked = enabled !== false;

  const history = await getHistory();

  if (history.length === 0) {
    emptyStateEl.classList.remove("hidden");
    historyListEl.classList.add("hidden");
    clearAllEl.classList.add("hidden");
  } else {
    emptyStateEl.classList.add("hidden");
    historyListEl.classList.remove("hidden");
    clearAllEl.classList.remove("hidden");

    historyListEl.innerHTML = "";
    history.slice(0, VISIBLE_COUNT).forEach((entry) => {
      historyListEl.appendChild(buildHistoryItem(entry));
    });
  }

  if (lastError) {
    errorTextEl.textContent = `최근 오류: ${lastError}`;
    errorInfoEl.classList.add("show");
  } else {
    errorInfoEl.classList.remove("show");
  }
}

enabledEl.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

clearAllEl.addEventListener("click", clearAllHistory);
dismissErrorEl.addEventListener("click", dismissError);

document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
