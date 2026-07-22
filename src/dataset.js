const fs = require('fs');

function loadMichiganDataset(datasetPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load Michigan district dataset: ${error.message}`);
  }
  if (!parsed?.Michigan || typeof parsed.Michigan !== 'object') throw new Error('Michigan district dataset is missing the Michigan root object');

  const schools = [];
  for (const [isd, counties] of Object.entries(parsed.Michigan)) {
    if (!counties || typeof counties !== 'object') throw new Error(`Invalid counties for ISD: ${isd}`);
    for (const [county, names] of Object.entries(counties)) {
      if (!Array.isArray(names)) throw new Error(`Invalid school list for ${isd}/${county}`);
      for (const school of names) {
        if (typeof school !== 'string' || !school.trim()) throw new Error(`Invalid school name for ${isd}/${county}`);
        schools.push({ key: `${isd}\0${county}\0${school}`, isd, county, school });
      }
    }
  }
  if (!schools.length) throw new Error('Michigan district dataset contains no schools');
  return schools;
}

module.exports = { loadMichiganDataset };
