import { Module } from '@nestjs/common';
import { ConfigurableModuleClass } from './module.builder';
import { RedisService } from './redis.service';
import { RedisInterceptor } from './redis.interceptor';

@Module({
  providers:[RedisService,RedisInterceptor],
  exports:[RedisService],
})
export class RedisModule extends ConfigurableModuleClass {
  
}
