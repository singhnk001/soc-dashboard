# Tests

Automated test suite (to be built — see `docs/TEST_PLAN.md` for the plan).

## Structure (planned)
```
tests/
├── api/          # pytest tests for FastAPI endpoints
├── frontend/     # Playwright E2E tests
└── conftest.py   # Shared fixtures (DB connection, test client)
```

## Run (once implemented)
```powershell
# API tests
pytest tests/api/ -v

# Frontend E2E
npx playwright test tests/frontend/
```
