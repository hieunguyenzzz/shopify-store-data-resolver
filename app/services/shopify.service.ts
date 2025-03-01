import dotenv from 'dotenv';
import type { 
  ShopifyProduct, 
  ShopifyVariant 
} from '~/types/shopify.types';

// Load environment variables
dotenv.config();

const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

/**
 * Execute a GraphQL query against the Shopify Admin API
 */
export async function executeGraphQL(query: string, variables: object = {}) {
  if (!SHOPIFY_SHOP_URL || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify credentials not found in environment variables');
  }

  const url = `https://${SHOPIFY_SHOP_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify GraphQL query failed: ${errorText}`);
  }

  return await response.json();
}

/**
 * Fetch all products with their detailed information
 */
export async function fetchAllProducts(): Promise<any[]> {
  const query = `
    query GetAllProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          handle
          descriptionHtml
          description
          productType
          tags
          vendor
          options {
            id
            name
            values
          }
          metafields(first: 20) {
            nodes {
              namespace
              key
              value
              type
            }
          }
          variants(first: 250) {
            nodes {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              availableForSale
              selectedOptions {
                name
                value
              }
              metafields(first: 20) {
                nodes {
                  namespace
                  key
                  value
                  type
                }
              }
            }
          }
          images(first: 20) {
            nodes {
              id
              url
              altText
            }
          }
        }
      }
    }
  `;

  // Use pagination to get all products
  let hasNextPage = true;
  let after: string | null = null;
  let allProducts: any[] = [];

  while (hasNextPage) {
    const variables = {
      first: 50,  // Fetch 50 products at a time
      after,
    };

    const response = await executeGraphQL(query, variables);
    
    if (response.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
    }

    const { products } = response.data;
    allProducts = [...allProducts, ...products.nodes];

    hasNextPage = products.pageInfo.hasNextPage;
    after = products.pageInfo.endCursor;
  }

  return allProducts;
}

/**
 * Fetch inventory levels for products
 */
export async function fetchInventoryLevels(): Promise<any[]> {
  // Skipping inventory data as requested
  console.log('Skipping inventory data fetch as requested');
  return [];

  // Original implementation commented out
  /*
  const query = `
    query GetInventoryLevels($first: Int!, $after: String) {
      locations(first: 10) {
        nodes {
          id
          name
          inventoryLevels(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              available
              inventoryItem {
                id
                variant {
                  id
                  product {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allInventory: any[] = [];
  const locations: any[] = [];
  
  // Get all locations first
  const locationsResponse = await executeGraphQL(`
    query GetLocations {
      locations(first: 50) {
        nodes {
          id
          name
        }
      }
    }
  `);
  
  if (locationsResponse.data?.locations?.nodes) {
    locations.push(...locationsResponse.data.locations.nodes);
  }

  // For each location, fetch inventory data with pagination
  for (const location of locations) {
    let hasNextPage = true;
    let after = null;
    
    while (hasNextPage) {
      const variables = {
        first: 100,
        after,
      };
      
      const response = await executeGraphQL(query, variables);
      
      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }
      
      const locationData = response.data.locations.nodes.find(
        (node: any) => node.id === location.id
      );
      
      if (locationData) {
        allInventory = [
          ...allInventory,
          ...locationData.inventoryLevels.nodes.map((node: any) => ({
            ...node,
            locationId: location.id,
            locationName: location.name,
          })),
        ];
        
        hasNextPage = locationData.inventoryLevels.pageInfo.hasNextPage;
        after = locationData.inventoryLevels.pageInfo.endCursor;
      } else {
        hasNextPage = false;
      }
    }
  }
  
  return allInventory;
  */
}

/**
 * Transforms product and inventory data into a format optimized for LLM consumption
 */
export function transformDataForLLM(products: any[], inventoryData: any[]): ShopifyProduct[] {
  return products.map(product => {
    // Transform variant data with empty inventory
    const productVariants = product.variants.nodes.map((variant: any) => {
      return {
        ...variant,
        inventory: [] // Empty inventory array since we're skipping inventory data
      };
    });
    
    // Transform the product data
    return {
      id: product.id,
      handle: product.handle,
      title: product.title,
      description: product.description,
      descriptionHtml: product.descriptionHtml,
      productType: product.productType,
      tags: product.tags,
      vendor: product.vendor,
      options: product.options,
      metafields: product.metafields?.nodes || [],
      variants: productVariants,
      images: product.images?.nodes || [],
      translations: [], // Empty array instead of fetching translations
      url: `https://${SHOPIFY_SHOP_URL}/products/${product.handle}`,
    };
  });
} 