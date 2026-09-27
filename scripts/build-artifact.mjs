// Turns dist-artifact/index.html into the page fragment the claude.ai Artifact
// tool expects (it adds its own <!doctype>/<head>/<body> skeleton when publishing).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-artifact/index.html', 'utf8');
const tags = [...html.matchAll(/<(script|link)\b[^>]*>(<\/script>)?/g)]
  .map((m) => m[0])
  .filter((t) => t.startsWith('<script') || /rel="(stylesheet|modulepreload)"/.test(t));
const page = `<title>Grimrecall</title>
<meta name="theme-color" content="#15110f">
${tags.join('\n')}
<div id="root"></div>
`;
writeFileSync('dist-artifact/grimrecall.html', page);
console.log(page);
