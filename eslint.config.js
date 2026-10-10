import js from '@eslint/js';
import ts from 'typescript-eslint';
import sfPlugin from 'eslint-plugin-sf-plugin';

export default ts.config(
  { ignores: ['lib/**', 'node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['src/**/*.ts'], plugins: { 'sf-plugin': sfPlugin }, rules: { ...sfPlugin.configs.recommended.rules } },
);
