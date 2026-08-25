# Profile Page Test Specification

## Feature Information

| Field                       | Content                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature name                | Profile Page                                                                                                                                                                                                                                                                                                                                        |
| Feature ID                  | `PROFILE`                                                                                                                                                                                                                                                                                                                                           |
| Description                 | Authenticated mobile users can view and refresh their own profile, edit name/email, choose/change/remove an avatar, log out, or delete their account.                                                                                                                                                                                               |
| Relevant components/modules | `mobile/app/(tabs)/profile.tsx`; `ProfileScreen`; `ProfileHeader`; `ProfileAvatar`; `ProfileAccountSection`; `ProfileActions`; `EditProfileModal`; `useProfileScreen`; `useEditProfileModal`; `useAvatarPicker`; profile React Query hooks/client; `AuthProvider`; API `UsersController`, `UsersService`, DTOs, mapper, Prisma `User`/`UserDetails` |
| Dependencies                | Expo Router, React Native, React Query, Axios, Auth0 credentials/session handling, Expo Image Picker, NestJS API, PostgreSQL/Prisma, S3-compatible avatar storage                                                                                                                                                                                   |
| Preconditions               | Mobile app is wrapped by `AuthProvider` and `QueryClientProvider`; API base path is `/api/v2`; unless a case says otherwise the actor is authenticated, onboarded, and owns the fixture profile                                                                                                                                                     |
| Actors / user roles         | Authenticated current user; unauthenticated visitor; authenticated user with expired/revoked token. There are no profile admin or role variants.                                                                                                                                                                                                    |
| Out of scope                | Onboarding form, Auth0 login/signup UI, editing another user's profile, camera capture, avatar cropping implementation inside the OS picker, event/gallery behavior, backend unit tests that do not affect the Profile page contract                                                                                                                |
| Assumptions                 | See numbered assumptions and open questions below.                                                                                                                                                                                                                                                                                                  |

### Behavioral Contract

- The route is `/(tabs)/profile`, exposed as the **Profile** tab.
- `GET /users/me` supplies the authenticated user's profile. Focusing the screen invalidates `profileKeys.me()`; pull-to-refresh calls `refetch()`.
- The page displays `details.name`, `details.email`, and either `details.avatarUrl` or an uppercase first-character fallback.
- Only name and email are editable. Save sends changed fields only; a no-change save closes without a request. Successful mutations replace both the profile query cache and Auth context user.
- Avatar press opens an action alert. Users without an avatar can choose a photo; users with one can change or remove it. Selection requests media-library permission and configures square editing at quality `0.8`.
- Logout and account deletion require confirmation. Successful account deletion logs out; failed deletion keeps the account/session intact and reports an error.
- API errors are converted to `ProfileApiError`; response message arrays are joined with `, ` and network failures use `Network error. Please check your connection.`

### Data and Validation Contract

| Field               | Read                                   | Edit                   | Nullability / fallback                                      | Server validation                                                            |
| ------------------- | -------------------------------------- | ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `id`                | Returned, not displayed                | No                     | Required UUID                                               | Derived from authenticated identity, never accepted from Profile UI          |
| `isOnboarded`       | Used by auth/navigation, not displayed | No                     | Required boolean                                            | `details !== null` in mapper                                                 |
| `details.name`      | Yes                                    | Yes                    | Backend requires details; UI fallback is `User`             | String, non-empty, maximum 255 characters; input is not trimmed              |
| `details.email`     | Yes                                    | Yes                    | Backend requires details; UI fallback is `user@example.com` | Valid email, non-empty, unique, maximum 255 characters; input is not trimmed |
| `details.avatarUrl` | Yes                                    | Via upload/delete only | Nullable; fallback initial is first name character or `U`   | Presigned URL derived from private `avatarKey`                               |
| Avatar file         | N/A                                    | Yes                    | Required for upload                                         | MIME `image/jpeg`, `image/png`, or `image/webp`; maximum 5,242,880 bytes     |
| Timestamps          | Returned, not displayed                | No                     | Required by backend response                                | Server-managed                                                               |

### API Contract

All endpoints require a bearer token and are scoped to its resolved current-user ID.

| Method | Path                      | Request                     | Success                                           |
| ------ | ------------------------- | --------------------------- | ------------------------------------------------- |
| GET    | `/api/v2/users/me`        | None                        | `200`, wrapped `UserResponseDto`                  |
| PATCH  | `/api/v2/users/me`        | Partial `{ name?, email? }` | `200`, wrapped updated `UserResponseDto`          |
| POST   | `/api/v2/users/me/avatar` | Multipart field `avatar`    | `200`, wrapped profile with presigned `avatarUrl` |
| DELETE | `/api/v2/users/me/avatar` | None                        | `200`, wrapped profile with `avatarUrl: null`     |
| DELETE | `/api/v2/users/me`        | None                        | `204`, then client logout                         |

Applicable errors are `400` invalid/unknown fields or avatar; `401` missing/invalid token; `404` missing current user or avatar; `409` duplicate email; `422` incomplete onboarding; and generic `5xx`/network failures. `403` is not applicable because there is no role-based profile resource or client-supplied target user ID.

### State Model

- Auth context profile is supplied as React Query `initialData`; an authenticated user should see cached profile data while a request is in flight.
- `isFetching` drives the pull-to-refresh spinner for initial/focus/manual refetches.
- Edit form is reset from the latest profile whenever the modal opens or its visible profile values change.
- Save and Cancel are disabled while update is pending. Avatar press is disabled and overlaid with a spinner while upload/delete is pending. Delete Account changes to `Deleting...` and is disabled while pending. Logout uses the shared button spinner while auth is loading.
- Update/avatar success synchronizes query cache and Auth context. Mutation failure leaves previous profile state unchanged.

### Assumptions and Open Questions

- **A-01:** Production intent is that unauthenticated users cannot render the Profile tab and are redirected to `/login`, consistent with the API guard and global 401 handler. The tab layout currently has no explicit route guard.
- **A-02:** Cached profile data should remain visible during refresh and transient fetch failure; no retry behavior is specified beyond React Query defaults.
- **A-03:** Closing the edit modal discards unsaved input without a confirmation because no dirty-form confirmation exists.
- **A-04:** Server validation is authoritative. The current client performs no pre-submit name/email validation and does not trim values.
- **A-05:** Name is free-form Unicode text. Script-like strings must render as inert text, not execute or alter layout semantics.
- **A-06:** Supported responsive targets are phone and tablet in portrait/landscape; the `480px` modal maximum is the only explicit content-width rule. Desktop web behavior is not a committed product target.
- **A-07:** Avatar replacement intentionally overwrites the stable per-user object key `avatars/<userId>`.
- **A-08:** An account-deletion success alert may race with logout navigation. Product/design must decide whether it should appear before or after `/login` is displayed.
- **A-09:** Product/data-retention behavior for account deletion when the user owns events, photos, or access records is not defined. The schema does not cascade every user relationship.

### Known Gaps / Expected Failures

