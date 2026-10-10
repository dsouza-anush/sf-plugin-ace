import { readFileSync, writeFileSync } from 'node:fs';

const sort = (value) =>
  Array.isArray(value)
    ? value.map(sort)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sort(value[key])]),
        )
      : value;
const path = new URL('../oclif.manifest.json', import.meta.url);
writeFileSync(path, `${JSON.stringify(sort(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`);
