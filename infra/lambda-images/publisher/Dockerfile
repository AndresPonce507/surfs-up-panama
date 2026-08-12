# The bounded Publisher (ADR weather-to-site-bridge, decision "packaged as a
# container image that carries the repository and its installed
# dependencies"). Build context is the REPOSITORY ROOT -- step 02-02's
# DockerImageCode.fromImageAsset(repoRoot, { file:
# 'infra/lambda-images/publisher/Dockerfile' }) points here, never at this
# subdirectory. Proven on linux/arm64 by
# scripts/smoke-publish-lambda-arm64.mjs before anything about this image
# counts (feature-delta.md slice-01 row).
#
# Layer order matters: package.json + package-lock.json are copied and
# `npm ci` runs BEFORE the rest of the tree lands, so an unrelated source
# change never busts the install layer -- only a dependency change does.
#
# This repository has no top-level "dependencies" field: astro, the AWS SDK
# clients, and tsx (this file's own bootstrap loader) are all
# devDependencies (verified 2026-08-12: `dependencies` is empty, 14
# devDependencies). `npm ci --omit=dev` would strip astro itself, so a plain
# `npm ci` is the correct production install here, not the literal
# "production dependencies" phrasing's usual `--omit=dev` shortcut.
FROM public.ecr.aws/lambda/nodejs:22

WORKDIR /var/task

COPY package.json package-lock.json ./
RUN npm ci

# .dockerignore excludes node_modules (host build is Darwin, this image is
# linux/arm64), .git, and every regenerable build/cache directory.
COPY . .

# The Lambda Node runtime interface client resolves CMD's module path with a
# .js/.mjs/.cjs extension, never .ts, so the composition root
# (src/pipeline/lambda/publish-handler.ts) cannot be the CMD target as-is.
# This generated bootstrap registers tsx's programmatic ESM loader (tsx is
# already a devDependency; this is the same tool test:at already relies on,
# no second build of the handler, no drift) and re-exports the real
# handler unchanged.
RUN printf '%s\n' \
  "import { register } from 'tsx/esm/api';" \
  "register();" \
  "const target = await import('./src/pipeline/lambda/publish-handler.ts');" \
  "export const handler = target.handler;" \
  > /var/task/publish-handler.bootstrap.mjs

CMD ["publish-handler.bootstrap.handler"]
