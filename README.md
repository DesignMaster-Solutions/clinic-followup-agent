# Loop Closer for Clinics

An AI agent for small clinics that finds follow-ups that started but never finished, and owns each one until it is closed with evidence.

Entry for the **Create AI Agents Championship 2026/27** (Dubai Chamber of Digital Economy), category **Best Business AI Agent**. Built during the championship's Build phase (November 2026 to January 2027) as a new codebase.

## The problem

Small clinics lose patients between steps. A lab result arrives and nobody reviews it in time. A referral is sent and the other service never accepts it. A return visit is due and nobody books it. Most clinics have no care coordinator watching these gaps, so they are found late or never.

## What the agent does

1. **Finds open loops** in the clinic's own records: results received but not reviewed, referrals sent but not accepted, return visits due but not booked.
2. **Gives each loop an owner, a deadline and an urgency.** A critical result has 4 hours, an abnormal one 48 hours; an urgent referral 2 days.
3. **Plans the next step**: ask the ordering clinician to review, chase the referral, or offer the patient real free slots from the clinic calendar.
4. **Talks to the patient on WhatsApp** only with consent, and only with scheduling text. The reason for the visit never goes in the message.
5. **Books the visit** from the patient's reply, and hands over to the front desk when the reply is unclear or the patient asks for a call.
6. **Escalates** to the clinic lead when a loop is overdue or when there is no capacity before the due date.
7. **Closes a loop only with evidence**: a signed review, an accepted referral, a booked visit or a documented plan. Nothing closes on a timer.

## Guardrails

- No clinical message reaches a patient before a clinician signs off.
- Patient messages carry scheduling text only (no test names, results or diagnosis).
- No WhatsApp consent means a call task for a person, never a message.
- Every escalation names a person, not a queue.
- This repository uses synthetic data only. No real patient record is used or stored here.

## Status

| Piece | State |
| --- | --- |
| Open-loop detection with SLA, owner and priority | done, tested |
| Next-step planner (review, chase, offer slots, call task, escalate) | done, tested |
| Booking from a WhatsApp reply, closing with evidence | done, tested |
| Reply understanding in English and Arabic (rules + language model, structured output only) | done, tested, measured on a held-out set |
| A time found by the model is held and confirmed by the patient before it counts | done, tested |
| A synthetic month replayed end to end, with and without the agent | done, tested (the baseline is assumed) |
| WhatsApp channel (sandbox) and calendar connector | planned |
| Clinician sign-off screen and clinic dashboard | planned |
| Pitch deck and demo video | planned for January 2027 |

The plan with dates and done criteria is in [docs/build-plan.md](docs/build-plan.md).

## Run it

Requires Node.js 20 or later. No dependencies.

```sh
npm test            # 25 tests
npm run worklist    # the agent's worklist for the synthetic clinic
npm run replay      # a synthetic month, with and without the agent
```

The worklist for `data/sample-clinic.json` (synthetic clinic in Dubai, 2 Nov 2026 09:00):

```text
- [OVERDUE] referral_unaccepted:f1 · owner dr-haddad · due 2026-11-01T06:00:00.000Z -> escalate (dr-haddad)
- [OVERDUE] result_unreviewed:r1 · owner dr-haddad · due 2026-11-02T03:30:00.000Z -> escalate (dr-haddad)
- [soon] result_unreviewed:r2 · owner dr-saleh · due 2026-11-03T11:00:00.000Z -> request_review (dr-saleh)
- [routine] return_unbooked:v4 · owner front-desk · due 2026-11-03T08:00:00.000Z -> escalate (dr-haddad)
- [routine] return_unbooked:v3 · owner front-desk · due 2026-11-04T14:00:00.000Z -> call_task (front-desk)
- [routine] return_unbooked:v1 · owner front-desk · due 2026-11-06T14:00:00.000Z -> offer_slots (p5)
    | Hello Sara, this is Al Noor Family Clinic (synthetic).
    | It is time to book your follow-up visit with Dr. Saleh. Reply with the number of the time that suits you:
    | 1) Tue 3 Nov, 16:00
    | 2) Wed 4 Nov, 08:30
    | 3) Thu 5 Nov, 11:00
    | Reply 0 if none of these work and we will call you.
- [routine] referral_unaccepted:f2 · owner dr-saleh · due 2026-11-11T08:00:00.000Z -> chase_referral (dr-saleh)
```

## Reading free-text replies

Patients answer in their own words, in English or Arabic. `src/reply.mjs` reads a reply in two layers:

1. **Rules** for the short answers: a digit (also Arabic-Indic "٢" and Persian "۲"), "option 2", "ok the second one", "رقم ٣", "نعم الثاني", 0 for none of these, STOP or إيقاف. Any word the rules do not know, including "not" and "but", sends the reply to the next layer.
2. **A language model** for everything else. It only fills a fixed request (intent, option, day of the month, weekday, earliest and latest hour); the JSON schema is sent as a grammar, and the answer is validated again before use. The model sees the reply, today's date and the offered times, nothing else, and it never writes to the patient. A test fails if the visit reason, the patient's name or the phone number reaches it.

