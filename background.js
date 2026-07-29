// GitHub Contents API를 사용해 문제 README + 코드 파일을 커밋하고,
// 저장소 루트 README에 전체 풀이 현황을 요약해서 갱신하는 서비스 워커.

const GITHUB_API = "https://api.github.com";
const INDEX_PATH = "programmers/index.json";
const ROOT_README_PATH = "README.md";

const STATUS_LABEL = {
  passed: "✅ 테스트 통과",
  failed: "🔺 시도 중",
  unknown: "❔ 확인 불가",
};

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getSettings() {
  const data = await chrome.storage.local.get([
    "githubToken",
    "repoOwner",
    "repoName",
    "branch",
  ]);
  return {
    token: data.githubToken || "",
    owner: data.repoOwner || "",
    repo: data.repoName || "",
    branch: data.branch || "main",
  };
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function getFile(settings, path) {
  const url = `${GITHUB_API}/repos/${settings.owner}/${settings.repo}/contents/${encodeURIComponent(
    path
  )}?ref=${encodeURIComponent(settings.branch)}`;
  const res = await fetch(url, { headers: githubHeaders(settings.token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub 조회 실패 (${res.status}): ${path}`);
  const json = await res.json();
  return { sha: json.sha, text: base64ToUtf8(json.content) };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function putFile(settings, path, content, message, knownSha, retriesLeft = 4) {
  const sha = knownSha !== undefined ? knownSha : (await getFile(settings, path))?.sha;
  const url = `${GITHUB_API}/repos/${settings.owner}/${settings.repo}/contents/${encodeURIComponent(
    path
  )}`;
  const body = {
    message,
    content: utf8ToBase64(content),
    branch: settings.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(settings.token),
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();

  // 다른 커밋이 그 사이 같은 파일을 먼저 바꿔서 sha가 어긋난 경우(409),
  // 잠깐 대기했다가 최신 sha를 다시 받아와서 재시도한다. 대기 시간을 매번 조금씩
  // 늘려서(지수 백오프) 계속 겹치는 걸 줄인다.
  if (res.status === 409 && retriesLeft > 0) {
    await wait(200 + Math.random() * 200 * (5 - retriesLeft));
    const fresh = await getFile(settings, path);
    return putFile(settings, path, content, message, fresh?.sha, retriesLeft - 1);
  }

  const errText = await res.text();
  throw new Error(`GitHub 커밋 실패 (${res.status}): ${errText}`);
}

function safeFolderName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function getCategoryFolder(run) {
  return safeFolderName(run.category || "algorithm");
}

function buildBasePath(run) {
  const level = run.level ? `Lv${run.level}` : "미분류";
  const folder = safeFolderName(`[${level}][${run.lessonId}] ${run.title}`);
  return `programmers/${getCategoryFolder(run)}/${folder}`;
}

async function ensureCategoryReadme(settings, run, message) {
  const categoryFolder = getCategoryFolder(run);
  const path = `programmers/${categoryFolder}/README.md`;
  const content = `### ${categoryFolder}\n`;

  const existing = await getFile(settings, path);
  if (existing && existing.text === content) return;
  await putFile(settings, path, content, message, existing?.sha);
}

function buildReadme(run) {
  const status = STATUS_LABEL[run.status] || STATUS_LABEL.unknown;
  const actionLabel = run.action === "submit" ? "제출 후 채점하기" : "코드 실행";
  const caveat =
    run.action === "submit"
      ? "> 상태는 프로그래머스 정식 채점(제출) 결과 기준입니다."
      : '> 상태는 "코드 실행" 결과(예제 테스트케이스) 기준 추정치이며, 정식 채점(제출) 결과와 다를 수 있습니다.';

  const lines = [
    `# ${run.title}`,
    "",
    `- 문제 번호: ${run.lessonId}`,
    `- 난이도: Lv.${run.level || "?"}`,
    `- 분류: ${run.category || "?"}`,
    `- 문제 링크: ${run.url}`,
    `- 상태: ${status}`,
    "",
    caveat,
    "",
    "## 문제 설명",
    "",
    run.description || "(설명을 불러오지 못했습니다)",
    "",
    `## 마지막 ${actionLabel} 결과`,
    "",
    "```",
    run.resultText || "(결과 없음)",
    "```",
    "",
    `_마지막 ${actionLabel}: ${run.timestamp}_`,
  ];
  return lines.join("\n");
}

async function loadIndex(settings) {
  const file = await getFile(settings, INDEX_PATH);
  if (!file) return { sha: null, entries: [] };
  try {
    return { sha: file.sha, entries: JSON.parse(file.text) };
  } catch {
    return { sha: file.sha, entries: [] };
  }
}

function upsertEntry(entries, run, basePath) {
  const next = entries.filter((e) => e.lessonId !== run.lessonId);
  next.push({
    lessonId: run.lessonId,
    title: run.title,
    level: run.level || "?",
    category: run.category || "algorithm",
    status: run.status || "unknown",
    path: basePath,
    lastRun: run.timestamp,
  });
  next.sort((a, b) => {
    const levelDiff = Number(a.level) - Number(b.level);
    if (levelDiff !== 0) return levelDiff;
    return a.title.localeCompare(b.title, "ko");
  });
  return next;
}

function buildRootReadme(entries) {
  const total = entries.length;
  const passed = entries.filter((e) => e.status === "passed").length;

  const byLevel = {};
  for (const e of entries) {
    const key = `Lv${e.level}`;
    byLevel[key] = (byLevel[key] || 0) + 1;
  }
  const levelKeys = Object.keys(byLevel).sort();
  const levelSummary = levelKeys.map((k) => `${k} ${byLevel[k]}개`).join(" · ") || "-";

  const escapeCell = (text) => String(text).replace(/\|/g, "\\|");

  const rows = entries.map((e) => {
    const status = STATUS_LABEL[e.status] || STATUS_LABEL.unknown;
    const link = `[${escapeCell(e.title)}](${encodeURI(e.path)})`;
    return `| ${status} | ${link} | Lv${escapeCell(e.level)} | ${escapeCell(e.category)} | ${new Date(e.lastRun).toLocaleString("ko-KR")} |`;
  });

  return [
    "# 프로그래머스 풀이 기록",
    "",
    "이 저장소는 [Programmers-AutoCommit](https://github.com/YunJuho0010/Programmers-AutoCommit) 확장 프로그램으로 자동 생성됩니다.",
    "",
    `- 총 문제 수: **${total}개** (테스트 통과 ${passed}개)`,
    `- 난이도별: ${levelSummary}`,
    "",
    "| 상태 | 문제 | 난이도 | 분류 | 마지막 실행 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function updateIndex(settings, run, basePath, message) {
  const { sha, entries } = await loadIndex(settings);
  const nextEntries = upsertEntry(entries, run, basePath);

  await putFile(settings, INDEX_PATH, JSON.stringify(nextEntries, null, 2), message, sha);

  const rootFile = await getFile(settings, ROOT_README_PATH);
  await putFile(
    settings,
    ROOT_README_PATH,
    buildRootReadme(nextEntries),
    message,
    rootFile?.sha
  );
}

const MAX_HISTORY = 30;

async function pushHistory(entry) {
  const { runHistory } = await chrome.storage.local.get("runHistory");
  const history = Array.isArray(runHistory) ? runHistory : [];
  history.unshift(entry);
  history.length = Math.min(history.length, MAX_HISTORY);
  await chrome.storage.local.set({ runHistory: history });
}

async function commitRun(run) {
  const settings = await getSettings();
  if (!settings.token || !settings.owner || !settings.repo) {
    console.warn("[프로그래머스 오토커밋] GitHub 설정이 완료되지 않았습니다.");
    return;
  }

  const basePath = buildBasePath(run);
  const readmePath = `${basePath}/README.md`;
  const codePath = `${basePath}/solution.${run.extension}`;
  const actionLabel = run.action === "submit" ? "제출" : "실행";
  const message = `[${actionLabel}] ${run.title}`;

  await ensureCategoryReadme(settings, run, message);
  await putFile(settings, readmePath, buildReadme(run), message);
  await putFile(settings, codePath, run.code || "", message);
  await updateIndex(settings, run, basePath, message);

  await pushHistory({
    id: `${run.timestamp}-${run.lessonId}`,
    title: run.title,
    path: basePath,
    status: run.status || "unknown",
    timestamp: run.timestamp,
  });
}

// index.json / 루트 README는 모든 실행이 공유하는 파일이라, 실행을 연달아 누르면
// 두 커밋이 같은 파일의 sha를 동시에 읽어 충돌(409)할 수 있다. 한 번에 하나씩만
// 처리되도록 큐에 태워 직렬화한다.
let commitQueue = Promise.resolve();

function enqueueCommit(run) {
  const result = commitQueue.then(() => commitRun(run));
  commitQueue = result.catch(() => {});
  return result;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "PROGRAMMERS_RUN") return;
  // 실패해도 사용자에게 알리지 않고 콘솔에만 남긴다 (다음 실행/제출 때 다시 시도됨).
  enqueueCommit(message).catch((err) => {
    console.error("[프로그래머스 오토커밋]", err);
  });
});
