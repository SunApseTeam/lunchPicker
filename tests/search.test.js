import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, searchMenus } from '../src/domain/search.js';

const names = ['김치찌개', '돈까스', '국밥', '짜장면', '쌀국수', '버거', '초밥', '샐러드', '닭갈비', '순두부찌개', 'Subway 샌드위치'];
const menus = names.map((name, i) => ({ id: String(i), name }));
const find = (q) => searchMenus(menus, q).map((m) => m.name);

test('plain text matches anywhere, ignoring case and spaces', () => {
  assert.deepEqual(find('찌개'), ['김치찌개', '순두부찌개']);
  assert.deepEqual(find('subway'), ['Subway 샌드위치']);
  assert.deepEqual(find('샌 드 위'), ['Subway 샌드위치']);
});

test('initials find a menu', () => {
  assert.deepEqual(find('ㄱㅊㅉㄱ'), ['김치찌개']);
  assert.deepEqual(find('ㅉㄱ'), ['김치찌개', '순두부찌개']);
  assert.deepEqual(find('ㄷㄱㅂ'), ['닭갈비']);
});

test('a syllable still being composed already matches', () => {
  assert.deepEqual(find('김ㅊ'), ['김치찌개']);
  assert.deepEqual(find('짜자'), ['짜장면']);
  assert.deepEqual(find('국바'), ['국밥']);
  assert.deepEqual(find('달'), ['닭갈비']);
});

test('Korean short forms match syllables in order', () => {
  assert.deepEqual(find('김찌'), ['김치찌개']);
  assert.deepEqual(find('순찌'), ['순두부찌개']);
});

test('typing with the Korean IME off still finds the menu', () => {
  assert.deepEqual(find('rlacl'), ['김치찌개']);
  assert.deepEqual(find('ekfrrkfql'), ['닭갈비']);
});

test('closer matches rank first', () => {
  const list = [{ id: 'a', name: '국밥집 백반' }, { id: 'b', name: '국밥' }, { id: 'c', name: '순대국밥' }];
  assert.deepEqual(searchMenus(list, '국밥').map((m) => m.id), ['b', 'a', 'c']);
  assert.equal(matchScore('김치찌개', '피자'), null);
  assert.equal(searchMenus(menus, '').length, menus.length);
});