- **G-01:** No explicit full-page initial loading, empty, or fetch-error message exists. The header can show `User` / `user@example.com`, which may misleadingly look like real data. Affects `PROFILE-RENDER-004`, `PROFILE-API-002`, and `PROFILE-API-008`.
- **G-02:** The Profile tab has no explicit unauthenticated route guard. A direct route can render fallback content until another auth flow redirects. Affects `PROFILE-AUTH-002`.
- **G-03:** Edit inputs have visible text labels but no programmatic association (`accessibilityLabel`/labelled-by); the modal does not explicitly move focus to its heading/first input or restore focus. Affects `PROFILE-A11Y-002` and `PROFILE-A11Y-003`.
- **G-04:** Success/error alerts and loading changes do not define live-region announcements. Affects `PROFILE-A11Y-003`.
- **G-05:** Whitespace-only names pass current server validation and leading/trailing whitespace is persisted. Desired normalization is unresolved. Affects `PROFILE-EDGE-001`.
- **G-06:** The picker filters the UI to images, but client code does not pre-check MIME type or file size. Rejection relies on the API after upload begins. Affects `PROFILE-VAL-008`.
- **G-07:** Avatar removal has no second destructive confirmation; account deletion does. Product confirmation is needed before requiring one.
- **G-08:** A successful profile fetch does not update Auth context, although update/avatar mutations do. The screen is current via query cache, but other consumers of Auth context may remain stale. Affects `PROFILE-REG-001`.
- **G-09:** Avatar upload and account deletion mutate object storage before the database operation, with no compensating rollback. A failed database write can leave a replaced/deleted object inconsistent with `avatarKey`; related user records may also make account deletion fail. Affects `PROFILE-REG-002`.

### Existing Automated Coverage

- API E2E tests cover current-user GET/PATCH/delete, missing-token `401`, invalid update `400`, unknown property `400`, missing user `404`, incomplete onboarding `422`, duplicate email `409`, avatar upload success/incomplete onboarding, and avatar delete success/no-avatar `404`.
- `UsersService` unit tests cover persistence, uniqueness, missing user/details, S3 upload/delete, account-avatar cleanup, and unexpected database errors. `UserMapper` tests cover avatar URL generation and omission of `avatarKey`.
- There are no mobile Profile component, hook, API-client, navigation, accessibility, or mobile E2E tests. Existing API coverage does not fully cover avatar missing/invalid type/size at HTTP level.

## Test Case Summary

| ID                 | Category         | Test Case                                                      | Priority | Test Type   |
| ------------------ | ---------------- | -------------------------------------------------------------- | -------- | ----------- |
| PROFILE-RENDER-001 | Rendering        | Render an onboarded user's profile                             | High     | Component   |
| PROFILE-RENDER-002 | Rendering        | Render an existing remote avatar                               | Medium   | Component   |
| PROFILE-RENDER-003 | Rendering        | Render initial fallback when avatar is absent                  | Medium   | Component   |
| PROFILE-RENDER-004 | Rendering        | Handle null or missing profile details                         | High     | Component   |
| PROFILE-RENDER-005 | Rendering        | Retain cached content while refetching                         | High     | Component   |
| PROFILE-FUNC-001   | Functional       | Open and prepopulate Edit Profile                              | High     | Component   |
| PROFILE-FUNC-002   | Functional       | Save a name-only change                                        | High     | Component   |
| PROFILE-FUNC-003   | Functional       | Save an email-only change                                      | High     | Component   |
| PROFILE-FUNC-004   | Functional       | Save simultaneous name and email changes                       | High     | Component   |
| PROFILE-FUNC-005   | Functional       | Cancel and discard unsaved edits                               | Medium   | Component   |
| PROFILE-FUNC-006   | Functional       | Close without requesting an unchanged save                     | Medium   | Component   |
| PROFILE-FUNC-007   | Functional       | Keep edit modal open after update failure                      | High     | Component   |
| PROFILE-FUNC-008   | Functional       | Show avatar actions appropriate to avatar state                | Medium   | Component   |
| PROFILE-FUNC-009   | Functional       | Handle denied photo-library permission                         | Medium   | Component   |
| PROFILE-FUNC-010   | Functional       | Cancel image picking without upload                            | Low      | Component   |
| PROFILE-FUNC-011   | Functional       | Upload or replace a selected avatar                            | High     | Component   |
| PROFILE-FUNC-012   | Functional       | Remove an existing avatar                                      | High     | Component   |
| PROFILE-FUNC-013   | Functional       | Confirm or cancel logout                                       | High     | Component   |
| PROFILE-FUNC-014   | Functional       | Cancel account deletion                                        | Critical | Component   |
| PROFILE-FUNC-015   | Functional       | Delete account and end the session                             | Critical | E2E         |
| PROFILE-VAL-001    | Validation       | Accept a valid Unicode name                                    | High     | Integration |
| PROFILE-VAL-002    | Validation       | Reject an empty name                                           | High     | Integration |
| PROFILE-VAL-003    | Validation       | Accept a 255-character name                                    | Medium   | Integration |
| PROFILE-VAL-004    | Validation       | Reject a 256-character name                                    | High     | Integration |
| PROFILE-VAL-005    | Validation       | Accept a valid email change                                    | High     | Integration |
| PROFILE-VAL-006    | Validation       | Reject malformed or empty email values                         | High     | Integration |
| PROFILE-VAL-007    | Validation       | Enforce email length boundary                                  | Medium   | Integration |
| PROFILE-VAL-008    | Validation       | Reject missing, unsupported, or oversized avatar files         | High     | Integration |
| PROFILE-STATE-001  | State Management | Seed profile query from authenticated user                     | Medium   | Unit        |
| PROFILE-STATE-002  | State Management | Prevent duplicate profile update submissions                   | High     | Component   |
| PROFILE-STATE-003  | State Management | Disable avatar interaction while mutation is pending           | Medium   | Component   |
| PROFILE-STATE-004  | State Management | Synchronize successful mutations to cache and Auth context     | High     | Component   |
| PROFILE-STATE-005  | State Management | Preserve prior state after mutation failure                    | High     | Component   |
| PROFILE-API-001    | API              | Fetch and unwrap the current profile                           | High     | Integration |
| PROFILE-API-002    | API              | Map profile fetch network/server failure                       | High     | Unit        |
| PROFILE-API-003    | API              | Send changed update fields and surface validation messages     | High     | Integration |
| PROFILE-API-004    | API              | Surface duplicate-email conflict without mutation              | High     | Integration |
| PROFILE-API-005    | API              | Handle missing user and incomplete onboarding                  | High     | Integration |
| PROFILE-API-006    | API              | Build authenticated multipart avatar upload                    | High     | Integration |
| PROFILE-API-007    | API              | Handle avatar and account mutation failures                    | High     | Integration |
| PROFILE-API-008    | API              | Handle malformed successful profile responses safely           | Medium   | Unit        |
| PROFILE-AUTH-001   | Authentication   | Reject profile endpoints without valid authentication          | Critical | Integration |
| PROFILE-AUTH-002   | Authentication   | Redirect an unauthenticated deep link to login                 | Critical | E2E         |
| PROFILE-AUTH-003   | Authentication   | Clear an expired session on 401                                | Critical | E2E         |
| PROFILE-PERM-001   | Authorization    | Resolve all profile operations from token identity             | Critical | Integration |
| PROFILE-PERM-002   | Authorization    | Prevent client state from targeting another user               | Critical | Integration |
| PROFILE-NAV-001    | Navigation       | Open Profile from the tab bar                                  | High     | E2E         |
| PROFILE-NAV-002    | Navigation       | Refetch when Profile gains focus                               | Medium   | Component   |
| PROFILE-NAV-003    | Navigation       | Pull to refresh and complete the indicator                     | Medium   | Component   |
| PROFILE-UI-001     | UI               | Present correct pending and destructive action states          | Medium   | Component   |
| PROFILE-UI-002     | UI               | Preserve usable layout across supported sizes and themes       | Medium   | Component   |
| PROFILE-A11Y-001   | Accessibility    | Expose action controls with accessible names and roles         | High     | Component   |
| PROFILE-A11Y-002   | Accessibility    | Programmatically label edit inputs                             | High     | Component   |
| PROFILE-A11Y-003   | Accessibility    | Manage modal focus and announce asynchronous feedback          | Medium   | Component   |
| PROFILE-EDGE-001   | Edge Case        | Define whitespace preservation behavior                        | Medium   | Integration |
| PROFILE-EDGE-002   | Edge Case        | Render long and special-character profile values safely        | Medium   | Component   |
| PROFILE-SEC-001    | Security         | Reject unknown or identity-bearing update fields               | Critical | Integration |
| PROFILE-SEC-002    | Security         | Return public avatar URL without storage secrets               | High     | Integration |
| PROFILE-REG-001    | Regression       | Keep refreshed profile consistent across consumers and revisit | High     | E2E         |
| PROFILE-REG-002    | Regression       | Avoid partial storage changes when database mutation fails     | High     | Integration |

