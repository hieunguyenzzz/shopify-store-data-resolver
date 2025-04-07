/**
 * Shopify Product type definitions
 */

import { Page, Collection } from "./shopify-generated";

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
  // Optional fields for processed file references
  originalValue?: string;
  processed?: boolean;
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
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
}

export interface ProductsResponse {
  success: boolean;
  products: ShopifyProduct[];
  totalProducts: number;
  timestamp: string;
  fromCache?: boolean;
  estimatedTokens?: number;
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

export interface PagesResponse {
  success: boolean;
  pages: Page[];
  totalPages: number;
  timestamp: string;
  fromCache?: boolean;
  estimatedTokens?: number;
}

export interface ShopifyMetaobject {
  id: string;
  handle: string;
  type: string;
  displayName?: string;
  fields: ShopifyMetafield[];
  updatedAt: string;
}

export interface MetaobjectsResponse {
  success: boolean;
  metaobjects: ShopifyMetaobject[];
  totalMetaobjects: number;
  timestamp: string;
  fromCache?: boolean;
  estimatedTokens?: number;
}

export interface ShopifyFile {
  id: string;
  filename: string;
  url: string;
  mediaType: string;
  originalUploadSize: number;
  createdAt: string;
  updatedAt: string;
  alt?: string;
  status?: string;
  mimeType?: string;
}

export interface FilesResponse {
  success: boolean;
  files: ShopifyFile[];
  totalFiles: number;
  timestamp: string;
  fromCache?: boolean;
  estimatedTokens?: number;
}

// Adding Collection types based on the Shopify GraphQL documentation
export interface ShopifyCollection {
  id: string;
  handle: string;
  title: string;
  updatedAt: string;
  descriptionHtml: string | null;
  sortOrder: string; // Example: "MANUAL"
  templateSuffix: string | null;
  products: {
    nodes: {
      id: string;
      title: string;
      handle: string;
    }[];
    pageInfo: {
      hasNextPage: boolean;
    };
  };
  // Add other relevant fields as needed based on GraphQL schema
  // e.g., image, rules, etc.
}

export interface CollectionsResponse {
  success: boolean;
  collections: ShopifyCollection[];
  totalCollections: number;
  timestamp: string;
  fromCache?: boolean;
  estimatedTokens?: number;
} 