import dotenv from 'dotenv';
import type { 
  ShopifyProduct, 
  ShopifyVariant,
  ShopifyMetafield
} from '~/types/shopify.types';

// Load environment variables
dotenv.config();

const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

// Global media cache to store all media items
let globalMediaCache: Map<string, string> | null = null;

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
          variants(first: 100) {
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
        variants(first: 100) {
          nodes {
            id
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
    });
  }
  
  return transformedProducts;
} 