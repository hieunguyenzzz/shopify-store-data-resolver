import dotenv from 'dotenv';
import { Page } from '~/types/shopify-generated';
import {
  ShopifyProduct,
  ShopifyVariant,
  ShopifyImage,
  ShopifyMetafield,
  ShopifyFile,
  ShopifyCollection,
} from '~/types/shopify.types';
import { cache } from '~/utils/cache';

// Load environment variables
dotenv.config();

const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

// Global media cache to store all media items
let globalMediaCache: Map<string, string> | null = null;

// Utility function for delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cache keys and TTL
const PRODUCTS_CACHE_KEY = 'shopify_products';

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
 * Fetch all media from Shopify and build a comprehensive media cache
 * This function fetches all media items upfront to avoid individual queries later
 */
export async function fetchAllMedia(): Promise<Map<string, string>> {
  // If we already have the global cache, return it
  if (globalMediaCache) {
    console.log('Using existing global media cache');
    return globalMediaCache;
  }

  console.log('Fetching all media items from Shopify...');
  
  const mediaCache = new Map<string, string>();
  const mediaQuery = `
    query GetAllMedia($first: Int!, $after: String) {
      files(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ... on MediaImage {
            id
            image {
              url
              altText
            }
          }
          ... on Video {
            id
            sources {
              url
            }
          }
          ... on ExternalVideo {
            id
            embeddedUrl
          }
          ... on Model3d {
            id
            sources {
              url
            }
          }
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let after: string | null = null;
    let fetchedCount = 0;
    const batchSize = 100; // Fetch in larger batches for efficiency

    while (hasNextPage) {
      const variables = {
        first: batchSize,
        after,
      };

      console.log(`Fetching media batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(mediaQuery, variables);
      
      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const { files } = response.data;
      
      // Process and add each media item to the cache
      for (const media of files.nodes) {
        if (!media || !media.id) continue;
        
        let mediaUrl = null;
        
        if (media.image && media.image.url) {
          mediaUrl = media.image.url;
        } else if (media.sources && media.sources.length > 0) {
          mediaUrl = media.sources[0].url;
        } else if (media.embeddedUrl) {
          mediaUrl = media.embeddedUrl;
        }
        
        if (mediaUrl) {
          // Store with full ID
          mediaCache.set(media.id, mediaUrl);
          
          // Store without gid:// prefix
          const cleanId = media.id.replace('gid://', '');
          mediaCache.set(cleanId, mediaUrl);
          
          // Store by numeric ID part
          const idParts = media.id.split('/');
          if (idParts.length > 0) {
            const numericId = idParts[idParts.length - 1];
            mediaCache.set(numericId, mediaUrl);
          }
        }
      }
      
      fetchedCount += files.nodes.length;
      console.log(`Cached ${fetchedCount} media items so far`);

      hasNextPage = files.pageInfo.hasNextPage;
      after = files.pageInfo.endCursor;
      
      // Add a small delay between requests to avoid rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log(`Completed fetching and caching ${fetchedCount} media items`);
    
    // Set the global cache
    globalMediaCache = mediaCache;
    return mediaCache;
  } catch (error) {
    console.error('Error fetching all media:', error);
    // Return an empty map on error, which will fall back to the old method
    return new Map<string, string>();
  }
}

/**
 * Alternative approach to fetch products with a simplified query 
 * This can be used as a fallback if the main query exceeds cost limits
 */