The request is then matched against the real free slots of the right clinician, in the clinic's time zone: an offered slot that fits wins, then the earliest free slot that fits; an option that contradicts the time the patient also asked for is read as that time. No fit, a broken model answer, or anything that is not about booking (questions, symptoms, results, someone else coming) goes to the front desk.

**A time that came from the model is never booked directly.** It is held for the patient (12 hours at most, never closer than 2 hours to the visit) and confirmed with a scheduling-only message ("Dr. Saleh has Thu 5 Nov, 11:00 free for your follow-up visit. Reply 1 to confirm, or 0 and we will call you."). Only a clear yes books it; anything else releases the slot and hands over to a person. A held slot is not offered to anyone else.

Measured with Gemma 4 E4B (Q8_0) running locally in llama.cpp, temperature 0, on 2 Nov 2026. The development set was used while writing the prompt and the rules; the held-out set was written separately by another model (GitHub Copilot CLI, auto mode) from a labelling guide, without access to the prompt or the development set. Nothing in the reader changed after the measured run, and a second run gave the same numbers.

| Set | Rules only | Rules + model, first read | After confirmation | Wrong bookings kept |
| --- | --- | --- | --- | --- |
| Development, 57 replies (27 Arabic, 14 hard) | 28/57 | 56/57 | 56/57 | 0 |
| **Held-out, 49 replies (23 Arabic, 4 Hindi/Urdu/Tagalog mixes, 37 hard)** | 19/49 | **44/49** | **45/49** | **0** |

"After confirmation" assumes a patient confirms the time they asked for and refuses any other. On the held-out set the model proposed 18 times by confirmation; 2 were the wrong time and were refused, including "الخيار ٣ بس بعد نص ساعة" ("option 3 but half an hour later"), which the model read as option 3. The 4 remaining misses all went to a person, none became a booking. Full output, with the model's request for every miss, in [docs/reply-eval.txt](docs/reply-eval.txt).

```sh
llama-server -m gemma-4-E4B-it-Q8_0.gguf --port 8093 --jinja   # any OpenAI-compatible endpoint works
MODEL_URL=http://127.0.0.1:8093 npm run eval:replies
```

## A month of a clinic, replayed

`npm run replay` runs a synthetic month (30 days, 3 clinicians, 400 patients, 80% WhatsApp consent; per working day 12 lab results, 2 referrals and 6 return visits) hour by hour through the same engine, once with the agent and once without it. The clinic's month is identical in both runs; only people's behaviour differs. Every behaviour (how fast a clinician reviews, how often a patient answers, how often the front desk reaches a patient) is an assumption, listed in `ASSUMPTIONS` in `src/replay.mjs` and printed with the result. **The "without the agent" column is an assumed baseline, not a measurement.**

| Seed 1 | With the agent | Without the agent (assumed) |
| --- | --- | --- |
| Loops closed with evidence by day 30 | 469 of 495 (95%) | 302 of 493 (61%) |
| Loops closed late or still open | 43 | 307 |
| Return visits booked | 113 of 145 | 54 of 143 |
| Median hours to close a return-visit loop | 12 | 99 |
| Escalated to a named person | 18 | 0 |
| Patient messages / front-desk calls | 178 / 75 | 0 / 0 |
| Wrong bookings kept, double bookings, messages without consent, agent-initiated messages outside 08:00-21:00 | 0 / 0 / 0 / 0 | - |

The four zeros are invariants: `test/replay.test.mjs` checks them on three seeds, and a test turns red if the consent check is removed from the planner. Every loop closes only with the evidence its kind allows (`closeLoop` throws otherwise). The replay also found two problems that are fixed now: offers used the first free slot, sometimes an hour away, so a patient's answer arrived after the time had passed (offers now start at least 12 hours ahead), and several patients were offered the same slots at once (a slot taken meanwhile now leads to new times, not a phone call).

Each run also returns the timeline of every loop (opened, offer sent with its text, patient reply, confirmation, booking, call, escalation, closed with evidence), which the clinic screen will use.

## Layout

- `src/loops.mjs`: open-loop detection, priority and closing rules
- `src/plan.mjs`: next-step planner, slot offer, booking from a reply
- `src/reply.mjs`: reads a free-text reply (rules, then a language model) and maps it to a slot or a hand-over
- `src/eval-replies.mjs`: accuracy on the development and held-out reply sets
- `src/replay.mjs`, `src/replay-cli.mjs`: the synthetic month, its assumptions and its timeline
- `src/cli.mjs`: prints the worklist for a clinic export
- `data/sample-clinic.json`: synthetic clinic used by the tests
- `data/replies-eval.json`: development set, 57 synthetic replies with the outcome a front-desk person would choose
- `data/replies-heldout.json`: held-out set, 49 replies written by another model from a labelling guide
- `test/`: `node:test` suite

## License

MIT. Design Master Solutions LLC.
