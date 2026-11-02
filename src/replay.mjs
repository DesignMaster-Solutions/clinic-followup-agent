// A synthetic month of a small clinic replayed hour by hour, once with the agent in charge and once
// without it, through the same engine the tests cover. How people behave (clinicians, patients, the
// front desk) is an assumption of the simulation: every number lives in ASSUMPTIONS and is printed
// with the result. Deterministic for a given seed.
import { closeLoop, findOpenLoops } from './loops.mjs';
import { bookSlot, freeSlots, planNextStep } from './plan.mjs';
import { handleConfirmation, handleReply } from './reply.mjs';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const ASSUMPTIONS = {
  seed: 1,
  start: '2026-11-01T00:00:00+04:00',
  days: 30,
  utcOffsetHours: 4, // Asia/Dubai, no daylight saving
  clinic: { clinicians: ['dr-haddad', 'dr-saleh', 'dr-nasser'], lead: 'dr-haddad', workdays: [1, 2, 3, 4, 5, 6], open: 8, close: 18, slotMinutes: 20, prebooked: 0.75 },
  patients: 400,
  whatsappOptIn: 0.8,
  sendWindow: [8, 21], // local hours in which the agent may message a patient
  perWorkday: { results: 12, referrals: 2, returnVisits: 6 },
  resultFlags: { critical: 0.03, abnormal: 0.27, normal: 0.7 },
  urgentReferral: 0.2,
  returnDueDays: [3, 21],
  withAgent: {
    reviewAfterRequestHours: { critical: [0.5, 3], abnormal: [2, 24], normal: [4, 72] },
    reviewAfterEscalationHours: [0.5, 4],
    referralAcceptedAfterChase: { p: 0.8, days: [1, 5] },
    planAfterEscalationHours: [4, 48],
    patientReplies: { p: 0.7, hours: [0.2, 12] },
    replyKind: { number: 0.6, freeText: 0.25, noneWork: 0.1, stop: 0.05 },
    freeTextReadRight: 0.9, // first-read accuracy of the reply reader on free text; replace with the held-out number
    confirmAfterHours: [0.1, 6],
    reminderAfterHours: 24,
    callAfterNoReplyHours: 48,
    frontDeskCall: { booked: 0.7, hours: [2, 24] },
  },
  withoutAgent: {
    reviewHours: { critical: [2, 24], abnormal: [24, 120], normal: [48, 240] },
    neverReviewed: 0.1,
    referralAccepted: { p: 0.6, days: [2, 20] },
    patientSelfBooks: 0.5,
  },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function replay(withAgent, A = ASSUMPTIONS) {
  // Two streams: the clinic's month is the same in both runs; only people's behaviour differs.
  const world = rng(A.seed);
  const rand = rng(A.seed + 7919);
  const pick = (weights, stream = rand) => {
    let r = stream();
    for (const [key, w] of Object.entries(weights)) if ((r -= w) < 0) return key;
    return Object.keys(weights).at(-1);
  };
  const between = ([lo, hi], stream = rand) => lo + stream() * (hi - lo);
  const start = Date.parse(A.start);
  const end = start + A.days * DAY;
  const local = (t) => new Date(t + A.utcOffsetHours * HOUR);
  const iso = (t) => new Date(t).toISOString();
  const C = A.clinic;

  const data = {
    now: A.start,
    clinic: { name: 'Synthetic family clinic', timezone: 'Asia/Dubai', lead: C.lead, clinicians: C.clinicians.map((id) => ({ id, name: `Dr. ${id[3].toUpperCase()}${id.slice(4)}` })) },
    patients: Array.from({ length: A.patients }, (_, i) => ({ id: `p${i}`, firstName: `Patient ${i}`, whatsappOptIn: world() < A.whatsappOptIn })),
    results: [],
    referrals: [],
    returnVisits: [],
    calendar: { slots: [] },
  };
  for (let d = 0; d < A.days + 30; d += 1) {
    const day = start + d * DAY;
    if (!C.workdays.includes(local(day).getUTCDay())) continue;
    for (const clinicianId of C.clinicians) {
      for (let m = C.open * 60; m < C.close * 60; m += C.slotMinutes) {
        const at = day + m * 60e3;
        data.calendar.slots.push({ id: `s${data.calendar.slots.length}`, clinicianId, start: iso(at), booked: world() < C.prebooked });
      }
    }
  }

  const events = []; // { at, run }
  const later = (at, run) => { // keeps the queue sorted by time
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].at <= at) lo = mid + 1;
      else hi = mid;
    }
    events.splice(lo, 0, { at, run });
  };
  const patient = () => data.patients[Math.floor(world() * data.patients.length)];
  const clinician = () => C.clinicians[Math.floor(world() * C.clinicians.length)];
  const track = new Map(); // loopId -> { kind, urgency, openedAt, deadline, closedAt, evidence, escalated }
  const busy = new Map(); // loopId -> what the loop is waiting for
  const log = []; // the timeline of every loop, for the dashboard and the demo video
  const note = (at, loopId, type, text = '') => log.push({ at: iso(at), loopId, type, text });
  const stats = { offeredAgain: 0, replies: {}, replyOutcomes: {}, patientMessages: 0, messagesOutsideWindow: 0, messagesWithoutConsent: 0, frontDeskCalls: 0, confirmations: 0, wrongBookingsKept: 0, bookings: { rules: 0, confirmed: 0, frontDesk: 0, self: 0 } };

  const close = (openLoop, evidence) => {
    const row = track.get(openLoop.id);
    if (row.closedAt) return;
    const closed = closeLoop(openLoop, evidence); // throws on the wrong kind of evidence
    row.closedAt = Date.parse(closed.closedAt);
    row.evidence = evidence.kind;
    busy.delete(openLoop.id);
    note(row.closedAt, openLoop.id, 'closed', evidence.kind);
  };
  const loopById = (id, at) => findOpenLoops(data, iso(at)).find((l) => l.id === id);
  // initiated = the agent starts the conversation (offer, reminder); a reply to the patient is not.
  const send = (p, at, initiated = true) => {
    stats.patientMessages += 1;
    const h = local(at).getUTCHours();
    if (initiated && (h < A.sendWindow[0] || h >= A.sendWindow[1])) stats.messagesOutsideWindow += 1;
    if (!p.whatsappOptIn) stats.messagesWithoutConsent += 1;
  };

  const ids = { r: 0, f: 0, v: 0 }; // assigned when a record is scheduled, before it exists
  function newRecords(day) {
    const hourOf = () => day + (C.open + world() * (C.close - C.open)) * HOUR;
    for (let i = 0; i < A.perWorkday.results; i += 1) {
      const at = hourOf();
      const r = { id: `r${ids.r++}`, patientId: patient().id, test: 'synthetic test', flag: pick(A.resultFlags, world), orderedBy: clinician(), receivedAt: iso(at), reviewedAt: null };
      later(at, () => data.results.push(r));
      if (!withAgent && rand() >= A.withoutAgent.neverReviewed) later(at + between(A.withoutAgent.reviewHours[r.flag]) * HOUR, (t) => { r.reviewedAt = iso(t); });
    }
    for (let i = 0; i < A.perWorkday.referrals; i += 1) {
      const at = hourOf();
      const f = { id: `f${ids.f++}`, patientId: patient().id, to: 'Specialist (synthetic)', urgency: world() < A.urgentReferral ? 'urgent' : 'routine', referredBy: clinician(), sentAt: iso(at), acceptedAt: null };
      later(at, () => data.referrals.push(f));
      if (!withAgent && rand() < A.withoutAgent.referralAccepted.p) later(at + between(A.withoutAgent.referralAccepted.days) * DAY, (t) => { f.acceptedAt = iso(t); });
    }
    for (let i = 0; i < A.perWorkday.returnVisits; i += 1) {
      const at = hourOf();
      const v = { id: `v${ids.v++}`, patientId: patient().id, clinicianId: clinician(), reason: 'synthetic follow-up', dueBy: iso(at + between(A.returnDueDays, world) * DAY), bookedAt: null };
      later(at, () => data.returnVisits.push(v));
      if (!withAgent && rand() < A.withoutAgent.patientSelfBooks) {
        later(at + rand() * (Date.parse(v.dueBy) - at), (t) => {
          const [slot] = freeSlots(data, v.clinicianId, t, Date.parse(v.dueBy));
          if (slot) {
            const openLoop = loopById(`return_unbooked:${v.id}`, t) ?? { id: `return_unbooked:${v.id}`, recordId: v.id, patientId: v.patientId };
            if (bookSlot(data, openLoop, slot.id, iso(t)).status === 'booked') stats.bookings.self += 1;
          }
        });
      }
    }
  }

  // People's answers in the agent world. Each one acts on the record; the loop closes on the next tick.
  const W = A.withAgent;
  function reviewLater(openLoop, hours) {
    const r = data.results.find((x) => x.id === openLoop.recordId);
    later(Date.parse(data.now) + hours * HOUR, (t) => { if (!r.reviewedAt) r.reviewedAt = iso(t); });
  }
  function frontDeskCall(openLoop, at) {
    stats.frontDeskCalls += 1;
    note(at, openLoop.id, 'call_task', 'front desk calls the patient');
    busy.set(openLoop.id, 'call');
    later(at + between(W.frontDeskCall.hours) * HOUR, (t) => {
      const v = data.returnVisits.find((x) => x.id === openLoop.recordId);
      busy.delete(openLoop.id);
      if (v.bookedAt || v.planDocumentedAt) return;
      if (rand() < W.frontDeskCall.booked) {
        const [slot] = freeSlots(data, v.clinicianId, t + 2 * HOUR, Math.max(Date.parse(v.dueBy), t + 14 * DAY)); // a call can book later today
        if (slot && bookSlot(data, openLoop, slot.id, iso(t)).status === 'booked') {
          stats.bookings.frontDesk += 1;
          note(t, openLoop.id, 'booked', `by phone: ${slot.start}`);
          return;
        }
      }
      v.planDocumentedAt = iso(t); // patient reached but declined, or not reachable: the plan is written down
      note(t, openLoop.id, 'plan_documented', 'patient declined or not reachable');
    });
  }
  function patientAnswers(openLoop, offer, at) {
    const p = data.patients.find((x) => x.id === openLoop.patientId);
    if (rand() >= W.patientReplies.p) {
      later(at + W.reminderAfterHours * HOUR, (t) => {
        if (busy.get(openLoop.id) !== 'offer' || !inWindow(t)) return;
        send(p, t);
        note(t, openLoop.id, 'reminder_sent', 'A reminder: reply with the number of the time that suits you, or 0 and we will call you.');
      });
      later(at + W.callAfterNoReplyHours * HOUR, (t) => { if (busy.get(openLoop.id) === 'offer') frontDeskCall(openLoop, t); });
      return;
    }
    later(at + between(W.patientReplies.hours) * HOUR, async (t) => {
      const kind = pick(W.replyKind);
      stats.replies[kind] = (stats.replies[kind] ?? 0) + 1;
      const option = 1 + Math.floor(rand() * offer.slots.length);
      const wanted = data.calendar.slots.find((s) => s.id === offer.slots[option - 1]);
      const day = WEEKDAYS[local(Date.parse(wanted.start)).getUTCDay()];
      const hour = local(Date.parse(wanted.start)).getUTCHours();
      const readRight = rand() < W.freeTextReadRight;
      const text = { number: String(option), freeText: `can I come ${day} at ${hour}?`, noneWork: 'none of these work', stop: 'STOP' }[kind];
      // Stand-in for the language model, right as often as the measured reader is.
      const model = async () => ({ intent: kind === 'noneWork' ? 'none_work' : kind === 'stop' ? 'stop' : 'ask_time', option: 0, day: 0, weekday: readRight ? day : WEEKDAYS[(WEEKDAYS.indexOf(day) + 1) % 7], after: hour, before: hour + 1 });
      note(t, openLoop.id, 'patient_reply', text);
      const result = await handleReply(data, openLoop, offer, text, { model, now: iso(t) });
      const key = `${kind}:${result.status ?? result.outcome}:${result.reason ?? ''}`;
      stats.replyOutcomes[key] = (stats.replyOutcomes[key] ?? 0) + 1;
      if (result.status === 'booked') {
        stats.bookings.rules += 1;
        busy.delete(openLoop.id);
        note(t, openLoop.id, 'booked', data.calendar.slots.find((s) => s.id === result.slotId).start);
      } else if (result.status === 'taken') {
        stats.offeredAgain += 1; // someone took that time first: the next tick offers new times
        busy.delete(openLoop.id);
      } else if (result.status === 'held') {
        stats.confirmations += 1;
        send(p, t, false);
        note(t, openLoop.id, 'confirmation_sent', result.patientMessage);
        const proposed = data.calendar.slots.find((s) => s.id === result.slotId);
        const accepts = local(Date.parse(proposed.start)).getUTCDay() === WEEKDAYS.indexOf(day) && local(Date.parse(proposed.start)).getUTCHours() === hour;
        later(t + between(W.confirmAfterHours) * HOUR, (t2) => {
          const answer = accepts ? 'yes' : 'no, I asked for another day';
          note(t2, openLoop.id, 'patient_reply', answer);
          const done = handleConfirmation(data, openLoop, result, answer, { now: iso(t2) });
          if (done.status === 'booked') {
            stats.bookings.confirmed += 1;
            note(t2, openLoop.id, 'booked', proposed.start);
            if (!accepts) stats.wrongBookingsKept += 1;
            busy.delete(openLoop.id);
          } else frontDeskCall(openLoop, t2);
        });
      } else frontDeskCall(openLoop, t);
    });
  }
  const inWindow = (t) => {
    const h = local(t).getUTCHours();
    return h >= A.sendWindow[0] && h < A.sendWindow[1];
  };

  function agentTick(t) {
    for (const openLoop of findOpenLoops(data, iso(t))) {
      const row = track.get(openLoop.id);
      // A loop waiting on someone is left alone, except a result or referral that just went overdue: that escalates.
      const escalateNow = openLoop.overdue && !row.escalated && openLoop.kind !== 'return_unbooked';
      if (busy.has(openLoop.id) && !escalateNow) continue;
      const step = planNextStep(data, openLoop, iso(t));
      if (step.action === 'escalate') row.escalated = true;
      if (step.action !== 'offer_slots' && step.action !== 'call_task') note(t, openLoop.id, step.action, step.task ?? step.reason ?? `to ${step.to}`);
      if (openLoop.kind === 'result_unreviewed') {
        const flag = data.results.find((x) => x.id === openLoop.recordId).flag;
        reviewLater(openLoop, step.action === 'escalate' ? between(W.reviewAfterEscalationHours) : between(W.reviewAfterRequestHours[flag]));
        busy.set(openLoop.id, step.action);
      } else if (openLoop.kind === 'referral_unaccepted') {
        const f = data.referrals.find((x) => x.id === openLoop.recordId);
        if (step.action === 'escalate') later(t + between(W.planAfterEscalationHours) * HOUR, (t2) => { if (!f.acceptedAt) f.planDocumentedAt = iso(t2); });
        else if (rand() < W.referralAcceptedAfterChase.p) later(t + between(W.referralAcceptedAfterChase.days) * DAY, (t2) => { if (!f.acceptedAt && !f.planDocumentedAt) f.acceptedAt = iso(t2); });
        busy.set(openLoop.id, step.action);
      } else if (step.action === 'offer_slots') {
        if (!inWindow(t)) continue; // wait for the send window
        send(data.patients.find((x) => x.id === openLoop.patientId), t);
        note(t, openLoop.id, 'offer_sent', step.patientMessage);
        busy.set(openLoop.id, 'offer');
        patientAnswers(openLoop, step, t);
      } else if (step.action === 'call_task') frontDeskCall(openLoop, t);
      else if (step.action === 'escalate') {
        const v = data.returnVisits.find((x) => x.id === openLoop.recordId);
        busy.set(openLoop.id, 'escalate');
        later(t + between(W.planAfterEscalationHours) * HOUR, (t2) => { if (!v.bookedAt) v.planDocumentedAt = iso(t2); busy.delete(openLoop.id); });
      }
    }
  }

  return (async () => {
    for (let d = 0; d < A.days; d += 1) if (C.workdays.includes(local(start + d * DAY).getUTCDay())) newRecords(start + d * DAY);
    for (let t = start; t < end; t += HOUR) {
      data.now = iso(t);
      while (events.length && events[0].at <= t) {
        const due = events.shift();
        await due.run(due.at);
      }
      const open = findOpenLoops(data, iso(t));
      for (const openLoop of open) {
        if (track.has(openLoop.id)) continue;
        track.set(openLoop.id, { kind: openLoop.kind, urgency: openLoop.urgency, owner: openLoop.owner, patientId: openLoop.patientId, openedAt: t, deadline: Date.parse(openLoop.deadline), closedAt: null, evidence: null, escalated: false });
        note(t, openLoop.id, 'opened', `${openLoop.urgency}, owner ${openLoop.owner}, due ${openLoop.deadline}`);
      }
      const openIds = new Set(open.map((l) => l.id));
      for (const [id, row] of track) {
        if (row.closedAt || openIds.has(id)) continue;
        close({ id, kind: row.kind }, { kind: evidenceFor(data, id), at: iso(t) });
      }
      if (withAgent) agentTick(t);
    }
    // Two visits on one slot, or a visit on a slot that belongs to someone else, is a double booking.
    const booked = data.returnVisits.filter((v) => v.slotId);
    const doubleBooked = booked.length - new Set(booked.map((v) => v.slotId)).size
      + booked.filter((v) => data.calendar.slots.find((s) => s.id === v.slotId).patientId !== v.patientId).length;
    return { track, stats: { ...stats, doubleBooked }, data, log };
  })();
}

