# Use official Node.js 20 image
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build stage
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM base AS production
# Set environment mode
ENV NODE_ENV=production
ENV SHOPIFY_ACCESS_TOKEN=${SHOPIFY_ACCESS_TOKEN:-default_token}
ENV SHOPIFY_SHOP_URL=${SHOPIFY_SHOP_URL:-default_shop_url}
ENV SHOPIFY_API_VERSION=${SHOPIFY_API_VERSION:-2024-04}

# Copy necessary files
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]