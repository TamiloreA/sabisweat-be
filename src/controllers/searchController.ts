/**
 * Search Controller
 *
 * Handles HTTP requests for the unified search endpoint: GET /api/v1/search
 */

import { Request, Response } from 'express';
import { search as performSearch } from '../services/searchService';
import type { SearchResourceType } from '../models/searchModel';

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const rawQ = req.query.q;

    // 1. Validate query parameter 'q'
    if (rawQ === undefined || rawQ === null || typeof rawQ !== 'string' || rawQ.trim().length === 0) {
      res.status(400).json({
        error: 'QUERY_REQUIRED',
        message: 'Search query is required.',
      });
      return;
    }

    const q = rawQ.trim();
    if (q.length > 100) {
      res.status(400).json({
        error: 'QUERY_TOO_LONG',
        message: 'Query must be 100 characters or fewer.',
      });
      return;
    }

    // 2. Validate and parse 'types' parameter
    const rawTypes = req.query.types;
    const defaultTypes: SearchResourceType[] = ['challenges', 'clubs', 'help'];
    let types: SearchResourceType[] = defaultTypes;

    if (rawTypes !== undefined && rawTypes !== null) {
      if (typeof rawTypes !== 'string' || rawTypes.trim().length === 0) {
        types = defaultTypes;
      } else {
        const splitTypes = rawTypes
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        if (splitTypes.length === 0) {
          types = defaultTypes;
        } else {
          const allowedTypes: SearchResourceType[] = ['challenges', 'clubs', 'help'];
          const isValid = splitTypes.every((t) => (allowedTypes as string[]).includes(t));

          if (!isValid) {
            res.status(400).json({
              error: 'INVALID_TYPE',
              message: 'Allowed types: challenges, clubs, help.',
            });
            return;
          }

          types = [...new Set(splitTypes)] as SearchResourceType[];
        }
      }
    }

    // 3. Parse 'limit' and 'offset' parameters
    let limit = 15;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (!Number.isNaN(parsedLimit)) {
        limit = Math.min(50, Math.max(1, parsedLimit));
      }
    }

    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (!Number.isNaN(parsedOffset)) {
        offset = Math.max(0, parsedOffset);
      }
    }

    // 4. Parse optional location parameters
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : undefined;
    const region = typeof req.query.region === 'string' ? req.query.region.trim() : undefined;

    // 5. Execute search
    const searchResponse = await performSearch({
      q,
      types,
      limit,
      offset,
      country,
      region,
    });

    res.status(200).json(searchResponse);
  } catch (err: any) {
    console.error('Search error:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Something went wrong.',
    });
  }
}
