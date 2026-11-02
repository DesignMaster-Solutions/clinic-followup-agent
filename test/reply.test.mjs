import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findOpenLoops } from '../src/loops.mjs';
import { planNextStep, freeSlots } from '../src/plan.mjs';
import { readReply, handleReply, handleConfirmation } from '../src/reply.mjs';

const fresh = () => JSON.parse(readFileSync(new URL('../data/sample-clinic.json', import.meta.url), 'utf8'));
const evalSet = JSON.parse(readFileSync(new URL('../data/replies-eval.json', import.meta.url), 'utf8'));
const ctx = { timeZone: evalSet.timeZone, now: evalSet.now, offered: evalSet.offered, free: evalSet.free };
const noModel = () => {
  throw new Error('the model must not be called for this reply');
};
const ask = (fields) => async () => ({ intent: 'ask_time', option: 0, day: 0, weekday: 'none', after: -1, before: -1, ...fields });

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
  assert.equal((await readReply('the fifth', ctx, { model: async () => ({ intent: 'choose_option', option: 5, day: 0, weekday: 'none', after: -1, before: -1 }) })).reason, 'option_out_of_range');
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
      return { intent: 'ask_time', option: 0, day: 0, weekday: 'thu', after: -1, before: -1 };
    },
  });
  assert.deepEqual(Object.keys(seen).sort(), ['options', 'reply', 'today']);
  assert.doesNotMatch(JSON.stringify(seen), /wound|post-op|Sara|\+971/i);
  assert.deepEqual([result.status, result.slotId], ['held', 's7']);
});

test('STOP records the opt-out and turns the loop into a call task', async () => {
  const data = fresh();
  const openLoop = findOpenLoops(data).find((l) => l.id === 'return_unbooked:v1');
  const result = await handleReply(data, openLoop, planNextStep(data, openLoop), 'STOP', { model: noModel });
  assert.deepEqual([result.outcome, result.next], ['stop', 'call_task']);
  assert.equal(data.patients.find((p) => p.id === 'p5').whatsappOptIn, false);
});

const loopV1 = (data) => findOpenLoops(data).find((l) => l.id === 'return_unbooked:v1');
// In the sample clinic, Thursday for Dr. Saleh = offered s7 (11:00) and free s8 (11:20): the offered one wins.
const thursday = async () => ({ intent: 'ask_time', option: 0, day: 0, weekday: 'thu', after: -1, before: -1 });

test('ordinals, number words and polite filler are read by rules; anything else goes to the model', async () => {
  for (const [text, slotId] of [['ok 1', 'a1'], ['yes the second', 'a2'], ['the first one is fine', 'a1'], ['Option 3 please', 'a3'], ['نعم الثاني', 'a2'], ['الموعد الأول مناسب', 'a1'], ['اوكي الاول', 'a1']]) {
    assert.deepEqual(await readReply(text, ctx, { model: noModel }), { outcome: 'book', slotId, via: 'rules' }, text);
  }
  for (const text of ['not the first one', '1 or 2', 'first one but later', 'two, no wait, one']) {
    assert.equal((await readReply(text, ctx)).reason, 'needs_model', text);
  }
});

test('a day of the month books a slot on that date', async () => {
  const model = async () => ({ intent: 'ask_time', option: 0, day: 4, weekday: 'none', after: 18, before: -1 });
  assert.equal((await readReply('Book me for the 4th at 6pm', ctx, { model })).slotId, 'b4');
});

test('a booking that came from the model is held and confirmed before it counts', async () => {
  const data = fresh();
  const openLoop = loopV1(data);
  const offer = planNextStep(data, openLoop);
  const pending = await handleReply(data, openLoop, offer, 'can I come Thursday?', { model: thursday });
  assert.equal(pending.outcome, 'book');
  assert.equal(pending.status, 'held');
  assert.equal(pending.slotId, 's7');
  assert.match(pending.patientMessage, /Thu 5 Nov, 11:00/);
  assert.match(pending.patientMessage, /Reply 1 to confirm/);
  assert.doesNotMatch(pending.patientMessage, /wound|post-op/i);
  assert.equal(data.returnVisits.find((v) => v.id === 'v1').slotId, undefined, 'nothing is booked before the patient confirms');

  const done = handleConfirmation(data, openLoop, pending, 'نعم');
  assert.deepEqual([done.status, done.slotId, done.evidence.kind], ['booked', 's7', 'booking']);
  assert.equal(data.calendar.slots.find((s) => s.id === 's7').heldFor, undefined);
});

test('a held slot is not offered to anyone else, and a no or anything unclear releases it', async () => {
  const data = fresh();
  const openLoop = loopV1(data);
  const pending = await handleReply(data, openLoop, planNextStep(data, openLoop), 'can I come Thursday?', { model: thursday });
  assert.ok(!freeSlots(data, 'dr-saleh', Date.parse(data.now), Date.parse('2026-11-30T00:00:00+04:00')).some((s) => s.id === 's7'));

  const no = handleConfirmation(data, openLoop, pending, 'no');
  assert.deepEqual([no.status, no.next], ['released', 'call_task']);
  assert.ok(freeSlots(data, 'dr-saleh', Date.parse(data.now), Date.parse('2026-11-30T00:00:00+04:00')).some((s) => s.id === 's7'));

  const again = await handleReply(data, openLoop, planNextStep(data, openLoop), 'can I come Thursday?', { model: thursday });
  const unclear = handleConfirmation(data, openLoop, again, 'hmm can it be earlier');
  assert.deepEqual([unclear.status, unclear.next], ['released', 'front_desk_reads']);
});

test('a hold expires: after it, the confirmation cannot book a slot someone else took', async () => {
  const data = fresh();
  const openLoop = loopV1(data);
  const pending = await handleReply(data, openLoop, planNextStep(data, openLoop), 'can I come Thursday?', { model: thursday });
  const later = new Date(Date.parse(pending.heldUntil) + 60e3).toISOString();
  data.calendar.slots.find((s) => s.id === 's7').booked = true; // taken by someone else after the hold ran out
  assert.equal(handleConfirmation(data, openLoop, pending, 'yes', { now: later }).next, 'offer_again');
});

test('an option that contradicts the time asked for is read as that time, and a named weekday beats a stray date', async () => {
  const pick2at6pm = async () => ({ intent: 'choose_option', option: 2, day: 4, weekday: 'wed', after: 18, before: 19 });
  assert.equal((await readReply('Book me for the 4th at 6pm', ctx, { model: pick2at6pm })).slotId, 'b4');
  const tueWithStrayDate = async () => ({ intent: 'ask_time', option: 0, day: 4, weekday: 'tue', after: 16, before: 17 });
  assert.equal((await readReply('bukra 4 el 3asr', ctx, { model: tueWithStrayDate })).slotId, 'a1');
});
