# kausal-ui-common

Common code for Kausal's UI projects

## Unit tests

Unit tests live in `__tests__` directories under `src/`. They run in CI
(`.github/workflows/unit-tests.yaml`) through the standalone `unit-tests/`
package, and also as part of the host apps' test suites (e.g. `pnpm test` in
kausal-watch-ui). To run them here:

```sh
cd unit-tests && pnpm install && pnpm test
```
