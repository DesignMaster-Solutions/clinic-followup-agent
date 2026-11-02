#!/usr/bin/env node
// Prints the synthetic month with and without the agent, and the assumptions behind both.
//   node src/replay-cli.mjs [seed]
import { ASSUMPTIONS, replay, summarize } from './replay.mjs';

const A = { ...ASSUMPTIONS, seed: Number(process.argv[2] ?? ASSUMPTIONS.seed) };
const [agent, without] = [summarize(await replay(true, A)), summarize(await replay(false, A))];
const rows = [
  ['loops opened', (s) => s.loops],
  ['closed with evidence', (s) => `${s.closed} (${Math.round((100 * s.closed) / s.loops)}%)`],
  ['still open on day 30', (s) => s.open],
  ['closed late or still open', (s) => s.closedLateOrOpen],
  ['critical results past 4 h', (s) => `${s.criticalLate} of ${s.critical}`],
  ['return visits booked', (s) => `${s.returnVisitsBooked} of ${s.returnVisits}`],
  ['median hours to close: result', (s) => s.medianHoursToClose.result?.toFixed(1)],
  ['median hours to close: referral', (s) => s.medianHoursToClose.referral?.toFixed(1)],
  ['median hours to close: return', (s) => s.medianHoursToClose.returnVisit?.toFixed(1)],
  ['escalated to a person', (s) => s.escalated],
  ['patient messages', (s) => s.patientMessages],
  ['front-desk calls', (s) => s.frontDeskCalls],
  ['confirmations asked', (s) => s.confirmations],
  ['wrong bookings kept', (s) => s.wrongBookingsKept],
  ['double bookings', (s) => s.doubleBooked],
  ['messages without consent', (s) => s.messagesWithoutConsent],
  ['agent-initiated messages outside 08-21 h', (s) => s.messagesOutsideWindow],
];
console.log(`Synthetic month (seed ${A.seed}): ${A.days} days, ${A.clinic.clinicians.length} clinicians, hourly ticks`);
console.log(`${'metric'.padEnd(42)}${'with the agent'.padEnd(18)}without (assumed baseline)`);
for (const [name, get] of rows) console.log(`${name.padEnd(42)}${String(get(agent)).padEnd(18)}${get(without)}`);
console.log(`bookings with the agent: ${JSON.stringify(agent.bookings)}; without: ${JSON.stringify(without.bookings)}`);
// The reply rate has the widest published range, so the result is shown across it, not at one point.
const atRate = async (p) => summarize(await replay(true, { ...A, withAgent: { ...A.withAgent, patientReplies: { ...A.withAgent.patientReplies, p } } }));
const sweep = await Promise.all([0.15, 0.35, 0.5].map(atRate));
console.log(`with the agent at patient reply rates 0.15 / 0.35 / 0.5: return visits booked ${sweep.map((s) => s.returnVisitsBooked).join(' / ')} of ${agent.returnVisits}, `
  + `loops closed ${sweep.map((s) => Math.round((100 * s.closed) / s.loops)).join(' / ')}%, front-desk calls ${sweep.map((s) => s.frontDeskCalls).join(' / ')}`);
console.log('Sources for the assumptions, and which ones have none: docs/evidence.md');
console.log('\nAssumptions (every number above depends on them):');
console.log(JSON.stringify({ withAgent: A.withAgent, withoutAgent: A.withoutAgent, volume: A.perWorkday, optIn: A.whatsappOptIn }, null, 1));
