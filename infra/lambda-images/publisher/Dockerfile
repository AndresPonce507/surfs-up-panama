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
  > /var/task/publish-handler-bootstrap.mjs

# Run as a non-root user. Lambda's own base images ship root-only (verified:
# the image carries no account with uid >= 1000), and the microVM is the real
# isolation boundary, so this is defence in depth rather than the only wall --
# but "root because the base image was" is not a reason, and the SAST gate
# rightly refuses an image that never says who it runs as.
#
# /var/task is handed to this user because the render writes inside the tree it
# runs from: astro and vite place caches next to node_modules, and the handler's
# writable copy is seeded from here. Owning it keeps the non-root path behaving
# like the root path did instead of failing somewhere deep in a build. /tmp is
# 1777 in the base image, so the writable render copy needs no help.
# The account is written straight into /etc/passwd because this base image is
# minimal and carries no useradd (verified: exit 127, "command not found").
# Installing shadow-utils just to add one line would grow the deployed image
# for nothing. Lambda may replace HOME with its sandbox account at startup,
# so Astro's config path is explicitly pinned to /tmp and telemetry is off:
# this offline renderer must never try to write a global setting or phone home.
RUN printf 'publisher:x:1001:1001::/tmp:/sbin/nologin\n' >> /etc/passwd \
  && printf 'publisher:x:1001:\n' >> /etc/group \
  && chown -R 1001:1001 /var/task
ENV XDG_CONFIG_HOME=/tmp/.config \
    ASTRO_TELEMETRY_DISABLED=1
USER publisher

# The Lambda Node runtime splits the handler at its first dot. Keep the
# module filename dot-free: `publish-handler.bootstrap.handler` is parsed as
# module `publish-handler`, then fails before the bootstrap can load.
CMD ["publish-handler-bootstrap.handler"]
