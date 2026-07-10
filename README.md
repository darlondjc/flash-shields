# FlashShields

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Backend (api/) — dados de ligas/times

O app lê dados de ligas/times/escudos de uma API própria hospedada na Vercel
(`api/`), que por sua vez lê do Firestore (ligas/times) e do Vercel Blob
(escudos) — ver `docs/especificacao.md` (seção "Backend próprio") para o
desenho completo. `ng serve` sozinho **não** serve as rotas `/api/*`; para
testar o fluxo de importação localmente use `vercel dev` (ou aponte o app
pra um deployment já publicado).

Env vars necessárias nas functions (configurar na Vercel, nunca commitar):

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` —
  credenciais do Service Account do Admin SDK (só Firestore).
- `BLOB_READ_WRITE_TOKEN` — provisionada automaticamente ao criar um Blob
  Store na Vercel e conectar ao projeto.
- `CRON_SECRET` — protege `/api/cron/sync` contra chamadas externas (a
  Vercel injeta esse header automaticamente em disparos do Cron).
- `THESPORTSDB_API_KEY` — opcional, usa a chave de teste pública (`3`) se
  omitida.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