export async function fetchProductsSimplified(): Promise<any[]> {
  // Basic product query with minimal fields
  const basicQuery = `
    query GetAllProductsBasic($first: Int!, $after: String) {
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
          seo {
            title
            description
          }
          templateSuffix
          publication_ids
          status
          variants(first: 100) {
            nodes {
              id
              title
              image {
                altText: string;
                url
              }
              sku
              price
              compareAtPrice
              inventoryQuantity
              availableForSale
              selectedOptions {
                name
                value
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

  // Query to fetch metafields and media for a single product
  const detailsQuery = `
    query GetProductDetails($id: ID!) {
      product(id: $id) {
        id
        metafields(first: 25) {
          nodes {
            namespace
            key
            value
            type
          }
        }
        seo {
          title
          description
        }
        variants(first: 100) {
          nodes {
            id
            sku
            image {
              altText: string;
              url
            }
            metafields(first: 15) {
              nodes {
                namespace
                key
                value
                type
              }
            }
          }
        }
        media(first: 30) {
          nodes {
            ... on MediaImage {
              id
              image {
                url
                altText
              }
            }
            ... on Video {
              id
              sources {
                url
              }
            }
            ... on ExternalVideo {
              id
              embeddedUrl
            }
          }
        }
      }
    }
  `;

  try {
    console.log('Using simplified fetching approach to stay within GraphQL cost limits');
    // First, fetch all products with basic information
    let hasNextPage = true;
    let after: string | null = null;
    let allProducts: any[] = [];
    const batchSize = 50; // Can be larger because the query is simpler

    while (hasNextPage) {
      const variables = {
        first: batchSize,
        after,
      };

      console.log(`Fetching basic products batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(basicQuery, variables);
      
      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const { products } = response.data;
      allProducts = [...allProducts, ...products.nodes];
      
      console.log(`Fetched ${products.nodes.length} basic products, total now: ${allProducts.length}`);

      hasNextPage = products.pageInfo.hasNextPage;
      after = products.pageInfo.endCursor;
      
      // Add a small delay between requests
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Then, enrich each product with its metafields and media in separate queries
    console.log('Fetching detailed metafields and media for each product...');
    const enrichedProducts = [];
    const mediaCache = new Map(); // Cache for media direct fetches
    
    for (const product of allProducts) {
      try {
        const detailsResponse = await executeGraphQL(detailsQuery, { id: product.id });
        
        if (detailsResponse.errors) {
          console.warn(`Error fetching details for product ${product.id}:`, detailsResponse.errors);
          enrichedProducts.push(product);
          continue;
        }
        
        const productDetails = detailsResponse.data.product;
        
        // Merge the details with the basic product data
        const enrichedProduct = {
          ...product,
          metafields: productDetails.metafields,
          media: productDetails.media
        };
        
        // Update variants with their metafields
        if (productDetails.variants && productDetails.variants.nodes) {
          enrichedProduct.variants.nodes = enrichedProduct.variants.nodes.map((variant: any) => {
            const detailedVariant = productDetails.variants.nodes.find(
              (v: any) => v.id === variant.id
            );
            if (detailedVariant && detailedVariant.metafields) {
              return {
                ...variant,
                metafields: detailedVariant.metafields
              };
            }
            return variant;
          });
        }
        
        enrichedProducts.push(enrichedProduct);
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.warn(`Error enriching product ${product.id}:`, error);
        enrichedProducts.push(product);
      }
    }
    
    console.log(`Completed fetching all ${enrichedProducts.length} products with details`);
    
    // Process metafields for direct file reference resolution if needed
    console.log('Checking for file references that need direct resolution...');
    const productsWithResolvedReferences = enrichedProducts;
    
    return productsWithResolvedReferences;
  } catch (error) {
    console.error('Error in simplified product fetch:', error);
    throw error;
  }
}

/**
 * Main function to fetch products with fallback to simplified approach if needed
 */
