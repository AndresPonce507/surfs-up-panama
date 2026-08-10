module.exports = {
  forbidden: [
    {
      name: 'report-flow-must-not-reach-forecast-publish-or-pipeline',
      comment: 'The capture and confirmation flow must stay structurally unable to import forecast data.',
      severity: 'error',
      from: {
        path: '^src/(?:pages/spots/\\[slug\\]/report(?:ar|ado)\\.astro|components/Report(?:Capture|Shell)\\.astro|report/)',
      },
      to: {
        path: '^src/(?:data/forecast\\.ts|forecast/|publish/|pipeline/)',
        reachable: true,
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
