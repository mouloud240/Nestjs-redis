import { SetMetadata } from "@nestjs/common";

export const NO_CACHE_KEY='__no_cache__';
export const NoCache=()=>SetMetadata(NO_CACHE_KEY,true);