export async function fetchAllProducts(): Promise<any[]> {
  // Original optimized query (reduced batch sizes)
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
          seo {
            title
            description
          }
          templateSuffix
          publication_ids
          status
          options {
            id
            name
            values
          }
          metafields(first: 25) {
            nodes {
              namespace
              key
              value
              type
            }
          }
          variants(first: 100) {
            nodes {
              id
              title
              image {
                altText              
                url
              }
              sku
              price
              compareAtPrice
              inventoryQuantity
              availableForSale
              selectedOptions {
                name
                value
              }
              metafields(first: 15) {
                nodes {
                  namespace
                  key
                  value
                  type
                }
              }
            }
          }
          images(first: 30) {
            nodes {
              id
              url
              altText
            }
          }
          media(first: 30) {
            nodes {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
              ... on Video {
                id
                sources {
                  url
                }
              }
              ... on ExternalVideo {
                id
                embeddedUrl
              }
            }
          }
        }
      }
    }
  `;

  try {
    // First try with the optimized query
    console.log('Trying to fetch products with optimized query...');
    
    // Use a smaller batch size to keep each query's cost below the limit
    const batchSize = 25; 
    let hasNextPage = true;
    let after: string | null = null;
    let allProducts: any[] = [];
    
    while (hasNextPage) {
      const variables = {
        first: batchSize,
        after,
      };

      console.log(`Fetching products batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(query, variables);
      
      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const { products } = response.data;
      allProducts = [...allProducts, ...products.nodes];
      
      console.log(`Fetched ${products.nodes.length} products, total now: ${allProducts.length}`);

      hasNextPage = products.pageInfo.hasNextPage;
      after = products.pageInfo.endCursor;
      
      // Add a small delay between requests to avoid rate limiting issues
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Completed fetching all products. Total: ${allProducts.length}`);
    return allProducts;
  } catch (error) {
    console.error('Error with optimized query:', error);
    console.log('Falling back to simplified approach...');
    
    // If the optimized query fails (likely due to cost), try the simplified approach
    if (error instanceof Error && 
        (error.message.includes('MAX_COST_EXCEEDED') || 
         error.message.includes('cost limit'))) {
      return fetchProductsSimplified();
    }
    
    // For other errors, re-throw
    throw error;
  }
}

/**
 * Fetches all inventory levels from Shopify using pagination.
 */
export async function fetchInventoryLevels(): Promise<any[]> {
  const query = `
    query GetAllInventoryLevels($first: Int!, $after: String) {
      inventoryLevels(first: $first, after: $after) {
        edges {
          node {
            id
            available
            location {
              id
              name
            }
            inventoryItem {
              id
              sku
              # Attempt to get variant and product ID directly if available
              variant {
                id
                product {
                  id
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  let allInventory: any[] = [];
  let hasNextPage = true;
  let after: string | null = null;
  let pageCount = 0;
  const maxPages = 50; // Safety break for pagination
  const batchSize = 100; // Fetch 100 items per page
  const delayMs = 500; // Delay between requests

  console.log('Fetching inventory levels from Shopify...');

  while (hasNextPage && pageCount < maxPages) {
    pageCount++;
    const variables = {
      first: batchSize,
      after,
    };

    try {
      console.log(`Fetching inventory page ${pageCount} (batch size ${batchSize}), cursor: ${after || 'Start'}`);
      // Use the executeGraphQL function defined in this file
      const response = await executeGraphQL(query, variables);

      if (response.errors) {
        console.error('GraphQL Error fetching inventory levels:', JSON.stringify(response.errors, null, 2));
        // Treat all GraphQL errors during pagination as reason to stop.
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const data = response.data?.inventoryLevels;

      if (data?.edges && data.edges.length > 0) {
        const processedItems = data.edges.map((edge: any) => ({
          inventoryLevelId: edge.node.id,
          available: edge.node.available,
          locationId: edge.node.location?.id, // Handle potential null location
          locationName: edge.node.location?.name, // Handle potential null location
          inventoryItemId: edge.node.inventoryItem?.id, // Handle potential null inventoryItem
          sku: edge.node.inventoryItem?.sku, // Handle potential null inventoryItem
          variantId: edge.node.inventoryItem?.variant?.id, // Handle potential nulls down the chain
          productId: edge.node.inventoryItem?.variant?.product?.id, // Handle potential nulls down the chain
        }));
        allInventory = [...allInventory, ...processedItems];
        console.log(`Processed ${processedItems.length} items from page ${pageCount}. Total: ${allInventory.length}`);
      } else {
          console.log(`No inventory items found on page ${pageCount}.`);
      }

      hasNextPage = data?.pageInfo?.hasNextPage ?? false;
      after = data?.pageInfo?.endCursor ?? null;

      if (hasNextPage) {
        console.log(`Next page exists, cursor: ${after}. Waiting ${delayMs}ms...`);
        // Use the sleep function defined in this file
        await sleep(delayMs);
      }

    } catch (error) {
      console.error(`Error fetching inventory levels page ${pageCount}:`, error);
      // Stop pagination on error to prevent further issues
      hasNextPage = false;
      console.log('Stopping inventory pagination due to error.');
    }
  }

  if (pageCount === maxPages && hasNextPage) {
    console.warn(`Reached maximum page limit (${maxPages}) for inventory levels. Data might be incomplete.`);
  }

  console.log(`Finished fetching inventory levels. Fetched ${pageCount} pages, total ${allInventory.length} records.`);
  return allInventory;
}

// Query to fetch a media item directly by ID
const getMediaByIdQuery = `
  query GetMediaById($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        image {
          url
          altText
        }
      }
      ... on Video {
        id
        sources {
          url
        }
      }
      ... on ExternalVideo {
        id
        embeddedUrl
      }
    }
  }
`;

/**
 * Fetch individual media item by ID
 * This can be used as a last resort for resolving file references
 */
export async function fetchMediaById(mediaId: string): Promise<{ id: string, url: string } | null> {
  // Try to get from global cache first if available
  if (globalMediaCache && globalMediaCache.has(mediaId)) {
    const url = globalMediaCache.get(mediaId);
    if (url) {
      return { id: mediaId, url };
    }
  }

  try {
    const response = await executeGraphQL(getMediaByIdQuery, { id: mediaId });
    
    if (response.errors || !response.data || !response.data.node) {
      return null;
    }
    
    const media = response.data.node;
    
    if (media.image) {
      return { id: media.id, url: media.image.url };
    } else if (media.sources && media.sources.length > 0) {
      return { id: media.id, url: media.sources[0].url };
    } else if (media.embeddedUrl) {
      return { id: media.id, url: media.embeddedUrl };
    }
    
    return null;
  } catch (error) {
    console.warn(`Error fetching media by ID ${mediaId}:`, error);
    return null;
  }
}

/**
 * Enhanced version of processMetafields that can directly fetch missing media
 * For use in fallback mode where we need to resolve references
 */
async function processMetafieldsWithFetch(
  metafields: any[], 
  productImages: any[],
  productMedia: any[] = [],
  mediaCache?: Map<string, string>
): Promise<ShopifyMetafield[]> {
  // First try normal processing with the media cache
  const initialProcessed = processMetafields(metafields, productImages, productMedia, mediaCache);
  
  // If we have no global cache and no provided cache, we'll need to fetch unresolved references
  if (!mediaCache && !globalMediaCache) {
    // Check for any unresolved references (where value still contains 'gid://')
    const needsDirectFetch = initialProcessed.filter(
      m => m.processed && 
      (m.type === 'file_reference' || m.type === 'list.file_reference') && 
      m.value.includes('gid://')
    );
    
    if (needsDirectFetch.length === 0) {
      return initialProcessed;
    }
    
    console.log(`Need to fetch ${needsDirectFetch.length} unresolved media references`);
    
    // For any unresolved references, try direct fetching
    const localMediaCache = new Map();
    const finalProcessed = [...initialProcessed];
    
    for (const metafield of needsDirectFetch) {
      const index = finalProcessed.findIndex(m => m === metafield);
      if (index === -1) continue;
      
      if (metafield.type === 'file_reference') {
        const mediaId = metafield.originalValue || metafield.value;
        
        // Check cache first
        let mediaUrl = localMediaCache.get(mediaId);
        
        if (!mediaUrl) {
          // Direct fetch if not in cache
          const mediaData = await fetchMediaById(mediaId);
          if (mediaData) {
            mediaUrl = mediaData.url;
            localMediaCache.set(mediaId, mediaUrl);
          }
        }
        
        if (mediaUrl) {
          finalProcessed[index] = {
            ...metafield,
            value: mediaUrl
          };
        }
      } else if (metafield.type === 'list.file_reference') {
        try {
          const originalIds = JSON.parse(metafield.originalValue || metafield.value);
          const currentUrls = JSON.parse(metafield.value);
          const updatedUrls = [...currentUrls];
          let changed = false;
          
          for (let i = 0; i < originalIds.length; i++) {
            // If the current URL is still an ID, try to fetch it
            if (currentUrls[i] && currentUrls[i].includes('gid://')) {
              const mediaId = originalIds[i];
              
              // Check cache first
              let mediaUrl = localMediaCache.get(mediaId);
              
              if (!mediaUrl) {
                // Direct fetch if not in cache
                const mediaData = await fetchMediaById(mediaId);
                if (mediaData) {
                  mediaUrl = mediaData.url;
                  localMediaCache.set(mediaId, mediaUrl);
                }
              }
              
              if (mediaUrl) {
                updatedUrls[i] = mediaUrl;
                changed = true;
              }
            }
          }
          
          if (changed) {
            finalProcessed[index] = {
              ...metafield,
              value: JSON.stringify(updatedUrls)
            };
          }
        } catch (error) {
          console.warn(`Error processing list.file_reference with direct fetch: ${error}`);
        }
      }
    }
    
    return finalProcessed;
  }
  
  // Otherwise, we already used the cache in the initial processing
  return initialProcessed;
}

/**
 * Resolves file reference metafields to image URLs
 * @param metafields The metafields to process
 * @param productImages All images of the product
 * @param productMedia All media of the product
 * @param externalMediaCache Optional external media cache to use
 * @returns Processed metafields with file references replaced with URLs
 */
function processMetafields(
  metafields: any[], 
  productImages: any[],
  productMedia: any[] = [],
  externalMediaCache?: Map<string, string>
): ShopifyMetafield[] {
  if (!metafields || metafields.length === 0) {
    return [];
  }
  
  // Create a complete media map from both images and media
  const mediaMap = new Map();
  
  // Use external media cache or global cache if provided
  const mediaCache = externalMediaCache || globalMediaCache || null;
  
  // Log available images and media for debugging
  console.log(`Processing ${metafields.length} metafields with ${productImages.length} images and ${productMedia.length} media items`);
  
  // Add all images to the media map (both with and without gid:// prefix for flexibility)
  productImages.forEach(img => {
    if (img.id) {
      mediaMap.set(img.id, img.url);
      // Also store without the gid:// prefix for easier matching
      const cleanId = img.id.replace('gid://', '');
      mediaMap.set(cleanId, img.url);
    }
  });
  
  // Add all media items to the media map
  productMedia.forEach(media => {
    if (!media || !media.id) return;
    
    let mediaUrl = null;
    
    if (media.image && media.image.url) {
      // MediaImage type
      mediaUrl = media.image.url;
    } else if (media.sources && media.sources.length > 0) {
      // Video type
      mediaUrl = media.sources[0].url;
    } else if (media.embeddedUrl) {
      // ExternalVideo type
      mediaUrl = media.embeddedUrl;
    }
    
    if (mediaUrl) {
      mediaMap.set(media.id, mediaUrl);
      // Also store without the gid:// prefix
      const cleanId = media.id.replace('gid://', '');
      mediaMap.set(cleanId, mediaUrl);
      
      // Store by just the numeric ID part for even more flexibility
      const idParts = media.id.split('/');
      if (idParts.length > 0) {
        const numericId = idParts[idParts.length - 1];
        mediaMap.set(numericId, mediaUrl);
      }
    }
  });
  
  // Use direct fetching for any unresolved media IDs
  return metafields.map(metafield => {
    // Handle list.file_reference type metafields
    if (metafield.type === 'list.file_reference' && metafield.value) {
      try {
        // Parse the JSON string to get the array of image IDs
        const imageIds = JSON.parse(metafield.value);
        
        // Map each image ID to its URL if found in our media map
        const imageUrls = imageIds.map((imageId: string) => {
          // Try multiple formats of the ID to increase match chances
          let url = mediaMap.get(imageId);
          
          if (!url && mediaCache) {
            // Try from the global/external cache if available
            url = mediaCache.get(imageId);
            
            if (!url) {
              // Try without gid:// prefix in the cache
              const cleanId = imageId.replace('gid://', '');
              url = mediaCache.get(cleanId);
              
              if (!url) {
                // Try just the numeric part in the cache
                const idParts = imageId.split('/');
                if (idParts.length > 0) {
                  const numericId = idParts[idParts.length - 1];
                  url = mediaCache.get(numericId);
                }
              }
            }
          }
          
          if (!url) {
            // Try without gid:// prefix
            const cleanId = imageId.replace('gid://', '');
            url = mediaMap.get(cleanId);
            
            if (!url) {
              // Try just the numeric part
              const idParts = imageId.split('/');
              if (idParts.length > 0) {
                const numericId = idParts[idParts.length - 1];
                url = mediaMap.get(numericId);
              }
              
              if (!url) {
                console.warn(`Could not resolve media URL for ID: ${imageId}`);
                return imageId; // Return the original ID if URL can't be found
              }
            }
          }
          
          return url;
        });
        
        // Return the modified metafield with URLs instead of IDs
        return {
          ...metafield,
          originalValue: metafield.value, // Keep the original value with IDs
          value: JSON.stringify(imageUrls), // Replace with URLs array
          processed: true // Flag to indicate this was processed
        };
      } catch (error) {
        console.warn(`Error processing file reference metafield: ${error}`);
        return metafield;
      }
    }
    
    // Handle single file_reference type
    if (metafield.type === 'file_reference' && metafield.value) {
      const mediaId = metafield.value;
      
      // Try multiple formats of the ID to increase match chances
      let mediaUrl = mediaMap.get(mediaId);
      
      if (!mediaUrl && mediaCache) {
        // Try from the global/external cache if available
        mediaUrl = mediaCache.get(mediaId);
        
        if (!mediaUrl) {
          // Try without gid:// prefix in the cache
          const cleanId = mediaId.replace('gid://', '');
          mediaUrl = mediaCache.get(cleanId);
          
          if (!mediaUrl) {
            // Try just the numeric part in the cache
            const idParts = mediaId.split('/');
            if (idParts.length > 0) {
              const numericId = idParts[idParts.length - 1];
              mediaUrl = mediaCache.get(numericId);
            }
          }
        }
      }
      
      if (!mediaUrl) {
        // Try without gid:// prefix
        const cleanId = mediaId.replace('gid://', '');
        mediaUrl = mediaMap.get(cleanId);
        
        if (!mediaUrl) {
          // Try just the numeric part
          const idParts = mediaId.split('/');
          if (idParts.length > 0) {
            const numericId = idParts[idParts.length - 1];
            mediaUrl = mediaMap.get(numericId);
          }
        }
      }
      
      if (mediaUrl) {
        return {
          ...metafield,
          originalValue: mediaId, // Keep the original ID
          value: mediaUrl, // Replace with the actual URL
          processed: true
        };
      } else {
        console.warn(`Could not resolve media URL for ID: ${mediaId}`);
      }
    }
    
    // Return unmodified metafield if no processing was needed
    return metafield;
  });
}

/**
 * Transforms product and inventory data into a format optimized for LLM consumption
 * Now uses async/await to handle metafield processing
 */
export async function transformDataForLLM(products: any[], inventoryData: any[]): Promise<ShopifyProduct[]> {
  // Fetch all media upfront and build the cache
  await fetchAllMedia();
  
  const transformedProducts = [];
  
  for (const product of products) {
    // Process product metafields to resolve file references
    const productMetafields = product.metafields?.nodes || [];
    const processedProductMetafields = await processMetafieldsWithFetch(
      productMetafields, 
      product.images?.nodes || [],
      product.media?.nodes || [],
      globalMediaCache || undefined
    );
    
    // Transform variant data with empty inventory
    const productVariants = [];
    for (const variant of (product.variants?.nodes || [])) {
      // Process variant metafields to resolve file references
      const variantMetafields = variant.metafields?.nodes || [];
      const processedVariantMetafields = await processMetafieldsWithFetch(
        variantMetafields, 
        product.images?.nodes || [],
        product.media?.nodes || [],
        globalMediaCache || undefined
      );
      
      productVariants.push({
        ...variant,
        metafields: processedVariantMetafields,
        inventory: [] // Empty inventory array since we're skipping inventory data
      });
    }
    
    // Transform the product data
    transformedProducts.push({
      id: product.id,
      seo: product.seo,
      handle: product.handle,
      title: product.title,
      description: product.description,
      descriptionHtml: product.descriptionHtml,
      productType: product.productType,
      tags: product.tags,
      vendor: product.vendor,
      options: product.options,
      metafields: processedProductMetafields,
      variants: productVariants,
      images: product.images?.nodes || [],
      translations: [], // Empty array instead of fetching translations
      url: `https://${SHOPIFY_SHOP_URL}/products/${product.handle}`,
      status: product.status, // Add product status
      templateSuffix: product.templateSuffix, // Add templateSuffix
      publication_ids: product.publication_ids, // Add publication_ids
    });
  }
  
  return transformedProducts;
}

/**
 * Fetches all pages from Shopify using GraphQL pagination.
 */
export async function fetchAllPages(): Promise<Page[]> {
  console.log('Fetching all pages from Shopify...');
  const pages: Page[] = [];
  const query = `
    query GetAllPages($first: Int!, $after: String) {
      pages(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          handle
          body
          bodySummary
          createdAt
          updatedAt
          onlineStoreUrl
          seo {
            title
            description
          }
          templateSuffix
          // Add any other relevant fields
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let after: string | null = null;
    const batchSize = 50; // Adjust batch size as needed

    while (hasNextPage) {
      const variables = { first: batchSize, after };
      console.log(`Fetching pages batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(query, variables);

      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const { nodes, pageInfo } = response.data.pages;
      pages.push(...nodes);

      hasNextPage = pageInfo.hasNextPage;
      after = pageInfo.endCursor;

      if (hasNextPage) {
        await sleep(300); // Delay to avoid rate limits
      }
    }

    console.log(`Fetched ${pages.length} pages successfully.`);
    return pages;
  } catch (error) {
    console.error('Error fetching all pages:', error);
    throw error;
  }
}

/**
 * Transforms the raw page data into a format suitable for LLM consumption.
 * Currently, it returns the pages as is, assuming the fetched structure is sufficient.
 */
export async function transformPagesForLLM(pages: any[]): Promise<Page[]> {
  console.log(`Transforming ${pages.length} pages for LLM...`);
  // Perform any necessary transformations here
  // For now, we return the structure fetched from Shopify
  return pages as Page[];
}

/**
 * Fetches all collections from Shopify using GraphQL pagination.
 */
export async function fetchAllCollections(): Promise<any[]> { // Return type can be refined to ShopifyCollection[] later
  console.log('Fetching all collections from Shopify...');
  const collections: any[] = []; // Use any[] for now, refine later
  const query = `
    query GetAllCollections($first: Int!, $after: String) {
      collections(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          handle
          title
          updatedAt
          descriptionHtml
          # publishedOnCurrentPublication - removed by user
          sortOrder
          templateSuffix
          ruleSet {
            appliedDisjunctively
            rules {
              column
              relation
              condition
            }
          }
          image {
            url
            altText
          }
          # Products will be fetched separately for each collection
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let after: string | null = null;
    const batchSize = 50; // Adjust batch size as needed

    while (hasNextPage) {
      const variables = { first: batchSize, after };
      console.log(`Fetching collections batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(query, variables);

      if (response.errors) {
        // Handle potential throttling errors
        if (response.errors.some((e: any) => e.extensions?.code === 'THROTTLED')) {
          console.warn('GraphQL request throttled. Retrying after delay...');
          await sleep(5000); // Wait 5 seconds before retrying
          continue; // Retry the same batch
        }
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      if (!response.data || !response.data.collections) {
        throw new Error('Invalid response structure from Shopify API for collections.');
      }

      const { nodes, pageInfo } = response.data.collections;
      collections.push(...nodes);

      hasNextPage = pageInfo.hasNextPage;
      after = pageInfo.endCursor;

      if (hasNextPage) {
        await sleep(300); // Delay to avoid rate limits
      }
    }

    console.log(`Fetched ${collections.length} collections successfully.`);
    return collections;
  } catch (error) {
    console.error('Error fetching all collections:', error);
    throw error;
  }
}

/**
 * Transforms the raw collection data into a format suitable for LLM consumption.
 * Fetches all products for each collection separately.
 */
export async function transformCollectionsForLLM(collections: any[]): Promise<ShopifyCollection[]> {
  console.log(`Transforming ${collections.length} collections for LLM...`);
  
  const transformedCollections: ShopifyCollection[] = [];

  for (const collection of collections) {
    // Fetch all products for the current collection
    const products = await fetchProductsForCollection(collection.id);
    
    // Construct the final collection object
    const transformedCollection: ShopifyCollection = {
      ...collection,
      // Ensure the products structure matches the ShopifyCollection type
      products: {
        nodes: products, // Assign the fully fetched products list
        pageInfo: {
          // Since we fetched all, hasNextPage is always false
          hasNextPage: false 
        }
      }
    };
    
    transformedCollections.push(transformedCollection);
  }
  
  console.log(`Finished transforming ${transformedCollections.length} collections with all products.`);
  return transformedCollections;
}

/**
 * Fetch metaobjects of a specific type using GraphQL pagination
 * @param type The metaobject type to fetch
 */
export async function fetchMetaobjects(type: string): Promise<any[]> {
  const query = `
    query GetMetaobjects($type: String!, $first: Int!, $after: String) {
      metaobjects(type: $type, first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          handle
          type
          displayName
          updatedAt
          fields {
            key
            value
            type
            reference {
              ... on MediaImage {
                id
                image {
                  url
                }
              }
              ... on Product {
                id
                title
                handle
              }
              ... on Collection {
                id
                title
                handle
              }
              ... on Metaobject {
                id
                type
                handle
              }
            }
          }
        }
      }
    }
  `;

  try {
    console.log(`Fetching metaobjects of type '${type}' from Shopify...`);
    
    const batchSize = 50; 
    let hasNextPage = true;
    let after: string | null = null;
    let allMetaobjects: any[] = [];
    
    while (hasNextPage) {
      const variables = {
        type,
        first: batchSize,
        after,
      };

      console.log(`Fetching metaobjects batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(query, variables);
      
      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const { metaobjects } = response.data;
      allMetaobjects = [...allMetaobjects, ...metaobjects.nodes];
      
      console.log(`Fetched ${metaobjects.nodes.length} metaobjects, total now: ${allMetaobjects.length}`);

      hasNextPage = metaobjects.pageInfo.hasNextPage;
      after = metaobjects.pageInfo.endCursor;
      
      // Add a small delay between requests to avoid rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Completed fetching all metaobjects of type '${type}'. Total: ${allMetaobjects.length}`);
    return allMetaobjects;
  } catch (error) {
    console.error(`Error fetching metaobjects of type '${type}':`, error);
    throw error;
  }
}

/**
 * Transform metaobjects data for LLM consumption
 */
export async function transformMetaobjectsForLLM(metaobjects: any[]): Promise<any[]> {
  return metaobjects.map(metaobject => {
    // Transform fields into a more accessible format
    const fields = metaobject.fields.map((field: any) => {
      const processedField: ShopifyMetafield = {
        namespace: 'metaobject',
        key: field.key,
        value: field.value,
        type: field.type
      };
      
      // Process reference fields if present
      if (field.reference) {
        // Add reference information to the field
        processedField.value = JSON.stringify(field.reference);
      }
      
      return processedField;
    });
    
    return {
      id: metaobject.id,
      handle: metaobject.handle,
      type: metaobject.type,
      displayName: metaobject.displayName || metaobject.handle,
      fields,
      updatedAt: metaobject.updatedAt
    };
  });
}

/**
 * Fetch all files using GraphQL pagination
 */
export async function fetchAllFiles(): Promise<any[]> {
  const query = `
    query GetAllFiles($first: Int!, $after: String) {
      files(query: "references_count:>0", first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          createdAt
          updatedAt
          fileStatus
          alt
          fileErrors {
            code
            message
            details
          }
          preview {
            image {
              url
            }
          }
          ... on MediaImage {
            id
            image {
              url
            }
          }
          ... on GenericFile {
            id
            url
          }
          ... on Video {
            id
            originalSource {
              url
            }
          }
        }
      }
    }
  `;

  try {
    console.log('Fetching files from Shopify...');
    
    const batchSize = 50; 
    let hasNextPage = true;
    let after: string | null = null;
    let allFiles: any[] = [];
    
    while (hasNextPage) {
      const variables = {
        first: batchSize,
        after,
      };

      console.log(`Fetching files batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(query, variables);
      
      if (response.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
      }

      const { files } = response.data;
      allFiles = [...allFiles, ...files.nodes];
      
      console.log(`Fetched ${files.nodes.length} files, total now: ${allFiles.length}`);

      hasNextPage = files.pageInfo.hasNextPage;
      after = files.pageInfo.endCursor;
      
      // Add a small delay between requests to avoid rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Completed fetching all files. Total: ${allFiles.length}`);
    return allFiles;
  } catch (error) {
    console.error('Error fetching files:', error);
    throw error;
  }
}

/**
 * Transform files data for LLM consumption
 */
export async function transformFilesForLLM(files: any[]): Promise<ShopifyFile[]> {
  return files.map(file => {
    // Get the URL based on the file type
    let url = '';
    if (file.image?.url) {
      url = file.image.url;
    } else if (file.url) {
      url = file.url;
    } else if (file.originalSource?.url) {
      url = file.originalSource.url;
    } else if (file.preview?.image?.url) {
      url = file.preview.image.url;
    }
    
    if (!url) {
      console.warn(`No URL found for file with ID: ${file.id}`);
      url = '';
    }
    
    // Create filename from URL if needed
    const filename = url ? url.split('/').pop()?.split('?')[0] || 'unnamed-file' : 'unnamed-file';
    
    return {
      id: file.id,
      filename: filename,
      url: url,
      mediaType: determineMediaType(file, url),
      originalUploadSize: 0, // We don't have this information anymore
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      alt: file.alt || undefined,
      status: file.fileStatus || undefined,
      mimeType: determineMimeType(file, url)
    };
  });
}

/**
 * Helper function to determine media type from file data
 */
function determineMediaType(file: any, url: string): string {
  if (file.image) {
    return 'IMAGE';
  } else if (file.originalSource) {
    return 'VIDEO';
  } else if (url.match(/\.(mp4|mov|avi|wmv|flv|webm)$/i)) {
    return 'VIDEO';
  } else if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    return 'IMAGE';
  } else if (url.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/i)) {
    return 'DOCUMENT';
  }
  return 'OTHER';
}

/**
 * Helper function to determine MIME type from URL
 */
function determineMimeType(file: any, url: string): string {
  const extension = url.split('.').pop()?.split('?')[0]?.toLowerCase();
  
  if (!extension) {
    return 'application/octet-stream';
  }
  
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'webm': 'video/webm'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Fetches all products for a specific collection using pagination.
 * @param collectionId The ID of the collection.
 */
async function fetchProductsForCollection(collectionId: string): Promise<any[]> {
  console.log(`Fetching all products for collection ${collectionId}...`);
  const products: any[] = [];
  const query = `
    query GetCollectionProducts($id: ID!, $first: Int!, $after: String) {
      collection(id: $id) {
        id
        products(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            handle
            # Add other product fields if needed later
          }
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let after: string | null = null;
    const batchSize = 50; // Adjust batch size as needed

    while (hasNextPage) {
      const variables = { id: collectionId, first: batchSize, after };
      console.log(`Fetching products for collection ${collectionId}, batch after cursor: ${after || 'Start'}`);
      const response = await executeGraphQL(query, variables);

      if (response.errors) {
        // Handle potential throttling errors
        if (response.errors.some((e: any) => e.extensions?.code === 'THROTTLED')) {
          console.warn(`GraphQL request throttled for collection ${collectionId}. Retrying after delay...`);
          await sleep(5000);
          continue; // Retry
        }
        throw new Error(`GraphQL Error fetching products for collection ${collectionId}: ${JSON.stringify(response.errors)}`);
      }

      const collectionData = response.data?.collection;
      if (!collectionData || !collectionData.products) {
          // Collection might be empty or deleted, or API structure changed
          console.warn(`No product data found for collection ${collectionId} in response. Moving to next page/collection.`);
          // If the collection itself wasn't found, stop pagination for it.
          if (!collectionData) hasNextPage = false;
          else {
             // If collection exists but no products field, assume end of products
             hasNextPage = collectionData.products?.pageInfo?.hasNextPage ?? false;
             after = collectionData.products?.pageInfo?.endCursor ?? null; 
          }
      } else {
          const { nodes, pageInfo } = collectionData.products;
          products.push(...nodes);
          hasNextPage = pageInfo.hasNextPage;
          after = pageInfo.endCursor;
      }

      if (hasNextPage) {
        await sleep(300); // Delay to avoid rate limits
      }
    }

    console.log(`Fetched ${products.length} products for collection ${collectionId}.`);
    return products;
  } catch (error) {
    console.error(`Error fetching products for collection ${collectionId}:`, error);
    // Return empty array or re-throw depending on desired error handling
    return []; 
  }
}