### Coverage Breakdown

- **Total:** 60 test cases.
- **By category:** Rendering 5; Functional 15; Validation 8; State Management 5; API 8; Authentication 3; Authorization 2; Navigation 3; UI 2; Accessibility 3; Edge Case 2; Security 2; Regression 2.
- **By test type:** Unit 3; Component 31; Integration 21; E2E 5.
- **By priority:** Critical 8; High 33; Medium 18; Low 1.

## Detailed Test Cases

### `[PROFILE-RENDER-001] Render an onboarded user's profile`

**Category:** Rendering

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Authenticated, onboarded user; profile query has succeeded.

**Test Data:**

- `name: "Jane Doe"`, `email: "jane@example.com"`, `avatarUrl: null`.

**Steps:**

1. Render the Profile route with the fixture.
2. Observe the header, account section, and actions.

**Expected Result:**

- `Jane Doe`, `jane@example.com`, `Account Settings`, `Edit Profile`, `Logout`, and `Delete Account` are visible exactly once.

**Automation Notes:**

- Component-test `ProfileScreen`; mock `useProfileScreen` and assert visible text/accessibility roles, not class names.

**Related Requirements / Components:**

- `ProfileScreen`, `ProfileHeader`, `ProfileAccountSection`, `ProfileActions`.

### `[PROFILE-RENDER-002] Render an existing remote avatar`

**Category:** Rendering

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Profile has a non-null avatar URL.

**Test Data:**

- `avatarUrl: "https://cdn.example.test/avatar"`, `name: "Jane"`.

**Steps:**

1. Render `ProfileAvatar` with the fixture.
2. Inspect the rendered image and fallback.

**Expected Result:**

- The image source uses the exact URL with cover fitting; the `J` fallback is not rendered; the surrounding change-photo button remains available.

**Automation Notes:**

- Mock `expo-image` and assert its `source.uri` and `contentFit` props.

**Related Requirements / Components:**

- `ProfileAvatar`, `UserMapper.toResponseDto`.

### `[PROFILE-RENDER-003] Render initial fallback when avatar is absent`

**Category:** Rendering

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Profile has `avatarUrl: null`.

**Test Data:**

- Names `jane`, `Élodie`, and empty/missing.

**Steps:**

1. Render once per test datum without an avatar URL.
2. Observe the fallback circle.

**Expected Result:**

- Fallback text is respectively `J`, `É`, and `U`; no remote image is rendered.

**Automation Notes:**

- Use a table-driven component test; keep each input/result reportable under this ID.

**Related Requirements / Components:**

- `ProfileAvatar` initial derivation.

### `[PROFILE-RENDER-004] Handle null or missing profile details`

**Category:** Rendering

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Query data is missing or contains `details: null`.

**Test Data:**

- `undefined` and `{ id, isOnboarded: false, details: null }`.

**Steps:**

1. Render the screen for each state.
2. Open Edit Profile.

**Expected Result:**

- The current implementation does not crash, renders `User`, `user@example.com`, and `U`, and opens empty edit fields. This fallback must not be treated as verified account data.

**Automation Notes:**

- Assert current fallback behavior and tag the test with G-01; add a product-approved loading/empty assertion when the gap is resolved.

**Related Requirements / Components:**

- G-01; `ProfileHeader`; `useEditProfileModal`.

### `[PROFILE-RENDER-005] Retain cached content while refetching`

**Category:** Rendering

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Cached profile exists; refetch promise is unresolved.

**Test Data:**

- Cached name/email and a controllable pending request.

**Steps:**

1. Render from cache.
2. trigger refetch and hold the promise.

**Expected Result:**

- Cached name/email remain visible and the RefreshControl reports refreshing; placeholder identity is never substituted.

**Automation Notes:**

- Use a fresh QueryClient and deferred promise; assert both content and refresh prop.

**Related Requirements / Components:**

- A-02; `useProfileQuery`; `ProfileScreen`.

### `[PROFILE-FUNC-001] Open and prepopulate Edit Profile`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Current profile is rendered and modal is closed.

**Test Data:**

- `Jane Doe`, `jane@example.com`.

**Steps:**

1. Press `Edit profile`.
2. Inspect both inputs.

**Expected Result:**

- Modal title is `Edit Profile`; Name and Email contain the exact current values; Save and Cancel are enabled.

**Automation Notes:**

- Test screen/hook composition and query inputs by accessible label once G-03 is fixed.

**Related Requirements / Components:**

- `ProfileAccountSection`, `EditProfileModal`, `useEditProfileModal`.

### `[PROFILE-FUNC-002] Save a name-only change`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Edit modal open with unchanged current email.

**Test Data:**

- Change name from `Jane Doe` to `Jane Smith`.

**Steps:**

1. Replace Name and press Save.
2. Resolve update successfully.

**Expected Result:**

- Exactly one mutation receives `{ name: "Jane Smith" }`; `email` is absent; modal closes; success alert says `Profile updated successfully`.

**Automation Notes:**

- Mock mutation with a deferred promise and `Alert.alert`; assert exact payload/count.

**Related Requirements / Components:**

- `useEditProfileModal.submit`, `useUpdateProfileMutation`.

### `[PROFILE-FUNC-003] Save an email-only change`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Edit modal open with unchanged current name.

**Test Data:**

- Change email to `jane.smith@example.com`.

**Steps:**

1. Replace Email and press Save.
2. Resolve update successfully.

**Expected Result:**

- One mutation receives only `{ email: "jane.smith@example.com" }`; modal closes and success feedback appears.

**Automation Notes:**

- Assert omitted name rather than `name: undefined`.

**Related Requirements / Components:**

- `useEditProfileModal.submit`.

### `[PROFILE-FUNC-004] Save simultaneous name and email changes`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Edit modal open.

**Test Data:**

- New name and a unique valid email.

**Steps:**

1. Change both inputs and save.
2. Resolve the response with both new values.

**Expected Result:**

- One PATCH mutation contains both fields; header displays both returned values after success.

**Automation Notes:**

