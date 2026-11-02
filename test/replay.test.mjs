import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSUMPTIONS, replay, summarize } from '../src/replay.mjs';

const month = async (withAgent, seed) => summarize(await replay(withAgent, { ...ASSUMPTIONS, seed }));

test('the synthetic month is the same for a given seed', async () => {
  assert.deepEqual(await month(true, 3), await month(true, 3));
});

test('with the agent: no wrong booking kept, no double booking, no message without consent or outside the window', async () => {
  for (const seed of [1, 2, 3]) {
    const s = await month(true, seed);
    assert.equal(s.wrongBookingsKept, 0, `seed ${seed}`);
    assert.equal(s.doubleBooked, 0, `seed ${seed}`);
    assert.equal(s.messagesWithoutConsent, 0, `seed ${seed}`);
    assert.equal(s.messagesOutsideWindow, 0, `seed ${seed}`);
    assert.ok(s.patientMessages > 0 && s.confirmations > 0 && s.frontDeskCalls > 0, `seed ${seed} exercised every path`);
  }
});

test('every loop closes only with the evidence its kind allows (closeLoop throws otherwise)', async () => {
  const { track } = await replay(true, { ...ASSUMPTIONS, seed: 2 });
  const allowed = { result_unreviewed: ['review_signed'], referral_unaccepted: ['referral_accepted', 'plan_documented'], return_unbooked: ['booking', 'plan_documented'] };
  for (const row of track.values()) if (row.closedAt) assert.ok(allowed[row.kind].includes(row.evidence), row.kind);
});
