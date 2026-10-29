import { defineConfig } from 'vite';

// Configuração do Vite para o Vale do Campo.
// base './' gera caminhos relativos: o build funciona na raiz do domínio (Netlify)
// e também em subpastas, sem ajustes.
export default defineConfig({
  base: './',
  server: {
    host: true, // permite abrir pelo celular na mesma rede (http://IP-DO-PC:5173)
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0, // imagens da interface ficam como arquivos (melhor cache)
  },
});
