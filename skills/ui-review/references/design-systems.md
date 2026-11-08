# Stack and design-system guidance

The jury script picks every section whose `Matches:` line shares a name with the detected stack and passes it to the expert reviewers. The fixer reads the same sections before editing code. Fix through the system's own tokens and components; never paste raw hex values or one-off CSS over a design system.

## Material Design 3
Matches: Material UI (MUI), Angular Material, Vuetify, Material Web, Material Components Web, Quasar
- Guidelines: https://m3.material.io
- Touch targets at least 48 x 48 dp; 4/8 dp spacing grid; type roles (display, headline, title, body, label) from the theme.
- Colour through theme roles (primary, on-primary, surface, on-surface, error); state layers for hover, focus, pressed.
- MUI: change `createTheme` tokens and `sx` with theme values; use `Button`, `TextField` (has label and helperText) instead of raw elements.
- Angular Material: use `mat-form-field` with `mat-label` and `mat-error`; theme via Sass `mat.theme` mixins.
- Vuetify: `v-text-field` with `label` and `rules`; theme via `createVuetify({ theme })`.

## Tailwind CSS
Matches: Tailwind CSS, daisyUI
- Use the project's theme (`tailwind.config.*` or `@theme` in CSS) and existing spacing and colour scale; avoid arbitrary values like `text-[#999]`.
- Focus: `focus-visible:outline-2 focus-visible:outline-offset-2` or `focus-visible:ring-*`; never `outline-none` without a replacement.
- Screen-reader text: `sr-only`; motion: `motion-safe:` / `motion-reduce:` variants.
- daisyUI: use component classes (`btn`, `input`, `label`) and theme colours.

## shadcn/ui and Radix
Matches: Radix UI / shadcn/ui, Headless UI
- Reuse the existing components in `components/ui` (Button variants, Input with Label, Dialog, Form) instead of new markup.
- Radix and Headless UI primitives already implement the WAI-ARIA patterns; keep them, do not replace them with divs.
- Colours are CSS variables (`--primary`, `--muted-foreground`, ...) in the global CSS; fix contrast there.

## Bootstrap
Matches: Bootstrap
- Guidelines: https://getbootstrap.com/docs/5.3/getting-started/accessibility/
- Override Sass or CSS variables (`--bs-primary`, `$primary`), not single components.
- Use `.form-label`, `.invalid-feedback`, `.visually-hidden`; keep the default focus ring or replace it with an equally visible one.

## Chakra UI, Mantine, Ant Design
Matches: Chakra UI, Mantine, Ant Design
- Theme tokens via `extendTheme` / `createTheme` / `ConfigProvider`; use `FormControl`/`FormLabel`/`FormErrorMessage` (Chakra), `TextInput label error` (Mantine), `Form.Item label rules` (Ant).

## Fluent 2
Matches: Fluent UI
- Guidelines: https://fluent2.microsoft.design; tokens from `@fluentui/react-components` themes; `Field` wraps inputs with label and validation message.

## IBM Carbon
Matches: IBM Carbon
- Guidelines: https://carbondesignsystem.com; use Carbon tokens (`$text-primary`, `$layer`), `TextInput labelText invalidText`.

## Government design systems
Matches: GOV.UK Design System, U.S. Web Design System
- Follow the published patterns exactly (question pages, error summary, buttons); they are already user-tested. Fix deviations from the pattern rather than inventing new ones.

## Ionic and native-feeling apps
Matches: Ionic
- Apple HIG (https://developer.apple.com/design/human-interface-guidelines): 44 x 44 pt targets, Dynamic Type, safe areas. Material 3 on Android mode.

## React family
Matches: React, Next.js, Remix / React Router, Gatsby, Preact
- Lint: `eslint-plugin-jsx-a11y`. Use `<button>` and `<a href>` instead of clickable divs; manage focus after route changes and in dialogs.
- Next.js: `next/image` with width and height (prevents CLS), `next/font` (prevents font-swap shifts), `metadata` for titles and `lang` in the root layout.
- Gatsby: `gatsby-plugin-image`.

## Vue family
Matches: Vue, Nuxt
- Lint: `eslint-plugin-vuejs-accessibility`. Nuxt: `@nuxt/image`, `useHead({ htmlAttrs: { lang } })`, `<NuxtLink>`.

## Angular
Matches: Angular
- Lint: `@angular-eslint/template` accessibility rules; CDK `a11y` (FocusTrap, LiveAnnouncer); `NgOptimizedImage` with width and height.

## Svelte family
Matches: Svelte, SvelteKit
- Fix every compiler `a11y_*` warning; `svelte:head` for title; `enhanced:img` for images.

## Astro
Matches: Astro
- `<Image />` from `astro:assets` with dimensions; keep islands minimal so INP stays low.

## Static HTML and server-rendered templates
Matches: jQuery, Alpine.js, htmx, static
- Semantic HTML first: landmarks (`header`, `nav`, `main`, `footer`), one `h1`, `<label for>`, `<button>`. Add `<meta name="viewport" content="width=device-width, initial-scale=1">` and `<html lang>`.
- htmx: announce swapped content with `aria-live` regions; Alpine: keep `x-on:click` on real buttons.

## CMS
Matches: WordPress, Shopify, Webflow, Wix, Squarespace, Drupal, TYPO3
- Change the theme or template, not single pages. WordPress: `theme.json` for colours, typography and spacing; block patterns. Shopify: theme settings and Liquid sections. Hosted builders (Wix, Squarespace, Webflow): produce instructions for the editor when no code is available.
