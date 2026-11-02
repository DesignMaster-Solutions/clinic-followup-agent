// Open-loop detection: reads the clinic's own records and returns every follow-up
// that has started but not finished, each with an owner, a deadline and an urgency.

const HOUR = 3600e3;
const DAY = 24 * HOUR;

// How long each kind of loop may stay open before it is overdue.
export const RESULT_SLA = { critical: 4 * HOUR, abnormal: 2 * DAY, normal: 7 * DAY };
export const REFERRAL_SLA = { urgent: 2 * DAY, routine: 14 * DAY };
// A return visit enters the worklist this long before it is due.
export const RETURN_WINDOW = 14 * DAY;

const URGENCY_RANK = { urgent: 0, soon: 1, routine: 2 };

const ms = (iso) => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`invalid date: ${iso}`);
  return value;
};

function loop(kind, record, owner, deadline, now, urgency) {
  return {
    id: `${kind}:${record.id}`,
    kind,
    recordId: record.id,
    patientId: record.patientId,
    owner,
    urgency,
    deadline: new Date(deadline).toISOString(),
    overdue: now > deadline,
    status: 'open',
  };
}

function resultUrgency(flag) {
  if (flag === 'critical') return 'urgent';
  if (flag === 'abnormal') return 'soon';
  return 'routine';
}

export function byPriority(a, b) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const rank = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (rank !== 0) return rank;
  return ms(a.deadline) - ms(b.deadline);
}

export function findOpenLoops(data, now = data.now) {
  const at = ms(now);
  const loops = [];

  for (const result of data.results ?? []) {
    if (result.reviewedAt) continue;
    const sla = RESULT_SLA[result.flag] ?? RESULT_SLA.normal;
    loops.push(loop('result_unreviewed', result, result.orderedBy, ms(result.receivedAt) + sla, at, resultUrgency(result.flag)));
  }

  for (const referral of data.referrals ?? []) {
    if (referral.acceptedAt || referral.planDocumentedAt) continue;
    const sla = REFERRAL_SLA[referral.urgency] ?? REFERRAL_SLA.routine;
    const urgency = referral.urgency === 'urgent' ? 'urgent' : 'routine';
    loops.push(loop('referral_unaccepted', referral, referral.referredBy, ms(referral.sentAt) + sla, at, urgency));
  }

  for (const visit of data.returnVisits ?? []) {
    if (visit.bookedAt || visit.planDocumentedAt) continue;
    const due = ms(visit.dueBy);
    if (due - at > RETURN_WINDOW) continue;
    loops.push(loop('return_unbooked', visit, 'front-desk', due, at, 'routine'));
  }

  return loops.sort(byPriority);
}

// Evidence that may close each kind of loop. Nothing closes on a timer or a guess.
const CLOSING_EVIDENCE = {
  result_unreviewed: ['review_signed'],
  referral_unaccepted: ['referral_accepted', 'plan_documented'],
  return_unbooked: ['booking', 'plan_documented'],
};

export function closeLoop(openLoop, evidence) {
  if (!evidence?.kind || !evidence?.at) {
    throw new Error(`${openLoop.id} cannot close without evidence (a booked visit or a documented plan)`);
  }
  if (!CLOSING_EVIDENCE[openLoop.kind].includes(evidence.kind)) {
    throw new Error(`${openLoop.id} cannot close with evidence "${evidence.kind}"`);
  }
  return { ...openLoop, status: 'closed', closedAt: evidence.at, evidence };
}
