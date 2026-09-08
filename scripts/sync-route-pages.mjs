import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteOrigin = 'https://www.theprivilegedcompany.com';

const routes = {
  manifest: {
    title: 'ThePrivilegedCompany | Services',
    description: 'Explore software development, data services, audits, automation, consulting, and training for businesses and individuals.'
  },
  'who-are-we': {
    title: 'ThePrivilegedCompany | Who we are',
    description: 'Meet ThePrivilegedCompany: a lead architect working with AI-assisted tools on software, cloud systems, and practical technical challenges.'
  },
  'data-engine': {
    title: 'ThePrivilegedCompany | Data & Intelligence',
    description: 'Performance data, load testing, and production experience to guide decisions about your software and infrastructure.'
  },
  b2b: {
    title: 'ThePrivilegedCompany | Business Engineering',
    description: 'Enterprise engineering for scalable cloud systems, resilient web platforms, technical SEO, automation, and full-stack product delivery.'
  },
  'personal-it': {
    title: 'ThePrivilegedCompany | Private IT Advisory',
    description: 'Private technical advisory for individuals who need clear help with apps, websites, privacy, digital systems, and difficult technology problems.'
  },
  architecture: {
    title: 'ThePrivilegedCompany | Architecture',
    description: 'Interactive architecture planning for edge, compute, data, and security systems designed for reliable modern digital operations.'
  },
  privacy: {
    title: 'ThePrivilegedCompany | Privacy',
    description: 'How ThePrivilegedCompany handles contact briefs, private inbox storage, and information shared during an engagement.'
  },
  terms: {
    title: 'ThePrivilegedCompany | Terms',
    description: 'Plain-language terms of engagement for working with ThePrivilegedCompany on IT and engineering projects.'
  },
  faq: {
    title: 'ThePrivilegedCompany | FAQ',
    description: 'Answers to common questions about ThePrivilegedCompany services, engagement style, technical delivery, and advisory work.'
  },
  contact: {
    title: 'ThePrivilegedCompany | Contact',
    description: 'Contact ThePrivilegedCompany with your project details, contact information, timeline, and the outcome you want to build.'
  }
};

const replaceTag = (html, selector, value) => {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return html.replace(selector, escaped);
};

const replaceHeadMeta = (html, route, meta) => {
  const canonical = `${siteOrigin}/${route}`;
  let output = html;
  output = output.replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`);
  output = replaceTag(output, /(<meta name="description" content=")[^"]*(")/, `$1${meta.description}$2`);
  output = output.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`);
  output = output.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${meta.title}$2`);
  output = output.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${meta.description}$2`);
  output = output.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`);
  output = output.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${meta.title}$2`);
  output = output.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${meta.description}$2`);
  return output;
};

const shell = await readFile(path.join(root, 'index.html'), 'utf8');

await Promise.all(Object.entries(routes).map(async ([route, meta]) => {
  const routeDir = path.join(root, route);
  await mkdir(routeDir, { recursive: true });
  await writeFile(path.join(routeDir, 'index.html'), replaceHeadMeta(shell, route, meta));
}));

console.log(`Synced ${Object.keys(routes).length} GitHub Pages route shells.`);
