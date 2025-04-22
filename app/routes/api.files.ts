import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { 
  fetchAllFiles, 
  transformFilesForLLM 
} from '~/services/shopify.service';
import { cache } from '~/utils/cache';
import type { FilesResponse, ErrorResponse } from '~/types/shopify.types';
import { encoding_for_model } from 'tiktoken';

// Cache key for files data
const FILES_CACHE_KEY = 'shopify_files_data';
// Default cache time: 30 days (in seconds)
const DEFAULT_CACHE_TTL = 60 * 60 * 24 * 30;

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
 * API endpoint to fetch all files data optimized for LLM consumption
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Check for API key (optional security measure)
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('apiKey');
    
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return json({ 
        success: false, 
        error: 'Unauthorized' 
      } as ErrorResponse, { status: 401 });
    }

    // Fetch all files
    console.log('Fetching file data from Shopify...');
    const files = await fetchAllFiles();

    // Transform data for LLM consumption
    console.log('Transforming file data for LLM consumption...');
    const transformedData = await transformFilesForLLM(files);
    
    // Prepare response data
    const responseData: FilesResponse = {
      success: true,
      files: transformedData,
      totalFiles: transformedData.length,
      timestamp: new Date().toISOString(),
      // Calculate estimated tokens for the entire response
      estimatedTokens: await estimateTokens(transformedData)
    };
    
    console.log(`Successfully processed ${transformedData.length} files`);
    console.log(`Estimated tokens: ${responseData.estimatedTokens}`);
    
    // Return the data
    return json(responseData);
  } catch (error) {
    console.error('Error fetching files:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ErrorResponse, 
      { status: 500 }
    );
  }
} 