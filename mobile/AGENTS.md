# Forms

Read [docs/forms.md](./docs/forms.md) before creating or changing any form. It is the only place the
form conventions are defined. Follow it rather than inferring the pattern from existing form code,
which has not all been migrated.

# React Native Testing Library in this project

This project uses `@testing-library/react-native`. Its APIs and testing conventions can differ from your training data.
Before writing or changing RNTL tests, read the relevant guide in
`node_modules/@testing-library/react-native/docs/`, starting with
`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`.
Prefer those package docs over stale assumptions, and follow deprecation notices.
