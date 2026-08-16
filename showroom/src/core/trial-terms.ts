/**
 * The SuperMega free-trial terms, in plain language, shipped WITH the product
 * so the acceptance checkbox never references a document the user cannot read.
 * The signup form records acceptance of TRIAL_TERMS_VERSION on this device with
 * the trial record; these clauses must stay true of the actual free tier — if a
 * clause stops being true, change the product or change the clause, never let
 * them drift apart. Managed company accounts carry their own written agreement
 * at activation time; nothing here governs the managed tier.
 */

export const TRIAL_TERMS_VERSION = 'supermega.trial-terms.v1' as const

export const TRIAL_TERMS: readonly { title: string; body: string }[] = [
  {
    title: 'The free trial is local and free',
    body:
      'The trial runs entirely in your browser on this device. There is no charge, no card, and no time limit. Sample records are provided so you can try real workflows; replace them with your data whenever you want.',
  },
  {
    title: 'Your data stays on this device',
    body:
      'Trial records are stored in this browser only. SuperMega does not receive, read, or copy them. Clearing browser data deletes them, so use the built-in backup export if the records matter to you.',
  },
  {
    title: 'Your email is optional and stays local',
    body:
      'If you enter an email it is kept on this device with your trial record so SuperMega can be contacted about a company account when YOU choose to reach out. It is not sent anywhere at signup and is never used for marketing.',
  },
  {
    title: 'The claim code links this trial to a future company account',
    body:
      'Your claim code identifies this trial when you ask for a company account. Keep it private: whoever activates with it becomes the company owner. One claim code creates at most one company.',
  },
  {
    title: 'Nothing real happens without you',
    body:
      'The trial never sends messages, takes payments, publishes, or moves real stock. Every confirmation screen states exactly what will be recorded before it is recorded, and only on this device.',
  },
  {
    title: 'Provided as-is, honestly',
    body:
      'The free trial is provided as-is, without warranty. Records you keep in it are yours; keeping them safe on your own device is shared work — we give you export and backup tools, you run them.',
  },
  {
    title: 'A company account is a separate decision',
    body:
      'Moving to a managed company account (shared records, your team, data off this device) happens only when you request it, and it comes with its own written agreement at activation time.',
  },
]
