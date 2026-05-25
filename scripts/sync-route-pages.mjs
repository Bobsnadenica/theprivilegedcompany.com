import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteOrigin = 'https://www.theprivilegedcompany.com';

const routes = {
  manifest: {
    title: 'ThePrivilegedCompany | Services',
    description: 'Explore ThePrivilegedCompany services for companies and individuals: data products, audits, consulting, websites, apps, SEO, marketing, training, and custom tools.'
  },
  'who-are-we': {
    title: 'ThePrivilegedCompany | Who We Are',
    description: 'Meet ThePrivilegedCompany, a focused engineering firm for high-stakes software, cloud systems, technical SEO, and private digital problem solving.'
  },
  'data-engine': {
    title: 'ThePrivilegedCompany | Data & Intelligence',
    description: 'Data systems, analytics architecture, automation, and AI-amplified intelligence for clearer technical decisions and business outcomes.'
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
    description: 'Privacy and data handling details for ThePrivilegedCompany website visitors, clients, and technical advisory relationships.'
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
