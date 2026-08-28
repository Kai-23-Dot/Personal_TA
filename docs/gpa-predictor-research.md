# Smartlearn GPA and grade predictor research

Last reviewed: August 28, 2026

## Product conclusions

1. GPA is not governed by one universal formula. A common unweighted model maps A/B/C/D/F to 4/3/2/1/0, but high schools may use different cutoffs, plus/minus values, course inclusion rules, and weighting. Colleges may recalculate a submitted GPA using their own rules.
2. “Weighted GPA” also varies. The shipped default is deliberately labeled an estimate: Honors adds 0.5 and AP, IB, or dual-enrollment adds 1.0, with no rigor bonus below 70%. Students can change each course’s rigor and credit value.
3. Assignment prediction needs two models. Canvas can calculate an unweighted course from total earned/possible points or weight assignment groups as percentages of the final grade. Smartlearn therefore supports exact total-points math when synced totals exist and a manually stated percent-of-course model otherwise.
4. A forecast must remain separate from the official record. Smartlearn applies a projected course grade only to the local GPA scenario and never writes a what-if score to Canvas.
5. The useful question is not only “What will my grade become?” but also “What score is required for my target?” The predictor returns the required score and distinguishes attainable targets, targets already secured, and targets that require extra credit.

## Calculation rules used in the first release

### GPA

- Default no-plus/minus scale: A >= 90 → 4.0; B >= 80 → 3.0; C >= 70 → 2.0; D >= 60 → 1.0; otherwise 0.0.
- Optional plus/minus preset: A 93, A- 90, B+ 87, B 83, B- 80, C+ 77, C 73, C- 70, D+ 67, D 63, D- 60.
- Course GPA points are multiplied by student-editable credits before averaging.
- Weighted bonuses: Standard +0; Honors +0.5; AP/IB/Dual +1.0; cap 5.0; no bonus below 70%.

### Assignment forecast

- Total points: `(earned so far + predicted earned) / (possible so far + assignment possible)`.
- Percent of course grade: `current grade × (1 - weight) + assignment percentage × weight`.
- Target in total-points mode: `target × (possible so far + assignment possible) - earned so far`.
- Target in course-weight mode: `(target - current × (1 - weight)) / weight`.

## Sources

- College Board BigFuture, “How to Calculate Your GPA on a 4.0 Scale”: https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale
- University of California Admissions, “GPA requirement”: https://admission.universityofcalifornia.edu/admission-requirements/first-year-requirements/gpa-requirement.html
- Common App, 2026 Direct Admissions setup guide (weighted, unweighted, and multiple GPA scales): https://www.commonapp.org/files/Direct-Admissions/Common%20App%20Direct%20Admissions%20jumpstart%20guide.pdf
- Instructure Canvas Basics Guide, current vs. total grades and What-If Grades: https://community.canvaslms.com/html/assets/Canvas_Basics_Guide.pdf
- Instructure Canvas Observer Guide, assignment-group weighting and graded-item totals: https://community.canvaslms.com/html/assets/Canvas_Observer_Guide.pdf

## Known limits

- The first release does not reproduce school-specific transcript exclusions, repeated-course rules, UC capped/uncapped GPA variants, class rank, or district-specific quality-point policies.
- Smartlearn does not yet sync Canvas assignment-group identifiers, group weights, drop-lowest rules, grading periods, or hidden-total policies. Students use the percent-of-course mode when those rules matter.
- Estimates are planning aids, not an official transcript, report card, admissions GPA, or promise of a teacher’s final grade.
