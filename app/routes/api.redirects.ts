import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
// Import fetchAllRedirects and transformRedirectsForLLM from shopify.service
import { 
  fetchAllRedirects, 
  transformRedirectsForLLM 
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
// Import RedirectsResponse and ErrorResponse from shopify.types
import type { RedirectsResponse, ErrorResponse } from '~/types/shopify.types';
import { encoding_for_model } from 'tiktoken';

// Cache key for redirects data
const REDIRECTS_CACHE_KEY = 'shopify_redirects_data';
// Default cache time: 1 hour (in seconds) - align with pages API or adjust as needed
const DEFAULT_CACHE_TTL = 60 * 60 * 6; 

/**
 * Estimate number of tokens using tiktoken
 * Reusing the function structure from api.pages.ts
 */
async function estimateTokens(obj: any): Promise<number> {
  try {
    const encoder = await encoding_for_model('gpt-4'); // Or appropriate model
    const jsonString = JSON.stringify(obj);
    const tokens = encoder.encode(jsonString);
    encoder.free();
    return tokens.length;
  } catch (error) {
    console.error('Token estimation error:', error);
    return Math.ceil(JSON.stringify(obj).length / 4); // Fallback
  }
}

/**
 * API endpoint to fetch all URL redirects data optimized for LLM consumption
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('apiKey');
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    
    // Optional API Key Check
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return json({ 
        success: false, 
        error: 'Unauthorized' 
      } as ErrorResponse, { status: 401 });
    }

    // Cache Check
    if (!forceRefresh) {
      const cachedData = cache.get<RedirectsResponse>(REDIRECTS_CACHE_KEY);
      if (cachedData) {
        // Optionally update timestamp before returning
        // cachedData.timestamp = new Date().toISOString(); 
        cachedData.fromCache = true; // Set fromCache flag
        return json(cachedData);
      }
    }

    // Fetch all redirects
    console.log('Fetching redirect data from Shopify...');
    const redirects = await fetchAllRedirects();

    // Transform data for LLM
    console.log('Transforming redirect data for LLM consumption...');
    const transformedData = await transformRedirectsForLLM(redirects);

    // Prepare response data
    const responseData: RedirectsResponse = {
      success: true,
      redirects: transformedData,
      totalRedirects: transformedData.length,
      timestamp: new Date().toISOString(),
      fromCache: false,
      estimatedTokens: await estimateTokens(transformedData)
    };
    
    // Cache the response data
    cache.set(REDIRECTS_CACHE_KEY, responseData, DEFAULT_CACHE_TTL);
    
    console.log(`Successfully processed ${transformedData.length} redirects`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
    return json(responseData);

  } catch (error) {
    console.error('Error fetching redirects:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
}
