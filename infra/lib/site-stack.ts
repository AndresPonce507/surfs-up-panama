// Reviewed lifecycle declarations used by the credential-free CDK synthesis app.

import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

import { siteBucketName, siteOriginExportName } from './physical-names.js';

export const predictionLogPrefix = 'predictions/';

export const siteLifecycleDeclarations = [
  { id: 'raw-archive-expiration', prefix: 'raw/', expirationAfterDays: 30 },
  { id: 'photo-expiration', prefix: 'photos/', expirationAfterDays: 90 },
  { id: 'incomplete-multipart-abort', abortAfterDays: 7 },
] as const;

// The real read-side stack: ONE private versioned bucket (site + published
// JSON + photos + raw archive + prediction log) behind CloudFront with OAC.
// system-architecture.md sections 5 and 11. No custom domain or ACM cert:
// the project has no domain yet (HANDOFF section 10 decision), so the site
// origin is the distribution's own hostname, exported for the write stack's
// exact-origin CORS. Clean directory URLs are handled at publish time
// (scripts/preview/publish-preview.mjs pattern), never by a CloudFront
// Function: the architecture keeps CF Functions usage at zero (section 5).
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Versioning is slice-01 of F-BILL-STAYS-ZERO-AND-STAYS-UP: one console
    // delete of a single object version must never permanently destroy the
    // prediction log under predictions/. RemovalPolicy RETAIN for the same
    // reason. Lifecycle rules come from the reviewed declaration above; none
    // may overlap the prediction prefix (guardrail 4, asserted in CI).
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: siteBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { id: 'raw-archive-expiration', prefix: 'raw/', expiration: Duration.days(30) },
        { id: 'photo-expiration', prefix: 'photos/', expiration: Duration.days(90) },
        { id: 'incomplete-multipart-abort', abortIncompleteMultipartUploadAfter: Duration.days(7) },
      ],
    });

    // The assertion bridges aws-cdk-lib's optional-property typing to this
    // repo's exactOptionalPropertyTypes strictness; Bucket implements IBucket.
    // Documents live under the canonical site/ prefix, while content-hashed
    // assets and builder JSON stay at the bucket root. Separate origins make
    // the public URL contract match that physical key contract without a
    // CloudFront Function or a paid invalidation.
    const siteOac = new cloudfront.S3OriginAccessControl(this, 'SiteOriginAccessControl');
    const siteOrigin = origins.S3BucketOrigin.withOriginAccessControl(bucket as s3.IBucket, { originPath: '/site', originAccessControl: siteOac });
    const rootOrigin = origins.S3BucketOrigin.withOriginAccessControl(bucket as s3.IBucket, { originAccessControl: siteOac });

    // Short-TTL policy for HTML routes and published JSON: freshness by TTL
    // expiry within 5 minutes, zero routine invalidations by construction
    // (system-architecture.md section 5). Cache-Control set at upload governs
    // edge behavior; these TTLs are the fallback when a header is absent.
    const shortTtlPolicy = new cloudfront.CachePolicy(this, 'ShortTtlCachePolicy', {
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(300),
      maxTtl: Duration.days(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const manifestPolicy = new cloudfront.CachePolicy(this, 'ManifestCachePolicy', {
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(60),
      maxTtl: Duration.days(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Security headers via the managed Response Headers Policy, NOT a
    // CloudFront Function: keeps CF Functions usage at zero (section 5).
    const securityHeaders = cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS;

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: 'Surfs Up Panama production site',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: siteOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: shortTtlPolicy,
        responseHeadersPolicy: securityHeaders,
        compress: true,
      },
      additionalBehaviors: {
        'assets/*': {
          origin: rootOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeaders,
          compress: true,
        },
        'v1/photos/*': {
          origin: rootOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeaders,
        },
        'v1/*.json': {
          origin: rootOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: shortTtlPolicy,
          responseHeadersPolicy: securityHeaders,
          compress: true,
        },
        'manifest.json': {
          origin: rootOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: manifestPolicy,
          responseHeadersPolicy: securityHeaders,
          compress: true,
        },
      },
      // An S3 REST origin answers a missing or private key with 403; the
      // surfer must see the site's own 404 page, never raw AccessDenied XML
      // (HANDOFF section 10 finding).
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.minutes(1) },
      ],
    });

    new CfnOutput(this, 'SiteOrigin', {
      exportName: siteOriginExportName,
      value: `https://${distribution.distributionDomainName}`,
      description: 'Exact site origin for write-path CORS (guardrail 6: never *)',
    });
    new CfnOutput(this, 'SiteBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'SiteDistributionId', { value: distribution.distributionId });
  }
}
