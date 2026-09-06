import { NextRequest } from 'next/server';
import { GET as getState } from './state/route';

export async function GET(request: NextRequest) {
  return getState(request);
}
