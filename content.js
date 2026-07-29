// 프로그래머스 문제 페이지에 주입되어 "실행" 버튼 클릭을 감지하고,
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

function getCurrentCode() {
  const cmHost = document.querySelector(".CodeMirror");
  if (cmHost && cmHost.CodeMirror) {
    return cmHost.CodeMirror.getValue();
  }
  return "";
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

const FAIL_KEYWORDS = ["실패", "에러", "초과", "Error", "Fail"];

// "실행" 결과 텍스트만으로 통과 여부를 추정한다. 예제 테스트케이스 기준이며
// 프로그래머스의 정식 채점(제출) 결과와는 다를 수 있는 근사치다.
function detectRunStatus(resultText) {
  if (!resultText) return "unknown";
  if (FAIL_KEYWORDS.some((keyword) => resultText.includes(keyword))) return "failed";
  return "passed";
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

async function handleRunClick() {
  if (!(await isExtensionEnabled())) return;

  const meta = getLessonMeta();
  if (!meta || !meta.lessonId) return;

  const language = getLanguage();
  const codeAtClick = getCurrentCode();
  const description = getDescriptionMarkdown();

  await waitForSpinnerToClear();

  const resultText = getResultText();

  const payload = {
    type: "PROGRAMMERS_RUN",
    lessonId: meta.lessonId,
    title: meta.title,
    level: meta.level,
    category: meta.category,
    language: language.key,
    extension: language.extension,
    code: codeAtClick,
    description,
    resultText,
    status: detectRunStatus(resultText),
    url: location.href,
    timestamp: new Date().toISOString(),
  };

  chrome.runtime.sendMessage(payload);
}

function attachRunListener() {
  const btn = findActionButton("실행");
  if (btn && !btn.dataset.autocommitBound) {
    btn.dataset.autocommitBound = "1";
    btn.addEventListener("click", () => {
      // 사이트 자체 핸들러와 경쟁하지 않도록 다음 tick에서 처리 시작.
      setTimeout(handleRunClick, 0);
    });
  }
}

// 버튼 영역이 클라이언트 사이드에서 늦게 렌더링될 수 있어 주기적으로 재확인한다.
attachRunListener();
const bootObserver = new MutationObserver(attachRunListener);
bootObserver.observe(document.body, { childList: true, subtree: true });
