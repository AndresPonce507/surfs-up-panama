import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { writeStack } from '../../infra/bin/app.js';

describe('public browser Write configuration infrastructure', () => {
  it('publishes the direct report Function URL with mint, Push and the public VAPID key on create and update', () => {
    const resources = Template.fromStack(writeStack).findResources('Custom::AWS');
    const config = Object.values(resources).find((resource) => JSON.stringify(resource).includes('push-config.json'));
    expect(config).toBeDefined();
    const rendered = JSON.stringify(config);
    expect(rendered.match(/report_url/g)).toHaveLength(2);
    expect(rendered).toContain('reportfnFunctionUrl');
    expect(rendered).toContain('mintfnFunctionUrl');
    expect(rendered).toContain('pushfnFunctionUrl');
    expect(rendered).toContain('no-store');
  });
});
