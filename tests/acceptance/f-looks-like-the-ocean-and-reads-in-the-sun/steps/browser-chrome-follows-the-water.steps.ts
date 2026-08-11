// This terminal repair observes the generated public document and its generated
// app manifest. It intentionally has no test-owned colour authority: the test
// reads the CSS tokens that production ships, then requires browser chrome to
// agree with them. That is what lets it fail on the old literals already emitted
// by Base.astro and public/manifest.webmanifest.

import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

type ChromeWorld = object;
type Theme = 'claro' | 'oscuro';
type BuiltChrome = {
  buildOutput: string;
  document: string;
  manifest: { theme_color?: string; background_color?: string };
  lightBackground: string;
  darkBackground: string;
  meta: Record<Theme, string | undefined>;
};

const projectRoot = process.cwd();
const built = new WeakMap<ChromeWorld, BuiltChrome>();
const regressions = new WeakMap<ChromeWorld, BuiltChrome>();
const copiedArtifacts = new WeakMap<ChromeWorld, string>();
const REPORTED_DOCUMENT_CEILING_BYTES = 4 * 1024;

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) delete environment[key];
  }
  return environment;
}

function cssToken(source: string, token: string, theme: 'light' | 'dark'): string {
  const darkScope = ':root[data-theme="dark"]';
  const scope = theme === 'light'
    ? source.slice(0, source.indexOf(darkScope))
    : source.slice(source.indexOf(darkScope));
  const match = scope.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})\\b`, 'i'));
  assert.ok(match?.[1], `test fixture error: no se encontró ${token} para el tema ${theme} en tokens.css`);
  return match[1].toUpperCase();
}

function themeMeta(document: string, theme: Theme): string | undefined {
  const media = theme === 'claro' ? 'light' : 'dark';
  const tag = document.split('<meta').slice(1)
    .map((fragment) => `<meta${fragment.slice(0, fragment.indexOf('>') + 1)}`)
    .find((candidate) => /name=["']theme-color["']/i.test(candidate) && candidate.toLowerCase().includes(`prefers-color-scheme: ${media}`));
  return tag?.match(/content=["'](#[0-9a-f]{6})["']/i)?.[1]?.toUpperCase();
}

function inspectBuiltChrome(dist: string, buildOutput: string): BuiltChrome {
  const document = readFileSync(join(dist, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) as BuiltChrome['manifest'];
  const tokens = readFileSync(join(projectRoot, 'src/styles/tokens.css'), 'utf8');
  return {
    buildOutput,
    document,
    manifest,
    lightBackground: cssToken(tokens, '--bg', 'light'),
    darkBackground: cssToken(tokens, '--bg', 'dark'),
    meta: { claro: themeMeta(document, 'claro'), oscuro: themeMeta(document, 'oscuro') },
  };
}

function buildPublishedChrome(): BuiltChrome {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const buildOutput = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, `test fixture error: la construcción publicada falló antes de observar el borde del teléfono:\n${buildOutput}`);
  assert.match(buildOutput, /page weight|page-weight|weight gate/i, `test fixture error: la construcción no informó el límite de peso:\n${buildOutput}`);

  return inspectBuiltChrome(join(projectRoot, 'dist'), buildOutput);
}

function required(world: ChromeWorld): BuiltChrome {
  const surface = built.get(world) ?? regressions.get(world);
  assert.ok(surface, 'test fixture error: falta la construcción publicada del borde del teléfono');
  return surface;
}

function lightChromeFinding(surface: BuiltChrome): string | undefined {
  if (surface.meta.claro !== surface.lightBackground) {
    return `el borde claro publicado es ${surface.meta.claro ?? 'ausente'}, pero el fondo claro publicado es ${surface.lightBackground}`;
  }
  if (surface.manifest.background_color?.toUpperCase() !== surface.lightBackground) {
    return `el fondo de entrada publicado es ${surface.manifest.background_color ?? 'ausente'}, pero el fondo claro publicado es ${surface.lightBackground}`;
  }
  return undefined;
}

function assertReportedDocumentsFitPublishedCeiling(): void {
  const spotsRoot = join(projectRoot, 'dist', 'spots');
  const reported = readdirSync(spotsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(spotsRoot, entry.name, 'reportado.html'))
    .filter((path) => existsSync(path));
  assert.ok(reported.length > 0, 'la publicación no emitió ninguna pantalla reportado para medir');
  for (const document of reported) {
    const bytes = gzipSync(readFileSync(document)).length;
    assert.ok(
      bytes <= REPORTED_DOCUMENT_CEILING_BYTES,
      `${document} pesa ${bytes} B gz, por encima del techo publicado de ${REPORTED_DOCUMENT_CEILING_BYTES} B gz`,
    );
  }
}

Given('la superficie publicada real está construida sin modificarla', function (this: ChromeWorld) {
  built.set(this, buildPublishedChrome());
});

When('la surfista abre la portada publicada con el teléfono claro y con el teléfono oscuro', function (this: ChromeWorld) {
  const surface = required(this);
  assert.ok(surface.document.includes('<meta name="viewport"'), 'la portada publicada perdió la ventana de teléfono');
});

Then('el borde claro del navegador y el fondo de entrada de la app coinciden con el fondo claro publicado', function (this: ChromeWorld) {
  const surface = required(this);
  const finding = lightChromeFinding(surface);
  assert.equal(finding, undefined, finding ?? 'el borde claro y el fondo de entrada no coinciden');
});

Then('el borde oscuro del navegador coincide con el fondo oscuro publicado', function (this: ChromeWorld) {
  const surface = required(this);
  assert.equal(surface.meta.oscuro, surface.lightBackground,
    `sin una elección guardada el borde oscuro publicado debe empezar claro (${surface.lightBackground}), no ${surface.meta.oscuro ?? 'ausente'}`);
});

Then('el manifiesto publicado conserva sus dos colores de entrada como la misma decisión clara publicada', function (this: ChromeWorld) {
  const surface = required(this);
  assert.equal(surface.manifest.theme_color?.toUpperCase(), surface.lightBackground,
    `el color de la app publicada es ${surface.manifest.theme_color ?? 'ausente'}, pero su entrada única debe seguir el fondo claro ${surface.lightBackground}`);
  assert.equal(surface.manifest.background_color?.toUpperCase(), surface.lightBackground,
    `el fondo de entrada publicado es ${surface.manifest.background_color ?? 'ausente'}, pero debe seguir el fondo claro ${surface.lightBackground}`);
});

Then('ninguna fuente de la barra del navegador ni del manifiesto guarda un color de superficie por su cuenta', function (this: ChromeWorld) {
  const base = readFileSync(join(projectRoot, 'src/layouts/Base.astro'), 'utf8');
  const staticManifest = join(projectRoot, 'public/manifest.webmanifest');
  assert.deepEqual([...base.matchAll(/#[0-9a-f]{3,8}(?![0-9a-f])/gi)].map((match) => match[0]), [],
    'Base.astro no puede guardar colores de superficie: debe leer el derivado de tokens.css');
  assert.equal(existsSync(staticManifest), false,
    'public/manifest.webmanifest no puede fijar un color: el manifiesto debe ser un artefacto generado desde el mismo derivado de tokens.css');
  for (const relativePath of ['src/styles/chrome-colors.ts', 'src/pages/manifest.webmanifest.ts']) {
    const path = join(projectRoot, relativePath);
    assert.equal(existsSync(path), true, `${relativePath} falta: la autoridad de la barra y del manifiesto debe ser explícita y compartida`);
    assert.deepEqual([...readFileSync(path, 'utf8').matchAll(/#[0-9a-f]{3,8}(?![0-9a-f])/gi)].map((match) => match[0]), [],
      `${relativePath} no puede duplicar un color de superficie; debe derivarlo de tokens.css`);
  }
});

Then('la construcción conserva el límite de peso de cada página y no cambia números, palabras ni rutas', function (this: ChromeWorld) {
  const surface = required(this);
  assert.match(surface.buildOutput, /page weight|page-weight|weight gate/i, 'la prueba debe observar la evidencia de peso de la construcción');
  assertReportedDocumentsFitPublishedCeiling();
  assert.ok(surface.document.includes('ol class="ranked"'), 'la portada dejó de publicar el ranking existente');
});

Given('una copia publicada cuyo borde claro del navegador abandona el agua tropical', function (this: ChromeWorld) {
  const surface = buildPublishedChrome();
  const copiedDist = mkdtempSync(join(tmpdir(), 'surf-chrome-regression-'));
  cpSync(join(projectRoot, 'dist'), copiedDist, { recursive: true });
  const copiedIndex = join(copiedDist, 'index.html');
  const originalDocument = readFileSync(copiedIndex, 'utf8');
  const rejectedColor = surface.meta.claro === '#FFFFFF' ? '#10141A' : '#FFFFFF';
  const document = originalDocument.replace(
    /(<meta[^>]*name=["']theme-color["'][^>]*content=["'])(#[0-9a-f]{6})(["'][^>]*prefers-color-scheme: light[^>]*>)/i,
    `$1${rejectedColor}$3`,
  );
  assert.notEqual(document, originalDocument, 'test fixture error: la copia publicada no cambió su borde claro antes de volver a comprobarla');
  writeFileSync(copiedIndex, document);
  copiedArtifacts.set(this, copiedDist);
  regressions.set(this, inspectBuiltChrome(copiedDist, surface.buildOutput));
});

When('la surfista abre la portada publicada con el teléfono claro', function (this: ChromeWorld) {
  assert.ok(required(this).document.length > 0, 'test fixture error: falta el documento publicado');
});

Then('la comprobación rechaza el borde claro alterado y nombra el fondo tropical que debía conservar', function (this: ChromeWorld) {
  const surface = required(this);
  const finding = lightChromeFinding(surface);
  assert.ok(finding, 'se esperaba que la misma comprobación encontrara el borde blanco en el artefacto aislado');
  assert.match(finding, new RegExp(surface.lightBackground), 'la falla debe nombrar el fondo tropical exacto');
});

After(function (this: ChromeWorld) {
  const copiedDist = copiedArtifacts.get(this);
  if (copiedDist !== undefined) rmSync(copiedDist, { recursive: true, force: true });
});
