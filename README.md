# Grocery List

A simple grocery list application built with preeact, TypeScript, Vite, and Cloudflare Workers.

You can create a list by visiting a given hash: https://grocery-list.lkbm.workers.dev/#your-list-name
It will be saved to Cloudflare KV.

The "Standard items" list will be empty by default. You can create a second list, https://grocery-list.lkbm.workers.dev/#your-list-name-options and populate it with items you frequently purchase, and that will then populate the Standard items section of your main list.

Items will be sorted by store section, which is currently hardcoded to be suitable for my local Ingles. Sorry if your store differs. I wrote this 'cause I'd been using a checkbox list in Google Docs and it was terrible on mobile.

Typically, after a shopping trip, I'll use "Prune Purchases" to clear out anything I bought (hopefully everything!) -- the "Remove Items" button will put you in a mode where you can select items to delete individually, but I find that's rarely needed.

This is not vibe coded, but was my first "almost vibe coded" project. Prior to this, I mostly used Copilot autocompletion and the occasional "write me a script".
# Run locally
nvm use
nvm install
npm run dev

# Deploy

wrangler deploy

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
