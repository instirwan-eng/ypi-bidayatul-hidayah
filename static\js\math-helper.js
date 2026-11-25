/**
 * Math sanitization and KaTeX rendering helper.
 * Ensures mathematical expressions in questions and teacher explanations render
 * cleanly without raw markup artifacts or weird symbols.
 */
window.MathHelper = (() => {
  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Normalizes common plain-text or double-escaped LaTeX quirks before KaTeX runs.
   */
  function normalizeMathText(raw) {
    if (!raw) return "";
    let txt = String(raw);

    // Fix common double-escaped LaTeX commands from JSON pastes
    // e.g. "\\\\frac" -> "\\frac", while preserving explicit LaTeX linebreaks "\\\\" inside environments
    txt = txt.replace(/\\\\(frac|sqrt|int|sum|lim|sin|cos|tan|log|ln|times|div|cdot|pm|leq|geq|neq|approx|infty|alpha|beta|gamma|theta|pi|Delta|Sigma|text|begin|end|left|right|bigl|bigr|det)/g, "\\$1");

    // Clean common markdown bold artifacts inside plain text if someone pasted AI output
    txt = txt.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Replace stray Unicode multiplication/division outside math if needed, keep clean symbols
    txt = txt.replace(/\r\n/g, "\n");
    return txt;
  }

  /**
   * Formats plain text with linebreaks while protecting math delimiters ($...$ and $$...$$).
   */
  function formatSafeHtml(raw) {
    const normalized = normalizeMathText(raw);
    // Split around $$...$$ and $...$ so we don't escape inside math or break tags
    const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g);
    return parts
      .map((part) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          return `<div class="math-block">${escapeHtml(part)}</div>`;
        }
        if (part.startsWith("$") && part.endsWith("$")) {
          return `<span class="math-inline">${escapeHtml(part)}</span>`;
        }
        // Keep intentional <strong> tags created from **...**, escape everything else
        const safe = escapeHtml(part)
          .replace(/&lt;strong&gt;/g, "<strong>")
          .replace(/&lt;\/strong&gt;/g, "</strong>")
          .replace(/\n/g, "<br>");
        return safe;
      })
      .join("");
  }

  function renderElement(el) {
    if (!el || typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
        strict: false,
      });
    } catch (err) {
      console.warn("KaTeX render warning:", err);
    }
  }

  function setMathHtml(el, rawText) {
    if (!el) return;
    el.innerHTML = formatSafeHtml(rawText);
    renderElement(el);
  }

  function renderAllIn(container) {
    if (!container) return;
    container.querySelectorAll("[data-math-raw]").forEach((node) => {
      const raw = node.getAttribute("data-math-raw") || "";
      setMathHtml(node, raw);
    });
    renderElement(container);
  }

  return {
    escapeHtml,
    formatSafeHtml,
    renderElement,
    setMathHtml,
    renderAllIn,
  };
})();
