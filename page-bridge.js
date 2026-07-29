// content.js는 격리된(isolated) JS 세계에서 실행되어 페이지가 CodeMirror 인스턴스에
// 붙여놓은 .CodeMirror 참조를 직접 읽을 수 없다. 이 스크립트는 manifest에서
// "world": "MAIN"으로 페이지 컨텍스트에 주입되어, 커스텀 이벤트로 요청을 받으면
// 코드 값을 읽어 다시 커스텀 이벤트로 돌려준다.
window.addEventListener("programmers-autocommit:get-code-request", () => {
  const cmHost = document.querySelector(".CodeMirror");
  const code = cmHost && cmHost.CodeMirror ? cmHost.CodeMirror.getValue() : "";
  window.dispatchEvent(
    new CustomEvent("programmers-autocommit:get-code-response", { detail: { code } })
  );
});
