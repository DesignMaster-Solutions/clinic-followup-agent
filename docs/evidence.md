# Published evidence for the "without the agent" baseline

Grounds `ASSUMPTIONS.withoutAgent` in `src/replay.mjs` (read 2026-11-02; this file changes nothing in it).

**Method.** PubMed E-utilities searches on 2026-11-02. Every quote below was machine-checked against the
abstract text fetched in that session. Abstracts only, unless marked "full text". "Direct" = measures what
the parameter models. "Proxy" = a neighbouring quantity (different setting, or a different step of the loop).

**Bottom line**

1. **`reviewHours.critical: [2, 24]` is not supported and must change.** Labs phone critical values, and
   measured notification takes minutes (14 min for outpatients). Those hours overstate the agent's gain.
2. **`neverReviewed: 0.1` is well supported for abnormal results** (about 7-18%), but not as a flat rate for
   all flags. Critical and normal results need their own values.
3. **`referralAccepted.p: 0.6` matches the measured range** (54-64% scheduled or completed), though no study
   measured "acceptance" as the simulation names it.
4. **`patientSelfBooks: 0.5` has no direct source.** I found no study of return visits never scheduled.
5. **Outside the baseline:** `withAgent.patientReplies.p: 0.7` is above every reply rate I found (14-52%),
   so the with-agent side is the optimistic one there.

## 1. Non-critical abnormal results

