import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllProducts, 
  fetchInventoryLevels, 
  transformDataForLLM 
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
import type { ProductsResponse, ErrorResponse } from '~/types/shopify.types';

// Cache key for products data
const PRODUCTS_CACHE_KEY = 'shopify_products_data';
// Default cache time: 1 hour (in seconds)
const DEFAULT_CACHE_TTL = 60 * 60;

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

    // Fetch all products and inventory data
    const [products, inventoryData] = await Promise.all([
      fetchAllProducts(),
      fetchInventoryLevels()
    ]);

    // Transform data for LLM consumption
    const transformedData = transformDataForLLM(products, inventoryData);
    
    // Prepare response data
    const responseData: ProductsResponse = {
      success: true,
      products: transformedData,
      totalProducts: transformedData.length,
      timestamp: new Date().toISOString(),
      fromCache: false,
    };
    
    // Cache the response data
    cache.set(PRODUCTS_CACHE_KEY, responseData, DEFAULT_CACHE_TTL);
    
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