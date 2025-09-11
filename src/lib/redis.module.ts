import { Module } from '@nestjs/common';
import { ConfigurableModuleClass } from './module.builder';
import { RedisService } from './redis.service';

@Module({
  providers:[RedisService],
  exports:[RedisService]
})
export class RedisModule extends ConfigurableModuleClass {
  
}
