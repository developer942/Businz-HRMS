import { OfferLetterTemplate } from '../types/offerLetter';

export const OFFICIAL_CORPORATE_OFFER_TEMPLATE: OfferLetterTemplate = {
  id: 'TPL-CORPORATE-25CLAUSES',
  name: 'Official Corporate Offer (25 Clauses)',
  category: 'Full-Time',
  badgeColor: '#0E7490',
  description: 'Official corporate employment offer letter featuring 25 statutory and operational terms, candidate acceptance authorization, and Annexure A compensation structure.',
  subject: 'Offer of Employment - {{designation}}',
  content: `EMPLOYMENT TERMS & CONDITIONS

1. Nature of Employment: Your employment will be on a {{employment_type}} basis.
2. Probation: The probation period will be {{probation_period}}, subject to the company policy.
3. Working Hours: Your work schedule will be {{working_days}} days per week, from {{shift_start_time}} to {{shift_end_time}}, with {{break_duration}} of break time. Attendance, absences and reporting will follow the applicable company policy.
4. Remuneration: Your fixed gross monthly remuneration will be {{monthly_salary}}. Performance incentives, if any, will be governed by {{incentive_policy}}. Details of the agreed compensation structure appear in Annexure A.
5. Performance Review and Statutory Benefits: Your performance will be reviewed after {{review_period}}. Salary revisions and statutory contributions such as PF, ESI and other applicable benefits will be governed by applicable law and approved company policies.
6. Company Assets and Expense Claims: Company-provided assets, if any, are for authorized work purposes. Approved business expenses must be submitted under the company expense policy to {{expense_submission_email}}.
7. Roles and Responsibilities: Your core responsibilities are listed below and may be reasonably updated according to business needs:
{{role_responsibilities}}
8. Date of Joining: Your proposed joining date is {{joining_date}}.
9. Performance and Monitoring: Your performance may be evaluated against role objectives and key result areas in accordance with company policy.
10. Notice Period: The applicable notice period is {{notice_period}}, subject to the employment agreement and applicable law.
11. Minimum Service Commitment: Any minimum service commitment or bond will apply only if specifically agreed in a separate, valid agreement: {{service_commitment_terms}}.
12. Non-Disclosure Agreement: You may be required to sign a confidentiality or non-disclosure agreement as applicable to the role.
13. Reference and Background Checks: This offer is subject to satisfactory verification of employment history, credentials and any required background checks.
14. Location and Transfer: Your initial work location is {{work_location}}. Any transfer or remote-work arrangement will follow written company policy and applicable terms.
15. Fitness for Work: You must be able to perform essential role duties, with reasonable accommodations where required by applicable law.
16. Official Travel: Business travel, when required, will be reimbursed as per the approved travel and expense policy.
17. Contact Information: You are responsible for informing HR promptly about changes to your residential address and contact information.
18. Attendance and Leave: You must follow attendance procedures and seek leave approval according to the company leave policy.
19. Holidays and Leave Entitlement: Leave eligibility, public holidays and any probation-related conditions will follow applicable law and company policy.
20. Confidentiality: During and after employment, you must protect confidential company and customer information as required by applicable agreements and law.
21. Intellectual Property: Ownership and use of work-related intellectual property will be governed by the applicable employment and intellectual-property agreements.
22. Termination: Employment may be terminated under the agreed terms, applicable law and documented disciplinary procedures.
23. Handover of Company Property: On separation, you must return all company assets, access credentials, records and other property in accordance with the handover policy.
24. Code of Conduct and Disciplinary Process: You must comply with lawful company rules, conduct standards and documented disciplinary procedures.
25. Accuracy of Information: All information and documents provided during recruitment must be accurate. Material misrepresentations may be addressed under company policy and applicable law.`
};

export const INITIAL_OFFER_LETTER_TEMPLATES: OfferLetterTemplate[] = [
  OFFICIAL_CORPORATE_OFFER_TEMPLATE
];