- Exercise hook plus QueryClient; assert response-driven UI, not optimistic values.

**Related Requirements / Components:**

- `updateProfile`, `useUpdateProfileMutation`.

### `[PROFILE-FUNC-005] Cancel and discard unsaved edits`

**Category:** Functional

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Edit modal contains unsaved changes and no request is pending.

**Test Data:**

- Temporary name/email differing from the profile.

**Steps:**

1. Press Cancel.
2. Reopen Edit Profile.

**Expected Result:**

- No PATCH occurs; header remains unchanged; reopened fields use the latest saved profile rather than temporary values; no confirmation is shown.

**Automation Notes:**

- Assert mutation count zero across close/reopen; relates to A-03.

**Related Requirements / Components:**

- A-03; `useEditProfileModal` reset effect.

### `[PROFILE-FUNC-006] Close without requesting an unchanged save`

**Category:** Functional

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Modal fields exactly equal current profile values.

**Test Data:**

- Unchanged name/email.

**Steps:**

1. Press Save without edits.
2. Observe modal and network boundary.

**Expected Result:**

- Modal closes; no mutation or success alert occurs.

**Automation Notes:**

- Mock mutation and Alert; assert both remain uncalled.

**Related Requirements / Components:**

- `useEditProfileModal.submit` no-change branch.

### `[PROFILE-FUNC-007] Keep edit modal open after update failure`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Changed form; update rejects.

**Test Data:**

- `ProfileApiError("User with email already exists")`.

**Steps:**

1. Submit the changed form.
2. Reject the request.

**Expected Result:**

- Error alert displays the exact message; modal remains visible with entered values; header/cache remain unchanged and controls re-enable.

**Automation Notes:**

- Await rejection and assert no close or success feedback.

**Related Requirements / Components:**

- `useEditProfileModal`, `ProfileApiError`.

### `[PROFILE-FUNC-008] Show avatar actions appropriate to avatar state`

**Category:** Functional

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Avatar button is enabled.

**Test Data:**

- `hasAvatar: false` then `true`.

**Steps:**

1. Press `Change profile photo` in each state.
2. Inspect alert actions.

**Expected Result:**

- Without avatar: `Choose Photo`, `Cancel`; with avatar: `Change Photo`, destructive `Remove Photo`, `Cancel`; no other action appears.

**Automation Notes:**

- Unit/component-test `useAvatarPicker` with mocked `Alert.alert`.

**Related Requirements / Components:**

- `useAvatarPicker.showAvatarActions`.

### `[PROFILE-FUNC-009] Handle denied photo-library permission`

**Category:** Functional

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- User chooses photo; permission request resolves `granted: false`.

**Test Data:**

- Denied media-library permission.

**Steps:**

1. Invoke Choose/Change Photo.
2. Resolve permission denial.

**Expected Result:**

- Alert title is `Permission Required` with the implemented guidance; picker and upload are not invoked.

**Automation Notes:**

- Mock Expo Image Picker functions and assert zero downstream calls.

**Related Requirements / Components:**

- `useAvatarPicker.pickAndUploadAvatar`.

### `[PROFILE-FUNC-010] Cancel image picking without upload`

**Category:** Functional

**Priority:** Low

**Test Type:** Component

**Preconditions:**

- Permission granted; picker returns `canceled: true` or no first asset.

**Test Data:**

- Both cancellation result variants.

**Steps:**

1. Choose a photo.
2. Return each cancellation result.

**Expected Result:**

- No upload and no success/error alert occurs; current avatar remains unchanged.

**Automation Notes:**

- Table-drive the two picker results; assert mutation count zero.

**Related Requirements / Components:**

- `useAvatarPicker`.

### `[PROFILE-FUNC-011] Upload or replace a selected avatar`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Permission granted; picker returns one image; test once with and once without an existing avatar.

**Test Data:**

- Asset `{ uri, fileName: null, mimeType: null }`, returned profile with new URL.

**Steps:**

1. Choose/Change Photo and select the asset.
2. Resolve upload.

**Expected Result:**

- Picker receives images-only, editing, square aspect, quality `0.8`; upload uses URI, generated `.jpg` filename, and `image/jpeg`; new image appears and success alert says `Avatar updated successfully`.

**Automation Notes:**

- Freeze time for deterministic fallback filename; assert exact picker options/payload.

**Related Requirements / Components:**

- A-07; `useAvatarPicker`, `uploadAvatar`.

### `[PROFILE-FUNC-012] Remove an existing avatar`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Existing avatar; Remove Photo chosen.

**Test Data:**

- Successful response with `avatarUrl: null`, name `Jane`.

**Steps:**

1. Select Remove Photo.
2. Resolve deletion.

**Expected Result:**

- One delete-avatar mutation occurs; remote image is replaced by `J`; success alert says `Avatar removed successfully`.

**Automation Notes:**

- Assert cache-driven rerender and single request; note G-07 has no confirmation requirement yet.

**Related Requirements / Components:**

- G-07; `useDeleteAvatarMutation`.

### `[PROFILE-FUNC-013] Confirm or cancel logout`

**Category:** Functional

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Authenticated Profile page.

**Test Data:**

- Logout confirmation actions.

**Steps:**

1. Press Logout and choose Cancel.
2. Repeat and choose destructive Logout.

**Expected Result:**

- Alert text asks for confirmation; Cancel makes no logout call; confirmation calls logout exactly once.

**Automation Notes:**

- Capture `Alert.alert` action callbacks and invoke each deterministically.

**Related Requirements / Components:**

- `useProfileScreen.handleLogout`, `AuthProvider.logout`.

### `[PROFILE-FUNC-014] Cancel account deletion`

**Category:** Functional

**Priority:** Critical

**Test Type:** Component

**Preconditions:**

- Authenticated Profile page.

**Test Data:**

- Delete Account confirmation alert.

**Steps:**

1. Press Delete Account.
2. Choose Cancel.

**Expected Result:**

- Warning states the action cannot be undone; no DELETE request or logout occurs; profile remains usable.

**Automation Notes:**

- Invoke cancel callback and assert mutation/logout count zero.

**Related Requirements / Components:**

- `useProfileScreen.handleDeleteAccount`.

### `[PROFILE-FUNC-015] Delete account and end the session`

**Category:** Functional

**Priority:** Critical

**Test Type:** E2E

**Preconditions:**

- Isolated authenticated test user; optional avatar fixture.

**Test Data:**

- Current user's account.

**Steps:**

1. Confirm Delete Account.
2. Wait for completion and attempt an authenticated revisit.

**Expected Result:**

- API returns `204`; user record and owned avatar object are deleted; local/Auth0 credentials are cleared; app navigates to `/login`; old session cannot reopen the profile.

**Automation Notes:**

- Use a disposable account and mock/test object store; resolve A-08 when asserting success-alert timing.

**Related Requirements / Components:**

- A-08; `useDeleteAccountMutation`; `UsersService.remove`; `AuthProvider.logout`.

### `[PROFILE-VAL-001] Accept a valid Unicode name`

**Category:** Validation

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user with a different current name.

**Test Data:**

- `{ name: "Élodie 李 🚀" }`.

**Steps:**

1. PATCH the current profile with the payload.
2. Fetch the profile again.

**Expected Result:**

- PATCH returns `200`; exact Unicode text is stored and returned by PATCH and GET without corruption.

**Automation Notes:**

