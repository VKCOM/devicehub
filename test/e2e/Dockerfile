FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /tests

COPY . /tests

RUN npm ci && npx playwright install --with-deps

# Show help by default.
CMD ["npx", "playwright", "tests"]
