import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchMetaobjects, 
  transformMetaobjectsForLLM 
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
import type { MetaobjectsResponse, ErrorResponse } from '~/types/shopify.types';
import { encoding_for_model } from 'tiktoken';

// Cache key for metaobjects data with type prefix
function getCacheKey(type: string): string {
  return `shopify_metaobjects_${type}`;
}

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
 * API endpoint to fetch metaobjects data optimized for LLM consumption
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('apiKey');
    const type = url.searchParams.get('type');
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    
    // Validate API key if required
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return json({ 
        success: false, 
        error: 'Unauthorized' 
      } as ErrorResponse, { status: 401 });
    }
    
    // Validate required parameters
    if (!type) {
      return json({ 
        success: false, 
        error: 'Missing required parameter: type' 
      } as ErrorResponse, { status: 400 });
    }

    // Create cache key specific to this metaobject type
    const cacheKey = getCacheKey(type);

    // Check if we have cached data and refresh is not forced
    if (!forceRefresh) {
      const cachedData = cache.get<MetaobjectsResponse>(cacheKey);
      if (cachedData) {
        return json(cachedData);
      }
    }

    // Fetch metaobjects
    console.log(`Fetching metaobject data of type '${type}' from Shopify...`);
    const metaobjects = await fetchMetaobjects(type);

    // Transform data for LLM consumption
    console.log('Transforming metaobject data for LLM consumption...');
    const transformedData = await transformMetaobjectsForLLM(metaobjects);
    
    // Prepare response data
    const responseData: MetaobjectsResponse = {
      success: true,
      metaobjects: transformedData,
      totalMetaobjects: transformedData.length,
      timestamp: new Date().toISOString(),
      fromCache: false,
      // Calculate estimated tokens for the entire response
      estimatedTokens: await estimateTokens(transformedData)
    };
    
    // Cache the response data
    cache.set(cacheKey, responseData, DEFAULT_CACHE_TTL);
    
    console.log(`Successfully processed ${transformedData.length} metaobjects of type '${type}'`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
    // Return the data
    return json(responseData);
  } catch (error) {
    console.error('Error fetching metaobjects:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 