- Run through the real validation pipe/controller/service with database mocked or isolated.

**Related Requirements / Components:**

- A-05; `CreateUserDetailsDto`; `UpdateUserDto`.

### `[PROFILE-VAL-002] Reject an empty name`

**Category:** Validation

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user.

**Test Data:**

- `{ name: "" }`.

**Steps:**

1. PATCH the payload.
2. Inspect response and persistence calls.

**Expected Result:**

- Response is `400` with a validation message; no profile update is persisted.

**Automation Notes:**

- Use API E2E setup and assert `prisma.user.update` is not called.

**Related Requirements / Components:**

- `@IsNotEmpty()` on `CreateUserDetailsDto.name`.

### `[PROFILE-VAL-003] Accept a 255-character name`

**Category:** Validation

**Priority:** Medium

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user.

**Test Data:**

- Name containing exactly 255 characters.

**Steps:**

1. PATCH the boundary value.
2. Read the response.

**Expected Result:**

- Response is `200` and returns the full 255-character value unchanged.

**Automation Notes:**

- Generate the string deterministically and assert length plus equality.

**Related Requirements / Components:**

- `STRING_LIMITS.STANDARD`; Prisma `VarChar(255)`.

### `[PROFILE-VAL-004] Reject a 256-character name`

**Category:** Validation

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user.

**Test Data:**

- Name containing exactly 256 characters.

**Steps:**

1. PATCH the over-boundary value.
2. Inspect persistence.

**Expected Result:**

- Response is `400`; message identifies maximum-length failure; stored name remains unchanged.

**Automation Notes:**

- Assert validation rejects before service persistence.

**Related Requirements / Components:**

- `@MaxLength(255)`.

### `[PROFILE-VAL-005] Accept a valid email change`

**Category:** Validation

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- New email is not used by another user.

**Test Data:**

- `{ email: "jane+profile@example.co.uk" }`.

**Steps:**

1. PATCH the email.
2. Observe uniqueness query and response.

**Expected Result:**

- Response is `200`; uniqueness check excludes the current user's ID; exact email is returned.

**Automation Notes:**

- Assert `NOT: { userId: currentId }` and exact update payload.

**Related Requirements / Components:**

- `UsersService.assertEmailIsUnique`.

### `[PROFILE-VAL-006] Reject malformed or empty email values`

**Category:** Validation

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user.

**Test Data:**

- `""`, `"not-an-email"`, `"a@"`, and a non-string value.

**Steps:**

1. PATCH each value in an isolated request.
2. Inspect response and stored profile.

**Expected Result:**

- Every request returns `400`; validation message is present; no request changes the email.

**Automation Notes:**

- Use a table-driven API test while reporting all variants under this ID.

**Related Requirements / Components:**

- `@IsEmail()`, `@IsNotEmpty()`, `@IsString()` behavior through `ValidationPipe`.

### `[PROFILE-VAL-007] Enforce email length boundary`

**Category:** Validation

**Priority:** Medium

**Test Type:** Integration

**Preconditions:**

- Generated emails are syntactically valid for the validator and unique.

**Test Data:**

- Longest valid email accepted by both `IsEmail` and the 255-character field constraint; a syntactically comparable value over 255 characters.

**Steps:**

1. PATCH each boundary payload.
2. Inspect status and persistence.

**Expected Result:**

- In-range value succeeds; over-255 value returns `400` and is not stored. If the email validator has a stricter RFC limit, document and assert that effective lower limit.

**Automation Notes:**

- Build lengths programmatically and assert the effective contract explicitly in the test name/data.

**Related Requirements / Components:**

- `@IsEmail()`, `@MaxLength(255)`, Prisma `VarChar(255)`.

### `[PROFILE-VAL-008] Reject missing, unsupported, or oversized avatar files`

**Category:** Validation

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user; S3 is mocked.

**Test Data:**

- Missing multipart field; `image/gif`; JPEG of 5,242,881 bytes. Control: JPEG/PNG/WebP at or below 5,242,880 bytes.

**Steps:**

1. POST each multipart fixture.
2. Inspect response and S3/database calls.

**Expected Result:**

- Invalid fixtures return `400` with the exact configured message and cause no upload/update; control formats/size pass validation.

**Automation Notes:**

- Add HTTP-level cases missing from current E2E coverage; do not allocate a huge real file when a sized Multer fixture suffices.

**Related Requirements / Components:**

- G-06; `USER_AVATAR_CONSTANTS`; `UsersService.assertValidAvatarFile`.

### `[PROFILE-STATE-001] Seed profile query from authenticated user`

**Category:** State Management

**Priority:** Medium

**Test Type:** Unit

**Preconditions:**

- Auth context has a user; query cache is empty.

**Test Data:**

- Auth user fixture and both authentication boolean states.

**Steps:**

1. Render `useProfileQuery`.
2. Inspect immediate data and request enablement.

**Expected Result:**

- Authenticated hook immediately exposes the exact Auth user and enables GET; unauthenticated hook has no initial data and does not call GET.

**Automation Notes:**

- Hook-test with a fresh QueryClient and mocked `useAuth`/`getProfile`.

**Related Requirements / Components:**

- `useProfileQuery`.

### `[PROFILE-STATE-002] Prevent duplicate profile update submissions`

**Category:** State Management

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Changed edit form; update promise held pending.

**Test Data:**

- One valid changed name.

**Steps:**

1. Press Save twice rapidly.
2. Inspect controls and request count before resolving.

**Expected Result:**

- Only one mutation occurs; Save shows loading and both Save/Cancel are disabled until settlement.

**Automation Notes:**

- Use a deferred promise and user-event press attempts; assert count exactly one.

**Related Requirements / Components:**

- `EditProfileModal`, shared `Button`.

### `[PROFILE-STATE-003] Disable avatar interaction while mutation is pending`

**Category:** State Management

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Avatar upload or delete promise is pending.

**Test Data:**

- Both pending mutation variants.

**Steps:**

1. Begin an avatar mutation.
2. Attempt another avatar press.

**Expected Result:**

- Avatar has a dark overlay/spinner and is disabled; no second action alert or request starts; state clears on settlement.

**Automation Notes:**

- Assert disabled prop and invocation count; avoid pixel snapshot dependence.

**Related Requirements / Components:**

- `useAvatarPicker.isAvatarLoading`, `ProfileAvatar`.

### `[PROFILE-STATE-004] Synchronize successful mutations to cache and Auth context`

**Category:** State Management

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Query and Auth context contain the old user.

**Test Data:**

- Successful update, upload, and delete-avatar response fixtures.

**Steps:**

1. Resolve each mutation with its updated full user.
2. Inspect cache and `updateUser` call.

**Expected Result:**

- For each mutation, `profileKeys.me()` equals the exact returned user and `updateUser` receives that same object once.

**Automation Notes:**

- Parameterize the three mutation hooks with isolated QueryClients.

**Related Requirements / Components:**

- `useUpdateProfileMutation`, `useUploadAvatarMutation`, `useDeleteAvatarMutation`.

### `[PROFILE-STATE-005] Preserve prior state after mutation failure`

**Category:** State Management

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Existing profile in query/Auth state; update/avatar/delete-account mutation rejects.

**Test Data:**

- `ProfileApiError("Service unavailable")`.

**Steps:**

1. Run each failing mutation path.
2. Inspect query, Auth user, modal/session, and feedback.