function evidenceFor(data, loopId) {
  const [kind, id] = loopId.split(':');
  if (kind === 'result_unreviewed') return 'review_signed';
  const record = (kind === 'referral_unaccepted' ? data.referrals : data.returnVisits).find((x) => x.id === id);
  if (record.planDocumentedAt) return 'plan_documented';
  return kind === 'referral_unaccepted' ? 'referral_accepted' : 'booking';
}

export function summarize({ track, stats }) {
  const rows = [...track.values()];
  const closed = rows.filter((r) => r.closedAt);
  const hours = (list) => list.map((r) => (r.closedAt - r.openedAt) / HOUR).sort((a, b) => a - b);
  const median = (list) => (list.length ? list[Math.floor(list.length / 2)] : null);
  const byKind = (kind, urgency) => rows.filter((r) => r.kind === kind && (!urgency || r.urgency === urgency));
  const late = rows.filter((r) => (r.closedAt ?? Infinity) > r.deadline).length;
  return {
    loops: rows.length,
    closed: closed.length,
    open: rows.length - closed.length,
    closedLateOrOpen: late,
    escalated: rows.filter((r) => r.escalated).length,
    medianHoursToClose: {
      criticalResult: median(hours(byKind('result_unreviewed', 'urgent').filter((r) => r.closedAt))),
      result: median(hours(byKind('result_unreviewed').filter((r) => r.closedAt))),
      referral: median(hours(byKind('referral_unaccepted').filter((r) => r.closedAt))),
      returnVisit: median(hours(byKind('return_unbooked').filter((r) => r.closedAt))),
    },
    returnVisitsBooked: byKind('return_unbooked').filter((r) => r.evidence === 'booking').length,
    returnVisits: byKind('return_unbooked').length,
    criticalLate: byKind('result_unreviewed', 'urgent').filter((r) => (r.closedAt ?? Infinity) > r.deadline).length,
    critical: byKind('result_unreviewed', 'urgent').length,
    ...stats,
  };
}
