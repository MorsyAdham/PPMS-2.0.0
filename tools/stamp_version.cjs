// Called by tools/deploy.sh — writes the version stamp into the deploy checkout:
//   scripts/core/build-info.js  window.PPMS_BUILD = { version, label, deployedAt, notes }
//                               (the version this code IS; loaded with the app)
//   version.json                same fields + files[] (the latest deployed version,
//                               fetched live by the navbar version chip)
//
// Usage: node tools/stamp_version.cjs <sourceDir> <deployDir> <label> <versionId> <notes>
const fs = require('fs');
const path = require('path');

const [src, out, label, versionId, notes = ''] = process.argv.slice(2);
if (!src || !out || !label || !versionId) {
    console.error('usage: stamp_version.cjs <sourceDir> <deployDir> <label> <versionId> <notes>');
    process.exit(1);
}

function walk(dir, base = dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full, base);
        return /\.(js|css|html)$/.test(e.name) ? [path.relative(base, full).split(path.sep).join('/')] : [];
    });
}

const build = { version: versionId, label, deployedAt: new Date().toISOString(), notes: notes.split('\n')[0] };
const files = walk(src).sort();
fs.mkdirSync(path.join(out, 'scripts', 'core'), { recursive: true });
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ ...build, files }, null, 1));
fs.writeFileSync(path.join(out, 'scripts', 'core', 'build-info.js'),
    '/* Written by tools/deploy.sh - the version of PPMS this code is. */\n'
    + `window.PPMS_BUILD = ${JSON.stringify(build)};\n`);
console.log(`Stamped ${label} (${files.length} files)`);
