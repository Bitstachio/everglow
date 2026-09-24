# Credential changes

This document is the structure for change password and change email. Follow it when implementing either flow. It is written for an engineer or an agent working in the mobile app.

The app does not store a password, and it does not treat a sign-in email as profile data. Auth0 holds both. The screen reads the address from the Auth0 profile (`useAuth0()`), not from the Everglow user payload.

---

## 1. What each side owns

**Auth0** owns the password and the sign-in email. The password is typed on an Auth0 page. The new email is submitted to Auth0 by our API, because a native app cannot call the Management API itself.

**The API** checks that this identity is allowed to change credentials, mints a password-change ticket, and forwards an email change. It does not accept a password, and it does not write the new email into the application database.

**The app** starts a password change, collects a new email address, and displays the email Auth0 already gave it. It must not hold a Management API credential, and it must not send a new password to the API.

```text
Password (signed in)     app → API (ticket only) → Auth0 page collects the password
Password (signed out)    Auth0 Universal Login "Forgot password?" (opened by Log In)
Email                    app → API → Auth0 Management API
```

Only a database identity can do either. The Auth0 `sub` looks like `auth0|…`. Apple (`apple|…`) and every other social connection have no password, and the email belongs to the identity provider. Hide both Security rows for those users.

`app/onboarding.tsx` already reads `auth0User.email` from `useAuth0()`. Use that same profile: `sub` decides which rows to show, `email` is the address on the profile. Do not add an email field to the Everglow user response to feed the screen.

---

## 2. Change password

There is one password form, and it is Auth0's. There are two ways to open it.

### 2.1 Signed in

Settings → Change Password. The user is already authenticated, so do not ask them to retype an email and do not wait for a message.

1. The app calls the API with the bearer token it already uses.
2. The API confirms the caller is `auth0|…` and asks Auth0 for a password-change ticket (`POST /api/v2/tickets/password-change`) for that user, passing only the native `client_id`. Do not send `result_url` with `client_id` — New Universal Login returns 400 (`result_url cannot be used together with client_id`).
3. The API returns the ticket URL and nothing else.
4. The app opens the URL in the system browser, the same class of browser Universal Login already uses (`webAuth.authorize` in `lib/auth0.ts`). Not a WebView.
5. The user types the new password on Auth0's page. After success they dismiss the browser (or tap "Back to app" if the Native application's Application Login URI is set — Auth0 requires `https` for that field). The app then revalidates the local session.

The ticket is the authorization. Auth0 does not ask for the current password. That is intentional: the session proved who they are, and the password never lands in the app or the API.

A password change often kills the refresh token. When the browser returns, if `getCredentials` fails, clear the local credentials and send the user to login. Do not try to keep the old session alive.

### 2.2 Signed out

Forgot password is Auth0 Universal Login’s own link. Log In opens that hosted page; the app does not add a second forgot-password form on the home screen.

The hosted link emails a reset URL that opens the same password page as the signed-in ticket. The API is not on this path.

### 2.3 Do not build an in-app password form

A screen with Current password, New password, and Confirm password cannot submit those values to Auth0.

The public Authentication API does not accept a new password. The only call that accepts a new password is the Management API, and a native app is not allowed to hold that credential. Sending the fields to the API instead means the server sees the password. We do not do that.

Checking the current password first would mean the legacy Resource Owner Password grant, then a Management API update. That grant is off once MFA or bot detection is on, and it still puts the password on the API. Do not enable it.

---

## 3. Change email

The app cannot do this with Auth0 directly. Auth0's client-facing My Account API covers MFA and linked accounts. It has no scope for the primary email. The only update is the Management API, and a public client cannot request a token for it.

### 3.1 Flow

1. The app shows a native form: one email field. Style it with the app's form system ([Forms](./forms.md), [UI scale](./ui-scale.md)). This form is native because it collects an address, not a password, and Auth0 will not accept the address from the app.
2. The app `POST`s the address to the API with the bearer token.
3. The API confirms the caller is `auth0|…`, then tells Auth0 to set `email`, set `email_verified` to `false`, and set `verify_email` to `true`. Auth0 updates the profile and sends its own verification mail. The API writes nothing locally and does not send mail.
4. The app refreshes the Auth0 profile and shows `user.email` from that profile.

Social identities, including Sign in with Apple, are rejected. Hide My Email and any other provider address stay in Auth0. The app displays them and does not copy them into profile data.

---

## 4. Styling the Auth0 page

Login, signup, and the password page are the same Universal Login theme. Brand that theme so the password page matches the app. Do not build a React Native password screen to get there.

The hosted page cannot use NativeWind classes. It can use the same tokens. The source of truth is the light values in `app/global.css`, mirrored in `theme/tokens.ts`. When a token changes, update the Auth0 theme from those files. Do not pick a nearby hex.

