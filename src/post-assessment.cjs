// Phase 4 in the main process: presence (SUS) and the weather probe, recomputed from the learner's answers before they reach a document.
// The renderer has the same rules (renderer.js, "Phase 4"); test/post-assessment.test.cjs keeps both in agreement.
const fs = require('node:fs');
const path = require('node:path');

// Slater-Usoh-Steed questionnaire: 6 items, 1 to 7. Mean below 4 (the scale midpoint) = low presence -> VR result inconclusive.
// The cut-off is an initial choice, to be calibrated with the professor.
const SUS_ITEMS = 6;
const LOW_PRESENCE_MEAN = 4;

function presenceScore(answers) {
  if (!Array.isArray(answers) || answers.length !== SUS_ITEMS || !answers.every(a => Number.isInteger(a) && a >= 1 && a <= 7)) return null;
  const mean = Math.round((answers.reduce((sum, a) => sum + a, 0) / SUS_ITEMS) * 100) / 100;
  // highCount: answers of 6 or 7, Slater's original SUS count (0-6), kept for the analysis.
  return { mean, highCount: answers.filter(a => a >= 6).length, validity: mean < LOW_PRESENCE_MEAN ? 'inconclusive' : 'valid' };
}

const loadProbe = appPath => JSON.parse(fs.readFileSync(path.join(appPath, 'data', 'climate-probe.json'), 'utf8'));

// null when the entry does not match its form (unknown form, wrong number of answers, out-of-range choice).
function probeScore(probe, entry) {
  const items = entry && probe.forms[entry.form];
  if (!items || !Array.isArray(entry.answers) || entry.answers.length !== items.length
    || !entry.answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < items[i].options.length)) return null;
  return { form: entry.form, score: entry.answers.filter((a, i) => a === items[i].correctIndex).length, total: items.length };
}

// Line for the certificate: before the VR x after the review quiz. null when the probe was not taken (sessions before phase 4).
function weatherCheckLine(probe, state) {
  const before = probeScore(probe, state.probe?.pre);
  if (!before) return null;
  const after = probeScore(probe, state.probe?.post);
  return `Weather check (module 5): before VR ${before.score}/${before.total} · after review ${after ? `${after.score}/${after.total}` : 'not taken'}`;
}

module.exports = { SUS_ITEMS, LOW_PRESENCE_MEAN, presenceScore, loadProbe, probeScore, weatherCheckLine };
