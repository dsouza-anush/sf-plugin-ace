import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Plugin } from '@oclif/core';

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
const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = new Plugin({
  root,
  type: 'core',
  ignoreManifest: true,
  errorOnManifestCreate: true,
  respectNoCacheDefault: true,
});
await plugin.load();
if (!plugin.valid) throw new Error('Cannot generate a manifest for an invalid plugin.');
writeFileSync(
  new URL('../oclif.manifest.json', import.meta.url),
  `${JSON.stringify(sort(plugin.manifest), null, 2)}\n`,
);
