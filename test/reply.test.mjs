import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findOpenLoops } from '../src/loops.mjs';
import { planNextStep } from '../src/plan.mjs';
import { readReply, handleReply } from '../src/reply.mjs';

const fresh = () => JSON.parse(readFileSync(new URL('../data/sample-clinic.json', import.meta.url), 'utf8'));
const evalSet = JSON.parse(readFileSync(new URL('../data/replies-eval.json', import.meta.url), 'utf8'));
const ctx = { timeZone: evalSet.timeZone, now: evalSet.now, offered: evalSet.offered, free: evalSet.free };
const noModel = () => {
  throw new Error('the model must not be called for this reply');
};
const ask = (fields) => async () => ({ intent: 'ask_time', option: 0, weekday: 'none', after: -1, before: -1, ...fields });

test('digits in Arabic-Indic or with a word, and STOP, are read by rules without the model', async () => {
  assert.deepEqual(await readReply('٢', ctx, { model: noModel }), { outcome: 'book', slotId: 'a2', via: 'rules' });
  assert.equal((await readReply('رقم ٣', ctx, { model: noModel })).slotId, 'a3');
  assert.equal((await readReply(' Option 1. ', ctx, { model: noModel })).slotId, 'a1');
  assert.equal((await readReply('٠', ctx, { model: noModel })).outcome, 'decline');
  assert.equal((await readReply('إيقاف', ctx, { model: noModel })).outcome, 'stop');
  assert.equal((await readReply('7', ctx, { model: noModel })).outcome, 'handover');
});

test('a requested day and time books the earliest real free slot that fits, in the clinic time zone', async () => {
  // Thursday after 5 pm: the offered Thursday slot is at 11:00, the free one at 17:20.
  assert.equal((await readReply('Thursday after 5?', ctx, { model: ask({ weekday: 'thu', after: 17 }) })).slotId, 'b1');
  // An offered slot wins over an earlier free one when both fit.
  assert.equal((await readReply('Wednesday', ctx, { model: ask({ weekday: 'wed' }) })).slotId, 'a2');
  const none = await readReply('Sunday?', ctx, { model: ask({ weekday: 'sun' }) });
  assert.deepEqual([none.outcome, none.reason], ['handover', 'no_matching_slot']);
});

test('a model answer that is broken, out of range or not about booking hands over to a person', async () => {
  for (const model of [async () => ({ intent: 'book_now' }), async () => 'oops', async () => {
    throw new Error('timeout');
  }]) {
    assert.equal((await readReply('whenever', ctx, { model })).outcome, 'handover');
  }
  assert.equal((await readReply('the fifth', ctx, { model: async () => ({ intent: 'choose_option', option: 5, weekday: 'none', after: -1, before: -1 }) })).reason, 'option_out_of_range');
  assert.equal((await readReply('what were my results?', ctx, { model: ask({ intent: 'other' }) })).outcome, 'handover');
});

test('the model sees only the reply, today and the offered times, never the clinical reason', async () => {
  const data = fresh();
  const openLoop = findOpenLoops(data).find((l) => l.id === 'return_unbooked:v1');
  const offer = planNextStep(data, openLoop);
  let seen = null;
  const result = await handleReply(data, openLoop, offer, 'can I come Thursday?', {
    model: async (input) => {
      seen = input;
      return { intent: 'ask_time', option: 0, weekday: 'thu', after: -1, before: -1 };
    },
  });
  assert.deepEqual(Object.keys(seen).sort(), ['options', 'reply', 'today']);
  assert.doesNotMatch(JSON.stringify(seen), /wound|post-op|Sara|\+971/i);
  assert.deepEqual([result.status, result.slotId], ['booked', 's7']);
  assert.equal(data.returnVisits.find((v) => v.id === 'v1').slotId, 's7');
});

test('STOP records the opt-out and turns the loop into a call task', async () => {
  const data = fresh();
  const openLoop = findOpenLoops(data).find((l) => l.id === 'return_unbooked:v1');
  const result = await handleReply(data, openLoop, planNextStep(data, openLoop), 'STOP', { model: noModel });
  assert.deepEqual([result.outcome, result.next], ['stop', 'call_task']);
  assert.equal(data.patients.find((p) => p.id === 'p5').whatsappOptIn, false);
});
