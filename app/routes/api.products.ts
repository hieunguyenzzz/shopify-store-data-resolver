import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllProducts, 
  transformDataForLLM,
  fetchAllMedia
} from '~/services/shopify.service';
import type { ProductsResponse, ErrorResponse } from '~/types/shopify.types';
import { encoding_for_model } from 'tiktoken';
import { productCache } from '~/utils/redis-cache';

/**
 * Estimate number of tokens using tiktoken
 * More accurate token counting for LLM models
 */
async function estimateTokens(obj: any): Promise<number> {
  try {
    // Use cl100k_base encoding (works for GPT-3.5 and GPT-4)
    const encoder = await encoding_for_model('gpt-4');
    
    // Convert object to JSON string
    const jsonString = JSON.stringify(obj);
    
    // Encode and count tokens
    const tokens = encoder.encode(jsonString);
    
    // Free the encoder to prevent memory leaks
    encoder.free();
    
    return tokens.length;
  } catch (error) {
    console.error('Token estimation error:', error);
    // Fallback to basic estimation if tiktoken fails
    return Math.ceil(JSON.stringify(obj).length / 4);
  }
}

/**
 * API endpoint to fetch all product data optimized for LLM consumption
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Check for API key (optional security measure)
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('apiKey');
    const useCache = url.searchParams.get('cache') === 'true';
    const cacheKey = 'shopify_products_all';
    
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return json({ 
        success: false, 
        error: 'Unauthorized' 
      } as ErrorResponse, { status: 401 });
    }

    // Check Redis cache first if cache parameter is true
    if (useCache) {
      console.log('Checking Redis cache for product data...');
      try {
        const cachedData = await productCache.get<ProductsResponse>(cacheKey);
        if (cachedData) {
          console.log('Returning cached product data from Redis');
          return json({
            ...cachedData,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        console.log('No cached data found in Redis, fetching from Shopify...');
      } catch (cacheError) {
        console.warn('Redis cache error, falling back to Shopify API:', cacheError);
      }
    }

    // Prefetch and cache all media first to improve performance
    console.log('Prefetching all media to build global cache...');
    await fetchAllMedia();

    // Fetch all products
    console.log('Fetching product data from Shopify...');
    const products = await fetchAllProducts();

    // Transform data for LLM consumption with async processing
    console.log('Transforming product data for LLM consumption...');
    const transformedData = await transformDataForLLM(products);
    
    // Prepare response data
    const responseData: ProductsResponse = {
      success: true,
      products: transformedData,
      totalProducts: transformedData.length,
      timestamp: new Date().toISOString(),
      // Calculate estimated tokens for the entire response
      estimatedTokens: await estimateTokens(transformedData),
      fromCache: false
    };
    
    console.log(`Successfully processed ${transformedData.length} products`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
    // Cache the result in Redis for future requests
    if (useCache) {
      try {
        console.log('Caching product data in Redis...');
        await productCache.set(cacheKey, responseData, 31536000); // Cache for 1 year
        console.log('Product data cached successfully in Redis');
      } catch (cacheError) {
        console.warn('Failed to cache product data in Redis:', cacheError);
      }
    }
    
    // Return the data
    return json(responseData);
  } catch (error) {
    console.error('Error fetching products:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 