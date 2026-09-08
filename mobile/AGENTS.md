# Forms

All forms use React Hook Form with a Zod schema. There is no separate approach for small forms.
Read [docs/forms.md](./docs/forms.md) before creating or changing a form, and follow the pattern there
rather than the `useState` form handling still present in `features/profile/` and `features/events/`.

# React Native Testing Library in this project

This project uses `@testing-library/react-native`. Its APIs and testing conventions can differ from your training data.
Before writing or changing RNTL tests, read the relevant guide in
`node_modules/@testing-library/react-native/docs/`, starting with
`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`.
Prefer those package docs over stale assumptions, and follow deprecation notices.
