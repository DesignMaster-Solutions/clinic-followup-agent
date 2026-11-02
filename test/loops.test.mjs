import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findOpenLoops, closeLoop } from '../src/loops.mjs';
import { planNextStep, bookFromReply } from '../src/plan.mjs';

const fresh = () => JSON.parse(readFileSync(new URL('../data/sample-clinic.json', import.meta.url), 'utf8'));
const loopOf = (data, id) => findOpenLoops(data).find((l) => l.id === id);

test('finds every open loop and skips closed or far-off records', () => {
  const ids = findOpenLoops(fresh()).map((l) => l.id).sort();
  assert.deepEqual(ids, [
    'referral_unaccepted:f1',
    'referral_unaccepted:f2',
    'result_unreviewed:r1',
    'result_unreviewed:r2',
    'return_unbooked:v1',
    'return_unbooked:v3',
    'return_unbooked:v4',
  ]);
});

test('overdue urgent loops come first, then by urgency and deadline', () => {
  const order = findOpenLoops(fresh()).map((l) => l.id);
  assert.deepEqual(order.slice(0, 3), ['referral_unaccepted:f1', 'result_unreviewed:r1', 'result_unreviewed:r2']);
  assert.equal(order.at(-1), 'referral_unaccepted:f2');
});

test('a critical result unreviewed past 4 h escalates to the clinic lead, with no patient message', () => {
  const data = fresh();
  const step = planNextStep(data, loopOf(data, 'result_unreviewed:r1'));
  assert.equal(step.action, 'escalate');
  assert.equal(step.to, 'dr-haddad');
  assert.equal(step.patientMessage, null);
});

test('an abnormal result inside its SLA goes to the ordering clinician for review', () => {
  const data = fresh();
  const step = planNextStep(data, loopOf(data, 'result_unreviewed:r2'));
  assert.equal(step.action, 'request_review');
  assert.equal(step.to, 'dr-saleh');
});

test('a return visit offers up to 3 real free slots of the right clinician before it is due', () => {
  const data = fresh();
  const step = planNextStep(data, loopOf(data, 'return_unbooked:v1'));
  assert.equal(step.action, 'offer_slots');
  assert.deepEqual(step.slots, ['s5', 's6', 's7']);
  assert.match(step.patientMessage, /^Hello Sara,/);
  assert.match(step.patientMessage, /1\) Tue 3 Nov, 16:00/);
});

test('the patient message carries scheduling text only, never the clinical reason', () => {
  const data = fresh();
  const step = planNextStep(data, loopOf(data, 'return_unbooked:v1'));
  assert.doesNotMatch(step.patientMessage, /wound|post-op/i);
});

test('a patient without WhatsApp consent becomes a call task for the front desk', () => {
  const data = fresh();
  const step = planNextStep(data, loopOf(data, 'return_unbooked:v3'));
  assert.equal(step.action, 'call_task');
  assert.deepEqual(step.slots, ['s3', 's4']);
  assert.equal(step.patientMessage, null);
});

test('no free slot before the due date escalates as a capacity problem with the earliest slot', () => {
  const data = fresh();
  const step = planNextStep(data, loopOf(data, 'return_unbooked:v4'));
  assert.equal(step.action, 'escalate');
  assert.equal(step.reason, 'no_capacity_before_due');
  assert.equal(step.earliestSlot, 's3');
});

test('a reply books the chosen slot, and the loop closes only with that booking as evidence', () => {
  const data = fresh();
  const openLoop = loopOf(data, 'return_unbooked:v1');
  const offer = planNextStep(data, openLoop);
  const booking = bookFromReply(data, openLoop, offer, ' 2 ');
  assert.equal(booking.status, 'booked');
  assert.equal(booking.slotId, 's6');
  assert.equal(data.calendar.slots.find((s) => s.id === 's6').booked, true);
  assert.equal(loopOf(data, 'return_unbooked:v1'), undefined);
  const closed = closeLoop(openLoop, booking.evidence);
  assert.equal(closed.status, 'closed');
});

test('unclear replies ask again, 0 hands over to a call, and a taken slot is offered again', () => {
  const data = fresh();
  const openLoop = loopOf(data, 'return_unbooked:v1');
  const offer = planNextStep(data, openLoop);
  assert.equal(bookFromReply(data, openLoop, offer, 'tomorrow?').status, 'unclear');
  assert.equal(bookFromReply(data, openLoop, offer, '7').status, 'unclear');
  assert.equal(bookFromReply(data, openLoop, offer, '0').next, 'call_task');
  data.calendar.slots.find((s) => s.id === 's5').booked = true;
  assert.equal(bookFromReply(data, openLoop, offer, '1').next, 'offer_again');
});

test('a loop never closes without evidence, or with evidence of the wrong kind', () => {
  const data = fresh();
  const openLoop = loopOf(data, 'result_unreviewed:r1');
  assert.throws(() => closeLoop(openLoop, null), /without evidence/);
  assert.throws(() => closeLoop(openLoop, { kind: 'booking', at: data.now }), /cannot close with evidence/);
  assert.equal(closeLoop(openLoop, { kind: 'review_signed', at: data.now, by: 'dr-haddad' }).status, 'closed');
});
