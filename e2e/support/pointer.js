// A click the way a reader makes it. Playwright's own `locator.click()` first
// scrolls the element into view, which moves a page that is being read (the
// header is sticky, but the scroll happens anyway); a test about where the
// reader is, or about what happens to the scroll position, needs the mouse
// to go where the element already is.

/**
 * Clicks the middle of an element that is on screen, with the mouse, without
 * scrolling.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
export async function press(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('press: the element has no box (it is not shown)');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Opens a page of the guide and waits until its scripts have wired it up (the
 * FAQ, the last to be wired but one, marks <html> `faq-ready`): a test that
 * presses a key or a button at once would otherwise beat the script, which
 * loads its modules one by one. A page without scripts (no `js` class: the
 * root page, the 404 page, a browser with scripts off) is not waited for.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
export async function visit(page, url) {
  const response = await page.goto(url);
  const scripted = await page.evaluate(() =>
    document.documentElement.classList.contains('js'),
  );
  if (scripted)
    await page
      .locator('html.faq-ready')
      .waitFor({ state: 'attached', timeout: 5000 });
  return response;
}
