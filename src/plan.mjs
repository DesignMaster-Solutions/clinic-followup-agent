// Next-step planning for each open loop. The planner never sends anything clinical:
// results go to a clinician first, and patient messages only carry scheduling text.

const DAY = 24 * 3600e3;
const MAX_OFFERED_SLOTS = 3;
const PAST_DUE_SEARCH = 14 * DAY;

const byId = (list, id) => (list ?? []).find((item) => item.id === id);

export function freeSlots(data, clinicianId, fromMs, untilMs) {
  return (data.calendar?.slots ?? [])
    .filter((slot) => slot.clinicianId === clinicianId && !slot.booked)
    .filter((slot) => {
      const start = Date.parse(slot.start);
      return start > fromMs && start <= untilMs;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

function formatSlot(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

// Scheduling text only: no test names, no reason for the visit, no diagnosis.
export function draftSlotOffer(data, patient, clinician, slots) {
  const lines = slots.map((slot, i) => `${i + 1}) ${formatSlot(slot.start, data.clinic.timezone)}`);
  return [
    `Hello ${patient.firstName}, this is ${data.clinic.name}.`,
    `It is time to book your follow-up visit with ${clinician.name}. Reply with the number of the time that suits you:`,
    ...lines,
    'Reply 0 if none of these work and we will call you.',
  ].join('\n');
}

export function planNextStep(data, openLoop, now = data.now) {
  const at = Date.parse(now);
  const lead = data.clinic.lead;

  if (openLoop.kind === 'result_unreviewed') {
    const result = byId(data.results, openLoop.recordId);
    return {
      loopId: openLoop.id,
      action: openLoop.overdue ? 'escalate' : 'request_review',
      to: openLoop.overdue ? lead : openLoop.owner,
      deadline: openLoop.deadline,
      task: `Review ${result.test} (${result.flag}) for patient ${openLoop.patientId}. No patient message goes out before a clinician signs off.`,
      patientMessage: null,
    };
  }

  if (openLoop.kind === 'referral_unaccepted') {
    const referral = byId(data.referrals, openLoop.recordId);
    return {
      loopId: openLoop.id,
      action: openLoop.overdue ? 'escalate' : 'chase_referral',
      to: openLoop.overdue ? lead : openLoop.owner,
      deadline: openLoop.deadline,
      task: `Referral to ${referral.to} for patient ${openLoop.patientId} is not accepted yet.`,
      patientMessage: null,
    };
  }

  if (openLoop.kind === 'return_unbooked') {
    const visit = byId(data.returnVisits, openLoop.recordId);
    const patient = byId(data.patients, visit.patientId);
    const clinician = byId(data.clinic.clinicians, visit.clinicianId);
    const due = Date.parse(visit.dueBy);
    const until = openLoop.overdue ? at + PAST_DUE_SEARCH : due;
    const slots = freeSlots(data, visit.clinicianId, at, until).slice(0, MAX_OFFERED_SLOTS);

    if (slots.length === 0) {
      const [earliest] = freeSlots(data, visit.clinicianId, at, Number.POSITIVE_INFINITY);
      return {
        loopId: openLoop.id,
        action: 'escalate',
        to: lead,
        reason: 'no_capacity_before_due',
        earliestSlot: earliest?.id ?? null,
        deadline: openLoop.deadline,
        patientMessage: null,
      };
    }

    if (!patient.whatsappOptIn) {
      return {
        loopId: openLoop.id,
        action: 'call_task',
        to: 'front-desk',
        slots: slots.map((slot) => slot.id),
        deadline: openLoop.deadline,
        patientMessage: null,
      };
    }

    return {
      loopId: openLoop.id,
      action: 'offer_slots',
      channel: 'whatsapp',
      to: patient.id,
      slots: slots.map((slot) => slot.id),
      deadline: openLoop.deadline,
      patientMessage: draftSlotOffer(data, patient, clinician, slots),
    };
  }

  throw new Error(`unknown loop kind: ${openLoop.kind}`);
}

// Applies the patient's reply to a slot offer. Mutates the in-memory records the
// same way the clinic system would: the slot is taken and the visit is booked.
export function bookFromReply(data, openLoop, offer, replyText, now = data.now) {
  const choice = Number(String(replyText).trim());
  if (!Number.isInteger(choice) || choice < 0 || choice > offer.slots.length) {
    return { status: 'unclear', next: 'ask_again' };
  }
  if (choice === 0) return { status: 'declined', next: 'call_task' };

  const slot = byId(data.calendar.slots, offer.slots[choice - 1]);
  if (slot.booked) return { status: 'taken', next: 'offer_again' };

  slot.booked = true;
  slot.patientId = openLoop.patientId;
  const visit = byId(data.returnVisits, openLoop.recordId);
  visit.bookedAt = now;
  visit.slotId = slot.id;
  return { status: 'booked', slotId: slot.id, evidence: { kind: 'booking', slotId: slot.id, at: now } };
}
