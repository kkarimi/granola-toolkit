import type { ProseMirrorDoc, ProseMirrorMark, ProseMirrorNode } from "./types.ts";

function repeatIndent(level: number): string {
  return "  ".repeat(level);
}

function escapeMarkdownText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/([*_`[\]])/g, "\\$1");
}

function renderInline(nodes: ProseMirrorNode[] = []): string {
  return nodes.map((node) => renderInlineNode(node)).join("");
}

function applyMarks(text: string, marks: ProseMirrorMark[] = []): string {
  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "strong":
        return `**${current}**`;
      case "em":
        return `*${current}*`;
      case "code":
        return `\`${current}\``;
      case "strike":
        return `~~${current}~~`;
      case "underline":
        return `<u>${current}</u>`;
      case "subscript":
        return `<sub>${current}</sub>`;
      case "superscript":
        return `<sup>${current}</sup>`;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined;
        return href ? `[${current}](${href})` : current;
      }
      default:
        return current;
    }
  }, text);
}

function renderInlineNode(node: ProseMirrorNode): string {
  switch (node.type) {
    case "text":
      return applyMarks(escapeMarkdownText(node.text ?? ""), node.marks);
    case "hardBreak":
      return "  \n";
    case "mention": {
      const label =
        typeof node.attrs?.label === "string"
          ? node.attrs.label
          : typeof node.attrs?.text === "string"
            ? node.attrs.text
            : typeof node.attrs?.name === "string"
              ? node.attrs.name
              : renderInline(node.content);
      return applyMarks(escapeMarkdownText(label), node.marks);
    }
    default:
      return applyMarks(renderInline(node.content), node.marks);
  }
}

function indentLines(value: string, level: number): string {
  const indent = repeatIndent(level);
  return value
    .split("\n")
    .map((line) => (line.length === 0 ? line : `${indent}${line}`))
    .join("\n");
}

function renderList(
  items: ProseMirrorNode[],
  ordered: boolean,
  indentLevel: number,
  start = 1,
): string {
  return items
    .map((item, index) => renderListItem(item, ordered ? `${start + index}.` : "-", indentLevel))
    .join("\n");
}

function renderListItem(node: ProseMirrorNode, marker: string, indentLevel: number): string {
  const children = node.content ?? [];
  const blockChildren = children.filter(
    (child) => child.type !== "bulletList" && child.type !== "orderedList",
  );
  const nestedLists = children.filter(
    (child) => child.type === "bulletList" || child.type === "orderedList",
  );

  const mainText = blockChildren
    .map((child) => renderBlock(child, indentLevel + 1))
    .filter(Boolean)
    .join("\n")
    .trim();

  const prefix = `${repeatIndent(indentLevel)}${marker} `;
  const continuationIndent = `${repeatIndent(indentLevel)}${" ".repeat(marker.length + 1)}`;
  const formattedMainText = mainText
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${continuationIndent}${line}`))
    .join("\n");
  let output = `${prefix}${formattedMainText || ""}`.trimEnd();

  if (nestedLists.length > 0) {
    const nestedText = nestedLists
      .map((child) => renderBlock(child, indentLevel + 1))
      .filter(Boolean)
      .map((value) => indentLines(value, 0))
      .join("\n");

    output = `${output}\n${nestedText}`;
  }

  return output;
}

function renderTaskList(items: ProseMirrorNode[], indentLevel: number): string {
  return items.map((item) => renderTaskItem(item, indentLevel)).join("\n");
}

function renderTaskItem(node: ProseMirrorNode, indentLevel: number): string {
  const checked = node.attrs?.checked === true;
  return renderListItem(node, checked ? "[x]" : "[ ]", indentLevel);
}

function renderTableCell(node: ProseMirrorNode): string {
  return renderBlocks(node.content ?? [], 0)
    .replace(/\n+/g, " <br> ")
    .replace(/\|/g, "\\|")
    .trim();
}

function renderTable(node: ProseMirrorNode): string {
  const rows = (node.content ?? [])
    .map((row) => (row.content ?? []).map((cell) => renderTableCell(cell)))
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    return "";
  }

  const header = rows[0]!;
  const body = rows.slice(1);
  const separator = header.map(() => "---");
  const lines = [
    `| ${header.map((cell) => cell || " ").join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
  ];

  for (const row of body) {
    const padded = header.map((_, index) => row[index] ?? " ");
    lines.push(`| ${padded.join(" | ")} |`);
  }

  return lines.join("\n");
}

function renderBlock(node: ProseMirrorNode, indentLevel: number): string {
  switch (node.type) {
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      return `${"#".repeat(level)} ${renderInline(node.content).trim()}`.trim();
    }
    case "paragraph":
      return renderInline(node.content).trim();
    case "bulletList":
      return renderList(node.content ?? [], false, indentLevel);
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return renderList(node.content ?? [], true, indentLevel, start);
    }
    case "listItem":
      return renderListItem(node, "-", indentLevel);
    case "taskList":
      return renderTaskList(node.content ?? [], indentLevel);
    case "taskItem":
      return renderTaskItem(node, indentLevel);
    case "table":
      return renderTable(node);
    case "tableRow":
      return (node.content ?? []).map((cell) => renderTableCell(cell)).join(" | ");
    case "tableCell":
    case "tableHeader":
      return renderTableCell(node);
    case "blockquote": {
      const value = renderBlocks(node.content ?? [], indentLevel)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return value.trim();
    }
    case "codeBlock": {
      const text = extractPlainText({ type: "doc", content: node.content }).trimEnd();
      const language =
        typeof node.attrs?.language === "string"
          ? node.attrs.language.trim()
          : typeof node.attrs?.params === "string"
            ? node.attrs.params.trim()
            : "";
      return `\`\`\`${language}\n${text}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "hardBreak":
      return "";
    case "text":
      return renderInlineNode(node);
    default:
      if (node.content?.length) {
        return renderBlocks(node.content, indentLevel);
      }

      return renderInlineNode(node).trim();
  }
}

function renderBlocks(nodes: ProseMirrorNode[], indentLevel = 0): string {
  return nodes
    .map((node) => renderBlock(node, indentLevel))
    .filter((value) => value.length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPlainTextNode(node: ProseMirrorNode): string {
  switch (node.type) {
    case "hardBreak":
      return "\n";
    case "text":
      return node.text ?? "";
    default:
      return extractPlainText({ type: "doc", content: node.content });
  }
}

export function convertProseMirrorToMarkdown(doc?: ProseMirrorDoc): string {
  if (!doc || doc.type !== "doc" || !doc.content?.length) {
    return "";
  }

  const rendered = renderBlocks(doc.content);
  return rendered ? `${rendered}\n` : "";
}

export function extractPlainText(doc?: ProseMirrorDoc): string {
  if (!doc || doc.type !== "doc" || !doc.content?.length) {
    return "";
  }

  const lines = doc.content
    .map((node) => {
      if (node.type === "bulletList" || node.type === "orderedList") {
        return (node.content ?? [])
          .map((child) => extractPlainTextNode(child))
          .filter(Boolean)
          .join("\n");
      }

      return extractPlainTextNode(node);
    })
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return lines;
}