**Callen 2012, systematic review, 19 studies, ambulatory, all US, literature 1995-2010. Proxy** (range for `neverReviewed`).
[DOI](https://doi.org/10.1007/s11606-011-1949-5) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/22183961/)
> reported wide variation in the extent of tests not followed-up: 6.8% (79/1163) to 62% (125/202) for laboratory tests; 1.0% (4/395) to 35.7% (45/126) for radiology.

**Singh 2010, 1163 lab alerts, outpatient, one VA facility, US, 2008. Direct** (`neverReviewed`).
[DOI](https://doi.org/10.1016/j.amjmed.2009.07.027) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/20193832/)
> 78,158 tests (hemoglobin A1c, hepatitis C antibody, thyroid-stimulating hormone, and prostate-specific antigen) were performed, of which 1163 (1.48%) were transmitted as alerts; 10.2% of these (119/1163) were unacknowledged. Timely follow-up was lacking in 79 (6.8%), and was statistically not different for acknowledged and unacknowledged alerts (6.4% vs 10.1%; P =.13).

Limits: "unacknowledged" was measured at 2 weeks, not forever, and only for high-threshold alerts. The last
clause matters for modelling: opening a result does not equal acting on it.

**Singh 2009, 1196 critical imaging alerts, outpatient, one VA facility, US, 2007-08. Proxy** (imaging, `neverReviewed`).
[DOI](https://doi.org/10.1001/archinternmed.2009.263) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/19786677/)
> 1196 images (0.97%) generated alerts; 217 (18.1%) of these were unacknowledged.

**Casalino 2009, 5434 patients, 23 primary care practices, US. Direct** (`neverReviewed`, informing the patient).
[DOI](https://doi.org/10.1001/archinternmed.2009.130) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/19546413/)
> The rate of apparent failures to inform or to document informing the patient was 7.1% (135 failures divided by 1889 abnormal results), with a range of 0% to 26.2%.

**Danforth 2019, 244,540 patients, integrated system, US, 2010-15. Proxy** (needs a repeat test, so the patient's behaviour is included).
[DOI](https://doi.org/10.1053/j.ajkd.2019.05.003) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/31324445/)
> 58% of patients lacked timely follow-up of their incident abnormal eGFRs (ie, had a care gap).

**Martinez-Gutierrez 2023, systematic review, 26 studies, 265,041 participants, high-income countries. Proxy** (cervical screening only).
[DOI](https://doi.org/10.1186/s12885-023-11082-z) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/37438686/)
> Rates of inadequate follow-up ranged from 4 to 75%.

**Reece 2021, systematic review, 17 studies, US plus one Netherlands. Proxy** (mammography only).
[DOI](https://doi.org/10.1186/s12885-021-08100-3) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/33827476/)
> Failure to follow-up abnormal screening mammograms within 3 and at 6 months ranged from 7.2-33% and 27.3-71.6%, respectively.

**Time to review.** I found no study reporting time from result to clinician opening it in an outpatient
inbox. The two nearest figures measure later steps, or another population:

**Moore 2007, 259 results with potassium at or above 6.0 mEq/L, one primary care practice, US, 2002-05. Proxy** (time to action, not to review).
[DOI](https://doi.org/10.1177/1062860607305245) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/18006423/)
> The median follow-up time was 3 days; after 30 days, 10% of cases had no follow-up.

**Krishnasamy 2026, 5912 results pending at discharge, paediatric hospital medicine, country not read in the abstract. Proxy** (weak: not outpatient).
[DOI](https://doi.org/10.1542/hpeds.2026-009339) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/42802027/)
> results managed within 36 hours increased from a mean of 53% to 96%. Mean time to manage TPAD decreased from 195.4 hours to 11.6 hours.

**Murphy 2012, 47 primary care practitioners, one VA facility, US. Context** (why inboxes lag).
[DOI](https://doi.org/10.1016/j.amjmed.2011.07.029) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/22269625/)
> PCPs received a mean of 56.4 alerts/day containing new information.

## 2. Critical laboratory values

**Howanitz 2002, CAP Q-Probes, 623 institutions, more than 13,000 critical values. Direct** (`reviewHours.critical`). The most important source here; it is old but large.
[DOI](https://doi.org/10.5858/2002-126-0663-LCVPAP) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/12033953/)
> On average, completion of notification required about 6 minutes for inpatients and 14 minutes for outpatients. Slightly greater than 5% of critical value telephone calls were abandoned, with the largest percentage abandoned for outpatients.

> For outpatients, physicians' office staff received the largest percentage (40%) of reports.

**Lynn 2020, one health system, US. Direct** (paging with call-back, before the change; mixed patient locations).
[DOI](https://doi.org/10.4103/jpi.jpi_19_20) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/33042600/)
> The mean pre-implementation turnaround time (TAT) was 11.3 minutes (median: 7 minutes, range: 0 - 210 minutes).

**Hopkins 2021, one tertiary centre, US. Direct** (size of the slow tail).
[DOI](https://doi.org/10.1093/jalm/jfab002) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/33904919/)
> The overall rate of calls greater than 60 min decreased from 3.4% ± 0.8% in the preintervention study period to 1.3 ± 0.3%, postintervention.

**He 2026, 53,639 records, one tertiary hospital, China, 2023. Proxy** (mostly inpatient; acknowledgement in the hospital system).
[DOI](https://doi.org/10.1155/jonm/8786244) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/42891918/)
> The overall median HIS acknowledgment time was 35 s (IQR 20-96 s), and the overall timely acknowledgment rate was 94.57%.

**The rule itself.** CAP requires a policy; I did not open CAP checklist or ISO 15189 text, so neither is
quoted. No numeric time limit appears in the sources I opened.

**AlSadah 2019, narrative review. Direct** (the rule exists).
[PubMed](https://pubmed.ncbi.nlm.nih.gov/31933321/)
> The College of American Pathologists (CAP) requires stringent policies for reporting critical values in all laboratories, including adoption of a robust quality assurance system.

**Imoh 2023, 134 laboratories, Nigeria, 2015. Proxy** (the rule is not universal outside accredited labs).
[DOI](https://doi.org/10.4102/ajlm.v12i1.2249) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/38116517/)
> Only 69 (51.5 %) laboratories practised CVN; only 23 (33.3%) had existing written policies guiding the practice.

**What this means.** A critical result reaches someone at the practice in minutes, not hours. What the phone
call does not guarantee is action: 40% of outpatient calls reach office staff, over 5% of calls are abandoned,
and Moore (section 1) found a 3-day median to follow-up for severe hyperkalemia. No Gulf figure was found for
time to notification.

## 3. Referral loop closure

**Srinivasan 2023, 38,334 referrals, children's hospital, US, 2019-21. Direct** for scheduled and completed (paediatric).
[DOI](https://doi.org/10.1016/j.jpeds.2023.113485) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/37196777/)
> Of all referrals, 62% were scheduled and 54% were completed.

**Amat 2024, 12,282 orders, 2 academic primary care practices, US, 2018-21. Direct** for dermatology referrals; colonoscopy and stress tests are proxy.
[DOI](https://doi.org/10.1016/j.jcjq.2023.10.005) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/37996308/)
> Of resident orders for all three tests, 52.9% were completed within the designated time vs. 58.4% for orders placed by attending physicians (p < 0.01).

> a difference was not seen for dermatology referrals (64.2% completion rate for residents vs. 63.7% for attending physicians).

**Zhong 2023, 4133 orders, primary care, Boston, US, 2020-21. Direct** (colonoscopy, dermatology referrals and stress tests combined).
[DOI](https://doi.org/10.1001/jamanetworkopen.2023.43417) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/37966837/)
> Of the telehealth orders, 42.6% were completed within the designated time frame vs 58.4% of those ordered during in-person visits and 57.4% of those ordered without a visit.

**Bell 2024, 12,849 tests and referrals, 2 academic primary care clinics, US, 2018-21. Direct** (same mix).
[DOI](https://doi.org/10.1093/jamia/ocad250) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/38164964/)
> loop closure was more common among Portal+Note-readers compared to their counterparts for all tests/referrals (54.2% No Portal, 57.4% Portal Account Only, 61.6% Portal+Notes, P < .001).

**Report coming back:**

**Gandhi 2000, physician e-mail survey, academic centre, US. Direct but old.** Response rate 56% for primary care physicians.
[DOI](https://doi.org/10.1046/j.1525-1497.2000.91119.x) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/11029676/)
> four weeks after specific referral visits, 25% of PCPs had still not received any information from specialists.

**Stille 2006, 179 children, 30 community practices, US. Proxy** (paediatric, self-reported).
[DOI](https://doi.org/10.1542/peds.2005-3010) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/17015522/)
> primary care physicians reported communication from specialists after 84% of initial consultations.

The Amat, Zhong and Bell cohorts overlap in setting and period, so they are not independent confirmations.

## 4. Follow-up and return visits

**No direct source found.** Repeated searches for recommended visits never scheduled returned nothing usable.
The figures below measure attendance at visits already booked, or completion of orders, so they bound
`patientSelfBooks` only loosely.

**Dantas 2018, systematic review, 105 studies, international. Proxy** (booked visits).
[DOI](https://doi.org/10.1016/j.healthpol.2018.02.002) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/29482948/)
> the average no-show rate is of the order of 23%, being highest in the African continent (43.0%) and lowest in Oceania (13.2%).

**Gurol-Urganci 2013, Cochrane review, 8 RCTs, 6615 participants, international. Proxy** (booked visits).
[DOI](https://doi.org/10.1002/14651858.CD007458.pub3) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/24310741/)
> Overall, the attendance to appointment rates were 67.8% for the no reminders group, 78.6% for the mobile phone messaging reminders group and 80.3% for the phone call reminders group.

**Youssef 2014, RCT, 502 patients, internal medicine clinic, Saudi Arabia, 2011. Proxy, Middle East** (booked visits).
[PubMed](https://pubmed.ncbi.nlm.nih.gov/24952289/)
> The non-attendance rate was significantly lower in the reminder group (26.3%) than the non-reminder group (39.8%).

**Altuwaijri 2012, 16 outpatient clinics, Riyadh, Saudi Arabia, 2008-09. Proxy, Middle East** (booked visits, before and after).
[PubMed](https://pubmed.ncbi.nlm.nih.gov/22327762/)
> The mean non-attendance rates for the 16 outpatient clinics during 2008 were 23.9% (SD 0.0578) and for 2009 were 19.8% (SD 0.0386) with a 4.1% (p < 0.001, T-value = 4.81) reduction rate.

**Williams 2023, 395 glaucoma patients, tertiary eye centre, US, 10 years. Proxy** (chronic specialty care, long horizon).
[DOI](https://doi.org/10.1080/09286586.2022.2127787) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/36154557/)
> Among the 395 included patients, 132 (33%) were LTFU over the 10-year study period.

## 5. Patient response to messages

These inform `withAgent` and `whatsappOptIn`, not `withoutAgent`. **I found no peer-reviewed WhatsApp reply
rate or opt-out rate, and no Middle East reply rate.**

**Fischer 2017, 47,390 patients invited by SMS, safety-net system, US, 2013-14. Direct** for `whatsappOptIn` (SMS, not WhatsApp).
[DOI](https://doi.org/10.5334/egems.215) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/29881740/)
> 47,390 patients were invited by SMS to participate, of which 20,724 (43.7 percent) responded with 18,138 opting in (81.5 percent of respondents).

Derived: 18,138 / 47,390 = 38% of those invited. The 81.5% looks like the current 0.8 only if non-responders
are ignored. Full text: non-responders were not enrolled.

**Del Fiol 2025, RCT, safety-net health centres, Utah, US. Proxy** (bidirectional SMS, COVID test kits, not appointments).
[DOI](https://doi.org/10.2196/74145) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/40720824/)
> the proportion of participants who requested test kits in the Chatbot arm was lower than in SMS text messaging (174/1051, 16.6% vs 555/1066, 52.1%;

> participants in the 10-day versus 30-day condition were more likely to opt out of receiving study interventions (1977/15,717, 12.6% vs 1147/15,722, 7.3%;

**Weiner 2024, 243 patients on chronic opioids, primary care, US, 2022. Proxy** (sensitive topic, so likely a floor).
[DOI](https://doi.org/10.5055/jom.0830) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/39321049/)
> After receiving the text messages, 64 (26.3 percent) of the 243 patients responded with "unsubscribe." Thirty-five (14.4 percent) patients responded to the message,

**Hossain 2026, 171 patients with diabetes, public hospital, New York, US. Proxy** (WhatsApp attendance, not replies; retrospective, not randomised).
[DOI](https://doi.org/10.1080/08998280.2025.2563478) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/41510513/)
> The social media reminder group (88.2%, n = 60/68) had a significantly (P < 0.001) greater percentage of attendance at the follow-up appointment than the traditional reminder group (60.2%, n = 62/103).

## 6. Parameter table

| Parameter (current value) | Supported value or range | Sources | Confidence | Verdict |
|---|---|---|---|---|
| `reviewHours.critical` [2, 24] h | **About 0.1-1 h** to reach the practice; 1-3% of calls above 1 h | Howanitz, Lynn, Hopkins | Medium-high for labs that phone; old and hospital-lab data | **Not supported: change it** |
| `reviewHours.abnormal` [24, 120] h | No direct figure; 3-day median to action is consistent. Long tail likely | Moore, Krishnasamy (weak) | Low | Plausible, unproven; upper bound may be short |
| `reviewHours.normal` [48, 240] h | Nothing found | None | None | Pure assumption: say so |
| `neverReviewed` 0.1, all flags | Abnormal: **0.07-0.18**. Critical: about 0.05 calls abandoned, then retried or not. Normal: nothing found | Singh 2010, Singh 2009, Casalino, Moore, Howanitz | Medium for abnormal; low otherwise | **Abnormal fits. A flat rate does not** |
| `referralAccepted.p` 0.6 | **0.54-0.64** scheduled or completed | Srinivasan, Amat, Zhong, Bell | Medium-high as a proxy; US only | **Supported**, but "accepted" was not measured |
| `referralAccepted.days` [2, 20] | Nothing on time to acceptance. 25% with no report at 4 weeks after the visit | Gandhi | Low | Unproven |
| `patientSelfBooks` 0.5 | No direct figure. Loose ceiling: 0.6-0.77 attendance once booked | Gurol-Urganci, Dantas, Youssef, Altuwaijri | Low | **Unproven; defensible as a stated assumption** |

Related values outside `withoutAgent`:

| Parameter (current value) | Published figures | Sources | Verdict |
|---|---|---|---|
| `withAgent.reviewAfterRequestHours.critical` [0.5, 3] h | Phone takes minutes | Howanitz, Lynn | **Slower than the phone baseline.** No speed gain can be claimed here |
| `withAgent.patientReplies.p` 0.7 | 0.14-0.52 in the closest studies | Weiner, Fischer, Del Fiol | **Above every figure found; none is WhatsApp** |
| `withAgent.replyKind.stop` 0.05 of replies (0.035 of those messaged) | 0.07-0.26 of those messaged | Del Fiol, Weiner | **Likely low** |
| `whatsappOptIn` 0.8 | 0.815 of responders, 0.38 of all invited | Fischer | **Holds only if opt-in is collected in person at the clinic** |

## 7. What should change in the simulation

- **Critical results.** Use a baseline of minutes. Then report them separately, and do not count critical
  "review speed" toward the agent's benefit. Its defensible value is the residual: calls abandoned, calls
  taken by office staff, and action documented. Keep the hours only for a lab that does not phone, and label
  that scenario as such.
- **Split `neverReviewed` by flag**, and do not treat "reviewed" as "acted on" (Singh 2010, Singh 2009).
- **Label `reviewHours.normal`, `referralAccepted.days` and `patientSelfBooks` as assumptions** when the
  result is printed, and run the replay across a range instead of one point.
- **Run the with-agent side at reply rates of about 0.15-0.5.** The current 0.7 has no source.

## 8. Limits of this evidence

- Nearly all of it is US, much of it VA or academic. **Nothing comes from a small private clinic in the Gulf.**
- Older anchors (Howanitz 2002, Gandhi 2000) predate current EHRs. They were kept because nothing newer in
  this search measured the same thing at that scale.
- Studies rely on record review, so missing documentation can count as missing follow-up (Callen says so).
- Searched PubMed only. A missing figure here means not found in this search, not that it does not exist.
