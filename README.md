# Shopify to LLM Product Data Transformer

## Project Overview

This project is a powerful Remix-based API service that transforms Shopify product data into a format optimized for Large Language Model (LLM) consumption. It provides a seamless way to extract and standardize product information from a Shopify store, making it easy to integrate product data into AI-powered applications.

## Key Features

- 🚀 Real-time Shopify product data retrieval
- 🔄 Automatic data transformation for LLM compatibility
- 💾 Intelligent caching mechanism
- 🔒 Optional API key authentication
- 📊 Comprehensive product information extraction

## Prerequisites

- Node.js (v18 or later)
- Shopify Store
- Shopify Admin API Access Token

## Environment Setup

Create a `.env` file in the project root with the following variables:
```
SHOPIFY_SHOP_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_admin_access_token
SHOPIFY_API_VERSION=2025-01
API_KEY=optional_custom_api_key
```

## Installation

```shellscript
# Clone the repository
git clone https://your-repo-url.git

# Install dependencies
npm install

# Run development server
npm run dev
```

## API Endpoints

### GET /api/products

Retrieves all products from your Shopify store, transformed for LLM consumption.

#### Query Parameters
- `apiKey` (optional): Custom API key for authentication
- `refresh=true` (optional): Force refresh of cached data

#### Sample Request
```bash
# Basic request
curl http://localhost:5173/api/products

# With API key
curl "http://localhost:5173/api/products?apiKey=your_api_key"

# Force refresh
curl "http://localhost:5173/api/products?refresh=true"
```

#### Response Structure
```typescript
{
  success: boolean;
  products: ShopifyProduct[];
  totalProducts: number;
  timestamp: string;
  fromCache: boolean;
}

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  vendor: string;
  url: string;
  options: ProductOption[];
  metafields: Metafield[];
  variants: ProductVariant[];
  images: ProductImage[];
  translations: any[]; // Currently empty
}

interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  metafields: Metafield[];
  inventory: any[]; // Currently empty
}
```

## Deployment

### Production Build

```shellscript
# Build the application
npm run build

# Start in production mode
npm start
```

## Technologies

- Remix.js
- TypeScript
- Shopify GraphQL Admin API
- Node.js

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

Your Name - your.email@example.com

Project Link: [https://github.com/your-username/shopify-to-llm](https://github.com/your-username/shopify-to-llm)
