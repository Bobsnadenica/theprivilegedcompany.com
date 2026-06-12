import fs from 'fs';
import path from 'path';

const files = [
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/contact/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/privacy/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/faq/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/Tech Tools/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/what-we-can/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/showcase/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/bg/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/bg/kakvo-mozhem/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/bg/contact/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/bg/privacy/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/bg/faq/index.html',
  '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany/bg/showcase/index.html'
];

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  const myCompanyPath = '/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/mycompany';
  const relativeDir = path.relative(myCompanyPath, path.dirname(filePath));
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
