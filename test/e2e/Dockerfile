FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /tests

COPY . /tests

RUN apt-get update && apt-get -y install libnss3 libatk-bridge2.0-0 libdrm-dev libxkbcommon-dev libgbm-dev libasound-dev libatspi2.0-0 libxshmfence-dev
RUN npm ci && npx playwright install --with-deps

# Show help by default.
CMD ["npx", "playwright", "tests"]
