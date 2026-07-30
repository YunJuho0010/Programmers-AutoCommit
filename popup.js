const enabledEl = document.getElementById("enabled");
const commitTriggerEl = document.getElementById("commitTrigger");
const emptyStateEl = document.getElementById("emptyState");
const historyListEl = document.getElementById("historyList");
const clearAllEl = document.getElementById("clearAll");
const openOptionsEl = document.getElementById("openOptions");

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

async function render() {
  const { enabled, commitTrigger, githubToken, repoOwner, repoName } =
    await chrome.storage.local.get([
      "enabled",
      "commitTrigger",
      "githubToken",
      "repoOwner",
      "repoName",
    ]);
  enabledEl.checked = enabled !== false;
  commitTriggerEl.value = commitTrigger || "submit"; // 기본값 제출시

  const isConfigured = Boolean(githubToken && repoOwner && repoName);
  openOptionsEl.classList.toggle("configured", isConfigured);
  openOptionsEl.classList.toggle("needs-setup", !isConfigured);
  openOptionsEl.textContent = isConfigured ? "GitHub 연동됨" : "GitHub 연동 필요";

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
}

enabledEl.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

commitTriggerEl.addEventListener("change", () => {
  chrome.storage.local.set({ commitTrigger: commitTriggerEl.value });
});

clearAllEl.addEventListener("click", clearAllHistory);

openOptionsEl.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
