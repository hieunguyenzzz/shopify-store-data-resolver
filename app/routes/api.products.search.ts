import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { cache } from '~/utils/cache';
import type { 
  ShopifyProduct, 
  SearchResponse, 
  ProductsResponse, 
  ErrorResponse 
} from '~/types/shopify.types';

// Cache key prefix for products data
const PRODUCTS_CACHE_KEY = 'shopify_products_data';

/**
 * Simple search function to find products matching query
 */
function searchProducts(products: ShopifyProduct[], query: string): ShopifyProduct[] {
  const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
  
  if (searchTerms.length === 0) {
    return products;
  }
  
  return products.filter(product => {
    // Check various product fields for matches
    const searchableText = [
      product.title,
      product.description,
      product.productType,
      product.vendor,
      ...product.tags || [],
      ...product.variants.map((variant) => variant.title),
      ...product.metafields.map((field) => field.value),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    
    // Match if all search terms are found
    return searchTerms.every(term => searchableText.includes(term));
  });
}

/**
 * API endpoint to search product data
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Check for API key (optional security measure)
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('apiKey');
    const query = url.searchParams.get('q') || '';
    
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
    
    // Search products
    const searchResults = searchProducts(cachedData.products, query);
    
    // Return search results
    const responseData: SearchResponse = {
      success: true,
      query,
      products: searchResults,
      totalResults: searchResults.length,
      timestamp: new Date().toISOString(),
    };
    
    return json(responseData);
  } catch (error) {
    console.error('Error searching products:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 