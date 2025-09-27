import { Module } from '@nestjs/common';
import { ConfigurableModuleClass } from './module.builder';
import { RedisService } from './redis.service';
import { CacheInterceptor } from './redis.interceptor';

@Module({
  providers:[RedisService,CacheInterceptor],
  exports:[RedisService],
})
export class RedisModule extends ConfigurableModuleClass {
  
}
