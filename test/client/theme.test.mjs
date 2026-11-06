import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { barColour, MODES, nextMode } from '../../src/js/theme.js';

describe('nextMode', () => {
  it('goes auto, light, dark, auto', () => {
    assert.deepEqual(MODES, ['auto', 'light', 'dark']);
    assert.equal(nextMode('auto'), 'light');
    assert.equal(nextMode('light'), 'dark');
    assert.equal(nextMode('dark'), 'auto');
  });

  it('starts from the beginning for an unknown mode', () => {
    assert.equal(nextMode('sepia'), 'auto');
  });
});

describe('barColour', () => {
  const colours = { light: '#fff', dark: '#000' };

  it('keeps the page colour in auto', () => {
    assert.equal(barColour('auto', '#123', colours), '#123');
  });

  it('uses the colour of the chosen mode in both bars', () => {
    assert.equal(barColour('light', '#000', colours), '#fff');
    assert.equal(barColour('dark', '#fff', colours), '#000');
  });
});
