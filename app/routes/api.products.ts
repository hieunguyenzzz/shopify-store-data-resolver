import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllProducts, 
  fetchInventoryLevels, 
  transformDataForLLM,
  fetchAllMedia
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
import type { ProductsResponse, ErrorResponse } from '~/types/shopify.types';
import { encoding_for_model } from 'tiktoken';

// Cache key for products data
const PRODUCTS_CACHE_KEY = 'shopify_products_data';
// Default cache time: 1 hour (in seconds)
const DEFAULT_CACHE_TTL = 60 * 60;

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
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return json({ 
        success: false, 
        error: 'Unauthorized' 
      } as ErrorResponse, { status: 401 });
    }

    // Check if we have cached data and refresh is not forced
    if (!forceRefresh) {
      const cachedData = cache.get<ProductsResponse>(PRODUCTS_CACHE_KEY);
      if (cachedData) {
        return json(cachedData);
      }
    }

    // Prefetch and cache all media first to improve performance
    console.log('Prefetching all media to build global cache...');
    await fetchAllMedia();

    // Fetch all products and inventory data
    console.log('Fetching product data from Shopify...');
    const [products, inventoryData] = await Promise.all([
      fetchAllProducts(),
      fetchInventoryLevels()
    ]);

    // Transform data for LLM consumption with async processing
    console.log('Transforming product data for LLM consumption...');
    const transformedData = await transformDataForLLM(products, inventoryData);
    
    // Prepare response data
    const responseData: ProductsResponse = {
      success: true,
      products: transformedData,
      totalProducts: transformedData.length,
      timestamp: new Date().toISOString(),
      fromCache: false,
      // Calculate estimated tokens for the entire response
      estimatedTokens: await estimateTokens(transformedData)
    };
    
    // Cache the response data
    cache.set(PRODUCTS_CACHE_KEY, responseData, DEFAULT_CACHE_TTL);
    
    console.log(`Successfully processed ${transformedData.length} products`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
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