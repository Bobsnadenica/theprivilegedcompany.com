import fs from 'fs';
import path from 'path';

const siteRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const files = [
  'index.html',
  'contact/index.html',
  'privacy/index.html',
  'faq/index.html',
  'Tech Tools/index.html',
  'what-we-can/index.html',
  'showcase/index.html',
  'bg/index.html',
  'bg/kakvo-mozhem/index.html',
  'bg/contact/index.html',
  'bg/privacy/index.html',
  'bg/faq/index.html',
  'bg/showcase/index.html'
].map(relativePath => path.join(siteRoot, relativePath));

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  const relativeDir = path.relative(siteRoot, path.dirname(filePath));
  const depth = relativeDir === '' ? 0 : relativeDir.split(path.sep).length;
  const prefix = '../'.repeat(depth);
  const cssPath = `${prefix}styles.css`;
  const jsPath = `${prefix}script.js`;

  console.log(`Processing ${filePath} (depth ${depth})`);

  // Remove local stylesheets (not google fonts)
  // These usually look like <link rel="stylesheet" href="...css">
  // We'll look for those that don't have http in href
  content = content.replace(/<link rel="stylesheet" href="(?!(http|\/\/))[^"]+\.css">/g, '');
  
  // Remove local scripts
  content = content.replace(/<script src="(?!(http|\/\/))[^"]+\.js"><\/script>/g, '');

  // Clean up potential empty lines left by removals
  content = content.replace(/^\s*[\r\n]/gm, '\n').replace(/\n\n+/g, '\n\n');

  // Re-add the correct ones
  // Add CSS before </head>
  if (!content.includes(`href="${cssPath}"`)) {
    content = content.replace(/<\/head>/, `  <link rel="stylesheet" href="${cssPath}">\n</head>`);
  }
  
  // Add JS before </body>
  if (!content.includes(`src="${jsPath}"`)) {
    content = content.replace(/<\/body>/, `  <script src="${jsPath}"></script>\n</body>`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
});
