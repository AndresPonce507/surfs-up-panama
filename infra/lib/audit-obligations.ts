// Committed audit obligations. They do not assert a live console state because
// neither console provides that proof here.

export const externalAuditObligations = {
  anthropicConsoleSpendLimit: {
    requiredValue: '$5/month',
    evidenceKind: 'committed external audit obligation',
    liveConsoleAssertion: false,
    reviewCadence: 'when the console opens and before a builder release',
  },
  cloudFrontBillingPosture: {
    requiredValue: 'pay-as-you-go',
    emergencyBrake: 'flat Pro ($15/month)',
    evidenceKind: 'committed external audit obligation',
    liveConsoleAssertion: false,
    reviewCadence: 'when the request alarm triggers',
  },
} as const;
