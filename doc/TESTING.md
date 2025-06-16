# Tests

DeviceHub project has two types of automated tests

## API Tests

### Run in docker
Just run
`docker compose -f docker-compose-api-tests.yaml --env-file scripts/variables.env up -exit-code-from devicehub-pytest --abort-on-container-exit devicehub-pytest --remove-orphans` and check devicehub-pytest output

### Local run
- First of all you need running instance of DeviceHub
- Open test/api directory and run `poetry install` (We highly recommend create python venv first)
- Then you can run tests by command `pytest ./ --token=<stf token here> --base-url=<link to already running devicehub> --log-cli-level=DEBUG`


## E2E Tests

### Run in docker
Just run
`docker compose -f docker-compose-e2e-tests.yaml up --build --remove-orphans --exit-code-from devicehub-e2e-tests --abort-on-container-exit devicehub-e2e-tests` and check devicehub-e2e-tests output

### Local run
- First of all you need running instance of DeviceHub
- Also you need running emulator/simulator or connected physical device
- Open test/ui directory and run `npm ci`
- Then you can run tests by command `npx playwright test `
