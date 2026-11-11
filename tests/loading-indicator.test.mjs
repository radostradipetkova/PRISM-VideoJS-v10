import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const player = fs.readFileSync(new URL('../src/prism-player.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const skinPlayer = fs.readFileSync(new URL('../skin/prism-player.js', import.meta.url), 'utf8');
const skinStyles = fs.readFileSync(new URL('../skin/prism-skin.css', import.meta.url), 'utf8');

test('loading indicator markup is branded and informative', () => {
  for (const source of [player, skinPlayer]) {
    assert.match(source, /PRISM \/ SIGNAL HOLD/);
    assert.match(source, /Waiting for the connection to catch up/);
    assert.match(source, /prism-buffering-card/);
    assert.match(source, /prism-buffering-bars/);
  }
});

test('loading indicator styling responds to buffering state', () => {
  for (const css of [styles, skinStyles]) {
    assert.match(css, /\.prism-skin\[data-view-state="buffering"\] \.prism-buffering/);
    assert.match(css, /\.prism-buffering-led/);
    assert.match(css, /@keyframes prism-led-pulse/);
    assert.match(css, /\.minimal-motion \.prism-buffering-bars span,\.minimal-motion \.prism-buffering-led\{animation:none!important\}/);
  }
});
