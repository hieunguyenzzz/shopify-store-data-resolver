# Shopify to LLM Data Transformer API

## API Endpoints

### 1. GET /api/products

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

### 2. GET /api/pages

Retrieves all pages from your Shopify store, transformed for LLM consumption.

#### Query Parameters
- `apiKey` (optional): Custom API key for authentication
- `refresh=true` (optional): Force refresh of cached data

#### Sample Request
```bash
# Basic request
curl http://localhost:5173/api/pages

# With API key
curl "http://localhost:5173/api/pages?apiKey=your_api_key"

# Force refresh
curl "http://localhost:5173/api/pages?refresh=true"
```

### 3. GET /api/metaobjects

Retrieves metaobjects of a specific type from your Shopify store, transformed for LLM consumption.

#### Query Parameters
- `type` (required): The metaobject type to fetch
- `apiKey` (optional): Custom API key for authentication
- `refresh=true` (optional): Force refresh of cached data

#### Sample Request
```bash
# Basic request
curl "http://localhost:5173/api/metaobjects?type=your_metaobject_type"

# With API key
curl "http://localhost:5173/api/metaobjects?type=your_metaobject_type&apiKey=your_api_key"

# Force refresh
curl "http://localhost:5173/api/metaobjects?type=your_metaobject_type&refresh=true"
```

## Environment Setup

Create a `.env` file in the project root with the following variables:
```
SHOPIFY_SHOP_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_admin_access_token
SHOPIFY_API_VERSION=2025-01
API_KEY=optional_custom_api_key
```
