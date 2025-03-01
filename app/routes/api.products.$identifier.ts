import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { cache } from '~/utils/cache';
import type { 
  ProductResponse, 
  ProductsResponse, 
  ErrorResponse 
} from '~/types/shopify.types';

// Cache key for products data
const PRODUCTS_CACHE_KEY = 'shopify_products_data';

/**
 * API endpoint to get a specific product by ID or handle
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const identifier = params.identifier;
    
    if (!identifier) {
      return json({ 
        success: false, 
        error: 'Product identifier is required' 
      } as ErrorResponse, { status: 400 });
    }
    
    // Check for API key (optional security measure)
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('apiKey');
    
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return json({ 
        success: false, 
        error: 'Unauthorized' 
      } as ErrorResponse, { status: 401 });
    }
    
    // Get products from cache
    const cachedData = cache.get<ProductsResponse>(PRODUCTS_CACHE_KEY);
    
    if (!cachedData) {
      return json({ 
        success: false, 
        error: 'Products data not available in cache. Please fetch products first.' 
      } as ErrorResponse, { status: 404 });
    }
    
    // Find product by ID or handle
    const product = cachedData.products.find((p) => 
      p.id === identifier || 
      p.id === `gid://shopify/Product/${identifier}` || 
      p.handle === identifier
    );
    
    if (!product) {
      return json({ 
        success: false, 
        error: `Product with identifier "${identifier}" not found` 
      } as ErrorResponse, { status: 404 });
    }
    
    // Return the product
    const responseData: ProductResponse = {
      success: true,
      product,
      timestamp: new Date().toISOString(),
    };
    
    return json(responseData);
  } catch (error) {
    console.error('Error fetching product:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 