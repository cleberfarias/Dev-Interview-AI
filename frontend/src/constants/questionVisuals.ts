export type QuestionTopic = 'system_design' | 'algorithms' | 'scalability' | 'default';

export const QUESTION_VISUALS: Record<QuestionTopic, string> = {
  system_design: '/assets/visuals/system_design_01.png',
  algorithms: '/assets/visuals/algorithms_01.png',
  scalability: '/assets/visuals/scalability_01.png',
  default: '/assets/visuals/default_01.png',
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderLabelSvg = (label: string): string => {
  const lines = label.trim().split(/\s+/);
  const primary = lines.slice(0, Math.ceil(lines.length / 2)).join(' ');
  const secondary = lines.slice(Math.ceil(lines.length / 2)).join(' ');
  const fontSize = label.length > 16 ? 34 : 40;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f1c3a"/>
          <stop offset="100%" stop-color="#0b1228"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="32" fill="url(#bg)"/>
      <circle cx="120" cy="90" r="110" fill="rgba(94,231,255,0.18)"/>
      <circle cx="520" cy="270" r="140" fill="rgba(143,91,255,0.2)"/>
      <text x="50%" y="52%" text-anchor="middle" fill="#e2e8f0"
        font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" font-weight="700"
        letter-spacing="4">${escapeXml(primary)}</text>
      ${secondary ? `<text x="50%" y="66%" text-anchor="middle" fill="#c7d2fe"
        font-family="Inter, system-ui, sans-serif" font-size="${fontSize - 6}" font-weight="600"
        letter-spacing="3">${escapeXml(secondary)}</text>` : ''}
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

type CodeSnippet = {
  label: string;
  lines: string[];
};

const buildCodeSnippet = (question?: string, label?: string): CodeSnippet | null => {
  const base = `${question ?? ''} ${label ?? ''}`.toLowerCase();

  if (base.includes('null') && base.includes('undefined')) {
    return {
      label: 'JavaScript',
      lines: [
        'let value;',
        "value ??= 'fallback';",
        'const maybeNull = null;',
        'if (value === undefined) {',
        '  // not assigned',
        '}',
        'if (maybeNull === null) {',
        '  // explicit empty',
        '}',
      ],
    };
  }

  if (base.includes('react') || base.includes('jsx')) {
    return {
      label: 'React',
      lines: [
        'function Button({ label }) {',
        '  return (',
        '    <button>{label}</button>',
        '  );',
        '}',
      ],
    };
  }

  if (base.includes('typescript') || base.includes('ts')) {
    return {
      label: 'TypeScript',
      lines: [
        'type User = {',
        '  id: string;',
        '  name?: string;',
        '};',
        'const user: User = { id: "1" };',
      ],
    };
  }

  if (base.includes('sql') || base.includes('database') || base.includes('banco')) {
    return {
      label: 'SQL',
      lines: [
        'SELECT id, name',
        'FROM users',
        'WHERE active = 1',
        'ORDER BY created_at DESC;',
      ],
    };
  }

  if (base.includes('api') || base.includes('rest') || base.includes('http')) {
    return {
      label: 'API',
      lines: [
        "const res = await fetch('/api/users');",
        'if (!res.ok) throw new Error("HTTP");',
        'const data = await res.json();',
      ],
    };
  }

  if (base.includes('python')) {
    return {
      label: 'Python',
      lines: [
        'items = [1, 2, 3, 4]',
        'evens = [x for x in items if x % 2 == 0]',
        'print(evens)',
      ],
    };
  }

  if (label && label.trim()) {
    return {
      label: label.trim(),
      lines: [
        'function solve(input) {',
        '  // implement...',
        '  return input;',
        '}',
      ],
    };
  }

  return null;
};

const renderCodeSvg = (snippet: CodeSnippet): string => {
  const header = escapeXml(snippet.label);
  const lines = snippet.lines.map((line) => escapeXml(line));
  const lineHeight = 26;
  const startY = 110;
  const lineSpans = lines
    .map((line, idx) => `<tspan x="64" y="${startY + idx * lineHeight}">${line}</tspan>`)
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0b1026"/>
          <stop offset="100%" stop-color="#0a152f"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="32" fill="url(#bg)"/>
      <rect x="36" y="40" width="568" height="280" rx="22" fill="#0f1b3d" stroke="rgba(94,231,255,0.5)" stroke-width="1.5"/>
      <circle cx="70" cy="70" r="6" fill="#ff6b7f"/>
      <circle cx="92" cy="70" r="6" fill="#ffd166"/>
      <circle cx="114" cy="70" r="6" fill="#4ade80"/>
      <text x="140" y="76" fill="#c7d2fe" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="3">
        ${header}
      </text>
      <text fill="#e2e8f0" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="18">
        ${lineSpans}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const getQuestionVisual = (topic?: string, label?: string, question?: string): string => {
  const snippet = buildCodeSnippet(question, label);
  if (snippet) {
    return renderCodeSvg(snippet);
  }
  if (label && label.trim().length > 0) {
    return renderLabelSvg(label);
  }
  if (!topic) return QUESTION_VISUALS.default;
  const key = topic as QuestionTopic;
  return QUESTION_VISUALS[key] ?? QUESTION_VISUALS.default;
};
