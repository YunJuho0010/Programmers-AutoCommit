// 프로그래머스 문제 페이지에 주입되어 "코드 실행" / "제출 후 채점하기" 버튼 클릭을 감지하고,
// 문제 정보 + 현재 코드 + 실행 결과를 모아 background로 전달한다.

const LANGUAGE_EXTENSIONS = {
  c: "c",
  cpp: "cpp",
  java: "java",
  javascript: "js",
  python3: "py",
  python: "py",
  ruby: "rb",
  kotlin: "kt",
  swift: "swift",
  go: "go",
  scala: "scala",
  php: "php",
  typescript: "ts",
  csharp: "cs",
};

function getLessonMeta() {
  const el = document.querySelector("[data-lesson-title]");
  if (!el) return null;
  return {
    lessonId: el.dataset.lessonId || "",
    title: el.dataset.lessonTitle || "",
    level: el.dataset.challengeLevel || "",
    category: el.dataset.challengeCategory || "",
  };
}

// breadcrumb의 가운데 항목(예: "탐욕법(Greedy)", "완전탐색", "연습문제", "2025 카카오 하반기 2차")을
// 문제 목록 페이지에 표시되는 태그와 동일한 값으로 사용해 폴더 분류에 쓴다.
function getTopic() {
  const items = document.querySelectorAll(".breadcrumb li");
  if (items.length < 2) return "";
  return items[items.length - 2].textContent.trim();
}

function getLanguage() {
  const el = document.querySelector("[data-language]");
  const lang = el ? el.dataset.language : "";
  return {
    key: lang || "unknown",
    extension: LANGUAGE_EXTENSIONS[lang] || "txt",
  };
}

function getDescriptionMarkdown() {
  const guide = document.querySelector(".guide-section-description .markdown");
  return domToMarkdown(guide);
}

// content.js는 격리된 JS 세계에서 실행되어 페이지의 CodeMirror 인스턴스에 직접 접근할 수
// 없다. page-bridge.js(메인 world에 주입됨)에게 커스텀 이벤트로 요청해서 코드 값을 받아온다.
function getCurrentCode() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(""), 1000);
    window.addEventListener(
      "programmers-autocommit:get-code-response",
      function handler(e) {
        clearTimeout(timeout);
        window.removeEventListener("programmers-autocommit:get-code-response", handler);
        resolve(e.detail.code);
      },
      { once: true }
    );
    window.dispatchEvent(new Event("programmers-autocommit:get-code-request"));
  });
}

function findActionButton(label) {
  const candidates = document.querySelectorAll(".func-buttons a, .func-buttons button");
  for (const el of candidates) {
    if (el.textContent.trim() === label) return el;
  }
  return null;
}

function getResultText() {
  const section = document.querySelector(".output-section");
  if (!section) return "";
  return section.innerText.trim();
}

const FAIL_KEYWORDS = ["실패", "에러", "초과", "다릅니다", "Error", "Fail"];
const RUN_SUMMARY_PATTERN = /(\d+)\s*개\s*중\s*(\d+)\s*개\s*성공/;
const SUBMIT_SCORE_PATTERN = /합계\s*[:：]?\s*([\d.]+)\s*\/\s*([\d.]+)/;

// 결과 패널 텍스트만으로 통과 여부를 추정한다. "코드 실행"과 "제출 후 채점하기"는
// 결과 형식이 서로 달라서 각각의 요약 패턴을 우선 확인하고, 둘 다 없으면
// 실패 키워드로 보수적으로 판단한다 (확신 없으면 unknown).
function detectStatus(resultText) {
  if (!resultText) return "unknown";

  const submitScore = resultText.match(SUBMIT_SCORE_PATTERN);
  if (submitScore) {
    const score = Number(submitScore[1]);
    const total = Number(submitScore[2]);
    return total > 0 && score >= total ? "passed" : "failed";
  }

  const runSummary = resultText.match(RUN_SUMMARY_PATTERN);
  if (runSummary) {
    const total = Number(runSummary[1]);
    const success = Number(runSummary[2]);
    return total > 0 && success === total ? "passed" : "failed";
  }

  if (FAIL_KEYWORDS.some((keyword) => resultText.includes(keyword))) return "failed";
  return "unknown";
}

function waitForSpinnerToClear(timeoutMs = 20000) {
  return new Promise((resolve) => {
    const spinner = document.querySelector("#output-spinner");
    if (!spinner) {
      // 스피너를 찾을 수 없으면 결과가 안정될 시간을 잠깐 준 뒤 진행한다.
      setTimeout(resolve, 1500);
      return;
    }

    const isRunning = () => !spinner.classList.contains("hidden");

    function waitForFinish() {
      if (!isRunning()) {
        setTimeout(resolve, 500);
        return;
      }
      const timer = setTimeout(() => {
        finishObserver.disconnect();
        resolve();
      }, timeoutMs);
      const finishObserver = new MutationObserver(() => {
        if (!isRunning()) {
          clearTimeout(timer);
          finishObserver.disconnect();
          setTimeout(resolve, 500);
        }
      });
      finishObserver.observe(spinner, { attributes: true, attributeFilter: ["class"] });
    }

    if (isRunning()) {
      waitForFinish();
      return;
    }

    // 클릭 직후에는 스피너가 아직 켜지기 전일 수 있으므로, 켜지는 걸 잠깐 기다린다.
    const startTimer = setTimeout(() => {
      startObserver.disconnect();
      waitForFinish();
    }, 1000);
    const startObserver = new MutationObserver(() => {
      if (isRunning()) {
        clearTimeout(startTimer);
        startObserver.disconnect();
        waitForFinish();
      }
    });
    startObserver.observe(spinner, { attributes: true, attributeFilter: ["class"] });
  });
}

async function isExtensionEnabled() {
  const { enabled } = await chrome.storage.local.get("enabled");
  return enabled !== false; // 기본값 켜짐
}

const TRIGGER_BUTTONS = [
  { label: "코드 실행", action: "run" },
  { label: "제출 후 채점하기", action: "submit" },
];

async function handleActionClick(action) {
  if (!(await isExtensionEnabled())) return;

  const meta = getLessonMeta();
  if (!meta || !meta.lessonId) return;

  const language = getLanguage();
  const codeAtClick = await getCurrentCode();
  const description = getDescriptionMarkdown();

  await waitForSpinnerToClear();

  const resultText = getResultText();

  const payload = {
    type: "PROGRAMMERS_RUN",
    action,
    lessonId: meta.lessonId,
    title: meta.title,
    level: meta.level,
    category: getTopic() || meta.category,
    language: language.key,
    extension: language.extension,
    code: codeAtClick,
    description,
    resultText,
    status: detectStatus(resultText),
    url: location.href,
    timestamp: new Date().toISOString(),
  };

  chrome.runtime.sendMessage(payload);
}

function attachTriggerListeners() {
  for (const { label, action } of TRIGGER_BUTTONS) {
    const btn = findActionButton(label);
    if (btn && !btn.dataset.autocommitBound) {
      btn.dataset.autocommitBound = "1";
      btn.addEventListener("click", () => {
        // 사이트 자체 핸들러와 경쟁하지 않도록 다음 tick에서 처리 시작.
        setTimeout(() => handleActionClick(action), 0);
      });
    }
  }
}

// 버튼 영역이 클라이언트 사이드에서 늦게 렌더링될 수 있어 주기적으로 재확인한다.
attachTriggerListeners();
const bootObserver = new MutationObserver(attachTriggerListeners);
bootObserver.observe(document.body, { childList: true, subtree: true });
