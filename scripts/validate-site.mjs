import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const root = process.cwd();
const fixtures = path.join(root, 'tests', 'fixtures', 'current');
const dist = path.join(root, 'dist');
const publicFiles = ['robots.txt', 'sitemap.xml', 'llms.txt', 'CNAME'];
const pages = [
  { name: 'Home', fixture: 'index.html', output: 'index.html', url: 'https://www.cerrajeriadelpuertogandia.com/' },
  { name: 'Gandía', fixture: 'gandia.html', output: 'gandia/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/gandia/' },
  { name: 'Playa de Gandía', fixture: 'playa-de-gandia.html', output: 'playa-de-gandia/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/playa-de-gandia/' },
  { name: 'Oliva', fixture: 'oliva.html', output: 'oliva/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/oliva/' },
  { name: 'Playa de Oliva', fixture: 'playa-de-oliva.html', output: 'playa-de-oliva/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/playa-de-oliva/' },
];

const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
const sortedAttributes = (element) => Object.fromEntries(Object.entries(element.attribs ?? {}).sort(([a], [b]) => a.localeCompare(b)));

function extract(html) {
  const $ = load(html);
  const meta = (selector, attribute = 'content') => $(selector).map((_, element) => $(element).attr(attribute) ?? '').get();
  const links = $('a').map((_, element) => ({
    attributes: sortedAttributes(element),
    text: normalize($(element).text()),
    accessibleText: normalize($(element).attr('aria-label') || $(element).text()),
  })).get();
  const jsonLd = $('script[type="application/ld+json"]').map((_, element) => JSON.parse($(element).html())).get();
  const visibleRoot = $('body').clone();
  visibleRoot.find('script,style').remove();
  const graphNodes = jsonLd.flatMap((schema) => schema['@graph'] ?? [schema]);
  const business = graphNodes.find((node) => {
    const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    return type.includes('LocalBusiness');
  });
  return {
    doctype: /^\s*<!doctype html>/i.test(html),
    title: $('title').text(),
    description: meta('meta[name="description"]'), robots: meta('meta[name="robots"]'), canonical: meta('link[rel="canonical"]', 'href'),
    openGraph: $('meta[property^="og:"]').map((_, element) => ({ property: $(element).attr('property'), content: $(element).attr('content') })).get(),
    twitter: $('meta[name^="twitter:"]').map((_, element) => ({ name: $(element).attr('name'), content: $(element).attr('content') })).get(),
    h1: $('h1').map((_, element) => normalize($(element).text())).get(),
    headings: $('h2,h3').map((_, element) => ({ tag: element.tagName.toLowerCase(), text: normalize($(element).text()) })).get(),
    visibleText: normalize(visibleRoot.text()), links,
    phones: links.filter(({ attributes }) => attributes.href?.startsWith('tel:')),
    whatsapp: links.filter(({ attributes }) => attributes.href?.startsWith('https://wa.me/')),
    facebook: links.filter(({ attributes }) => attributes.href?.includes('facebook.com')),
    instagram: links.filter(({ attributes }) => attributes.href?.includes('instagram.com')),
    googleMaps: links.filter(({ attributes }) => attributes.href?.includes('google.com/maps')),
    faqs: $('details').map((_, element) => ({ question: normalize($(element).find('summary').text()), answer: normalize($(element).find('p').text()) })).get(),
    jsonLd,
    breadcrumb: graphNodes.filter((node) => node['@type'] === 'BreadcrumbList'),
    aggregateRating: business?.aggregateRating ?? null,
    areaServed: business?.areaServed ?? null,
    scripts: $('script').map((_, element) => ({ type: $(element).attr('type') ?? '', src: $(element).attr('src') ?? '' })).get(),
  };
}

