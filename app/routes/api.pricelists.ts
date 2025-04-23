import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllPriceLists, 
  transformPriceListsForLLM 
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
import type { PriceListsResponse, ErrorResponse } from '~/types/shopify.types';

// Cache key for pricelists data
const PRICELISTS_CACHE_KEY = 'shopify_pricelists_data';
// Default cache time: 6 hours (in seconds)
const DEFAULT_CACHE_TTL = 60 * 60 * 6;

/**
 * API endpoint to fetch all price lists data
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
      const cachedData = cache.get<PriceListsResponse>(PRICELISTS_CACHE_KEY);
      if (cachedData) {
        cachedData.fromCache = true; // Set fromCache flag
        return json(cachedData);
      }
    }

    // Fetch all price lists
    console.log('Fetching price lists data from Shopify...');
    const priceLists = await fetchAllPriceLists();

    // Transform data for LLM consumption
    console.log('Transforming price lists data...');
    const transformedData = await transformPriceListsForLLM(priceLists);
    
    // Prepare response data
    const responseData: PriceListsResponse = {
      success: true,
      priceLists: transformedData,
      totalPriceLists: transformedData.length,
      timestamp: new Date().toISOString(),
      fromCache: false
    };
    
    // Cache the response data
    cache.set(PRICELISTS_CACHE_KEY, responseData, DEFAULT_CACHE_TTL);
    
    console.log(`Successfully processed ${transformedData.length} price lists`);
    
    // Return the data
    return json(responseData);
  } catch (error) {
    console.error('Error fetching price lists:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
}