**Expected Result:**

- Cached/Auth profile is unchanged; update modal stays open, avatar remains unchanged, and failed account deletion does not logout; exact error is shown.

**Automation Notes:**

- Separate implementation tests may be parameterized, but assert no `setQueryData`, `updateUser`, or logout on error.

**Related Requirements / Components:**

- Profile mutation hooks and action handlers.

### `[PROFILE-API-001] Fetch and unwrap the current profile`

**Category:** API

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Valid bearer token resolves to the fixture user.

**Test Data:**

- Wrapped API response `{ data: user, meta }`.

**Steps:**

1. Call `getProfile` against GET `/users/me`.
2. Inspect request and returned value.

**Expected Result:**

- Authorization header is attached; client returns `response.data.data` exactly; server selects only the token user's record.

**Automation Notes:**

- Use an Axios adapter/MSW equivalent or API E2E test; assert base prefix separately from relative client path.

**Related Requirements / Components:**

- `getProfile`, Axios request interceptor, `UsersController.findMe`.

### `[PROFILE-API-002] Map profile fetch network/server failure`

**Category:** API

**Priority:** High

**Test Type:** Unit

**Preconditions:**

- GET rejects; cached data may exist.

**Test Data:**

- Axios response with string message; message array; `error` field; request-only network error; plain Error; unknown value.

**Steps:**

1. Call `getProfile` for each error form.
2. Observe rejection and screen state after settlement.

**Expected Result:**

- Every rejection is `ProfileApiError` with respectively server message, joined array, server error, connection guidance, Error message, or unexpected-error fallback; cached data remains and refreshing ends. No dedicated error UI currently appears.

**Automation Notes:**

- Unit-test client mapping; separately document G-01 rather than asserting invented error UI.

**Related Requirements / Components:**

- A-02; G-01; `extractErrorMessage`, `wrapRequest`.

### `[PROFILE-API-003] Send changed update fields and surface validation messages`

**Category:** API

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Changed form; API returns `400` validation envelope.

**Test Data:**

- Exact partial update plus response `message: ["name should not be empty", "email must be an email"]`.

**Steps:**

1. Save the form.
2. Capture PATCH and reject with the response.

**Expected Result:**

- PATCH `/users/me` contains no unchanged/unknown fields; alert message joins the array with `, `; no success state is applied.

**Automation Notes:**

- Combine API-client and hook integration with mocked transport.

**Related Requirements / Components:**

- `updateProfile`, `ProfileApiError`.

### `[PROFILE-API-004] Surface duplicate-email conflict without mutation`

**Category:** API

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Another user's details use the requested email.

**Test Data:**

- PATCH unique-conflict fixture.

**Steps:**

1. PATCH the duplicate email.
2. Observe API response, database update, and client feedback.

**Expected Result:**

- API returns `409` with `EMAIL_TAKEN` message; no update occurs; client displays that message and retains entered form/profile state.

**Automation Notes:**

- Existing API E2E covers status; add client integration for feedback/state.

**Related Requirements / Components:**

- `UsersService.assertEmailIsUnique`, `useEditProfileModal`.

### `[PROFILE-API-005] Handle missing user and incomplete onboarding`

**Category:** API

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Token maps to no user for one run and a user with `details: null` for another.

**Test Data:**

- PATCH/avatar operations for `404` and `422` states.

**Steps:**

1. Invoke the applicable current-user operations.
2. Inspect status, side effects, and message.

**Expected Result:**

- Missing user returns `404`; incomplete onboarding returns `422` for update/upload/delete-avatar; no database/S3 mutation occurs; client surfaces the server message.

**Automation Notes:**

- Table-drive endpoints where outcome is identical; keep status fixtures isolated.

**Related Requirements / Components:**

- `UsersService.getById`, `ONBOARDING_INCOMPLETE`.

### `[PROFILE-API-006] Build authenticated multipart avatar upload`

**Category:** API

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Selected valid asset and available bearer token.

**Test Data:**

- `{ uri: "file:///avatar.png", fileName: "avatar.png", mimeType: "image/png" }`.

**Steps:**

1. Call `uploadAvatar`.
2. Inspect outgoing request and returned user.

**Expected Result:**

- POST targets `/users/me/avatar`; FormData contains one `avatar` part with URI/name/type; content type is multipart and auth interceptor supplies bearer token; wrapped data is returned.

**Automation Notes:**

- Mock FormData/transport at the native boundary; do not assert generated multipart boundary text.

**Related Requirements / Components:**

- `uploadAvatar`, Axios interceptor, `UsersController.uploadAvatar`.

### `[PROFILE-API-007] Handle avatar and account mutation failures`

**Category:** API

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- Each mutation returns `400`, `404`, `500`, timeout, or request-only network error as applicable.

**Test Data:**

- Avatar validation/no-avatar messages and generic server/network fixtures.

**Steps:**

1. Invoke upload, remove, and confirmed account delete for relevant failures.
2. Observe feedback and state.

**Expected Result:**

- Server messages are displayed exactly; network errors use connection guidance; generic non-`ProfileApiError` hook failures use action-specific fallback; no success alert, cache mutation, or logout occurs.

**Automation Notes:**

- Parameterize action/status pairs and assert action-specific fallback strings.

**Related Requirements / Components:**

- Profile API wrappers and `useAvatarPicker`/`useProfileScreen` catches.

### `[PROFILE-API-008] Handle malformed successful profile responses safely`

**Category:** API

**Priority:** Medium

**Test Type:** Unit

**Preconditions:**

- Transport resolves `200` with missing `data.data`, wrong detail types, or invalid avatar URL.

**Test Data:**

- `{}`, `{ data: {} }`, and structurally invalid user objects.

**Steps:**

1. Return each malformed response to `getProfile`/mutation.
2. Observe client return and render attempt.

**Expected Result:**

- Current client merely unwraps and may return `undefined`; render must not crash for missing data, but schema-invalid data is not validated or reported. Treat visible fallback as G-01, not successful profile load.

**Automation Notes:**

- Characterization test current behavior; open a contract-validation requirement before expecting rejection.

**Related Requirements / Components:**

- G-01; `profileApi`, `ProfileScreen` optional chaining.

### `[PROFILE-AUTH-001] Reject profile endpoints without valid authentication`

**Category:** Authentication

**Priority:** Critical

**Test Type:** Integration

**Preconditions:**

- No bearer token or an invalid token; real JWT guard active.

**Test Data:**

- GET, PATCH, avatar POST/DELETE, and account DELETE requests.

**Steps:**

1. Send each request without valid credentials.
2. Inspect status and side effects.

**Expected Result:**

- Every endpoint returns `401`; no user, database, or S3 read/write for the requested operation succeeds.

**Automation Notes:**

- Current test guard covers missing token on several endpoints; add avatar and invalid-token matrix with production-equivalent guard behavior.

**Related Requirements / Components:**

- `JwtAuthGuard`; controller-level `@UseGuards`.

### `[PROFILE-AUTH-002] Redirect an unauthenticated deep link to login`

**Category:** Authentication

**Priority:** Critical

**Test Type:** E2E

**Preconditions:**

- No Auth0/local credentials and Auth bootstrap complete.

**Test Data:**

- Direct deep link to `/(tabs)/profile`.

**Steps:**

1. Launch the app at the Profile route.
2. Wait for auth initialization.

