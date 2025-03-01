# Shopify to LLM Product Data Transformer

## Project Overview

This project is a powerful Remix-based API service that transforms Shopify product data into a format optimized for Large Language Model (LLM) consumption. It provides a seamless way to extract and standardize product information from a Shopify store, making it easy to integrate product data into AI-powered applications.

## Key Features

- 🚀 Real-time Shopify product data retrieval
- 🔄 Automatic data transformation for LLM compatibility
- 💾 Intelligent caching mechanism
- 🔒 Optional API key authentication
- 📊 Comprehensive product information extraction
- 🖼️ Automatic resolution of file reference metafields to actual URLs
- 📈 Smart handling of large product catalogs with Shopify's query cost limits

## File Reference Resolution

The system automatically resolves Shopify file references in metafields to their actual URLs using a multi-stage approach:

1. **Initial Resolution**: First attempts to match file references with media data fetched in the main query
2. **Format Matching**: Tries multiple ID formats (full ID, without prefix, numeric only) to increase match chances
3. **Direct Fetch Fallback**: For any unresolved references, performs individual GraphQL queries to fetch media directly by ID
4. **Result Storage**: 
   - `value`: Contains the resolved URL(s)
   - `originalValue`: Preserves the original reference ID(s)
   - `processed`: Flag indicating the field was processed

This ensures that metafields containing references to images or other media (like those with type `file_reference` or `list.file_reference`) return actual URLs in the API response, making them immediately usable without needing client-side resolution.

### Example

Original metafield:
```json
{
  "namespace": "global",
  "key": "images",
  "value": "[\"gid://shopify/MediaImage/33140630487265\"]",
  "type": "list.file_reference"
}
```

Transformed metafield:
```json
{
  "namespace": "global",
  "key": "images",
  "value": "[\"https://cdn.shopify.com/s/files/1/0123/4567/8901/products/example-image.jpg\"]",
  "type": "list.file_reference",
  "originalValue": "[\"gid://shopify/MediaImage/33140630487265\"]",
  "processed": true
}
```

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
  metafields: ShopifyMetafield[];
  variants: ProductVariant[];
  images: ProductImage[];
  translations: any[]; // Currently empty
}

interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;         // For file_reference types, this will contain the URL instead of the ID
  type: string;
  originalValue?: string; // Original ID value is preserved here
  processed?: boolean;    // Indicates if this metafield was processed
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

## Performance Notes

### Handling Large Product Catalogs

This project includes optimizations for Shopify stores with large product catalogs:

1. **Optimized GraphQL Queries**: Queries are designed to stay under Shopify's 1000-point cost limit.
2. **Batched Fetching**: Products are retrieved in smaller batches to avoid hitting GraphQL limits.
3. **Fallback Mechanism**: If a query exceeds cost limits, the system automatically falls back to a two-phase approach:
   - First fetches basic product data
   - Then enriches products with detailed metafields and media information

For very large stores (1000+ products), we recommend:
- Using the caching mechanism (`?refresh=true` only when needed)
- Setting up a scheduled job to refresh the cache during off-peak hours
