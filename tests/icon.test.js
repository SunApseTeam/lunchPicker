import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ICON, ICON_CHOICES, checkIcon, guessIcon, menuIcon } from '../src/domain/icon.js';
import { DEFAULT_MENUS } from '../src/domain/menu.js';

test('the default places get their icon from their tags', () => {
  assert.deepEqual(
    DEFAULT_MENUS.map((m) => [m.name, menuIcon(m)]),
    [['라면순두부', '🍱'], ['이도곰탕', '🍱'], ['도이', '🥡'], ['끝장', '🍜'], ['역삼라멘', '🍜'], ['노모어피자', '🍕']],
  );
});

test('the first tag with a known food wins, then the name, then the plate', () => {
  assert.equal(menuIcon({ name: '도이', tags: ['단골', '중식', '피자'] }), '🥡');
  assert.equal(menuIcon({ name: '역삼라멘', tags: ['단골'] }), '🍜');
  assert.equal(menuIcon({ name: '도이', tags: [] }), DEFAULT_ICON);
});

test('specific words win over the general words inside them', () => {
  assert.equal(guessIcon('마라탕'), '🌶️');
  assert.equal(guessIcon('탕수육'), '🥡');
  assert.equal(guessIcon('순두부찌개'), '🍲');
  assert.equal(guessIcon('Subway 샌드위치'), '🥪');
  assert.equal(guessIcon('홍길동 식당'), DEFAULT_ICON);
});

test('a picked icon overrides the guess, and only listed icons can be picked', () => {
  assert.equal(menuIcon({ name: '버거', icon: '🌮' }), '🌮');
  assert.equal(menuIcon({ name: '버거', icon: null }), '🍔');
  assert.equal(checkIcon(null), null);
  assert.equal(checkIcon(ICON_CHOICES[0]), ICON_CHOICES[0]);
  assert.throws(() => checkIcon('<b>'), /고를 수 없는/);
  assert.equal(new Set(ICON_CHOICES).size, ICON_CHOICES.length);
});
