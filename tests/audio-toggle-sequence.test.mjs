import assert from "node:assert/strict";
import { createAudioToggleSequence } from "../js/storage.js";

const sequence = createAudioToggleSequence();
for (let count = 0; count < 19; count += 1) sequence.recordToggle();
assert.equal(sequence.consumeNewGame(), 0, "必要回数に届かない切替では値を渡さない");

for (let count = 0; count < 20; count += 1) sequence.recordToggle();
assert.equal(sequence.consumeNewGame(), 10, "必要回数の切替後は新規ゲーム用の値を渡す");
assert.equal(sequence.consumeNewGame(), 0, "使用後は値を再利用しない");

for (let count = 0; count < 23; count += 1) sequence.recordToggle();
assert.equal(sequence.consumeNewGame(), 10, "必要回数を超えた切替も有効にする");

for (let count = 0; count < 20; count += 1) sequence.recordToggle();
sequence.reset();
assert.equal(sequence.consumeNewGame(), 0, "通常操作によるリセット後は値を渡さない");

console.log("audio-toggle-sequence.test: ok");
