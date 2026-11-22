import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react()],
 test:{
  environment:'jsdom',
  include:['tests/**/*.test.{ts,tsx}'],
  coverage:{
   provider:'v8',reporter:['text','json-summary','html'],
   include:['src/**/*.{ts,tsx}'],
   exclude:['src/main.tsx'],
  }
 }
});