The theme API is one palette. It does not follow the device appearance, so it does not pick up the dark block in `global.css`. Map the light tokens. If the hosted page later has to follow dark mode, that is Advanced Customization (below), still fed from `colorTokens.dark`. Do not invent a second palette.

### 4.1 Token map

Apply this on Auth0's default Universal Login theme (`GET /api/v2/branding/themes/default`, merge, then `PATCH` that theme id). Universal Login renders the default theme only. Creating a second theme does nothing. A PATCH must include every top-level section (`colors`, `fonts`, `borders`, `widget`, `page_background`); a partial body wipes the rest.

Also set the tenant branding `colors.primary` to the accent and `colors.page_background` to the page background, so a Classic leftover does not diverge. The theme is what Universal Login actually paints.

The mapping is implemented in `theme/auth0-universal-login.ts` and applied with:

```sh
cd api && npm run auth0:sync-theme
```

That script reads `colorTokens.light`, PATCHes the default theme, updates tenant branding colors, and merges Everglow copy onto the `reset-password` prompt. Re-run it when light tokens change. Do not pick a nearby hex by hand.

| App token (`global.css`) | Light value | Auth0 theme field |
| --- | --- | --- |
| `background` | `#ffffff` | `page_background.background_color`, `colors.input_background` |
| `surface` | `#f8fafc` | `colors.widget_background` |
| `strong` | `#0f172a` | `colors.header` |
| `foreground` | `#1e293b` | `colors.body_text`, `colors.input_filled_text`, `colors.secondary_button_label` |
| `muted` | `#64748b` | `colors.input_labels_placeholders`, `colors.icons` |
| `accent` | `#4f46e5` | `colors.primary_button`, `colors.base_focus_color`, `colors.links_focused_components` |
| `accent-hover` | `#4338ca` | `colors.base_hover_color` |
| `accent-foreground` | `#ffffff` | `colors.primary_button_label` |
| `border` | `#e2e8f0` | `colors.widget_border`, `colors.input_border`, `colors.secondary_button_border` |
| `danger` | `#dc2626` | `colors.error` |
| `success` | `#16a34a` | `colors.success` |

That mapping matches the app's cards: a `background` page, a `surface` card, a `border` outline, accent buttons with white labels. See [Theme](./theme.md).

Shape comes from [UI scale](./ui-scale.md). Controls are 16px radius (`rounded-2xl`), not Auth0's default 3px.

| App | Auth0 |
| --- | --- |
| 16px control and card radius | `borders.button_border_radius`, `borders.input_border_radius`, `borders.widget_corner_radius` = `16` |
| Rounded controls | `borders.buttons_style` and `borders.inputs_style` = `rounded` |
| 1px card and input border | `borders.widget_border_weight` and `borders.input_border_weight` = `1` |
| 16px body text | `fonts.reference_text_size` = `16` |

Type is Inter, the UI face in the UI scale doc. Point `fonts.font_url` at an Inter file (woff). The app may still be on the system sans until `expo-font` loads Inter; the hosted page cannot use that system face, so it should load Inter directly and meet the app when the app does too.

Copy on the password screens is the Universal Login text for the `reset-password` prompt. Rewrite the title, button, and errors in our voice. Leave Auth0's own badge alone if the plan will not remove it. Do not add a second "Auth0" label of our own.

### 4.2 What has to be true for the theme to show

Password reset has to be on Universal Login. On the tenant, `change_password.enabled: true` forces the Classic reset page, and the theme is ignored. Login is already Universal Login (`webAuth.authorize` in `lib/auth0.ts`). Keep reset there too.

A custom domain is required for a page template (the HTML wrapper around the widget). It is not required for the colors, type, radius, or text above. Do not block the theme on a domain.

### 4.3 When the theme is not close enough

The theme still lays the form out as Auth0's centered card. It will not become a native stack screen with a Back row. If that gap is unacceptable, use Advanced Customization for Universal Login and replace the `reset-password` screen with our own web layout.

That screen is still hosted by Auth0. The password is still typed there, and it still never reaches the app or the API. Build it from the same hex values in `theme/tokens.ts`. For dark mode, switch those values with `prefers-color-scheme` using `colorTokens.dark`. Do not reimplement the screen in React Native.

---

## 5. Rejected approaches

- An in-app current / new / confirm password form.
- The API accepting a password and calling the Management API to set it.
- The Resource Owner Password grant, to "verify the current password."
- The app calling the Management API with a secret or a management token baked into the binary.
- Storing the sign-in email as profile data, or keeping a second "profile email" that does not change sign-in.
- A change-email call that only updates the Everglow user.
- Offering change password or change email to an Apple or other social identity.
- A WebView around the password page.
- A second Auth0 theme, or colors that are not the tokens in `app/global.css`.
