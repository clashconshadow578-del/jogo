# Ferramenta de migração (registro histórico)

Gerou `src/`, `public/assets/`, `index.html` e `src/styles/` a partir de `legacy/Vale_do_Campo_V64.html`.
Foi usada **uma vez**; depois que `src/` passa a ser editado à mão, não rode o gerador sobre o projeto
(ele apaga e recria `src/`, `public/assets/` e `legacy/`).

Requer Node.js e os pacotes `acorn`, `acorn-walk`, `eslint-scope`, `eslint-visitor-keys` e `prettier`
(instale-os numa pasta separada, ex.: `npm i acorn acorn-walk eslint-scope eslint-visitor-keys prettier`).

```bash
node tools/migration/extract.js            # 0. separa os <script> do HTML original
node tools/migration/plan.js               # 1. relatório: escritas entre módulos e código sem uso
OUT=/tmp/saida node tools/migration/build-project.js   # 2. gera o projeto (FIXES=0 = sem as correções de bugs)
node tools/migration/check.js /tmp/saida/src            # 3. verifica imports/exports e nomes não resolvidos
```

| Arquivo | Papel |
| --- | --- |
| `analyze.js` | divide cada script em comandos (com comentários) e resolve identificadores por escopo |
| `map.txt` | mapa comando → módulo → função de inicialização (revisado à mão) |
| `plan.js` | aplica o mapa e calcula dependências |
| `generate.js` | gera imports/exports, setters, camadas `extend()`, inicializações e o `core/Game.js` |
| `special.js` | casos tratados à mão, extração de imagens, correções de bugs |
| `descriptions.json` | descrição de cada módulo (cabeçalho dos arquivos) |
| `build-project.js` | escreve os arquivos, formata com Prettier, separa o CSS, gera `index.html` |
| `check.js` | verificação estática das ligações entre módulos |
