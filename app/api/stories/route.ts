import { storiesRequest } from '@/app/api-routes/stories/routes';
export const runtime = 'nodejs';
export const GET = (request: Request) => storiesRequest(request);
export const POST = (request: Request) => storiesRequest(request);
