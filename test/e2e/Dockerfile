FROM node:20.18.0-bullseye-slim

WORKDIR /tests

COPY . /tests

RUN npm ci && npx playwright install --with-deps

# Show help by default.
CMD ["npx", "playwright", "tests"]
