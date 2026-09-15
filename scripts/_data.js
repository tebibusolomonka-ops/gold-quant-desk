// Resolve a dataset path. Precedence:
//   1. an explicit path passed as the first CLI arg (anything without "=")
//   2. ../data/<name> inside this repo
//   3. a committed SAMPLE stand-in for <name>, with a loud warning on stderr
//   4. <name> relative to the current working directory
//
// Rule 3 exists so the repo runs out of the box, but it must never be silent:
// a number produced from the sample is not the number in the README.
const path = require('path');
const fs = require('fs');

const SAMPLES = {
  'xauusd_m15.json': 'xauusd_m15_2021_sample.json',
};

module.exports = function dataPath(name) {
  const cli = process.argv[2];
  if (cli && !cli.includes('=')) return cli;

  const dir = path.join(__dirname, '..', 'data');
  const full = path.join(dir, name);
  if (fs.existsSync(full)) return full;

  const sample = SAMPLES[name] && path.join(dir, SAMPLES[name]);
  if (sample && fs.existsSync(sample)) {
    process.stderr.write(
      `\n[data] ${name} not found — falling back to the committed SAMPLE ` +
      `(${SAMPLES[name]}).\n` +
      `[data] Sample results are NOT the full-history results quoted in the README.\n` +
      `[data] Build the full dataset with:  npm run fetch\n\n`
    );
    return sample;
  }
  return name;
};
