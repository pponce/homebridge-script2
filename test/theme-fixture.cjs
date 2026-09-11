'use strict';
const assert = require('node:assert/strict');

// Representative Bootstrap defaults and Homebridge iframe theme rules. These
// arrive AFTER plugin CSS, just as Homebridge mirrors its styles into the iframe.
// Source: homebridge-config-ui-x ui/src/scss/themes/themes-{dark,light}.scss
const hostStyles = `
:root { --bs-body-color:#212529; --bs-border-color:#dee2e6; }
body { color:#212529; background:#fff; font-family:Arial,sans-serif; }
body.dark-mode, body[class*="config-ui-x-dark-mode"] { color:#fff; background:#242424; }
.form-control, .form-select { color:#212529; background-color:#fff; border:1px solid #ced4da; border-radius:.25rem; padding:.375rem .75rem; }
.form-control:disabled { color:#6c757d; background:#e9ecef; }
.form-control::placeholder { color:#636363 !important; opacity:1 !important; }
.btn { display:inline-block; padding:.375rem .75rem; border:1px solid transparent; border-radius:.25rem; }
.btn-outline-primary { color:#0d6efd; border-color:#0d6efd; background:transparent; }
.btn-outline-secondary { color:#6c757d; border-color:#6c757d; background:transparent; }
.btn-outline-danger { color:#dc3545; border-color:#dc3545; background:transparent; }
.btn-primary { color:#fff; background:#0d6efd; }
.config-ui-x-dark-mode-orange .btn-primary { background-color:#ffa000 !important; border-color:#ffa000 !important; }
.alert { color:#055160; background:#cff4fc; }
.dark-mode .alert { color:#eee; background:#2b2b2b; }
caption { color:#6c757d; }
`;

async function checkThemeContrast(page, root, screenshot) {
  await page.addStyleTag({ content: hostStyles });
  // Explicit Homebridge choice wins even when the OS preference is opposite.
  for (const [classes, osTheme, dark] of [
    ['config-ui-x-dark-mode-orange dark-mode modal-content', 'light', true],
    ['config-ui-x-dark-mode-blue modal-content', 'light', true],
    ['dark-mode modal-content', 'light', true],
    ['config-ui-x-blue modal-content', 'dark', false],
  ]) {
    await page.emulateMedia({ colorScheme: osTheme });
    await page.evaluate(value => { document.body.className = value; }, classes);
    const result = await page.evaluate(({ root, dark }) => {
      const settings = document.querySelector(root);
      const parse = color => color.match(/[\d.]+/g).map(Number);
      const blend = (top, bottom, opacity = 1) => {
        const a = (top[3] ?? 1) * opacity;
        return top.slice(0, 3).map((v, i) => v * a + bottom[i] * (1 - a));
      };
      const luminance = rgb => rgb.slice(0,3).map(v => {
        v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => {
        const x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
      };
      const failures = []; let checked = 0;
      for (const el of settings.querySelectorAll('h2,h3,label,summary,p,small,caption,th,td,a,code,.btn,input:not([type=checkbox]),select,textarea')) {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node);
        let background = [255,255,255], opacity = 1;
        for (const node of chain) {
          const style = getComputedStyle(node);
          background = blend(parse(style.backgroundColor), background);
          opacity *= Number(style.opacity);
        }
        const style = getComputedStyle(el);
        const foreground = blend(parse(style.color), background, opacity);
        const contrast = ratio(foreground, background);
        checked++;
        if (contrast < 4.5) failures.push(`${el.tagName} ${el.id || el.textContent.trim().slice(0,40)}: ${contrast.toFixed(2)}:1`);
        if (dark && el.matches('input:not([type=checkbox]),select,textarea')) {
          const border = ratio(blend(parse(style.borderTopColor), background), background);
          if (border < 3) failures.push(`${el.id} border: ${border.toFixed(2)}:1`);
          if (el.placeholder) {
            const placeholder = getComputedStyle(el, '::placeholder');
            const contrast = ratio(blend(parse(placeholder.color), background, Number(placeholder.opacity)), background);
            if (contrast < 4.5) failures.push(`${el.id} placeholder: ${contrast.toFixed(2)}:1`);
          }
        }
      }
      return { failures, checked, color: getComputedStyle(settings).color };
    }, { root, dark });
    assert.ok(result.checked >= 5, 'Contrast check must exercise rendered settings');
    assert.deepEqual(result.failures, [], classes);
    assert.equal(result.color, dark ? 'rgb(241, 241, 241)' : 'rgb(33, 37, 41)');
  }
  // Capture night-mode desktop and mobile after switching back from light mode.
  await page.evaluate(() => { document.body.className = 'config-ui-x-dark-mode-orange dark-mode modal-content'; });
  await page.emulateMedia({ colorScheme: 'light' });
  if (screenshot) await page.screenshot({ path: screenshot + '-night-desktop.png', fullPage: true });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 850 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (screenshot) await page.screenshot({ path: screenshot + '-night-mobile.png', fullPage: true });
  await page.setViewportSize(viewport);
}
module.exports = { checkThemeContrast };
