import test from 'node:test';
import assert from 'node:assert/strict';
import { pixiRequested } from '../../src/rendering/pixi/PixiBridge.js';

test('pixiRequested: só liga com ?pixi na URL', () => {
  assert.equal(pixiRequested(''), false);
  assert.equal(pixiRequested('?debug'), false);
  assert.equal(pixiRequested('?pixiano'), false);
  assert.equal(pixiRequested('?pixi'), true);
  assert.equal(pixiRequested('?debug&pixi'), true);
  assert.equal(pixiRequested(undefined), false);
});