**Expected Result:**

- Production intent: `/login` replaces the route; no profile controls, fallback identity, or GET request is exposed. Current implementation is expected to fail until G-02 is resolved.

**Automation Notes:**

- E2E with clean secure credential storage; assert route and absence of Profile content.

**Related Requirements / Components:**

- A-01; G-02; `AuthProvider`; tab layout.

### `[PROFILE-AUTH-003] Clear an expired session on 401`

**Category:** Authentication

**Priority:** Critical

**Test Type:** E2E

**Preconditions:**

- App starts authenticated but API rejects profile request with `401` after token renewal is unavailable/revoked.

**Test Data:**

- Stored stale credentials and a `401` GET response.

**Steps:**

1. Open/refetch Profile.
2. Wait for response interceptor and auth handler.

**Expected Result:**

- Local credentials and Auth user are cleared; route is replaced with `/login`; stale Profile cannot be used; error still rejects to the query layer without a redirect loop.

**Automation Notes:**

- Mock credential manager plus router for integration, retain one E2E session-expiry journey.

**Related Requirements / Components:**

- Axios unauthorized handler; `AuthProvider.handleSessionExpired`.

### `[PROFILE-PERM-001] Resolve all profile operations from token identity`

**Category:** Authorization

**Priority:** Critical

**Test Type:** Integration

**Preconditions:**

- Two users exist; token belongs to User A.

**Test Data:**

- GET/PATCH/avatar/delete requests made with User A token while User B exists.

**Steps:**

1. Perform each `/users/me` operation.
2. Inspect service arguments and both users' records.

**Expected Result:**

- Every service call uses User A's resolved ID; only User A can be read/mutated/deleted; User B remains byte-for-byte unchanged.

**Automation Notes:**

- Integration-test current-user decorator/guard with distinct fixtures; never infer ownership only from route text.

**Related Requirements / Components:**

- `CurrentUser`, `UsersController`, `JwtStrategy`.

### `[PROFILE-PERM-002] Prevent client state from targeting another user`

**Category:** Authorization

**Priority:** Critical

**Test Type:** Integration

**Preconditions:**

- Token belongs to User A; client query/cache is tampered to contain User B ID.

**Test Data:**

- PATCH body with valid fields plus attempted `id`, `userId`, or `details.userId`.

**Steps:**

1. Send each tampered request with User A token.
2. Inspect response and both records.

**Expected Result:**

- Identity-bearing/unknown fields cause `400`; no request can select User B; neither record changes from a rejected payload.

**Automation Notes:**

- Run real global ValidationPipe (`forbidNonWhitelisted: true`) and token identity resolution.

**Related Requirements / Components:**

- `UpdateUserDto`; `configureApp`; `/users/me` design.

### `[PROFILE-NAV-001] Open Profile from the tab bar`

**Category:** Navigation

**Priority:** High

**Test Type:** E2E

**Preconditions:**

- Authenticated/onboarded user begins on Gallery or Events.

**Test Data:**

- Profile tab accessible name/title.

**Steps:**

1. Activate Profile tab.
2. Observe active tab and screen.

**Expected Result:**

- Route becomes `/(tabs)/profile`; Profile tab is active; current user's profile content renders without stacking a duplicate screen.

**Automation Notes:**

- Select the tab by accessible label/title, not coordinates.

**Related Requirements / Components:**

- `mobile/app/(tabs)/_layout.tsx`, profile route.

### `[PROFILE-NAV-002] Refetch when Profile gains focus`

**Category:** Navigation

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Query cached; screen is navigated away from then focused again.

**Test Data:**

- `profileKeys.me()` and a server response with a newer name.

**Steps:**

1. Simulate focus.
2. Resolve invalidated query.

**Expected Result:**

- `invalidateQueries` is called with exactly `profileKeys.me()` once per focus; returned fresh profile replaces displayed cached values.

**Automation Notes:**

- Mock `useFocusEffect` or use navigation test harness and spy on QueryClient.

**Related Requirements / Components:**

- `useProfileScreen` focus effect.

### `[PROFILE-NAV-003] Pull to refresh and complete the indicator`

**Category:** Navigation

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Screen rendered with cached data.

**Test Data:**

- Deferred successful and failed refetch promises.

**Steps:**

1. Invoke RefreshControl `onRefresh` for each outcome.
2. Observe during and after settlement.

**Expected Result:**

- Exactly one refetch starts; spinner is active only while fetching and stops after success or failure; success shows returned data and failure retains cached data.

**Automation Notes:**

- Assert `refreshing` transition and call count with controlled promises.

**Related Requirements / Components:**

- A-02; `ProfileScreen`, `useProfileScreen.refresh`.

### `[PROFILE-UI-001] Present correct pending and destructive action states`

**Category:** UI

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Independently place logout, account delete, edit save, and avatar operations in pending state.

**Test Data:**

- Hook state fixtures for each pending action.

**Steps:**

1. Render each state.
2. Inspect labels, spinners, and enabled state.

**Expected Result:**

- Logout and Save show spinners and disable; Cancel disables during save; Delete Account becomes disabled `Deleting...`; avatar disables with spinner overlay; destructive controls retain danger treatment when idle.

**Automation Notes:**

- Assert semantic props/text; visual color may be covered by a minimal style assertion.

**Related Requirements / Components:**

- `Button`, `ProfileActions`, `EditProfileModal`, `ProfileAvatar`.

### `[PROFILE-UI-002] Preserve usable layout across supported sizes and themes`

**Category:** UI

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Supported phone/tablet portrait and landscape viewports; light/dark theme.

**Test Data:**

- Long valid name/email and modal open; representative viewport matrix.

**Steps:**

1. Render each size/theme with long values.
2. Open modal and keyboard.

**Expected Result:**

- Actions remain reachable by scrolling; content does not overlap or clip controls; modal is full available width minus padding and capped at 480px; text/input contrast theme styles apply; keyboard avoidance keeps Save/Cancel reachable.

**Automation Notes:**

- Component/layout assertions plus targeted device screenshots; avoid broad snapshot-only approval.

**Related Requirements / Components:**

- A-06; `ScrollView`, `KeyboardAvoidingView`, NativeWind dark styles.

### `[PROFILE-A11Y-001] Expose action controls with accessible names and roles`

**Category:** Accessibility

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Profile rendered in idle and pending states.

**Test Data:**

- Avatar, Edit profile, Logout, Delete account, Save, and Cancel controls.

**Steps:**

1. Query each action through the accessibility tree.
2. Activate enabled actions and inspect disabled state.

**Expected Result:**

- Each control is discoverable as a button with an unambiguous name; avatar is `Change profile photo`; Edit and Delete use their explicit labels; disabled controls expose disabled state and cannot activate.

**Automation Notes:**

- Prefer role/name queries; shared `Button` accessible name may derive from child text.

**Related Requirements / Components:**

- `ProfileAvatar`, `ProfileAccountSection`, `ProfileActions`, `Button`.

### `[PROFILE-A11Y-002] Programmatically label edit inputs`

**Category:** Accessibility

**Priority:** High

**Test Type:** Component

**Preconditions:**

- Edit modal open with a screen reader/accessibility tree available.

**Test Data:**

- Name and Email inputs.

**Steps:**

1. Traverse to each input without relying on adjacent visual text.
2. Inspect name, value, and keyboard traits.

