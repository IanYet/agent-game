import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import type { ToolDefinition, ToolResponse } from './index';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

function freeze(value:unknown):void {
  if(value && typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}
}

function checkSchema(value: unknown, depth = 0, count = { nodes: 0 }): void {
  if (++count.nodes > 5000 || depth > 40) throw new Error('工具 schema 过于复杂');
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (['$ref', '$dynamicRef'].includes(key) && typeof entry === 'string' && !entry.startsWith('#')) throw new Error('工具 schema 不能引用外部资源');
    if (key === 'pattern' && typeof entry === 'string' && entry.length > 512) throw new Error('工具 schema 正则过长');
    checkSchema(entry, depth + 1, count);
  }
}
export class ToolRegistry {
  readonly definitions: ToolDefinition[];
  private validators = new Map<string, { input: ValidateFunction; output?: ValidateFunction }>();
  constructor(definitions: ToolDefinition[]) {
    if (!definitions.length || definitions.length > 128 || JSON.stringify(definitions).length > 500_000) throw new Error('工具注册表为空或超过平台资源限额');
    this.definitions = structuredClone(definitions);
    for (const tool of this.definitions) {
      if (typeof tool.name!=='string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name) || this.validators.has(tool.name)) throw new Error('工具名称非法或重复');
      if (typeof tool.description!=='string' || !tool.description || tool.description.length > 20_000) throw new Error('工具说明为空或过长');
      if ((tool.requiresDecision!==undefined&&typeof tool.requiresDecision!=='boolean') || (tool.title!==undefined&&(typeof tool.title!=='string'||tool.title.length>300))) throw new Error('工具权限或标题字段无效');
      if(tool.annotations && (typeof tool.annotations!=='object'||Object.values(tool.annotations).some(v=>typeof v!=='boolean')))throw new Error('工具 annotations 字段无效');
      for (const schema of [tool.inputSchema, tool.outputSchema].filter(Boolean)) {
        if (schema?.type !== 'object') throw new Error('工具 schema 顶层必须是 object'); checkSchema(schema);
      }
      const compile = (schema: any) => {
        const Class = String(schema.$schema ?? '').includes('draft-07') ? Ajv : Ajv2020;
        return new Class({ strict: false, validateFormats: false, allErrors: false, allowUnionTypes: true }).compile(schema);
      };
      this.validators.set(tool.name, { input: compile(tool.inputSchema), ...(tool.outputSchema ? { output: compile(tool.outputSchema) } : {}) });
    }
    freeze(this.definitions);
  }
  definition(name: string): ToolDefinition {
    const tool = this.definitions.find(t => t.name === name); if (!tool) throw new Error('此玩家会话没有注册该工具'); return tool;
  }
  validateInput(name: string, args: Record<string, unknown>): void {
    this.definition(name); if (!this.validators.get(name)!.input(args)) throw new Error('工具参数不符合本会话声明的 JSON Schema');
  }
  validateOutput(name: string, result: ToolResponse): void {
    this.definition(name); CallToolResultSchema.parse(result);
    const validate = this.validators.get(name)?.output;
    if (!result.isError && validate && !validate(result.structuredContent)) throw new Error('工具结果不符合本会话声明的 outputSchema');
  }
}
