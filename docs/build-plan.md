# Build plan

Championship timeline (official page, read 2 Nov 2026): Build phase November 2026 to January 2027 (courses, workshops, mentorship); registration closes and agent + pitch deck are submitted in January 2027; semifinalists announced in January 2027; Grand Final in the first week of May 2027. Each of the four category winners receives a USD 150,000 grant.

Deliverables the championship asks for: a working AI agent prototype, a pitch deck and a demo video.

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | Core loop engine (week of 2 Nov) | open loops found with owner, SLA and priority; planner; booking from reply; close only with evidence; tests green. **Done.** |
| 2 | Agent layer | a language model reads free-text replies ("can I come Thursday after 5?") and maps them to a slot or a hand-over, with a test set of at least 40 synthetic replies in English and Arabic and a measured accuracy; the planner stays deterministic and the model never writes clinical text **Done 2 Nov**: 57 replies (27 Arabic), rules + Gemma 4 E4B local 53/57 (base 43/43, hard 10/14), 3 wrong bookings out of 57 |
| 2b | Safer bookings from the model | a booking that came from the model is held until the patient confirms it; a new held-out set of at least 30 replies; zero wrong bookings counted as evidence. **Done 2 Nov**: held-out set of 49 replies written by another model, first read 44/49, 45/49 after confirmation, 0 wrong bookings kept |
| 3 | WhatsApp sandbox channel | messages go out and replies come back through a WhatsApp Business sandbox number, with consent checked before every send and a full message log |
| 4 | Calendar connector | slots read from and written to a real calendar API (sandbox account), double booking refused |
| 5 | Clinician sign-off and dashboard | a web screen lists loops by priority, a clinician approves or edits any clinical message before it goes out, every closed loop shows its evidence |
| 6 | Measured demo | a synthetic month of a small clinic replayed end to end: loops opened, closed, escalated, time to close, before and after numbers from the replay **Replay done 2 Nov** (`npm run replay`, invariants tested on 3 seeds); the "before" side is still assumed |
| 6b | A baseline that is not assumed | every `withoutAgent` number traced to a published source (docs/evidence.md) or to measured, aggregate data from real clinics, with the source next to the number in the deck |
| 7 | Pitch deck and demo video | deck in the championship template (if one is provided) and a demo video under the length they set, both built from the measured demo |

Rules for every milestone:

- Synthetic data only in this repository.
- Every claim in the deck comes from a command that can be rerun here.
- The agent never sends a clinical message without a clinician sign-off; the tests keep this true.