**Expected Result:**

- Production intent: inputs are programmatically named `Name` and `Email`; values are announced; Email exposes email keyboard/no auto-capitalization. Current implementation is expected to fail programmatic-label assertions.

**Automation Notes:**

- Tag G-03; assert `getByLabelText` after remediation rather than proximity to Text.

**Related Requirements / Components:**

- G-03; shared `Input`; `EditProfileModal`.

### `[PROFILE-A11Y-003] Manage modal focus and announce asynchronous feedback`

**Category:** Accessibility

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- Accessibility service enabled; Edit trigger has focus.

**Test Data:**

- Modal open/close, validation/API error, pending/success states.

**Steps:**

1. Open modal, navigate controls, submit, and close.
2. Observe focus and announcements.

**Expected Result:**

- Production intent: focus enters the modal, remains trapped in modal content, errors/loading/success are announced, and focus returns to Edit profile on close. These expectations are gaps until explicit focus/live-region behavior exists.

**Automation Notes:**

- Tag G-03/G-04; supplement component assertions with VoiceOver/TalkBack manual verification where automation cannot inspect announcements.

**Related Requirements / Components:**

- G-03; G-04; `Modal`, `Alert`, pending indicators.

### `[PROFILE-EDGE-001] Define whitespace preservation behavior`

**Category:** Edge Case

**Priority:** Medium

**Test Type:** Integration

**Preconditions:**

- Authenticated, onboarded user.

**Test Data:**

- Names `"  Jane Doe  "` and `"   "`; email with surrounding spaces.

**Steps:**

1. PATCH each value independently.
2. Inspect validation and persisted value.

**Expected Result:**

- Characterization: name whitespace is not trimmed and whitespace-only name currently passes `IsNotEmpty`; spaced email is rejected by email validation. Desired normalization/rejection must be decided before changing assertions.

**Automation Notes:**

- Mark G-05; record current response/persistence precisely so a contract change is deliberate.

**Related Requirements / Components:**

- A-04; G-05; DTO validation.

### `[PROFILE-EDGE-002] Render long and special-character profile values safely`

**Category:** Edge Case

**Priority:** Medium

**Test Type:** Component

**Preconditions:**

- API returns server-valid long values.

**Test Data:**

- 255-character name, long email, combining characters, RTL text, emoji, quotes, `<script>alert(1)</script>`.

**Steps:**

1. Render header and edit modal for each value.
2. Scroll and inspect displayed/input content.

**Expected Result:**

- Exact text is preserved as inert React Native text; no execution/parsing occurs; controls remain reachable and values do not replace action labels.

**Automation Notes:**

- Assert text/value equality and no unexpected callback; use layout screenshots only for representative long/RTL fixtures.

**Related Requirements / Components:**

- A-05; `Text`, `TextInput`, `ProfileHeader`, `EditProfileModal`.

### `[PROFILE-SEC-001] Reject unknown or identity-bearing update fields`

**Category:** Security

**Priority:** Critical

**Test Type:** Integration

**Preconditions:**

- Authenticated user with a valid profile.

**Test Data:**

- Payloads containing `isOnboarded`, `providerSub`, `avatarKey`, `id`, `details`, role-like fields, or prototype-like unexpected keys alongside valid data.

**Steps:**

1. PATCH each payload.
2. Inspect response and persistent model.

**Expected Result:**

- Global validation returns `400` for non-whitelisted fields; no partial update occurs; identity, onboarding, avatar key, and authorization state cannot be changed.

**Automation Notes:**

- Send ordinary JSON properties only; do not build exploit payloads. Assert atomic no-write behavior.

**Related Requirements / Components:**

- `ValidationPipe` whitelist/forbid; `UpdateUserDto`.

### `[PROFILE-SEC-002] Return public avatar URL without storage secrets`

**Category:** Security

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- User has private `avatarKey`; mapper can create a presigned URL.

**Test Data:**

- Database key `avatars/user-a` and presigned URL fixture.

**Steps:**

1. GET/update/upload the current profile.
2. Inspect every response field.

**Expected Result:**

- `details.avatarUrl` contains only the generated URL; `avatarKey`, `providerSub`, credentials/tokens, and other storage internals are absent.

**Automation Notes:**

- Assert forbidden properties recursively as well as expected DTO shape.

**Related Requirements / Components:**

- `UserMapper`, `UserResponseDto`, `UserDetailsResponseDto`.

### `[PROFILE-REG-001] Keep refreshed profile consistent across consumers and revisit`

**Category:** Regression

**Priority:** High

**Test Type:** E2E

**Preconditions:**

- User profile is loaded; backend is changed externally or refetch returns newer data.

**Test Data:**

- Old name/avatar in Auth context; newer name/avatar from GET.

**Steps:**

1. Focus/refresh Profile and receive new data.
2. Navigate away to an Auth-context consumer and return to Profile.

**Expected Result:**

- Profile screen keeps the refreshed values across revisit and does not regress to old `initialData`; other Auth-context consumers should show the same identity once G-08 is resolved.

**Automation Notes:**

- E2E the revisit; add a hook integration assertion for query-vs-context divergence and retain G-08 until sync behavior is implemented.

**Related Requirements / Components:**

- G-08; `useProfileQuery`, Auth context, focus invalidation.

### `[PROFILE-REG-002] Avoid partial storage changes when database mutation fails`

**Category:** Regression

**Priority:** High

**Test Type:** Integration

**Preconditions:**

- User has an existing avatar; S3 operation succeeds; following Prisma update/delete rejects. For account deletion, exercise a user with related event/photo/access records.

**Test Data:**

- Existing key `avatars/user-a`, replacement image, and deterministic database constraint/update failures.

**Steps:**

1. Attempt avatar replacement and account deletion in isolated scenarios.
2. Force the database operation to fail after S3 succeeds.
3. Inspect database, object storage, session, and returned error.

**Expected Result:**

- Production requirement: failure must not leave an object replaced/deleted while the database still references its old state; account data and session remain intact, and a clear error is returned. Current implementation is expected to fail storage consistency until compensation/ordering is designed; related-record deletion follows the policy to be resolved in A-09.

**Automation Notes:**

- Integration-test with stateful fake S3 and controlled Prisma failure; assert final state rather than call order alone. Keep skipped/expected-failing under the project's agreed convention until G-09 is fixed.

**Related Requirements / Components:**

- A-09; G-09; `UsersService.uploadAvatar`; `UsersService.remove`; Prisma user relations.

## Senior QA Review Notes

- Happy paths, boundary validation, asynchronous transitions, destructive actions, avatar platform flow, authentication/ownership, navigation, accessibility, responsive behavior, malformed data, and cross-cache regressions are represented.
- `403` and role tests are intentionally not specified: every profile endpoint is `/users/me`, and no role or target-resource authorization branch exists.
- Automatic retry assertions are intentionally absent because the feature does not configure retry behavior; tests should use isolated QueryClient defaults to avoid environmental ambiguity.
- Initial loading/error, unauthenticated routing, input labelling/focus, whitespace normalization, avatar-remove confirmation, success-alert ordering, response schema validation, GET-to-Auth synchronization, related-record deletion policy, and cross-storage rollback remain explicit gaps rather than silently invented functionality.
- The Critical/High subset is the recommended required CI regression set; Medium/Low cases can run in the broader suite where device/layout cost is material.
