import { z } from 'zod'
import { codingInput } from './localCoding'

/** Generated input schema keeps the REST contract aligned with the MCP tools. */
export function integrationOpenApi(version: string, url: string): object {
  const response = (description: string) => ({ description, content: { 'application/json': { schema: { type: 'object' } } } })
  const problem = { description: 'Request failed', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } }
  return {
    openapi: '3.1.0',
    info: { title: 'Crest Local Coding API', version, description: 'Authenticated laptop-only API. Task handles are durable application state. HTTP and MCP requests have no protocol sessions. Local Ollama inference only; no cloud fallback or shell execution.' },
    servers: [{ url }], security: [{ localBearer: [] }],
    paths: {
      '/v1/status': { get: { operationId: 'getStatus', responses: { '200': response('App version and current tasks'), '401': problem } } },
      '/v1/models': { get: { operationId: 'listModels', responses: { '200': response('Ollama availability and installed models'), '401': problem } } },
      '/v1/tasks': {
        get: { operationId: 'listTasks', responses: { '200': { description: 'Up to 100 most recent tasks', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } } } } },
        post: {
          operationId: 'startTask', description: 'Starts one bounded local job. Poll the Location URL. Reuse Idempotency-Key with identical parameters for safe retries. Keys are retained for the latest 100 tasks. Review mode is read-only; edit mode writes only named files with backups. Caller reviews and tests changes.',
          parameters: [{ in: 'header', name: 'Idempotency-Key', required: false, schema: { type: 'string', minLength: 1, maxLength: 128 } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } } },
          responses: { '202': { ...response('Task accepted; includes id and status'), headers: { Location: { schema: { type: 'string' }, description: 'Task status URL' } } }, '400': problem, '401': problem, '409': problem, '413': problem, '415': problem, '422': problem, '503': problem }
        }
      },
      '/v1/tasks/{id}': {
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        get: { operationId: 'getTask', responses: { '200': response('Task status, summary, changedFiles, backupPath, and error'), '404': problem } },
        delete: { operationId: 'cancelTask', description: 'Idempotently cancel a running task. Does not delete already applied edits or their backups.', responses: { '200': response('Current task status'), '404': problem } }
      },
      '/mcp': { post: { operationId: 'mcp', description: 'MCP 2026-07-28 stateless Streamable HTTP. Official SDK handles server/discover, protocol headers and request _meta. Stateless 2025 clients are also accepted. No Mcp-Session-Id, GET stream, or sticky connection required.', responses: { '200': response('JSON-RPC response'), '202': { description: 'Legacy notification accepted' }, '400': problem, '401': problem, '405': problem } } }
    },
    components: {
      securitySchemes: { localBearer: { type: 'http', scheme: 'bearer', description: 'Preprovisioned personal token from ~/.crest/api-token (0600). This loopback service is not an OAuth authorization server.' } },
      schemas: {
        TaskInput: z.toJSONSchema(codingInput),
        Task: { type: 'object', required: ['id', 'status', 'model', 'projectPath', 'mode', 'createdAt', 'changedFiles'], properties: {
          id: { type: 'string', format: 'uuid' }, status: { enum: ['running', 'completed', 'failed', 'cancelled'] },
          model: { type: 'string' }, projectPath: { type: 'string' }, mode: { enum: ['review', 'edit'] }, createdAt: { type: 'string', format: 'date-time' },
          changedFiles: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, error: { type: 'string' }, backupPath: { type: 'string' }, requestKey: { type: 'string' }
        } },
        Problem: { type: 'object', required: ['type', 'title', 'status', 'detail', 'code', 'requestId'], properties: {
          type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, code: { type: 'string' }, requestId: { type: 'string', format: 'uuid' }
        } }
      }
    }
  }
}
