import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const mobileStart = css.lastIndexOf('@media(max-width:768px){', css.indexOf('html:has(.mobile-dashboard)'));
const narrowStart = css.indexOf('@media(max-width:380px){', mobileStart);
const mobileCss = css.slice(mobileStart, narrowStart);

test('mobile dashboard uses document scrolling instead of a fixed viewport shell', () => {
  assert.ok(mobileStart >= 0, 'mobile dashboard media query must exist');
  assert.match(mobileCss, /html:has\(\.mobile-dashboard\),body:has\(\.mobile-dashboard\)\{height:auto;[^}]*overflow-y:visible\}/);
  assert.match(mobileCss, /#home\{height:auto;[^}]*overflow:visible\}/);
  assert.match(mobileCss, /\.mobile-dashboard-panel\{[^}]*overflow:visible;/);
  assert.doesNotMatch(mobileCss, /\.mobile-dashboard-panel\{[^}]*overflow-y:auto/);
});

test('mobile character cards are a readable single column with visible details', () => {
  assert.match(mobileCss, /\.mobile-character-section \.character-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(mobileCss, /\.mobile-character-section \.character-image-wrap\{[^}]*aspect-ratio:4\/3/);
  assert.match(mobileCss, /\.mobile-character-section \.character-card-body h3\{[^}]*font-size:18px/);
  assert.match(mobileCss, /\.mobile-character-section \.character-card-body p\{display:block;[^}]*font-size:14px/);
});

test('mobile summary and navigation preserve readable type and safe touch targets', () => {
  assert.match(mobileCss, /\.mobile-dashboard-summary \.fortune-copy p\{[^}]*font-size:14px/);
  assert.match(mobileCss, /\.mobile-dashboard-summary \.anniversary-card dt\{[^}]*font-size:13px/);
  assert.match(mobileCss, /\.mobile-dashboard-summary \.anniversary-card dd\{[^}]*font-size:16px/);
  assert.match(mobileCss, /\.mobile-dashboard\{[^}]*padding-bottom:calc\(81px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /\.mobile-dashboard-tabs\{position:fixed;[^}]*bottom:0/);
  assert.match(mobileCss, /\.mobile-dashboard-tabs button\{[^}]*min-height:56px;[^}]*color:#b3bdcc/);
  assert.match(mobileCss, /\.mobile-dashboard-tabs button b\{font-size:14px/);
});
