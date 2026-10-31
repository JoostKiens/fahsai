import { defineMiddleware } from 'astro:middleware';
import { languageMiddleware } from '@/lib/languageMiddleware';

export const onRequest = defineMiddleware(languageMiddleware);
