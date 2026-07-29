const tokenEl = document.getElementById("token");
const toggleTokenEl = document.getElementById("toggleToken");
const repoUrlEl = document.getElementById("repoUrl");
const branchEl = document.getElementById("branch");
const toastContainer = document.getElementById("toastContainer");

function parseRepoUrl(raw) {
  const value = raw.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const match = value.match(/^(?:https?:\/\/)?(?:github\.com\/)?([^/\s]+)\/([^/\s]+)$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

let pendingToastEl = null;

function showToast(text, kind, { sticky = false } = {}) {
  if (pendingToastEl) {
    pendingToastEl.remove();
    pendingToastEl = null;
  }

  const el = document.createElement("div");
  el.className = `toast ${kind || ""}`;
  el.textContent = text;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  if (sticky) {
    pendingToastEl = el;
    return;
  }

  const duration = kind === "err" ? 5000 : 2800;
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  }, duration);
}

async function load() {
  const data = await chrome.storage.local.get([
    "githubToken",
    "repoOwner",
    "repoName",
    "branch",
  ]);
  tokenEl.value = data.githubToken || "";
  branchEl.value = data.branch || "main";
  if (data.repoOwner && data.repoName) {
    repoUrlEl.value = `https://github.com/${data.repoOwner}/${data.repoName}`;
  }
}

async function save() {
  const parsed = parseRepoUrl(repoUrlEl.value);
  if (!parsed) {
    showToast("저장소 주소 형식을 확인해주세요. 예: https://github.com/내계정/저장소이름", "err");
    return;
  }
  if (!tokenEl.value.trim()) {
    showToast("GitHub 토큰을 입력해주세요.", "err");
    return;
  }

  await chrome.storage.local.set({
    githubToken: tokenEl.value.trim(),
    repoOwner: parsed.owner,
    repoName: parsed.repo,
    branch: branchEl.value.trim() || "main",
  });
  showToast(`저장 완료: ${parsed.owner}/${parsed.repo}`, "ok");
}

async function testConnection() {
  const parsed = parseRepoUrl(repoUrlEl.value);
  if (!parsed) {
    showToast("저장소 주소 형식을 확인해주세요.", "err");
    return;
  }
  const token = tokenEl.value.trim();
  if (!token) {
    showToast("GitHub 토큰을 입력해주세요.", "err");
    return;
  }

  showToast("확인 중...", "pending", { sticky: true });
  try {
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      showToast(`연결 성공: ${parsed.owner}/${parsed.repo} 저장소에 접근할 수 있어요.`, "ok");
    } else if (res.status === 404) {
      showToast("저장소를 찾을 수 없어요. 주소가 맞는지, 토큰에 이 저장소 접근 권한이 있는지 확인해주세요.", "err");
    } else if (res.status === 401) {
      showToast("토큰이 유효하지 않아요. 새로 발급해서 다시 시도해주세요.", "err");
    } else {
      showToast(`연결 실패 (${res.status}). 토큰 권한과 저장소 이름을 확인해주세요.`, "err");
    }
  } catch (err) {
    showToast(`오류: ${err.message}`, "err");
  }
}

toggleTokenEl.addEventListener("click", () => {
  const showing = tokenEl.type === "text";
  tokenEl.type = showing ? "password" : "text";
  toggleTokenEl.textContent = showing ? "보기" : "숨기기";
});

document.getElementById("save").addEventListener("click", save);
document.getElementById("test").addEventListener("click", testConnection);
load();
