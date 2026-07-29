// 프로그래머스 문제 설명 DOM(HTML)을 간단한 Markdown 텍스트로 변환하는 유틸리티.
// 표준 라이브러리를 쓰지 않고 필요한 태그만 직접 처리한다.

function domToMarkdown(root) {
  if (!root) return "";
  return walkNode(root).replace(/\n{3,}/g, "\n\n").trim();
}

function walkNode(node) {
  let out = "";
  for (const child of node.childNodes) {
    out += nodeToMarkdown(child);
  }
  return out;
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const inner = () => walkNode(node);

  switch (tag) {
    case "p":
      return `\n${inner().trim()}\n`;
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${inner().trim()}**`;
    case "em":
    case "i":
      return `*${inner().trim()}*`;
    case "code":
      return `\`${node.textContent.trim()}\``;
    case "pre":
      return `\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n`;
    case "ul":
    case "ol":
      return `\n${listToMarkdown(node)}\n`;
    case "img": {
      const alt = node.getAttribute("alt") || "image";
      const src = node.getAttribute("src") || "";
      return `\n![${alt}](${src})\n`;
    }
    case "table":
      return `\n${tableToMarkdown(node)}\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      return `\n${"#".repeat(level)} ${inner().trim()}\n`;
    }
    default:
      return inner();
  }
}

function listToMarkdown(listEl) {
  const ordered = listEl.tagName.toLowerCase() === "ol";
  const items = Array.from(listEl.children).filter(
    (el) => el.tagName.toLowerCase() === "li"
  );
  return items
    .map((li, idx) => {
      const prefix = ordered ? `${idx + 1}. ` : "- ";
      return `${prefix}${walkNode(li).trim()}`;
    })
    .join("\n");
}

function tableToMarkdown(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).map((cell) => cell.textContent.trim())
  );
  if (rows.length === 0) return "";
  const header = rows[0];
  const body = rows.slice(1);
  const headerLine = `| ${header.join(" | ")} |`;
  const sepLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((r) => `| ${r.join(" | ")} |`);
  return [headerLine, sepLine, ...bodyLines].join("\n");
}
