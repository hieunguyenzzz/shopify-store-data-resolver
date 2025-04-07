import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllCollections, 
  transformCollectionsForLLM 
} from '~/services/shopify.service'; // Placeholder functions
import { cache } from '~/utils/cache';
import type { CollectionsResponse, ErrorResponse } from '~/types/shopify.types'; // Placeholder types
import { encoding_for_model } from 'tiktoken';

// Cache key for collections data
const COLLECTIONS_CACHE_KEY = 'shopify_collections_data';
// Default cache time: 1 hour (in seconds)
const DEFAULT_CACHE_TTL = 60 * 60 * 24 * 30 * 12; 

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
 * API endpoint to fetch all collections data optimized for LLM consumption
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
      const cachedData = cache.get<CollectionsResponse>(COLLECTIONS_CACHE_KEY);
      if (cachedData) {
        return json(cachedData);
      }
    }

    // Fetch all collections
    console.log('Fetching collection data from Shopify...');
    // Note: fetchAllCollections needs to be implemented
    const collections = await fetchAllCollections(); 

    // Transform data for LLM consumption with async processing
    console.log('Transforming collection data for LLM consumption...');
    // Note: transformCollectionsForLLM needs to be implemented
    const transformedData = await transformCollectionsForLLM(collections); 
    
    // Prepare response data
    const responseData: CollectionsResponse = {
      success: true,
      collections: transformedData, // Changed from 'pages'
      totalCollections: transformedData.length, // Changed from 'totalPages'
      timestamp: new Date().toISOString(),
      fromCache: false,
      // Calculate estimated tokens for the entire response
      estimatedTokens: await estimateTokens(transformedData)
    };
    
    // Cache the response data
    cache.set(COLLECTIONS_CACHE_KEY, responseData, DEFAULT_CACHE_TTL);
    
    console.log(`Successfully processed ${transformedData.length} collections`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
    // Return the data
    return json(responseData);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 