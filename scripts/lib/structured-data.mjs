/**
 * The structured data of a language page: one JSON-LD graph (schema.org)
 * that says in data what the page says in text, for search engines and
 * language models. Every value comes from the page itself or from
 * `lang.json` and `site.json`, so the data cannot claim what the page does
 * not show:
 *
 *   Organization  the publisher: the guide's name and its icon
 *   WebSite       the guide in this language
 *   Article       the page: title, description, preview image, language, the
 *                 dates of its text (when known), the credit, and the source
 *                 language's page it is a translation of
 *   FAQPage       every question of the page with its answer, as text
 *   Recipe        every `::: recipe` block
 *
 * @param {object} model
 * @param {{ siteUrl: string }} model.site
 * @param {import('./languages.mjs').Language} model.lang
 * @param {import('./languages.mjs').Language} model.source
 * @param {{ href: string, width: number, height: number }} model.image
 * @param {Record<string, string>} model.ui
 * @param {{ type: string, [key: string]: any }[]} model.records What the
 *   blocks recorded (`faq`, `recipe`).
 * @param {import('./history.mjs').TextDates} [model.dates]
 * @returns {object} The graph, for `jsonLd`.
 */
export function structuredData({
  site,
  lang,
  source,
  image,
  ui,
  records,
  dates,
}) {
  const home = `${site.siteUrl}/`;
  const url = `${home}${lang.code}/`;
  const ref = (id) => ({ '@id': id });
  const publisher = `${home}#publisher`;
  const picture = {
    '@type': 'ImageObject',
    url: `${home}${image.href}`,
    width: image.width,
    height: image.height,
  };
  const questions = records.filter((entry) => entry.type === 'faq');
  const recipes = records.filter((entry) => entry.type === 'recipe');
  const graph = [
    {
      '@type': 'Organization',
      '@id': publisher,
      name: lang.title,
      url: home,
      // An icon the build requires (`STATIC_ICONS` of html/head.mjs).
      logo: {
        '@type': 'ImageObject',
        url: `${home}icon-512.png`,
        width: 512,
        height: 512,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${url}#website`,
      name: lang.title,
      description: lang.description,
      url,
      inLanguage: lang.htmlLang,
      publisher: ref(publisher),
    },
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: lang.pageTitle,
      name: lang.title,
      description: lang.description,
      url,
      mainEntityOfPage: url,
      inLanguage: lang.htmlLang,
      image: picture,
      ...(dates && {
        datePublished: dates.published,
        dateModified: dates.modified,
      }),
      author: ref(publisher),
      publisher: ref(publisher),
      isPartOf: ref(`${url}#website`),
      creditText: ui.credit,
      ...(lang.code !== source.code && {
        translationOfWork: ref(`${home}${source.code}/#article`),
      }),
    },
  ];
  if (questions.length > 0)
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq-page`,
      url,
      inLanguage: lang.htmlLang,
      isPartOf: ref(`${url}#website`),
      mainEntity: questions.map(({ id, question, answer }) => ({
        '@type': 'Question',
        '@id': `${url}#${id}`,
        url: `${url}#${id}`,
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    });
  for (const recipe of recipes)
    graph.push({
      '@type': 'Recipe',
      '@id': `${url}#${recipe.id}`,
      name: recipe.name,
      ...(recipe.description && { description: recipe.description }),
      url: `${url}#${recipe.id}`,
      inLanguage: lang.htmlLang,
      image: picture,
      author: ref(publisher),
      ...(dates && { datePublished: dates.published }),
      ...(recipe.time && { totalTime: recipe.time }),
      recipeIngredient: recipe.ingredients,
      recipeInstructions: recipe.steps.map((text) => ({
        '@type': 'HowToStep',
        text,
      })),
    });
  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * The `<script type="application/ld+json">` that carries a graph. A browser
 * never runs such a block, so it needs no hash in the page's policy; what
 * makes it safe to inline is that it contains no `<` at all (each one is
 * written `\u003c`, which JSON reads as the same character), so nothing in
 * the text can close the element or open a comment. `checkPolicy` holds the
 * page to exactly that.
 *
 * @param {object} graph
 * @returns {string}
 */
export const jsonLd = (graph) =>
  `<script type="application/ld+json">${JSON.stringify(graph).replaceAll('<', '\\u003c')}</script>`;
