import test from 'node:test';
import assert from 'node:assert/strict';
import { pixiExplicit, pixiRequested } from '../../src/rendering/pixi/PixiBridge.js';

test('pixiRequested: o PixiJS é o padrão; só ?canvas desliga', () => {
  assert.equal(pixiRequested(''), true);
  assert.equal(pixiRequested('?debug'), true);
  assert.equal(pixiRequested('?pixi'), true);
  assert.equal(pixiRequested(undefined), true);
  assert.equal(pixiRequested('?canvas'), false);
  assert.equal(pixiRequested('?debug&canvas'), false);
  assert.equal(pixiRequested('?canvasx'), true);
});

test('pixiExplicit: só com ?pixi na URL', () => {
  assert.equal(pixiExplicit(''), false);
  assert.equal(pixiExplicit('?pixiano'), false);
  assert.equal(pixiExplicit('?debug&pixi'), true);
});