const pageResults = [];
for (const page of pages) {
  const baseline = extract(await readFile(path.join(fixtures, page.fixture), 'utf8'));
  const generated = extract(await readFile(path.join(dist, page.output), 'utf8'));
  const checks = [
    ['doctype', baseline.doctype, generated.doctype], ['title', baseline.title, generated.title],
    ['description', baseline.description, generated.description], ['robots', baseline.robots, generated.robots],
    ['canonical', baseline.canonical, generated.canonical], ['OpenGraph', baseline.openGraph, generated.openGraph],
    ['Twitter metadata', baseline.twitter, generated.twitter], ['H1', baseline.h1, generated.h1],
    ['H2/H3 sequence', baseline.headings, generated.headings], ['visible normalized text', baseline.visibleText, generated.visibleText],
    ['links, order, attributes and accessible text', baseline.links, generated.links], ['telephone links', baseline.phones, generated.phones],
    ['WhatsApp links', baseline.whatsapp, generated.whatsapp], ['Facebook links', baseline.facebook, generated.facebook],
    ['Instagram links', baseline.instagram, generated.instagram], ['Google Maps links', baseline.googleMaps, generated.googleMaps],
    ['visible FAQs and order', baseline.faqs, generated.faqs], ['JSON-LD', baseline.jsonLd, generated.jsonLd],
    ['BreadcrumbList', baseline.breadcrumb, generated.breadcrumb], ['aggregateRating', baseline.aggregateRating, generated.aggregateRating],
    ['areaServed', baseline.areaServed, generated.areaServed],
  ];
  console.log(`PAGE ${page.name}`);
  for (const [name, expected, actual] of checks) {
    assert.deepStrictEqual(actual, expected, `${page.name}: ${name} differs from baseline`);
    console.log(`PASS ${name}`);
  }
  assert.equal(generated.h1.length, 1, `${page.name}: expected exactly one H1`);
  assert.ok(generated.scripts.every(({ type, src }) => type === 'application/ld+json' && src === ''), `${page.name}: unexpected client JavaScript found`);
  assert.equal(generated.canonical[0], page.url, `${page.name}: canonical does not match public URL`);
  console.log('PASS exactly one H1');
  console.log('PASS no client JavaScript or hydration scripts');
  pageResults.push({ name: page.name, checks: checks.map(([name]) => name), status: 'PASS' });
}

for (const file of publicFiles) {
  assert.deepStrictEqual(await readFile(path.join(dist, file)), await readFile(path.join(fixtures, file)), `${file} differs byte-for-byte from baseline`);
  console.log(`PASS ${file} byte-for-byte`);
}

const generatedHtmlFiles = [];
const generatedJsFiles = [];
async function inspectOutput(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspectOutput(fullPath);
    else if (entry.name.endsWith('.html')) generatedHtmlFiles.push(path.relative(dist, fullPath).replaceAll('\\', '/'));
    else if (entry.name.endsWith('.js')) generatedJsFiles.push(path.relative(dist, fullPath).replaceAll('\\', '/'));
  }
}
await inspectOutput(dist);
assert.deepStrictEqual(generatedHtmlFiles.sort(), pages.map(({ output }) => output).sort(), 'Unexpected Astro HTML pages were generated');
assert.deepStrictEqual(generatedJsFiles, [], 'JavaScript assets were generated');
console.log('PASS exactly five expected HTML pages');
console.log('PASS no JavaScript assets');

const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.deepStrictEqual(sitemapUrls, pages.map(({ url }) => url), 'Sitemap URLs differ from expected public URLs');
for (const url of sitemapUrls) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:', `Sitemap URL is not HTTPS: ${url}`);
  assert.equal(parsed.hostname, 'www.cerrajeriadelpuertogandia.com', `Sitemap URL does not use production www host: ${url}`);
  assert.ok(parsed.pathname.endsWith('/'), `Sitemap URL has no trailing slash: ${url}`);
}
console.log('PASS sitemap contains exactly five HTTPS www URLs with trailing slashes');
const outputText = await Promise.all(generatedHtmlFiles.map((file) => readFile(path.join(dist, file), 'utf8')));
assert.ok(!outputText.join('\n').includes('github.io'), 'github.io URL found in generated HTML');
console.log('PASS no github.io URLs in generated HTML');
console.log(JSON.stringify({ pages: pageResults, htmlFiles: generatedHtmlFiles.sort(), sitemapUrls }, null, 2));
