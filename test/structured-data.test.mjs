import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jsonLd, structuredData } from '../scripts/lib/structured-data.mjs';
import { lang, ui } from './helpers/render.mjs';

const site = { siteUrl: 'https://x.test' };
const pl = lang('pl');
const en = lang('en');
const image = { href: 'img/og.jpg', width: 1200, height: 630 };
const dates = {
  published: '2026-01-02T03:04:05Z',
  modified: '2026-11-06T22:18:37+01:00',
};
const FAQ = {
  type: 'faq',
  id: 'faq-salt',
  question: 'How much salt?',
  answer: 'About 2.7%.',
};
const RECIPE = {
  type: 'recipe',
  id: 'recipe',
  name: 'Basic recipe',
  description: 'For four balls.',
  ingredients: ['598 g Flour', '329 g Water'],
  steps: ['Mix.', 'Knead.'],
  time: 'PT24H',
};

const build = (over = {}) =>
  structuredData({
    site,
    lang: en,
    source: pl,
    image,
    ui: ui({ credit: 'Based on a document.' }),
    records: [],
    ...over,
  });
const node = (graph, type) =>
  graph['@graph'].find((entry) => entry['@type'] === type);

describe('structuredData', () => {
  it('is one schema.org graph: the publisher, the site and the article', () => {
    const graph = build();
    assert.equal(graph['@context'], 'https://schema.org');
    assert.deepEqual(
      graph['@graph'].map((entry) => entry['@type']),
      ['Organization', 'WebSite', 'Article'],
    );
  });

  it('names the guide as its publisher, with its icon', () => {
    assert.deepEqual(node(build(), 'Organization'), {
      '@type': 'Organization',
      '@id': 'https://x.test/#publisher',
      name: 'Title en',
      url: 'https://x.test/',
      logo: {
        '@type': 'ImageObject',
        url: 'https://x.test/icon-512.png',
        width: 512,
        height: 512,
      },
    });
  });

  it('describes the site in the language of the page', () => {
    assert.deepEqual(node(build(), 'WebSite'), {
      '@type': 'WebSite',
      '@id': 'https://x.test/en/#website',
      name: 'Title en',
      description: 'Description en.',
      url: 'https://x.test/en/',
      inLanguage: 'en-GB',
      publisher: { '@id': 'https://x.test/#publisher' },
    });
  });

  it('describes the page as an article, a translation of the source language’s, with its dates', () => {
    assert.deepEqual(node(build({ dates }), 'Article'), {
      '@type': 'Article',
      '@id': 'https://x.test/en/#article',
      headline: 'Page title en',
      name: 'Title en',
      description: 'Description en.',
      url: 'https://x.test/en/',
      mainEntityOfPage: 'https://x.test/en/',
      inLanguage: 'en-GB',
      image: {
        '@type': 'ImageObject',
        url: 'https://x.test/img/og.jpg',
        width: 1200,
        height: 630,
      },
      datePublished: dates.published,
      dateModified: dates.modified,
      author: { '@id': 'https://x.test/#publisher' },
      publisher: { '@id': 'https://x.test/#publisher' },
      isPartOf: { '@id': 'https://x.test/en/#website' },
      creditText: 'Based on a document.',
      translationOfWork: { '@id': 'https://x.test/pl/#article' },
    });
  });

  it('leaves out the dates when they are unknown, and the translation on the source page', () => {
    const article = node(build({ lang: pl }), 'Article');
    assert.equal(article.datePublished, undefined);
    assert.equal(article.dateModified, undefined);
    assert.equal(article.translationOfWork, undefined);
  });

  it('lists every question with its answer and its address in one FAQPage', () => {
    const faq = node(
      build({ records: [FAQ, { ...FAQ, id: 'faq-b', question: 'B?' }] }),
      'FAQPage',
    );
    assert.equal(faq['@id'], 'https://x.test/en/#faq-page');
    assert.equal(faq.inLanguage, 'en-GB');
    assert.deepEqual(faq.mainEntity[0], {
      '@type': 'Question',
      '@id': 'https://x.test/en/#faq-salt',
      url: 'https://x.test/en/#faq-salt',
      name: 'How much salt?',
      acceptedAnswer: { '@type': 'Answer', text: 'About 2.7%.' },
    });
    assert.deepEqual(
      faq.mainEntity.map((entry) => entry.name),
      ['How much salt?', 'B?'],
    );
  });

  it('describes every recipe, with its steps', () => {
    const graph = build({ records: [RECIPE], dates });
    assert.equal(node(graph, 'FAQPage'), undefined);
    assert.deepEqual(node(graph, 'Recipe'), {
      '@type': 'Recipe',
      '@id': 'https://x.test/en/#recipe',
      name: 'Basic recipe',
      description: 'For four balls.',
      url: 'https://x.test/en/#recipe',
      inLanguage: 'en-GB',
      image: {
        '@type': 'ImageObject',
        url: 'https://x.test/img/og.jpg',
        width: 1200,
        height: 630,
      },
      author: { '@id': 'https://x.test/#publisher' },
      datePublished: dates.published,
      totalTime: 'PT24H',
      recipeIngredient: ['598 g Flour', '329 g Water'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Mix.' },
        { '@type': 'HowToStep', text: 'Knead.' },
      ],
    });
  });

  it('leaves out what a recipe does not say', () => {
    const recipe = node(
      build({ records: [{ ...RECIPE, description: '', time: null }] }),
      'Recipe',
    );
    assert.equal(recipe.description, undefined);
    assert.equal(recipe.totalTime, undefined);
    assert.equal(recipe.datePublished, undefined);
  });
});

describe('jsonLd', () => {
  it('is a script of structured data with the graph as JSON', () => {
    assert.equal(
      jsonLd({ a: 1 }),
      '<script type="application/ld+json">{"a":1}</script>',
    );
  });

  it('writes every "<" as \\u003c, so the text cannot close the element', () => {
    const html = jsonLd({ text: '</script><!-- <b>' });
    assert.ok(!html.slice(1, -'</script>'.length).includes('<'));
    const json = html.slice(
      '<script type="application/ld+json">'.length,
      -'</script>'.length,
    );
    assert.deepEqual(JSON.parse(json), { text: '</script><!-- <b>' });
  });
});
