# OSV exceptions

The dependency gate always scans the complete committed npm lockfile:

```sh
osv-scanner scan source --config=./osv-scanner.toml --lockfile=./package-lock.json
```

`osv-scanner.toml` contains one temporary, advisory-specific exception:

| Advisory | Exact current dependency path | Why it is temporary | Removal condition |
| --- | --- | --- | --- |
| `GHSA-rgw5-rvv9-x895` | `aws-cdk-lib@2.264.0` bundles `brace-expansion@5.0.8` at `node_modules/aws-cdk-lib/node_modules/brace-expansion` | npm overrides cannot replace dependencies that AWS ships inside the `aws-cdk-lib` tarball. The current upstream CDK package has no patched release. `scripts/check-npm-audit.mjs` permits exactly this one high finding and no other high/critical result. | Remove the exception immediately when an AWS CDK release bundles `brace-expansion >=5.0.9`, then refresh `package-lock.json` and run the full dependency scan. Do not wait for the expiry date. |

The exception is an OSV ID allowlist plus an exact npm-audit evaluator, not a package, severity, development-dependency, or directory exclusion. Both expire on 2026-08-23 to force a new upstream review if it remains necessary. Any distinct advisory remains a failing finding. The local gate retains the raw audit result and CycloneDX SBOM plus SHA-256 sidecar in `.ci-local-logs/`.
