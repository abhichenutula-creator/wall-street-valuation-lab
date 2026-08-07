// Verifies every web method imported by the Wix page bridge (Home.c1dmp.js)
// is actually exported by the backend file it's imported from. Catches the
// exact class of bug reported live: "function 'runScenarioValuation' not
// found from backend/valuationApi.web.js" — a frontend import that no
// longer matches what the backend module exports (e.g. a stale/removed
// export, or a renamed one left behind from an earlier phase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractExportedConstNames(source) {
  const matches = [...source.matchAll(/^export const (\w+)\s*=/gm)];
  return new Set(matches.map((m) => m[1]));
}

// Maps each backend module path Home.c1dmp.js imports from to its real file
// on disk (Wix's `backend/x.web` module specifier maps to src/backend/x.web.js).
const BACKEND_MODULE_MAP = {
  'backend/valuationApi.web': 'src/backend/valuationApi.web.js',
  'backend/companyImport.web': 'src/backend/companyImport.web.js',
  'backend/compsApi.web': 'src/backend/compsApi.web.js',
};

test('every backend function Home.c1dmp.js imports is actually exported by that backend file', () => {
  const homeSource = readSource('src/pages/Home.c1dmp.js');
  const importLines = [...homeSource.matchAll(/^import \{([^}]+)\} from '([^']+)';/gm)];

  const backendImportLines = importLines.filter(([, , modulePath]) => modulePath in BACKEND_MODULE_MAP);
  assert.ok(backendImportLines.length >= 3, 'expected at least the 3 known backend module imports in Home.c1dmp.js');

  backendImportLines.forEach(([, namesRaw, modulePath]) => {
    const importedNames = namesRaw.split(',').map((n) => n.trim()).filter(Boolean);
    const backendFile = BACKEND_MODULE_MAP[modulePath];
    const exportedNames = extractExportedConstNames(readSource(backendFile));

    importedNames.forEach((name) => {
      assert.ok(
        exportedNames.has(name),
        `Home.c1dmp.js imports "${name}" from "${modulePath}", but ${backendFile} does not export a const named "${name}". Exported: [${[...exportedNames].join(', ')}]`,
      );
    });
  });
});

test('no obsolete/dangling web method exports referencing removed debug functions remain', () => {
  ['src/backend/companyImport.web.js', 'src/backend/valuationApi.web.js', 'src/backend/compsApi.web.js'].forEach((file) => {
    const source = readSource(file);
    assert.ok(!/\bexport const debug\w*/i.test(source), `${file} still exports a temporary debug function — should have been removed after use`);
  });
});
