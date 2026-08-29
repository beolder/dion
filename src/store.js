'use strict';

const fs = require('fs');
const path = require('path');

function defaultData() {
  return {
    providers: [],
    active: { providerId: null, model: null },
    settings: { codexHome: '', forceApiKeyMode: true, mergeCatalog: false }
  };
}

function dataFile(dataDir) {
  return path.join(dataDir, 'any-switch.json');
}

function load(dataDir) {
  const file = dataFile(dataDir);
  if (!fs.existsSync(file)) return defaultData();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...defaultData(), ...parsed };
  } catch {
    return defaultData();
  }
}

function save(dataDir, data) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile(dataDir), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function upsertProvider(data, provider) {
  const idx = data.providers.findIndex((p) => p.id === provider.id);
  if (idx === -1) data.providers.push(provider);
  else data.providers[idx] = { ...data.providers[idx], ...provider };
  return data;
}

module.exports = { defaultData, load, save, upsertProvider, dataFile };
