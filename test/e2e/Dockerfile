FROM node:20.18.0-bullseye-slim

WORKDIR /tests

# Copy tests source
COPY . /tests

# Run the build.
RUN npm ci

# Show help by default.
CMD ["npx", "playwright", "tests"]
