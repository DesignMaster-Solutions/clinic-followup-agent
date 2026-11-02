#!/usr/bin/env node
// Prints the agent's worklist for a clinic export: every open loop, its owner,
// its deadline and the next step the agent would take.
import { readFileSync } from 'node:fs';
import { findOpenLoops } from './loops.mjs';
import { planNextStep } from './plan.mjs';

const file = process.argv[2] ?? new URL('../data/sample-clinic.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));

console.log(`${data.clinic.name} · worklist at ${data.now}`);
for (const openLoop of findOpenLoops(data)) {
  const step = planNextStep(data, openLoop);
  const flag = openLoop.overdue ? 'OVERDUE' : openLoop.urgency;
  console.log(`- [${flag}] ${openLoop.id} · owner ${openLoop.owner} · due ${openLoop.deadline} -> ${step.action} (${step.to})`);
  if (step.patientMessage) console.log(step.patientMessage.replace(/^/gm, '    | '));
}
