import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllPages, 
  transformPagesForLLM 
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
import type { PagesResponse, ErrorResponse } from '~/types/shopify.types';
import { encoding_for_model } from 'tiktoken';

// Cache key for pages data
const PAGES_CACHE_KEY = 'shopify_pages_data';
// Default cache time: 1 hour (in seconds)
const DEFAULT_CACHE_TTL = 60 * 60  * 6;

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
 * API endpoint to fetch all pages data optimized for LLM consumption
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
      const cachedData = cache.get<PagesResponse>(PAGES_CACHE_KEY);
      if (cachedData) {
        return json(cachedData);
      }
    }

    // Fetch all pages
    console.log('Fetching page data from Shopify...');
    const pages = await fetchAllPages();

    // Transform data for LLM consumption with async processing
    console.log('Transforming page data for LLM consumption...');
    const transformedData = await transformPagesForLLM(pages);
    
    // Prepare response data
    const responseData: PagesResponse = {
      success: true,
      pages: transformedData,
      totalPages: transformedData.length,
      timestamp: new Date().toISOString(),
      fromCache: false,
      // Calculate estimated tokens for the entire response
      estimatedTokens: await estimateTokens(transformedData)
    };
    
    // Cache the response data
    cache.set(PAGES_CACHE_KEY, responseData, DEFAULT_CACHE_TTL);
    
    console.log(`Successfully processed ${transformedData.length} pages`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
    // Return the data
    return json(responseData);
  } catch (error) {
    console.error('Error fetching pages:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 