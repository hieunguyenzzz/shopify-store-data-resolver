/**
 * Shopify Product type definitions
 */

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  availableForSale: boolean;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  metafields: ShopifyMetafield[];
  inventory?: {
    locationId: string;
    locationName: string;
    available: number;
  }[];
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText: string | null;
}

export interface ShopifyTranslation {
  locale: string;
  key: string;
  value: string;
}

export interface ShopifyOption {
  id: string;
  name: string;
  values: string[];
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  vendor: string;
  options: ShopifyOption[];
  metafields: ShopifyMetafield[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  translations: ShopifyTranslation[];
  url: string;
}

export interface ProductsResponse {
  success: boolean;
  products: ShopifyProduct[];
  totalProducts: number;
  timestamp: string;
  fromCache?: boolean;
}

export interface ProductResponse {
  success: boolean;
  product: ShopifyProduct;
  timestamp: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  products: ShopifyProduct[];
  totalResults: number;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
} 