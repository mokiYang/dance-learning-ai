import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginLess } from '@rsbuild/plugin-less';
import { glob } from 'glob';
import path from 'node:path';

export default defineConfig(async () => {
  const entry = await getEntry();

  return {
    plugins: [pluginReact(), pluginNodePolyfill(), pluginLess()],
    source: { entry },
    server: {
      port: 3000,
      base: '/',
      open: true,
    },
  };
});

/**
 * @returns 构建编译入口文件列表
 */
async function getEntry() {
  const entryFiles = await glob('./src/**/main.{ts,tsx,js,jsx}');

  return Object.fromEntries(
    entryFiles.map((file) => {
      const entryName = path.basename(path.dirname(file));
      return [entryName, `./${file}`];
    }),
  )
}