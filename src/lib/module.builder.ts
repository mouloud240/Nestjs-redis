import { ConfigurableModuleBuilder } from "@nestjs/common";
import { RedisOptions } from "ioredis";

export const {ConfigurableModuleClass,MODULE_OPTIONS_TOKEN}=new ConfigurableModuleBuilder<RedisOptions>().setExtras(
  {
    isGlobal:true
  },
  (definition,extras)=>({
    ...definition,
    global:extras.isGlobal
  })
).build()
