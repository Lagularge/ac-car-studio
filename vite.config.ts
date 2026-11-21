import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { transformSync } from 'esbuild';

/**
 * Minifies the embedded AudioWorklet JS source and strips dead comment/indent padding
 * from the embedded CSP Lua runtime inside engineSoundEngine.ts at production build time,
 * keeping source code 100% readable while cutting ~40-50 KB from the EngineSim chunk.
 */
function minifyEmbeddedEngineAudioStrings(): Plugin {
  return {
    name: 'ac-minify-embedded-engine-audio',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/utils/engineSoundEngine.ts')) {
        return null;
      }

      let out = code;

      // 1. AST-minify ENGINE_WORKLET_CODE template literal via esbuild (LF/CRLF safe)
      const workletRe = /const ENGINE_WORKLET_CODE = `([\s\S]*?)\r?\n`;/;
      const wMatch = workletRe.exec(out);
      if (wMatch) {
        const min = transformSync(wMatch[1], {
          loader: 'js',
          minify: true,
          legalComments: 'none',
          target: 'es2022',
        });
        out =
          out.slice(0, wMatch.index) +
          `const ENGINE_WORKLET_CODE = ${JSON.stringify(min.code.trim())};` +
          out.slice(wMatch.index + wMatch[0].length);
      }

      // 2. Compact static Lua tail in buildCspEngineSoundLuaScript (strip pure comment/indent lines only)
      const luaTailRe = /(\r?\nlocal POS_TAILPIPE = vec3\([\s\S]*?)(\r?\n`;)/;
      const lMatch = luaTailRe.exec(out);
      if (lMatch) {
        const compactLua =
          '\n' +
          lMatch[1]
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('--'))
            .join('\n');
        out =
          out.slice(0, lMatch.index) +
          compactLua +
          lMatch[2] +
          out.slice(lMatch.index + lMatch[0].length);
      }

      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [minifyEmbeddedEngineAudioStrings(), react(), tailwindcss()],
  base: './',
  esbuild: {
    legalComments: 'none',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/three/examples/jsm/loaders')) {
            return 'vendor-three-loaders';
          }
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/d3-') ||
            id.includes('node_modules/lodash') ||
            id.includes('node_modules/react-smooth') ||
            id.includes('node_modules/decimal.js-light')
          ) {
            return 'vendor-charts';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
