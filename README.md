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
| Reply understanding in English and Arabic (rules + language model, structured output only) | done, tested, measured below |
| WhatsApp channel (sandbox) and calendar connector | planned |
| Clinician sign-off screen and clinic dashboard | planned |
| Pitch deck and demo video | planned for January 2027 |

The plan with dates and done criteria is in [docs/build-plan.md](docs/build-plan.md).

## Run it

Requires Node.js 20 or later. No dependencies.

```sh
npm test            # 16 tests
npm run worklist    # the agent's worklist for the synthetic clinic
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

1. **Rules** for the short answers: a digit (also Arabic-Indic, "٢"), "option 2", "رقم ٣", 0 for none of these, STOP or إيقاف.
2. **A language model** for everything else. It only fills a fixed request (intent, option, weekday, earliest and latest hour); the JSON schema is sent as a grammar, and the answer is validated again before use. The model sees the reply, today's date and the offered times, nothing else, and it never writes to the patient. A test fails if the visit reason, the patient's name or the phone number reaches it.

The request is then matched against the real free slots of the right clinician, in the clinic's time zone: an offered slot that fits wins, then the earliest free slot that fits. No fit, a broken model answer, or anything that is not about booking (questions, symptoms, results, someone else coming) goes to the front desk.

Measured on 57 synthetic replies (`data/replies-eval.json`, 27 in Arabic) with Gemma 4 E4B (Q8_0) running locally in llama.cpp, temperature 0, on 2 Nov 2026:

| Set | Rules only | Rules + model |
| --- | --- | --- |
| Base: 43 plain replies (23 English, 20 Arabic) | 17/43 | 43/43 |
| Hard: 14 replies with typos, Gulf dialect, Arabic in Latin letters, a date instead of a weekday, a pick with a change request | 4/14 | 10/14 |
| All | 21/57 | 53/57 |

Of the 4 misses, 1 is safe (a reply that could have been booked went to the front desk) and 3 booked the wrong slot, one of them "3 but can it be 30 min later?". That is the next step: a booking that came from the model is held and confirmed with the patient before it counts as evidence, measured on a new held-out set. Full output in [docs/reply-eval.txt](docs/reply-eval.txt).

```sh
llama-server -m gemma-4-E4B-it-Q8_0.gguf --port 8093 --jinja   # any OpenAI-compatible endpoint works
MODEL_URL=http://127.0.0.1:8093 node src/eval-replies.mjs
```

## Layout

- `src/loops.mjs`: open-loop detection, priority and closing rules
- `src/plan.mjs`: next-step planner, slot offer, booking from a reply
- `src/reply.mjs`: reads a free-text reply (rules, then a language model) and maps it to a slot or a hand-over
- `src/eval-replies.mjs`: accuracy on the synthetic reply set
- `src/cli.mjs`: prints the worklist for a clinic export
- `data/sample-clinic.json`: synthetic clinic used by the tests
- `data/replies-eval.json`: 43 synthetic replies (23 English, 20 Arabic) with the outcome a front-desk person would choose
- `test/`: `node:test` suite

## License

MIT. Design Master Solutions LLC.
